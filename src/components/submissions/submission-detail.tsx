'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api, createAIReview, refreshData, updateSubmission, useDemoData } from '@/lib/demo/storage'
import { validatePdfFile, MAX_PDF_BYTES } from '@/lib/demo/pdfs'
import { extractPdfText, type PdfExtraction } from '@/lib/pdf/extract'
import { getAIRequestHeaders } from '@/lib/demo/profile'
import type { Conference, Organization, ReviewRecommendation, Submission } from '@/lib/demo/types'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'
const DECISIONS = ['Accepted', 'Rejected', 'Revision Requested', 'Under Review'] as const
type Decision = (typeof DECISIONS)[number]
const RECOMMENDATIONS: ReviewRecommendation[] = ['Accept', 'Weak Accept', 'Borderline', 'Weak Reject', 'Reject']
const DEFAULT_CRITERIA = ['Novelty', 'Technical quality', 'Clarity', 'Completeness']

function ScorePill({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-xl font-semibold text-[#111827]">{value}<span className="text-sm text-[#64748B]">/{max}</span></p>
      <p className="text-xs text-[#64748B]">{label}</p>
    </div>
  )
}

export function SubmissionDetail({ conference, organization, submission, listHref }: {
  conference: Conference
  organization: Organization | null
  submission: Submission
  listHref: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const data = useDemoData()
  const currentUser = data.currentUser ?? null
  const reviews = data.reviews.filter((r) => r.submissionId === submission.id)
  const aiReviews = data.aiReviews.filter((r) => r.submissionId === submission.id)
  const latestAI = aiReviews[aiReviews.length - 1]
  const submissionAssignments = data.assignments.filter((a) => a.submissionId === submission.id)

  const isManager = Boolean(
    currentUser && (
      currentUser.platformRole === 'platform_admin' ||
      data.members.some((m) => m.organizationId === conference.organizationId && m.userId === currentUser.id && (m.role === 'owner' || m.role === 'admin'))
    ),
  )
  const isAuthor = Boolean(currentUser && submission.authorId && submission.authorId === currentUser.id)
  const myAssignment = currentUser
    ? data.assignments.find((a) => a.submissionId === submission.id && a.reviewerId === currentUser.id)
    : undefined
  const isReviewer = Boolean(myAssignment) && !isManager && !isAuthor
  const doubleBlindReviewer = conference.reviewMethod === 'double_blind' && isReviewer
  const canReview = Boolean(myAssignment && !isAuthor && currentUser?.accountType === 'reviewer')
  // AI/human reviewing tools belong to assigned reviewers and event
  // organizers only. Authors (researchers) never see them on their paper.
  const canUseReviewTools = isManager || canReview
  const criteria = conference.reviewCriteria && conference.reviewCriteria.length > 0 ? conference.reviewCriteria : DEFAULT_CRITERIA
  const criteriaKey = criteria.join('|')
  const fileUrl = `/api/submissions/${submission.id}/file`
  const cameraUrl = `/api/submissions/${submission.id}/file?kind=camera`
  const showCameraReady = isAuthor && (submission.status === 'Accepted' || submission.status === 'Camera-Ready Requested')
  const showRevision = isAuthor && submission.status === 'Revision Requested'

  const [reviewerEmail, setReviewerEmail] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [decision, setDecision] = useState<Decision>(
    submission.status === 'Accepted' || submission.status === 'Rejected' || submission.status === 'Revision Requested' ? submission.status : 'Under Review',
  )
  const [decisionNote, setDecisionNote] = useState(submission.decisionNote ?? '')
  const [managerBusy, setManagerBusy] = useState(false)
  const [managerMsg, setManagerMsg] = useState<string | null>(null)
  const [managerError, setManagerError] = useState<string | null>(null)

  const [editTitle, setEditTitle] = useState(submission.title)
  const [editAbstract, setEditAbstract] = useState(submission.abstract)
  const [editAuthors, setEditAuthors] = useState(submission.authors.join(', '))
  const [editTopics, setEditTopics] = useState(submission.topics.join(', '))
  const [editBusy, setEditBusy] = useState(false)

  async function saveMetadata(e: React.FormEvent) {
    e.preventDefault()
    setEditBusy(true)
    setAuthorMsg(null)
    setAuthorError(null)
    try {
      const updated = updateSubmission(submission.id, {
        title: editTitle.trim(),
        abstract: editAbstract.trim(),
        authors: editAuthors.split(',').map((s) => s.trim()).filter(Boolean),
        topics: editTopics.split(',').map((s) => s.trim()).filter(Boolean),
      })
      if (!updated) throw new Error('Could not save changes.')
      await refreshData()
      setAuthorMsg('Paper details saved.')
    } catch (err) {
      setAuthorError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setEditBusy(false)
    }
  }

  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const [replaceExtraction, setReplaceExtraction] = useState<PdfExtraction | null>(null)
  const [replaceBusy, setReplaceBusy] = useState(false)
  const [cameraFile, setCameraFile] = useState<File | null>(null)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [authorMsg, setAuthorMsg] = useState<string | null>(null)
  const [authorError, setAuthorError] = useState<string | null>(null)

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>(() => Object.fromEntries(criteria.map((c) => [c, 3])))
  const [score, setScore] = useState(5)
  const [recommendation, setRecommendation] = useState<ReviewRecommendation>('Borderline')
  const [comments, setComments] = useState('')
  const [confidentialComments, setConfidentialComments] = useState('')
  const [reviewSaved, setReviewSaved] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-sync form when navigating to another submission
    setDecision(submission.status === 'Accepted' || submission.status === 'Rejected' || submission.status === 'Revision Requested' ? submission.status : 'Under Review')
    setDecisionNote(submission.decisionNote ?? '')
    // Only re-sync when navigating to a different submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default criteria scores when the form config changes
    setCriteriaScores((prev) => {
      const next: Record<string, number> = {}
      criteria.forEach((c) => { next[c] = prev[c] ?? 3 })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteriaKey])

  async function runAIReview() {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: getAIRequestHeaders(),
        body: JSON.stringify({ submission, conference }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'AI review failed')
      const r = payload.review as {
        overallScore: number
        criteria: { novelty: number; technicalQuality: number; clarity: number; completeness: number }
        summary: string; strengths: string[]; weaknesses: string[]; questions: string[]
        recommendation: ReviewRecommendation; confidence: 'low' | 'medium' | 'high'
      }
      createAIReview({
        submissionId: submission.id,
        overallScore: r.overallScore,
        criteria: r.criteria,
        summary: r.summary,
        strengths: r.strengths,
        weaknesses: r.weaknesses,
        questions: r.questions,
        recommendation: r.recommendation,
        confidence: r.confidence,
        source: payload.source as 'meta' | 'fallback',
        label: payload.label as string,
        model: (payload.model as string | null) ?? undefined,
      })
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI review failed')
    } finally {
      setAiLoading(false)
    }
  }

  function importAIIntoReview() {
    if (!latestAI) return
    setScore(latestAI.overallScore)
    setRecommendation(latestAI.recommendation)
    setComments(
      `Summary: ${latestAI.summary}\n\nStrengths:\n${latestAI.strengths.map((s) => `- ${s}`).join('\n')}\n\nWeaknesses:\n${latestAI.weaknesses.map((s) => `- ${s}`).join('\n')}\n\nQuestions for authors:\n${latestAI.questions.map((s) => `- ${s}`).join('\n')}\n\n(Started from the AI review — edited by the human reviewer.)`,
    )
  }

  async function saveReview(e: React.FormEvent, draft = false) {
    e.preventDefault()
    setReviewSaved(null)
    try {
      await api(`/api/submissions/${submission.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          overallScore: score,
          criteriaScores: { ...criteriaScores },
          recommendation,
          comments,
          confidentialComments: confidentialComments.trim() || undefined,
          draft,
        }),
      })
      await refreshData()
      if (!draft) { setComments(''); setConfidentialComments('') }
      setReviewSaved(draft ? 'Draft review saved. It is not visible to organizers as a completed review until you submit it.' : 'Review submitted. Human reviews — not AI output — inform the organizer decision.')
    } catch (err) {
      setReviewSaved(null)
      setAuthorError(err instanceof Error ? err.message : 'Failed to save the review.')
    }
  }

  async function assignReviewer(e: React.FormEvent) {
    e.preventDefault()
    setManagerBusy(true)
    setManagerMsg(null)
    setManagerError(null)
    try {
      await api(`/api/submissions/${submission.id}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ reviewerEmail: reviewerEmail.trim(), dueDate: dueDate || undefined }),
      })
      await refreshData()
      setReviewerEmail('')
      setDueDate('')
      setManagerMsg('Reviewer assigned. They will see this paper in their reviewer queue.')
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to assign the reviewer.')
    } finally {
      setManagerBusy(false)
    }
  }

  async function saveDecision(release: boolean) {
    setManagerBusy(true)
    setManagerMsg(null)
    setManagerError(null)
    try {
      await api(`/api/submissions/${submission.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: decisionNote.trim() || undefined, release }),
      })
      await refreshData()
      setManagerMsg(release ? 'Decision saved and released to the author.' : 'Decision saved. It is not visible to the author until you release it.')
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to save the decision.')
    } finally {
      setManagerBusy(false)
    }
  }

  async function onDelete() {
    if (!window.confirm(`Delete submission “${submission.title}” and its stored PDF?`)) return
    setManagerBusy(true)
    setManagerMsg(null)
    setManagerError(null)
    try {
      await api(`/api/submissions/${submission.id}`, { method: 'DELETE' })
      await refreshData()
      router.push(listHref)
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to delete the submission.')
      setManagerBusy(false)
    }
  }

  async function onReplaceFileChange(selected: File | null) {
    setAuthorError(null)
    setReplaceExtraction(null)
    setReplaceFile(selected)
    if (!selected) return
    const invalid = validatePdfFile(selected)
    if (invalid) {
      setAuthorError(invalid)
      setReplaceFile(null)
      return
    }
    setReplaceBusy(true)
    const result = await extractPdfText(selected)
    setReplaceExtraction(result)
    setReplaceBusy(false)
  }

  async function submitReplace(e: React.FormEvent) {
    e.preventDefault()
    if (!replaceFile) { setAuthorError('Choose a replacement PDF first.'); return }
    const invalid = validatePdfFile(replaceFile)
    if (invalid) { setAuthorError(invalid); return }
    setReplaceBusy(true)
    setAuthorMsg(null)
    setAuthorError(null)
    try {
      const form = new FormData()
      form.set('file', replaceFile)
      form.set('pageCount', replaceExtraction?.pageCount ? String(replaceExtraction.pageCount) : '')
      form.set('extractedText', replaceExtraction?.text ?? '')
      form.set('extractionNote', replaceExtraction?.note ?? '')
      await api(`/api/submissions/${submission.id}/replace`, { method: 'POST', body: form })
      await refreshData()
      setReplaceFile(null)
      setReplaceExtraction(null)
      setAuthorMsg('Manuscript replaced on the server.')
    } catch (err) {
      setAuthorError(err instanceof Error ? err.message : 'Failed to replace the manuscript.')
    } finally {
      setReplaceBusy(false)
    }
  }

  const [revisionFile, setRevisionFile] = useState<File | null>(null)
  const [revisionBusy, setRevisionBusy] = useState(false)

  async function submitRevision(e: React.FormEvent) {
    e.preventDefault()
    if (!revisionFile) { setAuthorError('Choose the revised PDF first.'); return }
    const invalid = validatePdfFile(revisionFile)
    if (invalid) { setAuthorError(invalid); return }
    setRevisionBusy(true)
    setAuthorMsg(null)
    setAuthorError(null)
    try {
      const form = new FormData()
      form.set('file', revisionFile)
      await api(`/api/submissions/${submission.id}/revision`, { method: 'POST', body: form })
      await refreshData()
      setRevisionFile(null)
      setAuthorMsg('Revised version submitted. It is now ready for re-review.')
    } catch (err) {
      setAuthorError(err instanceof Error ? err.message : 'Failed to upload the revision.')
    } finally {
      setRevisionBusy(false)
    }
  }

  async function submitCameraReady(e: React.FormEvent) {
    e.preventDefault()
    if (!cameraFile) { setAuthorError('Choose the camera-ready PDF first.'); return }
    const invalid = validatePdfFile(cameraFile)
    if (invalid) { setAuthorError(invalid); return }
    setCameraBusy(true)
    setAuthorMsg(null)
    setAuthorError(null)
    try {
      const form = new FormData()
      form.set('file', cameraFile)
      await api(`/api/submissions/${submission.id}/camera-ready`, { method: 'POST', body: form })
      await refreshData()
      setCameraFile(null)
      setAuthorMsg('Camera-ready version uploaded.')
    } catch (err) {
      setAuthorError(err instanceof Error ? err.message : 'Failed to upload the camera-ready version.')
    } finally {
      setCameraBusy(false)
    }
  }

  const avgScore = reviews.length > 0 ? (reviews.reduce((a, r) => a + r.overallScore, 0) / reviews.length).toFixed(1) : null
  const authorsLabel = submission.authors.join(', ') || (doubleBlindReviewer ? 'Hidden (double-blind)' : 'Unknown authors')

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#64748B]">{conference.title}{organization ? ` · ${organization.name}` : ''}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111827]">{submission.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#64748B]">
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{submission.status}</span>
            {submission.submissionType ? <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{submission.submissionType}</span> : null}
            <span>by {authorsLabel}</span>
            <span>· submitted by {submission.submittedBy}</span>
            {avgScore ? <span>· human avg {avgScore}/10 ({reviews.length} review(s))</span> : null}
            {latestAI ? <span>· AI score {latestAI.overallScore}/10 ({latestAI.source})</span> : null}
          </p>
          {doubleBlindReviewer ? (
            <p className="mt-2 rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600">
              This is a double-blind review: author identities have already been hidden by the server. Please do not try to identify the authors.
            </p>
          ) : null}
          {!currentUser ? (
            <p className="mt-2 text-sm text-[#64748B]">
              You are viewing this page without an account. <Link href={`/login?next=${encodeURIComponent(pathname || listHref)}`} className="underline underline-offset-4">Sign in</Link> to review, manage, or update this paper.
            </p>
          ) : null}
        </div>
        <Button asChild variant="outline" size="sm"><Link href={listHref}>Back to submissions</Link></Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border p-6">
            <h2 className="font-medium text-[#111827]">Abstract</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#64748B]">{submission.abstract}</p>
            {submission.topics.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{submission.topics.map((t) => <span key={t} className="rounded-full border px-2 py-0.5 text-xs">{t}</span>)}</div> : null}
            {submission.assignedReviewer ? <p className="mt-3 text-sm text-[#64748B]">Assigned reviewer: <span className="font-medium text-[#111827]">{submission.assignedReviewer}</span></p> : null}
            {myAssignment ? <p className="mt-3 text-sm text-[#64748B]">Your assignment: <span className="font-medium text-[#111827]">{myAssignment.status}</span>{myAssignment.dueDate ? <> · due {myAssignment.dueDate}</> : null}</p> : null}
          </div>

          <div className="rounded-lg border p-6">
            <h2 className="font-medium text-[#111827]">Manuscript PDF</h2>
            <p className="mt-1 text-sm text-[#64748B]">{submission.pdfFileName || 'No file recorded'} {submission.pdfSize ? `· ${(submission.pdfSize / 1024).toFixed(0)} KB` : ''} {submission.pageCount ? `· ${submission.pageCount} page(s)` : ''}</p>
            {submission.fileAvailable ? (
              <>
                <iframe title="Manuscript PDF preview" src={fileUrl} className="mt-3 h-96 w-full rounded-md border" />
                <div className="mt-3 flex gap-2">
                  <Button asChild size="sm" variant="outline"><a href={fileUrl} download={submission.pdfFileName || 'manuscript.pdf'}>Download PDF</a></Button>
                  <Button asChild size="sm" variant="ghost"><a href={fileUrl} target="_blank" rel="noreferrer">Open full screen</a></Button>
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No manuscript file is stored on the server for this record. The abstract and metadata above are still reviewable, and AI review will rely on them.
              </p>
            )}
            {submission.extractionNote ? <p className="mt-2 text-xs text-[#64748B]">{submission.extractionNote}</p> : null}
            {submission.extractedText ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-[#111827]">Extracted text used for AI review ({submission.extractedText.length.toLocaleString()} chars)</summary>
                <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{submission.extractedText.slice(0, 3000)}{submission.extractedText.length > 3000 ? '…' : ''}</p>
              </details>
            ) : null}
            {submission.cameraReadyAvailable ? (
              <p className="mt-3 text-sm text-[#64748B]">
                Camera-ready: <span className="font-medium text-[#111827]">{submission.cameraReadyFileName || 'camera-ready.pdf'}</span>{' '}
                <a href={cameraUrl} download={submission.cameraReadyFileName || 'camera-ready.pdf'} className="underline underline-offset-4">Download</a>
              </p>
            ) : null}
          </div>

          {isManager ? (
            <div className="rounded-lg border p-6 flex flex-col gap-4">
              <h2 className="font-medium text-[#111827]">Chair / organizer controls</h2>

              <form onSubmit={assignReviewer} className="flex flex-col gap-3">
                <p className="text-sm font-medium text-[#111827]">Assign a reviewer</p>
                <p className="text-xs text-[#64748B]">The reviewer must have a Reviewer account approved for this event (approved application or accepted invitation) — manage that under “Participants & applications”. Assignment then gives access to this paper only.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="reviewerEmail" className="text-xs font-medium text-[#64748B]">Reviewer email (registered user)</label>
                    <input id="reviewerEmail" type="email" value={reviewerEmail} onChange={(e) => setReviewerEmail(e.target.value)} required placeholder="reviewer@university.edu" className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="dueDate" className="text-xs font-medium text-[#64748B]">Due date (optional)</label>
                    <input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div><Button type="submit" size="sm" disabled={managerBusy} className="bg-[#4F46E5] hover:bg-[#4338CA]">Assign reviewer</Button></div>
              </form>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-[#111827]">Assignments ({submissionAssignments.length})</p>
                {submissionAssignments.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {submissionAssignments.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                        <span className="font-medium text-[#111827]">{a.reviewer?.displayName || a.reviewer?.email || a.reviewerId}</span>
                        <span className="text-xs text-[#64748B]">{a.status}{a.dueDate ? ` · due ${a.dueDate}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-[#64748B]">No reviewers assigned yet.</p>}
              </div>

              <div className="flex flex-col gap-3 border-t pt-4">
                <p className="text-sm font-medium text-[#111827]">Decision</p>
                <div className="flex flex-col gap-1">
                  <label htmlFor="decision" className="text-xs font-medium text-[#64748B]">Decision</label>
                  <select id="decision" value={decision} onChange={(e) => setDecision(e.target.value as Decision)} className={inputCls}>
                    {DECISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="decisionNote" className="text-xs font-medium text-[#64748B]">Note for the author (shared when released)</label>
                  <textarea id="decisionNote" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={3} className={inputCls} placeholder="Explain the decision, required revisions, camera-ready instructions..." />
                </div>
                <p className="text-xs text-[#64748B]">Current status: {submission.status}{submission.decisionReleased ? ' · decision released to the author' : ' · decision not yet released to the author'}</p>
                {managerMsg ? <p className="text-sm text-emerald-700">{managerMsg}</p> : null}
                {managerError ? <p className="text-sm text-destructive">{managerError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={managerBusy} onClick={() => saveDecision(false)} className="bg-[#4F46E5] hover:bg-[#4338CA]">Save decision</Button>
                  <Button size="sm" variant="outline" disabled={managerBusy} onClick={() => saveDecision(true)}>Save &amp; release to author</Button>
                  <Button size="sm" variant="destructive" disabled={managerBusy} onClick={onDelete}>Delete submission</Button>
                </div>
              </div>
            </div>
          ) : null}

          {isAuthor ? (
            <div className="rounded-lg border p-6 flex flex-col gap-4">
              <h2 className="font-medium text-[#111827]">Author actions</h2>

              {submission.decisionReleased ? (
                <div className="rounded-md border bg-slate-50 px-3 py-2">
                  <p className="text-sm text-[#111827]">Decision: <span className="font-medium">{submission.status}</span></p>
                  {submission.decisionNote ? <p className="mt-1 whitespace-pre-wrap text-sm text-[#475569]">{submission.decisionNote}</p> : <p className="mt-1 text-sm text-[#64748B]">No note from the organizers.</p>}
                </div>
              ) : (
                <p className="text-sm text-[#64748B]">No decision has been released yet. Your current status is <span className="font-medium text-[#111827]">{submission.status}</span>.</p>
              )}

              {!submission.decisionReleased ? (
                <form onSubmit={saveMetadata} className="flex flex-col gap-3 border-b pb-4">
                  <p className="text-sm font-medium text-[#111827]">Edit paper details</p>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="editTitle" className="text-xs font-medium text-[#64748B]">Title</label>
                    <input id="editTitle" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="editAbstract" className="text-xs font-medium text-[#64748B]">Abstract</label>
                    <textarea id="editAbstract" value={editAbstract} onChange={(e) => setEditAbstract(e.target.value)} rows={4} className={inputCls} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="editAuthors" className="text-xs font-medium text-[#64748B]">Authors (comma separated)</label>
                      <input id="editAuthors" value={editAuthors} onChange={(e) => setEditAuthors(e.target.value)} className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="editTopics" className="text-xs font-medium text-[#64748B]">Topics (comma separated)</label>
                      <input id="editTopics" value={editTopics} onChange={(e) => setEditTopics(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div><Button type="submit" size="sm" disabled={editBusy} className="bg-[#4F46E5] hover:bg-[#4338CA]">{editBusy ? 'Saving...' : 'Save paper details'}</Button></div>
                </form>
              ) : null}

              <form onSubmit={submitReplace} className="flex flex-col gap-2">
                <label htmlFor="replacePdf" className="text-sm font-medium text-[#111827]">Replace manuscript PDF (max {MAX_PDF_BYTES / 1024 / 1024} MB)</label>
                <input id="replacePdf" type="file" accept="application/pdf,.pdf" onChange={(e) => onReplaceFileChange(e.target.files?.[0] ?? null)} className="rounded-md border px-3 py-2 text-sm" />
                {replaceFile ? <p className="text-xs text-[#64748B]">{replaceFile.name} · {(replaceFile.size / 1024).toFixed(0)} KB{replaceExtraction?.pageCount ? ` · ${replaceExtraction.pageCount} page(s)` : ''}</p> : null}
                <div><Button type="submit" size="sm" disabled={replaceBusy || !replaceFile} className="bg-[#4F46E5] hover:bg-[#4338CA]">{replaceBusy ? 'Uploading...' : 'Replace manuscript'}</Button></div>
              </form>

              {showRevision ? (
                <form onSubmit={submitRevision} className="flex flex-col gap-2 border-t pt-4">
                  <label htmlFor="revisionPdf" className="text-sm font-medium text-[#111827]">Upload revised manuscript (revision requested)</label>
                  <p className="text-xs text-[#64748B]">The organizer requested a revision. Uploading replaces the manuscript and moves the paper to “Revised Submitted” for re-review.</p>
                  <input id="revisionPdf" type="file" accept="application/pdf,.pdf" onChange={(e) => setRevisionFile(e.target.files?.[0] ?? null)} className="rounded-md border px-3 py-2 text-sm" />
                  {revisionFile ? <p className="text-xs text-[#64748B]">{revisionFile.name} · {(revisionFile.size / 1024).toFixed(0)} KB</p> : null}
                  <div><Button type="submit" size="sm" disabled={revisionBusy || !revisionFile} className="bg-[#4F46E5] hover:bg-[#4338CA]">{revisionBusy ? 'Uploading...' : 'Submit revised version'}</Button></div>
                </form>
              ) : null}

              {showCameraReady ? (
                <form onSubmit={submitCameraReady} className="flex flex-col gap-2 border-t pt-4">
                  <label htmlFor="cameraPdf" className="text-sm font-medium text-[#111827]">Camera-ready PDF (max {MAX_PDF_BYTES / 1024 / 1024} MB)</label>
                  {submission.cameraReadyFileName ? <p className="text-xs text-[#64748B]">Current camera-ready file: {submission.cameraReadyFileName}</p> : null}
                  <input id="cameraPdf" type="file" accept="application/pdf,.pdf" onChange={(e) => setCameraFile(e.target.files?.[0] ?? null)} className="rounded-md border px-3 py-2 text-sm" />
                  {cameraFile ? <p className="text-xs text-[#64748B]">{cameraFile.name} · {(cameraFile.size / 1024).toFixed(0)} KB</p> : null}
                  <div><Button type="submit" size="sm" disabled={cameraBusy || !cameraFile} className="bg-[#4F46E5] hover:bg-[#4338CA]">{cameraBusy ? 'Uploading...' : 'Upload camera-ready'}</Button></div>
                </form>
              ) : null}

              {authorMsg ? <p className="text-sm text-emerald-700">{authorMsg}</p> : null}
              {authorError ? <p className="text-sm text-destructive">{authorError}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {!canUseReviewTools ? (
            <div className="rounded-lg border p-6 flex flex-col gap-3">
              <h2 className="font-medium text-[#111827]">Review & decision</h2>
              <p className="text-sm text-[#64748B]">Status: <span className="font-medium text-[#111827]">{submission.status}</span></p>
              {submission.decisionReleased ? (
                <>
                  <p className="text-sm text-[#64748B]">The organizers have released their decision. Feedback from reviewers is shown below when it was shared with you.</p>
                  {reviews.length > 0 ? (
                    <ul className="flex flex-col gap-3">
                      {reviews.map((r) => (
                        <li key={r.id} className="rounded-md border p-3">
                          <p className="text-sm"><span className="font-medium">{r.reviewerName}</span> · {r.overallScore}/10 · {r.recommendation}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-[#475569]">{r.comments}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-[#64748B]">No written feedback was shared.</p>}
                </>
              ) : (
                <p className="text-sm text-[#64748B]">Your paper is with the organizers and assigned reviewers. Reviews and AI reviewing tools are not visible to authors; the decision will appear here once the organizers release it.</p>
              )}
            </div>
          ) : null}
          {canUseReviewTools ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-[#111827]">AI reviewer <span className="text-xs font-normal text-[#64748B]">(advisory only)</span></h2>
              <Button size="sm" disabled={aiLoading} onClick={runAIReview} className="bg-[#4F46E5] hover:bg-[#4338CA]">{aiLoading ? 'Reviewing...' : latestAI ? 'Re-run AI review' : 'Get AI review'}</Button>
            </div>
            <p className="text-xs text-[#64748B]">Score + written feedback to assist a human reviewer. It never accepts or rejects a paper, and the chair decision stays human. Add your Meta key in <Link href="/profile" className="underline underline-offset-4">Profile</Link> for a content-based review; otherwise a labeled heuristic fallback runs.</p>
            {aiError ? <p className="text-sm text-destructive">{aiError}</p> : null}
            {latestAI ? (
              <div className="flex flex-col gap-3 rounded-lg border bg-white p-4">
                <p className="text-xs text-[#64748B]">Source: {latestAI.label}{latestAI.model ? ` · model ${latestAI.model}` : ''} · {new Date(latestAI.createdAt).toLocaleString()} · confidence {latestAI.confidence}</p>
                <div className="grid grid-cols-5 gap-2">
                  <ScorePill label="Overall" value={latestAI.overallScore} max={10} />
                  <ScorePill label="Novelty" value={latestAI.criteria.novelty} max={5} />
                  <ScorePill label="Technical" value={latestAI.criteria.technicalQuality} max={5} />
                  <ScorePill label="Clarity" value={latestAI.criteria.clarity} max={5} />
                  <ScorePill label="Complete" value={latestAI.criteria.completeness} max={5} />
                </div>
                <p className="text-sm"><span className="font-medium">Recommendation:</span> {latestAI.recommendation}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#334155]">{latestAI.summary}</p>
                {latestAI.strengths.length > 0 ? <div><p className="text-sm font-medium">Strengths</p><ul className="mt-1 list-inside list-disc text-sm text-[#475569]">{latestAI.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div> : null}
                {latestAI.weaknesses.length > 0 ? <div><p className="text-sm font-medium">Weaknesses</p><ul className="mt-1 list-inside list-disc text-sm text-[#475569]">{latestAI.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul></div> : null}
                {latestAI.questions.length > 0 ? <div><p className="text-sm font-medium">Questions for authors</p><ul className="mt-1 list-inside list-disc text-sm text-[#475569]">{latestAI.questions.map((s) => <li key={s}>{s}</li>)}</ul></div> : null}
                <div><Button size="sm" variant="outline" onClick={importAIIntoReview}>Use as starting point for my review</Button></div>
              </div>
            ) : (
              <p className="text-sm text-[#64748B]">No AI review yet for this paper.</p>
            )}
            {aiReviews.length > 1 ? <p className="text-xs text-[#64748B]">{aiReviews.length} AI review runs stored; showing the latest.</p> : null}
          </div>
          ) : null}

          {canUseReviewTools ? (
          <div className="rounded-lg border p-6 flex flex-col gap-4">
            <h2 className="font-medium text-[#111827]">Human reviews ({reviews.length})</h2>
            {reviews.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-md border p-3">
                    <p className="text-sm"><span className="font-medium">{r.reviewerName}</span> · {r.overallScore}/10 · {r.recommendation}</p>
                    {r.criteriaScores && Object.keys(r.criteriaScores).length > 0 ? (
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {Object.entries(r.criteriaScores).map(([name, value]) => (
                          <span key={name} className="rounded-full border px-2 py-0.5 text-xs">{name}: {value}/5</span>
                        ))}
                      </p>
                    ) : null}
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#475569]">{r.comments}</p>
                    {isManager && r.confidentialComments ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-md border bg-slate-50 px-3 py-2 text-sm text-[#475569]"><span className="font-medium text-[#111827]">Confidential to organizers:</span> {r.confidentialComments}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[#64748B]">No human reviews yet.</p>}

            {canReview ? (
              <form onSubmit={saveReview} className="flex flex-col gap-3 border-t pt-4">
                <p className="text-sm font-medium text-[#111827]">Write a review</p>
                {currentUser ? <p className="text-xs text-[#64748B]">Reviewing as <span className="font-medium text-[#111827]">{currentUser.displayName}</span> ({currentUser.email}){myAssignment ? <> · assignment {myAssignment.status}{myAssignment.dueDate ? ` · due ${myAssignment.dueDate}` : ''}</> : null}</p> : null}
                {doubleBlindReviewer ? <p className="text-xs text-[#64748B]">Double-blind: author identities are hidden by the server for this conference.</p> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {criteria.map((c) => (
                    <div key={c} className="flex flex-col gap-1">
                      <label htmlFor={`crit-${c}`} className="text-xs font-medium text-[#64748B]">{c} (1-5)</label>
                      <input id={`crit-${c}`} type="number" min={1} max={5} value={criteriaScores[c] ?? 3} onChange={(e) => setCriteriaScores((prev) => ({ ...prev, [c]: Math.min(5, Math.max(1, Number(e.target.value) || 1)) }))} className={inputCls} />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rscore" className="text-xs font-medium text-[#64748B]">Overall score (1-10)</label>
                    <input id="rscore" type="number" min={1} max={10} value={score} onChange={(e) => setScore(Number(e.target.value))} className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rrec" className="text-xs font-medium text-[#64748B]">Recommendation</label>
                    <select id="rrec" value={recommendation} onChange={(e) => setRecommendation(e.target.value as ReviewRecommendation)} className={inputCls}>
                      {RECOMMENDATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rcomments" className="text-xs font-medium text-[#64748B]">Comments (strengths, weaknesses, questions)</label>
                  <textarea id="rcomments" value={comments} onChange={(e) => setComments(e.target.value)} required rows={6} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rconfidential" className="text-xs font-medium text-[#64748B]">Confidential comments (organizers only)</label>
                  <textarea id="rconfidential" value={confidentialComments} onChange={(e) => setConfidentialComments(e.target.value)} rows={3} className={inputCls} placeholder="Only conference organizers can read this. Authors and other reviewers never see it." />
                  <p className="text-xs text-[#64748B]">Confidential comments are visible to organizers only.</p>
                </div>
                {reviewSaved ? <p className="text-sm text-emerald-700">{reviewSaved}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]">Submit review</Button>
                  <Button type="button" size="sm" variant="outline" onClick={(e) => void saveReview(e, true)}>Save draft</Button>
                </div>
              </form>
            ) : (
              <p className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {isAuthor
                  ? 'Authors cannot review their own paper. Reviews from assigned reviewers will appear here once decisions are released.'
                  : isManager
                    ? 'Organizers manage the process here; only assigned Reviewer accounts can write reviews.'
                    : 'Only reviewers assigned to this paper can write a review for it.'}
              </p>
            )}
          </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
