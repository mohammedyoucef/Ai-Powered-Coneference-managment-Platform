'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { invalidateProfileCache } from '@/lib/demo/profile'
import { ACCOUNT_TYPE_META, type AccountType } from '@/lib/demo/types'
import { Menu, X, Bell, LogOut, Settings } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'

type Me = { user: { id: string; email: string; displayName: string; platformRole: string; accountType?: AccountType; profile?: { avatarUrl?: string } } | null; unreadNotifications: number }

const PUBLIC_PATHS = ['/events/', '/login', '/register', '/forgot-password', '/reset-password']

function SiteHeader({ 
  user, 
  unreadNotifications, 
  onSignOut 
}: { 
  user: Me['user']
  unreadNotifications: number
  onSignOut: () => void
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const router = useRouter()

  const getNavItems = () => {
    if (!user) {
      return [
        { name: 'Home', href: '/' },
        { name: 'Events', href: '/events' },
      ]
    }
    
    const baseItems = [
      { name: 'Dashboard', href: '/dashboard' },
      { name: 'Events', href: '/events' },
    ]
    
    if (user.accountType === 'organizer') {
      // Keep only dashboard and events in header for organizers
    } else if (user.accountType === 'researcher') {
      baseItems.push({ name: 'My Submissions', href: '/submissions' })
    } else if (user.accountType === 'reviewer') {
      baseItems.push({ name: 'Review', href: '/review' })
    } else if (user.accountType === 'visitor') {
      baseItems.push({ name: 'My Applications', href: '/submissions' })
    }
    
    if (user.platformRole === 'platform_admin') {
      baseItems.push({ name: 'Platform Admin', href: '/admin' })
    }
    
    return baseItems
  }

  const navItems = getNavItems()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4F46E5]">
              <span className="text-sm font-bold text-white">C</span>
            </div>
            <span className="text-xl font-semibold text-gray-900">Confexa</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-gray-700 transition-colors hover:text-[#4F46E5]"
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              {/* Notifications */}
              <Link
                href="/notifications"
                className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#4F46E5] text-xs text-white">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </Link>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
                >
                  <Avatar name={user.displayName} url={user.profile?.avatarUrl} size={32} />
                  <div className="hidden sm:flex flex-col items-start">
                    <span className="font-medium text-gray-900">{user.displayName}</span>
                    <span className="text-xs text-gray-500">{ACCOUNT_TYPE_META[user.accountType || 'researcher'].label}</span>
                  </div>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-white shadow-lg">
                    <div className="p-3 border-b">
                      <p className="font-medium text-gray-900">{user.displayName}</p>
                      <p className="text-sm text-gray-500 truncate">{user.email}</p>
                    </div>
                    <div className="p-1">
                      <Link
                        href="/profile"
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Settings className="h-4 w-4" />
                        Profile & Settings
                      </Link>
                      {user.accountType === 'organizer' && (
                        <>
                          <Link
                            href="/organizations"
                            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => setUserMenuOpen(false)}
                          >
                            My Organizations
                          </Link>
                          <Link
                            href="/conferences"
                            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => setUserMenuOpen(false)}
                          >
                            My Conferences
                          </Link>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          onSignOut()
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]">
                <Link href="/register">Get Started</Link>
              </Button>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-white">
          <nav className="flex flex-col px-4 py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-2 text-sm font-medium text-gray-700 hover:text-[#4F46E5]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            {user && (
              <>
                <Link
                  href="/profile"
                  className="py-2 text-sm font-medium text-gray-700 hover:text-[#4F46E5]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Profile & Settings
                </Link>
                {user.accountType === 'organizer' && (
                  <>
                    <Link
                      href="/organizations"
                      className="py-2 text-sm font-medium text-gray-700 hover:text-[#4F46E5]"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      My Organizations
                    </Link>
                    <Link
                      href="/conferences"
                      className="py-2 text-sm font-medium text-gray-700 hover:text-[#4F46E5]"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      My Conferences
                    </Link>
                  </>
                )}
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4F46E5]">
                <span className="text-sm font-bold text-white">C</span>
              </div>
              <span className="text-xl font-semibold text-gray-900">Confexa</span>
            </div>
            <p className="text-sm text-gray-600 max-w-md">
              The complete platform for managing academic conferences, from submission to publication.
            </p>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Platform</h3>
            <ul className="space-y-2">
              <li><Link href="/events" className="text-sm text-gray-600 hover:text-[#4F46E5]">Browse Events</Link></li>
              <li><Link href="/dashboard" className="text-sm text-gray-600 hover:text-[#4F46E5]">Dashboard</Link></li>
              <li><Link href="/register" className="text-sm text-gray-600 hover:text-[#4F46E5]">Get Started</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Support</h3>
            <ul className="space-y-2">
              <li><Link href="/profile" className="text-sm text-gray-600 hover:text-[#4F46E5]">Profile</Link></li>
              <li><Link href="/notifications" className="text-sm text-gray-600 hover:text-[#4F46E5]">Notifications</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t">
          <p className="text-center text-sm text-gray-600">
            © {new Date().getFullYear()} Confexa. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

function SiteLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
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

  useEffect(() => {
    void loadMe()
  }, [loadMe, pathname])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    invalidateProfileCache()
    setMe({ user: null, unreadNotifications: 0 })
    router.push('/login')
    router.refresh()
  }

  const isPublicPage = pathname ? PUBLIC_PATHS.some(path => 
    path === '/' ? pathname === '/' : pathname.startsWith(path)
  ) || pathname === '/' : false

  // For public pages like login/register/home, show minimal layout or full layout based on needs
  if (pathname?.startsWith('/events/') && pathname.split('/').length <= 3) {
    // Public event pages - no header/footer from app shell
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader 
        user={me.user} 
        unreadNotifications={me.unreadNotifications} 
        onSignOut={signOut} 
      />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

export function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col">
        <header className="h-16 border-b bg-white"></header>
        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
        </main>
        <footer className="h-32 border-t bg-gray-50"></footer>
      </div>
    }>
      <SiteLayoutContent>{children}</SiteLayoutContent>
    </Suspense>
  )
}
