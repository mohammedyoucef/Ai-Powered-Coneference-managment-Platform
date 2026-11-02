import { NextResponse } from 'next/server'
import { getAIProviderFromHeaders, resolveAIConfig, aiConfigFromHeaders } from '@/lib/ai/provider'

export async function POST(req: Request) {
  try {
    const resolved = resolveAIConfig(aiConfigFromHeaders(req.headers))
    const provider = getAIProviderFromHeaders(req.headers)
    const result = await provider.testConnection()
    return NextResponse.json({
      ok: result.ok,
      configured: resolved.configured,
      source: provider.source,
      label: provider.label,
      model: resolved.configured ? resolved.model : null,
      message: result.message,
    })
  } catch (err) {
    // Always return JSON so the UI can show a real reason, never a blank.
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        source: 'fallback',
        label: 'Connection test failed',
        model: null,
        message: err instanceof Error ? err.message : 'Unexpected server error during connection test.',
      },
      { status: 200 },
    )
  }
}
