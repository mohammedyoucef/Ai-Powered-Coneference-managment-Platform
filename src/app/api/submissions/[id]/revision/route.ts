import { NextResponse } from 'next/server'
import { query, queryOne, newId, notify } from '@/lib/server/db'
import { requireUser, requireAccountType, errorJson, HttpError } from '@/lib/server/auth'
import { saveSubmissionFile, validatePdfBytes } from '@/lib/server/files'
import { access } from '../route'

/** Author uploads a revised manuscript after a "Revision Requested" decision. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    requireAccountType(user, ['researcher'], 'Only Researcher accounts can upload revised papers.')
    const sub = await queryOne<Record<string, unknown>>('select * from submissions where id=$1', [id])
    if (!sub) throw new HttpError(404, 'Submission not found.')
    const { author, conf } = await access(user.id, sub)
    if (!author) throw new HttpError(403, 'Only the submitting author can upload a revision.')
    if (String(sub.status) !== 'Revision Requested') {
      throw new HttpError(403, 'A revision can only be uploaded when the organizer has requested one (status: Revision Requested).')
    }
    // Revisions are governed by the camera-ready/revision deadline if set;
    // otherwise they remain open while the event is not completed.
    const cfg = conf as unknown as Record<string, unknown>
    const deadlineRaw = (cfg.camera_ready_deadline as string) || null
    if (deadlineRaw && Date.now() > new Date(`${String(deadlineRaw).slice(0, 10)}T23:59:59`).getTime()) {
      throw new HttpError(403, 'The revision deadline has passed.')
    }
    if (String(conf.lifecycle) === 'completed' || String(conf.lifecycle) === 'archived') {
      throw new HttpError(403, 'This event is closed; revisions are no longer accepted.')
    }
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'A PDF file is required.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const maxMb = Number(cfg.max_file_size_mb || 10)
    const invalid = validatePdfBytes(file.name, bytes, Math.min(50, Math.max(1, maxMb)) * 1024 * 1024)
    if (invalid) throw new HttpError(400, invalid)
    const stored = await saveSubmissionFile(id, 'manuscript', bytes)
    await query(
      "update submissions set file_name=$1, file_size=$2, file_path=$3, status='Revised Submitted', decision_released=false, updated_at=now() where id=$4",
      [file.name, bytes.length, stored, id],
    )
    await query('insert into submission_files (id,submission_id,kind,file_name,file_path,file_size,uploaded_by) values ($1,$2,$3,$4,$5,$6,$7)',
      [newId('sfile'), id, 'revision', file.name, stored, bytes.length, user.id]).catch(() => {})
    const managers = await query<{ user_id: string }>("select user_id from organization_members where organization_id=$1 and role in ('owner','admin')", [conf.organization_id])
    for (const m of managers) {
      if (m.user_id !== user.id) await notify(m.user_id, 'revision_submitted', 'Revised paper submitted', `"${String(sub.title)}" has a revised version ready for review.`, '/submissions')
    }
    await notify(user.id, 'revision_submitted', 'Revision received', `Your revised version of "${String(sub.title)}" was received.`, '/submissions')
    return NextResponse.json({ ok: true, status: 'Revised Submitted' })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
