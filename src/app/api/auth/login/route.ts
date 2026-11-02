import { NextResponse } from 'next/server'
import { z } from 'zod'
import { queryOne, publicUser, type DbUser } from '@/lib/server/db'
import { verifyPassword, createSession, errorJson } from '@/lib/server/auth'

const Schema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) })

export async function POST(req: Request) {
  try {
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 })
    const user = await queryOne<DbUser>('select * from users where lower(email)=$1', [parsed.data.email.toLowerCase()])
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }
    await createSession(user.id)
    return NextResponse.json({ user: publicUser(user) })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
