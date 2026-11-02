'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useDemoData, useHydrated } from '@/lib/demo/storage'
import { isOrgMember } from '@/lib/demo/permissions'

export default function OrganizationsPage() {
  const data = useDemoData()
  const hydrated = useHydrated()
  // The dataset also contains public-event organizations (for event pages);
  // "My Organizations" is only the ones the user actually belongs to.
  const orgs = data.organizations.filter((o) => isOrgMember(data, o.id))
  const countFor = (orgId: string) => data.conferences.filter((c) => c.organizationId === orgId).length

  if (hydrated && data.currentUser && data.currentUser.accountType !== 'organizer' && data.currentUser.platformRole !== 'platform_admin') {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-gray-900">Organizer access required</h1>
        <p className="text-sm text-gray-600">Organizations and conferences are managed by Organizer accounts. Your {data.currentUser.accountType} account participates in events instead.</p>
        <div><Button asChild variant="outline"><Link href="/events">Browse events</Link></Button></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">My Organizations</h1>
          <p className="text-sm text-gray-600">Organizations you manage</p>
        </div>
        <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/organizations/new">Create organization</Link></Button>
      </header>

      {!hydrated ? <p className="text-sm text-gray-600">Loading...</p> : orgs.length === 0 ? (
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-gray-900">No organizations yet</h2>
          <p className="text-sm text-gray-600">Create your first organization to start hosting conferences.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/organizations/new">Create Organization</Link></Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {orgs.map((o) => (
            <div key={o.id} className="flex flex-col gap-2 rounded-lg border p-6">
              <h2 className="font-medium text-[#111827]">{o.name}</h2>
              {o.description ? <p className="text-sm text-[#64748B]">{o.description}</p> : null}
              <p className="text-xs text-[#64748B]">{o.type ?? 'Organization'} · {countFor(o.id)} conference(s) · /organizations/{o.slug}</p>
              <div className="mt-2 flex gap-2">
                <Button asChild variant="outline" size="sm"><Link href={`/organizations/${o.slug}`}>View & edit</Link></Button>
                <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/organizations/${o.slug}/conferences/new`}>New conference</Link></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
