'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/demo/storage'
import { getAIRequestHeaders } from '@/lib/demo/profile'
import { ACCOUNT_TYPE_META, type AccountType } from '@/lib/demo/types'
import { Avatar } from '@/components/ui/avatar'

type DirectoryUser = { id: string; displayName: string; email: string; accountType: AccountType; affiliation?: string; avatarUrl?: string; expertise: string[]; researchInterests: string[] }

type Dash = {
  directory?: DirectoryUser[]
  user: { displayName: string; email: string; platformRole: string; accountType: AccountType }
  organizer: { organizations: number; conferences: number; publishedWebsites: number; submissions: number; underReview: number; accepted: number; reviewsCompleted: number; outstandingReviews: number; visitorApplications: number; visitorPending: number; visitorApproved: number; reviewerApplicationsPending: number; reviewerApplications?: { id: string; conferenceTitle: string; reviewerName?: string; reviewerEmail?: string; status: string }[]; visitorList: { id: string; conferenceTitle: string; status: string; paymentStatus: string }[]; conferencesList: { id: string; title: string; lifecycle: string; submissionDeadline?: string; startDate?: string }[] }
  author: { submissions: number; underReview: number; accepted: number; rejected: number; revisionRequested: number; decisionsAvailable: number; cameraReadyRequested: number; list: { id: string; title: string; status: string; conferenceTitle: string; decisionReleased: boolean; createdAt: string }[] }
  reviewer: { assigned: number; pending: number; completed: number; invitationsPending: number; applicationsPending: number; applicationsApproved: number; invitations: { id: string; conferenceTitle: string; status: string }[]; applications: { id: string; conferenceTitle: string; status: string }[]; list: { id: string; submissionId: string; title: string; status: string; dueDate?: string }[] }
  visitor: { applications: number; pending: number; approved: number; waitlisted: number; list: { id: string; conferenceTitle: string; conferenceSlug: string; status: string; paymentStatus: string; startDate?: string }[] }
  notifications: { id: string; title: string; body?: string; isRead: boolean; createdAt: string }[]
  activity: { id: string; action: string; details?: string; createdAt: string }[]
  platform: { users: number; organizations: number; conferences: number; submissions: number; reviews: number; database: string } | null
}

function Cards({ items }: { items: { label: string; value: number; hint?: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-semibold tracking-tight text-foreground">{s.value}</p>
          <p className="mt-1 text-sm text-foreground">{s.label}</p>
          {s.hint ? <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p> : null}
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiLabel, setAiLabel] = useState('Checking AI status...')
  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  const [dirQuery, setDirQuery] = useState('')
  const [inviteConf, setInviteConf] = useState<Record<string, string>>({})
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setDash(await api<Dash>('/api/dashboard'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server (external system) on mount
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    fetch('/api/ai/status', { headers: getAIRequestHeaders() })
      .then((r) => r.json())
      .then((d) => setAiLabel(String(d.label || '')))
      .catch(() => setAiLabel('AI status unavailable'))
  }, [])

  async function decideReviewerApplication(appId: string, status: 'approved' | 'rejected', name: string) {
    setInviteMsg(null)
    try {
      await api(`/api/reviewer-applications/${appId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setInviteMsg(`Reviewer application ${status} for ${name}.`)
      await load()
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : 'Could not update the application.')
    }
  }

  async function inviteReviewer(person: DirectoryUser) {
    const confId = inviteConf[person.id] || dash?.organizer.conferencesList[0]?.id
    if (!confId) { setInviteMsg('Create a conference first, then invite reviewers to it.'); return }
    setInviteMsg(null)
    try {
      await api(`/api/conferences/${confId}/reviewer-invitations`, { method: 'POST', body: JSON.stringify({ email: person.email }) })
      setInviteMsg(`Invitation sent to ${person.displayName}.`)
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : 'Invitation failed.')
    }
  }

  async function seed() {
    setSeedMsg('Creating sample workspace in PostgreSQL...')
    try {
      await api('/api/seed', { method: 'POST', body: '{}' })
      setSeedMsg('Sample workspace created (organization + published conference).')
      await load()
    } catch (err) {
      setSeedMsg(err instanceof Error ? err.message : 'Seed failed')
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Dashboard unavailable</h1>
        <p className="text-sm text-[#64748B]">{error}</p>
        <div><Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/login">Sign in</Link></Button></div>
      </div>
    )
  }
  if (!dash) return <p className="text-sm text-[#64748B]">Loading dashboard from PostgreSQL...</p>

  const upcoming = dash.organizer.conferencesList
    .filter((c) => c.submissionDeadline || c.startDate)
    .sort((a, b) => String(a.submissionDeadline || a.startDate).localeCompare(String(b.submissionDeadline || b.startDate)))
    .slice(0, 5)

  const accountType: AccountType = dash.user.accountType || 'researcher'
  const meta = ACCOUNT_TYPE_META[accountType]

  return (
    <div className="flex flex-col gap-6">
      <header className="relative overflow-hidden rounded-lg border bg-foreground p-6 text-background sm:p-8">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={dash.user.displayName} size={64} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-background/70">{meta.label}</p>
                <span className="rounded-sm border border-background/30 px-2 py-0.5 text-xs text-background/80">{dash.user.email}</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {dash.user.displayName}</h1>
              <p className="mt-1 max-w-2xl text-sm text-background/80">{meta.description}</p>
            </div>
          </div>
          <div className="relative flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm" className="bg-background/10 text-background hover:bg-background/15"><Link href="/profile">Profile</Link></Button>
            {accountType === 'organizer' ? <Button asChild size="sm" className="bg-background text-foreground hover:bg-background/90"><Link href="/conferences/new">New conference</Link></Button> : null}
            {accountType === 'visitor' || accountType === 'researcher' ? <Button asChild size="sm" className="bg-background text-foreground hover:bg-background/90"><Link href="/events">Browse events</Link></Button> : null}
            {accountType === 'reviewer' ? <Button asChild size="sm" className="bg-background text-foreground hover:bg-background/90"><Link href="/review">Review queue</Link></Button> : null}
            <Button asChild variant="outline" size="sm" className="border-background/40 text-background hover:bg-background/10"><Link href="/notifications">Notifications</Link></Button>
          </div>
        </div>
      </header>

      <section aria-label="Overview" className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border bg-card p-6">
          {accountType === 'organizer' ? (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Overview</h2>
                <p className="mt-1 text-sm text-muted-foreground">Submissions, reviews, and attendee activity.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">Submissions</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{dash.organizer.submissions}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dash.organizer.outstandingReviews} awaiting review · {dash.organizer.accepted} accepted</p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">Events</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{dash.organizer.conferences}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dash.organizer.organizations} organizations · {dash.organizer.reviewerApplicationsPending} reviewer apps pending</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm"><Link href="/organizations/new">New organization</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/conferences/new">New conference</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/submissions">Submissions</Link></Button>
              </div>
            </div>
          ) : accountType === 'reviewer' ? (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Overview</h2>
                <p className="mt-1 text-sm text-muted-foreground">Assignments and pending reviews.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">Assignments</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{dash.reviewer.assigned}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dash.reviewer.pending} pending · {dash.reviewer.completed} completed</p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">Invitations and applications</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{dash.reviewer.invitationsPending}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dash.reviewer.applicationsApproved} approved applications</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm"><Link href="/review">Review queue</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/events">Browse events</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/notifications">Notifications</Link></Button>
              </div>
            </div>
          ) : accountType === 'visitor' ? (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Overview</h2>
                <p className="mt-1 text-sm text-muted-foreground">Event applications and status.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">Applications</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{dash.visitor.applications}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dash.visitor.pending} pending · {dash.visitor.approved} approved</p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">Waitlist</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{dash.visitor.waitlisted}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Updates via notifications</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm"><Link href="/events">Browse events</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/notifications">Notifications</Link></Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Overview</h2>
                <p className="mt-1 text-sm text-muted-foreground">Submissions and decisions.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">Papers</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{dash.author.submissions}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dash.author.underReview} under review</p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">Outcomes</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{dash.author.accepted}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dash.author.revisionRequested} revision requested · {dash.author.rejected} rejected</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm"><Link href="/events">Browse events</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/submissions">My submissions</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/profile">Profile</Link></Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">AI status</h2>
            <p className="mt-1 text-sm text-muted-foreground">Availability for reviews, screening, and website generation.</p>
          </div>
          <div className="rounded-md border p-4">
            <p className="text-sm text-foreground">{aiLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">Add a Meta API key in Profile to enable live AI features.</p>
          </div>
          <div>
            <Button asChild size="sm" variant="outline"><Link href="/profile">Configure AI key</Link></Button>
          </div>
        </div>
      </section>

      <p className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-600">AI: {aiLabel}</p>

      {dash.platform ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Platform</h2>
            <p className="text-sm text-muted-foreground">System-wide counts.</p>
          </div>
          <Cards items={[
            { label: 'Users', value: dash.platform.users }, { label: 'Organizations', value: dash.platform.organizations },
            { label: 'Conferences', value: dash.platform.conferences }, { label: 'Submissions', value: dash.platform.submissions },
          ]} />
          <p className="text-xs text-muted-foreground">{dash.platform.database}</p>
        </section>
      ) : null}

      {accountType === 'organizer' ? (
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Organizer overview</h2>
            <p className="text-sm text-gray-600">Key metrics across your organizations and events.</p>
          </div>
          <Button asChild size="sm" variant="outline"><Link href="/submissions">Go to submissions</Link></Button>
        </div>
        <Cards items={[
          { label: 'Organizations', value: dash.organizer.organizations, hint: 'Active workspaces' }, { label: 'Conferences', value: dash.organizer.conferences, hint: 'Events created' },
          { label: 'Published websites', value: dash.organizer.publishedWebsites, hint: 'Public event sites' }, { label: 'Submissions received', value: dash.organizer.submissions, hint: 'Total papers' },
        ]} />
        <Cards items={[
          { label: 'Visitor applications', value: dash.organizer.visitorApplications, hint: 'Attendance requests' }, { label: 'Applications pending', value: dash.organizer.visitorPending, hint: 'Need review' },
          { label: 'Visitors approved', value: dash.organizer.visitorApproved, hint: 'Confirmed attendees' }, { label: 'Reviewer applications pending', value: dash.organizer.reviewerApplicationsPending, hint: 'Need decision' },
        ]} />
        {(dash.organizer.reviewerApplications ?? []).filter((a) => a.status === 'pending').length > 0 ? (
          <div className="rounded-lg border bg-white p-5">
            <h3 className="text-sm font-medium text-gray-900">Reviewer applications waiting for your decision</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {(dash.organizer.reviewerApplications ?? []).filter((a) => a.status === 'pending').map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span><span className="font-medium text-gray-900">{a.reviewerName || 'Reviewer'}</span> <span className="text-gray-500">{a.reviewerEmail}</span><span className="block text-xs text-gray-500">applied to review: {a.conferenceTitle}</span></span>
                  <span className="flex gap-1.5">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => void decideReviewerApplication(a.id, 'approved', a.reviewerName || 'Reviewer')}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => void decideReviewerApplication(a.id, 'rejected', a.reviewerName || 'Reviewer')}>Reject</Button>
                  </span>
                </li>
              ))}
            </ul>
            {inviteMsg ? <p role="status" className="mt-2 text-sm text-gray-600">{inviteMsg}</p> : null}
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Review progress</h3>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-[#4F46E5]">Papers</span>
            </div>
            <p className="mt-3 text-sm text-gray-600">{dash.organizer.reviewsCompleted} review(s) completed · {dash.organizer.outstandingReviews} awaiting review · {dash.organizer.accepted} accepted</p>
            <div className="mt-4 h-2 w-full rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-gradient-to-r from-[#4F46E5] to-[#22D3EE]" style={{ width: `${Math.min(100, Math.max(6, (dash.organizer.reviewsCompleted / Math.max(1, dash.organizer.reviewsCompleted + dash.organizer.outstandingReviews)) * 100))}%` }} />
            </div>
            <Button asChild variant="outline" size="sm" className="mt-4"><Link href="/submissions">Manage submissions</Link></Button>
          </div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Upcoming deadlines</h3>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Timeline</span>
            </div>
            {upcoming.length ? <ul className="mt-3 flex flex-col gap-2 text-sm text-gray-600">{upcoming.map((c) => <li key={c.id} className="flex items-start justify-between gap-2"><span className="font-medium text-gray-900">{c.title}</span><span className="text-right text-xs text-gray-500">{c.submissionDeadline ? `Submissions ${c.submissionDeadline}` : `Starts ${c.startDate}`}</span></li>)}</ul> : <p className="mt-3 text-sm text-gray-600">No dated conferences yet.</p>}
          </div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Recent activity</h3>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Audit</span>
            </div>
            {dash.activity.length ? <ul className="mt-3 flex flex-col gap-2 text-sm text-gray-600">{dash.activity.slice(0, 6).map((a) => <li key={a.id} className="rounded-lg bg-gray-50 px-2 py-1.5">{a.action.replaceAll('_', ' ')}{a.details ? ` — ${a.details}` : ''}</li>)}</ul> : <p className="mt-3 text-sm text-gray-600">No activity yet.</p>}
          </div>
        </div>
      </section>
      ) : null}

      {accountType === 'organizer' && dash.directory ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Registered users directory</h2>
              <p className="text-sm text-gray-600">Discover reviewers and collaborators. Invite qualified reviewers to your events.</p>
            </div>
            <div className="flex items-center gap-2">
              <input value={dirQuery} onChange={(e) => setDirQuery(e.target.value)} placeholder="Search by name, expertise, affiliation..." className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20" aria-label="Search registered users" />
            </div>
          </div>
          {inviteMsg ? <p role="status" className="rounded-xl border bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{inviteMsg}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dash.directory
              .filter((u) => {
                const q = dirQuery.trim().toLowerCase()
                if (!q) return true
                return [u.displayName, u.email, u.affiliation || '', u.accountType, ...(u.expertise || []), ...(u.researchInterests || [])].join(' ').toLowerCase().includes(q)
              })
              .slice(0, 24)
              .map((u) => (
                <div key={u.id} className="group relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4F46E5] to-[#22D3EE]" />
                  <div className="flex items-center gap-3">
                    <Avatar name={u.displayName} url={u.avatarUrl} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{u.displayName}</p>
                      <p className="truncate text-xs text-gray-500">{ACCOUNT_TYPE_META[u.accountType].label}{u.affiliation ? ` · ${u.affiliation}` : ''}</p>
                    </div>
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">{u.accountType}</span>
                  </div>
                  {u.expertise?.length ? <p className="mt-2 truncate text-xs text-gray-500">Expertise: {u.expertise.slice(0, 3).join(', ')}</p> : null}
                  {u.researchInterests?.length && !u.expertise?.length ? <p className="mt-2 truncate text-xs text-gray-500">Interests: {u.researchInterests.slice(0, 3).join(', ')}</p> : null}
                  {u.accountType === 'reviewer' && dash.organizer.conferencesList.length > 0 ? (
                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={inviteConf[u.id] || dash.organizer.conferencesList[0].id}
                        onChange={(e) => setInviteConf((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        className="h-8 flex-1 rounded-lg border px-2 text-xs"
                        aria-label={`Event for ${u.displayName}`}
                      >
                        {dash.organizer.conferencesList.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </select>
                      <Button size="sm" onClick={() => void inviteReviewer(u)} className="bg-[#4F46E5] hover:bg-[#4338CA]">Invite</Button>
                    </div>
                  ) : u.accountType === 'reviewer' ? (
                    <p className="mt-3 text-xs text-gray-500">Create a conference to invite this reviewer.</p>
                  ) : null}
                </div>
              ))}
          </div>
          {dash.directory.length === 0 ? <p className="rounded-2xl border p-6 text-center text-sm text-gray-600">No registered users yet.</p> : null}
        </section>
      ) : null}

      {accountType === 'researcher' ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">My submissions</h2>
              <p className="text-sm text-gray-600">Track review status and decisions across all your papers.</p>
            </div>
            <Button asChild size="sm" variant="outline"><Link href="/submissions">View all submissions</Link></Button>
          </div>
          <Cards items={[
            { label: 'Total submissions', value: dash.author.submissions, hint: 'All time' }, { label: 'Under review', value: dash.author.underReview, hint: 'In progress' },
            { label: 'Accepted', value: dash.author.accepted, hint: 'Ready for next steps' }, { label: 'Rejected', value: dash.author.rejected, hint: 'Closed' },
          ]} />
          <Cards items={[
            { label: 'Revision requested', value: dash.author.revisionRequested, hint: 'Action required' }, { label: 'Decisions available', value: dash.author.decisionsAvailable, hint: 'Released' },
            { label: 'Camera-ready relevant', value: dash.author.cameraReadyRequested, hint: 'Prepare files' }, { label: 'Upcoming deadlines', value: upcoming.length, hint: 'Events with dates' },
          ]} />
          {dash.author.list.length ? (
            <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b bg-gray-50/80"><th className="px-4 py-2.5 font-medium text-gray-900">Paper</th><th className="px-4 py-2.5 font-medium text-gray-900">Event</th><th className="px-4 py-2.5 font-medium text-gray-900">Submitted</th><th className="px-4 py-2.5 font-medium text-gray-900">Status</th><th className="px-4 py-2.5 font-medium text-gray-900">Action</th></tr></thead>
                <tbody>{dash.author.list.map((s) => (
                  <tr key={s.id} className="border-b transition-colors hover:bg-gray-50/60 last:border-0"><td className="px-4 py-2.5 font-medium text-gray-900">{s.title}</td><td className="px-4 py-2.5 text-gray-600">{s.conferenceTitle}</td><td className="px-4 py-2.5 text-gray-600">{new Date(s.createdAt).toLocaleDateString()}</td><td className="px-4 py-2.5 text-gray-600">{s.status}{s.decisionReleased ? ' · decision released' : ''}</td><td className="px-4 py-2.5"><Button asChild size="sm" variant="outline"><Link href="/submissions">Open details</Link></Button></td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-600">No papers yet. Browse a published event and submit from its page.</p>}
        </section>
      ) : null}

      {accountType === 'reviewer' ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reviewing</h2>
              <p className="text-sm text-gray-600">Focus on your assigned papers and deadlines.</p>
            </div>
            <Button asChild size="sm" variant="outline"><Link href="/review">Open review workspace</Link></Button>
          </div>
          <Cards items={[
            { label: 'Invitations pending', value: dash.reviewer.invitationsPending, hint: 'Awaiting response' }, { label: 'Active assignments', value: dash.reviewer.assigned, hint: 'Papers assigned' },
            { label: 'Reviews pending', value: dash.reviewer.pending, hint: 'To complete' }, { label: 'Reviews completed', value: dash.reviewer.completed, hint: 'Submitted' },
          ]} />
          {dash.reviewer.list.length ? <ul className="flex flex-col gap-2 rounded-2xl border bg-white p-5 shadow-sm">{dash.reviewer.list.slice(0, 6).map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"><div><p className="font-medium text-gray-900">{r.title}</p><p className="text-xs text-gray-500">{r.status}{r.dueDate ? ` · due ${r.dueDate}` : ''}</p></div><Button asChild size="sm" variant="outline"><Link href="/review">Review</Link></Button></li>)}</ul> : <p className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-600">No assignments yet. Apply to review an event or accept an invitation first; papers are assigned after approval.</p>}
        </section>
      ) : null}

      {accountType === 'visitor' ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">My event applications</h2>
              <p className="text-sm text-gray-600">Track application status and payment details.</p>
            </div>
            <Button asChild size="sm" variant="outline"><Link href="/events">Browse events</Link></Button>
          </div>
          <Cards items={[
            { label: 'Applications', value: dash.visitor.applications, hint: 'Total' }, { label: 'Pending', value: dash.visitor.pending, hint: 'Under review' },
            { label: 'Approved', value: dash.visitor.approved, hint: 'Confirmed' }, { label: 'Waitlisted', value: dash.visitor.waitlisted, hint: 'On waitlist' },
          ]} />
          {dash.visitor.list.length ? <ul className="flex flex-col gap-2 rounded-2xl border bg-white p-5 shadow-sm">{dash.visitor.list.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"><div><p className="font-medium text-gray-900">{a.conferenceTitle}</p><p className="text-xs text-gray-500">{a.startDate ? `Starts ${a.startDate}` : ''} · {a.status} · payment: {a.paymentStatus}</p></div>{a.conferenceSlug ? <Button asChild size="sm" variant="outline"><Link href={`/events/${a.conferenceSlug}`}>View event</Link></Button> : null}</li>)}</ul> : <p className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-600">No applications yet. Browse public events and apply to attend.</p>}
        </section>
      ) : null}

      {dash.notifications?.length ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent notifications</h2>
              <p className="text-sm text-gray-600">Stay up to date with updates and actions.</p>
            </div>
            <Button asChild variant="outline" size="sm"><Link href="/notifications">Open notification center</Link></Button>
          </div>
          <ul className="mt-4 flex flex-col gap-2">{dash.notifications.slice(0, 5).map((n) => <li key={n.id} className="flex items-start gap-2 rounded-xl border px-3 py-2 text-sm"><span className={`mt-1 h-2 w-2 rounded-full ${n.isRead ? 'bg-gray-300' : 'bg-[#4F46E5]'}`} /><div><p className="font-medium text-gray-900">{n.title}</p>{n.body ? <p className="text-gray-600">{n.body}</p> : null}</div></li>)}</ul>
        </section>
      ) : null}

      {accountType === 'organizer' && dash.organizer.organizations === 0 ? (
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-[#111827]">Get started</h2>
          <p className="text-sm text-[#64748B]">Create an organization and conference, or create a sample workspace stored as real database rows owned by you.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/organizations/new">Create Organization</Link></Button>
            <Button variant="outline" onClick={seed}>Create sample workspace</Button>
          </div>
          {seedMsg ? <p className="text-sm text-[#64748B]">{seedMsg}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
