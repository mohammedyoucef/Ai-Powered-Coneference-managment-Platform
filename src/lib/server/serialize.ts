import type { Conference, Organization, Submission } from '@/lib/demo/types'

type Row = Record<string, unknown>

const d = (v: unknown): string | undefined => {
  if (!v) return undefined
  if (v instanceof Date) {
    // pg parses `date` columns at local midnight; format with local parts to avoid TZ off-by-one.
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  return String(v).slice(0, 10)
}
const ts = (v: unknown): string => (v ? new Date(String(v)).toISOString() : new Date().toISOString())
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? (JSON.parse(v) as string[]) : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : typeof v === 'string' ? JSON.parse(v) : {})

export function serializeOrg(r: Row, memberRole?: string): Organization {
  return {
    id: String(r.id), name: String(r.name), slug: String(r.slug),
    description: (r.description as string) || undefined, type: (r.type as string) || undefined,
    websiteUrl: (r.website_url as string) || undefined, contactEmail: (r.contact_email as string) || undefined,
    logoUrl: (r.logo_url as string) || undefined, createdBy: (r.created_by as string) || undefined,
    memberRole: (memberRole as Organization['memberRole']) || undefined,
    createdAt: ts(r.created_at),
  }
}

const STATUS_BY_LIFECYCLE: Record<string, Conference['status']> = {
  draft: 'Draft', published: 'Published', cfp_open: 'Published', submissions_open: 'Published',
  under_review: 'Published', decisions_released: 'Published', camera_ready: 'Published', completed: 'Published',
}

export function serializeConference(r: Row): Conference {
  const lifecycle = String(r.lifecycle || 'draft') as Conference['lifecycle']
  return {
    id: String(r.id), organizationId: String(r.organization_id), title: String(r.title), slug: String(r.slug),
    shortDescription: (r.short_description as string) || undefined, fullDescription: (r.full_description as string) || undefined,
    researchTopics: arr(r.research_topics),
    startDate: d(r.start_date), endDate: d(r.end_date), submissionDeadline: d(r.submission_deadline), cameraReadyDeadline: d(r.camera_ready_deadline),
    venueOrFormat: (r.venue_or_format as string) || undefined, city: (r.city as string) || undefined, country: (r.country as string) || undefined,
    contactEmail: (r.contact_email as string) || undefined, language: (r.language as string) || undefined,
    submissionGuidelines: (r.submission_guidelines as string) || undefined,
    status: STATUS_BY_LIFECYCLE[lifecycle] ?? 'Draft', lifecycle,
    category: (r.category as string) || undefined, conferenceType: (r.conference_type as string) || undefined,
    visibility: r.visibility === 'private' ? 'private' : 'public',
    reviewMethod: r.review_method === 'single_blind' ? 'single_blind' : 'double_blind',
    reviewCriteria: arr(r.review_criteria).length ? arr(r.review_criteria) : ['Novelty', 'Technical quality', 'Clarity', 'Completeness'],
    submissionTypes: arr(r.submission_types).length ? arr(r.submission_types) : ['Full paper'],
    submissionsEnabled: r.submissions_enabled !== false,
    registrationEnabled: r.registration_enabled !== false,
    registrationMode: r.registration_mode === 'auto' ? 'auto' : 'approval',
    participationFeeCents: Number(r.participation_fee_cents || 0),
    feeCurrency: String(r.fee_currency || 'USD'),
    capacity: r.capacity ? Number(r.capacity) : undefined,
    registrationDeadline: d(r.registration_deadline),
    eligibilityCriteria: arr(r.eligibility_criteria),
    eligibilityQuestions: arr(r.eligibility_questions),
    requiredDocuments: arr(r.required_documents),
    reviewerMode: r.reviewer_mode === 'applications' || r.reviewer_mode === 'invitations' ? r.reviewer_mode : 'both',
    reviewDeadline: d(r.review_deadline),
    maxFileSizeMb: Number(r.max_file_size_mb || 10),
    branding: obj(r.branding) as Conference['branding'],
    wizardStep: Number(r.wizard_step || 0), createdBy: (r.created_by as string) || undefined,
    createdAt: ts(r.created_at), updatedAt: ts(r.updated_at),
  }
}

export function serializeSubmission(r: Row, opts?: { anonymize?: boolean }): Submission {
  const anon = Boolean(opts?.anonymize)
  return {
    id: String(r.id), conferenceId: String(r.conference_id),
    title: anon ? String(r.title) : String(r.title),
    abstract: String(r.abstract || ''),
    authors: anon ? [] : arr(r.authors),
    topics: arr(r.topics),
    submittedBy: anon ? 'Hidden (double-blind)' : String(r.submitted_by || ''),
    authorId: anon ? undefined : ((r.author_id as string) || undefined),
    status: String(r.status) as Submission['status'],
    assignedReviewer: (r.assigned_reviewer_name as string) || undefined,
    assignedReviewerId: (r.assigned_reviewer_id as string) || undefined,
    pdfFileName: String(r.file_name || ''), pdfSize: Number(r.file_size || 0),
    pageCount: r.page_count ? Number(r.page_count) : undefined,
    extractedText: anon ? undefined : ((r.extracted_text as string) || undefined),
    extractionNote: (r.extraction_note as string) || undefined,
    fileAvailable: Boolean(r.file_path),
    cameraReadyFileName: (r.camera_file_name as string) || undefined,
    cameraReadyAvailable: Boolean(r.camera_file_path),
    decisionNote: (r.decision_note as string) || undefined,
    decisionReleased: Boolean(r.decision_released),
    submissionType: (r.submission_type as string) || undefined,
    createdAt: ts(r.created_at), updatedAt: ts(r.updated_at),
  }
}
