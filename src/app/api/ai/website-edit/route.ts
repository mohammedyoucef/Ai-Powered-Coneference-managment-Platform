import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/server/auth'
import { getAIProviderFromHeaders } from '@/lib/ai/provider'
import { validateWebsiteConfig } from '@/lib/website/schema'
import type { Conference, WebsiteConfig } from '@/lib/demo/types'

/** Revising a full AI page can take several minutes. */
export const maxDuration = 300

export async function POST(req: Request) {
  try {
    if (!(await getCurrentUser())) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const body = (await req.json()) as { config?: WebsiteConfig; conference?: Conference; instruction?: string }
    if (!body.config || !body.conference || !body.instruction?.trim()) {
      return NextResponse.json({ error: 'Config, conference, and an instruction are required.' }, { status: 400 })
    }
    const current = validateWebsiteConfig(body.config)
    if (!current.success) {
      return NextResponse.json({ error: 'Current website config is invalid.' }, { status: 400 })
    }
    const provider = getAIProviderFromHeaders(req.headers)
    let result
    try {
      result = current.data.generationMode === 'ai-page'
        ? await provider.proposeCustomPageEdit(current.data as WebsiteConfig, body.instruction, body.conference)
        : await provider.proposeWebsiteEdit(current.data as WebsiteConfig, body.instruction, body.conference)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Edit proposal failed'
      const needsMeta = message.includes('Meta API key in Profile') || message.includes('MODEL_API_KEY')
      return NextResponse.json({ error: message }, { status: needsMeta ? 400 : 502 })
    }
    const validated = validateWebsiteConfig(result.data)
    if (!validated.success) {
      return NextResponse.json({ error: 'Proposed edit failed validation and was discarded.' }, { status: 502 })
    }
    return NextResponse.json({
      config: validated.data,
      source: result.source,
      label: result.label,
      model: result.model ?? null,
      summary: result.summary ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'Failed to propose edit' }, { status: 500 })
  }
}
