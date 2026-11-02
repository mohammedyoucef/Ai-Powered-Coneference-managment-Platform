import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/server/auth'
import { ConferenceDraftSchema, getAIProviderFromHeaders } from '@/lib/ai/provider'

export async function POST(req: Request) {
  try {
    if (!(await getCurrentUser())) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const body = (await req.json()) as { description?: unknown }
    const description = typeof body?.description === 'string' ? body.description : ''
    if (description.trim().length < 10) {
      return NextResponse.json({ error: 'Please describe the conference in at least a sentence.' }, { status: 400 })
    }
    const provider = getAIProviderFromHeaders(req.headers)
    const result = await provider.generateConferenceDraft(description)
    const validated = ConferenceDraftSchema.parse(result.data)
    return NextResponse.json({ draft: validated, source: result.source, label: result.label, model: result.model ?? null })
  } catch {
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 })
  }
}
