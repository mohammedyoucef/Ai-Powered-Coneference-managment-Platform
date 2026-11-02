import { NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { requireUser, errorJson } from '@/lib/server/auth'

export async function GET() {
  try {
    const user = await requireUser()
    const rows = await query('select * from notifications where user_id=$1 order by created_at desc limit 100', [user.id])
    return NextResponse.json({
      notifications: rows.map((n) => ({
        id: String(n.id), userId: String(n.user_id), type: String(n.type), title: String(n.title),
        body: (n.body as string) || undefined, link: (n.link as string) || undefined, isRead: Boolean(n.is_read),
        emailStatus: String(n.email_status), createdAt: new Date(String(n.created_at)).toISOString(),
      })),
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser()
    const { id, all } = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean }
    if (all) await query('update notifications set is_read=true where user_id=$1', [user.id])
    else if (id) await query('update notifications set is_read=true where id=$1 and user_id=$2', [id, user.id])
    else return NextResponse.json({ error: 'id or all required.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
