'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import { ConferenceForm } from '@/components/conferences/conference-form'

function NewOrgConferencePageInner() {
  const params = useParams<{ slug: string }>()
  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Create conference</h1>
        <p className="text-sm text-[#64748B]">Describe the event, save the draft, then generate its website with AI.</p>
      </header>
      <ConferenceForm lockedOrgSlug={params.slug} />
    </div>
  )
}

export default function NewOrgConferencePage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading...</p>}>
      <NewOrgConferencePageInner />
    </Suspense>
  )
}
