import { NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { getCurrentUser, errorJson } from '@/lib/server/auth'
import { serializeConference } from '@/lib/server/serialize'

type Row = Record<string, unknown>

type WebsiteImageLike = { url?: unknown }
type WebsiteSectionLike = { type?: unknown; content?: { image?: WebsiteImageLike } }
type WebsiteConfigLike = { customHtml?: unknown; sections?: unknown }

function getHeroImage(config: WebsiteConfigLike | null | undefined): string | undefined {
  if (!config || config.customHtml) return undefined
  if (!Array.isArray(config.sections)) return undefined
  const hero = (config.sections as WebsiteSectionLike[]).find((s) => s.type === 'hero')
  const url = hero?.content?.image?.url
  return typeof url === 'string' && url ? url : undefined
}

/**
 * Public events directory: only published, public events. Signed-in users
 * additionally see private events they participate in or were invited to.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    const rows = await query<Row>(
      `select c.*, o.name as org_name, o.slug as org_slug from conferences c join organizations o on o.id=c.organization_id order by c.start_date nulls last, c.created_at desc`,
    )
    const visible: Row[] = []
    for (const c of rows) {
      const isPublic = c.lifecycle !== 'draft' && c.lifecycle !== 'archived' && c.visibility === 'public'
      if (isPublic) { visible.push(c); continue }
      if (!user) continue
      const grant = await query(
        `select 1 as ok where
           exists (select 1 from organization_members m where m.organization_id=$1 and m.user_id=$2)
           or exists (select 1 from submissions s where s.conference_id=$3 and s.author_id=$2)
           or exists (select 1 from visitor_applications v where v.conference_id=$3 and v.visitor_id=$2)
           or exists (select 1 from reviewer_applications ra where ra.conference_id=$3 and ra.reviewer_id=$2)
           or exists (select 1 from reviewer_invitations ri where ri.conference_id=$3 and (ri.reviewer_id=$2 or lower(ri.email)=lower($4)))
           or exists (select 1 from event_invitations ei where ei.conference_id=$3 and (ei.user_id=$2 or lower(ei.email)=lower($4))) limit 1`,
        [String(c.organization_id), user.id, String(c.id), user.email],
      ).catch(() => [])
      if (grant.length || user.platform_role === 'platform_admin') visible.push(c)
    }
    
    // Fetch website configs for covers (published snapshot wins over draft)
    const websiteRows = await query<Row>('select conference_id, config, is_published from website_configs order by is_published asc')
    const websiteMap = new Map<string, WebsiteConfigLike>()
    for (const w of websiteRows) {
      websiteMap.set(String(w.conference_id), w.config as WebsiteConfigLike)
    }
    
    return NextResponse.json({
      events: visible.map((c) => {
        const conf = serializeConference(c)
        const websiteConfig = websiteMap.get(String(c.id))
        const heroImage = getHeroImage(websiteConfig)
        return {
          ...conf,
          organizationName: String(c.org_name), 
          organizationSlug: String(c.org_slug),
          heroImage,
          branding: {
            ...(conf.branding || {}),
            // The organizer's uploaded/generated cover wins; the website
            // hero image is the fallback cover.
            coverImageUrl: conf.branding?.coverImageUrl || heroImage
          }
        }
      }),
    })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
