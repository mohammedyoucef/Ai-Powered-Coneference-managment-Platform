import { Pool, type QueryResultRow } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * PostgreSQL data layer (server only — never import from client components).
 * Connection: DATABASE_URL, e.g. postgres://user:pass@host:5432/confexa
 * Local dev: `docker compose up -d db` (see docker-compose.yml) or any
 * Postgres 14+ / Supabase Postgres connection string.
 */

declare global {
  var __confexaPool: Pool | undefined
  var __confexaSchemaReady: Promise<void> | undefined
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. Copy .env.example to .env.local, start PostgreSQL (docker compose up -d db), and run npm run db:migrate.')
  }
  if (!globalThis.__confexaPool) {
    globalThis.__confexaPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  }
  return globalThis.__confexaPool
}

/** Apply db/migrations/*.sql in order once per process (all idempotent DDL). */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__confexaSchemaReady) {
    globalThis.__confexaSchemaReady = (async () => {
      const dir = path.join(process.cwd(), 'db', 'migrations')
      const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      for (const file of files) {
        await getPool().query(readFileSync(path.join(dir, file), 'utf8'))
      }
    })().catch((err) => {
      globalThis.__confexaSchemaReady = undefined
      throw err
    })
  }
  return globalThis.__confexaSchemaReady
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema()
  const res = await getPool().query<T>(text, params as never[])
  return res.rows
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/** Run related writes in one transaction so partial states cannot persist. */
export async function withTransaction<T>(fn: (q: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  await ensureSchema()
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const result = await fn(async <R extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) => (await client.query<R>(text, params as never[])).rows)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled'
}

export async function uniqueOrgSlug(base: string): Promise<string> {
  const root = slugify(base)
  let candidate = root
  let n = 2
  while (await queryOne('select id from organizations where slug=$1', [candidate])) {
    candidate = `${root}-${n}`
    n += 1
  }
  return candidate
}

export async function uniqueConferenceSlug(orgId: string, base: string): Promise<string> {
  const root = slugify(base)
  let candidate = root
  let n = 2
  while (await queryOne('select id from conferences where organization_id=$1 and slug=$2', [orgId, candidate])) {
    candidate = `${root}-${n}`
    n += 1
  }
  return candidate
}

export type AccountType = 'researcher' | 'reviewer' | 'organizer' | 'visitor'

export type DbUser = {
  id: string
  email: string
  password_hash: string
  display_name: string
  affiliation: string | null
  bio: string | null
  profile: Record<string, unknown> | string | null
  terms_accepted_at: string | null
  platform_role: 'user' | 'platform_admin'
  account_type: AccountType | null
  created_at: string
}

export function normalizeAccountType(v: unknown): AccountType {
  return v === 'reviewer' || v === 'organizer' || v === 'visitor' ? v : 'researcher'
}

export function parseProfile(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object') return v as Record<string, unknown>
  if (typeof v === 'string') { try { return JSON.parse(v) as Record<string, unknown> } catch { return {} } }
  return {}
}

/** Required profile fields per account type (onboarding completeness). */
export function profileCompletedFor(accountType: AccountType, affiliation: unknown, profile: Record<string, unknown>): boolean {
  const aff = typeof affiliation === 'string' && affiliation.trim().length > 0
  const has = (k: string) => {
    const val = profile[k]
    return Array.isArray(val) ? val.length > 0 : typeof val === 'string' && val.trim().length > 0
  }
  switch (accountType) {
    case 'organizer': return aff && has('position')
    case 'reviewer': return aff && (has('expertise') || has('researchInterests'))
    case 'researcher': return aff
    case 'visitor': return true // name + email are enough; affiliation optional
  }
}

export function publicUser(u: DbUser | Record<string, unknown>) {
  const row = u as Record<string, unknown>
  const accountType = normalizeAccountType(row.account_type ?? row.accountType)
  const profile = parseProfile(row.profile)
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name ?? row.displayName ?? ''),
    affiliation: (row.affiliation as string) || undefined,
    bio: (row.bio as string) || undefined,
    profile,
    profileCompleted: profileCompletedFor(accountType, row.affiliation, profile),
    termsAcceptedAt: row.terms_accepted_at ? new Date(row.terms_accepted_at as string).toISOString() : undefined,
    platformRole: row.platform_role === 'platform_admin' ? ('platform_admin' as const) : ('user' as const),
    accountType,
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : new Date().toISOString(),
  }
}

export async function notify(userId: string, type: string, title: string, body?: string, link?: string): Promise<void> {
  // Email provider is not configured by default: notifications are in-app
  // only and honestly labeled emailStatus=not_configured (never "sent").
  await query(
    'insert into notifications (id,user_id,type,title,body,link,email_status) values ($1,$2,$3,$4,$5,$6,$7)',
    [newId('ntf'), userId, type, title, body ?? null, link ?? null, process.env.SMTP_HOST ? 'queued' : 'not_configured'],
  ).catch(() => {})
}

export async function logActivity(userId: string | null, orgId: string | null, confId: string | null, action: string, details?: string): Promise<void> {
  await query('insert into activity_log (id,user_id,organization_id,conference_id,action,details) values ($1,$2,$3,$4,$5,$6)', [
    newId('act'), userId, orgId, confId, action, details ?? null,
  ]).catch(() => {})
}

export function dbErrorResponse(err: unknown): { error: string; status: number } {
  const message = err instanceof Error ? err.message : 'Unexpected server error'
  if (message.includes('DATABASE_URL')) return { error: message, status: 503 }
  console.error('[confexa]', err)
  return { error: 'Unexpected server error. Check server logs.', status: 500 }
}
