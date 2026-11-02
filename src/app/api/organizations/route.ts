import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, newId, slugify, uniqueOrgSlug, logActivity } from '@/lib/server/db'
import { requireUser, requireAccountType, errorJson } from '@/lib/server/auth'
import { serializeOrg } from '@/lib/server/serialize'

const Schema = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(3000).optional(),
  type: z.string().max(120).optional(),
  websiteUrl: z.string().max(500).optional(),
  contactEmail: z.string().email().max(200).optional().or(z.literal('')),
  logoUrl: z.string().max(1000).optional(),
})

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    requireAccountType(user, ['organizer'], 'Only Organizer accounts can create organizations.')
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid organization details.' }, { status: 400 })
    const d = parsed.data
    const slug = d.slug ? slugify(d.slug) : await uniqueOrgSlug(d.name)
    const taken = await query('select id from organizations where slug=$1', [slug])
    if (taken.length) return NextResponse.json({ error: 'An organization with this URL slug already exists.' }, { status: 409 })
    const id = d.id || newId('org')
    await query('insert into organizations (id,name,slug,description,type,website_url,contact_email,logo_url,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, d.name, slug, d.description || null, d.type || null, d.websiteUrl || null, d.contactEmail || null, d.logoUrl || null, user.id])
    await query("insert into organization_members (organization_id,user_id,role) values ($1,$2,'owner')", [id, user.id])
    await logActivity(user.id, id, null, 'organization_created', d.name)
    const row = (await query('select * from organizations where id=$1', [id]))[0]
    return NextResponse.json({ organization: serializeOrg(row, 'owner') }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
