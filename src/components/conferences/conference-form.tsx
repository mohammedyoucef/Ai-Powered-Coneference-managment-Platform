'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api, apiCreateConference, slugify, useDemoData, useHydrated } from '@/lib/demo/storage'
import { Avatar } from '@/components/ui/avatar'
import { CoverImageField } from './cover-image-field'

type DirectoryUser = { id: string; displayName: string; email: string; accountType: string; affiliation?: string; avatarUrl?: string; expertise?: string[] }
import { getAIRequestHeaders } from '@/lib/demo/profile'
import type { Conference } from '@/lib/demo/types'

type Draft = {
  title: string
  shortDescription: string
  fullDescription: string
  researchTopics: string[]
  startDate?: string
  endDate?: string
  submissionDeadline?: string
  venueOrFormat?: string
  language?: string
  websiteContactEmail?: string
}

type WizardDraft = {
  step: number
  orgId: string
  slugTouched: boolean
  title: string
  slug: string
  category: string
  conferenceType: string
  shortDesc: string
  fullDesc: string
  startDate: string
  endDate: string
  submissionDeadline: string
  cameraReadyDeadline: string
  venueOrFormat: string
  city: string
  country: string
  language: string
  contactEmail: string
  visibility: 'public' | 'private'
  primaryColor: string
  accentColor: string
  logoUrl: string
  coverImageUrl: string
  topics: string
  submissionTypes: string
  guidelines: string
  reviewMethod: 'single_blind' | 'double_blind'
  reviewCriteria: string
}

const STORAGE_KEY = 'confexa_conf_wizard_v1'

const STEPS = [
  'Basic info',
  'Dates & venue',
  'Branding',
  'Research scope',
  'Review config',
  'Review & create',
] as const

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'
const labelCls = 'text-sm font-medium'

function parseCsv(value: string): string[] {
  return value.split(',').map((t) => t.trim()).filter(Boolean)
}

export function ConferenceForm({ lockedOrgSlug }: { lockedOrgSlug?: string }) {
  const router = useRouter()
  const data = useDemoData()
  const hydrated = useHydrated()
  const orgs = data.organizations

  const [step, setStep] = useState(1)
  const [orgId, setOrgId] = useState('')

  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiLabel, setAiLabel] = useState<string | null>(null)
  const [generated, setGenerated] = useState<Set<string>>(new Set())

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [category, setCategory] = useState('')
  const [conferenceType, setConferenceType] = useState('')
  const [shortDesc, setShortDesc] = useState('')
  const [fullDesc, setFullDesc] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [submissionDeadline, setSubmissionDeadline] = useState('')
  const [cameraReadyDeadline, setCameraReadyDeadline] = useState('')
  const [venueOrFormat, setVenueOrFormat] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [language, setLanguage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [primaryColor, setPrimaryColor] = useState('#4F46E5')
  const [accentColor, setAccentColor] = useState('#0EA5E9')
  const [logoUrl, setLogoUrl] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [topics, setTopics] = useState('')
  const [submissionTypes, setSubmissionTypes] = useState('')
  const [guidelines, setGuidelines] = useState('')
  const [reviewMethod, setReviewMethod] = useState<'single_blind' | 'double_blind'>('double_blind')
  const [reviewCriteria, setReviewCriteria] = useState('Novelty, Technical quality, Clarity, Significance')
  const [submissionsEnabled, setSubmissionsEnabled] = useState(true)
  const [registrationEnabled, setRegistrationEnabled] = useState(true)
  const [registrationMode, setRegistrationMode] = useState<'auto' | 'approval'>('approval')
  const [feeAmount, setFeeAmount] = useState('0')
  const [feeCurrency, setFeeCurrency] = useState('USD')
  const [capacity, setCapacity] = useState('')
  const [registrationDeadline, setRegistrationDeadline] = useState('')
  const [eligibilityCriteria, setEligibilityCriteria] = useState('')
  const [eligibilityQuestions, setEligibilityQuestions] = useState('')
  const [requiredDocuments, setRequiredDocuments] = useState('')
  const [reviewerMode, setReviewerMode] = useState<'applications' | 'invitations' | 'both'>('both')
  const [reviewDeadline, setReviewDeadline] = useState('')
  const [maxFileSizeMb, setMaxFileSizeMb] = useState('10')

  const [directory, setDirectory] = useState<DirectoryUser[]>([])
  const [orgMembers, setOrgMembers] = useState<any[]>([])
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([])
  const [created, setCreated] = useState<{ slug: string; orgSlug: string; inviteFailures: string[] } | null>(null)

  const lockedOrg = lockedOrgSlug ? orgs.find((o) => o.slug === lockedOrgSlug) : undefined
  const selectedOrg = lockedOrg ?? orgs.find((o) => o.id === orgId) ?? orgs[0]

  useEffect(() => {
    fetch('/api/users/directory', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setDirectory(Array.isArray(d.users) ? d.users : []))
      .catch(() => setDirectory([]))
  }, [])

  useEffect(() => {
    if (!selectedOrg?.id) return
    fetch(`/api/organizations/${selectedOrg.id}/members`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setOrgMembers(Array.isArray(d.members) ? d.members : []))
      .catch(() => setOrgMembers([]))
  }, [selectedOrg?.id])

  const [stepErrors, setStepErrors] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [restored, setRestored] = useState(false)
  const draftReady = useRef(false)

  // Restore an in-progress draft (save-draft / resume). localStorage is an
  // external system, so syncing it into state once on mount is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const d = JSON.parse(raw) as Partial<WizardDraft>
        if (typeof d.step === 'number') setStep(Math.min(6, Math.max(1, d.step)))
        if (d.orgId) setOrgId(d.orgId)
        if (typeof d.slugTouched === 'boolean') setSlugTouched(d.slugTouched)
        if (d.title) setTitle(d.title)
        if (d.slug) setSlug(d.slug)
        if (d.category) setCategory(d.category)
        if (d.conferenceType) setConferenceType(d.conferenceType)
        if (d.shortDesc) setShortDesc(d.shortDesc)
        if (d.fullDesc) setFullDesc(d.fullDesc)
        if (d.startDate) setStartDate(d.startDate)
        if (d.endDate) setEndDate(d.endDate)
        if (d.submissionDeadline) setSubmissionDeadline(d.submissionDeadline)
        if (d.cameraReadyDeadline) setCameraReadyDeadline(d.cameraReadyDeadline)
        if (d.venueOrFormat) setVenueOrFormat(d.venueOrFormat)
        if (d.city) setCity(d.city)
        if (d.country) setCountry(d.country)
        if (d.language) setLanguage(d.language)
        if (d.contactEmail) setContactEmail(d.contactEmail)
        if (d.visibility === 'private' || d.visibility === 'public') setVisibility(d.visibility)
        if (d.primaryColor) setPrimaryColor(d.primaryColor)
        if (d.accentColor) setAccentColor(d.accentColor)
        if (d.logoUrl) setLogoUrl(d.logoUrl)
        if (d.coverImageUrl) setCoverImageUrl(d.coverImageUrl)
        if (d.topics) setTopics(d.topics)
        if (d.submissionTypes) setSubmissionTypes(d.submissionTypes)
        if (d.guidelines) setGuidelines(d.guidelines)
        if (d.reviewMethod === 'single_blind' || d.reviewMethod === 'double_blind') setReviewMethod(d.reviewMethod)
        if (d.reviewCriteria) setReviewCriteria(d.reviewCriteria)
        setRestored(true)
      }
    } catch {
      // Corrupt draft: start fresh.
    }
    draftReady.current = true
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist every change so the wizard can be resumed later.
  useEffect(() => {
    if (!draftReady.current) return
    const draft: WizardDraft = {
      step, orgId, slugTouched, title, slug, category, conferenceType, shortDesc, fullDesc,
      startDate, endDate, submissionDeadline, cameraReadyDeadline, venueOrFormat, city, country,
      language, contactEmail, visibility, primaryColor, accentColor, logoUrl, coverImageUrl,
      topics, submissionTypes, guidelines, reviewMethod, reviewCriteria,
    }
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)) } catch { /* ignore */ }
  }, [step, orgId, slugTouched, title, slug, category, conferenceType, shortDesc, fullDesc, startDate, endDate, submissionDeadline, cameraReadyDeadline, venueOrFormat, city, country, language, contactEmail, visibility, primaryColor, accentColor, logoUrl, coverImageUrl, topics, submissionTypes, guidelines, reviewMethod, reviewCriteria])

  function discardDraft() {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setRestored(false)
    setStep(1)
    setTitle(''); setSlug(''); setSlugTouched(false); setCategory(''); setConferenceType('')
    setShortDesc(''); setFullDesc(''); setStartDate(''); setEndDate(''); setSubmissionDeadline('')
    setCameraReadyDeadline(''); setVenueOrFormat(''); setCity(''); setCountry(''); setLanguage('')
    setContactEmail(''); setVisibility('public'); setPrimaryColor('#4F46E5'); setAccentColor('#0EA5E9')
    setLogoUrl(''); setCoverImageUrl(''); setTopics(''); setSubmissionTypes(''); setGuidelines('')
    setReviewMethod('double_blind'); setReviewCriteria('Novelty, Technical quality, Clarity, Significance')
    setStepErrors([]); setError(null)
  }

  async function generateDraft() {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai/conference-draft', {
        method: 'POST',
        headers: getAIRequestHeaders(),
        body: JSON.stringify({ description: aiInput }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to generate draft')
      const draft = payload.draft as Draft
      const g = new Set<string>()
      if (draft.title) { setTitle(draft.title); if (!slugTouched) setSlug(slugify(draft.title)); g.add('title') }
      if (draft.shortDescription) { setShortDesc(draft.shortDescription); g.add('short') }
      if (draft.fullDescription) { setFullDesc(draft.fullDescription); g.add('full') }
      if (draft.researchTopics?.length) { setTopics(draft.researchTopics.join(', ')); g.add('topics') }
      if (draft.startDate) { setStartDate(draft.startDate); g.add('start') }
      if (draft.endDate) { setEndDate(draft.endDate); g.add('end') }
      if (draft.submissionDeadline) { setSubmissionDeadline(draft.submissionDeadline); g.add('deadline') }
      if (draft.venueOrFormat) { setVenueOrFormat(draft.venueOrFormat); g.add('venue') }
      if (draft.language) { setLanguage(draft.language); g.add('lang') }
      if (draft.websiteContactEmail) { setContactEmail(draft.websiteContactEmail); g.add('email') }
      setGenerated(g)
      setAiLabel(typeof payload.label === 'string' ? payload.label : null)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate draft')
    } finally {
      setAiLoading(false)
    }
  }

  function validateStep(n: number): string[] {
    const errors: string[] = []
    if (n === 1) {
      if (!selectedOrg) errors.push('Organization is required — create an organization first.')
      if (title.trim().length < 3) errors.push('Conference title must be at least 3 characters.')
    }
    if (n === 2) {
      if (startDate && endDate && endDate < startDate) errors.push('End date must be on or after the start date.')
    }
    return errors
  }

  function validateAll(): string[] {
    return [...validateStep(1), ...validateStep(2)]
  }

  function goNext() {
    const errors = validateStep(step)
    setStepErrors(errors)
    if (errors.length > 0) return
    setStep((s) => Math.min(6, s + 1))
  }

  function goBack() {
    setStepErrors([])
    setStep((s) => Math.max(1, s - 1))
  }

  function goToStep(target: number) {
    if (target <= step) { setStepErrors([]); setStep(target); return }
    for (let n = step; n < target; n += 1) {
      const errors = validateStep(n)
      if (errors.length > 0) { setStep(n); setStepErrors(errors); return }
    }
    setStepErrors([])
    setStep(target)
  }

  async function onCreate() {
    const errors = validateAll()
    setStepErrors(errors)
    if (errors.length > 0) return
    if (!selectedOrg) { setError('Create an organization first.'); return }
    setSaving(true)
    setError(null)
    try {
      const input: Partial<Conference> = {
        organizationId: selectedOrg.id,
        title: title.trim(),
        slug: slug || slugify(title),
        category: category.trim() || undefined,
        conferenceType: conferenceType.trim() || undefined,
        shortDescription: shortDesc.trim() || undefined,
        fullDescription: fullDesc.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        submissionDeadline: submissionDeadline || undefined,
        cameraReadyDeadline: cameraReadyDeadline || undefined,
        venueOrFormat: venueOrFormat.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        language: language.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        visibility,
        researchTopics: parseCsv(topics),
        submissionTypes: parseCsv(submissionTypes),
        submissionGuidelines: guidelines.trim() || undefined,
        reviewMethod,
        reviewCriteria: parseCsv(reviewCriteria),
        submissionsEnabled,
        registrationEnabled,
        registrationMode,
        participationFeeCents: Math.max(0, Math.round((parseFloat(feeAmount) || 0) * 100)),
        feeCurrency: feeCurrency.trim().toUpperCase() || 'USD',
        capacity: capacity ? Number(capacity) : undefined,
        registrationDeadline: registrationDeadline || undefined,
        eligibilityCriteria: eligibilityCriteria.split('\n').map((s) => s.trim()).filter(Boolean),
        eligibilityQuestions: eligibilityQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
        requiredDocuments: parseCsv(requiredDocuments),
        reviewerMode,
        reviewDeadline: reviewDeadline || undefined,
        maxFileSizeMb: Number(maxFileSizeMb) || 10,
        branding: {
          primaryColor,
          accentColor,
          logoUrl: logoUrl.trim() || undefined,
          coverImageUrl: coverImageUrl.trim() || undefined,
        },
        wizardStep: 6,
      }
      const conf = await apiCreateConference(input)
      try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
      // Invite the reviewers selected in step 5 (registered Reviewer accounts).
      const inviteFailures: string[] = []
      for (const userId of selectedReviewers) {
        const person = directory.find((u) => u.id === userId)
        if (!person) continue
        try {
          await api(`/api/conferences/${conf.id}/reviewer-invitations`, { method: 'POST', body: JSON.stringify({ email: person.email }) })
        } catch (err) {
          inviteFailures.push(`${person.displayName}: ${err instanceof Error ? err.message : 'invitation failed'}`)
        }
      }
      if (inviteFailures.length > 0 || selectedReviewers.length > 0) {
        setCreated({ slug: conf.slug, orgSlug: selectedOrg.slug, inviteFailures })
        setSaving(false)
        return
      }
      router.push(`/organizations/${selectedOrg.slug}/conferences/${conf.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conference')
      setSaving(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step < 6) { goNext(); return }
    void onCreate()
  }

  if (!hydrated) {
    return <p className="text-sm text-[#64748B]">Loading your organizations from the server...</p>
  }

  if (orgs.length === 0) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h2 className="font-medium text-[#111827]">Create an organization first</h2>
        <p className="text-sm text-[#64748B]">Conferences belong to an organization (a university, society, institute, or company).</p>
        <div><Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href="/organizations/new">Create Organization</Link></Button></div>
      </div>
    )
  }

  const gen = (key: string) => generated.has(key) ? <span className="text-xs font-normal text-indigo-600"> (AI-generated, editable)</span> : null
  const allErrors = step === 6 ? validateAll() : stepErrors

  const summary: [string, string][] = [
    ['Organization', selectedOrg?.name ?? '—'],
    ['Title', title || '—'],
    ['URL slug', slug || slugify(title) || '—'],
    ['Category', category || '—'],
    ['Conference type', conferenceType || '—'],
    ['Short description', shortDesc || '—'],
    ['Dates', [startDate, endDate].filter(Boolean).join(' → ') || '—'],
    ['Submission deadline', submissionDeadline || '—'],
    ['Camera-ready deadline', cameraReadyDeadline || '—'],
    ['Venue / format', venueOrFormat || '—'],
    ['Location', [city, country].filter(Boolean).join(', ') || '—'],
    ['Language', language || '—'],
    ['Contact email', contactEmail || '—'],
    ['Visibility', visibility],
    ['Primary color', primaryColor],
    ['Accent color', accentColor],
    ['Logo URL', logoUrl || '—'],
    ['Cover image URL', coverImageUrl || '—'],
    ['Research topics', topics || '—'],
    ['Submission types', submissionTypes || '—'],
    ['Review method', reviewMethod === 'double_blind' ? 'Double blind (reviewers and authors anonymous)' : 'Single blind (reviewers anonymous)'],
    ['Review criteria', reviewCriteria || '—'],
    ['Submissions', submissionsEnabled ? 'Enabled' : 'Disabled'],
    ['Attendee registration', registrationEnabled ? `${registrationMode === 'auto' ? 'Automatic' : 'Organizer approval'}${Number(feeAmount) > 0 ? ` · ${feeAmount} ${feeCurrency}` : ' · Free'}` : 'Disabled'],
    ['Reviewer management', reviewerMode],
  ]

  if (created) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h2 className="font-medium text-gray-900">Conference created</h2>
        <p className="text-sm text-gray-600">
          {selectedReviewers.length - created.inviteFailures.length} reviewer invitation(s) sent.
          {created.inviteFailures.length ? ' Some invitations could not be sent:' : ''}
        </p>
        {created.inviteFailures.length ? <ul className="list-disc pl-5 text-sm text-red-700">{created.inviteFailures.map((f) => <li key={f}>{f}</li>)}</ul> : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/organizations/${created.orgSlug}/conferences/${created.slug}`}>Open conference</Link></Button>
          <Button asChild variant="outline"><Link href={`/organizations/${created.orgSlug}/conferences/${created.slug}/participants`}>Manage reviewers & participants</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {restored ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#111827]">Draft restored from this browser (step {step} of 6). Your in-progress form is saved automatically as you type.</p>
          <Button type="button" variant="outline" size="sm" onClick={discardDraft}>Discard draft</Button>
        </div>
      ) : (
        <p className="text-xs text-[#64748B]">Your progress is saved automatically in this browser — leave and come back to resume.</p>
      )}

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1
          const isCurrent = n === step
          const isDone = n < step
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => goToStep(n)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${isCurrent ? 'border-[#4F46E5] bg-[#4F46E5] text-white' : isDone ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'text-[#64748B]'}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {n}. {label}
              </button>
            </li>
          )
        })}
      </ol>

      <form onSubmit={onSubmit} className="rounded-lg border p-6 flex flex-col gap-4">
        <h2 className="font-medium text-[#111827]">Step {step} of 6: {STEPS[step - 1]}</h2>

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 flex flex-col gap-3">
              <div>
                <h3 className="font-medium text-[#111827]">Start with AI</h3>
                <p className="text-sm text-[#64748B]">Describe the conference in plain language. Confexa drafts the details below — review and edit everything before saving. Nothing is invented beyond what you write.</p>
              </div>
              <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} rows={3} placeholder="e.g. International conference on trustworthy AI and cybersecurity, 18-20 May 2027 in Algiers, Algeria. Submissions due 2027-01-15. Contact: conf@example.org, in English..." className="rounded-md border bg-white px-3 py-2 text-sm" />
              {aiError ? <p className="text-sm text-destructive">{aiError}</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={generateDraft} disabled={aiLoading || aiInput.trim().length < 10} className="bg-[#4F46E5] hover:bg-[#4338CA]">{aiLoading ? 'Generating...' : 'Generate draft with AI'}</Button>
                {aiLabel ? <span className="text-xs text-[#64748B]">Source: {aiLabel}</span> : null}
              </div>
            </div>

            {!lockedOrgSlug ? (
              <div className="flex flex-col gap-2">
                <label htmlFor="org" className={labelCls}>Organization</label>
                <select id="org" value={selectedOrg?.id ?? ''} onChange={(e) => setOrgId(e.target.value)} className={inputCls} required>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-sm text-[#64748B]">Organization: <span className="font-medium text-[#111827]">{selectedOrg?.name}</span></p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="title" className={labelCls}>Conference title{gen('title')}</label>
                <input id="title" value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} className={inputCls} placeholder="International Conference on ..." />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="slug" className={labelCls}>URL slug</label>
                <input id="slug" value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true) }} className={inputCls} />
                <span className="text-xs text-[#64748B]">Public website will live at /events/{slug || 'your-slug'} once published.</span>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="category" className={labelCls}>Category</label>
                <input id="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="Computer Science, Medicine, Engineering..." />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="conferenceType" className={labelCls}>Conference type</label>
                <select id="conferenceType" value={conferenceType} onChange={(e) => setConferenceType(e.target.value)} className={inputCls}>
                  <option value="">Select type</option>
                  <option value="Conference">Conference</option>
                  <option value="Workshop">Workshop</option>
                  <option value="Symposium">Symposium</option>
                  <option value="Summit">Summit</option>
                  <option value="Colloquium">Colloquium</option>
                  <option value="Congress">Congress</option>
                  <option value="Seminar">Seminar</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="shortDesc" className={labelCls}>Short description{gen('short')}</label>
                <input id="shortDesc" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} className={inputCls} maxLength={400} />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="fullDesc" className={labelCls}>Full description{gen('full')}</label>
                <textarea id="fullDesc" value={fullDesc} onChange={(e) => setFullDesc(e.target.value)} className={inputCls} rows={4} />
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="startDate" className={labelCls}>Start date{gen('start')}</label>
              <input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="endDate" className={labelCls}>End date{gen('end')}</label>
              <input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="deadline" className={labelCls}>Submission deadline{gen('deadline')}</label>
              <input id="deadline" type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="cameraReadyDeadline" className={labelCls}>Camera-ready deadline</label>
              <input id="cameraReadyDeadline" type="date" value={cameraReadyDeadline} onChange={(e) => setCameraReadyDeadline(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="venue" className={labelCls}>Venue / format{gen('venue')}</label>
              <select id="venue" value={venueOrFormat} onChange={(e) => setVenueOrFormat(e.target.value)} className={inputCls}>
                <option value="">Select format</option>
                <option value="In-person">In-person</option>
                <option value="Online">Online</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Virtual">Virtual</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="visibility" className={labelCls}>Visibility</label>
              <select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')} className={inputCls}>
                <option value="public">Public — listed and visible to everyone</option>
                <option value="private">Private — only organization members</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="city" className={labelCls}>City</label>
              <input id="city" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="country" className={labelCls}>Country</label>
              <input id="country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="lang" className={labelCls}>Language{gen('lang')}</label>
              <input id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className={labelCls}>Contact email{gen('email')}</label>
              <input id="email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="primaryColor" className={labelCls}>Primary color</label>
              <div className="flex items-center gap-2">
                <input id="primaryColor" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-14 shrink-0 cursor-pointer rounded-md border bg-white p-1" />
                <input aria-label="Primary color hex" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={inputCls} placeholder="#4F46E5" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="accentColor" className={labelCls}>Accent color</label>
              <div className="flex items-center gap-2">
                <input id="accentColor" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-9 w-14 shrink-0 cursor-pointer rounded-md border bg-white p-1" />
                <input aria-label="Accent color hex" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className={inputCls} placeholder="#0EA5E9" />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label htmlFor="logoUrl" className={labelCls}>Logo URL</label>
              <input id="logoUrl" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputCls} placeholder="https://..." />
            </div>
            <div className="sm:col-span-2">
              <CoverImageField value={coverImageUrl} onChange={setCoverImageUrl} title={title} topics={topics} />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3 rounded-lg border p-4">
              <span className="inline-block h-8 w-8 rounded-md border" style={{ backgroundColor: primaryColor }} />
              <span className="inline-block h-8 w-8 rounded-md border" style={{ backgroundColor: accentColor }} />
              <p className="text-sm text-[#64748B]">Preview of the selected brand colors. They are used on the generated conference website.</p>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="topics" className={labelCls}>Research topics (comma separated){gen('topics')}</label>
              <input id="topics" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Trustworthy AI, Cybersecurity" className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="submissionTypes" className={labelCls}>Submission types (comma separated)</label>
              <select
                id="submissionTypesSelect"
                className={inputCls}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  const current = submissionTypes
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                  if (!current.includes(v)) {
                    setSubmissionTypes([...current, v].join(', '))
                  }
                  e.target.value = ''
                }}
              >
                <option value="">Add submission type</option>
                <option value="Full paper">Full paper</option>
                <option value="Short paper">Short paper</option>
                <option value="Abstract">Abstract</option>
                <option value="Poster">Poster</option>
                <option value="Demo">Demo</option>
                <option value="Workshop paper">Workshop paper</option>
                <option value="Extended abstract">Extended abstract</option>
                <option value="Panel proposal">Panel proposal</option>
              </select>
              <input id="submissionTypes" value={submissionTypes} onChange={(e) => setSubmissionTypes(e.target.value)} placeholder="Full paper, Short paper, Poster, Demo" className={inputCls} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="guidelines" className={labelCls}>Submission guidelines (optional)</label>
              <textarea id="guidelines" value={guidelines} onChange={(e) => setGuidelines(e.target.value)} className={inputCls} rows={4} placeholder="Page limits, formatting, anonymization, review model..." />
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className={labelCls}>Review method</legend>
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <input type="radio" name="reviewMethod" value="double_blind" checked={reviewMethod === 'double_blind'} onChange={() => setReviewMethod('double_blind')} className="mt-0.5" />
                <span><span className="font-medium text-[#111827]">Double blind</span><span className="block text-[#64748B]">Reviewers and authors are anonymous to each other.</span></span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <input type="radio" name="reviewMethod" value="single_blind" checked={reviewMethod === 'single_blind'} onChange={() => setReviewMethod('single_blind')} className="mt-0.5" />
                <span><span className="font-medium text-[#111827]">Single blind</span><span className="block text-[#64748B]">Reviewers are anonymous; authors are visible to reviewers.</span></span>
              </label>
            </fieldset>
            <div className="flex flex-col gap-2">
              <label htmlFor="reviewCriteria" className={labelCls}>Review criteria (comma separated)</label>
              <input id="reviewCriteria" value={reviewCriteria} onChange={(e) => setReviewCriteria(e.target.value)} placeholder="Novelty, Technical quality, Clarity, Significance" className={inputCls} />
              <span className="text-xs text-[#64748B]">Reviewers score each criterion when evaluating a submission.</span>
            </div>
            <div className="flex flex-col gap-2 border-t pt-4">
              <span className={labelCls}>Select reviewers for this event (registered Reviewer accounts)</span>
              <p className="text-xs text-gray-500">Only reviewers who are members of this organization appear below. To invite reviewers from outside your organization, use their email (must be the same email they registered with on Confexa).</p>
              {(() => {
                const memberIds = new Set(orgMembers.map((m: any) => String(m.userId || m.user_id)))
                const orgReviewers = directory.filter((u) => u.accountType === 'reviewer' && memberIds.has(u.id))
                if (orgReviewers.length === 0) {
                  return <p className="text-sm text-gray-500">No reviewers from this organization are registered yet. Add reviewers to your organization or invite them by email from the Participants page.</p>
                }
                return (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {orgReviewers.map((u) => (
                      <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedReviewers.includes(u.id)}
                          onChange={(e) => setSelectedReviewers((prev) => (e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)))}
                        />
                        <Avatar name={u.displayName} url={u.avatarUrl} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">{u.displayName}</span>
                          <span className="block truncate text-xs text-gray-500">{u.affiliation || u.email}{u.expertise?.length ? ` · ${u.expertise.slice(0, 2).join(', ')}` : ''}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })()}
            </div>
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="reviewerMode" className={labelCls}>Reviewer management</label>
                <select id="reviewerMode" value={reviewerMode} onChange={(e) => setReviewerMode(e.target.value as typeof reviewerMode)} className={inputCls}>
                  <option value="both">Accept applications and invite reviewers</option>
                  <option value="applications">Accept reviewer applications only</option>
                  <option value="invitations">Invite reviewers only</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="reviewDeadline" className={labelCls}>Review deadline (optional)</label>
                <input id="reviewDeadline" type="date" value={reviewDeadline} onChange={(e) => setReviewDeadline(e.target.value)} className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={submissionsEnabled} onChange={(e) => setSubmissionsEnabled(e.target.checked)} /> Research submissions enabled</label>
              <div className="flex flex-col gap-2">
                <label htmlFor="maxFileSizeMb" className={labelCls}>Max manuscript size (MB)</label>
                <input id="maxFileSizeMb" type="number" min={1} max={50} value={maxFileSizeMb} onChange={(e) => setMaxFileSizeMb(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-4 border-t pt-4">
              <h3 className="text-sm font-medium text-[#111827]">Attendee registration (independent of paper submissions)</h3>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={registrationEnabled} onChange={(e) => setRegistrationEnabled(e.target.checked)} /> Attendee registration enabled</label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="registrationMode" className={labelCls}>Admission</label>
                  <select id="registrationMode" value={registrationMode} onChange={(e) => setRegistrationMode(e.target.value as typeof registrationMode)} className={inputCls}>
                    <option value="approval">Organizer approval required</option>
                    <option value="auto">Automatic admission (free events)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="registrationDeadline" className={labelCls}>Registration deadline (optional)</label>
                  <input id="registrationDeadline" type="date" value={registrationDeadline} onChange={(e) => setRegistrationDeadline(e.target.value)} className={inputCls} />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="feeAmount" className={labelCls}>Participation fee (0 = free)</label>
                  <input id="feeAmount" type="number" min={0} step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} className={inputCls} />
                  <span className="text-xs text-[#64748B]">Paid admission only works when a real payment provider is configured; otherwise applications stay “pending payment”.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="feeCurrency" className={labelCls}>Currency</label>
                    <input id="feeCurrency" value={feeCurrency} onChange={(e) => setFeeCurrency(e.target.value)} className={inputCls} maxLength={8} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="capacity" className={labelCls}>Capacity (optional)</label>
                    <input id="capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="eligibilityCriteria" className={labelCls}>Eligibility criteria (one per line, used by AI screening)</label>
                <textarea id="eligibilityCriteria" value={eligibilityCriteria} onChange={(e) => setEligibilityCriteria(e.target.value)} rows={3} placeholder={'e.g. Must be enrolled at a university\nMust present a valid student ID'} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="eligibilityQuestions" className={labelCls}>Application questions (one per line, all required)</label>
                <textarea id="eligibilityQuestions" value={eligibilityQuestions} onChange={(e) => setEligibilityQuestions(e.target.value)} rows={3} placeholder={'e.g. Why do you want to attend?\nWhat is your current institution?'} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="requiredDocuments" className={labelCls}>Required documents (comma separated, PDF upload)</label>
                <input id="requiredDocuments" value={requiredDocuments} onChange={(e) => setRequiredDocuments(e.target.value)} placeholder="e.g. Student ID, CV" className={inputCls} />
              </div>
            </div>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[#64748B]">Check everything below, then create the conference. It starts as a draft — you can generate its website next.</p>
            {fullDesc ? (
              <div className="rounded-lg border p-4">
                <h3 className="text-sm font-medium text-[#111827]">Full description</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#64748B]">{fullDesc}</p>
              </div>
            ) : null}
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {summary.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 text-sm"><dt className="text-[#64748B]">{k}</dt><dd className="text-right font-medium text-[#111827] break-all">{v}</dd></div>
              ))}
            </dl>
            {guidelines ? <p className="text-sm text-[#64748B]"><span className="font-medium text-[#111827]">Guidelines:</span> {guidelines}</p> : null}
          </div>
        ) : null}

        {allErrors.length > 0 ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-sm font-medium text-red-800">Please fix the following:</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-red-700">
              {allErrors.map((msg) => <li key={msg}>{msg}</li>)}
            </ul>
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {step > 1 ? <Button type="button" variant="outline" onClick={goBack}>Back</Button> : null}
          {step < 6 ? (
            <Button type="submit" className="bg-[#4F46E5] hover:bg-[#4338CA]">Next</Button>
          ) : (
            <Button type="submit" disabled={saving} className="bg-[#4F46E5] hover:bg-[#4338CA]">{saving ? 'Creating...' : 'Create conference'}</Button>
          )}
          <Button asChild type="button" variant="outline"><Link href="/conferences">Cancel</Link></Button>
        </div>
      </form>
    </div>
  )
}
