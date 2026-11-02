'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { WebsiteConfig, WebsiteDesign, WebsiteImage, WebsiteSection } from '@/lib/demo/types'
import { getDesignForTheme } from '@/lib/website/generator'
import { getDesignSeedById, pickDesignSeed, promptHasExplicitStyle, seededDesign } from '@/lib/website/design-seed'
import { repairLinks } from '@/lib/website/sanitize'
import { useMediaUrl } from '@/lib/demo/media'

function sectionImage(content: Record<string, unknown>): WebsiteImage | null {
  const v = content.image
  if (typeof v !== 'object' || v === null) return null
  const img = v as Partial<WebsiteImage>
  if (img.source === 'stock' && typeof img.url === 'string' && img.url) return { source: 'stock', url: img.url, alt: typeof img.alt === 'string' ? img.alt : '', credit: typeof img.credit === 'string' ? img.credit : undefined }
  if (img.source === 'ai' && typeof img.url === 'string' && img.url) return { source: 'ai', url: img.url, alt: typeof img.alt === 'string' ? img.alt : '', credit: typeof img.credit === 'string' ? img.credit : 'AI-generated image' }
  if ((img.source === 'upload' || img.source === 'ai') && typeof img.mediaId === 'string' && img.mediaId) return { source: img.source, mediaId: img.mediaId, alt: typeof img.alt === 'string' ? img.alt : '', credit: typeof img.credit === 'string' ? img.credit : img.source === 'ai' ? 'AI-generated image' : undefined }
  return null
}

export type WebsiteStats = { label: string; value: number }[]
export type WebsiteEventDates = { startDate?: string; submissionDeadline?: string }

export function anchorId(section: WebsiteSection): string {
  return section.type === 'custom' || section.type === 'researchers' ? `section-${section.type}-${section.id}` : `section-${section.type}`
}

const NAV_LABELS: Partial<Record<WebsiteSection['type'], string>> = {
  hero: 'Home',
  about: 'About',
  'research-topics': 'Topics',
  'important-dates': 'Dates',
  'submission-guidelines': 'Submit',
  'keynote-speakers': 'Speakers',
  'organizing-committee': 'Committee',
  venue: 'Venue',
  registration: 'Registration',
  faqs: 'FAQs',
  contact: 'Contact',
  'accepted-papers': 'Papers',
  'conference-program': 'Program',
  researchers: 'Researchers',
  custom: 'Highlights',
}

/** Scroll-reveal wrapper: fades/slides content in when it enters the viewport. */
function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fallback = setTimeout(() => setVisible(true), 1200)
    if (typeof IntersectionObserver === 'undefined') {
      return () => clearTimeout(fallback)
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.08 },
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      clearTimeout(fallback)
    }
  }, [])
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(22px)',
        transition: 'opacity 0.7s ease, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {children}
    </div>
  )
}

/** Animated number counter that counts up when scrolled into view. */
function Counter({ value, color }: { value: number; color: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const run = () => {
      if (started.current) return
      started.current = true
      const duration = 1100
      const start = Date.now()
      const iv = setInterval(() => {
        const t = Math.min(1, (Date.now() - start) / duration)
        setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))))
        if (t >= 1) clearInterval(iv)
      }, 50)
    }
    if (typeof IntersectionObserver === 'undefined') {
      run()
      return
    }
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        run()
        obs.disconnect()
      }
    }, { threshold: 0.4 })
    obs.observe(el)
    // Guarantee the real value is shown even if the observer never fires.
    const fallback = setTimeout(run, 1800)
    return () => {
      obs.disconnect()
      clearTimeout(fallback)
    }
  }, [value])
  return (
    <span ref={ref} className="tabular-nums" style={{ color }}>
      {display.toLocaleString()}
    </span>
  )
}

/** Live countdown (ticks every second) to the deadline or conference start. */
function Countdown({ dates, accent, onAccent, labelColor }: { dates?: WebsiteEventDates; accent: string; onAccent: string; labelColor: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const deadline = dates?.submissionDeadline ? new Date(`${dates.submissionDeadline}T23:59:59`).getTime() : NaN
  const start = dates?.startDate ? new Date(`${dates.startDate}T09:00:00`).getTime() : NaN
  const target = !Number.isNaN(deadline) && deadline > now
    ? { at: deadline, label: 'Paper submissions close in' }
    : !Number.isNaN(start) && start > now
      ? { at: start, label: 'The conference starts in' }
      : null
  if (!target) return null

  const diff = Math.max(0, target.at - now)
  const parts = [
    { v: Math.floor(diff / 86400000), l: 'days' },
    { v: Math.floor(diff / 3600000) % 24, l: 'hrs' },
    { v: Math.floor(diff / 60000) % 60, l: 'min' },
    { v: Math.floor(diff / 1000) % 60, l: 'sec' },
  ]
  return (
    <div className="pt-1" aria-live="off">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: labelColor }}>{target.label}</p>
      <div className="mt-2 flex gap-2">
        {parts.map((p) => (
          <div key={p.l} className="min-w-16 rounded-lg px-3 py-2 text-center shadow" style={{ background: accent, color: onAccent }}>
            <span className="block text-xl font-bold tabular-nums leading-none">{String(p.v).padStart(2, '0')}</span>
            <span className="mt-1 block text-[10px] font-medium uppercase tracking-wider opacity-80">{p.l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionFigure({ content, ctx }: { content: Record<string, unknown>; ctx: Ctx }) {
  const image = sectionImage(content)
  const mediaUrl = useMediaUrl(image?.mediaId)
  const src = image?.mediaId ? mediaUrl : image?.url
  if (!image || !src) return null
  return (
    <figure className="mb-6">
      <div className="relative h-56 w-full overflow-hidden rounded-xl sm:h-72">
        <Image src={src} alt={image.alt || 'Conference image'} fill unoptimized className="object-cover" />
      </div>
      {image.credit ? <figcaption className="mt-1.5 text-xs" style={{ color: muted(ctx.design.palette.text) }}>{image.credit}</figcaption> : null}
    </figure>
  )
}

function str(content: Record<string, unknown>, key: string): string {
  const v = content[key]
  return typeof v === 'string' ? v : ''
}

function strList(content: Record<string, unknown>, key: string): string[] {
  const v = content[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function objList<T extends Record<string, string>>(content: Record<string, unknown>, key: string): T[] {
  const v = content[key]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is T => typeof x === 'object' && x !== null)
}

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length !== 6) return 0
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function onColor(hex: string, darkText: string): string {
  return luminance(hex) > 0.6 ? darkText : '#FFFFFF'
}

function muted(text: string): string {
  return `color-mix(in srgb, ${text} 68%, transparent)`
}

function faint(text: string): string {
  return `color-mix(in srgb, ${text} 16%, transparent)`
}

type Ctx = { design: WebsiteDesign; cta: { submit: string; attend: string } }

function PersonAvatar({ name, avatarUrl, size, pal }: { name: string; avatarUrl?: string; size: number; pal: WebsiteDesign['palette'] }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- profile pictures are user data URLs
      <img src={avatarUrl} alt={name} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    )
  }
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-bold" style={{ width: size, height: size, background: pal.primary, color: onColor(pal.primary, pal.text), fontSize: Math.round(size * 0.36) }}>
      {initials}
    </span>
  )
}

function SectionShell({ ctx, alt, title, id, children }: { ctx: Ctx; alt?: boolean; title?: string; id?: string; children: React.ReactNode }) {
  const pal = ctx.design.palette
  return (
    <section id={id} className="scroll-mt-24 px-4 sm:px-6" style={{ background: alt ? pal.surface : pal.background, paddingTop: ctx.design.density === 'compact' ? 40 : 64, paddingBottom: ctx.design.density === 'compact' ? 40 : 64 }}>
      <div className="mx-auto max-w-5xl">
        {title ? <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: pal.text }}>{title}</h2> : null}
        <div className={title ? 'mt-6' : ''}>{children}</div>
      </div>
    </section>
  )
}

function Card({ ctx, children, className = '' }: { ctx: Ctx; children: React.ReactNode; className?: string }) {
  const pal = ctx.design.palette
  return (
    <div className={`rounded-xl border p-5 ${className}`} style={{ background: pal.surface, borderColor: faint(pal.text), color: pal.text }}>
      {children}
    </div>
  )
}

/** Sections that render nothing when their list is empty must not be linked to. */
function isRenderable(section: WebsiteSection): boolean {
  const c = section.content
  switch (section.type) {
    case 'research-topics': return strList(c, 'topics').length > 0
    case 'important-dates': return objList<{ label: string; date: string }>(c, 'dates').some((d) => d.label || d.date)
    case 'faqs': return objList<{ question: string; answer: string }>(c, 'faqs').some((f) => f.question)
    default: return true
  }
}

function ctaHref(label: string, cta: Ctx['cta']): string {
  return /attend|register|join|visit/.test(label.toLowerCase()) ? cta.attend : cta.submit
}

function Hero({ section, ctx, eventDates, hasDates = false }: { section: WebsiteSection; ctx: Ctx; conferenceSlug: string; eventDates?: WebsiteEventDates; hasDates?: boolean }) {
  const c = section.content
  const pal = ctx.design.palette
  const { heroStyle, layout } = ctx.design
  const variant = section.variant ?? (layout === 'split-hero' ? 'split' : layout === 'centered' ? 'centered' : 'banner')
  const submitHref = ctx.cta.submit
  const image = sectionImage(c)
  const mediaUrl = useMediaUrl(image?.mediaId)
  const imageSrc = image?.mediaId ? mediaUrl : image?.url

  const heroBg: React.CSSProperties =
    heroStyle === 'gradient'
      ? { background: `linear-gradient(130deg, ${pal.primary} 0%, ${pal.accent} 130%)`, color: onColor(pal.primary, pal.text) }
      : heroStyle === 'pattern'
        ? { background: `repeating-linear-gradient(45deg, ${pal.primary} 0 26px, color-mix(in srgb, ${pal.primary} 82%, ${pal.accent}) 26px 52px)`, color: onColor(pal.primary, pal.text) }
        : { background: pal.primary, color: onColor(pal.primary, pal.text) }
  const heroMuted = `color-mix(in srgb, ${heroBg.color} 78%, transparent)`
  const centered = variant === 'centered' || layout === 'centered'

  const copy = (
    <div className={`flex flex-col gap-5 ${centered ? 'items-center text-center' : 'items-start'}`}>
      {str(c, 'eyebrow') ? <span className="rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: heroMuted, color: heroBg.color }}>{str(c, 'eyebrow')}</span> : null}
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">{str(c, 'title')}</h1>
      {str(c, 'subtitle') ? <p className="max-w-2xl text-lg" style={{ color: heroMuted }}>{str(c, 'subtitle')}</p> : null}
      <div className={`flex flex-wrap gap-x-6 gap-y-1 text-sm ${centered ? 'justify-center' : ''}`} style={{ color: heroMuted }}>
        {str(c, 'dateLine') ? <span>{str(c, 'dateLine')}</span> : null}
        {str(c, 'location') ? <span>{str(c, 'location')}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <a href={submitHref} className="inline-flex h-11 items-center rounded-md px-6 text-sm font-semibold shadow transition hover:scale-[1.03] hover:opacity-95" style={{ background: pal.accent, color: onColor(pal.accent, pal.text) }}>
          {str(c, 'ctaLabel') || 'Submit a paper'}
        </a>
        {hasDates ? (
          <a href="#section-important-dates" className="inline-flex h-11 items-center rounded-md border px-5 text-sm font-medium transition hover:opacity-80" style={{ borderColor: heroMuted, color: heroBg.color }}>
            Important dates
          </a>
        ) : null}
        {str(c, 'ctaNote') ? <span className="text-sm" style={{ color: heroMuted }}>{str(c, 'ctaNote')}</span> : null}
      </div>
      {ctx.design.features?.countdown !== false ? (
        <Countdown dates={eventDates} accent={pal.accent} onAccent={onColor(pal.accent, pal.text)} labelColor={heroMuted} />
      ) : null}
    </div>
  )

  const photoLayer = imageSrc ? (
    <>
      <Image src={imageSrc} alt={image?.alt || str(c, 'title')} fill unoptimized className="object-cover" priority />
      <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${pal.primary} 88%, transparent) 30%, color-mix(in srgb, ${pal.primary} 45%, transparent))` }} />
      {image?.credit ? <span className="absolute bottom-2 right-3 z-10 text-[11px] text-white/85">{image.credit}</span> : null}
    </>
  ) : null

  if (variant === 'split' || heroStyle === 'split' || layout === 'split-hero' || layout === 'speaker-forward' || layout === 'schedule-forward') {
    return (
      <section id="section-hero" className="relative scroll-mt-24 overflow-hidden px-4 py-16 sm:px-6 sm:py-20" style={heroBg}>
        {photoLayer}
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.5fr_1fr]">
          {copy}
          <div className="rounded-2xl border p-6 shadow-lg" style={{ background: pal.surface, borderColor: faint(pal.text), color: pal.text }}>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: pal.accent }}>Key facts</p>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              {str(c, 'dateLine') ? <div><dt style={{ color: muted(pal.text) }}>Dates</dt><dd className="font-medium">{str(c, 'dateLine')}</dd></div> : null}
              {str(c, 'location') ? <div><dt style={{ color: muted(pal.text) }}>Location</dt><dd className="font-medium">{str(c, 'location')}</dd></div> : null}
              {str(c, 'ctaNote') ? <div><dt style={{ color: muted(pal.text) }}>Submissions</dt><dd className="font-medium">{str(c, 'ctaNote')}</dd></div> : null}
            </dl>
            <a href={submitHref} className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold hover:opacity-90" style={{ background: pal.primary, color: onColor(pal.primary, pal.text) }}>
              {str(c, 'ctaLabel') || 'Submit a paper'}
            </a>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="section-hero" className="relative scroll-mt-24 overflow-hidden px-4 py-20 sm:px-6" style={heroBg}>
      {photoLayer}
      <div className={`relative z-10 mx-auto max-w-5xl ${centered ? 'flex flex-col items-center' : ''}`}>{copy}</div>
    </section>
  )
}

function RenderSection({ section, ctx, index, conferenceSlug, eventDates, hasDates = false }: { section: WebsiteSection; ctx: Ctx; index: number; conferenceSlug: string; eventDates?: WebsiteEventDates; hasDates?: boolean }) {
  const c = section.content
  const pal = ctx.design.palette
  const alt = index % 2 === 1
  const bodyStyle = { color: muted(pal.text) } as React.CSSProperties
  const variant = section.variant ?? ''

  switch (section.type) {
    case 'hero':
      return <Hero section={section} ctx={ctx} conferenceSlug={conferenceSlug} eventDates={eventDates} hasDates={hasDates} />
    case 'about':
      if (variant === 'two-column') {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)}>
            <SectionFigure content={c} ctx={ctx} />
            <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: pal.text }}>{str(c, 'title') || 'About'}</h2>
              <p className="whitespace-pre-wrap leading-relaxed" style={bodyStyle}>{str(c, 'body')}</p>
            </div>
          </SectionShell>
        )
      }
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'About'}>
          <SectionFigure content={c} ctx={ctx} />
          <p className="max-w-3xl whitespace-pre-wrap leading-relaxed" style={bodyStyle}>{str(c, 'body')}</p>
        </SectionShell>
      )
    case 'research-topics': {
      const topics = strList(c, 'topics')
      if (topics.length === 0) return null
      if (variant === 'cards') {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Research topics'}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topics.map((t) => (
                <Card key={t} ctx={ctx}><p className="font-medium">{t}</p></Card>
              ))}
            </div>
          </SectionShell>
        )
      }
      if (variant === 'numbered') {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Research topics'}>
            <ol className="grid gap-3 sm:grid-cols-2">
              {topics.map((t, i) => (
                <li key={t} className="flex items-baseline gap-3">
                  <span className="text-xl font-bold" style={{ color: pal.accent }}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-medium" style={{ color: pal.text }}>{t}</span>
                </li>
              ))}
            </ol>
          </SectionShell>
        )
      }
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Research topics'}>
          <ul className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <li key={t} className="rounded-full border px-3 py-1.5 text-sm" style={{ borderColor: faint(pal.text), background: pal.surface, color: pal.primary }}>{t}</li>
            ))}
          </ul>
        </SectionShell>
      )
    }
    case 'important-dates': {
      const dates = objList<{ label: string; date: string }>(c, 'dates').filter((d) => d.label || d.date)
      if (dates.length === 0) return null
      if (variant === 'timeline') {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Important dates'}>
            <ol className="relative flex flex-col gap-6 border-l-2 pl-6" style={{ borderColor: faint(pal.text) }}>
              {dates.map((d, i) => (
                <li key={`${d.label}-${i}`} className="relative">
                  <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full" style={{ background: pal.accent }} />
                  <p className="text-sm" style={bodyStyle}>{d.label}</p>
                  <p className="font-semibold" style={{ color: pal.text }}>{d.date}</p>
                </li>
              ))}
            </ol>
          </SectionShell>
        )
      }
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Important dates'}>
          <div className="grid gap-3 sm:grid-cols-3">
            {dates.map((d, i) => (
              <Card key={`${d.label}-${i}`} ctx={ctx}>
                <p className="text-sm" style={bodyStyle}>{d.label}</p>
                <p className="mt-1 font-semibold">{d.date}</p>
              </Card>
            ))}
          </div>
        </SectionShell>
      )
    }
    case 'submission-guidelines':
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Submission guidelines'}>
          <Card ctx={ctx} className="p-6">
            <p className="whitespace-pre-wrap leading-relaxed" style={bodyStyle}>{str(c, 'body')}</p>
            {str(c, 'deadline') ? <p className="mt-3 text-sm font-medium" style={{ color: pal.text }}>Deadline: {str(c, 'deadline')}</p> : null}
            <a href={ctx.cta.submit} className="mt-5 inline-flex h-10 items-center rounded-md px-5 text-sm font-semibold hover:opacity-90" style={{ background: pal.primary, color: onColor(pal.primary, pal.text) }}>
              {str(c, 'ctaLabel') || 'Submit a paper'}
            </a>
            <p className="mt-2 text-xs" style={bodyStyle}>Submissions are stored securely on the server and reviewed by assigned reviewers.</p>
          </Card>
        </SectionShell>
      )
    case 'keynote-speakers': {
      const speakers = objList<{ name: string; affiliation: string; talkTitle: string; avatarUrl?: string }>(c, 'speakers').filter((s) => s.name)
      if (speakers.length === 0) {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Keynote speakers'}>
            <p style={bodyStyle}>{str(c, 'placeholder') || 'Speakers will be announced soon.'}</p>
          </SectionShell>
        )
      }
      if (variant === 'list') {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Keynote speakers'}>
            <ul className="flex flex-col divide-y" style={{ borderColor: faint(pal.text) }}>
              {speakers.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                  <span className="font-semibold" style={{ color: pal.text }}>{s.name}</span>
                  <span className="text-sm" style={bodyStyle}>{[s.affiliation, s.talkTitle].filter(Boolean).join(' — ')}</span>
                </li>
              ))}
            </ul>
          </SectionShell>
        )
      }
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Keynote speakers'}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {speakers.map((s, i) => (
              <Card key={`${s.name}-${i}`} ctx={ctx}>
                <span className="flex items-center gap-3"><PersonAvatar name={s.name} avatarUrl={s.avatarUrl} size={44} pal={pal} /><p className="font-semibold">{s.name}</p></span>
                {s.affiliation ? <p className="text-sm" style={bodyStyle}>{s.affiliation}</p> : null}
                {s.talkTitle ? <p className="mt-2 text-sm italic" style={bodyStyle}>“{s.talkTitle}”</p> : null}
              </Card>
            ))}
          </div>
        </SectionShell>
      )
    }
    case 'organizing-committee': {
      const members = objList<{ name: string; role: string; affiliation: string; avatarUrl?: string }>(c, 'members').filter((m) => m.name)
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Organizing committee'}>
          {members.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m, i) => (
                <Card key={`${m.name}-${i}`} ctx={ctx}>
                  <span className="flex items-center gap-3"><PersonAvatar name={m.name} avatarUrl={m.avatarUrl} size={44} pal={pal} /><p className="font-semibold">{m.name}</p></span>
                  {m.role ? <p className="text-sm font-medium" style={{ color: pal.accent }}>{m.role}</p> : null}
                  {m.affiliation ? <p className="text-sm" style={bodyStyle}>{m.affiliation}</p> : null}
                </Card>
              ))}
            </div>
          ) : (
            <p style={bodyStyle}>{str(c, 'placeholder') || 'Committee details will be published soon.'}</p>
          )}
        </SectionShell>
      )
    }
    case 'venue': {
      const place = [str(c, 'body'), str(c, 'city'), str(c, 'country')].filter(Boolean).join(', ') || str(c, 'body')
      const mapsHref = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Venue'}>
          <p className="max-w-3xl whitespace-pre-wrap leading-relaxed" style={bodyStyle}>{str(c, 'body')}</p>
          {mapsHref ? (
            <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold transition hover:opacity-90" style={{ background: pal.primary, color: onColor(pal.primary, pal.text) }}>
              <span aria-hidden="true">📍</span> Open address in Google Maps
            </a>
          ) : null}
        </SectionShell>
      )
    }
    case 'conference-program': {
      const items = objList<{ time: string; title: string; description: string }>(c, 'items').filter((x) => x.title)
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Program'}>
          {items.length > 0 ? (
            <div className="flex flex-col gap-3">
              {items.map((item, i) => (
                <Card key={`${item.title}-${i}`} ctx={ctx} className="flex gap-4">
                  {item.time ? <span className="w-28 shrink-0 text-sm font-medium" style={{ color: pal.accent }}>{item.time}</span> : null}
                  <div>
                    <p className="font-medium">{item.title}</p>
                    {item.description ? <p className="text-sm" style={bodyStyle}>{item.description}</p> : null}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p style={bodyStyle}>{str(c, 'placeholder') || 'The program will be published soon.'}</p>
          )}
        </SectionShell>
      )
    }
    case 'accepted-papers': {
      const papers = objList<{ title: string; authors: string }>(c, 'papers').filter((p) => p.title)
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Accepted papers'}>
          {papers.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-xl border" style={{ borderColor: faint(pal.text), background: pal.surface }}>
              {papers.map((p, i) => (
                <li key={`${p.title}-${i}`} className="p-4">
                  <p className="font-medium" style={{ color: pal.text }}>{p.title}</p>
                  {p.authors ? <p className="text-sm" style={bodyStyle}>{p.authors}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p style={bodyStyle}>{str(c, 'placeholder') || 'Accepted papers will be listed after review.'}</p>
          )}
        </SectionShell>
      )
    }
    case 'registration':
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Registration'}>
          <p className="max-w-3xl whitespace-pre-wrap leading-relaxed" style={bodyStyle}>{str(c, 'body')}</p>
          <a href={ctx.cta.attend} className="mt-5 inline-flex h-10 items-center rounded-md px-5 text-sm font-semibold hover:opacity-90" style={{ background: pal.primary, color: onColor(pal.primary, pal.text) }}>
            {str(c, 'ctaLabel') || 'Register'}
          </a>
        </SectionShell>
      )
    case 'faqs': {
      const faqs = objList<{ question: string; answer: string }>(c, 'faqs').filter((f) => f.question)
      if (faqs.length === 0) return null
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'FAQs'}>
          <div className="flex flex-col gap-3">
            {faqs.map((f, i) => (
              <details key={`${f.question}-${i}`} className="rounded-xl border p-5" style={{ background: pal.surface, borderColor: faint(pal.text) }}>
                <summary className="cursor-pointer font-medium" style={{ color: pal.text }}>{f.question}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={bodyStyle}>{f.answer}</p>
              </details>
            ))}
          </div>
        </SectionShell>
      )
    }
    case 'contact':
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Contact'}>
          <p className="max-w-3xl leading-relaxed" style={bodyStyle}>{str(c, 'body')}</p>
          {str(c, 'email') ? (
            <a href={`mailto:${str(c, 'email')}`} className="mt-3 inline-block font-medium underline underline-offset-4" style={{ color: pal.primary }}>
              {str(c, 'email')}
            </a>
          ) : null}
        </SectionShell>
      )
    case 'researchers': {
      const researchers = objList<{ name: string; affiliation: string; focus: string; avatarUrl?: string }>(c, 'researchers').filter((r) => r.name)
      if (researchers.length === 0) {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Featured researchers'}>
            <p style={bodyStyle}>{str(c, 'placeholder') || 'Researcher highlights will appear here.'}</p>
          </SectionShell>
        )
      }
      if (variant === 'list') {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Featured researchers'}>
            <ul className="flex flex-col divide-y" style={{ borderColor: faint(pal.text) }}>
              {researchers.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex items-center gap-3 py-4">
                  <PersonAvatar name={r.name} avatarUrl={r.avatarUrl} size={40} pal={pal} />
                  <span>
                    <span className="block font-semibold" style={{ color: pal.text }}>{r.name}</span>
                    <span className="block text-sm" style={bodyStyle}>{[r.affiliation, r.focus].filter(Boolean).join(' — ')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </SectionShell>
        )
      }
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Featured researchers'}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {researchers.map((r, i) => (
              <Card key={`${r.name}-${i}`} ctx={ctx} className="transition hover:-translate-y-0.5">
                <PersonAvatar name={r.name} avatarUrl={r.avatarUrl} size={48} pal={pal} />
                <p className="mt-3 font-semibold">{r.name}</p>
                {r.affiliation ? <p className="text-sm" style={bodyStyle}>{r.affiliation}</p> : null}
                {r.focus ? <p className="mt-1 text-sm" style={{ color: pal.accent }}>{r.focus}</p> : null}
              </Card>
            ))}
          </div>
        </SectionShell>
      )
    }
    case 'custom': {
      const bullets = strList(c, 'bullets')
      const inner = (
        <>
          <SectionFigure content={c} ctx={ctx} />
          {str(c, 'body') ? <p className="max-w-3xl whitespace-pre-wrap leading-relaxed" style={bodyStyle}>{str(c, 'body')}</p> : null}
          {bullets.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {bullets.map((b) => (
                <li key={b} className="flex gap-2 text-sm" style={{ color: pal.text }}>
                  <span style={{ color: pal.accent }}>✓</span><span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {str(c, 'ctaLabel') ? (
            <a href={ctaHref(str(c, 'ctaLabel'), ctx.cta)} className="mt-5 inline-flex h-10 items-center rounded-md px-5 text-sm font-semibold hover:opacity-90" style={{ background: pal.primary, color: onColor(pal.primary, pal.text) }}>
              {str(c, 'ctaLabel')}
            </a>
          ) : null}
        </>
      )
      if (variant === 'callout') {
        return (
          <SectionShell ctx={ctx} alt={alt} id={anchorId(section)}>
            <div className="rounded-2xl border-l-4 p-6 sm:p-8" style={{ background: pal.surface, borderColor: pal.accent }}>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: pal.text }}>{str(c, 'title') || 'Highlights'}</h2>
              <div className="mt-4">{inner}</div>
            </div>
          </SectionShell>
        )
      }
      return (
        <SectionShell ctx={ctx} alt={alt} id={anchorId(section)} title={str(c, 'title') || 'Highlights'}>
          {inner}
        </SectionShell>
      )
    }
    default:
      return null
  }
}

function SiteNav({ config, sections, design: designProp, seedId, cta }: { config: WebsiteConfig; sections: WebsiteSection[]; conferenceSlug: string; design?: WebsiteDesign; seedId?: string | null; cta: Ctx['cta'] }) {
  const design = designProp ?? config.design ?? getDesignForTheme(config.themeVariant)
  const ctx = { cta }
  const pal = design.palette
  const sharp = seedId === 'swiss-poster' || seedId === 'brutalist-mono' || seedId === 'paper-archive' || seedId === 'editorial-journal'
  const [open, setOpen] = useState(false)
  const title = config.metadata?.title ?? 'Conference'
  const links = sections
    .filter((s) => s.type !== 'hero')
    .slice(0, 7)
    .map((s) => ({
      href: `#${anchorId(s)}`,
      label: (typeof s.content.title === 'string' && s.content.title) || NAV_LABELS[s.type] || s.type,
    }))

  return (
    <header className="sticky top-0 z-50 border-b backdrop-blur-md" style={{ background: `color-mix(in srgb, ${pal.background} 88%, transparent)`, borderColor: faint(pal.text) }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#section-hero" className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center text-sm font-bold ${sharp ? 'rounded-none' : 'rounded-lg'}`} style={{ background: pal.primary, color: onColor(pal.primary, pal.text) }}>
            {title.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C'}
          </span>
          <span className="truncate text-sm font-semibold sm:text-base" style={{ color: pal.text }}>{title}</span>
        </a>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Conference sections">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm transition hover:opacity-70" style={{ color: muted(pal.text) }}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={ctx.cta.submit} className="hidden h-9 items-center rounded-md px-4 text-sm font-semibold transition hover:scale-[1.03] sm:inline-flex" style={{ background: pal.accent, color: onColor(pal.accent, pal.text) }}>
            Submit a paper
          </a>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Toggle navigation menu" className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-lg lg:hidden" style={{ borderColor: faint(pal.text), color: pal.text }}>
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="border-t px-4 py-2 lg:hidden" style={{ borderColor: faint(pal.text) }} aria-label="Mobile conference sections">
          {[{ href: '#section-hero', label: 'Home' }, ...links].map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2.5 text-sm" style={{ color: pal.text }}>
              {l.label}
            </a>
          ))}
          <a href={ctx.cta.submit} className="mt-1 block rounded-md px-3 py-2.5 text-sm font-semibold" style={{ background: pal.accent, color: onColor(pal.accent, pal.text) }}>
            Submit a paper
          </a>
        </nav>
      ) : null}
    </header>
  )
}

/** AI-authored page: the model wrote the whole document. Rendered in a
 * script-blocked sandboxed iframe (see below for why allow-same-origin is
 * present). Link targets are repaired by sanitizeAiHtml so app links
 * navigate the top page (target="_top") and external links open a new tab. */
export function AiCustomFrame({ html, title, submitPath, submitHref, attendHref }: { html: string; title?: string; submitPath?: string; submitHref?: string; attendHref?: string }) {
  // Repair links at render time too, so pages generated before the link
  // repair existed (stored in the database) get working CTAs without
  // needing to be regenerated.
  const repaired = repairLinks(html, submitPath, { submitHref, attendHref })
  // Two frame behaviours broke header buttons, both fixed here:
  // 1. A srcDoc frame resolves #anchor links against the PARENT page URL, so
  //    clicking "Topics" loaded the whole site inside the frame. A blob: URL
  //    makes fragment links same-document.
  // 2. A sandboxed frame without allow-same-origin cannot perform even
  //    same-document fragment navigation in Chromium (verified: the click
  //    was a no-op). allow-same-origin re-enables anchor scrolling while
  //    scripts remain blocked (no allow-scripts token, all script content
  //    stripped by the sanitizer, CSP default-src 'none'), so the page
  //    still cannot execute code or reach the parent DOM.
  const [blobSrc, setBlobSrc] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([repaired], { type: 'text/html' }))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- blob URL must be created client-side after mount
    setBlobSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [repaired])
  return (
    <iframe
      title={title || 'AI-designed conference page'}
      src={blobSrc ?? undefined}
      srcDoc={blobSrc ? undefined : repaired}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      className="block w-full border-0 bg-white"
      style={{ height: '100vh', minHeight: 720 }}
    />
  )
}

export function WebsiteRenderer({ config, conferenceSlug, organizationName, eventDates, stats, submitHref, attendHref }: {
  config: WebsiteConfig
  conferenceSlug: string
  organizationName?: string
  eventDates?: WebsiteEventDates
  stats?: WebsiteStats
  /** Account-aware CTA targets from the host page (defaults: direct forms). */
  submitHref?: string
  attendHref?: string
}) {
  const cta = {
    submit: submitHref || `/events/${conferenceSlug}/submit`,
    attend: attendHref || `/events/${conferenceSlug}/attend`,
  }
  if (config.generationMode === 'ai-page' && config.customHtml) {
    return <AiCustomFrame html={config.customHtml} title={config.metadata?.title} submitPath={`/events/${conferenceSlug}/submit`} submitHref={cta.submit} attendHref={cta.attend} />
  }
  // Old published configs carry the untouched default theme design, which
  // is why they all looked identical. When the stored design is exactly a
  // theme default (nobody customised it) and no seed was recorded, derive
  // this conference's seed now and restyle at render time. Customised or
  // explicitly prompted designs are never overridden.
  const storedSeed = getDesignSeedById(config.designSeed)
  let design = config.design ?? getDesignForTheme(config.themeVariant)
  let effectiveSeed = storedSeed
  if (!storedSeed && config.themeVariant === 'modern-academic' && !promptHasExplicitStyle(config.designPrompt)
    && JSON.stringify(design) === JSON.stringify(getDesignForTheme(config.themeVariant))) {
    effectiveSeed = pickDesignSeed({ id: config.conferenceId, slug: conferenceSlug, title: config.metadata?.title ?? '', researchTopics: [] }, config.designPrompt)
    design = seededDesign(effectiveSeed, design)
  }
  const ctx: Ctx = { design, cta }
  const pal = design.palette
  const sections = [...config.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order)
  const hero = sections.find((s) => s.type === 'hero')
  const rest = sections.filter((s) => s.type !== 'hero' && isRenderable(s))
  const linkable = hero ? [hero, ...rest] : rest
  const hasDates = rest.some((s) => s.type === 'important-dates')
  const contactSection = sections.find((s) => s.type === 'contact')
  const contactEmail = contactSection && typeof contactSection.content.email === 'string' ? contactSection.content.email : ''
  const fontFamily = design.typography === 'serif' ? 'Georgia, "Times New Roman", serif' : design.typography === 'modern' ? '"Avenir Next", "Segoe UI", system-ui, sans-serif' : 'system-ui, sans-serif'
  const showStats = design.features?.stats !== false && stats && stats.length > 0

  return (
    <div id="top" data-design-seed={effectiveSeed?.id ?? 'custom'} className="min-h-full scroll-smooth" style={{ background: pal.background, color: pal.text, fontFamily }}>
      <style>{`@keyframes confexa-hero-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } } @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }`}</style>
      <SiteNav config={config} sections={linkable} conferenceSlug={conferenceSlug} design={design} seedId={effectiveSeed?.id} cta={cta} />
      {hero ? (
        <div style={{ animation: 'confexa-hero-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both' }}>
          <RenderSection section={hero} ctx={ctx} index={0} conferenceSlug={conferenceSlug} eventDates={eventDates} hasDates={hasDates} />
        </div>
      ) : null}
      {showStats ? (
        <section className="border-b px-4 py-8 sm:px-6" style={{ background: pal.surface, borderColor: faint(pal.text) }} aria-label="Conference numbers">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-bold sm:text-4xl"><Counter value={s.value} color={pal.primary} /></p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider sm:text-sm" style={{ color: muted(pal.text) }}>{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {rest.map((section, i) => (
        <Reveal key={section.id}>
          <RenderSection section={section} ctx={ctx} index={i} conferenceSlug={conferenceSlug} eventDates={eventDates} />
        </Reveal>
      ))}
      <footer className="px-4 pb-10 pt-14 sm:px-6" style={{ background: pal.primary, color: onColor(pal.primary, pal.text) }}>
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-3">
          <div>
            <p className="text-lg font-semibold">{config.metadata?.title ?? 'Conference'}</p>
            {organizationName ? <p className="mt-1 text-sm opacity-80">Organized by {organizationName}</p> : null}
            {config.metadata?.description ? <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-80">{config.metadata.description}</p> : null}
          </div>
          <nav aria-label="Footer">
            <p className="text-sm font-semibold uppercase tracking-wider opacity-70">Explore</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {linkable.slice(0, 8).map((s) => (
                <li key={s.id}>
                  <a href={`#${anchorId(s)}`} className="opacity-85 transition hover:opacity-100 hover:underline underline-offset-4">
                    {(typeof s.content.title === 'string' && s.content.title) || NAV_LABELS[s.type] || s.type}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider opacity-70">Get involved</p>
            <a href={ctx.cta.submit} className="mt-3 inline-flex h-10 items-center rounded-md px-5 text-sm font-semibold transition hover:scale-[1.03]" style={{ background: pal.accent, color: onColor(pal.accent, pal.text) }}>
              Submit a paper
            </a>
            {contactEmail ? (
              <p className="mt-3 text-sm opacity-85">
                Questions? <a href={`mailto:${contactEmail}`} className="underline underline-offset-4">{contactEmail}</a>
              </p>
            ) : null}
            <p className="mt-3"><a href="#top" className="text-sm underline underline-offset-4 opacity-85 hover:opacity-100">Back to top ↑</a></p>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-col items-center justify-between gap-2 border-t pt-5 text-xs opacity-75 sm:flex-row" style={{ borderColor: `color-mix(in srgb, ${onColor(pal.primary, pal.text)} 25%, transparent)` }}>
          <span>© {new Date().getFullYear()} {organizationName ?? config.metadata?.title ?? 'Conference'}.</span>
          <span>Website built with Confexa</span>
        </div>
      </footer>
    </div>
  )
}
