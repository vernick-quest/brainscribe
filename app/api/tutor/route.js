import Anthropic from '@anthropic-ai/sdk'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCoachSystemBlocks } from '@/lib/prompts'
import { logAnthropicUsage } from '@/lib/usage'

const anthropic = new Anthropic()

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, messages, assignment, persona = 'marcus', scaffold = null } = await request.json()

  if (!sessionId || !messages || !assignment) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Claude API only allows 'user' and 'assistant' roles, and the first message must be 'user'.
  // The local greeting is never saved to the DB, so the history sent from the client can start
  // with an assistant message — strip any leading assistant messages and unknown fields.
  const filtered = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(({ role, content }) => ({ role, content }))
  const firstUser = filtered.findIndex(m => m.role === 'user')
  const cleanedMessages = firstUser > 0 ? filtered.slice(firstUser) : filtered

  // Split the system prompt: the large static prefix (persona + rules + guardrails,
  // ~5.7k tokens, identical every turn) is marked for Anthropic prompt caching so it
  // bills at ~10% on cache hits. Only the small assignment/scaffold tail varies.
  const { staticPrefix, dynamicTail } = buildCoachSystemBlocks(persona, assignment, scaffold)

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: [
      { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicTail },
    ],
    messages: cleanedMessages,
  })

  const encoder = new TextEncoder()
  const TOKEN_RE = /\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE):[^\]]*\]|\[COMPLETE\]/g

  // The stream's text tokens are enqueued to the client as they arrive, then the
  // stream closes immediately. The usage log + message insert run in after(), so the
  // client's read loop is no longer held open waiting on two DB round trips. after()
  // keeps the serverless function alive until those writes complete.
  let resolveResult
  const resultReady = new Promise(resolve => { resolveResult = resolve })

  const readable = new ReadableStream({
    async start(controller) {
      let fullText = ''
      let inputTokens = 0
      let outputTokens = 0
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'message_start') inputTokens = chunk.message.usage?.input_tokens ?? 0
          if (chunk.type === 'message_delta')  outputTokens = chunk.usage?.output_tokens ?? 0
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      } finally {
        const savedText = fullText.replace(TOKEN_RE, '').replace(/\[DICTATE\]/g, '').trim()
        resolveResult({ inputTokens, outputTokens, savedText })
      }
    },
  })

  after(async () => {
    const { inputTokens, outputTokens, savedText } = await resultReady
    try {
      await logAnthropicUsage({ model: 'claude-sonnet-4-6', inputTokens, outputTokens, sessionId })
    } catch (e) {
      console.error('[tutor] usage log failed:', e)
    }
    if (savedText) {
      const { error } = await supabase.from('messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: savedText,
      })
      if (error) console.error('[tutor] message insert failed:', error.message)
    }
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
