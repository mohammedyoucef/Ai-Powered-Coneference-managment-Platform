import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, notify } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { requireEventManager, serializeReviewerApplication, autoAssignOpenPapers } from '@/lib/server/business'

const Schema = z.object({ status: z.enum(['approved', 'rejected']) })

/** Organizer approves/rejects a reviewer application for their event. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await queryOne<Record<string, unknown>>('select * from reviewer_applications where id=$1', [id])
    if (!app) throw new HttpError(404, 'Reviewer application not found.')
    const conf = await requireEventManager(user, String(app.conference_id))
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'status must be approved or rejected.' }, { status: 400 })
    if (String(app.status) !== 'pending') return NextResponse.json({ error: `This application was already ${String(app.status)}.` }, { status: 409 })
    await query('update reviewer_applications set status=$1, decided_by=$2, decided_at=now(), updated_at=now() where id=$3', [parsed.data.status, user.id, id])
    if (parsed.data.status === 'approved') {
      await autoAssignOpenPapers(String(app.conference_id), String(app.reviewer_id)).catch(() => 0)
    }
    await notify(String(app.reviewer_id), 'reviewer_application_decision', `Reviewer application ${parsed.data.status}`,
      parsed.data.status === 'approved'
        ? `You were approved to review for "${String(conf.title)}". Papers can now be assigned to you; you only see papers assigned to you.`
        : `Your reviewer application for "${String(conf.title)}" was not approved.`, '/review')
    const row = (await query(`select ra.*, u.display_name as reviewer_name, u.email as reviewer_email, c.title as conference_title from reviewer_applications ra join users u on u.id=ra.reviewer_id join conferences c on c.id=ra.conference_id where ra.id=$1`, [id]))[0]
    return NextResponse.json({ application: serializeReviewerApplication(row) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
