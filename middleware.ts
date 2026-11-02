import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Optimistic route protection only (Next.js Proxy/Middleware):
 * redirects signed-out visitors to /login. Real authorization is enforced
 * server-side in every API route against PostgreSQL sessions/memberships —
 * never rely on this check for security.
 */
const PROTECTED = ['/dashboard', '/organizations', '/conferences', '/submissions', '/review', '/profile', '/notifications', '/admin', '/account']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (!needsAuth) return NextResponse.next()
  if (pathname.startsWith('/events/')) return NextResponse.next()
  const hasSession = Boolean(req.cookies.get('confexa_session')?.value)
  if (hasSession) return NextResponse.next()
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
