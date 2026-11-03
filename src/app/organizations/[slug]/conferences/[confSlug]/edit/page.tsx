'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { updateConference, useDemoData, useHydrated } from '@/lib/demo/storage'
import { CoverImageField } from '@/components/conferences/cover-image-field'
import { canManageOrganization } from '@/lib/demo/permissions'
import type { Conference, ConferenceStatus } from '@/lib/demo/types'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

function EditConferenceForm({ conf, base }: { conf: Conference; base: string }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState(conf.title)
  const [shortDesc, setShortDesc] = useState(conf.shortDescription ?? '')
  const [fullDesc, setFullDesc] = useState(conf.fullDescription ?? '')
  const [topics, setTopics] = useState(conf.researchTopics.join(', '))
  const [startDate, setStartDate] = useState(conf.startDate ?? '')
  const [endDate, setEndDate] = useState(conf.endDate ?? '')
  const [submissionDeadline, setSubmissionDeadline] = useState(conf.submissionDeadline ?? '')
  const [venueOrFormat, setVenueOrFormat] = useState(conf.venueOrFormat ?? '')
  const [city, setCity] = useState(conf.city ?? '')
  const [country, setCountry] = useState(conf.country ?? '')
  const [language, setLanguage] = useState(conf.language ?? '')
  const [contactEmail, setContactEmail] = useState(conf.contactEmail ?? '')
  const [guidelines, setGuidelines] = useState(conf.submissionGuidelines ?? '')
  const [status, setStatus] = useState<ConferenceStatus>(conf.status)
  const [category, setCategory] = useState(conf.category ?? '')
  const [conferenceType, setConferenceType] = useState(conf.conferenceType ?? '')
  const [visibility, setVisibility] = useState<'public' | 'private'>(conf.visibility ?? 'public')
  const [cameraReadyDeadline, setCameraReadyDeadline] = useState(conf.cameraReadyDeadline ?? '')
  const [reviewMethod, setReviewMethod] = useState<'single_blind' | 'double_blind'>(conf.reviewMethod ?? 'double_blind')
  const [reviewCriteria, setReviewCriteria] = useState((conf.reviewCriteria ?? []).join(', '))
  const [submissionTypes, setSubmissionTypes] = useState((conf.submissionTypes ?? []).join(', '))
  const [submissionsEnabled, setSubmissionsEnabled] = useState(conf.submissionsEnabled !== false)
  const [registrationEnabled, setRegistrationEnabled] = useState(conf.registrationEnabled !== false)
  const [registrationMode, setRegistrationMode] = useState<'auto' | 'approval'>(conf.registrationMode ?? 'approval')
  const [feeAmount, setFeeAmount] = useState(String((conf.participationFeeCents ?? 0) / 100))
  const [feeCurrency, setFeeCurrency] = useState(conf.feeCurrency ?? 'USD')
  const [capacity, setCapacity] = useState(conf.capacity ? String(conf.capacity) : '')
  const [registrationDeadline, setRegistrationDeadline] = useState(conf.registrationDeadline ?? '')
  const [eligibilityCriteria, setEligibilityCriteria] = useState((conf.eligibilityCriteria ?? []).join('\n'))
  const [eligibilityQuestions, setEligibilityQuestions] = useState((conf.eligibilityQuestions ?? []).join('\n'))
  const [requiredDocuments, setRequiredDocuments] = useState((conf.requiredDocuments ?? []).join(', '))
  const [reviewerMode, setReviewerMode] = useState<'applications' | 'invitations' | 'both'>(conf.reviewerMode ?? 'both')
  const [reviewDeadline, setReviewDeadline] = useState(conf.reviewDeadline ?? '')
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(String(conf.maxFileSizeMb ?? 10))
  const [primaryColor, setPrimaryColor] = useState(conf.branding?.primaryColor ?? '#4F46E5')
  const [accentColor, setAccentColor] = useState(conf.branding?.accentColor ?? '#0EA5E9')
  const [logoUrl, setLogoUrl] = useState(conf.branding?.logoUrl ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState(conf.branding?.coverImageUrl ?? '')

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const updated = updateConference(conf.id, {
      title: title || conf.title,
      shortDescription: shortDesc || undefined,
      fullDescription: fullDesc || undefined,
      researchTopics: topics.split(',').map((t) => t.trim()).filter(Boolean),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      submissionDeadline: submissionDeadline || undefined,
      venueOrFormat: venueOrFormat || undefined,
      city: city || undefined,
      country: country || undefined,
      language: language || undefined,
      contactEmail: contactEmail || undefined,
      submissionGuidelines: guidelines || undefined,
      status,
      category: category || undefined,
      conferenceType: conferenceType || undefined,
      visibility,
      cameraReadyDeadline: cameraReadyDeadline || undefined,
      reviewMethod,
      submissionsEnabled,
      registrationEnabled,
      registrationMode,
      participationFeeCents: Math.max(0, Math.round((parseFloat(feeAmount) || 0) * 100)),
      feeCurrency: feeCurrency.trim().toUpperCase() || 'USD',
      capacity: capacity ? Number(capacity) : undefined,
      registrationDeadline: registrationDeadline || undefined,
      eligibilityCriteria: eligibilityCriteria.split('\n').map((t) => t.trim()).filter(Boolean),
      eligibilityQuestions: eligibilityQuestions.split('\n').map((t) => t.trim()).filter(Boolean),
      requiredDocuments: requiredDocuments.split(',').map((t) => t.trim()).filter(Boolean),
      reviewerMode,
      reviewDeadline: reviewDeadline || undefined,
      maxFileSizeMb: Number(maxFileSizeMb) || 10,
      reviewCriteria: reviewCriteria.split(',').map((t) => t.trim()).filter(Boolean),
      submissionTypes: submissionTypes.split(',').map((t) => t.trim()).filter(Boolean),
      branding: {
        primaryColor,
        accentColor,
        logoUrl: logoUrl || undefined,
        coverImageUrl: coverImageUrl || undefined,
      },
    })
    if (!updated) { setError('Failed to save.'); setSaving(false); return }
    router.push(base)
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border p-6 flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="title">Title</label><input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} /></div>
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="short">Short description</label><input id="short" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="full">Full description</label><textarea id="full" value={fullDesc} onChange={(e) => setFullDesc(e.target.value)} rows={4} className={inputCls} /></div>
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="topics">Research topics (comma separated)</label><input id="topics" value={topics} onChange={(e) => setTopics(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="category">Category</label><input id="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="Computer Science, Medicine..." /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="conferenceType">Conference type</label><input id="conferenceType" value={conferenceType} onChange={(e) => setConferenceType(e.target.value)} className={inputCls} placeholder="Conference, Workshop, Symposium..." /></div>
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="submissionTypes">Submission types (comma separated)</label><input id="submissionTypes" value={submissionTypes} onChange={(e) => setSubmissionTypes(e.target.value)} className={inputCls} placeholder="Full paper, Short paper, Poster" /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="start">Start date</label><input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="end">End date</label><input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="deadline">Submission deadline</label><input id="deadline" type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="cameraReadyDeadline">Camera-ready deadline</label><input id="cameraReadyDeadline" type="date" value={cameraReadyDeadline} onChange={(e) => setCameraReadyDeadline(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="venue">Venue / format</label><input id="venue" value={venueOrFormat} onChange={(e) => setVenueOrFormat(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="city">City</label><input id="city" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="country">Country</label><input id="country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="lang">Language</label><input id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="email">Contact email</label><input id="email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as ConferenceStatus)} className={inputCls}>
            <option value="Draft">Draft</option>
            <option value="Website Generated">Website Generated</option>
            <option value="Published">Published</option>
          </select>
          <span className="text-xs text-[#64748B]">Tip: publishing is controlled from the website editor so the public site always matches a published snapshot.</span>
        </div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="visibility">Visibility</label>
          <select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')} className={inputCls}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="reviewMethod">Review method</label>
          <select id="reviewMethod" value={reviewMethod} onChange={(e) => setReviewMethod(e.target.value as 'single_blind' | 'double_blind')} className={inputCls}>
            <option value="double_blind">Double blind</option>
            <option value="single_blind">Single blind</option>
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="reviewCriteria">Review criteria (comma separated)</label><input id="reviewCriteria" value={reviewCriteria} onChange={(e) => setReviewCriteria(e.target.value)} className={inputCls} placeholder="Novelty, Technical quality, Clarity" /></div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="primaryColor">Branding primary color</label>
          <div className="flex items-center gap-2">
            <input id="primaryColor" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-14 shrink-0 cursor-pointer rounded-md border bg-white p-1" />
            <input aria-label="Primary color hex" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="accentColor">Branding accent color</label>
          <div className="flex items-center gap-2">
            <input id="accentColor" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-9 w-14 shrink-0 cursor-pointer rounded-md border bg-white p-1" />
            <input aria-label="Accent color hex" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="logoUrl">Logo URL</label><input id="logoUrl" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inputCls} placeholder="https://..." /></div>
        <div className="sm:col-span-2"><CoverImageField value={coverImageUrl} onChange={setCoverImageUrl} title={title} topics={topics} /></div>
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="guidelines">Submission guidelines</label><textarea id="guidelines" value={guidelines} onChange={(e) => setGuidelines(e.target.value)} rows={3} className={inputCls} /></div>
        <div className="sm:col-span-2 border-t pt-4"><h2 className="text-sm font-medium text-[#111827]">Participation, registration & reviewers</h2></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={submissionsEnabled} onChange={(e) => setSubmissionsEnabled(e.target.checked)} /> Research submissions enabled</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={registrationEnabled} onChange={(e) => setRegistrationEnabled(e.target.checked)} /> Attendee registration enabled</label>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="registrationMode">Admission</label>
          <select id="registrationMode" value={registrationMode} onChange={(e) => setRegistrationMode(e.target.value as 'auto' | 'approval')} className={inputCls}><option value="approval">Organizer approval</option><option value="auto">Automatic (free)</option></select></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="reviewerMode">Reviewer management</label>
          <select id="reviewerMode" value={reviewerMode} onChange={(e) => setReviewerMode(e.target.value as 'applications' | 'invitations' | 'both')} className={inputCls}><option value="both">Applications + invitations</option><option value="applications">Applications only</option><option value="invitations">Invitations only</option></select></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="feeAmount">Participation fee (0 = free)</label><input id="feeAmount" type="number" min={0} step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} className={inputCls} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="feeCurrency">Currency</label><input id="feeCurrency" value={feeCurrency} onChange={(e) => setFeeCurrency(e.target.value)} className={inputCls} maxLength={8} /></div>
          <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="capacity">Capacity</label><input id="capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} /></div>
        </div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="registrationDeadline">Registration deadline</label><input id="registrationDeadline" type="date" value={registrationDeadline} onChange={(e) => setRegistrationDeadline(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="reviewDeadline">Review deadline</label><input id="reviewDeadline" type="date" value={reviewDeadline} onChange={(e) => setReviewDeadline(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="maxFileSizeMb">Max manuscript size (MB)</label><input id="maxFileSizeMb" type="number" min={1} max={50} value={maxFileSizeMb} onChange={(e) => setMaxFileSizeMb(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="requiredDocuments">Required documents (comma separated)</label><input id="requiredDocuments" value={requiredDocuments} onChange={(e) => setRequiredDocuments(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="eligibilityCriteria">Eligibility criteria (one per line  used by AI screening)</label><textarea id="eligibilityCriteria" value={eligibilityCriteria} onChange={(e) => setEligibilityCriteria(e.target.value)} rows={3} className={inputCls} /></div>
        <div className="flex flex-col gap-2 sm:col-span-2"><label className="text-sm font-medium" htmlFor="eligibilityQuestions">Application questions (one per line, all required)</label><textarea id="eligibilityQuestions" value={eligibilityQuestions} onChange={(e) => setEligibilityQuestions(e.target.value)} rows={3} className={inputCls} /></div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="bg-[#4F46E5] hover:bg-[#4338CA]">{saving ? 'Saving...' : 'Save changes'}</Button>
        <Button asChild type="button" variant="outline"><Link href={base}>Cancel</Link></Button>
      </div>
    </form>
  )
}

function EditConferencePageInner() {
  const params = useParams<{ slug: string; confSlug: string }>()
  const data = useDemoData()
  const hydrated = useHydrated()

  const org = data.organizations.find((o) => o.slug === params.slug) ?? null
  const conf = org ? data.conferences.find((c) => c.organizationId === org.id && c.slug === params.confSlug) ?? null : null

  if (!hydrated) return <p className="text-sm text-[#64748B]">Loading...</p>
  if (!conf) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium">Conference not found</h1>
        <div><Button asChild><Link href="/conferences">Back to conferences</Link></Button></div>
      </div>
    )
  }

  if (!org || !canManageOrganization(data, org.id)) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium">Organizer access required</h1>
        <p className="text-sm text-[#64748B]">Only the organizers managing this conference can edit it.</p>
        <div><Button asChild variant="outline"><Link href={`/events/${conf.slug}`}>View the public event page</Link></Button></div>
      </div>
    )
  }

  const base = `/organizations/${params.slug}/conferences/${conf.slug}`

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Edit conference</h1>
        <p className="text-sm text-[#64748B]">Changes update the conference record. Regenerate or edit the website afterwards to reflect them publicly.</p>
      </header>
      <EditConferenceForm key={conf.id} conf={conf} base={base} />
    </div>
  )
}

export default function EditConferencePage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading...</p>}>
      <EditConferencePageInner />
    </Suspense>
  )
}
