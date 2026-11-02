'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { invalidateProfileCache } from '@/lib/demo/profile'
import { ACCOUNT_TYPE_META, type AccountType } from '@/lib/demo/types'

type Me = { user: { id: string; email: string; displayName: string; platformRole: string; accountType?: AccountType } | null; unreadNotifications: number }

const NAV_BY_TYPE: Record<AccountType, { name: string; href: string }[]> = {
  organizer: [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Organizations', href: '/organizations' },
    { name: 'Conferences', href: '/conferences' },
    { name: 'Create Conference', href: '/conferences/new' },
    { name: 'Submissions', href: '/submissions' },
    { name: 'Events directory', href: '/events' },
    { name: 'Notifications', href: '/notifications' },
    { name: 'Profile', href: '/profile' },
  ],
  researcher: [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Events directory', href: '/events' },
    { name: 'Conferences', href: '/conferences' },
    { name: 'My submissions', href: '/submissions' },
    { name: 'Notifications', href: '/notifications' },
    { name: 'Profile', href: '/profile' },
  ],
  reviewer: [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Review workspace', href: '/review' },
    { name: 'Events directory', href: '/events' },
    { name: 'Assigned papers', href: '/submissions' },
    { name: 'Notifications', href: '/notifications' },
    { name: 'Profile', href: '/profile' },
  ],
  visitor: [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Events directory', href: '/events' },
    { name: 'Notifications', href: '/notifications' },
    { name: 'Profile', href: '/profile' },
  ],
}

function Shell({ children, pathname }: { children: React.ReactNode; pathname: string | null }) {
  const router = useRouter()
  const [me, setMe] = useState<Me>({ user: null, unreadNotifications: 0 })
  const [checked, setChecked] = useState(false)

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      const data = (await res.json()) as Me
      setMe(data)
    } catch {
      setMe({ user: null, unreadNotifications: 0 })
    } finally {
      setChecked(true)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server (external system) on mount
  useEffect(() => { void loadMe() }, [loadMe, pathname])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    invalidateProfileCache()
    setMe({ user: null, unreadNotifications: 0 })
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname?.startsWith(`${href}/`))
  const baseNav = me.user ? NAV_BY_TYPE[me.user.accountType || 'researcher'] : NAV_BY_TYPE.researcher
  const nav = me.user?.platformRole === 'platform_admin' ? [...baseNav, { name: 'Platform Admin', href: '/admin' }] : baseNav

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-background lg:flex">
          <Link href="/" className="flex h-14 items-center border-b px-4 text-base font-semibold tracking-tight text-foreground">Confexa</Link>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2" aria-label="Main navigation">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                {item.name}
                {item.href === '/notifications' && me.unreadNotifications > 0 ? (
                  <span className="rounded-sm bg-foreground px-1.5 py-0.5 text-[11px] text-background">{me.unreadNotifications}</span>
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="border-t px-3 py-3">
            {me.user ? (
              <div className="flex flex-col gap-2">
                <div>
                  <p className="truncate text-sm font-medium text-foreground">{me.user.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{me.user.email}</p>
                </div>
                <span className="w-fit text-xs text-muted-foreground">{ACCOUNT_TYPE_META[me.user.accountType || 'researcher'].label}</span>
                <Button variant="outline" size="sm" className="h-8" onClick={signOut}>Sign out</Button>
              </div>
            ) : checked ? (
              <div className="flex flex-col gap-2">
                <Button asChild size="sm" className="h-8"><Link href="/login">Sign in</Link></Button>
                <Button asChild variant="outline" size="sm" className="h-8"><Link href="/register">Create account</Link></Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Loading</p>
            )}
          </div>
        </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-50 border-b bg-background">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="text-base font-semibold tracking-tight text-foreground lg:hidden">Confexa</Link>
            <p className="hidden text-sm text-muted-foreground lg:block">
              {me.user ? `${me.user.displayName} · ${ACCOUNT_TYPE_META[me.user.accountType || 'researcher'].label}` : 'Conference management platform'}
            </p>
            <div className="flex items-center gap-2">
              {me.unreadNotifications > 0 ? (
                <Link href="/notifications" className="rounded-sm border px-2 py-0.5 text-xs text-foreground">{me.unreadNotifications} unread</Link>
              ) : null}
              {me.user?.accountType === 'organizer' ? (
                <Button asChild size="sm" className="h-8"><Link href="/conferences/new">New conference</Link></Button>
              ) : null}
              <span className="lg:hidden">
                {me.user ? (
                  <Button variant="outline" size="sm" className="h-8" onClick={signOut}>Sign out</Button>
                ) : (
                  <Button asChild variant="outline" size="sm" className="h-8"><Link href="/login">Sign in</Link></Button>
                )}
              </span>
            </div>
          </div>
          <nav className="flex gap-3 overflow-x-auto border-t px-4 py-1.5 lg:hidden" aria-label="Mobile navigation">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap text-sm ${isActive(item.href) ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
            <span>© 2026 Confexa</span>
            <span className="text-xs">PostgreSQL-backed with server-side authorization.</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

function AppShellGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Public conference sites and auth pages render without the app sidebar.
  if (pathname?.startsWith('/events/') || pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/reset-password') {
    return <>{children}</>
  }
  return <Shell pathname={pathname}>{children}</Shell>
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Shell pathname={null}>{children}</Shell>}>
      <AppShellGate>{children}</AppShellGate>
    </Suspense>
  )
}
