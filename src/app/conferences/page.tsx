'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { api, refreshData, useDemoData, useHydrated } from '@/lib/demo/storage'
import { canManageOrganization } from '@/lib/demo/permissions'

export default function ConferencesPage() {
  const data = useDemoData()
  const hydrated = useHydrated()
  const confs = data.conferences
  const orgs = data.organizations
  const currentUser = data.currentUser
  const orgById = new Map(orgs.map((o) => [o.id, o]))
  const accountType = currentUser?.accountType || 'researcher'

  // Management is organizer-only: Organizer account + owner/admin role in
  // the organization. Researchers/reviewers/visitors and plain org members
  // never see Manage / Website editor controls here.
  const managedConfs = confs.filter((c) => canManageOrganization(data, c.organizationId))
  const isOrganizerSide = accountType === 'organizer' || currentUser?.platformRole === 'platform_admin'

  if (isOrganizerSide) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">My Conferences</h1>
            <p className="text-sm text-gray-600">Conferences you manage</p>
          </div>
          <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/conferences/new">Create Conference</Link></Button>
        </header>

        {!hydrated ? <p className="text-sm text-gray-600">Loading...</p> : managedConfs.length === 0 ? (
          <div className="rounded-lg border p-6 flex flex-col gap-3">
            <h2 className="font-medium text-gray-900">No conferences yet</h2>
            <p className="text-sm text-gray-600">{orgs.length > 0 ? 'Create your first conference.' : 'Create an organization first, then add a conference.'}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={orgs.length > 0 ? '/conferences/new' : '/organizations/new'}>{orgs.length > 0 ? 'Create Conference' : 'Create Organization'}</Link></Button>
              <Button variant="outline" onClick={async () => { await api('/api/seed', { method: 'POST', body: '{}' }).catch(() => {}); await refreshData() }}>Create sample workspace</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border divide-y bg-white">
            {[...managedConfs].reverse().map((c) => {
              const org = orgById.get(c.organizationId)
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-gray-900">{c.title}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span>{org?.name ?? 'Unknown organization'}</span>
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5">{c.status}</span>
                      <span>/events/{c.slug}</span>
                    </p>
                  </div>
                  {org ? (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm"><Link href={`/organizations/${org.slug}/conferences/${c.slug}`}>Manage</Link></Button>
                      <Button asChild variant="outline" size="sm"><Link href={`/organizations/${org.slug}/conferences/${c.slug}/website`}>Website editor</Link></Button>
                      {c.status === 'Published' ? <Button asChild size="sm"><Link href={`/events/${c.slug}`} target="_blank">Public site</Link></Button> : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Researcher / reviewer / visitor view: participate, never manage.
  const mySubmissions = currentUser ? data.submissions.filter((s) => s.authorId === currentUser.id) : []
  const submittedConfIds = new Set(mySubmissions.map((s) => s.conferenceId))
  const submittable = confs.filter(
    (c) => c.status === 'Published' && c.submissionsEnabled !== false && !submittedConfIds.has(c.id),
  )

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Conferences</h1>
        <p className="text-sm text-gray-600">
          {accountType === 'researcher'
            ? 'Submit papers to open events, and track or edit your submissions.'
            : 'Events you can take part in. Conference management is reserved for organizers.'}
        </p>
      </header>

      {!hydrated ? <p className="text-sm text-gray-600">Loading...</p> : !currentUser ? (
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-gray-900">Sign in</h2>
          <div><Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/login?next=%2Fconferences">Sign in</Link></Button></div>
        </div>
      ) : (
        <>
          {accountType === 'researcher' && mySubmissions.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-medium text-gray-900">My submitted papers</h2>
              <div className="rounded-lg border divide-y bg-white">
                {[...mySubmissions].reverse().map((s) => {
                  const conf = confs.find((c) => c.id === s.conferenceId)
                  return (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium text-gray-900">{s.title}</p>
                        <p className="text-xs text-gray-600">{conf?.title ?? 'Unknown event'} · {s.status}{s.decisionReleased ? ' · decision released' : ''}</p>
                      </div>
                      <Button asChild variant="outline" size="sm"><Link href="/submissions">View / edit my submissions</Link></Button>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {accountType === 'researcher' ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-medium text-gray-900">Events you can submit to</h2>
              {submittable.length === 0 ? (
                <p className="rounded-lg border p-5 text-sm text-gray-600">No open events right now. Published events with submissions enabled will appear here.</p>
              ) : (
                <div className="rounded-lg border divide-y bg-white">
                  {submittable.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium text-gray-900">{c.title}</p>
                        <p className="text-xs text-gray-600">
                          {orgById.get(c.organizationId)?.name ?? 'Confexa event'}
                          {c.submissionDeadline ? ` · submissions close ${c.submissionDeadline}` : ''}
                        </p>
                      </div>
                      <span className="flex gap-2">
                        <Button asChild variant="outline" size="sm"><Link href={`/events/${c.slug}`}>View event</Link></Button>
                        <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/events/${c.slug}/submit`}>Submit a paper</Link></Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500">Private events appear here only when the organizer has invited you. Submissions are accepted from Researcher accounts only, while the event is open.</p>
            </section>
          ) : (
            <section className="flex flex-col gap-3">
              <h2 className="font-medium text-gray-900">Open events</h2>
              <div className="rounded-lg border divide-y bg-white">
                {confs.filter((c) => c.status === 'Published').map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="font-medium text-gray-900">{c.title}</p>
                    <Button asChild variant="outline" size="sm"><Link href={`/events/${c.slug}`}>View event</Link></Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
