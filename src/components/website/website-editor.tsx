'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Conference, Organization, WebsiteConfig, WebsiteSection, WebsiteSectionType, WebsiteThemeVariant } from '@/lib/demo/types'
import { generateId, getWebsiteConfig, publishWebsiteConfig, saveWebsiteConfig, unpublishWebsiteConfig, updateConference, useDemoData, useHydrated } from '@/lib/demo/storage'
import { getAIRequestHeaders } from '@/lib/demo/profile'
import { deleteImage, saveImage, useMediaUrl, validateImageFile } from '@/lib/demo/media'
import type { WebsiteImage } from '@/lib/demo/types'
import { THEMES } from '@/lib/website/themes'
import { getDesignForTheme } from '@/lib/website/generator'
import type { WebsiteDesign } from '@/lib/demo/types'
import { WebsiteRenderer } from './website-renderer'
import { Button } from '@/components/ui/button'

const SECTION_LABELS: Record<WebsiteSectionType, string> = {
  hero: 'Hero',
  about: 'About',
  'research-topics': 'Research Topics',
  'important-dates': 'Important Dates',
  'submission-guidelines': 'Submission Guidelines',
  'keynote-speakers': 'Keynote Speakers',
  'organizing-committee': 'Organizing Committee',
  venue: 'Venue',
  registration: 'Registration',
  faqs: 'FAQs',
  contact: 'Contact',
  'accepted-papers': 'Accepted Papers',
  'conference-program': 'Conference Program',
  researchers: 'Featured Researchers',
  custom: 'Custom Block',
}

const SECTION_VARIANTS: Partial<Record<WebsiteSectionType, string[]>> = {
  hero: ['banner', 'centered', 'split'],
  about: ['single', 'two-column'],
  'research-topics': ['chips', 'cards', 'numbered'],
  'important-dates': ['cards', 'timeline'],
  'keynote-speakers': ['cards', 'list'],
  researchers: ['cards', 'list'],
  custom: ['callout', 'plain'],
}

const PROMPT_EXAMPLES = [
  'Dark futuristic AI summit, neon purple and cyan, speaker-forward, bold modern typography',
  'Minimal editorial page for a humanities workshop, warm paper background, serif, lots of whitespace',
  'Vibrant one-page tech conference, schedule timeline first, topics as cards, compact',
  'Elegant institutional conference, deep green and gold, magazine layout, why-attend section',
]

const ALL_TYPES = Object.keys(SECTION_LABELS) as WebsiteSectionType[]

function defaultContent(type: WebsiteSectionType): Record<string, unknown> {
  switch (type) {
    case 'hero': return { eyebrow: '', title: 'Conference title', subtitle: '', dateLine: '', location: '', ctaLabel: 'Submit a paper', ctaNote: '' }
    case 'about': return { title: 'About the conference', body: '' }
    case 'research-topics': return { title: 'Research topics', topics: [] }
    case 'important-dates': return { title: 'Important dates', dates: [] }
    case 'submission-guidelines': return { title: 'Submission guidelines', body: '', deadline: '', ctaLabel: 'Submit a paper' }
    case 'keynote-speakers': return { title: 'Keynote speakers', speakers: [], placeholder: 'Speakers will be announced soon.' }
    case 'organizing-committee': return { title: 'Organizing committee', members: [], placeholder: 'Committee details will be published soon.' }
    case 'venue': return { title: 'Venue & format', body: '', city: '', country: '' }
    case 'registration': return { title: 'Registration', body: '', ctaLabel: 'Register' }
    case 'faqs': return { title: 'Frequently asked questions', faqs: [] }
    case 'contact': return { title: 'Contact', email: '', body: '' }
    case 'accepted-papers': return { title: 'Accepted papers', papers: [], placeholder: 'Accepted papers will be listed after review.' }
    case 'conference-program': return { title: 'Conference program', items: [], placeholder: 'The program will be published soon.' }
    case 'researchers': return { title: 'Featured researchers', researchers: [], placeholder: 'Researcher highlights will appear here.' }
    case 'custom': return { title: 'Highlights', body: '', bullets: [], ctaLabel: '' }
  }
}

function itemTemplate(key: string): Record<string, string> {
  switch (key) {
    case 'dates': return { label: '', date: '' }
    case 'speakers': return { name: '', affiliation: '', talkTitle: '' }
    case 'members': return { name: '', role: '', affiliation: '' }
    case 'faqs': return { question: '', answer: '' }
    case 'papers': return { title: '', authors: '' }
    case 'items': return { time: '', title: '', description: '' }
    case 'researchers': return { name: '', affiliation: '', focus: '' }
    default: return { value: '' }
  }
}

type Proposal = { config: WebsiteConfig; summary: string[]; label: string; source: string }

function parseSectionImage(content: Record<string, unknown>): WebsiteImage | null {
  const v = content.image
  if (typeof v !== 'object' || v === null) return null
  const img = v as Partial<WebsiteImage>
  if (img.source === 'stock' && img.url) return { source: 'stock', url: img.url, alt: img.alt ?? '', credit: img.credit }
  if (img.source === 'ai' && img.url) return { source: 'ai', url: img.url, alt: img.alt ?? '', credit: img.credit ?? 'AI-generated image' }
  if ((img.source === 'upload' || img.source === 'ai') && img.mediaId) return { source: img.source, mediaId: img.mediaId, alt: img.alt ?? '', credit: img.credit }
  return null
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bytes = atob(base64)
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += 8192) {
    const slice = bytes.slice(i, i + 8192)
    const arr = new Uint8Array(slice.length)
    for (let j = 0; j < slice.length; j += 1) arr[j] = slice.charCodeAt(j)
    chunks.push(arr)
  }
  return new Blob(chunks as BlobPart[], { type: mime || 'image/png' })
}

/** Ask the Meta API (via our route) to generate one image; stores it locally. Throws with Meta's real error. */
async function requestAIImage(prompt: string, alt: string): Promise<WebsiteImage> {
  const res = await fetch('/api/images/generate', {
    method: 'POST',
    headers: getAIRequestHeaders(),
    body: JSON.stringify({ prompt }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data.error as string) || `Image generation failed (HTTP ${res.status})`)
  const image = data.image as { base64?: string; url?: string; mime?: string }
  const model = (data.model as string) || 'Meta model'
  if (image?.base64) {
    const mediaId = generateId('img')
    await saveImage(mediaId, base64ToBlob(image.base64, image.mime ?? 'image/png'))
    return { source: 'ai', mediaId, alt, credit: `AI-generated with Meta (${model})` }
  }
  if (image?.url) {
    return { source: 'ai', url: image.url, alt, credit: `AI-generated with Meta (${model})` }
  }
  throw new Error('The model returned no image data.')
}

function SectionImageControls({ section, conference, onUpdate }: {
  section: WebsiteSection
  conference: Conference
  onUpdate: (image: WebsiteImage | null) => void
}) {
  const image = parseSectionImage(section.content)
  const mediaUrl = useMediaUrl(image?.mediaId)
  const previewSrc = image?.mediaId ? mediaUrl : image?.url
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [aiPrompt, setAiPrompt] = useState(
    typeof section.content.imageQuery === 'string' && section.content.imageQuery
      ? section.content.imageQuery
      : `${conference.researchTopics[0] ?? 'academic conference'} — wide website image, no text`,
  )

  async function generateAI() {
    setBusy(true)
    setNote(null)
    try {
      const img = await requestAIImage(
        `Create a high-quality wide 16:9 website image with NO text or words. Subject: ${aiPrompt}. Context: academic conference "${conference.title}" (${conference.researchTopics.join(', ')}). Professional, suitable as a website ${section.type === 'hero' ? 'hero background' : 'section'} image.`,
        conference.title,
      )
      onUpdate(img)
      setNote('AI image generated with Meta and stored in this browser.')
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'AI image generation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function findStock() {
    setBusy(true)
    setNote(null)
    try {
      const query = typeof section.content.imageQuery === 'string' && section.content.imageQuery
        ? section.content.imageQuery
        : `${conference.researchTopics[0] ?? 'university conference'} research`
      const res = await fetch('/api/images/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [query, `${conference.title} conference`, 'university campus research'] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.images) || data.images.length === 0) throw new Error('No photos found')
      const others = (data.images as WebsiteImage[]).filter((i) => i.url !== image?.url)
      onUpdate(others[0] ?? data.images[0])
      setNote(`Photo sourced via ${String(data.source ?? 'stock search')}. Check the credit before publishing.`)
    } catch {
      setNote('Photo search failed (network?). Try upload instead.')
    } finally {
      setBusy(false)
    }
  }

  async function onUpload(file: File | null) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) { setNote(invalid); return }
    setBusy(true)
    try {
      const mediaId = generateId('img')
      await saveImage(mediaId, file)
      onUpdate({ source: 'upload', mediaId, alt: conference.title })
      setNote('Image uploaded to this browser (IndexedDB). It will appear wherever this site is viewed in this browser.')
    } catch {
      setNote('Upload failed in this browser.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (image?.source === 'upload' && image.mediaId) await deleteImage(image.mediaId)
    onUpdate(null)
    setNote('Image removed.')
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-xs font-medium text-[#64748B]">Section image</p>
      {previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewSrc} alt={image?.alt || 'Section image'} className="h-28 w-full rounded-md object-cover" />
      ) : (
        <p className="text-xs text-[#64748B]">{image ? 'Uploaded image is stored in this browser.' : 'No image attached. The design uses color/gradient visuals until you add one.'}</p>
      )}
      {image?.credit ? <p className="text-[11px] text-[#64748B]">{image.credit}</p> : null}
      <div className="flex gap-1.5">
        <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Describe the AI image..." className="h-8 flex-1 rounded-md border px-2 text-xs" aria-label="AI image prompt" />
        <Button type="button" size="sm" disabled={busy || aiPrompt.trim().length < 4} onClick={generateAI} className="bg-[#4F46E5] hover:bg-[#4338CA]">{busy ? 'Working...' : 'Generate with AI'}</Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={findStock}>{image ? 'Replace with stock photo' : 'Find stock photo'}</Button>
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-medium hover:bg-slate-50">
          Upload
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
        </label>
        {image ? <Button type="button" size="sm" variant="ghost" onClick={remove}>Remove</Button> : null}
      </div>
      {note ? <p className="text-[11px] text-[#64748B]">{note}</p> : null}
    </div>
  )
}

export function WebsiteEditor({ conference, organization }: { conference: Conference; organization: Organization | null }) {
  const [config, setConfig] = useState<WebsiteConfig | null>(null)
{}
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [variant, setVariant] = useState<WebsiteThemeVariant>('modern-academic')
  const [genMode, setGenMode] = useState<'ai-page' | 'structured'>('ai-page')
  const [designPrompt, setDesignPrompt] = useState('')
  const [imageMode, setImageMode] = useState<'ai' | 'stock' | 'none'>('ai')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiLabel, setAiLabel] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [proposing, setProposing] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [previewProposal, setPreviewProposal] = useState(false)
  const [addType, setAddType] = useState<WebsiteSectionType>('faqs')
  const [seeded, setSeeded] = useState(false)

  const store = useDemoData()
  const hydrated = useHydrated()
  const publishedAt = store.publishedWebsiteConfigs.find((w) => w.conferenceId === conference.id)?.publishedAt ?? null

  // Seed the editable draft from localStorage once, after hydration.
  if (hydrated && !seeded) {
    const existing = getWebsiteConfig(conference.id)
    if (existing) {
      setConfig(existing)
      setVariant(existing.themeVariant)
      setGenMode(existing.generationMode === 'ai-page' ? 'ai-page' : 'structured')
      setDesignPrompt(existing.designPrompt ?? '')
      setSelectedId([...existing.sections].sort((a, b) => a.order - b.order)[0]?.id ?? null)
    }
    setSeeded(true)
  }

  const ordered = useMemo(
    () => (config ? [...config.sections].sort((a, b) => a.order - b.order) : []),
    [config],
  )
  const selected = ordered.find((s) => s.id === selectedId) ?? ordered[0] ?? null
  const missingTypes = ALL_TYPES.filter((t) => !ordered.some((s) => s.type === t))
  const displayConfig = previewProposal && proposal ? proposal.config : config
  const publicHref = `/events/${conference.slug}`

  function patchConfig(next: WebsiteConfig, note?: string) {
    setConfig(next)
    if (note) setMessage(note)
  }

  function effectiveDesign(cfg: WebsiteConfig): WebsiteDesign {
    return cfg.design ?? getDesignForTheme(cfg.themeVariant)
  }

  function patchDesign(patch: Partial<Omit<WebsiteDesign, 'palette'>> & { palette?: Partial<WebsiteDesign['palette']> }) {
    if (!config) return
    const current = effectiveDesign(config)
    patchConfig({
      ...config,
      design: {
        ...current,
        ...patch,
        palette: { ...current.palette, ...(patch.palette ?? {}) },
      },
    })
  }

  function updateSection(id: string, patch: Partial<WebsiteSection>) {
    if (!config) return
    patchConfig({ ...config, sections: config.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }

  function updateContent(key: string, value: unknown) {
    if (!config || !selected) return
    updateSection(selected.id, { content: { ...selected.content, [key]: value } })
  }

  function move(id: string, dir: -1 | 1) {
    if (!config) return
    const sorted = [...config.sections].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((s) => s.id === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= sorted.length) return
    ;[sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]]
    sorted.forEach((s, i) => { s.order = i })
    patchConfig({ ...config, sections: sorted })
  }

  function addSection() {
    if (!config || (addType !== 'custom' && config.sections.some((s) => s.type === addType))) return
    const section: WebsiteSection = {
      id: `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      type: addType,
      enabled: true,
      order: config.sections.length,
      content: defaultContent(addType),
    }
    patchConfig({ ...config, sections: [...config.sections, section] })
    setSelectedId(section.id)
  }

  /** Generate hero/about images with the Meta image model and store them locally. */
  async function attachAIImages(cfg: WebsiteConfig): Promise<{ config: WebsiteConfig; error: string | null }> {
    try {
      const heroImg = await requestAIImage(
        `Create a high-quality wide 16:9 website hero image with NO text or words. Conference: "${conference.title}". Topics: ${conference.researchTopics.join(', ') || 'academic research'}. Design direction: ${designPrompt || 'modern academic, professional'}. Photorealistic or refined illustration matching that mood.`,
        conference.title,
      )
      let sections = cfg.sections.map((s) => (s.type === 'hero' ? { ...s, content: { ...s.content, image: heroImg } } : s))
      const about = sections.find((s) => s.type === 'about')
      if (about) {
        try {
          const aboutImg = await requestAIImage(
            `Create a high-quality wide website image with NO text or words, editorial style: researchers collaborating at "${conference.title}" (${conference.researchTopics.slice(0, 3).join(', ')}), ${conference.city ?? ''} ${conference.country ?? ''}. Warm, professional.`,
            conference.title,
          )
          sections = sections.map((s) => (s.type === 'about' ? { ...s, content: { ...s.content, image: aboutImg } } : s))
        } catch {
          // Hero image succeeded; About is optional.
        }
      }
      return { config: { ...cfg, sections }, error: null }
    } catch (err) {
      return { config: cfg, error: err instanceof Error ? err.message : 'AI image generation failed.' }
    }
  }

  /** Source topical stock photos for hero/about from the AI's imageQuery (or conference topics). */
  async function attachImages(cfg: WebsiteConfig): Promise<{ config: WebsiteConfig; note: string | null }> {
    try {
      const hero = cfg.sections.find((s) => s.type === 'hero')
      const query = hero && typeof hero.content.imageQuery === 'string' && hero.content.imageQuery
        ? hero.content.imageQuery
        : `${conference.researchTopics[0] ?? 'university conference'} research`
      const res = await fetch('/api/images/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [query, `${conference.title} conference`, 'university campus research', 'academic conference audience'] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.images) || data.images.length === 0) return { config: cfg, note: null }
      const images = data.images as WebsiteImage[]
      const sections = cfg.sections.map((s) => {
        if (s.type === 'hero' && images[0]) return { ...s, content: { ...s.content, image: images[0] } }
        if (s.type === 'about' && images[1]) return { ...s, content: { ...s.content, image: images[1] } }
        return s
      })
      return { config: { ...cfg, sections }, note: `Photos attached via ${String(data.source ?? 'stock search')} — replace or remove them in each section's image controls.` }
    } catch {
      return { config: cfg, note: null }
    }
  }

  async function generate(chosen: WebsiteThemeVariant, promptOverride?: string) {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/website-generate', {
        method: 'POST',
        headers: getAIRequestHeaders(),
        body: JSON.stringify({ conference, organization, variant: chosen, mode: genMode, designPrompt: (promptOverride ?? designPrompt).slice(0, 10000) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      const generated = data.config as WebsiteConfig
      let withImages = generated
      let imageNote: string | null = null
      if (genMode === 'ai-page') {
        imageNote = 'Page authored entirely by the Meta model (layout, CSS, copy) and sanitized — no template was used. Visuals are CSS/SVG from the model.'
      } else if (imageMode === 'stock') {
        const stock = await attachImages(generated)
        withImages = stock.config
        imageNote = stock.note
      } else if (imageMode === 'ai') {
        const ai = await attachAIImages(generated)
        if (ai.error) {
          const stock = await attachImages(generated)
          withImages = stock.config
          imageNote = `AI image generation failed (${ai.error}) Stock photos were attached instead — or fix the image model in Profile and regenerate.`
        } else {
          withImages = ai.config
          imageNote = 'Hero/About images were AI-generated with Meta and stored in this browser.'
        }
      }
      setConfig(withImages)
      setVariant(withImages.themeVariant)
      setGenMode(withImages.generationMode === 'ai-page' ? 'ai-page' : 'structured')
      if (withImages.designPrompt) setDesignPrompt(withImages.designPrompt)
      setSelectedId([...withImages.sections].sort((a, b) => a.order - b.order)[0]?.id ?? null)
      setAiLabel(data.label as string)
      saveWebsiteConfig({ ...withImages, published: false })
      if (conference.status === 'Draft') updateConference(conference.id, { status: 'Website Generated' })
      setMessage(`Website draft generated and saved. Review it below, then publish when ready.${imageNote ? ` ${imageNote}` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  /**
   * Match people featured on the site (speakers / committee / featured
   * researchers) to registered Confexa accounts by name and embed their
   * uploaded profile picture, so the public page shows real photos instead
   * of generated placeholder avatars. Best-effort: failures keep initials.
   */
  async function enrichPeopleAvatars(cfg: WebsiteConfig): Promise<WebsiteConfig> {
    try {
      const res = await fetch('/api/users/directory', { cache: 'no-store' })
      if (!res.ok) return cfg
      const data = (await res.json().catch(() => ({}))) as { users?: { displayName: string; avatarUrl?: string }[] }
      const byName = new Map((data.users ?? []).filter((u) => u.avatarUrl).map((u) => [u.displayName.trim().toLowerCase(), u.avatarUrl as string]))
      if (byName.size === 0) return cfg
      const KEYS: Record<string, string> = { 'keynote-speakers': 'speakers', 'organizing-committee': 'members', researchers: 'researchers' }
      const sections = cfg.sections.map((s) => {
        const key = KEYS[s.type]
        if (!key || !Array.isArray(s.content[key])) return s
        const people = (s.content[key] as Record<string, unknown>[]).map((p) => {
          const name = typeof p.name === 'string' ? p.name.trim().toLowerCase() : ''
          const avatarUrl = name ? byName.get(name) : undefined
          return avatarUrl ? { ...p, avatarUrl } : p
        })
        return { ...s, content: { ...s.content, [key]: people } }
      })
      return { ...cfg, sections }
    } catch {
      return cfg
    }
  }

  async function saveDraft() {
    if (!config) return
    setSaving(true)
    const enriched = await enrichPeopleAvatars(config)
    setConfig(enriched)
    saveWebsiteConfig(enriched)
    if (conference.status === 'Draft') updateConference(conference.id, { status: 'Website Generated' })
    setSaving(false)
    setMessage(`Draft saved at ${new Date().toLocaleTimeString()}.`)
  }

  async function publish() {
    if (!config) return
    const enriched = await enrichPeopleAvatars(config)
    setConfig(enriched)
    saveWebsiteConfig(enriched)
    const snapshot = publishWebsiteConfig(conference.id)
    if (snapshot) {
      setConfig({ ...enriched, published: true, publishedAt: snapshot.publishedAt })
      setMessage('Published. The public site now shows this version.')
    }
  }

  function unpublish() {
    unpublishWebsiteConfig(conference.id)
    if (config) setConfig({ ...config, published: false, publishedAt: undefined })
    setMessage('Unpublished. The public site no longer shows this conference.')
  }

  async function proposeEdit() {
    if (!config || instruction.trim().length < 3) return
    setProposing(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/website-edit', {
        method: 'POST',
        headers: getAIRequestHeaders(),
        body: JSON.stringify({ config, conference, instruction }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Edit proposal failed')
      setProposal({ config: data.config as WebsiteConfig, summary: (data.summary as string[]) ?? [], label: data.label as string, source: data.source as string })
      setPreviewProposal(true)
      setAiLabel(data.label as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Edit proposal failed')
    } finally {
      setProposing(false)
    }
  }

  function acceptProposal() {
    if (!proposal) return
    setConfig(proposal.config)
    saveWebsiteConfig(proposal.config)
    setProposal(null)
    setPreviewProposal(false)
    setInstruction('')
    setMessage('Proposed changes accepted and saved as draft. Publish to make them public.')
  }

  if (!seeded) return <p className="text-sm text-[#64748B]">Loading editor...</p>

  if (!config) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border p-6">
          <h2 className="font-medium text-[#111827]">Generate your conference website</h2>
          <p className="mt-1 text-sm text-[#64748B]">Recommended: the Meta model authors the entire landing page for this conference — its own layout, CSS, art direction, and copy around your verified facts (dates, location, contact, topics stay locked). The result is sanitized (no JavaScript) and previewed in a sandbox. It will not look like other conferences&apos; pages.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Generation mode">
            {([
              { id: 'ai-page', label: 'AI-designed page (recommended)', desc: 'Meta model writes the whole page. Requires your Meta key in Profile.' },
              { id: 'structured', label: 'Structured template', desc: 'Fixed section builder with themes. Works without a model key (labeled fallback).' },
            ] as const).map((opt) => (
              <button key={opt.id} type="button" role="radio" aria-checked={genMode === opt.id} onClick={() => setGenMode(opt.id)} className={`rounded-xl border-2 p-4 text-left transition ${genMode === opt.id ? 'border-[#4F46E5] bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                <span className="block text-sm font-semibold text-[#111827]">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-[#64748B]">{opt.desc}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <label htmlFor="design-prompt" className="text-sm font-medium text-[#111827]">Describe the landing page</label>
            <textarea id="design-prompt" value={designPrompt} onChange={(e) => setDesignPrompt(e.target.value)} rows={6} maxLength={10000} placeholder="e.g. Dark futuristic AI summit, neon purple and cyan, speaker-forward, bold modern type, why-attend section... Describe audience, mood, layout, colors, sections, and anything to avoid — up to 10,000 characters." className="rounded-md border px-3 py-2 text-sm" />
            <p className="text-xs text-[#64748B]">{designPrompt.length.toLocaleString()} / 10,000 characters · Full-page AI design typically takes 1–4 minutes — keep this tab open.</p>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setDesignPrompt(ex)} className="rounded-full border px-2.5 py-1 text-xs text-[#475569] hover:border-indigo-300 hover:text-indigo-700">{ex.slice(0, 52)}...</button>
              ))}
            </div>
          </div>
          {genMode === 'structured' ? (<>
          <p className="mt-5 text-sm font-medium text-[#111827]">Starting theme <span className="font-normal text-[#64748B]">(the AI may override it to fit your prompt)</span></p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {THEMES.map((theme) => (
              <button key={theme.id} type="button" onClick={() => setVariant(theme.id)} className={`rounded-lg border p-4 text-left transition ${variant === theme.id ? 'border-[#4F46E5] ring-1 ring-[#4F46E5]' : 'hover:border-slate-300'}`}>
                <span className="font-medium text-[#111827]">{theme.name}</span>
                <span className="mt-1 block text-sm text-[#64748B]">{theme.description}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <span className="text-sm font-medium text-[#111827]">Images</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Image mode">
              {([
                { id: 'ai', label: 'AI-generated', desc: 'Meta creates hero/about images from your prompt' },
                { id: 'stock', label: 'Stock photos', desc: 'Topical photos from Wikimedia/Openverse' },
                { id: 'none', label: 'None', desc: 'Color/gradient visuals only' },
              ] as const).map((opt) => (
                <button key={opt.id} type="button" role="radio" aria-checked={imageMode === opt.id} onClick={() => setImageMode(opt.id)} className={`rounded-lg border px-3 py-2 text-left transition ${imageMode === opt.id ? 'border-[#4F46E5] ring-1 ring-[#4F46E5]' : 'hover:border-slate-300'}`}>
                  <span className="block text-sm font-medium text-[#111827]">{opt.label}</span>
                  <span className="block text-xs text-[#64748B]">{opt.desc}</span>
                </button>
              ))}
            </div>
            {imageMode === 'ai' ? <p className="text-xs text-[#64748B]">Requires your Meta key in Profile and an image-capable model. If generation fails, the exact error is shown and stock photos are used instead (labeled in the result message).</p> : null}
          </div>
          </>) : (
            <p className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">AI-designed mode: the model decides layout, palette, typography, and copy. No theme or stock-photo step — visuals are the model&apos;s CSS/SVG. Requires a Meta key in <Link href="/profile" className="underline underline-offset-4">Profile</Link>; without one you will get an explicit error, never a silent template.</p>
          )}
          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
          <Button className="mt-5 bg-[#4F46E5] hover:bg-[#4338CA]" disabled={generating} onClick={() => generate(variant)}>
            {generating ? 'Designing with AI — can take 1–4 min, keep tab open...' : genMode === 'ai-page' ? 'Design my page with AI' : 'Generate website with AI'}
          </Button>
          {aiLabel ? <p className="mt-2 text-xs text-[#64748B]">Source: {aiLabel}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {config.generationMode === 'ai-page' ? (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800">AI-designed page · authored by the Meta model</span>
        ) : (
          <select value={config.themeVariant} onChange={(e) => patchConfig({ ...config, themeVariant: e.target.value as WebsiteThemeVariant })} className="h-9 rounded-md border px-2 text-sm" aria-label="Design variant">
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <Button variant="outline" size="sm" disabled={generating} onClick={() => generate(config.themeVariant)}>{generating ? 'Regenerating...' : 'Regenerate'}</Button>
        <Button variant="outline" size="sm" disabled={saving} onClick={saveDraft}>{saving ? 'Saving...' : 'Save draft'}</Button>
        {publishedAt ? (
          <>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={publish}>Re-publish updates</Button>
            <Button variant="outline" size="sm" onClick={unpublish}>Unpublish</Button>
            <Button asChild variant="outline" size="sm"><Link href={publicHref} target="_blank">View public site</Link></Button>
          </>
        ) : (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={publish}>Publish website</Button>
        )}
      </div>

      {publishedAt ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Published at {new Date(publishedAt).toLocaleString()} — public site: <Link className="underline" href={publicHref} target="_blank">{publicHref}</Link>. Edits below stay in draft until you re-publish.</p> : null}
      {message ? <p className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {aiLabel ? <p className="text-xs text-[#64748B]">AI source: {aiLabel}. {config.generationMode === 'ai-page' ? 'This page was authored by the model as HTML/CSS, sanitized (JavaScript stripped), and is rendered in a sandboxed frame.' : 'Generated content is structured data, validated before use — never executable code.'}</p> : null}
      {config.generationMode === 'ai-page' && config.aiSummary?.length ? (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
          <p className="text-sm font-medium text-[#111827]">Model&apos;s design decisions</p>
          <ul className="mt-1 list-inside list-disc text-sm text-[#475569]">{config.aiSummary.map((s) => <li key={s}>{s}</li>)}</ul>
          <p className="mt-2 text-xs text-[#64748B]">To restyle it, change the design prompt and regenerate, or use natural-language edits below. Section-by-section editing is only available in structured template mode — switch modes in the prompt panel to rebuild as a template.</p>
        </div>
      ) : null}

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
        <label htmlFor="design-prompt-edit" className="text-sm font-medium text-[#111827]">Design prompt — rebuild the page from a description</label>
        <div className="mt-2 flex flex-col gap-2">
          <textarea id="design-prompt-edit" value={designPrompt} onChange={(e) => setDesignPrompt(e.target.value)} rows={5} maxLength={10000} placeholder="Describe layout, colors, mood, emphasis, sections — up to 10,000 characters..." className="w-full rounded-md border bg-white px-3 py-2 text-sm" />
          <p className="text-xs text-[#64748B]">{designPrompt.length.toLocaleString()} / 10,000 characters · Regenerating a full AI page typically takes 1–4 minutes.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={generating} onClick={() => generate(config.themeVariant)} className="bg-[#4F46E5] hover:bg-[#4338CA]">{generating ? 'Designing — can take 1–4 min...' : 'Regenerate design from prompt'}</Button>
            <select value={genMode} onChange={(e) => setGenMode(e.target.value as 'ai-page' | 'structured')} className="h-9 rounded-md border bg-white px-2 text-sm" aria-label="Generation mode">
              <option value="ai-page">Mode: AI-designed page</option>
              <option value="structured">Mode: Structured template</option>
            </select>
            {genMode === 'structured' ? (
              <select value={imageMode} onChange={(e) => setImageMode(e.target.value as 'ai' | 'stock' | 'none')} className="h-9 rounded-md border bg-white px-2 text-sm" aria-label="Image mode">
                <option value="ai">Images: AI-generated</option>
                <option value="stock">Images: Stock photos</option>
                <option value="none">Images: None</option>
              </select>
            ) : null}
            <span className="text-xs text-[#64748B]">{genMode === 'ai-page' ? 'The Meta model rewrites the whole page (layout, CSS, copy).' : 'Replaces layout, palette, composition, and copy.'} Conference facts stay locked. Save/publish afterwards.</span>
          </div>
          <p className="text-xs text-[#475569]">
            Saved site: <span className="font-medium">{config.generationMode === 'ai-page' ? 'AI-designed page' : 'Structured template'}</span>
            {config.designSeed ? <> · Art direction seed: <span className="font-medium">{config.designSeed}</span></> : null}
            {config.generationMode !== 'ai-page' ? <> · Regenerating will stay a structured template unless you switch the Mode above to <span className="font-medium">AI-designed page</span>.</> : null}
            {config.generationMode === 'ai-page' ? <> · Published pages keep their design until you regenerate <span className="font-medium">and re-publish</span>. A detailed prompt with its own palette/typography is followed as written; a short or empty prompt gets an assigned art direction.</> : null}
          </p>
        </div>
        {genMode === 'structured' ? (
        <div className="mt-4 grid gap-3 border-t border-indigo-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#64748B]">Layout</label>
            <select value={effectiveDesign(config).layout} onChange={(e) => patchDesign({ layout: e.target.value as WebsiteDesign['layout'] })} className="h-9 rounded-md border bg-white px-2 text-sm">
              <option value="classic">Classic</option><option value="split-hero">Split hero</option><option value="centered">Centered</option><option value="magazine">Magazine</option><option value="single-page">Single page</option><option value="speaker-forward">Speaker-forward</option><option value="schedule-forward">Schedule-forward</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#64748B]">Hero style</label>
            <select value={effectiveDesign(config).heroStyle} onChange={(e) => patchDesign({ heroStyle: e.target.value as WebsiteDesign['heroStyle'] })} className="h-9 rounded-md border bg-white px-2 text-sm">
              <option value="solid">Solid</option><option value="gradient">Gradient</option><option value="pattern">Pattern</option><option value="split">Split</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#64748B]">Typography</label>
            <select value={effectiveDesign(config).typography} onChange={(e) => patchDesign({ typography: e.target.value as WebsiteDesign['typography'] })} className="h-9 rounded-md border bg-white px-2 text-sm">
              <option value="sans">Sans</option><option value="serif">Serif</option><option value="modern">Modern</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#64748B]">Density</label>
            <select value={effectiveDesign(config).density} onChange={(e) => patchDesign({ density: e.target.value as WebsiteDesign['density'] })} className="h-9 rounded-md border bg-white px-2 text-sm">
              <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
            </select>
          </div>
          {(['primary', 'accent', 'background', 'surface', 'text'] as const).map((key) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-medium capitalize text-[#64748B]">{key} color</label>
              <div className="flex items-center gap-1">
                <input type="color" value={effectiveDesign(config).palette[key]} onChange={(e) => patchDesign({ palette: { [key]: e.target.value } as Partial<WebsiteDesign['palette']> })} className="h-9 w-10 cursor-pointer rounded-md border bg-white p-0.5" aria-label={`${key} color picker`} />
                <input value={effectiveDesign(config).palette[key]} onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) patchDesign({ palette: { [key]: e.target.value } as Partial<WebsiteDesign['palette']> }) }} className="h-9 w-full rounded-md border bg-white px-2 text-xs" aria-label={`${key} hex`} />
              </div>
            </div>
          ))}
        </div>
        ) : null}
      </div>

      <div className="rounded-lg border p-4">
        <label htmlFor="nl-edit" className="text-sm font-medium text-[#111827]">Modify with natural language</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="nl-edit" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder='e.g. "Make it bold and dark, add FAQs, hide registration"' className="h-10 flex-1 rounded-md border px-3 text-sm" />
          <Button disabled={proposing || instruction.trim().length < 3} onClick={proposeEdit}>{proposing ? 'Thinking...' : 'Propose changes'}</Button>
        </div>
        {proposal ? (
          <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-3">
            <p className="text-sm font-medium text-indigo-900">Proposed changes ({proposal.source})</p>
            <ul className="mt-1 list-inside list-disc text-sm text-indigo-800">
              {proposal.summary.map((s) => <li key={s}>{s}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={acceptProposal}>Accept & save draft</Button>
              <Button size="sm" variant="outline" onClick={() => { setProposal(null); setPreviewProposal(false) }}>Discard</Button>
              <Button size="sm" variant="ghost" onClick={() => setPreviewProposal((v) => !v)}>{previewProposal ? 'Previewing proposal' : 'Preview current draft'}</Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={config.generationMode === 'ai-page' ? 'grid gap-5' : 'grid gap-5 lg:grid-cols-[260px_1fr_300px]'}>
        <div className={config.generationMode === 'ai-page' ? 'hidden' : 'rounded-lg border'}>
          <div className="border-b p-3">
            <h3 className="text-sm font-medium">Sections</h3>
            {missingTypes.length > 0 ? (
              <div className="mt-2 flex gap-1">
                <select value={addType} onChange={(e) => setAddType(e.target.value as WebsiteSectionType)} className="h-8 flex-1 rounded-md border px-1 text-xs">
                  {missingTypes.map((t) => <option key={t} value={t}>{SECTION_LABELS[t]}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={addSection}>Add</Button>
              </div>
            ) : null}
          </div>
          <ul className="divide-y">
            {ordered.map((s) => (
              <li key={s.id} className={`flex items-center gap-1 p-2 ${selected?.id === s.id ? 'bg-indigo-50' : ''}`}>
                <button type="button" onClick={() => setSelectedId(s.id)} className="flex-1 text-left text-sm font-medium text-[#111827]">{SECTION_LABELS[s.type]}</button>
                <button type="button" title="Move up" onClick={() => move(s.id, -1)} className="rounded border px-1.5 text-xs">↑</button>
                <button type="button" title="Move down" onClick={() => move(s.id, 1)} className="rounded border px-1.5 text-xs">↓</button>
                <label className="flex items-center gap-1 text-xs text-[#64748B]">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => updateSection(s.id, { enabled: e.target.checked })} /> On
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t p-3">
            <label className="text-xs font-medium text-[#64748B]" htmlFor="meta-title">Site title (metadata)</label>
            <input id="meta-title" value={config.metadata?.title ?? ''} onChange={(e) => patchConfig({ ...config, metadata: { ...config.metadata, title: e.target.value } })} className="h-9 rounded-md border px-2 text-sm" />
            <label className="text-xs font-medium text-[#64748B]" htmlFor="meta-desc">Site description (metadata)</label>
            <textarea id="meta-desc" value={config.metadata?.description ?? ''} onChange={(e) => patchConfig({ ...config, metadata: { ...config.metadata, description: e.target.value } })} className="rounded-md border px-2 py-1.5 text-sm" rows={2} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="border-b bg-slate-50 px-3 py-2 text-xs font-medium text-[#64748B]">{previewProposal ? 'Preview: proposed changes' : 'Live preview (draft)'}</div>
          {displayConfig ? (
            <WebsiteRenderer
              config={displayConfig}
              conferenceSlug={conference.slug}
              organizationName={organization?.name}
              eventDates={{ startDate: conference.startDate, submissionDeadline: conference.submissionDeadline }}
              stats={(() => {
                const subs = store.submissions.filter((s) => s.conferenceId === conference.id)
                return [
                  { label: 'Papers submitted', value: subs.length },
                  { label: 'Papers accepted', value: subs.filter((s) => s.status === 'Accepted').length },
                  { label: 'Contributing authors', value: new Set(subs.flatMap((s) => s.authors)).size },
                  { label: 'Research topics', value: conference.researchTopics.length },
                ]
              })()}
            />
          ) : null}
        </div>

        <div className={config.generationMode === 'ai-page' ? 'hidden' : 'rounded-lg border p-4'}>
          <h3 className="text-sm font-medium">{selected ? `Edit: ${SECTION_LABELS[selected.type]}` : 'Select a section'}</h3>
          {selected && SECTION_VARIANTS[selected.type] ? (
            <div className="mt-3 flex flex-col gap-1">
              <label className="text-xs font-medium text-[#64748B]" htmlFor="section-variant">Visual variant</label>
              <select id="section-variant" value={selected.variant ?? SECTION_VARIANTS[selected.type]![0]} onChange={(e) => updateSection(selected.id, { variant: e.target.value })} className="h-9 rounded-md border px-2 text-sm">
                {SECTION_VARIANTS[selected.type]!.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          ) : null}
          {selected && (selected.type === 'hero' || selected.type === 'about' || selected.type === 'custom') ? (
            <div className="mt-3">
              <SectionImageControls
                section={selected}
                conference={conference}
                onUpdate={(image) => {
                  const nextContent = { ...selected.content }
                  if (image) nextContent.image = image as unknown as Record<string, unknown>
                  else delete nextContent.image
                  updateSection(selected.id, { content: nextContent })
                }}
              />
            </div>
          ) : null}
          {selected ? (
            <div className="mt-3 flex flex-col gap-3">
              {Object.entries(selected.content).map(([key, value]) => {
                if (typeof value === 'string') {
                  const long = ['body', 'subtitle', 'placeholder'].includes(key) || value.length > 90
                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium capitalize text-[#64748B]">{key}</label>
                      {long ? (
                        <textarea value={value} onChange={(e) => updateContent(key, e.target.value)} rows={4} className="rounded-md border px-2 py-1.5 text-sm" />
                      ) : (
                        <input value={value} onChange={(e) => updateContent(key, e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
                      )}
                    </div>
                  )
                }
                if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium capitalize text-[#64748B]">{key} (one per line)</label>
                      <textarea value={(value as string[]).join('\n')} onChange={(e) => updateContent(key, e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} rows={5} className="rounded-md border px-2 py-1.5 text-sm" />
                    </div>
                  )
                }
                if (Array.isArray(value)) {
                  const items = value as Record<string, string>[]
                  return (
                    <div key={key} className="flex flex-col gap-2">
                      <label className="text-xs font-medium capitalize text-[#64748B]">{key}</label>
                      {items.map((item, idx) => (
                        <div key={idx} className="flex flex-col gap-1 rounded-md border p-2">
                          {Object.entries(item).map(([field, fieldValue]) => (
                            <input key={field} value={fieldValue} placeholder={field} onChange={(e) => {
                              const next = items.map((it, i) => (i === idx ? { ...it, [field]: e.target.value } : it))
                              updateContent(key, next)
                            }} className="h-8 rounded-md border px-2 text-xs" />
                          ))}
                          <button type="button" className="text-left text-xs text-red-600" onClick={() => updateContent(key, items.filter((_, i) => i !== idx))}>Remove item</button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => updateContent(key, [...items, itemTemplate(key)])}>Add item</Button>
                    </div>
                  )
                }
                return null
              })}
              <button type="button" className="text-left text-sm text-red-600" onClick={() => patchConfig({ ...config, sections: config.sections.filter((s) => s.id !== selected.id) })}>Delete this section</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
