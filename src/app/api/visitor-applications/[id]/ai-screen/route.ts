import { NextResponse } from 'next/server'
import { query, queryOne, newId } from '@/lib/server/db'
import { requireUser, getConferenceRow, errorJson, HttpError } from '@/lib/server/auth'
import { isConferenceManager, screenApplication, arr } from '@/lib/server/business'
import { resolveAIConfig } from '@/lib/ai/provider'

async function loadApp(id: string) {
  const app = await queryOne<Record<string, unknown>>('select * from visitor_applications where id=$1', [id])
  if (!app) throw new HttpError(404, 'Visitor application not found.')
  return app
}

function serializeScreening(r: Record<string, unknown>) {
  return {
    id: String(r.id), visitorApplicationId: String(r.visitor_application_id), conferenceId: String(r.conference_id),
    source: String(r.source), model: (r.model as string) || undefined, recommendation: String(r.recommendation),
    assessment: (r.assessment && typeof r.assessment === 'object' ? r.assessment : {}) as Record<string, unknown>,
    createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : new Date().toISOString(),
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await loadApp(id)
    const conf = await getConferenceRow(String(app.conference_id))
    if (!conf || !(await isConferenceManager(user, conf))) throw new HttpError(403, 'AI screenings are organizer-only.')
    const rows = await query('select * from ai_screenings where visitor_application_id=$1 order by created_at desc', [id])
    return NextResponse.json({ screenings: rows.map(serializeScreening) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

/**
 * Run eligibility screening for one application. Advisory only: the result is
 * stored and linked to the application; it never changes the application
 * status. Without a configured model the deterministic, evidence-only
 * fallback runs and is labeled as such.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await loadApp(id)
    const conf = (await getConferenceRow(String(app.conference_id))) as (NonNullable<Awaited<ReturnType<typeof getConferenceRow>>> & Record<string, unknown>) | null
    if (!conf) throw new HttpError(404, 'Event not found.')
    if (!(await isConferenceManager(user, conf))) throw new HttpError(403, 'Only organizers managing this event can run AI screening.')
    const headerKey = req.headers.get('x-meta-api-key') || undefined
    const aiConfigured = Boolean(headerKey) || resolveAIConfig().configured
    const answers = (app.answers && typeof app.answers === 'object' ? app.answers : {}) as Record<string, string>
    const result = screenApplication({
      criteria: arr(conf.eligibility_criteria),
      questions: arr(conf.eligibility_questions),
      answers,
      documentName: (app.document_name as string) || null,
      hasDocument: Boolean(app.document_path),
      aiConfigured,
    })
    const screeningId = newId('aiscr')
    await query('insert into ai_screenings (id,visitor_application_id,conference_id,created_by,source,model,recommendation,assessment) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [screeningId, id, String(app.conference_id), user.id, result.source, null, result.recommendation, JSON.stringify(result.assessment)])
    const row = (await query('select * from ai_screenings where id=$1', [screeningId]))[0]
    return NextResponse.json({ screening: serializeScreening(row), advisoryOnly: true }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
