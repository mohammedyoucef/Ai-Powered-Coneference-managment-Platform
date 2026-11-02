import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/server/auth'

export async function POST() {
  await destroySession().catch(() => {})
  return NextResponse.json({ ok: true })
}
