import type { Conference, WebsiteDesign } from '@/lib/demo/types'

/**
 * Deterministic design seed.
 *
 * Why this exists: language models asked to "design something distinctive"
 * converge on the same centred indigo-gradient hero. A seed fixes that by
 * *assigning* each conference a concrete art direction (palette, type,
 * hero composition, motif, section rhythm) derived from its own record, so
 * two different conferences can never receive the same brief — while the
 * same conference + prompt always reproduces the same direction.
 * An explicit style/colour in the organiser's prompt always wins.
 */

export type DesignSeed = {
  id: string
  name: string
  direction: string
  palette: WebsiteDesign['palette']
  typography: WebsiteDesign['typography']
  fontStack: string
  layout: WebsiteDesign['layout']
  heroStyle: WebsiteDesign['heroStyle']
  heroComposition: string
  sectionRhythm: string
  motif: string
  buttonStyle: string
  density: WebsiteDesign['density']
  dark: boolean
}

function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

const SEEDS: DesignSeed[] = [
  {
    id: 'editorial-journal', name: 'Editorial journal',
    direction: 'A printed journal: masthead rule, numbered sections, drop-cap-free but with large serif headlines, generous white space, thin rules instead of cards.',
    palette: { primary: '#1C1917', accent: '#B45309', background: '#FDFBF6', surface: '#FFFFFF', text: '#1C1917' },
    typography: 'serif', fontStack: 'Georgia, "Times New Roman", serif for headlines; system-ui for body',
    layout: 'magazine', heroStyle: 'solid',
    heroComposition: 'Left-aligned masthead hero: small organiser eyebrow, oversized serif title spanning full width, date/location as a ruled meta row underneath, CTA as a flat ink button.',
    sectionRhythm: 'About as two columns, topics as a numbered index list, dates as a ruled table, no rounded cards.',
    motif: 'Hairline rules, section numbers (01, 02, 03), pull-quote style callouts.',
    buttonStyle: 'Square corners, solid ink background, no shadow.', density: 'comfortable', dark: false,
  },
  {
    id: 'dark-laboratory', name: 'Dark laboratory',
    direction: 'A research lab at night: near-black background, one luminous accent, monospace labels, grid-line texture.',
    palette: { primary: '#22D3EE', accent: '#A3E635', background: '#0B1120', surface: '#131C2E', text: '#E2E8F0' },
    typography: 'modern', fontStack: '"Avenir Next", "Segoe UI", system-ui; ui-monospace for labels/dates',
    layout: 'split-hero', heroStyle: 'gradient',
    heroComposition: 'Split hero on near-black: title left in large light type, key-facts panel right with a thin accent border, subtle CSS grid background.',
    sectionRhythm: 'Topics as outlined chips on dark, dates as a vertical neon timeline, sections separated by 1px lines.',
    motif: 'CSS grid lines, monospace uppercase labels, thin accent borders.',
    buttonStyle: 'Pill buttons in the luminous accent with dark text.', density: 'comfortable', dark: true,
  },
  {
    id: 'swiss-poster', name: 'Swiss poster',
    direction: 'Swiss typographic poster: strict grid, one red accent, huge grotesque type, lots of empty space, zero decoration.',
    palette: { primary: '#111111', accent: '#DC2626', background: '#F7F5F0', surface: '#FFFFFF', text: '#111111' },
    typography: 'modern', fontStack: '"Helvetica Neue", Arial, system-ui throughout, tight tracking on headlines',
    layout: 'classic', heroStyle: 'solid',
    heroComposition: 'Poster hero: title set huge and left-aligned in black on off-white, a single red rule, date/location in a strict two-column row, red rectangular CTA.',
    sectionRhythm: 'Everything on a visible column grid, topics as a plain two-column list, dates as bold rows.',
    motif: 'One red rule per section, oversized numerals, no rounded corners anywhere.',
    buttonStyle: 'Sharp rectangles, red background, white text, uppercase.', density: 'compact', dark: false,
  },
  {
    id: 'botanical-academic', name: 'Botanical academic',
    direction: 'A botanical society proceedings: deep green, cream paper, serif display type, leaf-like accent shapes in pure CSS.',
    palette: { primary: '#14532D', accent: '#CA8A04', background: '#FAF8F0', surface: '#FFFFFF', text: '#1A2E1F' },
    typography: 'serif', fontStack: 'Georgia, serif headlines; system-ui body',
    layout: 'magazine', heroStyle: 'solid',
    heroComposition: 'Cream hero with a deep-green band at top, centred serif title, gold rule, key facts in a three-column ruled row.',
    sectionRhythm: 'Topics as cream cards with green titles, dates as cards with gold top border, calm spacing.',
    motif: 'Gold rules, green/gold pairing, classic centred compositions.',
    buttonStyle: 'Rounded-md deep-green buttons with cream text.', density: 'comfortable', dark: false,
  },
  {
    id: 'mediterranean', name: 'Mediterranean',
    direction: 'Sunlit Mediterranean institute: warm white, terracotta and sea blue, relaxed sans type, arch shapes hinted with border-radius.',
    palette: { primary: '#9A3412', accent: '#0369A1', background: '#FFFBF3', surface: '#FFFFFF', text: '#292524' },
    typography: 'sans', fontStack: 'system-ui throughout, medium-weight headlines',
    layout: 'centered', heroStyle: 'pattern',
    heroComposition: 'Centred hero on warm white with a terracotta arch (large top border-radius block) behind the title, sea-blue CTA.',
    sectionRhythm: 'Topics as warm cards, dates in a horizontal strip, venue given unusual prominence mid-page.',
    motif: 'Arch radii, warm paper background, terracotta/sea-blue contrast.',
    buttonStyle: 'Fully rounded pills, sea-blue background.', density: 'comfortable', dark: false,
  },
  {
    id: 'brutalist-mono', name: 'Brutalist mono',
    direction: 'Brutalist black-and-white: raw borders, monospace accents, yellow highlight, deliberately unpolished grid.',
    palette: { primary: '#000000', accent: '#EAB308', background: '#FFFFFF', surface: '#F5F5F5', text: '#000000' },
    typography: 'modern', fontStack: 'ui-monospace for labels; system-ui black weight headlines',
    layout: 'single-page', heroStyle: 'pattern',
    heroComposition: 'Full-width black hero block, title in huge white uppercase, yellow CTA rectangle, meta data in a monospace strip below.',
    sectionRhythm: 'Hard 2px black borders between sections, topics as a bordered table, dates as stark rows.',
    motif: 'Thick black borders, yellow highlights, monospace meta text.',
    buttonStyle: 'Black rectangles with yellow text, 2px border, no radius.', density: 'compact', dark: false,
  },
  {
    id: 'soft-humanities', name: 'Soft humanities',
    direction: 'A humanities colloquium: warm rose and brown, serif everywhere, centred, quiet and literary.',
    palette: { primary: '#7C2D12', accent: '#BE185D', background: '#FDF6F0', surface: '#FFFFFF', text: '#3B2314' },
    typography: 'serif', fontStack: 'Georgia, "Times New Roman", serif throughout',
    layout: 'centered', heroStyle: 'solid',
    heroComposition: 'Centred literary hero: small caps eyebrow, italic-tinged serif title, a short epigraph-style subtitle, restrained outline CTA.',
    sectionRhythm: 'Single centred column (max 42rem), topics as an italic list, dates as centred stacked entries.',
    motif: 'Small caps labels, centred rules with a diamond midpoint (CSS), italic accents.',
    buttonStyle: 'Outline buttons in deep brown, serif text.', density: 'comfortable', dark: false,
  },
  {
    id: 'ocean-institute', name: 'Ocean institute',
    direction: 'A marine/ocean institute: deep sea blue, bright aqua, clean sans, wave-like curved section dividers via border-radius.',
    palette: { primary: '#0C4A6E', accent: '#0891B2', background: '#F0F9FF', surface: '#FFFFFF', text: '#0F172A' },
    typography: 'sans', fontStack: 'system-ui, clean and open',
    layout: 'split-hero', heroStyle: 'gradient',
    heroComposition: 'Deep-blue gradient hero (blue to aqua, NOT purple), title left, a translucent key-dates card right, curved bottom edge.',
    sectionRhythm: 'Topics as aqua-tinted cards, programme/dates early, venue with a large map button.',
    motif: 'Curved section edges, blue depth gradient, aqua chips.',
    buttonStyle: 'Rounded-lg aqua buttons, white text.', density: 'comfortable', dark: false,
  },
  {
    id: 'desert-conference', name: 'Desert conference',
    direction: 'Desert tones: sand, burnt orange, dark brown type, poster-like blocks, warm and dry.',
    palette: { primary: '#7C2D12', accent: '#EA580C', background: '#FEF3E2', surface: '#FFFBEB', text: '#2A1503' },
    typography: 'modern', fontStack: '"Avenir Next", system-ui, bold condensed-feeling headlines (letter-spacing tight)',
    layout: 'magazine', heroStyle: 'pattern',
    heroComposition: 'Sand-coloured poster hero: huge brown title, orange block behind the date row, CTA as an orange block button.',
    sectionRhythm: 'Magazine columns, topics as sand blocks with orange numerals, dates as a horizontal timeline.',
    motif: 'Sand blocks, orange numerals, diagonal CSS stripe in the hero only.',
    buttonStyle: 'Blocky orange buttons, square-ish corners.', density: 'comfortable', dark: false,
  },
  {
    id: 'forest-symposium', name: 'Forest symposium',
    direction: 'A forest field station: very dark green hero, cream body, gold accents, serif display.',
    palette: { primary: '#052E16', accent: '#D97706', background: '#F7F4EA', surface: '#FFFFFF', text: '#1C2A1C' },
    typography: 'serif', fontStack: 'Georgia serif headlines, system-ui body',
    layout: 'split-hero', heroStyle: 'solid',
    heroComposition: 'Very dark green hero, cream serif title left, key facts in a cream outlined panel right, gold CTA.',
    sectionRhythm: 'Cream body sections, topics as numbered rows with gold numerals, dates as cream cards.',
    motif: 'Gold numerals, dark-green/cream contrast, ruled cream panels.',
    buttonStyle: 'Gold buttons with dark-green text, rounded-md.', density: 'comfortable', dark: true,
  },
  {
    id: 'midnight-observatory', name: 'Midnight observatory',
    direction: 'An observatory at midnight: navy darkness, star-gold accents, elegant modern type, thin orbital circles in CSS.',
    palette: { primary: '#F59E0B', accent: '#FBBF24', background: '#0A1128', surface: '#111C3A', text: '#E8ECF8' },
    typography: 'modern', fontStack: '"Avenir Next", "Segoe UI", system-ui; light-weight large headlines',
    layout: 'centered', heroStyle: 'gradient',
    heroComposition: 'Centred hero on deep navy, title in large light type, gold thin-ring CSS circles behind it, gold pill CTA.',
    sectionRhythm: 'Centred dark sections, topics as outlined gold chips, dates as a centred timeline with gold dots.',
    motif: 'Thin gold rings (border circles), navy/gold palette, letterspaced labels.',
    buttonStyle: 'Gold pill buttons with navy text.', density: 'comfortable', dark: true,
  },
  {
    id: 'paper-archive', name: 'Paper archive',
    direction: 'An archival collection: sepia paper, ink indigo (flat, no gradient), typewriter-like labels, stamped details.',
    palette: { primary: '#312E81', accent: '#92400E', background: '#F5EFE0', surface: '#FBF7EA', text: '#292524' },
    typography: 'serif', fontStack: 'Georgia serif headlines; ui-monospace for labels/stamps',
    layout: 'classic', heroStyle: 'solid',
    heroComposition: 'Sepia hero with a double-ruled frame (CSS borders), title in indigo serif, date/location as a stamped monospace row, flat indigo CTA.',
    sectionRhythm: 'Sections framed like archive cards with double borders, topics as a catalogue list, dates as catalogue entries.',
    motif: 'Double borders, monospace stamps, sepia paper texture via repeating gradient.',
    buttonStyle: 'Flat indigo rectangles, cream text.', density: 'compact', dark: false,
  },
]

const DARK_WORDS = /dark|night|midnight|futuristic|cyber|neon|black|observatory|laboratory|lab\b/
const LIGHT_SERIF_WORDS = /editorial|minimal|humanities|literary|serif|elegant|formal|institutional|classic|journal|archive|colloquium/

const COLOUR_WORDS: [RegExp, string][] = [
  [/purple|violet/, '#7C3AED'],
  [/indigo/, '#4F46E5'],
  [/teal|turquoise|aqua/, '#0F766E'],
  [/emerald|green/, '#047857'],
  [/amber|gold|yellow/, '#D97706'],
  [/rose|pink/, '#BE185D'],
  [/crimson|red/, '#BE123C'],
  [/navy/, '#1E3A8A'],
  [/blue|azure|ocean|sea/, '#1D4ED8'],
  [/orange|terracotta/, '#EA580C'],
  [/brown|sepia|desert|sand/, '#92400E'],
]

/** True when the prompt itself dictates style/colour — the seed must not override it. */
export function promptHasExplicitStyle(prompt?: string): boolean {
  if (!prompt?.trim()) return false
  const p = prompt.toLowerCase()
  return DARK_WORDS.test(p) || LIGHT_SERIF_WORDS.test(p) || /vibrant|bold|colorful|colourful|brutalist|swiss|poster|mediterranean|botanical|forest|desert|ocean|marine|tech|digital|modern|warm|soft|dark|light|bright/.test(p)
    || COLOUR_WORDS.some(([re]) => re.test(p))
}

export function promptExplicitColour(prompt?: string): string | null {
  if (!prompt) return null
  const p = prompt.toLowerCase()
  for (const [re, hex] of COLOUR_WORDS) if (re.test(p)) return hex
  return null
}

export function pickDesignSeed(conference: Pick<Conference, 'id' | 'slug' | 'title' | 'researchTopics'>, designPrompt?: string): DesignSeed {
  const prompt = designPrompt?.trim() ?? ''
  const p = prompt.toLowerCase()
  let pool = SEEDS
  if (DARK_WORDS.test(p)) pool = SEEDS.filter((s) => s.dark)
  else if (LIGHT_SERIF_WORDS.test(p)) pool = SEEDS.filter((s) => s.typography === 'serif' && !s.dark)
  if (pool.length === 0) pool = SEEDS

  const key = [conference.id, conference.slug, conference.title, conference.researchTopics.join(','), p].join('|')
  const seed = { ...pool[hashString(key) % pool.length] }

  const colour = promptExplicitColour(prompt)
  if (colour) seed.palette = { ...seed.palette, primary: colour, accent: seed.palette.accent === colour ? seed.palette.primary : seed.palette.accent }
  return seed
}

export function formatDesignSeed(seed: DesignSeed): string {
  const pal = seed.palette
  return [
    `ASSIGNED ART DIRECTION (mandatory — a different direction is assigned to every conference; follow this one exactly unless the organiser prompt explicitly overrides a specific element): "${seed.name}". ${seed.direction}`,
    `Palette (use exactly these hex values as CSS custom properties): primary ${pal.primary}, accent ${pal.accent}, background ${pal.background}, surface ${pal.surface}, text ${pal.text}.`,
    `Typography: ${seed.fontStack}.`,
    `Hero composition: ${seed.heroComposition}`,
    `Section rhythm: ${seed.sectionRhythm}`,
    `Motif/devices: ${seed.motif}`,
    `Buttons: ${seed.buttonStyle}`,
    `Layout archetype: ${seed.layout}; density: ${seed.density}.`,
    'FORBIDDEN unless the organiser prompt explicitly asks for it: a centred purple/indigo gradient hero, white rounded-2xl shadow cards on light grey, generic three-column icon-feature rows, or reusing the hero composition of a generic SaaS landing page.',
  ].join('\n')
}

export function getDesignSeedById(id?: string | null): DesignSeed | null {
  return id ? SEEDS.find((s) => s.id === id) ?? null : null
}

/** Apply a seed to a structured design when the prompt has not dictated the style itself. */
export function seededDesign(seed: DesignSeed, base: WebsiteDesign): WebsiteDesign {
  return {
    ...base,
    layout: seed.layout,
    heroStyle: seed.heroStyle,
    typography: seed.typography,
    density: seed.density,
    palette: { ...seed.palette },
  }
}
