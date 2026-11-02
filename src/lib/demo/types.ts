export type OrgRole = 'owner' | 'admin' | 'member'
export type PlatformRole = 'user' | 'platform_admin'

/** Primary account type chosen at registration. It determines the dashboard
 * and which server-side capabilities the account has (enforced in every API
 * route, never only in the UI). It is fixed after registration. */
export type AccountType = 'researcher' | 'reviewer' | 'organizer' | 'visitor'

export type UserProfile = {
  /** Profile picture as a data: URL (resized client-side) or https: URL. */
  avatarUrl?: string
  position?: string
  contact?: string
  researchInterests?: string[]
  expertise?: string[]
  qualifications?: string
  orcid?: string
  academicProfileUrl?: string
  academicInfo?: string
  attendeeInfo?: string
}

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; short: string; description: string; cta: string }> = {
  organizer: {
    label: 'Organizer / Chair',
    short: 'Organizer',
    description: 'Create organizations & conferences, build the AI website, manage submissions and decisions.',
    cta: 'Create your first organization',
  },
  researcher: {
    label: 'Researcher / Author',
    short: 'Researcher',
    description: 'Find conferences, submit papers, track decisions and upload camera-ready versions.',
    cta: 'Browse conferences to submit to',
  },
  reviewer: {
    label: 'Reviewer',
    short: 'Reviewer',
    description: 'Apply or accept invitations to review for events, then review papers assigned to you.',
    cta: 'Open your review queue',
  },
  visitor: {
    label: 'Visitor / Attendee',
    short: 'Visitor',
    description: 'Browse events, apply to attend, upload documents, and track admission and payment status.',
    cta: 'Browse events to attend',
  },
}

export function accountTypeLabel(v?: string | null): string {
  return ACCOUNT_TYPE_META[(v as AccountType) in ACCOUNT_TYPE_META ? (v as AccountType) : 'researcher'].label
}

export type AppUser = {
  id: string
  email: string
  displayName: string
  affiliation?: string
  bio?: string
  profile?: UserProfile
  profileCompleted?: boolean
  termsAcceptedAt?: string
  platformRole: PlatformRole
  accountType: AccountType
  createdAt: string
}

export type Organization = {
  id: string
  name: string
  slug: string
  description?: string
  type?: string
  websiteUrl?: string
  contactEmail?: string
  logoUrl?: string
  createdBy?: string
  memberRole?: OrgRole
  createdAt: string
}

export type OrgMember = {
  organizationId: string
  userId: string
  role: OrgRole
  user?: AppUser
  createdAt: string
}

export type OrgInvitation = {
  id: string
  organizationId: string
  email: string
  role: OrgRole
  status: 'pending' | 'accepted' | 'revoked'
  createdAt: string
  expiresAt?: string
}

export type AppNotification = {
  id: string
  userId: string
  type: string
  title: string
  body?: string
  link?: string
  isRead: boolean
  emailStatus: 'not_configured' | 'queued' | 'sent'
  createdAt: string
}

export type ActivityItem = {
  id: string
  userId?: string
  organizationId?: string
  conferenceId?: string
  action: string
  details?: string
  createdAt: string
}

export type ConferenceStatus = 'Draft' | 'Website Generated' | 'Published'

export type ConferenceLifecycle =
  | 'draft'
  | 'published'
  | 'cfp_open'
  | 'submissions_open'
  | 'under_review'
  | 'decisions_released'
  | 'camera_ready'
  | 'completed'
  | 'archived'

export const LIFECYCLE_LABELS: Record<ConferenceLifecycle, string> = {
  draft: 'Draft',
  published: 'Published / Call for Papers',
  cfp_open: 'Call for Papers',
  submissions_open: 'Submissions Open',
  under_review: 'Under Review',
  decisions_released: 'Decisions Released',
  camera_ready: 'Camera-Ready',
  completed: 'Completed',
  archived: 'Archived',
}

export type Conference = {
  id: string
  organizationId: string
  title: string
  slug: string
  shortDescription?: string
  fullDescription?: string
  researchTopics: string[]
  startDate?: string
  endDate?: string
  submissionDeadline?: string
  cameraReadyDeadline?: string
  venueOrFormat?: string
  city?: string
  country?: string
  contactEmail?: string
  language?: string
  submissionGuidelines?: string
  status: ConferenceStatus
  lifecycle: ConferenceLifecycle
  category?: string
  conferenceType?: string
  visibility?: 'public' | 'private'
  reviewMethod?: 'single_blind' | 'double_blind'
  reviewCriteria?: string[]
  submissionTypes?: string[]
  submissionsEnabled?: boolean
  registrationEnabled?: boolean
  registrationMode?: 'auto' | 'approval'
  participationFeeCents?: number
  feeCurrency?: string
  capacity?: number
  registrationDeadline?: string
  eligibilityCriteria?: string[]
  eligibilityQuestions?: string[]
  requiredDocuments?: string[]
  reviewerMode?: 'applications' | 'invitations' | 'both'
  reviewDeadline?: string
  maxFileSizeMb?: number
  branding?: { primaryColor?: string; accentColor?: string; logoUrl?: string; coverImageUrl?: string }
  wizardStep?: number
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export type WebsiteThemeVariant =
  | 'modern-academic'
  | 'editorial-minimal'
  | 'bold-research'
  | 'contemporary-tech'
  | 'elegant-institutional'

export type WebsiteSectionType =
  | 'hero'
  | 'about'
  | 'research-topics'
  | 'important-dates'
  | 'submission-guidelines'
  | 'keynote-speakers'
  | 'organizing-committee'
  | 'venue'
  | 'registration'
  | 'faqs'
  | 'contact'
  | 'accepted-papers'
  | 'conference-program'
  | 'researchers'
  | 'custom'

export type WebsiteLayout =
  | 'classic'
  | 'split-hero'
  | 'centered'
  | 'magazine'
  | 'single-page'
  | 'speaker-forward'
  | 'schedule-forward'

export type WebsiteDesign = {
  layout: WebsiteLayout
  palette: {
    primary: string
    accent: string
    background: string
    surface: string
    text: string
  }
  typography: 'sans' | 'serif' | 'modern'
  density: 'comfortable' | 'compact'
  heroStyle: 'solid' | 'gradient' | 'pattern' | 'split'
  features?: {
    /** Live countdown to the submission deadline / conference start. */
    countdown?: boolean
    /** Animated counters with real submission/topic counts. */
    stats?: boolean
  }
}

/** An image attached to a section: remote stock photo, an uploaded file, or an AI-generated image (IndexedDB media id). */
export type WebsiteImage = {
  source: 'stock' | 'upload' | 'ai'
  url?: string
  mediaId?: string
  alt: string
  credit?: string
}

export type WebsiteSection = {
  id: string
  type: WebsiteSectionType
  enabled: boolean
  order: number
  /** Visual treatment chosen by AI/user, validated per section in the renderer. */
  variant?: string
  // Structured, validated content only. Never executable code.
  content: Record<string, unknown>
}

export type WebsiteConfig = {
  id: string
  conferenceId: string
  themeVariant: WebsiteThemeVariant
  /** 'ai-page': the Meta model authored the whole page (customHtml). 'structured': section/template renderer. */
  generationMode?: 'structured' | 'ai-page'
  /** Sanitized standalone HTML document authored by the AI model (no scripts — rendered in a sandboxed iframe). */
  customHtml?: string
  /** Short design notes returned by the model with an ai-page. */
  aiSummary?: string[]
  /** Assigned art-direction seed id (lib/website/design-seed), when one was used. */
  designSeed?: string
  design?: WebsiteDesign
  /** The user's design prompt that produced this config, kept for regeneration. */
  designPrompt?: string
  sections: WebsiteSection[]
  metadata?: {
    title?: string
    description?: string
  }
  createdAt: string
  updatedAt: string
  published: boolean
  publishedAt?: string
}

/* ---------------- People (demo, no login) ---------------- */

export type UserRole = 'chair' | 'organizer' | 'author' | 'reviewer'

export type DemoProfile = {
  displayName: string
  role: UserRole
}

/* ---------------- Submissions & review ---------------- */

export type SubmissionStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Revision Requested' | 'Revised Submitted' | 'Accepted' | 'Rejected' | 'Camera-Ready Requested' | 'Camera-Ready Submitted'

export type VisitorApplicationStatus = 'draft' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected' | 'waitlisted' | 'cancelled'
export type PaymentStatus = 'not_required' | 'unconfigured' | 'pending' | 'succeeded' | 'failed' | 'refunded'

export type VisitorApplication = {
  id: string
  conferenceId: string
  visitorId: string
  visitorName?: string
  visitorEmail?: string
  conferenceTitle?: string
  status: VisitorApplicationStatus
  answers: Record<string, string>
  documentName?: string
  documentAvailable?: boolean
  paymentStatus: PaymentStatus
  organizerNote?: string
  createdAt: string
  updatedAt: string
}

export type Payment = {
  id: string
  visitorApplicationId: string
  conferenceId: string
  userId: string
  amountCents: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'unconfigured'
  provider?: string
  createdAt: string
}

export type ReviewerApplication = {
  id: string
  conferenceId: string
  reviewerId: string
  reviewerName?: string
  reviewerEmail?: string
  conferenceTitle?: string
  message?: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  createdAt: string
}

export type ReviewerInvitation = {
  id: string
  conferenceId: string
  reviewerId?: string
  email: string
  conferenceTitle?: string
  status: 'invited' | 'accepted' | 'declined' | 'revoked'
  createdAt: string
}

export type EventInvitation = {
  id: string
  conferenceId: string
  email: string
  invitedRole: 'visitor' | 'researcher'
  status: 'pending' | 'accepted' | 'revoked'
  createdAt: string
}

export type AiScreening = {
  id: string
  visitorApplicationId: string
  conferenceId: string
  source: 'meta' | 'fallback' | 'unavailable'
  model?: string
  recommendation: 'appears_to_meet' | 'additional_info_needed' | 'may_not_meet' | 'unable_to_determine'
  assessment: {
    criteriaEvaluated?: { criterion: string; evidence: string | null; met: boolean | null }[]
    missingInformation?: string[]
    concerns?: string[]
    explanation?: string
    note?: string
  }
  createdAt: string
}

export type EventAnnouncement = {
  id: string
  conferenceId: string
  title: string
  body?: string
  audience: 'all' | 'visitors' | 'researchers' | 'reviewers'
  createdAt: string
}

export type Submission = {
  id: string
  conferenceId: string
  title: string
  abstract: string
  authors: string[]
  topics: string[]
  submittedBy: string
  authorId?: string
  status: SubmissionStatus
  assignedReviewer?: string
  assignedReviewerId?: string
  pdfFileName: string
  pdfSize: number
  pageCount?: number
  extractedText?: string
  extractionNote?: string
  fileAvailable?: boolean
  cameraReadyFileName?: string
  cameraReadyAvailable?: boolean
  decisionNote?: string
  decisionReleased?: boolean
  submissionType?: string
  createdAt: string
  updatedAt: string
}

export type ReviewAssignment = {
  id: string
  submissionId: string
  reviewerId: string
  reviewer?: AppUser
  status: 'invited' | 'completed' | 'declined'
  dueDate?: string
  createdAt: string
}

export type ReviewRecommendation = 'Accept' | 'Weak Accept' | 'Borderline' | 'Weak Reject' | 'Reject'

export type Review = {
  id: string
  submissionId: string
  reviewerName: string
  reviewerId?: string
  assignmentId?: string
  overallScore: number // 1-10
  criteriaScores?: Record<string, number>
  recommendation: ReviewRecommendation
  comments: string
  confidentialComments?: string
  status?: 'draft' | 'submitted'
  createdAt: string
  updatedAt: string
}

export type AIReview = {
  id: string
  submissionId: string
  overallScore: number // 1-10
  criteria: {
    novelty: number // 1-5
    technicalQuality: number
    clarity: number
    completeness: number
  }
  summary: string
  strengths: string[]
  weaknesses: string[]
  questions: string[]
  recommendation: ReviewRecommendation
  confidence: 'low' | 'medium' | 'high'
  source: 'meta' | 'fallback'
  label: string
  model?: string
  createdAt: string
}

export type DemoData = {
  organizations: Organization[]
  conferences: Conference[]
  /** Draft / working website configs, one per conference. */
  websiteConfigs: WebsiteConfig[]
  /** Immutable snapshots taken at publish time, one per conference. */
  publishedWebsiteConfigs: WebsiteConfig[]
  submissions: Submission[]
  reviews: Review[]
  aiReviews: AIReview[]
  currentUser?: AppUser | null
  members: OrgMember[]
  invitations: OrgInvitation[]
  assignments: ReviewAssignment[]
  notifications: AppNotification[]
  users: AppUser[]
  activity: ActivityItem[]
  visitorApplications: VisitorApplication[]
  payments: Payment[]
  reviewerApplications: ReviewerApplication[]
  reviewerInvitations: ReviewerInvitation[]
  eventInvitations: EventInvitation[]
  aiScreenings: AiScreening[]
  announcements: EventAnnouncement[]
}
