import type { WebsiteThemeVariant } from '@/lib/demo/types'

export type ThemeDefinition = {
  id: WebsiteThemeVariant
  name: string
  description: string
  page: string
  hero: string
  heroText: string
  heroMuted: string
  accent: string
  accentText: string
  card: string
  heading: string
  sectionAlt: string
  badge: string
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'modern-academic',
    name: 'Modern Academic',
    description: 'Clean indigo academic layout with structured cards and clear dates.',
    page: 'bg-white text-slate-900',
    hero: 'bg-indigo-700',
    heroText: 'text-white',
    heroMuted: 'text-indigo-100',
    accent: 'bg-indigo-600 hover:bg-indigo-500',
    accentText: 'text-indigo-700',
    card: 'border-slate-200 bg-white',
    heading: 'text-slate-900',
    sectionAlt: 'bg-slate-50',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    id: 'editorial-minimal',
    name: 'Editorial Minimal',
    description: 'Quiet, typography-led layout with generous whitespace.',
    page: 'bg-[#FDFCF9] text-neutral-900',
    hero: 'bg-[#FDFCF9] border-b border-neutral-200',
    heroText: 'text-neutral-900',
    heroMuted: 'text-neutral-500',
    accent: 'bg-neutral-900 hover:bg-neutral-700',
    accentText: 'text-neutral-900',
    card: 'border-neutral-200 bg-white',
    heading: 'text-neutral-900',
    sectionAlt: 'bg-neutral-50',
    badge: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  },
  {
    id: 'bold-research',
    name: 'Bold Research',
    description: 'High-contrast dark hero with amber highlights for research events.',
    page: 'bg-white text-slate-900',
    hero: 'bg-slate-950',
    heroText: 'text-white',
    heroMuted: 'text-slate-300',
    accent: 'bg-amber-400 text-slate-950 hover:bg-amber-300',
    accentText: 'text-amber-600',
    card: 'border-slate-200 bg-white',
    heading: 'text-slate-900',
    sectionAlt: 'bg-amber-50',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'contemporary-tech',
    name: 'Contemporary Tech',
    description: 'Teal-on-dark technology feel for computing and engineering venues.',
    page: 'bg-slate-50 text-slate-900',
    hero: 'bg-teal-800',
    heroText: 'text-white',
    heroMuted: 'text-teal-100',
    accent: 'bg-teal-500 hover:bg-teal-400',
    accentText: 'text-teal-700',
    card: 'border-teal-100 bg-white',
    heading: 'text-slate-900',
    sectionAlt: 'bg-teal-50',
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    id: 'elegant-institutional',
    name: 'Elegant Institutional',
    description: 'Formal serif-style institutional presence in deep green and stone.',
    page: 'bg-[#FAF9F6] text-stone-900',
    hero: 'bg-emerald-900',
    heroText: 'text-white',
    heroMuted: 'text-emerald-100',
    accent: 'bg-emerald-700 hover:bg-emerald-600',
    accentText: 'text-emerald-800',
    card: 'border-stone-200 bg-white',
    heading: 'text-stone-900',
    sectionAlt: 'bg-stone-100',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
]

export function getTheme(id: WebsiteThemeVariant): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
