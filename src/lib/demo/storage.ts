'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { AIReview, Conference, DemoData, Organization, Review, Submission, WebsiteConfig } from './types'

/**
 * Server-backed data layer (PostgreSQL via /api/*).
 * The name is kept for compatibility with existing components, but data is
 * NO LONGER stored in localStorage: every read comes from /api/bootstrap
 * (authorized on the server) and every mutation calls a server route that
 * enforces permissions, deadlines, and state transitions.
 */

export const DEMO_UPDATED_EVENT = 'confexa-data-updated'

const emptyData: DemoData = {
  organizations: [], conferences: [], websiteConfigs: [], publishedWebsiteConfigs: [],
  submissions: [], reviews: [], aiReviews: [], currentUser: null,
  members: [], invitations: [], assignments: [], notifications: [], users: [], activity: [],
  visitorApplications: [], payments: [], reviewerApplications: [], reviewerInvitations: [],
  eventInvitations: [], aiScreenings: [], announcements: [],
}

let cache: DemoData = emptyData
let loaded = false
let loadingPromise: Promise<unknown> | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DEMO_UPDATED_EVENT))
}

export async function refreshData(): Promise<DemoData> {
  try {
    const res = await fetch('/api/bootstrap', { cache: 'no-store' })
    const payload = await res.json().catch(() => ({}))
    if (res.ok && payload.data) cache = payload.data as DemoData
  } catch {
    // Keep last known cache; pages show their own error states.
  }
  loaded = true
  emit()
  return cache
}

function ensureLoading() {
  if (loaded || loadingPromise || typeof window === 'undefined') return
  loadingPromise = refreshData().finally(() => { loadingPromise = null })
}

export function loadDemoData(): DemoData {
  ensureLoading()
  return cache
}

export function saveDemoData(_data: DemoData): void {
  // Deprecated: persistence is server-side now. Kept so legacy callers compile.
  void _data
  void refreshData()
}

export function resetDemoData(): void {
  cache = emptyData
  loaded = false
  emit()
}

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function uniqueSlug(base: string, taken: string[]): string {
  const root = slugify(base) || 'untitled'
  if (!taken.includes(root)) return root
  let n = 2
  while (taken.includes(`${root}-${n}`)) n += 1
  return `${root}-${n}`
}

export async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(init?.headers || {}) } })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((payload as { error?: string }).error || `Request failed (HTTP ${res.status})`)
  return payload as T
}

/* ---------------- Organizations ---------------- */

export function getOrganizations(): Organization[] { return cache.organizations }
export function getOrganizationBySlug(slug: string): Organization | null { return cache.organizations.find((o) => o.slug === slug) ?? null }

export async function apiCreateOrganization(input: Partial<Organization>): Promise<Organization> {
  const data = await api<{ organization: Organization }>('/api/organizations', { method: 'POST', body: JSON.stringify(input) })
  await refreshData()
  return data.organization
}

export function createOrganization(input: Partial<Organization>): Organization {
  const org: Organization = {
    id: input.id || generateId('org'), name: input.name?.trim() || 'Untitled Organization',
    slug: uniqueSlug(input.slug || input.name || 'organization', cache.organizations.map((o) => o.slug)),
    description: input.description, type: input.type, websiteUrl: input.websiteUrl, contactEmail: input.contactEmail,
    createdAt: input.createdAt || new Date().toISOString(),
  }
  cache = { ...cache, organizations: [...cache.organizations, org] }
  emit()
  void apiCreateOrganization({ ...input, id: org.id, slug: org.slug }).catch(() => refreshData())
  return org
}

export function updateOrganization(id: string, updates: Partial<Organization>): Organization | null {
  const idx = cache.organizations.findIndex((o) => o.id === id)
  if (idx === -1) return null
  const next = [...cache.organizations]
  next[idx] = { ...next[idx], ...updates, id }
  cache = { ...cache, organizations: next }
  emit()
  void api(`/api/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then(() => refreshData()).catch(() => refreshData())
  return next[idx]
}

export function deleteOrganization(id: string): void {
  cache = { ...cache, organizations: cache.organizations.filter((o) => o.id !== id) }
  emit()
  void api(`/api/organizations/${id}`, { method: 'DELETE' }).then(() => refreshData()).catch(() => refreshData())
}

/* ---------------- Conferences ---------------- */

export function getConferences(): Conference[] { return cache.conferences }
export function getConferencesByOrg(orgId: string): Conference[] { return cache.conferences.filter((c) => c.organizationId === orgId) }
export function getConferenceBySlugInOrg(orgSlug: string, confSlug: string): Conference | null {
  const org = cache.organizations.find((o) => o.slug === orgSlug)
  if (!org) return null
  return cache.conferences.find((c) => c.organizationId === org.id && c.slug === confSlug) ?? null
}
export function getConferenceBySlug(slug: string): Conference | null { return cache.conferences.find((c) => c.slug === slug) ?? null }

export async function apiCreateConference(input: Partial<Conference>): Promise<Conference> {
  const data = await api<{ conference: Conference }>('/api/conferences', { method: 'POST', body: JSON.stringify(input) })
  await refreshData()
  return data.conference
}

export function createConference(input: Partial<Conference>): Conference {
  const now = new Date().toISOString()
  const siblings = cache.conferences.filter((c) => c.organizationId === input.organizationId).map((c) => c.slug)
  const conf: Conference = {
    id: input.id || generateId('conf'), organizationId: input.organizationId || '',
    title: input.title?.trim() || 'Untitled Conference', slug: uniqueSlug(input.slug || input.title || 'conference', siblings),
    shortDescription: input.shortDescription, fullDescription: input.fullDescription,
    researchTopics: Array.isArray(input.researchTopics) ? input.researchTopics : [],
    startDate: input.startDate, endDate: input.endDate, submissionDeadline: input.submissionDeadline, cameraReadyDeadline: input.cameraReadyDeadline,
    venueOrFormat: input.venueOrFormat, city: input.city, country: input.country, contactEmail: input.contactEmail,
    language: input.language, submissionGuidelines: input.submissionGuidelines,
    status: input.status || 'Draft', lifecycle: input.lifecycle || 'draft',
    category: input.category, conferenceType: input.conferenceType, visibility: input.visibility || 'public',
    reviewMethod: input.reviewMethod || 'double_blind', reviewCriteria: input.reviewCriteria, submissionTypes: input.submissionTypes,
    submissionsEnabled: input.submissionsEnabled, registrationEnabled: input.registrationEnabled, registrationMode: input.registrationMode,
    participationFeeCents: input.participationFeeCents, feeCurrency: input.feeCurrency, capacity: input.capacity,
    registrationDeadline: input.registrationDeadline, eligibilityCriteria: input.eligibilityCriteria, eligibilityQuestions: input.eligibilityQuestions,
    requiredDocuments: input.requiredDocuments, reviewerMode: input.reviewerMode, reviewDeadline: input.reviewDeadline, maxFileSizeMb: input.maxFileSizeMb,
    branding: input.branding, wizardStep: input.wizardStep,
    createdAt: input.createdAt || now, updatedAt: now,
  }
  cache = { ...cache, conferences: [...cache.conferences, conf] }
  emit()
  void apiCreateConference({ ...input, id: conf.id, slug: conf.slug }).catch(() => refreshData())
  return conf
}

export function updateConference(id: string, updates: Partial<Conference>): Conference | null {
  const idx = cache.conferences.findIndex((c) => c.id === id)
  if (idx === -1) return null
  const next = [...cache.conferences]
  next[idx] = { ...next[idx], ...updates, id, updatedAt: new Date().toISOString() }
  cache = { ...cache, conferences: next }
  emit()
  void api(`/api/conferences/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then(() => refreshData()).catch(() => refreshData())
  return next[idx]
}

export function deleteConference(id: string): void {
  cache = { ...cache, conferences: cache.conferences.filter((c) => c.id !== id) }
  emit()
  void api(`/api/conferences/${id}`, { method: 'DELETE' }).then(() => refreshData()).catch(() => refreshData())
}

/* ---------------- Website configs ---------------- */

export function getWebsiteConfig(conferenceId: string): WebsiteConfig | null {
  return cache.websiteConfigs.find((w) => w.conferenceId === conferenceId) ?? null
}

export function saveWebsiteConfig(config: WebsiteConfig): WebsiteConfig {
  const toSave = { ...config, updatedAt: new Date().toISOString() }
  const idx = cache.websiteConfigs.findIndex((w) => w.conferenceId === config.conferenceId)
  const next = [...cache.websiteConfigs]
  if (idx >= 0) next[idx] = toSave; else next.push(toSave)
  cache = { ...cache, websiteConfigs: next }
  emit()
  void api(`/api/conferences/${config.conferenceId}/website`, { method: 'PUT', body: JSON.stringify({ config: toSave }) }).then(() => refreshData()).catch(() => refreshData())
  return toSave
}

export function getPublishedWebsiteConfig(conferenceId: string): WebsiteConfig | null {
  return cache.publishedWebsiteConfigs.find((w) => w.conferenceId === conferenceId) ?? null
}

export function publishWebsiteConfig(conferenceId: string): WebsiteConfig | null {
  const draft = cache.websiteConfigs.find((w) => w.conferenceId === conferenceId)
  if (!draft) return null
  const snapshot: WebsiteConfig = { ...JSON.parse(JSON.stringify(draft)) as WebsiteConfig, published: true, publishedAt: new Date().toISOString() }
  cache = {
    ...cache,
    publishedWebsiteConfigs: [...cache.publishedWebsiteConfigs.filter((w) => w.conferenceId !== conferenceId), snapshot],
    conferences: cache.conferences.map((c) => c.id === conferenceId ? { ...c, status: 'Published', lifecycle: c.lifecycle === 'draft' ? 'published' : c.lifecycle } : c),
  }
  emit()
  void api(`/api/conferences/${conferenceId}/website`, { method: 'POST', body: JSON.stringify({ action: 'publish' }) }).then(() => refreshData()).catch(() => refreshData())
  return snapshot
}

export function unpublishWebsiteConfig(conferenceId: string): void {
  cache = { ...cache, publishedWebsiteConfigs: cache.publishedWebsiteConfigs.filter((w) => w.conferenceId !== conferenceId) }
  emit()
  void api(`/api/conferences/${conferenceId}/website`, { method: 'POST', body: JSON.stringify({ action: 'unpublish' }) }).then(() => refreshData()).catch(() => refreshData())
}

/* ---------------- Submissions / reviews ---------------- */

export function getSubmissions(conferenceId?: string): Submission[] {
  return conferenceId ? cache.submissions.filter((s) => s.conferenceId === conferenceId) : cache.submissions
}
export function getSubmission(id: string): Submission | null { return cache.submissions.find((s) => s.id === id) ?? null }

export function createSubmission(_input: Partial<Submission>): Submission {
  void _input
  throw new Error('Use the submission form: papers are uploaded to the server (POST /api/conferences/[id]/submissions).')
}

export function updateSubmission(id: string, updates: Partial<Submission>): Submission | null {
  const idx = cache.submissions.findIndex((s) => s.id === id)
  if (idx === -1) return null
  const next = [...cache.submissions]
  next[idx] = { ...next[idx], ...updates, id, updatedAt: new Date().toISOString() }
  cache = { ...cache, submissions: next }
  emit()
  void api(`/api/submissions/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then(() => refreshData()).catch(() => refreshData())
  return next[idx]
}

export function deleteSubmission(id: string): void {
  cache = { ...cache, submissions: cache.submissions.filter((s) => s.id !== id) }
  emit()
  void api(`/api/submissions/${id}`, { method: 'DELETE' }).then(() => refreshData()).catch(() => refreshData())
}

export function getReviews(submissionId?: string): Review[] {
  return submissionId ? cache.reviews.filter((r) => r.submissionId === submissionId) : cache.reviews
}

export function createReview(input: Partial<Review>): Review {
  const review: Review = {
    id: input.id || generateId('rev'), submissionId: input.submissionId || '',
    reviewerName: input.reviewerName || 'Reviewer', overallScore: input.overallScore ?? 5,
    recommendation: input.recommendation || 'Borderline', comments: input.comments || '',
    criteriaScores: input.criteriaScores, confidentialComments: input.confidentialComments,
    createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  cache = { ...cache, reviews: [...cache.reviews, review] }
  emit()
  void api(`/api/submissions/${review.submissionId}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ overallScore: review.overallScore, recommendation: review.recommendation, comments: review.comments, criteriaScores: review.criteriaScores, confidentialComments: review.confidentialComments }),
  }).then(() => refreshData()).catch(() => refreshData())
  return review
}

export function getAIReviews(submissionId?: string): AIReview[] {
  return submissionId ? cache.aiReviews.filter((r) => r.submissionId === submissionId) : cache.aiReviews
}

export function createAIReview(input: Omit<AIReview, 'id' | 'createdAt'> & Partial<Pick<AIReview, 'id' | 'createdAt'>>): AIReview {
  const review: AIReview = { ...input, id: input.id || generateId('airev'), createdAt: input.createdAt || new Date().toISOString() }
  cache = { ...cache, aiReviews: [...cache.aiReviews, review] }
  emit()
  void api(`/api/submissions/${review.submissionId}/ai-reviews`, {
    method: 'POST',
    body: JSON.stringify({ review: { overallScore: review.overallScore, criteria: review.criteria, summary: review.summary, strengths: review.strengths, weaknesses: review.weaknesses, questions: review.questions, recommendation: review.recommendation, confidence: review.confidence }, source: review.source, label: review.label, model: review.model }),
  }).then(() => refreshData()).catch(() => refreshData())
  return review
}

/* ---------------- React bindings ---------------- */

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  ensureLoading()
  return () => listeners.delete(callback)
}

const SERVER_DATA: DemoData = emptyData

export function useDemoData(): DemoData {
  useEffect(() => { ensureLoading() }, [])
  return useSyncExternalStore(subscribe, () => cache, () => SERVER_DATA)
}

/** True once the server dataset has loaded (gates not-found states). */
export function useHydrated(): boolean {
  useEffect(() => { ensureLoading() }, [])
  return useSyncExternalStore(subscribe, () => loaded, () => false)
}

export function getPublishedSiteBySlug(slug: string): { conference: Conference; organization: Organization | null; config: WebsiteConfig } | null {
  const conference = cache.conferences.find((c) => c.slug === slug)
  if (!conference) return null
  const config = cache.publishedWebsiteConfigs.find((w) => w.conferenceId === conference.id)
  if (!config) return null
  const organization = cache.organizations.find((o) => o.id === conference.organizationId) ?? null
  return { conference, organization, config }
}
