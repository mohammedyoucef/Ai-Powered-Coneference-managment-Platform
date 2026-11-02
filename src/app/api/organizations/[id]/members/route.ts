import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, newId, notify, logActivity } from '@/lib/server/db'
import { requireUser, requireOrgManager, errorJson } from '@/lib/server/auth'

const Schema = z.object({ email: z.string().trim().email(), role: z.enum(['owner', 'admin', 'member']).default('member') })

/** Invite by email: existing users join immediately + get an in-app notification; unknown emails create a pending invitation claimed at registration. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    await requireOrgManager(user, id)
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email and role.' }, { status: 400 })
    const email = parsed.data.email.toLowerCase()
    const target = await queryOne<{ id: string; display_name: string }>('select id, display_name from users where lower(email)=$1', [email])
    const org = await queryOne<{ name: string }>('select name from organizations where id=$1', [id])
    if (target) {
      await query('insert into organization_members (organization_id,user_id,role) values ($1,$2,$3) on conflict (organization_id,user_id) do update set role=excluded.role', [id, target.id, parsed.data.role])
      await notify(target.id, 'organization_invite', `Added to ${org?.name || 'an organization'}`, `You were added as ${parsed.data.role} by ${user.display_name}.`, '/organizations')
      await logActivity(user.id, id, null, 'member_added', `${email} as ${parsed.data.role}`)
      return NextResponse.json({ ok: true, joined: true, message: `${email} already has an account and was added immediately. In-app notification created (email not configured).` })
    }
    await query("insert into invitations (id,organization_id,email,role,invited_by,expires_at) values ($1,$2,$3,$4,$5, now() + interval '14 days')", [newId('inv'), id, email, parsed.data.role, user.id])
    await logActivity(user.id, id, null, 'member_invited', email)
    return NextResponse.json({ ok: true, joined: false, message: `Invitation recorded for ${email}. It will be applied automatically when they register with that email. No email was sent (provider not configured).` })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    await requireOrgManager(user, id)
    const { userId } = (await req.json().catch(() => ({}))) as { userId?: string }
    if (!userId) return NextResponse.json({ error: 'userId required.' }, { status: 400 })
    const targetRole = await queryOne<{ role: string }>('select role from organization_members where organization_id=$1 and user_id=$2', [id, userId])
    if (targetRole?.role === 'owner' && userId !== user.id) return NextResponse.json({ error: 'The owner cannot be removed by another member.' }, { status: 403 })
    await query('delete from organization_members where organization_id=$1 and user_id=$2', [id, userId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
