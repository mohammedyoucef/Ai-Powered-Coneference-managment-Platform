import type { Conference, Organization, WebsiteConfig, WebsiteDesign, WebsiteSection, WebsiteThemeVariant } from '@/lib/demo/types'
import { pickDesignSeed, promptHasExplicitStyle, seededDesign } from './design-seed'

function id(prefix: string, n: number): string {
  return `${prefix}_${n}_${Math.random().toString(36).slice(2, 8)}`
}

function formatDate(value?: string): string {
  if (!value) return ''
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function locationLine(conf: Conference): string {
  const parts = [conf.venueOrFormat, conf.city, conf.country].filter(Boolean)
  return parts.join(' · ')
}

export function getDesignForTheme(variant: WebsiteThemeVariant): WebsiteDesign {
  switch (variant) {
    case 'editorial-minimal':
      return { layout: 'centered', palette: { primary: '#1C1917', accent: '#B45309', background: '#FDFCF9', surface: '#FFFFFF', text: '#1C1917' }, typography: 'serif', density: 'comfortable', heroStyle: 'solid', features: { countdown: true, stats: true } }
    case 'bold-research':
      return { layout: 'split-hero', palette: { primary: '#0F172A', accent: '#F59E0B', background: '#FFFFFF', surface: '#F8FAFC', text: '#0F172A' }, typography: 'modern', density: 'comfortable', heroStyle: 'gradient', features: { countdown: true, stats: true } }
    case 'contemporary-tech':
      return { layout: 'split-hero', palette: { primary: '#0F766E', accent: '#2DD4BF', background: '#F0FDF9', surface: '#FFFFFF', text: '#0F172A' }, typography: 'modern', density: 'comfortable', heroStyle: 'gradient', features: { countdown: true, stats: true } }
    case 'elegant-institutional':
      return { layout: 'magazine', palette: { primary: '#064E3B', accent: '#D97706', background: '#FAF9F6', surface: '#FFFFFF', text: '#1C1917' }, typography: 'serif', density: 'comfortable', heroStyle: 'solid', features: { countdown: true, stats: true } }
    case 'modern-academic':
    default:
      return { layout: 'classic', palette: { primary: '#4F46E5', accent: '#0891B2', background: '#FFFFFF', surface: '#F8FAFC', text: '#0F172A' }, typography: 'sans', density: 'comfortable', heroStyle: 'solid', features: { countdown: true, stats: true } }
  }
}

const COLOR_WORDS: [RegExp, string][] = [
  [/purple|violet|indigo/, '#7C3AED'],
  [/teal|turquoise/, '#0F766E'],
  [/emerald|green/, '#047857'],
  [/amber|gold|yellow/, '#D97706'],
  [/rose|pink|red|crimson/, '#BE123C'],
  [/blue|navy|azure/, '#1D4ED8'],
  [/orange/, '#EA580C'],
]

/** Prompt-aware deterministic design (also the labeled fallback when Meta is unavailable). */
export function designFromPrompt(variant: WebsiteThemeVariant, prompt?: string): WebsiteDesign {
  const design = getDesignForTheme(variant)
  if (!prompt?.trim()) return design
  const p = prompt.toLowerCase()

  if (/dark|futuristic|cyber|neon|midnight/.test(p)) {
    design.layout = 'split-hero'
    design.heroStyle = 'gradient'
    design.typography = 'modern'
    design.palette = { primary: '#7C3AED', accent: '#22D3EE', background: '#0B1120', surface: '#111827', text: '#F8FAFC' }
  } else if (/minimal|editorial|quiet|humanities|serif|literary/.test(p)) {
    design.layout = 'centered'
    design.heroStyle = 'solid'
    design.typography = 'serif'
    design.palette = { primary: '#1C1917', accent: '#B45309', background: '#FDFCF9', surface: '#FFFFFF', text: '#1C1917' }
  } else if (/elegant|formal|institutional|classic/.test(p)) {
    design.layout = 'magazine'
    design.typography = 'serif'
    design.heroStyle = 'solid'
    design.palette = { primary: '#064E3B', accent: '#D97706', background: '#FAF9F6', surface: '#FFFFFF', text: '#1C1917' }
  } else if (/vibrant|bold|colorful|colourful|energetic/.test(p)) {
    design.layout = 'magazine'
    design.heroStyle = 'pattern'
    design.typography = 'modern'
    design.palette = { primary: '#9A3412', accent: '#F97316', background: '#FFF7ED', surface: '#FFFFFF', text: '#1C1917' }
  } else if (/tech|computing|digital|software|ai summit|artificial intelligence/.test(p)) {
    design.layout = 'split-hero'
    design.heroStyle = 'gradient'
    design.typography = 'modern'
    design.palette = { primary: '#0F766E', accent: '#2DD4BF', background: '#F0FDF9', surface: '#FFFFFF', text: '#0F172A' }
  }

  if (/speaker/.test(p)) design.layout = 'speaker-forward'
  if (/schedule|agenda|program|programme|timeline/.test(p)) design.layout = 'schedule-forward'
  design.features = {
    countdown: !/no countdown|without countdown/.test(p),
    stats: !/no stats|without stats|no counters/.test(p),
  }
  if (/one.?page|single.?page|compact|concise/.test(p)) {
    design.layout = 'single-page'
    design.density = 'compact'
  }
  if (/spacious|airy|generous/.test(p)) design.density = 'comfortable'

  for (const [re, color] of COLOR_WORDS) {
    if (re.test(p)) {
      design.palette = { ...design.palette, primary: color }
      break
    }
  }
  return design
}

/**
 * Deterministic structured-config builder (fallback + safety skeleton).
 * Only uses facts supplied on the conference record / design prompt.
 * Sections without source data stay disabled with editable placeholders,
 * so nothing (speakers, papers, stats) is invented — unless the user's
 * prompt explicitly asks for that section, in which case it is enabled
 * with placeholder copy for them to fill in.
 */
export function buildWebsiteConfig(
  conference: Conference,
  organization: Organization | null,
  themeVariant: WebsiteThemeVariant = 'modern-academic',
  designPrompt?: string,
): WebsiteConfig {
  const now = new Date().toISOString()
  const prompt = designPrompt?.trim() ?? ''
  const lower = prompt.toLowerCase()
  // Per-conference design seed: without it every fallback/structured site
  // collapsed to the same five theme palettes. An explicit style in the
  // prompt (or a non-default theme chosen in the editor) still wins.
  const seed = pickDesignSeed(conference, prompt)
  const design = !promptHasExplicitStyle(prompt) && themeVariant === 'modern-academic'
    ? seededDesign(seed, designFromPrompt(themeVariant, prompt))
    : designFromPrompt(themeVariant, prompt)
  const seedTopicVariant = ['chips', 'cards', 'numbered'][seed.id.length % 3]
  const seedDateVariant = seed.id.length % 2 === 0 ? 'timeline' : 'cards'
  const speakerFocused = design.layout === 'speaker-forward' || /speaker|keynote/.test(lower)
  const scheduleFocused = design.layout === 'schedule-forward' || /schedule|agenda|program|programme/.test(lower)

  const dates: { label: string; date: string }[] = []
  if (conference.submissionDeadline) dates.push({ label: 'Paper submission deadline', date: formatDate(conference.submissionDeadline) })
  if (conference.startDate) dates.push({ label: 'Conference starts', date: formatDate(conference.startDate) })
  if (conference.endDate) dates.push({ label: 'Conference ends', date: formatDate(conference.endDate) })

  const dateLine = [formatDate(conference.startDate), formatDate(conference.endDate)].filter(Boolean).join(' – ')
  const loc = locationLine(conference)

  const sections: WebsiteSection[] = [
    {
      id: id('sec', 1), type: 'hero', enabled: true, order: 0, variant: design.heroStyle === 'split' || design.layout === 'split-hero' ? 'split' : design.layout === 'centered' ? 'centered' : 'banner',
      content: {
        eyebrow: organization?.name ?? '',
        title: conference.title,
        subtitle: conference.shortDescription || 'An academic conference bringing together researchers and practitioners.',
        dateLine,
        location: loc,
        ctaLabel: 'Submit a paper',
        ctaNote: conference.submissionDeadline ? `Submissions close ${formatDate(conference.submissionDeadline)}` : '',
        imageQuery: `${conference.researchTopics[0] ?? 'university conference'} research`,
      },
    },
    {
      id: id('sec', 2), type: 'about', enabled: Boolean(conference.fullDescription || conference.shortDescription), order: 1, variant: /two.?column|magazine/.test(lower) || design.layout === 'magazine' ? 'two-column' : 'single',
      content: {
        title: 'About the conference',
        body: conference.fullDescription || conference.shortDescription || '',
      },
    },
    {
      id: id('sec', 3), type: 'research-topics', enabled: conference.researchTopics.length > 0, order: 2, variant: /card/.test(lower) ? 'cards' : /number|list/.test(lower) ? 'numbered' : seedTopicVariant,
      content: { title: 'Research topics', topics: conference.researchTopics },
    },
    {
      id: id('sec', 4), type: 'important-dates', enabled: dates.length > 0, order: 3, variant: scheduleFocused || /timeline/.test(lower) ? 'timeline' : seedDateVariant,
      content: { title: 'Important dates', dates },
    },
    {
      id: id('sec', 5), type: 'submission-guidelines', enabled: Boolean(conference.submissionGuidelines || conference.submissionDeadline), order: 4,
      content: {
        title: 'Submission guidelines',
        body: conference.submissionGuidelines || 'Prepare your manuscript according to the conference template and submit it before the deadline. Full author guidelines can be added here from the editor.',
        deadline: conference.submissionDeadline ? formatDate(conference.submissionDeadline) : '',
        ctaLabel: 'Submit a paper',
      },
    },
    {
      id: id('sec', 6), type: 'keynote-speakers', enabled: speakerFocused, order: 5, variant: /list/.test(lower) ? 'list' : 'cards',
      content: { title: 'Keynote speakers', speakers: [] as { name: string; affiliation: string; talkTitle: string }[], placeholder: 'No keynote speakers announced yet. Add speakers from the editor.' },
    },
    {
      id: id('sec', 7), type: 'organizing-committee', enabled: false, order: 6,
      content: { title: 'Organizing committee', members: [] as { name: string; role: string; affiliation: string }[], placeholder: 'Committee details have not been published yet. Add members from the editor.' },
    },
    {
      id: id('sec', 14), type: 'researchers', enabled: /researcher|scientist|author spotlight/.test(lower), order: 7, variant: /list/.test(lower) ? 'list' : 'cards',
      content: { title: 'Featured researchers', researchers: [] as { name: string; affiliation: string; focus: string }[], placeholder: 'Researcher highlights have not been added yet. They appear here when the chair publishes accepted papers or adds them in the editor.' },
    },
    {
      id: id('sec', 8), type: 'venue', enabled: Boolean(loc), order: 7,
      content: { title: 'Venue & format', body: loc, city: conference.city ?? '', country: conference.country ?? '' },
    },
    {
      id: id('sec', 9), type: 'conference-program', enabled: scheduleFocused, order: 8,
      content: { title: 'Conference program', items: [] as { time: string; title: string; description: string }[], placeholder: 'The program will be published here once sessions are scheduled.' },
    },
    {
      id: id('sec', 10), type: 'accepted-papers', enabled: false, order: 9,
      content: { title: 'Accepted papers', papers: [] as { title: string; authors: string }[], placeholder: 'Accepted papers will be listed here after review decisions.' },
    },
    {
      id: id('sec', 11), type: 'registration', enabled: false, order: 10,
      content: { title: 'Registration', body: 'Registration details have not been published yet. Add fees and deadlines from the editor.', ctaLabel: 'Register' },
    },
    {
      id: id('sec', 12), type: 'faqs', enabled: /faq|question/.test(lower), order: 11,
      content: {
        title: 'Frequently asked questions',
        faqs: [
          { question: 'How do I submit a paper?', answer: 'Use the “Submit a paper” button on this page to open the submission form. In this demo your PDF stays in your browser and is reviewed from the Confexa dashboard on the same device.' },
          { question: 'What language should papers be written in?', answer: conference.language ? `Papers should be written in ${conference.language}.` : 'See the submission guidelines for language requirements.' },
        ],
      },
    },
    {
      id: id('sec', 13), type: 'contact', enabled: Boolean(conference.contactEmail || organization?.contactEmail), order: 12,
      content: {
        title: 'Contact',
        email: conference.contactEmail || organization?.contactEmail || '',
        body: 'Questions about submissions or attendance? Contact the organizing team.',
      },
    },
  ]

  // Prompt-requested bespoke section, built only from supplied facts.
  if (/why attend|benefit|experience|highlight|network/.test(lower)) {
    sections.push({
      id: id('sec', 20), type: 'custom', enabled: true, order: 99, variant: 'callout',
      content: {
        title: 'Why attend',
        body: conference.shortDescription || 'Connect with researchers and practitioners working on the questions this conference brings together.',
        bullets: [
          ...(conference.researchTopics.slice(0, 3).map((t) => `Sessions and discussion on ${t}`)),
          'Present your work and receive peer feedback',
          loc ? `Meet the community ${loc}` : 'Meet the community around this research area',
        ],
        ctaLabel: 'Submit a paper',
      },
    })
  }

  // Emphasis-driven ordering: bring the focused section right after About.
  const ordered = [...sections].sort((a, b) => a.order - b.order)
  function promote(type: string) {
    const idx = ordered.findIndex((s) => s.type === type)
    if (idx > 2) {
      const [item] = ordered.splice(idx, 1)
      ordered.splice(2, 0, item)
    }
  }
  if (speakerFocused) promote('keynote-speakers')
  if (scheduleFocused) {
    promote('conference-program')
    promote('important-dates')
  }
  ordered.forEach((s, i) => { s.order = i })

  return {
    id: id('site', 0),
    conferenceId: conference.id,
    themeVariant,
    design,
    designSeed: seed.id,
    designPrompt: prompt || undefined,
    sections: ordered,
    metadata: {
      title: conference.title,
      description: conference.shortDescription || conference.title,
    },
    createdAt: now,
    updatedAt: now,
    published: false,
  }
}
