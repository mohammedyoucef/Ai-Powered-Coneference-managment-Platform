import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/server/db'
import { requireUser, errorJson, HttpError } from '@/lib/server/auth'
import { readSubmissionFile } from '@/lib/server/files'
import { access } from '../route'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const sub = await queryOne<Record<string, unknown>>('select * from submissions where id=$1', [id])
    if (!sub) throw new HttpError(404, 'Submission not found.')
    const { manager, author, reviewer } = await access(user.id, sub)
    if (!manager && !author && !reviewer) throw new HttpError(403, 'You are not authorized to access this file.')
    const kind = new URL(req.url).searchParams.get('kind')
    const filePath = kind === 'camera' ? (sub.camera_file_path as string) : (sub.file_path as string)
    const fileName = kind === 'camera' ? String(sub.camera_file_name || 'camera-ready.pdf') : String(sub.file_name || 'manuscript.pdf')
    if (!filePath) throw new HttpError(404, 'No file stored for this submission.')
    const bytes = await readSubmissionFile(filePath)
    if (!bytes) throw new HttpError(404, 'File bytes are missing on the server.')
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
