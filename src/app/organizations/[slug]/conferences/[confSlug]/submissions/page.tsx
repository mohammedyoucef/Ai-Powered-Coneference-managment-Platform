'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getWebsiteConfig, saveWebsiteConfig, useDemoData, useHydrated } from '@/lib/demo/storage'
import { canManageOrganization } from '@/lib/demo/permissions'
import { useProfile } from '@/lib/demo/profile'
import type { WebsiteSection } from '@/lib/demo/types'

function ConferenceSubmissionsInner() {
  const params = useParams<{ slug: string; confSlug: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()
  const profile = useProfile()
  const [message, setMessage] = useState<string | null>(null)

  const org = data.organizations.find((o) => o.slug === params.slug) ?? null
  const conf = org ? data.conferences.find((c) => c.organizationId === org.id && c.slug === params.confSlug) ?? null : null
  const subs = conf ? data.submissions.filter((s) => s.conferenceId === conf.id) : []
  const isChair = profile.role === 'chair' || profile.role === 'organizer'

  if (!hydrated) return <p className="text-sm text-[#64748B]">Loading submissions...</p>
  if (!org || !conf) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Conference not found</h1>
        <div><Button asChild><Link href="/conferences">Back to conferences</Link></Button></div>
      </div>
    )
  }

  if (!canManageOrganization(data, org.id)) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Organizer access required</h1>
        <p className="text-sm text-[#64748B]">Managing this conference&apos;s submissions is reserved for its organizers. You can track and edit your own papers under My submissions.</p>
        <div><Button asChild variant="outline"><Link href="/submissions">My submissions</Link></Button></div>
      </div>
    )
  }

  const base = `/organizations/${org.slug}/conferences/${conf.slug}`
  const counts = {
    total: subs.length,
    review: subs.filter((s) => s.status === 'Under Review').length,
    accepted: subs.filter((s) => s.status === 'Accepted').length,
    submitted: subs.filter((s) => s.status === 'Submitted').length,
  }

  function publishAccepted() {
    if (!conf) return
    const draft = getWebsiteConfig(conf.id)
    if (!draft) { setMessage('Generate the conference website first, then publish accepted papers into it.'); return }
    const accepted = subs.filter((s) => s.status === 'Accepted')
    if (accepted.length === 0) { setMessage('No accepted papers yet. Accept a submission first (Chair controls on its detail page).'); return }
    const papers = accepted.map((s) => ({ title: s.title, authors: s.authors.join(', ') }))
    const researcherMap = new Map<string, { name: string; affiliation: string; focus: string }>()
    for (const s of accepted) {
      for (const author of s.authors) {
        if (!researcherMap.has(author)) researcherMap.set(author, { name: author, affiliation: '', focus: s.topics.join(', ') })
      }
    }
    const researchers = [...researcherMap.values()]
    let sections: WebsiteSection[] = draft.sections.map((s) => {
      if (s.type === 'accepted-papers') return { ...s, enabled: true, content: { ...s.content, title: 'Accepted papers', papers } }
      if (s.type === 'researchers' && researchers.length > 0) return { ...s, enabled: true, content: { ...s.content, title: 'Featured researchers', researchers } }
      return s
    })
    if (!sections.some((s) => s.type === 'accepted-papers')) {
      sections = [...sections, { id: `sec_${Date.now().toString(36)}`, type: 'accepted-papers' as const, enabled: true, order: sections.length, content: { title: 'Accepted papers', papers } }]
    }
    if (researchers.length > 0 && !sections.some((s) => s.type === 'researchers')) {
      sections = [...sections, { id: `sec_${Date.now().toString(36)}_r`, type: 'researchers' as const, enabled: true, order: sections.length, content: { title: 'Featured researchers', researchers } }]
    }
    saveWebsiteConfig({ ...draft, sections })
    setMessage(`${papers.length} accepted paper(s) and ${researchers.length} researcher(s) written to the website draft. Open the website editor and (re-)publish to make them public.`)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#64748B]"><Link href={base} className="underline underline-offset-4">{conf.title}</Link> · {org.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111827]">Submissions</h1>
          <p className="text-sm text-[#64748B]">{counts.total} total · {counts.submitted} submitted · {counts.review} under review · {counts.accepted} accepted</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isChair ? <Button variant="outline" size="sm" onClick={publishAccepted}>Publish accepted to website</Button> : null}
          <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`${base}/submissions/new`}>Submit a paper</Link></Button>
        </div>
      </header>

      {message ? <p className="rounded-md border bg-slate-50 px-3 py-2 text-sm">{message}</p> : null}

      {subs.length === 0 ? (
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-[#111827]">No submissions yet</h2>
          <p className="text-sm text-[#64748B]">Authors can submit a PDF manuscript with title, abstract, authors, and topics. Papers then move through review to a chair decision.</p>
          <div><Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`${base}/submissions/new`}>Submit the first paper</Link></Button></div>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {[...subs].reverse().map((s) => {
            const reviewCount = data.reviews.filter((r) => r.submissionId === s.id).length
            const ai = data.aiReviews.filter((r) => r.submissionId === s.id).pop()
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-[#111827]">{s.title}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                    <span>{s.authors.join(', ') || 'Unknown authors'}</span>
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5">{s.status}</span>
                    <span>{reviewCount} human review(s)</span>
                    {ai ? <span>AI {ai.overallScore}/10 ({ai.source})</span> : <span>no AI review</span>}
                    {s.assignedReviewer ? <span>→ {s.assignedReviewer}</span> : null}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm"><Link href={`${base}/submissions/${s.id}`}>Open & review</Link></Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ConferenceSubmissionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading submissions...</p>}>
      <ConferenceSubmissionsInner />
    </Suspense>
  )
}
