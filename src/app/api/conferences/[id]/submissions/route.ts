import { NextResponse } from 'next/server'
import { query, newId, notify, logActivity } from '@/lib/server/db'
import { requireUser, getConferenceRow, requireAccountType, canAccessConference, errorJson, HttpError } from '@/lib/server/auth'
import { saveSubmissionFile, validatePdfBytes } from '@/lib/server/files'
import { serializeSubmission } from '@/lib/server/serialize'
import { autoAssignPaper } from '@/lib/server/business'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: confId } = await ctx.params
    const user = await requireUser()
    requireAccountType(user, ['researcher'], 'Only Researcher accounts can submit papers. Reviewer, Visitor and Organizer accounts cannot submit as a Researcher.')
    const conf = await getConferenceRow(confId)
    if (!conf) throw new HttpError(404, 'Conference not found.')
    if (!(await canAccessConference(user, conf))) throw new HttpError(403, 'You do not have access to this event. Private events require an invitation.')
    const cfg = conf as unknown as Record<string, unknown>
    if (cfg.submissions_enabled === false) throw new HttpError(403, 'Research submissions are disabled for this event.')
    const openStates = ['published', 'cfp_open', 'submissions_open']
    if (!openStates.includes(String(conf.lifecycle))) {
      throw new HttpError(403, 'Submissions are not open for this conference.')
    }
    if (conf.submission_deadline) {
      const deadline = new Date(`${String(conf.submission_deadline).slice(0, 10)}T23:59:59`)
      if (Date.now() > deadline.getTime()) throw new HttpError(403, 'The submission deadline has passed. Organizers can extend it in conference settings.')
    }
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'A PDF manuscript file is required.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const maxMb = Number(cfg.max_file_size_mb || 10)
    const invalid = validatePdfBytes(file.name, bytes, Math.min(50, Math.max(1, maxMb)) * 1024 * 1024)
    if (invalid) throw new HttpError(400, invalid)
    const title = String(form.get('title') || '').trim()
    const abstract = String(form.get('abstract') || '').trim()
    if (title.length < 3 || abstract.length < 20) throw new HttpError(400, 'Title (3+ chars) and abstract (20+ chars) are required.')
    const parseList = (v: FormDataEntryValue | null) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean)
    const subId = newId('sub')
    const stored = await saveSubmissionFile(subId, 'manuscript', bytes)
    await query(
      `insert into submissions (id,conference_id,author_id,title,abstract,authors,topics,submitted_by,submission_type,status,file_name,file_size,file_path,file_mime,page_count,extracted_text,extraction_note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Submitted',$10,$11,$12,'application/pdf',$13,$14,$15)`,
      [subId, confId, user.id, title, abstract, JSON.stringify(parseList(form.get('authors'))), JSON.stringify(parseList(form.get('topics'))),
       user.display_name, String(form.get('submissionType') || '') || null, file.name, bytes.length, stored,
       form.get('pageCount') ? Number(form.get('pageCount')) : null, String(form.get('extractedText') || '').slice(0, 200000) || null, String(form.get('extractionNote') || '') || null],
    )
    await query('insert into submission_files (id,submission_id,kind,file_name,file_path,file_size,uploaded_by) values ($1,$2,$3,$4,$5,$6,$7)',
      [newId('sfile'), subId, 'manuscript', file.name, stored, bytes.length, user.id]).catch(() => {})
    // Notify org managers
    const managers = await query<{ user_id: string }>("select user_id from organization_members where organization_id=$1 and role in ('owner','admin')", [conf.organization_id])
    for (const m of managers) {
      if (m.user_id !== user.id) await notify(m.user_id, 'submission_received', 'New paper submitted', `"${title}" was submitted to "${String(conf.title)}".`, '/submissions')
    }
    // Approved reviewers of this event receive the paper in their Review
    // page automatically (organizers can still assign manually as well).
    await autoAssignPaper(confId, subId, title, user.id).catch(() => 0)
    await notify(user.id, 'submission_confirmation', 'Submission received', `"${title}" was received by "${String(conf.title)}".`, '/submissions')
    await logActivity(user.id, conf.organization_id, confId, 'paper_submitted', title)
    const row = (await query('select * from submissions where id=$1', [subId]))[0]
    return NextResponse.json({ submission: serializeSubmission(row) }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
