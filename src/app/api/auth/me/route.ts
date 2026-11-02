import { NextResponse } from 'next/server'
import { getCurrentUser, errorJson } from '@/lib/server/auth'
import { publicUser, query } from '@/lib/server/db'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ user: null })
    const unread = await query<{ n: string }>('select count(*)::text as n from notifications where user_id=$1 and is_read=false', [user.id]).catch(() => [{ n: '0' }])
    return NextResponse.json({ user: publicUser(user), unreadNotifications: Number(unread[0]?.n || 0) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

const PROFILE_KEYS = ['position', 'contact', 'researchInterests', 'expertise', 'qualifications', 'orcid', 'academicProfileUrl', 'academicInfo', 'attendeeInfo'] as const
const AVATAR_MAX = 400_000

export async function PATCH(req: Request) {
  try {
    const { requireUser, accountTypeOf } = await import('@/lib/server/auth')
    const { parseProfile } = await import('@/lib/server/db')
    const user = await requireUser()
    const body = (await req.json().catch(() => ({}))) as { displayName?: string; affiliation?: string; bio?: string; accountType?: string; profile?: Record<string, unknown> }
    // The primary account type is fixed at registration: permissions must
    // never be obtainable by editing a profile payload.
    if (body.accountType && body.accountType !== accountTypeOf(user)) {
      return NextResponse.json({ error: 'Your primary account type cannot be changed from Profile. Register a separate account for a different role.' }, { status: 400 })
    }
    const profile = { ...parseProfile(user.profile) }
    if (body.profile && typeof body.profile === 'object') {
      for (const key of PROFILE_KEYS) {
        if (!(key in body.profile)) continue
        const val = body.profile[key]
        if (Array.isArray(val)) profile[key] = val.map((v) => String(v).slice(0, 120)).slice(0, 20)
        else if (typeof val === 'string') profile[key] = val.slice(0, 2000)
      }
      if ('avatarUrl' in body.profile) {
        const avatar = body.profile.avatarUrl
        if (typeof avatar === 'string' && avatar.length <= AVATAR_MAX && (/^data:image\/(png|jpe?g|webp);base64,/.test(avatar) || /^https:\/\//.test(avatar))) {
          profile.avatarUrl = avatar
        } else if (avatar === '' || avatar === null) {
          delete profile.avatarUrl
        } else {
          return NextResponse.json({ error: 'Profile picture must be an uploaded image (max ~300 KB after resizing).' }, { status: 400 })
        }
      }
    }
    await query('update users set display_name=$1, affiliation=$2, bio=$3, profile=$4, updated_at=now() where id=$5', [
      (body.displayName || user.display_name).slice(0, 120), body.affiliation?.slice(0, 200) || null, body.bio?.slice(0, 2000) || null, JSON.stringify(profile), user.id,
    ])
    const updated = await queryOneSafe(user.id)
    return NextResponse.json({ user: updated })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

async function queryOneSafe(id: string) {
  const { queryOne, publicUser: pub } = await import('@/lib/server/db')
  const row = await queryOne('select * from users where id=$1', [id])
  return pub(row!)
}
