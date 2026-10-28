import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { Suspense } from 'react'

export default function OrganizationsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl py-12 text-sm text-muted-foreground">Loading...</div>}>
      <OrganizationsContent />
    </Suspense>
  )
}

async function OrganizationsContent() {
  if (!isSupabaseConfigured()) {
    redirect('/auth/setup')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(id, name, slug)')
    .eq('user_id', user.id)

  type MembershipRow = {
    organization_id: string
    role: string
    organizations: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null
  }

  const membershipRows = (memberships ?? []) as MembershipRow[]

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">Your organizations and roles.</p>
        </div>
        <Button asChild>
          <Link href="/organizations/new">Create organization</Link>
        </Button>
      </header>
      <div className="rounded-lg border">
        <div className="divide-y">
          {membershipRows.length > 0 ? (
            membershipRows.map((m) => {
              const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
              if (!org) return null
              return (
                <div key={m.organization_id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-sm text-muted-foreground">{org.slug} · {m.role}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/organizations/${org.slug}`}>View</Link>
                  </Button>
                </div>
              )
            })
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No organizations yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

