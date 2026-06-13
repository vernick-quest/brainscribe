import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildCoachSystemPrompt } from '@/lib/prompts'
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

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: buildCoachSystemPrompt(persona, assignment, scaffold),
    messages: cleanedMessages,
  })

  const encoder = new TextEncoder()
  const TOKEN_RE = /\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE):[^\]]*\]|\[COMPLETE\]/g

  const readable = new ReadableStream({
    async start(controller) {
      let fullText = ''
      let inputTokens = 0
      let outputTokens = 0
      for await (const chunk of stream) {
        if (chunk.type === 'message_start') inputTokens = chunk.message.usage?.input_tokens ?? 0
        if (chunk.type === 'message_delta')  outputTokens = chunk.usage?.output_tokens ?? 0
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullText += chunk.delta.text
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }

      logAnthropicUsage({ model: 'claude-sonnet-4-6', inputTokens, outputTokens, sessionId })

      // Strip scaffold tokens before persisting to messages table
      const savedText = fullText.replace(TOKEN_RE, '').replace(/\[DICTATE\]/g, '').trim()
      await supabase.from('messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: savedText,
      })

      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
