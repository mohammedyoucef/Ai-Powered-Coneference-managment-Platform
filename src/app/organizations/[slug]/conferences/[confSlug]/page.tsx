import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { Suspense } from 'react'

export default function ConferenceDetailPage({
  params,
}: {
  params: Promise<{ slug: string; confSlug: string }>
}) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl py-12 text-sm text-muted-foreground">Loading...</div>}>
      <ConferenceDetailContent params={params} />
    </Suspense>
  )
}

async function ConferenceDetailContent({
  params,
}: {
  params: Promise<{ slug: string; confSlug: string }>
}) {
  if (!isSupabaseConfigured()) {
    redirect('/auth/setup')
  }

  const { slug, confSlug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug')
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

  const { data: conf } = await supabase
    .from('conferences')
    .select('*')
    .eq('organization_id', org.id)
    .eq('slug', confSlug)
    .single()

  if (!conf) {
    redirect(`/organizations/${org.slug}`)
  }

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{conf.title}</h1>
          <p className="text-sm text-muted-foreground">
            {org.name} · {conf.slug} · {conf.status} · {conf.visibility}
          </p>
        </div>
        {(membership.role === 'owner' || membership.role === 'admin') && (
          <Button asChild variant="outline">
            <Link href={`/organizations/${org.slug}/conferences/${conf.slug}/edit`}>Edit</Link>
          </Button>
        )}
      </header>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {conf.description || 'No description.'}
        </p>
      </div>
      <div className="text-sm text-muted-foreground">
        This is a draft/private conference view restricted to authorized organization members.
      </div>
    </div>
  )
}
