'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api, refreshData, useDemoData, useHydrated } from '@/lib/demo/storage'
import { getAIRequestHeaders } from '@/lib/demo/profile'
import { Avatar } from '@/components/ui/avatar'

type DirectoryUser = { id: string; displayName: string; email: string; accountType: string; affiliation?: string; avatarUrl?: string; expertise?: string[] }
import type { AiScreening } from '@/lib/demo/types'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

const REC_LABEL: Record<AiScreening['recommendation'], string> = {
  appears_to_meet: 'Appears to meet requirements',
  additional_info_needed: 'Additional information needed',
  may_not_meet: 'May not meet requirements',
  unable_to_determine: 'Unable to determine',
}

function ParticipantsInner() {
  const params = useParams<{ slug: string; confSlug: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'visitor' | 'researcher'>('visitor')
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [directory, setDirectory] = useState<DirectoryUser[]>([])

  useEffect(() => {
    fetch('/api/users/directory', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setDirectory(Array.isArray(d.users) ? d.users : []))
      .catch(() => setDirectory([]))
  }, [])

  const org = data.organizations.find((o) => o.slug === params.slug) ?? null
  const conf = org ? data.conferences.find((c) => c.organizationId === org.id && c.slug === params.confSlug) ?? null : null

  if (!hydrated) return <p className="text-sm text-[#64748B]">Loading participants...</p>
  if (!org || !conf) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Conference not found</h1>
        <div><Button asChild><Link href="/conferences">Back to conferences</Link></Button></div>
      </div>
    )
  }

  const base = `/organizations/${org.slug}/conferences/${conf.slug}`
  const isManager = Boolean(data.currentUser && data.members.some((m) => m.organizationId === org.id && m.userId === data.currentUser!.id && (m.role === 'owner' || m.role === 'admin'))) || data.currentUser?.platformRole === 'platform_admin'
  const visitorApps = data.visitorApplications.filter((a) => a.conferenceId === conf.id)
  const reviewerApps = data.reviewerApplications.filter((a) => a.conferenceId === conf.id)
  const reviewerInvs = data.reviewerInvitations.filter((i) => i.conferenceId === conf.id)
  const eventInvs = data.eventInvitations.filter((i) => i.conferenceId === conf.id)
  const screeningsByApp = new Map<string, AiScreening>()
  data.aiScreenings.filter((s) => s.conferenceId === conf.id).forEach((s) => { if (!screeningsByApp.has(s.visitorApplicationId)) screeningsByApp.set(s.visitorApplicationId, s) })
  const announcements = data.announcements.filter((a) => a.conferenceId === conf.id)

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setError(null); setMsg(null)
    try { await fn(); setMsg(ok); await refreshData() } catch (err) { setError(err instanceof Error ? err.message : 'Action failed.') } finally { setBusy(false) }
  }

  async function inviteReviewer(e: React.FormEvent) {
    e.preventDefault()
    await act(async () => {
      const res = await api<{ message?: string }>(`/api/conferences/${conf!.id}/reviewer-invitations`, { method: 'POST', body: JSON.stringify({ email: reviewerEmail.trim() }) })
      setReviewerEmail('')
      if (res.message) setMsg(res.message)
    }, 'Reviewer invitation created.')
  }

  async function inviteParticipant(e: React.FormEvent) {
    e.preventDefault()
    await act(async () => {
      const res = await api<{ message?: string }>(`/api/conferences/${conf!.id}/event-invitations`, { method: 'POST', body: JSON.stringify({ email: inviteEmail.trim(), invitedRole: inviteRole }) })
      setInviteEmail('')
      if (res.message) setMsg(res.message)
    }, 'Invitation recorded.')
  }

  async function publishAnnouncement(e: React.FormEvent) {
    e.preventDefault()
    await act(async () => {
      await api(`/api/conferences/${conf!.id}/announcements`, { method: 'POST', body: JSON.stringify({ title: annTitle.trim(), body: annBody.trim() || undefined, audience: 'all' }) })
      setAnnTitle(''); setAnnBody('')
    }, 'Announcement published and participants notified in-app.')
  }

  if (!isManager) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Organizer access required</h1>
        <p className="text-sm text-[#64748B]">Only organizers managing {conf.title} can review applications, invite reviewers, or run eligibility screening. Your applications and invitations are on your own dashboard.</p>
        <div><Button asChild variant="outline"><Link href="/dashboard">Go to my dashboard</Link></Button></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-[#64748B]"><Link href={base} className="underline underline-offset-4">{conf.title}</Link> · {org.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111827]">Participants & applications</h1>
        <p className="text-sm text-[#64748B]">Visitor applications ({visitorApps.length}) · Reviewer applications ({reviewerApps.length}) · Reviewer invitations ({reviewerInvs.length}). AI screening is advisory — you make every final decision.</p>
      </header>

      {msg ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-lg border p-6 flex flex-col gap-4">
        <h2 className="font-medium text-[#111827]">Visitor applications ({visitorApps.length})</h2>
        {visitorApps.length === 0 ? <p className="text-sm text-[#64748B]">No visitor applications yet. Visitors apply from the public event page.</p> : (
          <div className="flex flex-col divide-y">
            {visitorApps.map((a) => {
              const screening = screeningsByApp.get(a.id)
              return (
                <div key={a.id} className="flex flex-col gap-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm"><span className="font-medium text-[#111827]">{a.visitorName || 'Visitor'}</span> <span className="text-[#64748B]">{a.visitorEmail}</span></p>
                    <span className="flex flex-wrap gap-1.5">
                      <span className="rounded-full border px-2 py-0.5 text-xs">{a.status}</span>
                      <span className="rounded-full border px-2 py-0.5 text-xs">payment: {a.paymentStatus}</span>
                    </span>
                  </div>
                  {Object.entries(a.answers).length ? (
                    <dl className="grid gap-1 text-sm text-[#475569]">
                      {Object.entries(a.answers).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="font-medium">{k}:</dt><dd>{v}</dd></div>)}
                    </dl>
                  ) : null}
                  {a.documentAvailable ? <a href={`/api/visitor-applications/${a.id}/document`} target="_blank" rel="noreferrer" className="text-sm text-[#4F46E5] underline underline-offset-4">View supporting document{a.documentName ? ` (${a.documentName})` : ''}</a> : null}
                  {screening ? (
                    <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                      <p className="font-medium text-[#111827]">Screening: {REC_LABEL[screening.recommendation]} <span className="font-normal text-[#64748B]">({screening.source === 'unavailable' ? 'AI unavailable — deterministic check' : screening.source})</span></p>
                      <p className="text-[#475569]">{screening.assessment.explanation}</p>
                      {screening.assessment.note ? <p className="text-xs text-[#64748B]">{screening.assessment.note}</p> : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => {
                      const headers = { ...getAIRequestHeaders() }
                      await api(`/api/visitor-applications/${a.id}/ai-screen`, { method: 'POST', body: '{}', headers })
                    }, 'Eligibility screening completed and stored.')}>Run AI eligibility screening</Button>
                    <Button size="sm" disabled={busy} className="bg-emerald-600 hover:bg-emerald-500" onClick={() => void act(() => api(`/api/visitor-applications/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }), 'Application approved.')}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => api(`/api/visitor-applications/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'waitlisted' }) }), 'Application waitlisted.')}>Waitlist</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => api(`/api/visitor-applications/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }), 'Application rejected.')}>Reject</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border p-6 flex flex-col gap-4">
          <h2 className="font-medium text-[#111827]">Select a registered reviewer</h2>
          <p className="text-sm text-[#64748B]">Pick from Confexa accounts registered as Reviewers. Invitations apply only to this event.</p>
          {directory.filter((u) => u.accountType === 'reviewer').length === 0 ? (
            <p className="text-sm text-[#64748B]">No registered Reviewer accounts yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {directory.filter((u) => u.accountType === 'reviewer').map((u) => {
                const already = reviewerInvs.some((i) => i.email.toLowerCase() === u.email.toLowerCase() && i.status !== 'declined' && i.status !== 'revoked')
                return (
                  <li key={u.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <Avatar name={u.displayName} url={u.avatarUrl} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#111827]">{u.displayName}</span>
                      <span className="block truncate text-xs text-[#64748B]">{u.affiliation || u.email}{u.expertise?.length ? ` · ${u.expertise.slice(0, 2).join(', ')}` : ''}</span>
                    </span>
                    {already
                      ? <span className="rounded-full border px-2 py-0.5 text-xs">Invited</span>
                      : <Button size="sm" disabled={busy} className="bg-[#4F46E5] hover:bg-[#4338CA]" onClick={() => void act(() => api(`/api/conferences/${conf.id}/reviewer-invitations`, { method: 'POST', body: JSON.stringify({ email: u.email }) }), `Invitation sent to ${u.displayName}.`)}>Invite</Button>}
                  </li>
                )
              })}
            </ul>
          )}
          <h2 className="border-t pt-4 font-medium text-[#111827]">Invite a reviewer by email</h2>
          <p className="text-sm text-[#64748B]">The person must already have a Reviewer account. Invitations apply only to this event and never grant reviewer rights on other events.</p>
          <form onSubmit={inviteReviewer} className="flex gap-2">
            <input type="email" required value={reviewerEmail} onChange={(e) => setReviewerEmail(e.target.value)} placeholder="reviewer@university.edu" className={inputCls} aria-label="Reviewer email" />
            <Button type="submit" disabled={busy} className="bg-[#4F46E5] hover:bg-[#4338CA]">Invite</Button>
          </form>
          <div>
            <h3 className="text-sm font-medium text-[#111827]">Reviewer invitations</h3>
            {reviewerInvs.length ? <ul className="mt-2 flex flex-col gap-1 text-sm text-[#475569]">{reviewerInvs.map((i) => <li key={i.id} className="flex justify-between gap-2"><span>{i.email}</span><span className="rounded-full border px-2 py-0.5 text-xs">{i.status}</span></li>)}</ul> : <p className="mt-2 text-sm text-[#64748B]">None yet.</p>}
          </div>
          <div>
            <h3 className="text-sm font-medium text-[#111827]">Reviewer applications</h3>
            {reviewerApps.length ? (
              <ul className="mt-2 flex flex-col gap-2">
                {reviewerApps.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span><span className="font-medium text-[#111827]">{a.reviewerName}</span> <span className="text-[#64748B]">{a.reviewerEmail}</span>{a.message ? <span className="block text-[#64748B]">{a.message}</span> : null}</span>
                    {a.status === 'pending' ? (
                      <span className="flex gap-1.5">
                        <Button size="sm" disabled={busy} className="bg-emerald-600 hover:bg-emerald-500" onClick={() => void act(() => api(`/api/reviewer-applications/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }), 'Reviewer approved for this event. Open papers were assigned to them automatically.')}>Approve</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => api(`/api/reviewer-applications/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }), 'Reviewer application rejected.')}>Reject</Button>
                      </span>
                    ) : a.status === 'approved' ? (
                      <span className="flex items-center gap-1.5">
                        <span className="rounded-full border px-2 py-0.5 text-xs">approved</span>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => {
                          const res = await api<{ message?: string }>(`/api/reviewer-applications/${a.id}/assign-papers`, { method: 'POST', body: '{}' })
                          if (res.message) setMsg(res.message)
                        }, 'Open papers assigned to this reviewer.')}>Assign open papers</Button>
                      </span>
                    ) : <span className="rounded-full border px-2 py-0.5 text-xs">{a.status}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-[#64748B]">No reviewer applications yet.</p>}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border p-6 flex flex-col gap-4">
            <h2 className="font-medium text-[#111827]">Invite participants (private-event access)</h2>
            <p className="text-sm text-[#64748B]">Invited visitors/researchers can see this event even when it is private, then apply or submit.</p>
            <form onSubmit={inviteParticipant} className="flex flex-col gap-2 sm:flex-row">
              <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="person@example.org" className={inputCls} aria-label="Invitee email" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'visitor' | 'researcher')} className="rounded-md border px-3 py-2 text-sm" aria-label="Invitee role">
                <option value="visitor">Visitor</option>
                <option value="researcher">Researcher</option>
              </select>
              <Button type="submit" disabled={busy} variant="outline">Invite</Button>
            </form>
            {eventInvs.length ? <ul className="flex flex-col gap-1 text-sm text-[#475569]">{eventInvs.map((i) => <li key={i.id} className="flex justify-between gap-2"><span>{i.email}</span><span className="text-xs">{i.invitedRole} · {i.status}</span></li>)}</ul> : null}
          </section>

          <section className="rounded-lg border p-6 flex flex-col gap-4">
            <h2 className="font-medium text-[#111827]">Publish an announcement</h2>
            <form onSubmit={publishAnnouncement} className="flex flex-col gap-2">
              <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required placeholder="Announcement title" className={inputCls} aria-label="Announcement title" />
              <textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} rows={3} placeholder="Details for approved visitors, authors, and reviewers..." className={inputCls} aria-label="Announcement body" />
              <div><Button type="submit" disabled={busy} variant="outline">Publish announcement</Button></div>
            </form>
            {announcements.length ? <ul className="flex flex-col gap-2">{announcements.map((a) => <li key={a.id} className="rounded-md border px-3 py-2 text-sm"><span className="font-medium text-[#111827]">{a.title}</span>{a.body ? <span className="block text-[#64748B]">{a.body}</span> : null}</li>)}</ul> : null}
          </section>
        </div>
      </div>
    </div>
  )
}

export default function ParticipantsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading participants...</p>}>
      <ParticipantsInner />
    </Suspense>
  )
}
