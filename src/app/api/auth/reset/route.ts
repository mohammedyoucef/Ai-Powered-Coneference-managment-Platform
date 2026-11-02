import { NextResponse } from 'next/server'
import { z } from 'zod'
import { consumePasswordReset, errorJson } from '@/lib/server/auth'

const Schema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(200).regex(/[a-zA-Z]/).regex(/[0-9]/),
})

export async function POST(req: Request) {
  try {
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Password must be 8+ characters with a letter and a number.' }, { status: 400 })
    const ok = await consumePasswordReset(parsed.data.token, parsed.data.password)
    if (!ok) return NextResponse.json({ error: 'This reset link is invalid or expired. Request a new one.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
