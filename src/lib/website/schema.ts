import { z } from 'zod'

export const WebsiteThemeVariantSchema = z.enum([
  'modern-academic',
  'editorial-minimal',
  'bold-research',
  'contemporary-tech',
  'elegant-institutional',
])

export const WebsiteSectionTypeSchema = z.enum([
  'hero',
  'about',
  'research-topics',
  'important-dates',
  'submission-guidelines',
  'keynote-speakers',
  'organizing-committee',
  'venue',
  'registration',
  'faqs',
  'contact',
  'accepted-papers',
  'conference-program',
  'researchers',
  'custom',
])

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB color')

export const WebsiteDesignSchema = z.object({
  layout: z.enum(['classic', 'split-hero', 'centered', 'magazine', 'single-page', 'speaker-forward', 'schedule-forward']),
  palette: z.object({
    primary: hexColor,
    accent: hexColor,
    background: hexColor,
    surface: hexColor,
    text: hexColor,
  }),
  typography: z.enum(['sans', 'serif', 'modern']),
  density: z.enum(['comfortable', 'compact']),
  heroStyle: z.enum(['solid', 'gradient', 'pattern', 'split']),
  features: z
    .object({
      countdown: z.boolean().optional(),
      stats: z.boolean().optional(),
    })
    .optional(),
})

export const WebsiteSectionSchema = z.object({
  id: z.string().min(1).max(100),
  type: WebsiteSectionTypeSchema,
  enabled: z.boolean(),
  order: z.number().int().min(0).max(100),
  variant: z.string().max(40).optional(),
  // Content is plain structured data. Code/HTML strings are never rendered as markup.
  content: z.record(z.string(), z.unknown()),
})

export const WebsiteConfigSchema = z.object({
  id: z.string().min(1).max(120),
  conferenceId: z.string().min(1).max(120),
  themeVariant: WebsiteThemeVariantSchema,
  generationMode: z.enum(['structured', 'ai-page']).optional(),
  customHtml: z.string().max(200000).optional(),
  aiSummary: z.array(z.string().max(300)).max(10).optional(),
  designSeed: z.string().max(60).optional(),
  design: WebsiteDesignSchema.optional(),
  designPrompt: z.string().max(10000).optional(),
  sections: z.array(WebsiteSectionSchema).min(1).max(30),
  metadata: z
    .object({
      title: z.string().max(200).optional(),
      description: z.string().max(500).optional(),
    })
    .optional(),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  published: z.boolean(),
  publishedAt: z.string().max(40).optional(),
})

export type WebsiteConfigInput = z.infer<typeof WebsiteConfigSchema>

export function validateWebsiteConfig(input: unknown) {
  return WebsiteConfigSchema.safeParse(input)
}
