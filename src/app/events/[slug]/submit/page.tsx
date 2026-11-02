'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { SubmissionForm } from '@/components/submissions/submission-form'
import { useDemoData, useHydrated } from '@/lib/demo/storage'

function EventSubmitInner() {
  const params = useParams<{ slug: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()
  const conf = data.conferences.find((c) => c.slug === params.slug) ?? null
  const org = conf ? data.organizations.find((o) => o.id === conf.organizationId) ?? null : null

  if (!hydrated) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>

  if (!conf || !org) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Conference not found</h1>
        <p className="max-w-md text-sm text-slate-500">This conference is not published or does not exist. Sign in and check the address.</p>
        <Link href="/dashboard" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Go to dashboard</Link>
      </div>
    )
  }

  const base = `/organizations/${org.slug}/conferences/${conf.slug}`
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm text-slate-500"><Link href={`/events/${conf.slug}`} className="underline underline-offset-4">← Back to {conf.title}</Link></p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Submit a paper</h1>
      <p className="mt-1 text-sm text-slate-500">Your PDF is uploaded to the server and stored securely. Assigned reviewers and organizers can access it from their dashboards.</p>
      <div className="mt-6">
        <SubmissionForm conference={conf} organization={org} backHref={`/events/${conf.slug}`} successHref={(id) => `${base}/submissions/${id}`} />
      </div>
    </div>
  )
}

export default function EventSubmitPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>}>
      <EventSubmitInner />
    </Suspense>
  )
}
