import { NextResponse } from 'next/server'
import { query, publicUser } from '@/lib/server/db'
import { requirePlatformAdmin, errorJson } from '@/lib/server/auth'

export async function GET() {
  try {
    await requirePlatformAdmin()
    const users = await query('select * from users order by created_at desc limit 200')
    const orgs = await query('select * from organizations order by created_at desc limit 200')
    const confs = await query('select id,title,slug,lifecycle,organization_id,created_at from conferences order by created_at desc limit 200')
    return NextResponse.json({
      users: users.map((u) => publicUser(u)),
      organizations: orgs.map((o) => ({ id: String(o.id), name: String(o.name), slug: String(o.slug), createdAt: new Date(String(o.created_at)).toISOString() })),
      conferences: confs.map((c) => ({ id: String(c.id), title: String(c.title), slug: String(c.slug), lifecycle: String(c.lifecycle), organizationId: String(c.organization_id) })),
      health: { database: 'PostgreSQL connected', timestamp: new Date().toISOString() },
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requirePlatformAdmin()
    const { userId, platformRole } = (await req.json().catch(() => ({}))) as { userId?: string; platformRole?: string }
    if (!userId || !['user', 'platform_admin'].includes(platformRole || '')) return NextResponse.json({ error: 'userId and valid platformRole required.' }, { status: 400 })
    if (userId === admin.id && platformRole !== 'platform_admin') return NextResponse.json({ error: 'You cannot remove your own platform admin role.' }, { status: 400 })
    await query('update users set platform_role=$1, updated_at=now() where id=$2', [platformRole, userId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
