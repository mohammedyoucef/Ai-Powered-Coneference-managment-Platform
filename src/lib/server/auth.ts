import crypto from 'crypto'
import { cookies } from 'next/headers'
import { newId, query, queryOne, type DbUser } from './db'

export const SESSION_COOKIE = 'confexa_session'
const SESSION_DAYS = 7

/* Passwords: scrypt with per-user salt (node:crypto, no extra dependency). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const candidate = crypto.scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
  await query('insert into sessions (id,token_hash,user_id,expires_at) values ($1,$2,$3,$4)', [newId('ses'), hashToken(token), userId, expires.toISOString()])
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure only when the deployment is actually served over HTTPS, so a
    // local `next start` over http://localhost still works.
    secure: process.env.NODE_ENV === 'production' && (process.env.NEXT_PUBLIC_APP_URL || '').startsWith('https'),
    path: '/',
    expires,
  })
  return token
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await query('delete from sessions where token_hash=$1', [hashToken(token)]).catch(() => {})
  jar.delete(SESSION_COOKIE)
}

export async function getCurrentUser(): Promise<DbUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  const row = await queryOne<DbUser & { expires_at: string }>(
    `select u.* from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at > now() limit 1`,
    [hashToken(token)],
  ).catch(() => null)
  return row
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requireUser(): Promise<DbUser> {
  const user = await getCurrentUser()
  if (!user) throw new HttpError(401, 'Sign in required.')
  return user
}

export async function requirePlatformAdmin(): Promise<DbUser> {
  const user = await requireUser()
  if (user.platform_role !== 'platform_admin') throw new HttpError(403, 'Platform administrator access required.')
  return user
}

export function isPlatformAdmin(user: DbUser): boolean {
  return user.platform_role === 'platform_admin'
}

export type AccountType = 'researcher' | 'reviewer' | 'organizer' | 'visitor'

export function accountTypeOf(user: DbUser): AccountType {
  return user.account_type === 'reviewer' || user.account_type === 'organizer' || user.account_type === 'visitor'
    ? user.account_type
    : 'researcher'
}

/**
 * Primary-type gate, enforced on the server. Platform-admin status does NOT
 * substitute for a primary type on role-specific actions (submitting papers,
 * reviewing, attending): the first registered account is a platform admin and
 * must still act through its chosen primary type.
 */
export function requireAccountType(user: DbUser, allowed: AccountType[], message?: string): void {
  const type = accountTypeOf(user)
  if (!allowed.includes(type)) {
    throw new HttpError(403, message || `This action is for ${allowed.join(' / ')} accounts. Your account type is ${type}. Register a ${allowed[0]} account to do this.`)
  }
}

/* ---------- Organization / conference authorization (server-side) ---------- */

export async function orgRole(user: DbUser, orgId: string): Promise<'owner' | 'admin' | 'member' | null> {
  if (isPlatformAdmin(user)) return 'owner'
  const row = await queryOne<{ role: string }>('select role from organization_members where organization_id=$1 and user_id=$2', [orgId, user.id])
  return (row?.role as 'owner' | 'admin' | 'member') ?? null
}

export async function requireOrgMember(user: DbUser, orgId: string) {
  const role = await orgRole(user, orgId)
  if (!role) throw new HttpError(403, 'You are not a member of this organization.')
  return role
}

export async function requireOrgManager(user: DbUser, orgId: string) {
  const role = await orgRole(user, orgId)
  if (!role || (role !== 'owner' && role !== 'admin')) throw new HttpError(403, 'Organization owner or admin access required.')
  return role
}

export type DbConference = {
  id: string
  organization_id: string
  created_by: string | null
  title: string
  slug: string
  lifecycle: string
  review_method: string
  submission_deadline: string | null
  [key: string]: unknown
}

export async function getConferenceRow(confId: string): Promise<DbConference | null> {
  return queryOne<DbConference>('select * from conferences where id=$1', [confId])
}

export async function requireConferenceManager(user: DbUser, confId: string): Promise<DbConference> {
  const conf = await getConferenceRow(confId)
  if (!conf) throw new HttpError(404, 'Conference not found.')
  await requireOrgManager(user, conf.organization_id)
  return conf
}

/** Can the user see this conference at all? Drafts and private events are restricted. */
export async function canAccessConference(user: DbUser | null, conf: DbConference): Promise<boolean> {
  const isPublicPublished = conf.lifecycle !== 'draft' && (conf as Record<string, unknown>).visibility !== 'private'
  if (isPublicPublished) return true
  if (!user) return false
  if (isPlatformAdmin(user)) return true
  if (await orgRole(user, conf.organization_id)) return true
  // Event-level participation grants visibility of private/draft-adjacent events.
  const confId = conf.id
  const grants = await queryOne(
    `select 1 as ok where
       exists (select 1 from submissions s where s.conference_id=$1 and s.author_id=$2)
       or exists (select 1 from visitor_applications v where v.conference_id=$1 and v.visitor_id=$2)
       or exists (select 1 from reviewer_applications ra where ra.conference_id=$1 and ra.reviewer_id=$2)
       or exists (select 1 from reviewer_invitations ri where ri.conference_id=$1 and (ri.reviewer_id=$2 or lower(ri.email)=lower($3)))
       or exists (select 1 from event_invitations ei where ei.conference_id=$1 and ei.status='pending' and (ei.user_id=$2 or lower(ei.email)=lower($3)))`,
    [confId, user.id, user.email],
  ).catch(() => null)
  return Boolean(grants)
}

export async function createPasswordReset(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000)
  await query('insert into password_resets (id,token_hash,user_id,expires_at) values ($1,$2,$3,$4)', [newId('rst'), hashToken(token), userId, expires.toISOString()])
  return token
}

export async function consumePasswordReset(token: string, newPassword: string): Promise<boolean> {
  const row = await queryOne<{ id: string; user_id: string }>(
    'select id,user_id from password_resets where token_hash=$1 and used_at is null and expires_at > now() limit 1',
    [hashToken(token)],
  )
  if (!row) return false
  await query('update users set password_hash=$1, updated_at=now() where id=$2', [hashPassword(newPassword), row.user_id])
  await query('update password_resets set used_at=now() where id=$1', [row.id])
  await query('delete from sessions where user_id=$1', [row.user_id])
  return true
}

export function errorJson(err: unknown): { error: string; status: number } {
  if (err instanceof HttpError) return { error: err.message, status: err.status }
  const message = err instanceof Error ? err.message : ''
  if (message.includes('DATABASE_URL')) return { error: message, status: 503 }
  console.error('[confexa]', err)
  return { error: 'Unexpected server error. Check server logs.', status: 500 }
}
