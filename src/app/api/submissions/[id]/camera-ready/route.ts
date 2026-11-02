import { NextResponse } from 'next/server'
import { query, queryOne, notify } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { saveSubmissionFile, validatePdfBytes } from '@/lib/server/files'
import { access } from '../route'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await queryOne<Record<string, unknown>>('select * from submissions where id=$1', [id])
    if (!sub) throw new HttpError(404, 'Submission not found.')
    const { author, conf } = await access(user.id, sub)
    if (!author) throw new HttpError(403, 'Only the submitting author can upload the camera-ready version.')
    if (!['Accepted', 'Camera-Ready Requested'].includes(String(sub.status))) {
      throw new HttpError(403, 'Camera-ready upload is only available after acceptance.')
    }
    if (conf.camera_ready_deadline && Date.now() > new Date(`${String(conf.camera_ready_deadline).slice(0, 10)}T23:59:59`).getTime()) {
      throw new HttpError(403, 'The camera-ready deadline has passed.')
    }
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'A PDF file is required.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const invalid = validatePdfBytes(file.name, bytes)
    if (invalid) throw new HttpError(400, invalid)
    const stored = await saveSubmissionFile(id, 'camera', bytes)
    await query("update submissions set camera_file_name=$1, camera_file_path=$2, status='Camera-Ready Submitted', updated_at=now() where id=$3", [file.name, stored, id])
    const managers = await query<{ user_id: string }>("select user_id from organization_members where organization_id=$1 and role in ('owner','admin')", [conf.organization_id])
    for (const m of managers) await notify(m.user_id, 'camera_ready', 'Camera-ready received', `"${String(sub.title)}" camera-ready was uploaded.`, '/submissions')
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
