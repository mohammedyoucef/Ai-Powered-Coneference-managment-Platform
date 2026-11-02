import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { saveSubmissionFile, validatePdfBytes } from '@/lib/server/files'
import { access } from '../route'

/** Author replaces the manuscript PDF (blocked after decision release / deadline, server-enforced). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await queryOne<Record<string, unknown>>('select * from submissions where id=$1', [id])
    if (!sub) throw new HttpError(404, 'Submission not found.')
    const { author, manager, conf } = await access(user.id, sub)
    if (!author && !manager) throw new HttpError(403, 'You cannot replace this file.')
    if (!manager) {
      if (sub.decision_released) throw new HttpError(403, 'Decisions have been released; the manuscript can no longer be replaced.')
      if (conf.submission_deadline && Date.now() > new Date(`${String(conf.submission_deadline).slice(0, 10)}T23:59:59`).getTime()) {
        throw new HttpError(403, 'The submission deadline has passed.')
      }
    }
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'A PDF file is required.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const invalid = validatePdfBytes(file.name, bytes)
    if (invalid) throw new HttpError(400, invalid)
    const stored = await saveSubmissionFile(id, 'manuscript', bytes)
    await query('update submissions set file_name=$1, file_size=$2, file_path=$3, page_count=$4, extracted_text=$5, extraction_note=$6, updated_at=now() where id=$7',
      [file.name, bytes.length, stored, form.get('pageCount') ? Number(form.get('pageCount')) : null, String(form.get('extractedText') || '').slice(0, 200000) || null, String(form.get('extractionNote') || '') || null, id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
