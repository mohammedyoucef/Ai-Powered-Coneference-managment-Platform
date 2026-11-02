import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/server/auth'
import { getAIProviderFromHeaders } from '@/lib/ai/provider'
import { validateWebsiteConfig } from '@/lib/website/schema'
import type { Conference, Organization, WebsiteThemeVariant } from '@/lib/demo/types'

/** Full-page AI design can take several minutes. */
export const maxDuration = 300

const VARIANTS: WebsiteThemeVariant[] = [
  'modern-academic',
  'editorial-minimal',
  'bold-research',
  'contemporary-tech',
  'elegant-institutional',
]

export async function POST(req: Request) {
  try {
    if (!(await getCurrentUser())) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const body = (await req.json()) as { conference?: Conference; organization?: Organization | null; variant?: string; designPrompt?: string; mode?: string }
    if (!body.conference?.id || !body.conference?.title) {
      return NextResponse.json({ error: 'A conference record is required.' }, { status: 400 })
    }
    const variant = VARIANTS.includes(body.variant as WebsiteThemeVariant)
      ? (body.variant as WebsiteThemeVariant)
      : undefined
    const designPrompt = typeof body.designPrompt === 'string' ? body.designPrompt.slice(0, 10000) : undefined
    // Default is the fully AI-authored page. The section/template builder is
    // only used when the organizer explicitly picks mode:'structured'.
    const mode = body.mode === 'structured' ? 'structured' : 'ai-page'
    const provider = getAIProviderFromHeaders(req.headers)
    let result
    try {
      result = mode === 'ai-page'
        ? await provider.generateCustomPage(body.conference, body.organization ?? null, designPrompt)
        : await provider.generateWebsiteConfig(body.conference, body.organization ?? null, variant, designPrompt)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      const needsMeta = message.includes('Meta API key in Profile') || message.includes('MODEL_API_KEY')
      return NextResponse.json({ error: message }, { status: needsMeta ? 400 : 502 })
    }
    const validated = validateWebsiteConfig(result.data)
    if (!validated.success) {
      return NextResponse.json({ error: 'Generated website failed validation. Please try again.' }, { status: 502 })
    }
    return NextResponse.json({ config: validated.data, source: result.source, label: result.label, model: result.model ?? null, summary: result.summary ?? [] })
  } catch {
    return NextResponse.json({ error: 'Failed to generate website' }, { status: 500 })
  }
}
