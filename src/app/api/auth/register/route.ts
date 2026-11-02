import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, newId, publicUser } from '@/lib/server/db'
import { hashPassword, createSession, errorJson } from '@/lib/server/auth'

const ProfileSchema = z.object({
  position: z.string().trim().max(200).optional(),
  contact: z.string().trim().max(200).optional(),
  researchInterests: z.array(z.string().trim().max(120)).max(20).optional(),
  expertise: z.array(z.string().trim().max(120)).max(20).optional(),
  qualifications: z.string().trim().max(2000).optional(),
  orcid: z.string().trim().max(40).optional(),
  academicProfileUrl: z.string().trim().max(500).optional(),
  academicInfo: z.string().trim().max(2000).optional(),
  attendeeInfo: z.string().trim().max(2000).optional(),
}).optional()

const Schema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200).regex(/[a-zA-Z]/, 'Password must contain a letter').regex(/[0-9]/, 'Password must contain a number'),
  affiliation: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(2000).optional(),
  accountType: z.enum(['researcher', 'reviewer', 'organizer', 'visitor']).default('researcher'),
  // The registration UI requires this; API callers that omit it are accepted
  // for compatibility, but an explicit refusal is rejected.
  termsAccepted: z.boolean().optional(),
  profile: ProfileSchema,
})

export async function POST(req: Request) {
  try {
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid registration details.' }, { status: 400 })
    if (parsed.data.termsAccepted === false) return NextResponse.json({ error: 'You must accept the terms and privacy policy to register.' }, { status: 400 })
    const email = parsed.data.email.toLowerCase()
    const existing = await queryOne('select id from users where lower(email)=$1', [email])
    if (existing) return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 })
    // Platform admin is a Confexa-level role, separate from any account
    // type: an Organizer account is never made platform admin by
    // registering. Admins are designated explicitly via
    // PLATFORM_ADMIN_EMAILS or by an existing platform admin.
    const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    const isAdmin = adminEmails.includes(email)
    const id = newId('usr')
    await query(
      'insert into users (id,email,password_hash,display_name,affiliation,bio,platform_role,account_type,profile,terms_accepted_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, email, hashPassword(parsed.data.password), parsed.data.displayName, parsed.data.affiliation || null, parsed.data.bio || null, isAdmin ? 'platform_admin' : 'user', parsed.data.accountType, JSON.stringify(parsed.data.profile || {}), parsed.data.termsAccepted ? new Date().toISOString() : null],
    )
    // Claim pending organization invitations for this email (organizer teams).
    const invites = await query<{ organization_id: string; role: string; id: string }>("select id, organization_id, role from invitations where lower(email)=$1 and status='pending'", [email]).catch(() => [])
    for (const inv of invites) {
      await query('insert into organization_members (organization_id,user_id,role) values ($1,$2,$3) on conflict do nothing', [inv.organization_id, id, inv.role])
      await query("update invitations set status='accepted' where id=$1", [inv.id])
    }
    // Link event-level invitations that were issued to this email address.
    await query('update reviewer_invitations set reviewer_id=$1 where reviewer_id is null and lower(email)=$2', [id, email]).catch(() => {})
    await query('update event_invitations set user_id=$1 where user_id is null and lower(email)=$2', [id, email]).catch(() => {})
    await createSession(id)
    const user = await queryOne('select * from users where id=$1', [id])
    return NextResponse.json({ user: publicUser(user!), platformAdminGranted: isAdmin })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
