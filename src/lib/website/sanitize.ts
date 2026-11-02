/**
 * Sanitizer for AI-authored landing pages.
 * The Meta model writes a full HTML document (markup + inline CSS, no JS).
 * This strips anything executable, then the page is rendered inside a
 * sandboxed iframe (no allow-scripts / no allow-same-origin) with an
 * injected CSP as defense-in-depth.
 */

const MAX_HTML = 200_000
const MIN_HTML = 1200

const DANGEROUS_WITH_CONTENT = ['script', 'iframe', 'object', 'noscript', 'template', 'title']
const DANGEROUS_VOID = ['embed', 'link', 'base']

export type SanitizedPage = { html: string; errors: string[] }

function stripTagWithContent(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi')
  let out = html
  let prev: string
  do {
    prev = out
    out = out.replace(re, '')
  } while (out !== prev)
  // Unclosed dangerous tag: drop from the tag to the next '>'-terminated chunk end.
  return out.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '')
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Repair links inside the sandboxed iframe.
 * The model was (by a prompt bug) told to use the literal text SUBMIT_URL and
 * often omits target="_top" — inside a sandbox without same-origin, a plain
 * link loads the app *inside* the frame (no cookies/storage) and appears
 * broken. Every app/external link is forced to navigate the top page, and
 * placeholder/dead CTA hrefs are pointed at the real pages.
 */
const ANCHOR_SYNONYMS: Record<string, string[]> = {
  home: ['home', 'top', 'hero', 'welcome'],
  main: ['main', 'home', 'about'],
  about: ['about', 'overview', 'introduction', 'welcome'],
  topics: ['topics', 'themes', 'tracks', 'research', 'fields', 'areas'],
  researchtopics: ['topics', 'themes', 'tracks', 'research', 'fields'],
  dates: ['dates', 'deadlines', 'calendar', 'important dates', 'schedule'],
  importantdates: ['dates', 'deadlines', 'calendar', 'important dates'],
  deadlines: ['deadlines', 'dates', 'calendar'],
  program: ['program', 'programme', 'schedule', 'agenda', 'timeline'],
  programme: ['programme', 'program', 'schedule', 'agenda', 'timeline'],
  schedule: ['schedule', 'program', 'programme', 'agenda', 'timeline'],
  venue: ['venue', 'location', 'place', 'getting there'],
  location: ['location', 'venue', 'place'],
  speakers: ['speakers', 'keynotes', 'keynote speakers', 'talks'],
  committee: ['committee', 'organizers', 'organisers', 'team'],
  contact: ['contact', 'get in touch', 'email'],
  faq: ['faq', 'faqs', 'questions', 'frequently asked'],
  faqs: ['faqs', 'faq', 'questions', 'frequently asked'],
  papers: ['papers', 'accepted papers', 'proceedings'],
  submit: ['submit', 'submission', 'call for papers', 'cfp'],
  submission: ['submission', 'submit', 'call for papers', 'guidelines'],
  guidelines: ['guidelines', 'submission', 'submit', 'call for papers'],
  join: ['join', 'registration', 'register', 'attend'],
  workshops: ['workshops', 'activities', 'sessions'],
}

function normalizeAnchorText(s: string): string {
  return s.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Make in-page (#…) links actually resolve.
 * The model invents nav hrefs and section ids independently, so a header
 * link can point at an id that does not exist (dead button). For each dead
 * anchor we find the section whose heading/class matches and either remap
 * the link to that element's real id or tag the element with the linked id.
 * Anchors that still resolve to nothing are removed by repairLinks.
 */
function repairAiAnchors(html: string): string {
  let out = html
  const idOf = () => new Set([...out.matchAll(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map((m) => m[1] ?? m[2]))
  const anchors = [...new Set([...out.matchAll(/\bhref\s*=\s*(?:"#([^"]+)"|'#([^']+)')/gi)].map((m) => m[1] ?? m[2]).filter(Boolean))]
  for (const anchor of anchors) {
    if (idOf().has(anchor)) continue
    const key = anchor.toLowerCase().replace(/[^a-z]/g, '')
    const terms = ANCHOR_SYNONYMS[key] ?? [anchor.replace(/[-_]/g, ' ').toLowerCase()]
    const tagRe = /<(section|article|main|header|footer|div)\b[^>]*>/gi
    let match: RegExpExecArray | null
    let tagged = false
    while (!tagged && (match = tagRe.exec(out)) !== null) {
      const tag = match[0]
      const chunk = out.slice(match.index, match.index + 1400)
      const heading = chunk.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ?? ''
      const hay = normalizeAnchorText(`${tag} ${heading}`)
      if (!terms.some((t) => hay.includes(t))) continue
      const existingId = tag.match(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/i)
      if (existingId) {
        const realId = existingId[1] ?? existingId[2]
        out = out.replace(new RegExp(`href=(["'])#${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'gi'), `href=$1#${realId}$1`)
      } else {
        const withId = tag.replace(/>$/, ` id="${anchor}">`).replace(/\/>$/, ` id="${anchor}"/>`)
        out = out.slice(0, match.index) + withId + out.slice(match.index + tag.length)
      }
      tagged = true
    }
    if (!tagged && (key === 'home' || key === 'top' || key === 'main')) {
      const first = out.match(/<(header|main|section)\b[^>]*>/i)
      if (first && !/\bid\s*=/i.test(first[0])) {
        out = out.replace(first[0], first[0].replace(/>$/, ` id="${anchor}">`))
      }
    }
  }
  return out
}

export function repairLinks(html: string, submitPath?: string, overrides?: { submitHref?: string; attendHref?: string }): string {
  let out = html
  if (submitPath) {
    out = out.replace(/SUBMIT_URL|\{\{\s*submit[_ ]?url\s*\}\}|\[submit[_ ]?url\]/gi, submitPath)
  }
  out = repairAiAnchors(out)
  const knownIds = new Set([...out.matchAll(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map((m) => m[1] ?? m[2]))
  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (whole, attrs: string, inner: string) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
    let href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '').trim()
    const text = inner.replace(/<[^>]+>/g, ' ').toLowerCase()
    if (submitPath && (href === '' || href === '#')) {
      if (/submit|paper|manuscript/.test(text)) href = submitPath
      else if (/attend|register|join/.test(text)) href = submitPath.replace(/\/submit$/, '/attend')
    }
    // A pure registration/attendance CTA pointing at the paper form sends
    // visitors to the wrong page; send it to the attendance form instead.
    if (submitPath && href === submitPath && /attend|register/.test(text) && !/submit|paper/.test(text)) {
      href = submitPath.replace(/\/submit$/, '/attend')
    }
    // Account-aware targets supplied by the host page (e.g. a visitor is
    // sent to register as a Researcher before submitting). Only exact
    // submit/attend links are rewritten; in-page anchors are untouched.
    if (submitPath && overrides?.submitHref && href === submitPath) href = overrides.submitHref
    if (submitPath && overrides?.attendHref && href === submitPath.replace(/\/submit$/, '/attend')) href = overrides.attendHref
    if (!href) return whole
    if (/^(javascript|vbscript):/i.test(href)) href = '#'
    // Still-dead in-page anchor: not a working button. Keep the text as
    // plain text instead of a link that does nothing when clicked.
    if (href.startsWith('#') && href.length > 1 && !knownIds.has(href.slice(1))) {
      return `<span>${inner}</span>`
    }
    let rest = attrs
      .replace(/\bhref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
      .replace(/\btarget\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\brel\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    rest = rest.replace(/\s+/g, ' ').trim()
    const isInPageAnchor = href.startsWith('#') && href.length > 1
    const isExternal = /^https?:\/\//i.test(href)
    const target = isInPageAnchor ? '' : isExternal ? ' target="_blank" rel="noopener noreferrer"' : ' target="_top"'
    return `<a ${rest ? `${rest} ` : ''}href="${href.replace(/"/g, '%22')}"${target}>${inner}</a>`
  })
  return out
}

export function sanitizeAiHtml(input: string, opts?: { requiredText?: string; submitPath?: string; palettePrimary?: string }): SanitizedPage {
  const errors: string[] = []
  let html = typeof input === 'string' ? input.trim() : ''

  if (!html) return { html: '', errors: ['The model returned an empty page.'] }
  if (html.length > MAX_HTML) errors.push(`Page is too large (${html.length} chars, limit ${MAX_HTML}). Ask for a more concise design.`)
  if (html.length < MIN_HTML) errors.push('Page is too short to be a complete landing page. Ask the model to expand it.')

  // Remove anything executable or externally loading.
  for (const tag of DANGEROUS_WITH_CONTENT) html = stripTagWithContent(html, tag)
  for (const tag of DANGEROUS_VOID) html = html.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '')
  // Forms cannot submit anywhere meaningful inside the sandbox; unwrap them.
  html = html.replace(/<\/?form\b[^>]*>/gi, '')
  // Meta refresh / CSP overrides from the model are not allowed.
  html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*(refresh|content-security-policy)/gi, '<meta data-removed="true" data-x="')
  // Event handlers, srcdoc, and dangerous URLs.
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  html = html.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  html = html.replace(/((?:href|src|xlink:href|action|formaction)\s*=\s*["'])\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^"']*(["'])/gi, '$1#$2')
  html = html.replace(/((?:href|src)\s*=\s*)(?:javascript|vbscript):[^\s>]+/gi, '$1"#"')

  // CSS: no imports, no scriptable expressions.
  html = html.replace(/@import[^;]+;/gi, '')
  html = html.replace(/expression\s*\([^)]*\)/gi, 'none')
  html = html.replace(/url\(\s*["']?\s*(?:javascript|vbscript):[^)]*\)/gi, 'none')

  const residual = html.toLowerCase()
  if (residual.includes('<script') || residual.includes('javascript:')) {
    errors.push('Page still contains script content after sanitizing and was rejected.')
  }

  // Wrap fragments into a full document.
  if (!/<html\b/i.test(html)) {
    html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`
  }
  if (!/<style\b/i.test(html)) errors.push('Page has no <style> block — the design must be self-contained CSS in <head>.')

  html = repairLinks(html, opts?.submitPath)

  const text = stripTags(html)
  if (opts?.requiredText && !text.toLowerCase().includes(opts.requiredText.toLowerCase().slice(0, 60))) {
    errors.push(`Page does not mention the conference ("${opts.requiredText.slice(0, 60)}"). Facts may have been dropped.`)
  }
  if (opts?.submitPath && !html.includes(opts.submitPath)) {
    errors.push(`Page has no submission link (${opts.submitPath}). The call-to-action must point there.`)
  }
  if (/SUBMIT_URL|\{\{\s*submit/i.test(html)) {
    errors.push('Page still contains a SUBMIT_URL placeholder instead of the real submission link.')
  }
  if (opts?.palettePrimary && !html.toLowerCase().includes(opts.palettePrimary.toLowerCase())) {
    errors.push(`Page ignores its assigned palette (primary ${opts.palettePrimary} never appears). Use the assigned palette exactly.`)
  }

  // Inject our CSP right after <head ...> (or at document start).
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; media-src https:; base-uri 'none'; form-action 'none'">`
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (m) => `${m}${csp}`)
  else html = csp + html

  return { html, errors }
}

export function validateAiPage(input: string, opts?: { requiredText?: string; submitPath?: string; palettePrimary?: string }): SanitizedPage {
  return sanitizeAiHtml(input, opts)
}
