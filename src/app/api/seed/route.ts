import { NextResponse } from 'next/server'
import { query, newId, uniqueOrgSlug, uniqueConferenceSlug } from '@/lib/server/db'
import { requireUser, requireAccountType, errorJson } from '@/lib/server/auth'
import { buildWebsiteConfig } from '@/lib/website/generator'
import type { Conference, Organization } from '@/lib/demo/types'

/** Creates a real sample workspace owned by the signed-in user (DB rows, deletable). */
export async function POST() {
  try {
    const user = await requireUser()
    requireAccountType(user, ['organizer'], 'Only Organizer accounts can create a sample workspace.')
    const orgId = newId('org')
    const orgSlug = await uniqueOrgSlug('International Society for Intelligent Systems')
    const org: Organization = {
      id: orgId, name: 'International Society for Intelligent Systems', slug: orgSlug,
      description: 'A scholarly society supporting research in intelligent systems, trustworthy AI, and applied computing.',
      type: 'Academic society', contactEmail: 'contact@isis-example.org', createdAt: new Date().toISOString(),
    }
    await query('insert into organizations (id,name,slug,description,type,contact_email,created_by) values ($1,$2,$3,$4,$5,$6,$7)',
      [orgId, org.name, orgSlug, org.description, org.type, org.contactEmail, user.id])
    await query("insert into organization_members (organization_id,user_id,role) values ($1,$2,'owner')", [orgId, user.id])

    const confId = newId('conf')
    const confSlug = await uniqueConferenceSlug(orgId, 'Trustworthy AI Cybersecurity 2027')
    await query(
      `insert into conferences (id,organization_id,created_by,title,slug,short_description,full_description,research_topics,start_date,end_date,submission_deadline,venue_or_format,city,country,contact_email,language,submission_guidelines,lifecycle,review_method)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'2027-05-18','2027-05-20','2027-01-15','Hybrid','Algiers','Algeria','tac2027@isis-example.org','English',$9,'published','double_blind')`,
      [confId, orgId, user.id, 'International Conference on Trustworthy AI & Cybersecurity 2027', confSlug,
       'Research on trustworthy artificial intelligence, cybersecurity, and resilient intelligent systems.',
       'The International Conference on Trustworthy AI & Cybersecurity brings together researchers, practitioners, and policy specialists working on dependable artificial intelligence and secure digital systems.',
       JSON.stringify(['Trustworthy AI', 'Cybersecurity', 'Privacy-preserving machine learning', 'Adversarial robustness']),
       'Submit an anonymized PDF of up to 12 pages. All submissions undergo double-blind peer review.'],
    )
    const confRow = (await query('select * from conferences where id=$1', [confId]))[0]
    const { serializeConference } = await import('@/lib/server/serialize')
    const conf: Conference = serializeConference(confRow as Record<string, unknown>)
    const config = buildWebsiteConfig(conf, org, 'modern-academic')
    await query('insert into website_configs (conference_id,is_published,config) values ($1,false,$2)', [confId, JSON.stringify(config)])
    await query('insert into website_configs (conference_id,is_published,config,published_at) values ($1,true,$2,now())', [confId, JSON.stringify({ ...config, published: true, publishedAt: new Date().toISOString() })])
    return NextResponse.json({ ok: true, organizationSlug: orgSlug, conferenceSlug: confSlug })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
