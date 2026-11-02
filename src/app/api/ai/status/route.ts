import { NextResponse } from 'next/server'
import { getAIProviderFromHeaders, resolveAIConfig, aiConfigFromHeaders } from '@/lib/ai/provider'

export async function GET(req: Request) {
  const provider = getAIProviderFromHeaders(req.headers)
  const resolved = resolveAIConfig(aiConfigFromHeaders(req.headers))
  return NextResponse.json({
    configured: resolved.configured,
    source: provider.source,
    label: provider.label,
    model: resolved.configured ? resolved.model : null,
  })
}
