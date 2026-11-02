import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, newId, uniqueConferenceSlug, logActivity } from '@/lib/server/db'
import { requireUser, requireOrgManager, requireAccountType, errorJson } from '@/lib/server/auth'
import { serializeConference } from '@/lib/server/serialize'

const Schema = z.object({
  id: z.string().max(80).optional(),
  organizationId: z.string().min(1),
  title: z.string().trim().min(3).max(300),
  slug: z.string().trim().max(80).optional(),
  shortDescription: z.string().max(500).optional(),
  fullDescription: z.string().max(10000).optional(),
  researchTopics: z.array(z.string().max(120)).max(30).default([]),
  startDate: z.string().max(20).optional(), endDate: z.string().max(20).optional(),
  submissionDeadline: z.string().max(20).optional(), cameraReadyDeadline: z.string().max(20).optional(),
  venueOrFormat: z.string().max(200).optional(), city: z.string().max(120).optional(), country: z.string().max(120).optional(),
  contactEmail: z.string().max(200).optional(), language: z.string().max(80).optional(),
  submissionGuidelines: z.string().max(8000).optional(),
  category: z.string().max(120).optional(), conferenceType: z.string().max(120).optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  reviewMethod: z.enum(['single_blind', 'double_blind']).default('double_blind'),
  reviewCriteria: z.array(z.string().max(80)).max(10).default([]),
  submissionTypes: z.array(z.string().max(80)).max(10).default([]),
  branding: z.record(z.string(), z.string()).optional(),
  wizardStep: z.number().int().min(0).max(6).optional(),
  submissionsEnabled: z.boolean().default(true),
  registrationEnabled: z.boolean().default(true),
  registrationMode: z.enum(['auto', 'approval']).default('approval'),
  participationFeeCents: z.number().int().min(0).max(100000000).default(0),
  feeCurrency: z.string().trim().max(8).default('USD'),
  capacity: z.number().int().min(1).max(1000000).optional(),
  registrationDeadline: z.string().max(20).optional(),
  eligibilityCriteria: z.array(z.string().max(300)).max(20).default([]),
  eligibilityQuestions: z.array(z.string().max(300)).max(20).default([]),
  requiredDocuments: z.array(z.string().max(200)).max(10).default([]),
  reviewerMode: z.enum(['applications', 'invitations', 'both']).default('both'),
  reviewDeadline: z.string().max(20).optional(),
  maxFileSizeMb: z.number().int().min(1).max(50).default(10),
})

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    requireAccountType(user, ['organizer'], 'Only Organizer accounts can create events.')
    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid conference details.' }, { status: 400 })
    const d = parsed.data
    await requireOrgManager(user, d.organizationId)
    if (d.endDate && d.startDate && d.endDate < d.startDate) return NextResponse.json({ error: 'End date must be after the start date.' }, { status: 400 })
    const slug = d.slug || (await uniqueConferenceSlug(d.organizationId, d.title))
    const taken = await query('select id from conferences where organization_id=$1 and slug=$2', [d.organizationId, slug])
    if (taken.length) return NextResponse.json({ error: 'A conference with this slug already exists in the organization.' }, { status: 409 })
    const id = d.id || newId('conf')
    await query(
      `insert into conferences (id,organization_id,created_by,title,slug,short_description,full_description,research_topics,start_date,end_date,submission_deadline,camera_ready_deadline,venue_or_format,city,country,contact_email,language,submission_guidelines,category,conference_type,visibility,review_method,review_criteria,submission_types,branding,wizard_step,submissions_enabled,registration_enabled,registration_mode,participation_fee_cents,fee_currency,capacity,registration_deadline,eligibility_criteria,eligibility_questions,required_documents,reviewer_mode,review_deadline,max_file_size_mb)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)`,
      [id, d.organizationId, user.id, d.title, slug, d.shortDescription || null, d.fullDescription || null, JSON.stringify(d.researchTopics),
       d.startDate || null, d.endDate || null, d.submissionDeadline || null, d.cameraReadyDeadline || null, d.venueOrFormat || null,
       d.city || null, d.country || null, d.contactEmail || null, d.language || null, d.submissionGuidelines || null,
       d.category || null, d.conferenceType || null, d.visibility, d.reviewMethod, JSON.stringify(d.reviewCriteria), JSON.stringify(d.submissionTypes), JSON.stringify(d.branding || {}), d.wizardStep || 6,
       d.submissionsEnabled, d.registrationEnabled, d.registrationMode, d.participationFeeCents, d.feeCurrency.toUpperCase(), d.capacity || null, d.registrationDeadline || null,
       JSON.stringify(d.eligibilityCriteria), JSON.stringify(d.eligibilityQuestions), JSON.stringify(d.requiredDocuments), d.reviewerMode, d.reviewDeadline || null, d.maxFileSizeMb],
    )
    await logActivity(user.id, d.organizationId, id, 'conference_created', d.title)
    const row = (await query('select * from conferences where id=$1', [id]))[0]
    return NextResponse.json({ conference: serializeConference(row) }, { status: 201 })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
