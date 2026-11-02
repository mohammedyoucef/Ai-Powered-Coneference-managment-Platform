'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api, refreshData, useDemoData, useHydrated } from '@/lib/demo/storage'
import { validatePdfFile, MAX_PDF_BYTES } from '@/lib/demo/pdfs'
import { extractPdfText, type PdfExtraction } from '@/lib/pdf/extract'
import type { Conference, Organization, Submission } from '@/lib/demo/types'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

export function SubmissionForm({
  conference,
  organization,
  successHref,
  backHref,
}: {
  conference: Conference
  organization: Organization | null
  successHref: (submissionId: string) => string
  backHref: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const data = useDemoData()
  const hydrated = useHydrated()
  const currentUser = data.currentUser ?? null
  const submissionTypes = conference.submissionTypes && conference.submissionTypes.length > 0 ? conference.submissionTypes : ['Full paper']
  const [title, setTitle] = useState('')
  const [abstract, setAbstract] = useState('')
  const [authors, setAuthors] = useState('')
  const [topics, setTopics] = useState(conference.researchTopics.slice(0, 3).join(', '))
  const [submissionType, setSubmissionType] = useState(submissionTypes[0])
  const [file, setFile] = useState<File | null>(null)
  const [extraction, setExtraction] = useState<PdfExtraction | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFileChange(selected: File | null) {
    setError(null)
    setExtraction(null)
    setFile(selected)
    if (!selected) return
    const invalid = validatePdfFile(selected)
    if (invalid) {
      setError(invalid)
      setFile(null)
      return
    }
    setExtracting(true)
    const result = await extractPdfText(selected)
    setExtraction(result)
    setExtracting(false)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('A PDF manuscript is required.'); return }
    const invalid = validatePdfFile(file)
    if (invalid) { setError(invalid); return }
    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('title', title)
      form.set('abstract', abstract)
      form.set('authors', authors)
      form.set('topics', topics)
      form.set('submissionType', submissionType)
      form.set('pageCount', extraction?.pageCount ? String(extraction.pageCount) : '')
      form.set('extractedText', extraction?.text ?? '')
      form.set('extractionNote', extraction?.note ?? '')
      form.set('file', file)
      const result = await api<{ submission: Submission }>(`/api/conferences/${conference.id}/submissions`, {
        method: 'POST',
        body: form,
      })
      await refreshData()
      router.push(successHref(result.submission.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit the paper. Please try again.')
      setSaving(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="rounded-lg border p-6">
        <p className="text-sm text-[#64748B]">Loading...</p>
      </div>
    )
  }

  if (!currentUser) {
    const next = encodeURIComponent(pathname || backHref)
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h2 className="font-medium text-[#111827]">Sign in to submit a paper</h2>
        <p className="text-sm text-[#64748B]">
          Submitting to <span className="font-medium text-[#111827]">{conference.title}</span>
          {organization ? <> · {organization.name}</> : null} requires an account, so the paper can be
          attributed to you and you can track its status, reviews, and decision.
        </p>
        <div className="flex gap-2">
          <Button asChild className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/login?next=${next}`}>Sign in to submit</Link></Button>
          <Button asChild type="button" variant="outline"><Link href={backHref}>Cancel</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border p-6 flex flex-col gap-4">
      <p className="text-sm text-[#64748B]">
        Submitting to <span className="font-medium text-[#111827]">{conference.title}</span>
        {organization ? <> · {organization.name}</> : null}
        {conference.submissionDeadline ? <> · Deadline: {conference.submissionDeadline}</> : null}
      </p>
      <p className="text-xs text-[#64748B]">Submitting as <span className="font-medium text-[#111827]">{currentUser.displayName}</span> ({currentUser.email})</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="ptitle" className="text-sm font-medium">Paper title</label>
        <input id="ptitle" value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="pabstract" className="text-sm font-medium">Abstract</label>
        <textarea id="pabstract" value={abstract} onChange={(e) => setAbstract(e.target.value)} required rows={6} className={inputCls} placeholder="Summarize the problem, approach, and results..." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="pauthors" className="text-sm font-medium">Authors (comma separated)</label>
          <input id="pauthors" value={authors} onChange={(e) => setAuthors(e.target.value)} required className={inputCls} placeholder="Jane Doe, John Smith" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ptopics" className="text-sm font-medium">Topics (comma separated)</label>
          <input id="ptopics" value={topics} onChange={(e) => setTopics(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ptype" className="text-sm font-medium">Submission type</label>
          <select id="ptype" value={submissionType} onChange={(e) => setSubmissionType(e.target.value)} className={inputCls}>
            {submissionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ppdf" className="text-sm font-medium">Manuscript PDF (required, max {MAX_PDF_BYTES / 1024 / 1024} MB)</label>
        <input id="ppdf" type="file" accept="application/pdf,.pdf" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} className="rounded-md border px-3 py-2 text-sm" />
        {file ? <p className="text-xs text-[#64748B]">{file.name} · {(file.size / 1024).toFixed(0)} KB</p> : null}
        {extracting ? <p className="text-xs text-indigo-600">Extracting text from the PDF for AI review...</p> : null}
        {extraction && !extracting ? (
          <p className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {extraction.pageCount > 0 ? `${extraction.pageCount} page(s). ` : ''}
            {extraction.text ? `${extraction.text.length.toLocaleString()} characters extracted for AI review. ` : ''}
            {extraction.note ?? ''}
          </p>
        ) : null}
        <p className="text-xs text-[#64748B]">The PDF is uploaded to and stored on the server. Access is controlled: only you, assigned reviewers, and the conference organizers can open it.</p>
      </div>
      {conference.submissionGuidelines ? (
        <div className="rounded-md border bg-slate-50 px-3 py-2">
          <p className="text-xs font-medium text-[#111827]">Submission guidelines</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[#64748B]">{conference.submissionGuidelines}</p>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || extracting} className="bg-[#4F46E5] hover:bg-[#4338CA]">{saving ? 'Submitting...' : 'Submit paper'}</Button>
        <Button asChild type="button" variant="outline"><Link href={backHref}>Cancel</Link></Button>
      </div>
    </form>
  )
}
