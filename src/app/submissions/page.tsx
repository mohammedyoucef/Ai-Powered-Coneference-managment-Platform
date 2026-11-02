'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useDemoData } from '@/lib/demo/storage'
import type { Submission } from '@/lib/demo/types'

export default function SubmissionsPage() {
  const data = useDemoData()
  const currentUser = data.currentUser ?? null
  const confById = new Map(data.conferences.map((c) => [c.id, c]))
  const orgById = new Map(data.organizations.map((o) => [o.id, o]))
  const accountType = currentUser?.accountType || 'researcher'

  const mine = currentUser ? data.submissions.filter((s) => s.authorId === currentUser.id) : []
  const assignedIds = new Set(
    currentUser ? data.assignments.filter((a) => a.reviewerId === currentUser.id).map((a) => a.submissionId) : [],
  )
  const assigned = data.submissions.filter((s) => assignedIds.has(s.id))
  const all = [...data.submissions].reverse()

  // For visitors, show their applications instead
  if (accountType === 'visitor') {
    const myApplications = data.visitorApplications.filter(a => a.visitorId === currentUser?.id)
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">My Applications</h1>
          <p className="text-sm text-gray-600">Your event attendance applications</p>
        </header>

        {!currentUser ? (
          <div className="rounded-lg border p-6 flex flex-col gap-3">
            <h2 className="font-medium text-gray-900">Sign in to see your applications</h2>
            <div><Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/login?next=%2Fsubmissions">Sign in</Link></Button></div>
          </div>
        ) : myApplications.length === 0 ? (
          <div className="rounded-lg border p-6 flex flex-col gap-3">
            <h2 className="font-medium text-gray-900">No applications yet</h2>
            <p className="text-sm text-gray-600">Browse events and apply to attend.</p>
            <div className="flex gap-2">
              <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/events">Browse events</Link></Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border divide-y bg-white">
            {myApplications.map((app) => {
              const conf = confById.get(app.conferenceId)
              return (
                <div key={app.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-gray-900">{conf?.title || 'Unknown event'}</p>
                    <p className="text-sm text-gray-600">Status: {app.status} · Payment: {app.paymentStatus}</p>
                  </div>
                  {conf && <Button asChild variant="outline" size="sm"><Link href={`/events/${conf.slug}`}>View event</Link></Button>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function row(s: Submission) {
    const conf = confById.get(s.conferenceId)
    const org = conf ? orgById.get(conf.organizationId) : undefined
    const ai = data.aiReviews.filter((r) => r.submissionId === s.id).pop()
    const authors = s.authors.join(', ')
    return (
      <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-gray-900">{s.title}</p>
          <p className="flex flex-wrap gap-2 text-xs text-gray-600">
            <span>{conf?.title ?? 'Unknown conference'}</span>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5">{s.status}</span>
            {authors ? <span>{authors}</span> : null}
            {s.submissionType ? <span>{s.submissionType}</span> : null}
            {ai ? <span>AI {ai.overallScore}/10</span> : null}
          </p>
        </div>
        {conf && org ? <Button asChild variant="outline" size="sm"><Link href={`/organizations/${org.slug}/conferences/${conf.slug}/submissions/${s.id}`}>Open</Link></Button> : null}
      </div>
    )
  }

  function section(title: string, list: Submission[], emptyText: string) {
    return (
      <div className="rounded-lg border bg-white">
        <div className="border-b p-4"><h2 className="font-medium text-gray-900">{title} ({list.length})</h2></div>
        <div className="divide-y">
          {list.length > 0 ? [...list].reverse().map(row) : <p className="p-4 text-sm text-gray-600">{emptyText}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Submissions</h1>
          <p className="text-sm text-gray-600">Papers and review assignments</p>
        </div>
        {accountType === 'researcher' && <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/conferences">Submit paper</Link></Button>}
      </header>

      {!currentUser ? (
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-gray-900">Sign in</h2>
          <div><Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/login?next=%2Fsubmissions">Sign in</Link></Button></div>
        </div>
      ) : null}

      {accountType === 'researcher' && mine.length === 0 && (
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-gray-900">No submissions</h2>
          <p className="text-sm text-gray-600">Submit a paper to a conference</p>
          <div className="flex gap-2">
            <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/conferences">Browse conferences</Link></Button>
          </div>
        </div>
      )}

      {accountType === 'researcher' && section('My papers', mine, 'No papers submitted.')}
      {(accountType === 'reviewer' || accountType === 'organizer') && section('Assigned to review', assigned, 'No assignments.')}
      {accountType === 'organizer' && section('All accessible', all, 'No submissions.')}
    </div>
  )
}
