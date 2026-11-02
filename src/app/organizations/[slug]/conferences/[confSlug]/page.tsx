'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api, deleteConference, refreshData, useDemoData, useHydrated } from '@/lib/demo/storage'
import { LIFECYCLE_LABELS } from '@/lib/demo/types'
import { canManageOrganization } from '@/lib/demo/permissions'
import type { ConferenceLifecycle } from '@/lib/demo/types'

const NEXT_LIFECYCLE: Record<ConferenceLifecycle, ConferenceLifecycle[]> = {
  draft: ['published'],
  published: ['cfp_open', 'submissions_open'],
  cfp_open: ['submissions_open'],
  submissions_open: ['under_review'],
  under_review: ['decisions_released'],
  decisions_released: ['camera_ready', 'completed'],
  camera_ready: ['completed'],
  completed: ['archived'],
  archived: ['draft'],
}

function fmt(date?: string) {
  if (!date) return '—'
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function ConferenceDetailPageInner() {
  const params = useParams<{ slug: string; confSlug: string }>()
  const router = useRouter()
  const data = useDemoData()
  const hydrated = useHydrated()
  const [lifecycleBusy, setLifecycleBusy] = useState<ConferenceLifecycle | null>(null)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null)

  const org = data.organizations.find((o) => o.slug === params.slug) ?? null
  const conf = org ? data.conferences.find((c) => c.organizationId === org.id && c.slug === params.confSlug) ?? null : null
  const hasWebsite = conf ? data.websiteConfigs.some((w) => w.conferenceId === conf.id) : false
  const isPublished = conf ? data.publishedWebsiteConfigs.some((w) => w.conferenceId === conf.id) : false

  if (!hydrated) return <p className="text-sm text-[#64748B]">Loading conference...</p>

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
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">{conf.title}</h1>
          <p className="text-sm text-[#64748B]">{org.name} · {conf.status}</p>
          {conf.shortDescription ? <p className="mt-2 max-w-2xl text-sm text-[#64748B]">{conf.shortDescription}</p> : null}
        </header>
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-[#111827]">You are participating in this event</h2>
          <p className="text-sm text-[#64748B]">Conference and website management is reserved for the organizers of {org.name}. As a {data.currentUser?.accountType ?? 'registered'} user you can view the public event page, submit a paper while the event is open, and track or edit your own submissions.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/events/${conf.slug}`}>View event page</Link></Button>
            {data.currentUser?.accountType === 'researcher' ? <Button asChild variant="outline"><Link href={`/events/${conf.slug}/submit`}>Submit a paper</Link></Button> : null}
            <Button asChild variant="outline"><Link href="/submissions">My submissions</Link></Button>
          </div>
        </div>
      </div>
    )
  }

  const base = `/organizations/${org.slug}/conferences/${conf.slug}`
  const facts: [string, string][] = [
    ['Status', conf.status],
    ['Public URL', `/events/${conf.slug}`],
    ['Dates', `${fmt(conf.startDate)} – ${fmt(conf.endDate)}`],
    ['Submission deadline', fmt(conf.submissionDeadline)],
    ['Venue / format', conf.venueOrFormat || '—'],
    ['Location', [conf.city, conf.country].filter(Boolean).join(', ') || '—'],
    ['Language', conf.language || '—'],
    ['Contact', conf.contactEmail || '—'],
    ['Organization', org.name],
  ]

  const nextStates = NEXT_LIFECYCLE[conf.lifecycle] ?? []

  const confId = conf.id
  const confTitle = conf.title

  async function onLifecycle(next: ConferenceLifecycle) {
    if (!window.confirm(`Move “${confTitle}” to “${LIFECYCLE_LABELS[next]}”?`)) return
    setLifecycleBusy(next)
    setLifecycleError(null)
    setLifecycleMessage(null)
    try {
      await api(`/api/conferences/${confId}/lifecycle`, { method: 'POST', body: JSON.stringify({ lifecycle: next }) })
      setLifecycleMessage(`Conference moved to ${LIFECYCLE_LABELS[next]}.`)
      await refreshData()
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : 'Failed to update lifecycle.')
    } finally {
      setLifecycleBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">{conf.title}</h1>
          <p className="text-sm text-[#64748B]">{org.name} · {conf.status}</p>
          {conf.shortDescription ? <p className="mt-2 max-w-2xl text-sm text-[#64748B]">{conf.shortDescription}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`${base}/edit`}>Edit conference</Link></Button>
          <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`${base}/website`}>{hasWebsite ? 'Open website editor' : 'Generate website with AI'}</Link></Button>
          {isPublished ? <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500"><Link href={`/events/${conf.slug}`} target="_blank">View public site</Link></Button> : null}
        </div>
      </header>

      <div className="rounded-lg border p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-[#111827]">Conference lifecycle</h2>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">{LIFECYCLE_LABELS[conf.lifecycle]}</span>
        </div>
        <p className="mt-1 text-sm text-[#64748B]">Current stage: {LIFECYCLE_LABELS[conf.lifecycle]}. Advance the conference through publishing, submissions, review and completion.</p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex justify-between gap-4 text-sm"><dt className="text-[#64748B]">Category</dt><dd className="text-right font-medium text-[#111827]">{conf.category || '—'}</dd></div>
          <div className="flex justify-between gap-4 text-sm"><dt className="text-[#64748B]">Review method</dt><dd className="text-right font-medium text-[#111827]">{conf.reviewMethod === 'single_blind' ? 'Single blind' : conf.reviewMethod === 'double_blind' ? 'Double blind' : '—'}</dd></div>
        </dl>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <div>
            <span className="text-[#64748B]">Review criteria: </span>
            {conf.reviewCriteria && conf.reviewCriteria.length > 0 ? conf.reviewCriteria.map((c) => <span key={c} className="mr-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{c}</span>) : <span className="font-medium text-[#111827]">—</span>}
          </div>
          <div>
            <span className="text-[#64748B]">Submission types: </span>
            {conf.submissionTypes && conf.submissionTypes.length > 0 ? conf.submissionTypes.map((t) => <span key={t} className="mr-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{t}</span>) : <span className="font-medium text-[#111827]">—</span>}
          </div>
        </div>
        {lifecycleMessage ? <p className="mt-3 text-sm text-emerald-700">{lifecycleMessage}</p> : null}
        {lifecycleError ? <p className="mt-3 text-sm text-destructive">{lifecycleError}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {nextStates.length > 0 ? nextStates.map((next) => (
            <Button key={next} type="button" size="sm" disabled={lifecycleBusy !== null} onClick={() => void onLifecycle(next)} className="bg-[#4F46E5] hover:bg-[#4338CA]">
              {lifecycleBusy === next ? 'Updating...' : `Move to ${LIFECYCLE_LABELS[next]}`}
            </Button>
          )) : <p className="text-sm text-[#64748B]">Conference completed — no further lifecycle transitions.</p>}
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="font-medium text-[#111827]">Website status</h2>
        <p className="mt-1 text-sm text-[#64748B]">
          {isPublished ? <>Published — the public site is live at <Link href={`/events/${conf.slug}`} target="_blank" className="underline">/events/{conf.slug}</Link>.</> : hasWebsite ? 'Draft website generated — not published yet.' : 'No website yet. Generate one with AI to continue the workflow.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm"><Link href={`${base}/website`}>{hasWebsite ? 'Edit website' : 'Generate website'}</Link></Button>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{isPublished ? 'Published' : hasWebsite ? 'Website Generated (draft)' : 'Draft'}</span>
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="font-medium text-[#111827]">Submissions & review</h2>
        <p className="mt-1 text-sm text-[#64748B]">
          {data.submissions.filter((s) => s.conferenceId === conf.id).length} submission(s) · {data.submissions.filter((s) => s.conferenceId === conf.id && s.status === 'Accepted').length} accepted · {data.submissions.filter((s) => s.conferenceId === conf.id && (s.status === 'Submitted' || s.status === 'Under Review')).length} awaiting review. Authors submit PDFs, reviewers add human reviews with AI assistance, and the chair decides.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`${base}/submissions/new`}>Submit a paper</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`${base}/submissions`}>Manage submissions</Link></Button>
          <Button asChild size="sm" variant="ghost"><Link href="/review">Reviewer queue</Link></Button>
        </div>
      </div>

      <div className="rounded-lg border p-6">
        <h2 className="font-medium text-[#111827]">Participants, reviewers & announcements</h2>
        <p className="mt-1 text-sm text-[#64748B]">
          {data.visitorApplications.filter((a) => a.conferenceId === conf.id).length} visitor application(s) · {data.reviewerApplications.filter((a) => a.conferenceId === conf.id && a.status === 'pending').length} pending reviewer application(s) · {data.reviewerInvitations.filter((i) => i.conferenceId === conf.id).length} reviewer invitation(s). Review applications, invite reviewers by email, run AI eligibility screening, and publish announcements.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#64748B]">
          <span className="rounded-full border px-2 py-0.5 text-xs">{conf.visibility || 'public'}</span>
          <span className="rounded-full border px-2 py-0.5 text-xs">{conf.submissionsEnabled === false ? 'submissions off' : 'submissions on'}</span>
          <span className="rounded-full border px-2 py-0.5 text-xs">{conf.registrationEnabled === false ? 'registration off' : (conf.participationFeeCents ?? 0) > 0 ? `${(conf.participationFeeCents ?? 0) / 100} ${conf.feeCurrency || 'USD'} · ${conf.registrationMode || 'approval'}` : `free · ${conf.registrationMode || 'approval'}`}</span>
          <span className="rounded-full border px-2 py-0.5 text-xs">reviewers: {conf.reviewerMode || 'both'}</span>
        </div>
        <div className="mt-3">
          <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`${base}/participants`}>Manage participants & applications</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-6">
          <h2 className="font-medium text-[#111827]">Details</h2>
          <dl className="mt-3 flex flex-col gap-2">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-sm"><dt className="text-[#64748B]">{k}</dt><dd className="text-right font-medium text-[#111827]">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border p-6">
            <h2 className="font-medium text-[#111827]">About</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#64748B]">{conf.fullDescription || conf.shortDescription || 'No description yet. Edit the conference to add one before generating the website.'}</p>
            {conf.researchTopics.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">{conf.researchTopics.map((t) => <span key={t} className="rounded-full border px-2 py-0.5 text-xs">{t}</span>)}</div>
            ) : null}
          </div>
          <div className="rounded-lg border p-6">
            <h2 className="font-medium text-[#111827]">Danger zone</h2>
            <p className="mt-1 text-sm text-[#64748B]">Delete this conference and its website drafts/publications from this browser.</p>
            <Button variant="destructive" size="sm" className="mt-3" onClick={() => {
              if (window.confirm(`Delete “${conf.title}”?`)) { deleteConference(conf.id); router.push(`/organizations/${org.slug}`) }
            }}>Delete conference</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ConferenceDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading conference...</p>}>
      <ConferenceDetailPageInner />
    </Suspense>
  )
}
