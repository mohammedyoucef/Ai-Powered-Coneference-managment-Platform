'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SubmissionForm } from '@/components/submissions/submission-form'
import { useDemoData, useHydrated } from '@/lib/demo/storage'

function NewSubmissionInner() {
  const params = useParams<{ slug: string; confSlug: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()
  const org = data.organizations.find((o) => o.slug === params.slug) ?? null
  const conf = org ? data.conferences.find((c) => c.organizationId === org.id && c.slug === params.confSlug) ?? null : null

  if (!hydrated) return <p className="text-sm text-[#64748B]">Loading...</p>
  if (!org || !conf) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Conference not found</h1>
        <div><Button asChild><Link href="/conferences">Back to conferences</Link></Button></div>
      </div>
    )
  }

  const base = `/organizations/${org.slug}/conferences/${conf.slug}`
  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Submit a paper</h1>
        <p className="text-sm text-[#64748B]">PDF manuscript required (max 10 MB). After submitting, reviewers and the AI reviewer can assess it; the chair makes the final decision.</p>
      </header>
      <SubmissionForm conference={conf} organization={org} backHref={`${base}/submissions`} successHref={(id) => `${base}/submissions/${id}`} />
    </div>
  )
}

export default function NewSubmissionPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading...</p>}>
      <NewSubmissionInner />
    </Suspense>
  )
}
