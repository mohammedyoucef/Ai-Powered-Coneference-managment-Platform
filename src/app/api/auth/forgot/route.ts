import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/server/db'
import { createPasswordReset, errorJson } from '@/lib/server/auth'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string }
    const email = (body.email || '').trim().toLowerCase()
    const user = email ? await queryOne<{ id: string }>('select id from users where lower(email)=$1', [email]) : null
    let devResetPath: string | undefined
    if (user) {
      const token = await createPasswordReset(user.id)
      // No email provider is configured in this deployment by default. Only in
      // non-production do we surface the link locally, explicitly labeled —
      // in production, configure SMTP_HOST and a mail sender to deliver it.
      if (!process.env.SMTP_HOST && process.env.NODE_ENV !== 'production') {
        devResetPath = `/reset-password?token=${token}`
      }
    }
    return NextResponse.json({
      message: 'If an account exists for that email, a password reset is available.',
      emailConfigured: Boolean(process.env.SMTP_HOST),
      emailStatus: process.env.SMTP_HOST ? 'queued' : 'not_configured',
      devResetPath,
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
