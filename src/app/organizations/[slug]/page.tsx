import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { Suspense } from 'react'

export default function OrganizationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl py-12 text-sm text-muted-foreground">Loading...</div>}>
      <OrganizationDetailContent params={params} />
    </Suspense>
  )
}

async function OrganizationDetailContent({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) {
    redirect('/auth/setup')
  }

  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, description')
    .eq('slug', slug)
    .single()

  if (!org) {
    redirect('/organizations')
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/organizations')
  }

  const { data: conferences } = await supabase
    .from('conferences')
    .select('id, title, slug, status, visibility')
    .eq('organization_id', org.id)

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
          <p className="text-sm text-muted-foreground">{org.slug} · Role: {membership.role}</p>
        </div>
        {(membership.role === 'owner' || membership.role === 'admin') && (
          <Button asChild>
            <Link href={`/organizations/${org.slug}/conferences/new`}>Create conference</Link>
          </Button>
        )}
      </header>
      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-medium">Conferences</h2>
        </div>
        <div className="divide-y">
          {conferences && conferences.length > 0 ? (
            conferences.map((c: { id: string; title: string; slug: string; status: string; visibility: string }) => (
              <div key={c.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-muted-foreground">{c.slug} · {c.status} · {c.visibility}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/organizations/${org.slug}/conferences/${c.slug}`}>View</Link>
                </Button>
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No conferences yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

