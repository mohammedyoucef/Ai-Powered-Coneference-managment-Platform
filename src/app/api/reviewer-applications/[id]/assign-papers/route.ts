import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { requireEventManager, autoAssignOpenPapers } from '@/lib/server/business'

/**
 * Organizer assigns an approved reviewer's currently open papers.
 * Covers reviewers approved before auto-assignment existed, and any
 * papers submitted while they were not yet eligible.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await queryOne<Record<string, unknown>>('select * from reviewer_applications where id=$1', [id])
    if (!app) throw new HttpError(404, 'Reviewer application not found.')
    await requireEventManager(user, String(app.conference_id))
    if (String(app.status) !== 'approved') {
      return NextResponse.json({ error: 'Only an approved reviewer can be assigned papers. Approve the application first.' }, { status: 400 })
    }
    const assigned = await autoAssignOpenPapers(String(app.conference_id), String(app.reviewer_id))
    return NextResponse.json({ assigned, message: assigned > 0 ? `${assigned} open paper(s) assigned. They are now in the reviewer's Review page.` : 'No unassigned open papers for this reviewer right now.' })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
