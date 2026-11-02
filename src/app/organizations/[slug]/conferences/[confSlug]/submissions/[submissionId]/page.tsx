'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SubmissionDetail } from '@/components/submissions/submission-detail'
import { useDemoData, useHydrated } from '@/lib/demo/storage'

function SubmissionDetailInner() {
  const params = useParams<{ slug: string; confSlug: string; submissionId: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()
  const org = data.organizations.find((o) => o.slug === params.slug) ?? null
  const conf = org ? data.conferences.find((c) => c.organizationId === org.id && c.slug === params.confSlug) ?? null : null
  const submission = conf ? data.submissions.find((s) => s.id === params.submissionId && s.conferenceId === conf.id) ?? null : null

  if (!hydrated) return <p className="text-sm text-[#64748B]">Loading submission...</p>
  if (!org || !conf || !submission) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Submission not found</h1>
        <p className="text-sm text-[#64748B]">This submission does not exist or you are not authorized to view it.</p>
        <div><Button asChild><Link href="/submissions">Back to submissions</Link></Button></div>
      </div>
    )
  }

  return <SubmissionDetail conference={conf} organization={org} submission={submission} listHref={`/organizations/${org.slug}/conferences/${conf.slug}/submissions`} />
}

export default function SubmissionDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading submission...</p>}>
      <SubmissionDetailInner />
    </Suspense>
  )
}
