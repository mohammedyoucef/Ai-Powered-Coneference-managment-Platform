'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { WebsiteRenderer } from '@/components/website/website-renderer'
import { api, refreshData, useDemoData, useHydrated } from '@/lib/demo/storage'
import type { Conference } from '@/lib/demo/types'

function fmt(date?: string) {
  if (!date) return 'Not announced'
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Account-aware destinations: submitting needs a Researcher account and
 * attending needs a Visitor account, so anyone else is sent to register
 * as that type first (and lands back here afterwards via ?next=). */
export function eventCtaHrefs(conference: Conference, accountType?: string | null) {
  const slug = conference.slug
  return {
    submit: accountType === 'researcher' || accountType === 'organizer'
      ? `/events/${slug}/submit`
      : `/register?type=researcher&next=${encodeURIComponent(`/events/${slug}/submit`)}`,
    attend: accountType === 'visitor'
      ? `/events/${slug}/attend`
      : `/register?type=visitor&next=${encodeURIComponent(`/events/${slug}/attend`)}`,
  }
}

function isOnSite(conference: Conference): boolean {
  const venue = `${conference.venueOrFormat ?? ''} ${conference.city ?? ''} ${conference.country ?? ''}`.trim()
  if (!venue) return false
  if (/^(online|virtual|remote|fully online|online only)\b/i.test(conference.venueOrFormat ?? '')) return false
  return true
}

function EventCountdown({ conference }: { conference: Conference }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const deadline = conference.submissionDeadline ? new Date(`${conference.submissionDeadline}T23:59:59`).getTime() : NaN
  const start = conference.startDate ? new Date(`${conference.startDate}T09:00:00`).getTime() : NaN
  const target = !Number.isNaN(deadline) && deadline > now
    ? { at: deadline, label: 'Paper submissions close in' }
    : !Number.isNaN(start) && start > now
      ? { at: start, label: 'The conference starts in' }
      : null
  if (!target) return null
  const diff = Math.max(0, target.at - now)
  const parts = [
    { v: Math.floor(diff / 86400000), l: 'days' },
    { v: Math.floor(diff / 3600000) % 24, l: 'hrs' },
    { v: Math.floor(diff / 60000) % 60, l: 'min' },
    { v: Math.floor(diff / 1000) % 60, l: 'sec' },
  ]
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{target.label}</p>
      <div className="mt-2 flex gap-2">
        {parts.map((p) => (
          <div key={p.l} className="min-w-16 rounded-lg bg-indigo-600 px-3 py-2 text-center text-white shadow">
            <span className="block text-xl font-bold tabular-nums leading-none">{String(p.v).padStart(2, '0')}</span>
            <span className="mt-1 block text-[10px] font-medium uppercase tracking-wider opacity-80">{p.l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Role-aware actions under the published site / detail fallback. */
function EventActions({ conference }: { conference: Conference }) {
  const data = useDemoData()
  const user = data.currentUser
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const slug = conference.slug
  const myVisitorApp = user ? data.visitorApplications.find((a) => a.conferenceId === conference.id && a.visitorId === user.id) : undefined
  const myReviewerApp = user ? data.reviewerApplications.find((a) => a.conferenceId === conference.id && a.reviewerId === user.id) : undefined
  const announcements = data.announcements.filter((a) => a.conferenceId === conference.id)

  async function applyToReview() {
    setBusy(true); setError(null); setMsg(null)
    try {
      await api(`/api/conferences/${conference.id}/reviewer-applications`, { method: 'POST', body: JSON.stringify({}) })
      setMsg('Reviewer application submitted. The organizer must approve it before any papers can be assigned to you.')
      await refreshData()
    } catch (err) { setError(err instanceof Error ? err.message : 'Application failed.') } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="font-medium text-slate-900">Participate in {conference.title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {conference.submissionsEnabled === false ? 'Paper submissions are disabled for this event. ' : `Paper submissions ${conference.submissionDeadline ? `close ${fmt(conference.submissionDeadline)}` : 'are open'}. `}
          {conference.registrationEnabled === false ? 'Attendee registration is disabled.' : (conference.participationFeeCents ?? 0) > 0 ? `Attendee fee: ${(conference.participationFeeCents ?? 0) / 100} ${conference.feeCurrency || 'USD'} (${conference.registrationMode === 'auto' ? 'automatic admission after payment' : 'organizer approval'}).` : `Free attendance (${conference.registrationMode === 'auto' ? 'automatic admission' : 'organizer approval'}).`}
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <EventCountdown conference={conference} />
          <div className="flex flex-wrap gap-2">
            {isOnSite(conference) ? (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([conference.venueOrFormat, conference.city, conference.country].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50">
                View address
              </a>
            ) : null}
            {conference.registrationEnabled !== false && user?.accountType !== 'visitor' ? (
              <Link href={eventCtaHrefs(conference, user?.accountType).attend} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                Register to attend
              </Link>
            ) : null}
            {conference.submissionsEnabled !== false && user?.accountType !== 'researcher' && user?.accountType !== 'organizer' ? (
              <Link href={eventCtaHrefs(conference, user?.accountType).submit} className="rounded-md border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
                Submit a paper
              </Link>
            ) : null}
          </div>
        </div>
        {!user ? (
          <p className="mt-3 text-sm text-slate-500">
            <Link href={`/login?next=${encodeURIComponent(`/events/${slug}`)}`} className="font-medium text-indigo-600 underline underline-offset-4">Sign in</Link> or <Link href="/register" className="font-medium text-indigo-600 underline underline-offset-4">create an account</Link> with the role you need: Researcher to submit a paper, Reviewer to review, Visitor to attend.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {user.accountType === 'researcher' && conference.submissionsEnabled !== false ? (
              <Link href={`/events/${slug}/submit`} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Submit a paper</Link>
            ) : null}
            {user.accountType === 'visitor' && conference.registrationEnabled !== false ? (
              myVisitorApp
                ? <span className="rounded-md border px-4 py-2 text-sm">Your application: <span className="font-medium">{myVisitorApp.status}</span> · payment: {myVisitorApp.paymentStatus}</span>
                : <Link href={`/events/${slug}/attend`} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Apply to attend</Link>
            ) : null}
            {user.accountType === 'reviewer' && conference.reviewerMode !== 'invitations' ? (
              myReviewerApp
                ? <span className="rounded-md border px-4 py-2 text-sm">Reviewer application: <span className="font-medium">{myReviewerApp.status}</span></span>
                : <button type="button" disabled={busy} onClick={() => void applyToReview()} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">{busy ? 'Applying...' : 'Apply to review'}</button>
            ) : null}
            {user.accountType === 'organizer' ? (
              <Link href="/dashboard" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50">Open organizer dashboard</Link>
            ) : null}
          </div>
        )}
        {user && user.accountType !== 'visitor' && conference.registrationEnabled !== false && user.accountType !== 'organizer' ? (
          <p className="mt-2 text-xs text-slate-500">Attendee registration requires a Visitor account — your {user.accountType} account cannot register as an attendee.</p>
        ) : null}
        {user && user.accountType !== 'researcher' && conference.submissionsEnabled !== false && user.accountType !== 'organizer' ? (
          <p className="mt-1 text-xs text-slate-500">Paper submission requires a Researcher account.</p>
        ) : null}
        {msg ? <p role="status" className="mt-3 text-sm text-emerald-700">{msg}</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      </section>
      {announcements.length ? (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="font-medium text-slate-900">Announcements</h2>
          <ul className="mt-2 flex flex-col gap-2">{announcements.map((a) => <li key={a.id} className="text-sm"><span className="font-medium text-slate-900">{a.title}</span>{a.body ? <span className="block text-slate-500">{a.body}</span> : null}</li>)}</ul>
        </section>
      ) : null}
    </div>
  )
}

function EventDetailFallback({ conference, organizationName }: { conference: Conference; organizationName?: string }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-[#312E81] via-[#4F46E5] to-violet-600 px-4 py-12 text-white">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">{organizationName || 'Confexa event'}{conference.visibility === 'private' ? ' · Private event' : ''}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{conference.title}</h1>
          {conference.shortDescription ? <p className="mt-2 max-w-2xl text-indigo-100">{conference.shortDescription}</p> : null}
          <p className="mt-3 text-sm text-indigo-100">{fmt(conference.startDate)}{conference.endDate ? ` – ${fmt(conference.endDate)}` : ''}{[conference.city, conference.country].filter(Boolean).length ? ` · ${[conference.city, conference.country].filter(Boolean).join(', ')}` : ''}{conference.venueOrFormat ? ` · ${conference.venueOrFormat}` : ''}</p>
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-3">
        <section className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="font-medium text-slate-900">About</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{conference.fullDescription || conference.shortDescription || 'Details will be announced by the organizers.'}</p>
          {conference.researchTopics.length ? <p className="mt-3 flex flex-wrap gap-1.5">{conference.researchTopics.map((t) => <span key={t} className="rounded-full border px-2 py-0.5 text-xs">{t}</span>)}</p> : null}
          {conference.submissionGuidelines ? <><h3 className="mt-5 font-medium text-slate-900">Submission guidelines</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{conference.submissionGuidelines}</p></> : null}
        </section>
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="font-medium text-slate-900">Key information</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Submission deadline</dt><dd className="font-medium text-slate-900">{fmt(conference.submissionDeadline)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Registration deadline</dt><dd className="font-medium text-slate-900">{fmt(conference.registrationDeadline)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Fee</dt><dd className="font-medium text-slate-900">{(conference.participationFeeCents ?? 0) > 0 ? `${(conference.participationFeeCents ?? 0) / 100} ${conference.feeCurrency || 'USD'}` : 'Free'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Contact</dt><dd className="font-medium text-slate-900">{conference.contactEmail || 'Not provided'}</dd></div>
          </dl>
          {conference.eligibilityCriteria?.length ? <><h3 className="mt-4 text-sm font-medium text-slate-900">Eligibility</h3><ul className="mt-1 list-disc pl-5 text-sm text-slate-600">{conference.eligibilityCriteria.map((c) => <li key={c}>{c}</li>)}</ul></> : null}
        </section>
      </div>
      <EventActions conference={conference} />
    </div>
  )
}

function PublicEventPageInner() {
  const params = useParams<{ slug: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()

  const conference = data.conferences.find((c) => c.slug === params.slug) ?? null
  const config = conference ? data.publishedWebsiteConfigs.find((w) => w.conferenceId === conference.id) ?? null : null
  const organization = conference ? data.organizations.find((o) => o.id === conference.organizationId) ?? null : null

  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading conference site...</div>
  }

  if (!conference) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">This event is not available here</h1>
        <p className="max-w-md text-sm leading-relaxed text-slate-500">
          “{params.slug}” may be a draft, a private event you have not been invited to, or an incorrect address. Private events never appear in the public directory.
        </p>
        <Link href="/events" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Browse public events</Link>
      </div>
    )
  }

  // Published event without a generated website: render its saved record.
  if (!config) {
    return (
      <div>
        <EventDetailFallback conference={conference} organizationName={organization?.name} />
        <EventActions conference={conference} />
      </div>
    )
  }

  // AI-authored landing pages already include their own layout/CTAs.
  // Render only the AI page to avoid duplicating participation blocks.
  if (config.generationMode === 'ai-page' && config.customHtml) {
    return (
      <div>
        <WebsiteRenderer
          config={config}
          conferenceSlug={conference.slug}
          submitHref={eventCtaHrefs(conference, data.currentUser?.accountType).submit}
          attendHref={eventCtaHrefs(conference, data.currentUser?.accountType).attend}
          organizationName={organization?.name}
          eventDates={{ startDate: conference.startDate, submissionDeadline: conference.submissionDeadline }}
          stats={(() => {
            const subs = data.submissions.filter((s) => s.conferenceId === conference.id)
            const authors = new Set(subs.flatMap((s) => s.authors))
            return [
              { label: 'Papers submitted', value: subs.length },
              { label: 'Papers accepted', value: subs.filter((s) => s.status === 'Accepted').length },
              { label: 'Contributing authors', value: authors.size },
              { label: 'Research topics', value: conference.researchTopics.length },
            ]
          })()}
        />
      </div>
    )
  }

  return (
    <div>
      <WebsiteRenderer
        config={config}
        conferenceSlug={conference.slug}
        submitHref={eventCtaHrefs(conference, data.currentUser?.accountType).submit}
        attendHref={eventCtaHrefs(conference, data.currentUser?.accountType).attend}
        organizationName={organization?.name}
        eventDates={{ startDate: conference.startDate, submissionDeadline: conference.submissionDeadline }}
        stats={(() => {
          const subs = data.submissions.filter((s) => s.conferenceId === conference.id)
          const authors = new Set(subs.flatMap((s) => s.authors))
          return [
            { label: 'Papers submitted', value: subs.length },
            { label: 'Papers accepted', value: subs.filter((s) => s.status === 'Accepted').length },
            { label: 'Contributing authors', value: authors.size },
            { label: 'Research topics', value: conference.researchTopics.length },
          ]
        })()}
      />
      {/* Participation actions live below the site, not above its hero. */}
      <EventActions conference={conference} />
    </div>
  )
}

export default function PublicEventPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading conference site...</div>}>
      <PublicEventPageInner />
    </Suspense>
  )
}
