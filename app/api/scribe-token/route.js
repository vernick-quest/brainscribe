export async function POST() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ELEVENLABS_API_KEY is not set' }, { status: 401 })
  }

  const response = await fetch(
    'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
    }
  )

  const data = await response.json()
  return Response.json(data)
}
