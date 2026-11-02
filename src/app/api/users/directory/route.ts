import { NextResponse } from 'next/server'
import { requireUser, errorJson } from '@/lib/server/auth'
import { query, publicUser } from '@/lib/server/db'

/**
 * Registered-user directory for organizers.
 * Confexa's platform admin page (/api/admin) is platform-admin only; this
 * directory is the organizer-facing equivalent: it exists so an organizer
 * can find and invite reviewers/researchers for THEIR events. It never
 * exposes platform roles or any admin capability.
 */
export async function GET() {
  try {
    const user = await requireUser()
    const managesOrg = await query('select organization_id from organization_members where user_id=$1 limit 1', [user.id]).catch(() => [])
    const allowed = user.platform_role === 'platform_admin' || user.account_type === 'organizer' || managesOrg.length > 0
    if (!allowed) {
      return NextResponse.json({ error: 'The user directory is available to organizers so they can invite reviewers to their events.' }, { status: 403 })
    }
    const rows = await query('select * from users order by display_name limit 300')
    return NextResponse.json({
      users: rows.map((r) => {
        const u = publicUser(r)
        return {
          id: u.id,
          displayName: u.displayName,
          email: u.email,
          accountType: u.accountType,
          affiliation: u.affiliation,
          avatarUrl: typeof u.profile?.avatarUrl === 'string' ? u.profile.avatarUrl : undefined,
          expertise: Array.isArray(u.profile?.expertise) ? u.profile.expertise : [],
          researchInterests: Array.isArray(u.profile?.researchInterests) ? u.profile.researchInterests : [],
        }
      }),
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
