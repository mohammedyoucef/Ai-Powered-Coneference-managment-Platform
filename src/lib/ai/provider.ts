import { z } from 'zod'
import type { Conference, Organization, Submission, WebsiteConfig, WebsiteSection, WebsiteSectionType, WebsiteThemeVariant } from '@/lib/demo/types'
import { buildWebsiteConfig } from '@/lib/website/generator'
import { WebsiteConfigSchema, WebsiteDesignSchema } from '@/lib/website/schema'
import { sanitizeAiHtml } from '@/lib/website/sanitize'
import { formatDesignSeed, pickDesignSeed, promptHasExplicitStyle, seededDesign } from '@/lib/website/design-seed'

export interface ConferenceDraft {
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
  suggestedSections?: string[]
}

export const ConferenceDraftSchema = z.object({
  title: z.string().min(1).max(200),
  shortDescription: z.string().max(400).optional().default(''),
  fullDescription: z.string().max(5000).optional().default(''),
  researchTopics: z.array(z.string().max(120)).max(20).optional().default([]),
  startDate: z.string().max(20).optional().or(z.literal('')),
  endDate: z.string().max(20).optional().or(z.literal('')),
  submissionDeadline: z.string().max(20).optional().or(z.literal('')),
  venueOrFormat: z.string().max(200).optional().or(z.literal('')),
  language: z.string().max(50).optional().or(z.literal('')),
  websiteContactEmail: z.string().email().optional().or(z.literal('')),
  suggestedSections: z.array(z.string().max(80)).max(20).optional().default([]),
})

export interface PaperReview {
  overallScore: number
  criteria: { novelty: number; technicalQuality: number; clarity: number; completeness: number }
  summary: string
  strengths: string[]
  weaknesses: string[]
  questions: string[]
  recommendation: 'Accept' | 'Weak Accept' | 'Borderline' | 'Weak Reject' | 'Reject'
  confidence: 'low' | 'medium' | 'high'
}

export const PaperReviewSchema = z.object({
  overallScore: z.number().min(1).max(10),
  criteria: z.object({
    novelty: z.number().min(1).max(5),
    technicalQuality: z.number().min(1).max(5),
    clarity: z.number().min(1).max(5),
    completeness: z.number().min(1).max(5),
  }),
  summary: z.string().min(1).max(2000),
  strengths: z.array(z.string().max(500)).max(10).default([]),
  weaknesses: z.array(z.string().max(500)).max(10).default([]),
  questions: z.array(z.string().max(500)).max(10).default([]),
  recommendation: z.enum(['Accept', 'Weak Accept', 'Borderline', 'Weak Reject', 'Reject']),
  confidence: z.enum(['low', 'medium', 'high']),
})

export type AISource = 'meta' | 'fallback'

export interface AIResult<T> {
  data: T
  source: AISource
  /** Human-readable label that must be shown in the UI. */
  label: string
  model?: string
  summary?: string[]
}

export interface AIProvider {
  readonly source: AISource
  readonly label: string
  readonly model?: string
  testConnection(): Promise<{ ok: boolean; message: string }>
  generateConferenceDraft(input: string): Promise<AIResult<ConferenceDraft>>
  generateWebsiteConfig(conference: Conference, organization: Organization | null, variant?: WebsiteThemeVariant, designPrompt?: string): Promise<AIResult<WebsiteConfig>>
  /** Model authors the entire landing page (bespoke HTML/CSS, sanitized, no JS). Requires the Meta model. */
  generateCustomPage(conference: Conference, organization: Organization | null, designPrompt?: string): Promise<AIResult<WebsiteConfig>>
  proposeWebsiteEdit(config: WebsiteConfig, instruction: string, conference: Conference): Promise<AIResult<WebsiteConfig>>
  /** Revise an AI-authored page from a natural-language instruction. Requires the Meta model. */
  proposeCustomPageEdit(config: WebsiteConfig, instruction: string, conference: Conference): Promise<AIResult<WebsiteConfig>>
  reviewPaper(submission: Pick<Submission, 'title' | 'abstract' | 'authors' | 'topics' | 'extractedText'>, conference?: Conference | null): Promise<AIResult<PaperReview>>
}

const FALLBACK_LABEL = 'Demo fallback generator (no Meta model configured)'
const META_LABEL = 'Meta model API'

/* ---------------- Configuration (profile key -> env -> fallback) ---------------- */

export const DEFAULT_META_MODEL = 'muse-wonder-1.0'
export const DEFAULT_META_ENDPOINT = 'https://api.meta.ai/v1/responses'

export type AIConfig = { apiKey?: string; model?: string; endpoint?: string }

export function resolveAIConfig(config?: AIConfig): Required<AIConfig> & { configured: boolean } {
  const apiKey = config?.apiKey || process.env.MODEL_API_KEY || process.env.META_MODEL_API_KEY || process.env.META_API_KEY || ''
  return {
    apiKey,
    model: config?.model || process.env.META_MODEL_NAME || DEFAULT_META_MODEL,
    endpoint: config?.endpoint || process.env.META_MODEL_ENDPOINT || DEFAULT_META_ENDPOINT,
    configured: Boolean(apiKey),
  }
}

export function aiConfigFromHeaders(headers: Headers): AIConfig {
  return {
    apiKey: headers.get('x-meta-api-key') || undefined,
    model: headers.get('x-meta-model') || undefined,
    endpoint: headers.get('x-meta-endpoint') || undefined,
  }
}

export function isMetaConfigured(config?: AIConfig): boolean {
  return resolveAIConfig(config).configured
}

/* ---------------- Deterministic fallback ---------------- */

const TOPIC_KEYWORDS: [RegExp, string][] = [
  [/artificial intelligence|\bai\b|machine learning|deep learning/i, 'Artificial Intelligence & Machine Learning'],
  [/cyber|security/i, 'Cybersecurity'],
  [/trustworthy|trust/i, 'Trustworthy AI'],
  [/data science|big data/i, 'Data Science'],
  [/robot/i, 'Robotics'],
  [/health|medical|biomed/i, 'Health Informatics'],
  [/education|learning technologies/i, 'Educational Technology'],
  [/energy|sustainab|climate/i, 'Sustainable Energy & Climate'],
  [/software engineering/i, 'Software Engineering'],
  [/human.computer|hci/i, 'Human-Computer Interaction'],
  [/linguistic|nlp|language model/i, 'Natural Language Processing'],
  [/vision|image/i, 'Computer Vision'],
]

function fallbackDraft(input: string): ConferenceDraft {
  const text = input.trim()
  const topics = TOPIC_KEYWORDS.filter(([re]) => re.test(text)).map(([, t]) => t)
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? ''
  const isoDates = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []
  const venueMatch = text.match(/\b(?:in|at)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/)
  const venue = venueMatch?.[1] && /^(english|french|arabic|spanish|online|hybrid|person)$/i.test(venueMatch[1]) ? '' : venueMatch?.[1] ?? ''
  const firstSentence = text.split(/[.\n]/).map((s) => s.trim()).find(Boolean) ?? 'Untitled Conference'
  return {
    title: firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}...` : firstSentence,
    shortDescription: text.slice(0, 280),
    fullDescription: text,
    researchTopics: [...new Set(topics)],
    startDate: isoDates[0] ?? '',
    endDate: isoDates[1] ?? '',
    submissionDeadline: '',
    venueOrFormat: venue,
    language: /english/i.test(text) ? 'English' : /french|français/i.test(text) ? 'French' : /arabic/i.test(text) ? 'Arabic' : '',
    websiteContactEmail: email,
    suggestedSections: ['hero', 'about', 'research-topics', 'important-dates', 'submission-guidelines', 'venue', 'contact'],
  }
}

const SECTION_KEYWORDS: [RegExp, WebsiteSectionType][] = [
  [/faq|frequently asked/i, 'faqs'],
  [/keynote|speaker/i, 'keynote-speakers'],
  [/committee|organizer|organiser/i, 'organizing-committee'],
  [/registration|register/i, 'registration'],
  [/venue|location/i, 'venue'],
  [/program|schedule|agenda/i, 'conference-program'],
  [/accepted paper/i, 'accepted-papers'],
  [/topic/i, 'research-topics'],
  [/date|deadline/i, 'important-dates'],
  [/submission|submit/i, 'submission-guidelines'],
  [/contact/i, 'contact'],
  [/about/i, 'about'],
  [/hero|banner|header/i, 'hero'],
  [/why attend|highlight|custom|benefit/i, 'custom'],
  [/researcher|scientist/i, 'researchers'],
]

const THEME_KEYWORDS: [RegExp, WebsiteThemeVariant][] = [
  [/editorial|minimal|minimalist|clean and quiet/i, 'editorial-minimal'],
  [/bold|dark|dramatic/i, 'bold-research'],
  [/tech|technology|computing|teal/i, 'contemporary-tech'],
  [/elegant|formal|institutional|classic/i, 'elegant-institutional'],
  [/modern|academic/i, 'modern-academic'],
]

function fallbackEdit(config: WebsiteConfig, instruction: string): { config: WebsiteConfig; summary: string[] } {
  const text = instruction.trim()
  const lower = text.toLowerCase()
  const next: WebsiteConfig = JSON.parse(JSON.stringify(config)) as WebsiteConfig
  const summary: string[] = []

  for (const [re, variant] of THEME_KEYWORDS) {
    if (re.test(lower) && next.themeVariant !== variant) {
      next.themeVariant = variant
      summary.push(`Changed design variant to “${variant}”.`)
      break
    }
  }

  const disabling = /remove|disable|hide|drop|delete/.test(lower)
  const enabling = /add|enable|show|include/.test(lower)
  for (const [re, type] of SECTION_KEYWORDS) {
    if (!re.test(lower)) continue
    const section = next.sections.find((s) => s.type === type)
    if (!section) continue
    if (disabling && section.enabled) {
      section.enabled = false
      summary.push(`Disabled the “${type}” section.`)
    } else if (enabling && !section.enabled) {
      section.enabled = true
      summary.push(`Enabled the “${type}” section.`)
    }
  }

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]
  if (email) {
    const contact = next.sections.find((s) => s.type === 'contact')
    if (contact) {
      contact.content = { ...contact.content, email }
      contact.enabled = true
      summary.push(`Set the contact email to ${email}.`)
    }
  }

  const moveTop = lower.match(/move (.+?) to (?:the )?top/)
  if (moveTop) {
    for (const [re, type] of SECTION_KEYWORDS) {
      if (re.test(moveTop[1])) {
        const section = next.sections.find((s) => s.type === type)
        if (section) {
          section.order = -1
          next.sections.sort((a, b) => a.order - b.order).forEach((s, i) => { s.order = i })
          summary.push(`Moved the “${type}” section to the top (below the hero where applicable).`)
        }
      }
    }
  }

  if (/shorter|concise|trim/.test(lower)) {
    const about = next.sections.find((s) => s.type === 'about')
    const body = typeof about?.content.body === 'string' ? about.content.body : ''
    if (about && body.length > 320) {
      about.content = { ...about.content, body: `${body.slice(0, 317).trim()}...` }
      summary.push('Shortened the About section copy.')
    }
  }

  if (summary.length === 0) {
    summary.push('No deterministic change matched that instruction. Try naming a design (e.g. “make it bold and dark”), a section (e.g. “add FAQs”, “hide registration”), or a contact email.')
  }
  next.updatedAt = new Date().toISOString()
  return { config: next, summary }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)))
}

function fallbackReview(submission: Pick<Submission, 'title' | 'abstract' | 'authors' | 'topics' | 'extractedText'>): PaperReview {
  const abstractWords = submission.abstract.trim().split(/\s+/).filter(Boolean).length
  const text = submission.extractedText ?? ''
  const hasFullText = text.length > 800
  const lower = `${submission.abstract} ${text}`.toLowerCase()
  const hasMethod = /method|approach|model|algorithm|framework/.test(lower)
  const hasResults = /result|experiment|evaluation|dataset|accuracy|benchmark/.test(lower)
  const hasConclusion = /conclusion|future work|limitation/.test(lower)

  const criteria = {
    novelty: clamp(2 + (submission.topics.length >= 2 ? 1 : 0) + (hasMethod ? 1 : 0), 1, 5),
    technicalQuality: clamp(2 + (hasMethod ? 1 : 0) + (hasResults ? 1 : 0), 1, 5),
    clarity: clamp(abstractWords >= 120 ? 4 : abstractWords >= 60 ? 3 : 2, 1, 5),
    completeness: clamp(2 + (hasResults ? 1 : 0) + (hasConclusion ? 1 : 0), 1, 5),
  }
  const avg = (criteria.novelty + criteria.technicalQuality + criteria.clarity + criteria.completeness) / 4
  const overallScore = clamp((avg / 5) * 10, 1, 10)

  const strengths: string[] = []
  if (abstractWords >= 60) strengths.push('The abstract is substantive enough to convey the problem and contribution.')
  if (hasMethod) strengths.push('A method or framework is described, which helps reviewers assess the approach.')
  if (hasResults) strengths.push('Experimental or evaluation content appears to be present.')
  if (submission.topics.length > 0) strengths.push(`The paper is positioned within defined topics: ${submission.topics.join(', ')}.`)
  if (strengths.length === 0) strengths.push('The submission includes a title and abstract for initial screening.')

  const weaknesses: string[] = []
  if (!hasFullText) weaknesses.push('Full PDF text was not available to this fallback heuristic, so technical depth could not be assessed. Connect the Meta model for a content-based review.')
  if (abstractWords < 60) weaknesses.push('The abstract is short; the contribution and results are hard to judge from it alone.')
  if (!hasResults) weaknesses.push('No clear results or evaluation signals were detected in the available text.')
  if (!hasConclusion) weaknesses.push('Conclusions or limitations were not detected in the available text.')

  return {
    overallScore,
    criteria,
    summary: `Heuristic fallback assessment of “${submission.title}” based on the abstract${hasFullText ? ' and extracted PDF text' : ' only'}. This is a structural screen, not a substitute for reading the paper. Configure the Meta model in Profile for a content-based AI review.`,
    strengths,
    weaknesses,
    questions: [
      'What is the single clearest contribution compared with prior work?',
      'How was the approach evaluated, and against which baselines?',
      'What are the main limitations of the work?',
    ],
    recommendation: overallScore >= 7 ? 'Weak Accept' : overallScore >= 5 ? 'Borderline' : 'Weak Reject',
    confidence: hasFullText ? 'medium' : 'low',
  }
}

export class FallbackAIProvider implements AIProvider {
  readonly source: AISource = 'fallback'
  readonly label = FALLBACK_LABEL

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'No Meta API key configured. Add your key in Profile to enable the real Meta model; the deterministic fallback remains active.' }
  }

  async generateConferenceDraft(input: string): Promise<AIResult<ConferenceDraft>> {
    return { data: ConferenceDraftSchema.parse(fallbackDraft(input)), source: this.source, label: this.label }
  }

  async generateWebsiteConfig(conference: Conference, organization: Organization | null, variant?: WebsiteThemeVariant, designPrompt?: string): Promise<AIResult<WebsiteConfig>> {
    return { data: buildWebsiteConfig(conference, organization, variant ?? 'modern-academic', designPrompt), source: this.source, label: this.label }
  }

  async generateCustomPage(): Promise<AIResult<WebsiteConfig>> {
    throw new Error('AI-designed pages require the Meta model. Add your Meta API key in Profile (or set MODEL_API_KEY on the server), or choose the structured template mode instead. No template was substituted.')
  }

  async proposeCustomPageEdit(): Promise<AIResult<WebsiteConfig>> {
    throw new Error('Editing an AI-designed page requires the Meta model. Add your Meta API key in Profile (or set MODEL_API_KEY on the server).')
  }

  async proposeWebsiteEdit(config: WebsiteConfig, instruction: string): Promise<AIResult<WebsiteConfig>> {
    const { config: next, summary } = fallbackEdit(config, instruction)
    return { data: WebsiteConfigSchema.parse(next), source: this.source, label: this.label, summary }
  }

  async reviewPaper(submission: Pick<Submission, 'title' | 'abstract' | 'authors' | 'topics' | 'extractedText'>): Promise<AIResult<PaperReview>> {
    return { data: PaperReviewSchema.parse(fallbackReview(submission)), source: this.source, label: this.label }
  }
}

/* ---------------- Meta model API — Responses API (server-side only) ---------------- */

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Model did not return JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function extractResponseText(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const p = payload as { output_text?: unknown; output?: unknown; response?: unknown; choices?: unknown }
  if (typeof p.output_text === 'string' && p.output_text.trim()) return p.output_text
  // Some gateways wrap the response object one level deep.
  if (p.response && typeof p.response === 'object') {
    const inner = extractResponseText(p.response)
    if (inner) return inner
  }
  if (Array.isArray(p.output)) {
    const parts: string[] = []
    for (const item of p.output as { content?: unknown; text?: unknown }[]) {
      if (typeof item?.text === 'string') parts.push(item.text)
      if (!Array.isArray(item?.content)) continue
      for (const c of item.content as { type?: unknown; text?: unknown }[]) {
        if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') parts.push(c.text)
      }
    }
    return parts.join('\n')
  }
  // Chat-completions style fallback, just in case an endpoint returns it.
  if (Array.isArray(p.choices)) {
    const first = (p.choices as { message?: { content?: unknown } }[])[0]
    if (typeof first?.message?.content === 'string') return first.message.content
  }
  return ''
}

function metaErrorDetail(payload: unknown, rawText: string): string {
  if (payload && typeof payload === 'object') {
    const err = (payload as { error?: { message?: unknown; code?: unknown; type?: unknown } }).error
    if (err) {
      const bits = [err.message, err.code, err.type].filter((x): x is string => typeof x === 'string' && Boolean(x))
      if (bits.length > 0) return bits.join(' · ')
    }
    const msg = (payload as { message?: unknown }).message
    if (typeof msg === 'string' && msg) return msg
  }
  return rawText.slice(0, 300)
}

const ALLOWED_SECTION_TYPES = new Set([
  'hero', 'about', 'research-topics', 'important-dates', 'submission-guidelines', 'keynote-speakers',
  'organizing-committee', 'venue', 'registration', 'faqs', 'contact', 'accepted-papers', 'conference-program', 'researchers', 'custom',
])
const ALLOWED_THEMES = new Set(['modern-academic', 'editorial-minimal', 'bold-research', 'contemporary-tech', 'elegant-institutional'])

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Keep only list items whose identifying text literally appears in the user's prompt (no invented people/papers). */
function filterNamedByPrompt(list: unknown, key: string, prompt: string): Record<string, unknown>[] {
  if (!Array.isArray(list)) return []
  const hay = prompt.toLowerCase()
  return list
    .map((x) => asRecord(x))
    .filter((item) => {
      const name = item[key]
      return typeof name === 'string' && name.trim().length > 1 && hay.includes(name.trim().toLowerCase())
    })
}

/**
 * Normalize a model-designed website: enforce ids/order, restore locked
 * factual fields from the conference record, strip invented people/papers,
 * and keep the model's design, composition, and copy.
 */
function normalizeAIWebsite(raw: Record<string, unknown>, conference: Conference, organization: Organization | null, skeleton: WebsiteConfig): WebsiteConfig {
  const prompt = skeleton.designPrompt ?? ''
  const skeletonByType = new Map(skeleton.sections.map((s) => [s.type, s]))
  const rawSections = Array.isArray(raw.sections) ? raw.sections : []
  const seen = new Set<string>()
  const sections: WebsiteSection[] = rawSections
    .map((entry, i) => {
      const s = asRecord(entry)
      const type = typeof s.type === 'string' ? s.type : ''
      if (!ALLOWED_SECTION_TYPES.has(type)) return null
      let sid = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `sec_ai_${i}`
      if (seen.has(sid)) sid = `sec_ai_${i}`
      seen.add(sid)
      return {
        id: sid,
        type: type as WebsiteConfig['sections'][number]['type'],
        enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
        order: i,
        variant: typeof s.variant === 'string' ? s.variant.slice(0, 40) : undefined,
        content: asRecord(s.content),
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, 14)

  if (!sections.some((s) => s.type === 'hero')) {
    const hero = skeletonByType.get('hero')
    if (hero) sections.unshift({ ...hero, order: 0 })
  }

  for (const section of sections) {
    const fact = skeletonByType.get(section.type)
    // Photos are sourced by the app (stock search / upload), never by the model.
    if ('image' in section.content) delete section.content.image
    switch (section.type) {
      case 'hero':
        section.content = {
          ...section.content,
          title: conference.title,
          eyebrow: organization?.name ?? (typeof section.content.eyebrow === 'string' ? section.content.eyebrow : ''),
          dateLine: fact?.content.dateLine ?? '',
          location: fact?.content.location ?? '',
        }
        break
      case 'research-topics':
        section.content = { ...section.content, topics: conference.researchTopics }
        if (conference.researchTopics.length === 0) section.enabled = false
        break
      case 'important-dates':
        section.content = { ...section.content, dates: fact?.content.dates ?? [] }
        break
      case 'venue':
        section.content = { ...section.content, body: fact?.content.body ?? section.content.body, city: conference.city ?? '', country: conference.country ?? '' }
        break
      case 'contact':
        section.content = { ...section.content, email: conference.contactEmail || organization?.contactEmail || '' }
        break
      case 'submission-guidelines':
        section.content = { ...section.content, deadline: fact?.content.deadline ?? '' }
        break
      case 'keynote-speakers':
        section.content = { ...section.content, speakers: filterNamedByPrompt(section.content.speakers, 'name', prompt) }
        break
      case 'organizing-committee':
        section.content = { ...section.content, members: filterNamedByPrompt(section.content.members, 'name', prompt) }
        break
      case 'accepted-papers':
        section.content = { ...section.content, papers: filterNamedByPrompt(section.content.papers, 'title', prompt) }
        break
      case 'conference-program':
        section.content = { ...section.content, items: filterNamedByPrompt(section.content.items, 'title', prompt) }
        break
      case 'researchers':
        section.content = { ...section.content, researchers: filterNamedByPrompt(section.content.researchers, 'name', prompt) }
        break
      default:
        break
    }
  }

  sections.sort((a, b) => a.order - b.order).forEach((s, i) => { s.order = i })

  const theme = typeof raw.themeVariant === 'string' && ALLOWED_THEMES.has(raw.themeVariant)
    ? (raw.themeVariant as WebsiteConfig['themeVariant'])
    : skeleton.themeVariant

  return {
    id: skeleton.id,
    conferenceId: conference.id,
    themeVariant: theme,
    design: (() => { const p = WebsiteDesignSchema.safeParse(raw.design); return p.success ? p.data : skeleton.design })(),
    designSeed: skeleton.designSeed,
    designPrompt: skeleton.designPrompt,
    sections,
    metadata: { title: conference.title, description: conference.shortDescription || conference.title },
    createdAt: skeleton.createdAt,
    updatedAt: new Date().toISOString(),
    published: false,
  }
}

function conferenceFactsBlock(conference: Conference, organization: Organization | null): string {
  const lines = [
    `Conference title: ${conference.title}`,
    `Organizer: ${organization?.name ?? 'Not specified'}`,
    conference.shortDescription ? `Tagline/description: ${conference.shortDescription}` : '',
    conference.fullDescription ? `About: ${conference.fullDescription.slice(0, 1200)}` : '',
    conference.startDate ? `Conference dates: ${conference.startDate}${conference.endDate ? ` to ${conference.endDate}` : ''}` : 'Conference dates: To be announced',
    conference.submissionDeadline ? `Submission deadline: ${conference.submissionDeadline}` : 'Submission deadline: To be announced',
    conference.cameraReadyDeadline ? `Camera-ready deadline: ${conference.cameraReadyDeadline}` : '',
    `Location/format: ${[conference.venueOrFormat, conference.city, conference.country].filter(Boolean).join(', ') || 'To be announced'}`,
    conference.researchTopics.length ? `Research topics: ${conference.researchTopics.join('; ')}` : 'Research topics: General call for papers',
    conference.submissionGuidelines ? `Submission guidelines: ${conference.submissionGuidelines.slice(0, 600)}` : '',
    `Contact email: ${conference.contactEmail || organization?.contactEmail || 'Not provided'}`,
    `Submit-a-paper URL (every call-to-action must link here): /events/${conference.slug}/submit`,
    `Conference home URL: /events/${conference.slug}`,
  ]
  return lines.filter(Boolean).join('\n')
}

const AI_PAGE_SYSTEM = [
  'You are an award-winning web designer creating a UNIQUE, fully FUNCTIONAL conference landing page as a single complete HTML document. Return ONLY JSON: {"title": string, "summary": string[3-6 short design decisions], "html": string}.',
  'FUNCTIONALITY MANDATORY: No <script>, no JavaScript. Every CTA button/link must be a real working <a> tag. Submit CTA MUST link to the exact submit URL from verified facts with target="_top". Register/Attend CTA MUST link to the attend URL (/submit -> /attend) with target="_top". NEVER use href="#", "about:blank", or "javascript:". Location/Map buttons must link to Google Maps with venue/city/country from facts or have a real working map link.',
  'NO AI SLOP: Avoid em dashes, generic phrases like "unlock your potential", "seamless experience", "revolutionize". Avoid excessive gradients/glassmorphism/floating cards. Use intentional typography, tight spacing, clear hierarchy. Make each design unique to the conference field - vary layout, don\'t default to centered purple hero.',
  'REQUIRED ELEMENTS: hero with exact title + working Submit CTA; about; research topics; Important Dates with a countdown element (use data-countdown="submission" or class="countdown" with elements for days/hours/minutes/seconds); venue/location with working map link; submission guidance with Submit CTA again; registration/attend section with working Attend CTA; contact (only provided email); footer. Use semantic landmarks (header/nav/main/section/footer).',
  'NAVIGATION: header/nav links to #anchors must match section ids. Use ids like about, topics, dates, program, venue, speakers, registration, contact. Every in-page nav link must resolve to an existing section.',
  'STYLING: All CSS in single <style> in <head>. No external stylesheets/scripts/fonts/images. Use CSS custom properties, responsive @media, accessible contrast, visible focus styles. Visuals from CSS/inline SVG only. Distinct art direction per conference.',
  'FACT LOCK: Only use verified facts. Never invent speakers/committee/sponsors/fees/stats/dates/venues/papers. If unknown use honest placeholders like "To be announced".',
].join('\n')

/**
 * A long prompt that itself specifies palette/typography/composition IS the
 * art direction. Assigning (and palette-enforcing) a seed on top of it made
 * the model ignore the organiser's brief (e.g. an off-white/burgundy serif
 * editorial prompt came back as a dark lab page), which is exactly why
 * different events ended up looking the same.
 */
function hasDetailedArtDirection(prompt: string): boolean {
  return prompt.length >= 300 && promptHasExplicitStyle(prompt)
}

function parseAiPage(raw: unknown): { title: string; summary: string[]; html: string } {
  const r = asRecord(raw)
  const html = typeof r.html === 'string' ? r.html : ''
  if (!html) throw new Error('Meta model returned no HTML for the page. Try again, or shorten the design prompt.')
  const summary = Array.isArray(r.summary) ? r.summary.map((s) => String(s).slice(0, 300)).slice(0, 6) : []
  return { title: typeof r.title === 'string' ? r.title.slice(0, 200) : '', summary, html }
}

export class MetaAIProvider implements AIProvider {
  readonly source: AISource = 'meta'
  readonly label = META_LABEL
  readonly model: string
  private endpoint: string
  private apiKey: string
  private fallback = new FallbackAIProvider()

  constructor(config?: AIConfig) {
    const resolved = resolveAIConfig(config)
    this.apiKey = resolved.apiKey
    this.model = resolved.model
    this.endpoint = resolved.endpoint
  }

  private async responsesText(system: string, user: string, timeoutMs = 60000): Promise<string> {
    if (!this.apiKey) throw new Error('Meta model not configured')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // Match the documented Meta Responses API call exactly: a single
      // user input item. Instructions are folded into that item instead of
      // a separate system item, which this endpoint does not accept.
      const prompt = system ? `${system}\n\n${user}` : user
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        }),
      })
      const rawText = await res.text().catch(() => '')
      let payload: unknown = null
      try {
        payload = rawText ? JSON.parse(rawText) : null
      } catch {
        payload = null
      }
      if (!res.ok) {
        const detail = metaErrorDetail(payload, rawText)
        throw new Error(`Meta model request failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`)
      }
      if (payload === null) {
        throw new Error('Meta model returned a non-JSON response. Check the endpoint URL in Profile.')
      }
      const text = extractResponseText(payload)
      if (!text) throw new Error('Meta model returned an empty response (no output text). Check the model name in Profile.')
      return text
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Meta model request timed out after ${Math.round(timeoutMs / 1000)} seconds. Full-page designs can take a few minutes — try again, or shorten the design prompt / ask for a more concise page.`)
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }

  /** Ask for JSON, retry once with a stricter instruction on parse errors only (never retry timeouts/HTTP errors). */
  private async responsesJson(system: string, user: string, timeoutMs = 60000): Promise<unknown> {
    try {
      return extractJson(await this.responsesText(system, user, timeoutMs))
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('timed out') || message.includes('request failed') || message.includes('not configured')) throw err
      return extractJson(await this.responsesText(system, `${user}\n\nIMPORTANT: Return ONLY valid JSON. No prose, no markdown fences.`, timeoutMs))
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const raw = await this.responsesJson('You are a connectivity check. Return ONLY JSON.', 'Return exactly {"ok": true}.')
      const ok = typeof raw === 'object' && raw !== null && (raw as { ok?: unknown }).ok === true
      return ok
        ? { ok: true, message: `Connected to the Meta model API (model: ${this.model}).` }
        : { ok: false, message: 'The Meta endpoint responded but did not return the expected JSON. Check the model name and endpoint in Profile.' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Meta connection test failed.' }
    }
  }

  async generateConferenceDraft(input: string): Promise<AIResult<ConferenceDraft>> {
    try {
      const raw = await this.responsesJson(
        'You extract structured conference data. Return ONLY JSON matching the requested fields. Never invent dates, emails, speakers, or facts that are not in the input; use empty strings/arrays when unknown.',
        `Fields: title, shortDescription, fullDescription, researchTopics (string[]), startDate, endDate, submissionDeadline (YYYY-MM-DD or ""), venueOrFormat, language, websiteContactEmail, suggestedSections (string[]).\n\nInput:\n${input}`,
      )
      return { data: ConferenceDraftSchema.parse(raw), source: this.source, label: this.label, model: this.model }
    } catch {
      const fb = await this.fallback.generateConferenceDraft(input)
      return { ...fb, label: `${FALLBACK_LABEL} — Meta request failed, fallback used` }
    }
  }

  async generateWebsiteConfig(conference: Conference, organization: Organization | null, variant?: WebsiteThemeVariant, designPrompt?: string): Promise<AIResult<WebsiteConfig>> {
    const prompt = designPrompt?.trim() ?? ''
    const skeleton = buildWebsiteConfig(conference, organization, variant ?? 'modern-academic', prompt)
    try {
      const raw = (await this.responsesJson(
        [
          'You are a senior web designer for academic conferences. Design a landing page from the user\'s design prompt — do not just fill a template.',
          'Return ONLY a WebsiteConfig JSON object. Never return code, HTML, or markdown.',
          'You choose: themeVariant, design (layout, palette, typography, density, heroStyle), which sections exist and their order, each section\'s variant, and all marketing copy (hero subtitle, about text, section titles, FAQ answers, custom sections).',
          'Available section types: hero, about, research-topics, important-dates, submission-guidelines, keynote-speakers, organizing-committee, venue, registration, faqs, contact, accepted-papers, conference-program, researchers (content: title, researchers[] {name, affiliation, focus}, placeholder), custom (content: title, body, bullets string[], ctaLabel).',
          'Understand the user\'s intent: infer the audience, tone, and what they want to emphasize even when the prompt is short. If they stress deadlines, feature important-dates early with a timeline; if they stress people, use speaker-forward/researchers; if they stress prestige, use magazine/elegant treatments. The site automatically gets a sticky navigation bar, live countdown (when dates exist), animated real submission counters, a map button for the venue, and a full footer — design around them, do not create duplicate nav/footer sections. Set design.features.countdown/stats to false only if the user asks to omit them.',
          'Layouts: classic, split-hero, centered, magazine, single-page, speaker-forward, schedule-forward. Palette values must be #RRGGBB hex. Typography: sans|serif|modern. Density: comfortable|compact. HeroStyle: solid|gradient|pattern|split.',
          'Section variants: hero banner|centered|split; about single|two-column; research-topics chips|cards|numbered; important-dates cards|timeline; keynote-speakers cards|list; researchers cards|list; custom callout|plain.',
          'FACT LOCK: use only the conference facts given. Never invent speakers, committee members, papers, fees, dates, venues, emails, or statistics. If the design prompt explicitly names a speaker/person/paper, you may include exactly that; otherwise leave those lists empty and disable the section (unless the prompt explicitly asks for the section, then enable it with placeholder copy).',
          'IMAGERY: in the hero content, include "imageQuery": a short 2-5 word stock-photo search phrase that captures the conference subject and mood (e.g. "artificial intelligence laboratory", "university library reading"). Do not include image URLs — photos are sourced separately. You may also add "imageQuery" to about/custom sections.',
          'Write original, audience-appropriate copy driven by the design prompt. Keep at most 14 sections. Every section needs: id (short string), type, enabled (boolean), order (0-based), variant, content (object).',
        ].join('\n'),
        `Design prompt from the user (this drives the design):\n${prompt || '(no explicit prompt)'}\n\n${hasDetailedArtDirection(prompt) ? 'The prompt above contains a complete art direction (palette, typography, composition). Follow THAT exactly; do not substitute a different palette or a generic template.' : `${formatDesignSeed(pickDesignSeed(conference, prompt))}\nFor this structured format, translate that direction into the design object: use its palette exactly, its layout archetype, and its typography; do not default to the modern-academic indigo palette.`}\n\nVerified conference facts (locked, do not alter dates, location, contact, topics):\n${JSON.stringify({ conference, organization }, null, 2)}\n\nPreferred starting theme (you may override it to fit the prompt): ${variant ?? 'modern-academic'}\n\nReturn the full WebsiteConfig JSON now.`,
        180000,
      )) as Record<string, unknown>
      const candidate = normalizeAIWebsite(raw, conference, organization, skeleton)
      // Models converge on the same indigo design even when briefed otherwise.
      // Unless the organiser dictated the style, enforce the assigned seed
      // visually while keeping the model's sections, order, and copy.
      if (!promptHasExplicitStyle(prompt) && candidate.design) {
        candidate.design = seededDesign(pickDesignSeed(conference, prompt), candidate.design)
      }
      return { data: WebsiteConfigSchema.parse(candidate), source: this.source, label: this.label, model: this.model }
    } catch {
      return { data: skeleton, source: 'fallback', label: `${FALLBACK_LABEL} — Meta request failed, fallback used` }
    }
  }

  async generateCustomPage(conference: Conference, organization: Organization | null, designPrompt?: string): Promise<AIResult<WebsiteConfig>> {
    const prompt = designPrompt?.trim() ?? ''
    const skeleton = buildWebsiteConfig(conference, organization, 'modern-academic', prompt)
    const facts = conferenceFactsBlock(conference, organization)
    const submitPath = `/events/${conference.slug}/submit`
    const detailed = hasDetailedArtDirection(prompt)
    const seed = detailed ? null : pickDesignSeed(conference, prompt)
    let feedback = ''
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.responsesJson(
        AI_PAGE_SYSTEM,
        `Design prompt from the organizer (this drives the art direction):\n${prompt || '(no explicit prompt) '}\n\n${seed ? formatDesignSeed(seed) : 'The design prompt above contains a complete art direction (palette, typography, composition, section treatment). Follow THAT art direction exactly and completely; do not substitute a generic dark/futuristic/neon template or any other palette.'}\n\nVerified conference facts (locked, render these exactly):\n${facts}${feedback ? `\n\nYour previous attempt was rejected: ${feedback}\nFix exactly that and return the corrected full JSON.` : ''}\n\nReturn the JSON now.`,
        240000,
      )
      const page = parseAiPage(raw)
      const { html, errors } = sanitizeAiHtml(page.html, { requiredText: conference.title, submitPath, palettePrimary: seed?.palette.primary })
      if (errors.length === 0) {
        const config: WebsiteConfig = {
          ...skeleton,
          generationMode: 'ai-page',
          customHtml: html,
          designSeed: seed?.id,
          aiSummary: (seed ? [`Art direction: ${seed.name}`, ...page.summary] : page.summary).slice(0, 6),
          designPrompt: prompt || undefined,
          metadata: { title: page.title || conference.title, description: conference.shortDescription || conference.title },
          updatedAt: new Date().toISOString(),
          published: false,
        }
        return { data: WebsiteConfigSchema.parse(config), source: this.source, label: this.label, model: this.model, summary: page.summary }
      }
      feedback = errors.join(' ')
      lastError = feedback
    }
    throw new Error(`Meta model page failed safety/fact validation after a retry: ${lastError} Try a clearer design prompt.`)
  }

  async proposeCustomPageEdit(config: WebsiteConfig, instruction: string, conference: Conference): Promise<AIResult<WebsiteConfig>> {
    if (!config.customHtml) throw new Error('This website has no AI-authored page to edit. Generate one first.')
    const submitPath = `/events/${conference.slug}/submit`
    const restyle = promptHasExplicitStyle(instruction)
    const seed = restyle && instruction.length < 300 ? pickDesignSeed(conference, instruction) : null
    const raw = await this.responsesJson(
      `${AI_PAGE_SYSTEM}\nYou are revising an existing page: apply the instruction faithfully, keep every verified fact and the submit URL, keep the page complete and self-contained, and return the full revised document.`,
      `Revision instruction: ${instruction}\n\n${seed ? `The instruction asks for a new look, follow this assigned art direction:\n${formatDesignSeed(seed)}\n` : restyle ? 'The instruction contains its own art direction. Follow THAT exactly; do not substitute a generic template or palette.\n' : 'Preserve the current page art direction, palette, and layout unless the instruction explicitly asks to change them.\n'}\nVerified conference facts (locked):\n${conferenceFactsBlock(conference, null)}\n\nCurrent page HTML:\n${config.customHtml.slice(0, 60000)}\n\nReturn the JSON now.`,
      240000,
    )
    const page = parseAiPage(raw)
    const { html, errors } = sanitizeAiHtml(page.html, { requiredText: conference.title, submitPath, palettePrimary: seed?.palette.primary })
    if (errors.length) throw new Error(`Proposed page failed safety/fact validation and was discarded: ${errors.join(' ')}`)
    const candidate: WebsiteConfig = {
      ...config,
      generationMode: 'ai-page',
      customHtml: html,
      aiSummary: page.summary.length ? page.summary : config.aiSummary,
      updatedAt: new Date().toISOString(),
    }
    return { data: WebsiteConfigSchema.parse(candidate), source: this.source, label: this.label, model: this.model, summary: page.summary.length ? page.summary : [`Applied: "${instruction}"`] }
  }

  async proposeWebsiteEdit(config: WebsiteConfig, instruction: string, conference: Conference): Promise<AIResult<WebsiteConfig>> {
    try {
      const raw = (await this.responsesJson(
        'You edit academic conference websites as structured JSON only. Return ONLY the full revised WebsiteConfig JSON. Keep the same id and conferenceId. Never invent speakers, papers, fees, or statistics. Never return code or HTML.',
        `Instruction: ${instruction}\n\nConference:\n${JSON.stringify(conference, null, 2)}\n\nCurrent config:\n${JSON.stringify(config, null, 2)}`,
        180000,
      )) as Record<string, unknown>
      const candidate = { ...raw, id: config.id, conferenceId: config.conferenceId, createdAt: config.createdAt, updatedAt: new Date().toISOString(), published: config.published, publishedAt: config.publishedAt }
      return { data: WebsiteConfigSchema.parse(candidate), source: this.source, label: this.label, model: this.model, summary: [`Applied: “${instruction}”`] }
    } catch {
      const fb = await this.fallback.proposeWebsiteEdit(config, instruction)
      return { ...fb, label: `${FALLBACK_LABEL} — Meta request failed, fallback used` }
    }
  }

  async reviewPaper(submission: Pick<Submission, 'title' | 'abstract' | 'authors' | 'topics' | 'extractedText'>, conference?: Conference | null): Promise<AIResult<PaperReview>> {
    try {
      const raw = await this.responsesJson(
        'You are an expert academic peer reviewer assisting a human reviewer. Assess ONLY the material provided; never invent experiments, results, datasets, or citations that are not in the text. If the full text is missing or truncated, say so through lower confidence and completeness. Return ONLY JSON with: overallScore (1-10), criteria {novelty, technicalQuality, clarity, completeness} (each 1-5), summary, strengths (string[]), weaknesses (string[]), questions (string[]), recommendation (one of Accept, Weak Accept, Borderline, Weak Reject, Reject), confidence (low|medium|high). Your review is advisory; a human makes the decision.',
        `Conference: ${conference ? `${conference.title} — topics: ${conference.researchTopics.join(', ')}` : 'Not specified'}\nPaper title: ${submission.title}\nAuthors: ${submission.authors.join(', ') || 'Not provided'}\nTopics: ${submission.topics.join(', ') || 'Not provided'}\n\nAbstract:\n${submission.abstract}\n\nExtracted full text (may be truncated):\n${submission.extractedText?.slice(0, 12000) || '(not available — review from the abstract and state this limitation)'}`,
      )
      return { data: PaperReviewSchema.parse(raw), source: this.source, label: this.label, model: this.model }
    } catch {
      const fb = await this.fallback.reviewPaper(submission)
      return { ...fb, label: `${FALLBACK_LABEL} — Meta request failed, fallback used` }
    }
  }
}

export function getAIProvider(config?: AIConfig): AIProvider {
  return resolveAIConfig(config).configured ? new MetaAIProvider(config) : new FallbackAIProvider()
}

export function getAIProviderFromHeaders(headers: Headers): AIProvider {
  return getAIProvider(aiConfigFromHeaders(headers))
}
