import { NextResponse } from 'next/server'

type Candidate = { source: 'stock'; url: string; alt: string; credit?: string }

function picsumFallback(queries: string[]): Candidate[] {
  const seeds = (queries.length > 0 ? queries : ['conference']).slice(0, 3)
  return seeds.map((q, i) => {
    const seed = `confexa-${q.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${i}`
    return { source: 'stock' as const, url: `https://picsum.photos/seed/${seed}/1600/900`, alt: q }
  })
}

function stripHtml(v: unknown): string {
  return typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim() : ''
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { headers: { 'User-Agent': 'ConfexaDemo/1.0 (conference website builder)' }, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

type WikimediaPage = {
  title?: unknown
  imageinfo?: {
    thumburl?: unknown
    url?: unknown
    mime?: unknown
    extmetadata?: { Artist?: { value?: unknown }; LicenseShortName?: { value?: unknown } }
  }[]
}

/** Wikimedia Commons: no key needed, topical, license-attributed. */
async function fromWikimedia(query: string, seen: Set<string>, out: Candidate[]): Promise<void> {
  try {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=1600&format=json`
    const res = await fetchWithTimeout(api, 9000)
    if (!res.ok) return
    const json = (await res.json()) as { query?: { pages?: Record<string, WikimediaPage> } }
    const pages = Object.values(json.query?.pages ?? {})
    for (const page of pages) {
      if (out.length >= 6) break
      const info = page.imageinfo?.[0]
      if (!info) continue
      const mime = typeof info.mime === 'string' ? info.mime : ''
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) continue
      const url = typeof info.thumburl === 'string' ? info.thumburl : typeof info.url === 'string' ? info.url : ''
      if (!url.startsWith('https://') || seen.has(url)) continue
      seen.add(url)
      const rawTitle = typeof page.title === 'string' ? page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '') : query
      const artist = stripHtml(info.extmetadata?.Artist?.value)
      const license = stripHtml(info.extmetadata?.LicenseShortName?.value)
      out.push({
        source: 'stock',
        url,
        alt: rawTitle.slice(0, 160),
        credit: [artist ? `Photo: ${artist}` : '', license ? `(${license})` : '', 'via Wikimedia Commons'].filter(Boolean).join(' '),
      })
    }
  } catch {
    // Fall through to other sources.
  }
}

/** Openverse: no key needed; may be unreachable from some networks. */
async function fromOpenverse(query: string, seen: Set<string>, out: Candidate[]): Promise<void> {
  try {
    const res = await fetchWithTimeout(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=6&license_type=all&filter_dead=false`,
      7000,
    )
    if (!res.ok) return
    const json = (await res.json()) as { results?: { url?: unknown; title?: unknown; creator?: unknown; license?: unknown }[] }
    for (const r of json.results ?? []) {
      if (out.length >= 6) break
      const url = typeof r.url === 'string' ? r.url : ''
      if (!url.startsWith('https://') || seen.has(url)) continue
      seen.add(url)
      const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : query
      const creator = typeof r.creator === 'string' && r.creator.trim() ? r.creator.trim() : ''
      const license = typeof r.license === 'string' && r.license.trim() ? r.license.trim().toUpperCase() : ''
      out.push({
        source: 'stock',
        url,
        alt: title.slice(0, 160),
        credit: [creator ? `Photo: ${creator}` : '', license ? `(${license})` : '', 'via Openverse'].filter(Boolean).join(' '),
      })
    }
  } catch {
    // Fall through.
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { queries?: unknown }
    const queries = Array.isArray(body.queries)
      ? body.queries.filter((q): q is string => typeof q === 'string' && q.trim().length > 1).map((q) => q.trim().slice(0, 120)).slice(0, 4)
      : []
    if (queries.length === 0) {
      return NextResponse.json({ error: 'At least one search query is required.' }, { status: 400 })
    }

    const candidates: Candidate[] = []
    const seen = new Set<string>()
    let source = 'wikimedia'

    for (const query of queries) {
      if (candidates.length >= 4) break
      await fromWikimedia(query, seen, candidates)
    }
    if (candidates.length < 2) {
      source = candidates.length > 0 ? 'wikimedia+openverse' : 'openverse'
      for (const query of queries) {
        if (candidates.length >= 6) break
        await fromOpenverse(query, seen, candidates)
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ images: picsumFallback(queries), source: 'picsum-fallback' })
    }
    return NextResponse.json({ images: candidates, source })
  } catch {
    return NextResponse.json({ error: 'Image search failed' }, { status: 500 })
  }
}
