'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { WebsiteEditor } from '@/components/website/website-editor'
import { useDemoData, useHydrated } from '@/lib/demo/storage'
import { canManageOrganization } from '@/lib/demo/permissions'

function ConferenceWebsitePageInner() {
  const params = useParams<{ slug: string; confSlug: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()

  const org = data.organizations.find((o) => o.slug === params.slug) ?? null
  const conf = org ? data.conferences.find((c) => c.organizationId === org.id && c.slug === params.confSlug) ?? null : null

  if (!hydrated) return <p className="text-sm text-[#64748B]">Loading website editor...</p>

  if (!org || !conf) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Conference not found</h1>
        <p className="text-sm text-[#64748B]">This conference does not exist in this browser&apos;s demo data.</p>
        <div><Button asChild><Link href="/conferences">Back to conferences</Link></Button></div>
      </div>
    )
  }

  if (!canManageOrganization(data, org.id)) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Organizer access required</h1>
        <p className="text-sm text-[#64748B]">Only the organizers managing {conf.title} (Organizer account with an owner/admin role in {org.name}) can build or edit its website.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={`/events/${conf.slug}`}>View the public event page</Link></Button>
          <Button asChild variant="outline"><Link href="/submissions">My submissions</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#64748B]"><Link href={`/organizations/${org.slug}`} className="underline underline-offset-4">{org.name}</Link> · <Link href={`/organizations/${org.slug}/conferences/${conf.slug}`} className="underline underline-offset-4">{conf.title}</Link></p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111827]">Website builder</h1>
          <p className="text-sm text-[#64748B]">Generate, edit, and publish the public site at /events/{conf.slug}. Draft edits never change the published site until you re-publish.</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={`/organizations/${org.slug}/conferences/${conf.slug}`}>Back to conference</Link></Button>
      </header>
      <WebsiteEditor key={conf.id} conference={conf} organization={org} />
    </div>
  )
}

export default function ConferenceWebsitePage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading website editor...</p>}>
      <ConferenceWebsitePageInner />
    </Suspense>
  )
}
