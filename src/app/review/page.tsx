'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { api, refreshData, useDemoData, useHydrated } from '@/lib/demo/storage'
import type { ReviewAssignment, Submission } from '@/lib/demo/types'

export default function ReviewPage() {
  const data = useDemoData()
  const hydrated = useHydrated()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeError, setNoticeError] = useState<string | null>(null)
  const currentUser = data.currentUser ?? null
  const confById = new Map(data.conferences.map((c) => [c.id, c]))
  const orgById = new Map(data.organizations.map((o) => [o.id, o]))
  const subById = new Map(data.submissions.map((s) => [s.id, s]))

  const myAssignments = currentUser
    ? data.assignments.filter((a) => a.reviewerId === currentUser.id)
    : []
  const pending = myAssignments.filter((a) => a.status !== 'completed')
  const completed = myAssignments.filter((a) => a.status === 'completed')

  function row(assignment: ReviewAssignment) {
    const s: Submission | undefined = subById.get(assignment.submissionId)
    if (!s) return null
    const conf = confById.get(s.conferenceId)
    const org = conf ? orgById.get(conf.organizationId) : undefined
    const reviewCount = data.reviews.filter((r) => r.submissionId === s.id).length
    const ai = data.aiReviews.filter((r) => r.submissionId === s.id).pop()
    return (
      <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-[#111827]">{s.title}</p>
          <p className="flex flex-wrap gap-2 text-xs text-[#64748B]">
            <span>{conf?.title ?? 'Unknown conference'}</span>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5">{s.status}</span>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5">assignment: {assignment.status}</span>
            {assignment.dueDate ? <span>due {assignment.dueDate}</span> : null}
            <span>{reviewCount} human review(s)</span>
            {ai ? <span>AI {ai.overallScore}/10 · {ai.recommendation} ({ai.source})</span> : <span>no AI review yet</span>}
            {conf?.reviewMethod === 'double_blind' ? <span>double-blind</span> : null}
          </p>
        </div>
        {conf && org ? <Button asChild variant="outline" size="sm"><Link href={`/organizations/${org.slug}/conferences/${conf.slug}/submissions/${s.id}`}>Review</Link></Button> : null}
      </div>
    )
  }

  function section(title: string, assignments: ReviewAssignment[], emptyText: string) {
    return (
      <div className="rounded-lg border">
        <div className="border-b p-4"><h2 className="font-medium text-[#111827]">{title} ({assignments.length})</h2></div>
        <div className="divide-y">
          {assignments.length > 0 ? assignments.map(row) : <p className="p-4 text-sm text-[#64748B]">{emptyText}</p>}
        </div>
      </div>
    )
  }

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Reviewer Queue</h1>
          <p className="text-sm text-[#64748B]">Loading your assignments...</p>
        </header>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Reviewer Queue</h1>
          <p className="text-sm text-[#64748B]">Papers assigned to you for review, across all conferences.</p>
        </header>
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-[#111827]">Sign in to see your review assignments</h2>
          <p className="text-sm text-[#64748B]">Review assignments are tied to your registered account. Sign in with the email an organizer used to assign papers to you.</p>
          <div><Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/login?next=%2Freview">Sign in</Link></Button></div>
        </div>
      </div>
    )
  }

  const isReviewer = currentUser.accountType === 'reviewer'
  const myInvitations = data.reviewerInvitations.filter((i) => i.reviewerId === currentUser.id || i.email.toLowerCase() === currentUser.email.toLowerCase())
  const myApplications = data.reviewerApplications.filter((a) => a.reviewerId === currentUser.id)
  const appliedConfIds = new Set(myApplications.map((a) => a.conferenceId))
  const openForApplications = data.conferences.filter((c) => c.lifecycle !== 'draft' && c.lifecycle !== 'completed' && c.lifecycle !== 'archived' && c.reviewerMode !== 'invitations' && !appliedConfIds.has(c.id))

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setNotice(null); setNoticeError(null)
    try { await fn(); setNotice(ok); await refreshData() } catch (err) { setNoticeError(err instanceof Error ? err.message : 'Action failed.') } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Reviewer Queue</h1>
        <p className="text-sm text-[#64748B]">
          Papers assigned to <span className="font-medium text-[#111827]">{currentUser.displayName}</span> ({currentUser.email}).
          You only see papers assigned to you; applying to an event never grants paper access by itself.
        </p>
      </header>

      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
      {noticeError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{noticeError}</p> : null}

      {!isReviewer ? (
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-[#111827]">Reviewer account required</h2>
          <p className="text-sm text-[#64748B]">Your account type is {currentUser.accountType}. Review tools are only available to Reviewer accounts, and organizers cannot grant reviewer rights to another account type.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <div className="border-b p-4"><h2 className="font-medium text-[#111827]">Invitations ({myInvitations.length})</h2></div>
            <div className="divide-y">
              {myInvitations.length ? myInvitations.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <p className="text-sm"><span className="font-medium text-[#111827]">{i.conferenceTitle || 'Event'}</span> <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">{i.status}</span></p>
                  {i.status === 'invited' ? (
                    <span className="flex gap-2">
                      <Button size="sm" disabled={busy} className="bg-[#4F46E5] hover:bg-[#4338CA]" onClick={() => void act(() => api(`/api/reviewer-invitations/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }), 'Invitation accepted. Organizers of that event can now assign papers to you.')}>Accept</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => api(`/api/reviewer-invitations/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'declined' }) }), 'Invitation declined.')}>Decline</Button>
                    </span>
                  ) : null}
                </div>
              )) : <p className="p-4 text-sm text-[#64748B]">No invitations yet. Organizers invite registered Reviewers by email, per event.</p>}
            </div>
          </div>

          {(myApplications.some((a) => a.status === 'approved') || myInvitations.some((i) => i.status === 'accepted')) ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
              <h2 className="font-medium text-[#111827]">Events you are approved to review</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[#475569]">
                {myApplications.filter((a) => a.status === 'approved').map((a) => {
                  const count = myAssignments.filter((x) => subById.get(x.submissionId)?.conferenceId === a.conferenceId).length
                  return <li key={a.id}>{a.conferenceTitle || 'Event'}: {count} paper(s) assigned to you below{count === 0 ? ' — new submissions are assigned to you automatically; if a paper was submitted before your approval, the organizer can assign it from Participants.' : ''}</li>
                })}
                {myInvitations.filter((i) => i.status === 'accepted').map((i) => {
                  const count = myAssignments.filter((x) => subById.get(x.submissionId)?.conferenceId === i.conferenceId).length
                  return <li key={i.id}>{i.conferenceTitle || 'Event'} (invitation): {count} paper(s) assigned to you below{count === 0 ? ' — new submissions are assigned to you automatically.' : ''}</li>
                })}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border">
            <div className="border-b p-4"><h2 className="font-medium text-[#111827]">My reviewer applications ({myApplications.length})</h2></div>
            <div className="divide-y">
              {myApplications.length ? myApplications.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <p className="text-sm"><span className="font-medium text-[#111827]">{a.conferenceTitle || 'Event'}</span> <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">{a.status}</span></p>
                  <span className="text-xs text-[#64748B]">{a.status === 'approved' ? 'Approved for this event — papers can be assigned to you.' : a.status === 'pending' ? 'Waiting for the organizer.' : ''}</span>
                </div>
              )) : <p className="p-4 text-sm text-[#64748B]">You have not applied to review any event yet.</p>}
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="border-b p-4"><h2 className="font-medium text-[#111827]">Events accepting reviewer applications</h2></div>
            <div className="divide-y">
              {openForApplications.length ? openForApplications.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <p className="text-sm"><span className="font-medium text-[#111827]">{c.title}</span>{c.reviewDeadline ? <span className="block text-xs text-[#64748B]">Reviews due {c.reviewDeadline}</span> : null}</p>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => api(`/api/conferences/${c.id}/reviewer-applications`, { method: 'POST', body: JSON.stringify({}) }), `Applied to review "${c.title}". The organizer must approve before papers can be assigned.`)}>Apply to review</Button>
                </div>
              )) : <p className="p-4 text-sm text-[#64748B]">No other events are accepting reviewer applications right now.</p>}
            </div>
          </div>
        </>
      )}

      {section('Pending assignments', pending, 'Nothing pending. Papers from events you are approved for are assigned automatically when submitted; organizers can also assign papers manually.')}
      {section('Completed assignments', completed, 'No completed reviews yet. Submitted reviews will move here.')}
    </div>
  )
}
