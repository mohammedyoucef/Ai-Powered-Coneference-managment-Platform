import Link from "next/link"

const navItems = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Conferences", href: "/conferences" },
  { name: "Create Conference", href: "/conferences/new" },
  { name: "Paper Submissions", href: "/submissions" },
  { name: "AI Review", href: "/review" },
  { name: "Settings", href: "/settings" },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-tight">Confexa</span>
            </Link>
            <nav className="hidden items-center gap-4 md:flex" aria-label="Main navigation">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Workspace</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
          © 2026 Confexa. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
