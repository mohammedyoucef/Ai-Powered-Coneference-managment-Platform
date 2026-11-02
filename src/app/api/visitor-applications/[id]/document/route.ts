import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/server/db'
import { requireUser, getConferenceRow, errorJson, HttpError } from '@/lib/server/auth'
import { isConferenceManager } from '@/lib/server/business'
import { readSubmissionFile } from '@/lib/server/files'

/** Authorized download of a visitor application's supporting document. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const app = await queryOne<Record<string, unknown>>('select * from visitor_applications where id=$1', [id])
    if (!app) throw new HttpError(404, 'Visitor application not found.')
    const conf = await getConferenceRow(String(app.conference_id))
    const manager = conf ? await isConferenceManager(user, conf) : false
    if (!manager && String(app.visitor_id) !== user.id) throw new HttpError(403, 'You are not authorized to access this document.')
    if (!app.document_path) throw new HttpError(404, 'No document stored for this application.')
    const bytes = await readSubmissionFile(String(app.document_path))
    if (!bytes) throw new HttpError(404, 'Document bytes are missing on the server.')
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${String(app.document_name || 'document.pdf').replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
