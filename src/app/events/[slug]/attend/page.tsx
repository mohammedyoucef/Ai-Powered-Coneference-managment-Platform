'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api, refreshData, useDemoData, useHydrated } from '@/lib/demo/storage'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

function AttendInner() {
  const params = useParams<{ slug: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [payMsg, setPayMsg] = useState<string | null>(null)

  const conf = data.conferences.find((c) => c.slug === params.slug) ?? null
  const user = data.currentUser
  const existing = user && conf ? data.visitorApplications.find((a) => a.conferenceId === conf.id && a.visitorId === user.id) : undefined

  if (!hydrated) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>

  if (!conf) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h1 className="font-medium text-[#111827]">Event not available</h1>
          <p className="text-sm text-[#64748B]">This event may be private or unpublished. <Link href="/events" className="underline underline-offset-4">Browse public events</Link>.</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h1 className="font-medium text-[#111827]">Sign in as a Visitor to apply</h1>
          <p className="text-sm text-[#64748B]">Applying to attend “{conf.title}” requires a Visitor account so the organizer can review your application and notify you of the decision.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/login?next=${encodeURIComponent(`/events/${conf.slug}/attend`)}`}>Sign in</Link></Button>
            <Button asChild variant="outline"><Link href={`/register?type=visitor&next=${encodeURIComponent(`/events/${conf.slug}/attend`)}`}>Register as Visitor</Link></Button>
          </div>
        </div>
      </div>
    )
  }

  if (user.accountType !== 'visitor') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-lg border p-6 flex flex-col gap-3">
          <h1 className="font-medium text-[#111827]">Visitor account required</h1>
          <p className="text-sm text-[#64748B]">You are signed in as a {user.accountType}. Attendee applications require a Visitor account; your {user.accountType} account keeps its own permissions and cannot register as an attendee.</p>
          <div><Button asChild variant="outline"><Link href="/dashboard">Go to my dashboard</Link></Button></div>
        </div>
      </div>
    )
  }

  const questions = conf.eligibilityQuestions ?? []
  const fee = (conf.participationFeeCents ?? 0) / 100

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!conf) return
    setBusy(true); setError(null)
    try {
      const form = new FormData()
      form.set('answers', JSON.stringify(answers))
      if (documentFile) form.set('document', documentFile)
      const result = await api<{ application: { status: string; paymentStatus: string } }>(`/api/conferences/${conf.id}/visitor-applications`, { method: 'POST', body: form })
      await refreshData()
      setDone(`Application submitted. Status: ${result.application.status} · Payment: ${result.application.paymentStatus}. Track it on your dashboard.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application failed.')
    } finally { setBusy(false) }
  }

  async function tryPay() {
    if (!existing) return
    setPayMsg(null)
    try {
      await api(`/api/visitor-applications/${existing.id}/payment`, { method: 'POST', body: '{}' })
      setPayMsg('Payment completed.')
    } catch (err) {
      setPayMsg(err instanceof Error ? err.message : 'Payment unavailable.')
    }
  }

  async function cancel() {
    if (!existing) return
    setBusy(true); setError(null)
    try {
      await api(`/api/visitor-applications/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })
      await refreshData()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel.') } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm text-slate-500"><Link href={`/events/${conf.slug}`} className="underline underline-offset-4">← Back to {conf.title}</Link></p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Apply to attend</h1>
      <p className="mt-1 text-sm text-slate-500">
        {fee > 0 ? `Participation fee: ${fee} ${conf.feeCurrency || 'USD'}. ` : 'Free event. '}
        {conf.registrationMode === 'auto' && fee === 0 ? 'Admission is automatic.' : 'The organizer reviews each application and makes the final decision.'}
        {conf.eligibilityCriteria?.length ? <> Eligibility: {conf.eligibilityCriteria.join('; ')}.</> : null}
      </p>

      {existing && !done ? (
        <div className="mt-6 rounded-lg border p-6 flex flex-col gap-3">
          <h2 className="font-medium text-[#111827]">Your application</h2>
          <p className="text-sm text-[#64748B]">Status: <span className="font-medium text-[#111827]">{existing.status}</span> · Payment: <span className="font-medium text-[#111827]">{existing.paymentStatus}</span></p>
          {existing.paymentStatus === 'unconfigured' || existing.paymentStatus === 'pending' ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[#64748B]">Payment status is kept separate from admission. No payment has been marked as received.</p>
              <div><Button size="sm" variant="outline" onClick={() => void tryPay()}>Pay {fee} {conf.feeCurrency || 'USD'}</Button></div>
              {payMsg ? <p className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">{payMsg}</p> : null}
            </div>
          ) : null}
          {existing.status !== 'approved' && existing.status !== 'rejected' ? <div><Button size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}>Cancel application</Button></div> : null}
          <div><Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/dashboard">Track on dashboard</Link></Button></div>
        </div>
      ) : done ? (
        <p role="status" className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>
      ) : (
        <form onSubmit={submit} className="mt-6 rounded-lg border p-6 flex flex-col gap-4">
          {questions.length ? questions.map((q) => (
            <div key={q} className="flex flex-col gap-2">
              <label htmlFor={`q-${q}`} className="text-sm font-medium">{q}</label>
              <textarea id={`q-${q}`} required rows={3} value={answers[q] ?? ''} onChange={(e) => setAnswers((prev) => ({ ...prev, [q]: e.target.value }))} className={inputCls} />
            </div>
          )) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="motivation" className="text-sm font-medium">Anything the organizer should know? (optional)</label>
              <textarea id="motivation" rows={3} value={answers['Additional information'] ?? ''} onChange={(e) => setAnswers((prev) => ({ ...prev, 'Additional information': e.target.value }))} className={inputCls} />
            </div>
          )}
          {(conf.requiredDocuments?.length ?? 0) > 0 ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="document" className="text-sm font-medium">Supporting document (PDF required: {conf.requiredDocuments!.join(', ')})</label>
              <input id="document" type="file" accept="application/pdf,.pdf" required onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)} className="rounded-md border px-3 py-2 text-sm" />
              <span className="text-xs text-[#64748B]">Stored on the server; only you and the event organizers can open it.</span>
            </div>
          ) : null}
          {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="bg-[#4F46E5] hover:bg-[#4338CA]">{busy ? 'Submitting...' : 'Submit application'}</Button>
            <Button asChild type="button" variant="outline"><Link href={`/events/${conf.slug}`}>Cancel</Link></Button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function AttendPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>}>
      <AttendInner />
    </Suspense>
  )
}
