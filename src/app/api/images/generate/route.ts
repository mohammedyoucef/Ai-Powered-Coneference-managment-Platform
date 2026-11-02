import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/server/auth'
import { aiConfigFromHeaders, resolveAIConfig } from '@/lib/ai/provider'

function metaErrorDetail(payload: unknown, rawText: string): string {
  if (payload && typeof payload === 'object') {
    const err = (payload as { error?: { message?: unknown; code?: unknown; type?: unknown } }).error
    if (err) {
      const bits = [err.message, err.code, err.type].filter((x): x is string => typeof x === 'string' && Boolean(x))
      if (bits.length > 0) return bits.join(' · ')
    }
  }
  return rawText.slice(0, 400)
}

function looksLikeBase64Image(v: string): boolean {
  if (v.length < 5000) return false
  const sample = v.slice(0, 2000).replace(/\s/g, '')
  return /^[A-Za-z0-9+/=]+$/.test(sample) && (v.startsWith('/9j/') || v.startsWith('iVBOR') || v.startsWith('UklGR') || v.length > 20000)
}

/** Recursively search a Responses API payload for image data (base64 or URL), under any key. */
function findImage(payload: unknown, depth = 0): { base64?: string; url?: string; mime?: string } | null {
  if (depth > 10) return null
  if (typeof payload === 'string') {
    if (payload.startsWith('data:image/')) {
      const comma = payload.indexOf(',')
      if (comma > 0) return { base64: payload.slice(comma + 1), mime: payload.slice(5, payload.indexOf(';')) }
    }
    if (looksLikeBase64Image(payload)) return { base64: payload.replace(/\s/g, ''), mime: 'image/png' }
    if (payload.startsWith('https://') && (/\.(png|jpe?g|webp)(\?|&|$)/i.test(payload) || /image/i.test(payload))) return { url: payload }
    return null
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findImage(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>
    // Prefer known image-bearing keys first, then scan everything else.
    for (const key of ['result', 'b64_json', 'base64', 'image_base64', 'image', 'data', 'image_url', 'url']) {
      if (key in obj) {
        const found = findImage(obj[key], depth + 1)
        if (found) {
          if (found.base64 && typeof obj.mime === 'string') found.mime = obj.mime
          return found
        }
      }
    }
    for (const [key, value] of Object.entries(obj)) {
      if (['result', 'b64_json', 'base64', 'image_base64', 'image', 'data', 'image_url', 'url'].includes(key)) continue
      const found = findImage(value, depth + 1)
      if (found) return found
    }
  }
  return null
}

/** Describe image_generation_call items (keys + status only, never content) for diagnostics. */
function imageCallDiagnostics(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) return ''
  const calls = (output as Record<string, unknown>[]).filter((o) => o?.type === 'image_generation_call')
  if (calls.length === 0) return ''
  return calls
    .map((c) => {
      const result = c.result
      const resultInfo = typeof result === 'string' ? `result:${result.length} chars` : result && typeof result === 'object' ? `result:{${Object.keys(result as object).slice(0, 6).join(',')}}` : `result:${String(result)}`
      return `{status:${String(c.status ?? '?')}, ${resultInfo}, keys:${Object.keys(c).slice(0, 10).join(',')}}`
    })
    .join(' ')
}

function payloadShape(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return typeof payload
  const obj = payload as Record<string, unknown>
  const output = Array.isArray(obj.output)
    ? (obj.output as Record<string, unknown>[]).map((o) => String(o?.type ?? 'item')).join(', ')
    : ''
  return `keys: ${Object.keys(obj).slice(0, 10).join(', ')}${output ? `; output types: ${output}` : ''}`
}

export async function POST(req: Request) {
  try {
    if (!(await getCurrentUser())) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const body = (await req.json()) as { prompt?: unknown }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : ''
    if (prompt.length < 8) {
      return NextResponse.json({ error: 'An image prompt of at least a few words is required.' }, { status: 400 })
    }

    const headerConfig = aiConfigFromHeaders(req.headers)
    const resolved = resolveAIConfig(headerConfig)
    const imageModel = req.headers.get('x-meta-image-model') || process.env.META_IMAGE_MODEL || resolved.model
    if (!resolved.configured) {
      return NextResponse.json(
        { error: 'No Meta API key configured. Add your key in Profile to generate AI images, or choose stock photos instead.' },
        { status: 400 },
      )
    }

    const input = [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }]
    const attempts: { name: string; body: Record<string, unknown> }[] = [
      {
        name: 'image_generation tool with size/quality/format',
        body: { model: imageModel, stream: false, input, tools: [{ type: 'image_generation', size: '1536x1024', quality: 'high', output_format: 'png' }], tool_choice: { type: 'image_generation' } },
      },
      {
        name: 'image_generation tool (defaults)',
        body: { model: imageModel, stream: false, input, tools: [{ type: 'image_generation' }] },
      },
      {
        name: 'direct generation prompt (no tool)',
        body: { model: imageModel, stream: false, input: [{ role: 'user', content: [{ type: 'input_text', text: `Generate an image (not a text description) for the following brief and return the image itself:\n${prompt}` }] }] },
      },
    ]

    async function callMeta(attemptBody: Record<string, unknown>): Promise<{ ok: boolean; status: number; payload: unknown; rawText: string }> {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)
      try {
        const res = await fetch(resolved.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resolved.apiKey}` },
          signal: controller.signal,
          body: JSON.stringify(attemptBody),
        })
        const rawText = await res.text().catch(() => '')
        let payload: unknown = null
        try {
          payload = rawText ? JSON.parse(rawText) : null
        } catch {
          payload = null
        }
        return { ok: res.ok, status: res.status, payload, rawText }
      } finally {
        clearTimeout(timeout)
      }
    }

    async function extractWithPolling(initial: unknown): Promise<{ image: ReturnType<typeof findImage>; payload: unknown }> {
      let payload = initial
      let image = findImage(payload)
      const responseId = typeof (payload as { id?: unknown } | null)?.id === 'string' ? (payload as { id: string }).id : null
      if (!image && responseId) {
        const retrieveUrl = `${resolved.endpoint.replace(/\/+$/, '')}/${responseId}`
        for (let i = 0; i < 8 && !image; i += 1) {
          await new Promise((r) => setTimeout(r, 3000))
          try {
            const poll = await fetch(retrieveUrl, { headers: { Authorization: `Bearer ${resolved.apiKey}` } })
            if (!poll.ok) break
            const polled: unknown = await poll.json().catch(() => null)
            if (!polled) break
            payload = polled
            image = findImage(polled)
            const status = (polled as { status?: unknown }).status
            if (status === 'failed' || status === 'cancelled' || status === 'incomplete') break
          } catch {
            break
          }
        }
      }
      return { image, payload }
    }

    const attemptReports: string[] = []
    for (const attempt of attempts) {
      const result = await callMeta(attempt.body)
      if (!result.ok) {
        const detail = metaErrorDetail(result.payload, result.rawText)
        attemptReports.push(`${attempt.name}: HTTP ${result.status} ${detail}`)
        if (result.status === 401 || result.status === 403) break // Auth problems will not fix themselves.
        continue
      }
      const { image, payload } = await extractWithPolling(result.payload)
      if (image) {
        return NextResponse.json({ image, model: imageModel, strategy: attempt.name })
      }
      const diag = imageCallDiagnostics(payload)
      attemptReports.push(`${attempt.name}: no image (${payloadShape(payload)})${diag ? `; calls ${diag}` : ''}`)
      // If Meta itself marked the calls failed, the remaining shapes usually
      // fail the same way for model/entitlement reasons — but we still try
      // them because they are cheap and sometimes shape-specific.
    }

    return NextResponse.json(
      {
        error: `Meta image generation did not produce an image with model "${imageModel}". This is an upstream generation failure (Meta's image calls returned status "failed" with an empty result), not a parsing problem. Attempts — ${attemptReports.join(' | ')}. Most likely this model or API key is not entitled to image generation. Check your Meta dashboard for an image-generation model, copy its exact model ID into Profile → "AI image generation model", and try again; or use stock photos.`,
      },
      { status: 422 },
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error && err.name === 'AbortError' ? 'AI image generation timed out after 120 seconds.' : 'AI image generation failed unexpectedly.' },
      { status: 500 },
    )
  }
}
