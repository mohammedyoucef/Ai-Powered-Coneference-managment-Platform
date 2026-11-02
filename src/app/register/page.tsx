'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AccountTypePicker } from '@/components/auth/account-type-picker'
import { ACCOUNT_TYPE_META, type AccountType } from '@/lib/demo/types'

const inputCls = 'rounded-lg border px-3 py-2.5 text-sm w-full outline-none transition focus:border-[#4F46E5] focus:ring-2 focus:ring-indigo-100'

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/dashboard'
}

function passwordChecks(password: string) {
  return [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(password) },
    { label: 'Contains a number', ok: /[0-9]/.test(password) },
  ]
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next')
  const next = safeNext(rawNext)
  const hasExplicitNext = Boolean(rawNext)
  const loginHref = rawNext && next === rawNext ? `/login?next=${encodeURIComponent(next)}` : '/login'
  const typeParam = searchParams.get('type')

  const [accountType, setAccountType] = useState<AccountType>(
    typeParam === 'reviewer' || typeParam === 'organizer' || typeParam === 'researcher' || typeParam === 'visitor' ? typeParam : 'researcher',
  )
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [affiliation, setAffiliation] = useState('')
  const [position, setPosition] = useState('')
  const [contact, setContact] = useState('')
  const [expertise, setExpertise] = useState('')
  const [researchInterests, setResearchInterests] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [orcid, setOrcid] = useState('')
  const [attendeeInfo, setAttendeeInfo] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const csv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean)

  const checks = passwordChecks(password)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!checks.every((c) => c.ok)) {
      setError('Password must be 8+ characters with a letter and a number.')
      return
    }
    if (!termsAccepted) {
      setError('Please accept the terms and privacy policy to continue.')
      return
    }
    setSubmitting(true)
    try {
      const profile =
        accountType === 'organizer'
          ? { position: position.trim() || undefined, contact: contact.trim() || undefined }
          : accountType === 'reviewer'
            ? { expertise: csv(expertise), researchInterests: csv(researchInterests), qualifications: qualifications.trim() || undefined }
            : accountType === 'researcher'
              ? { researchInterests: csv(researchInterests), orcid: orcid.trim() || undefined }
              : { attendeeInfo: attendeeInfo.trim() || undefined }
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          password,
          affiliation: affiliation.trim() || undefined,
          accountType,
          termsAccepted,
          profile,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || `Registration failed (HTTP ${res.status}).`)
        return
      }
      const dest = hasExplicitNext
        ? next
        : accountType === 'organizer'
          ? '/organizations/new'
          : accountType === 'reviewer'
            ? '/review'
            : accountType === 'visitor'
              ? '/events'
              : '/conferences'
      router.push(dest)
      router.refresh()
    } catch {
      setError('Could not reach the server. Is the app running?')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#4F46E5]">
            <span className="text-lg font-bold text-white">C</span>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Create your account</h1>
        <p className="mt-2 text-sm text-gray-600">Get started with Confexa today</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-6 rounded-lg border bg-white shadow-sm p-6 md:p-8">
        <AccountTypePicker value={accountType} onChange={setAccountType} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="displayName" className="text-sm font-medium text-gray-700">Full name</label>
            <input
              id="displayName"
              required
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your full name"
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="affiliation" className="text-sm font-medium text-gray-700">Affiliation <span className="font-normal text-gray-500">(optional)</span></label>
          <input
            id="affiliation"
            autoComplete="organization"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            placeholder="Your organization or institution"
            className={inputCls}
          />
        </div>
        {accountType === 'organizer' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="position" className="text-sm font-medium">Position / role</label>
              <input id="position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Program Chair" className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="contact" className="text-sm font-medium">Contact <span className="font-normal text-[#64748B]">(optional)</span></label>
              <input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or alternate email" className={inputCls} />
            </div>
          </div>
        ) : null}
        {accountType === 'reviewer' ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="expertise" className="text-sm font-medium">Areas of expertise <span className="font-normal text-[#64748B]">(comma separated)</span></label>
              <input id="expertise" value={expertise} onChange={(e) => setExpertise(e.target.value)} placeholder="e.g. Machine Learning, Security" className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="qualifications" className="text-sm font-medium">Qualifications / experience <span className="font-normal text-[#64748B]">(optional)</span></label>
              <textarea id="qualifications" value={qualifications} onChange={(e) => setQualifications(e.target.value)} rows={2} className={inputCls} />
            </div>
          </div>
        ) : null}
        {accountType === 'reviewer' || accountType === 'researcher' ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="researchInterests" className="text-sm font-medium">Research interests <span className="font-normal text-[#64748B]">(comma separated)</span></label>
            <input id="researchInterests" value={researchInterests} onChange={(e) => setResearchInterests(e.target.value)} placeholder="e.g. NLP, Computer Vision" className={inputCls} />
          </div>
        ) : null}
        {accountType === 'researcher' ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="orcid" className="text-sm font-medium">ORCID <span className="font-normal text-[#64748B]">(optional)</span></label>
            <input id="orcid" value={orcid} onChange={(e) => setOrcid(e.target.value)} placeholder="0000-0000-0000-0000" className={inputCls} />
          </div>
        ) : null}
        {accountType === 'visitor' ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="attendeeInfo" className="text-sm font-medium">Attendee information <span className="font-normal text-[#64748B]">(optional)</span></label>
            <textarea id="attendeeInfo" value={attendeeInfo} onChange={(e) => setAttendeeInfo(e.target.value)} rows={2} placeholder="Anything organizers should know (affiliation, accessibility needs...)" className={inputCls} />
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          <ul className="flex flex-col gap-0.5 text-xs">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? 'text-emerald-700' : 'text-[#64748B]'}>
                {c.ok ? '✓' : '•'} {c.label}
              </li>
            ))}
          </ul>
        </div>
        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#4F46E5] focus:ring-[#4F46E5]" />
          <span>I accept the terms of service and privacy policy</span>
        </label>
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full bg-[#4F46E5] py-3 text-base hover:bg-[#4338CA]">
          {submitting ? 'Creating account...' : 'Create account'}
        </Button>
        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href={loginHref} className="font-medium text-[#4F46E5] hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading registration...</p>}>
      <RegisterForm />
    </Suspense>
  )
}
