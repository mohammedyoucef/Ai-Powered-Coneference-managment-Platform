import { NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { requireUser, requireOrgManager, requireOrgMember, errorJson } from '@/lib/server/auth'
import { serializeOrg } from '@/lib/server/serialize'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    await requireOrgManager(user, id)
    const b = (await req.json().catch(() => ({}))) as Record<string, string | undefined>
    await query('update organizations set name=$1, description=$2, type=$3, website_url=$4, contact_email=$5, logo_url=$6, updated_at=now() where id=$7',
      [b.name || undefined, b.description ?? null, b.type ?? null, b.websiteUrl ?? null, b.contactEmail ?? null, b.logoUrl ?? null, id])
    // Preserve name if not provided: re-read and fix null name guard
    const row = (await query('select * from organizations where id=$1', [id]))[0]
    if (!row) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })
    if (!row.name) await query('update organizations set name=$1 where id=$2', ['Untitled Organization', id])
    return NextResponse.json({ organization: serializeOrg((await query('select * from organizations where id=$1', [id]))[0]) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const role = await requireOrgMember(user, id)
    if (role !== 'owner') return NextResponse.json({ error: 'Only the organization owner can delete it.' }, { status: 403 })
    await query('delete from organizations where id=$1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
