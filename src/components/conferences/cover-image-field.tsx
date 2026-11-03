'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getAIRequestHeaders } from '@/lib/demo/profile'
import { dataUrlToShrunkDataUrl, imageFileToDataUrl } from '@/lib/demo/image-file'

/**
 * Event cover image: uploaded by the organizer, generated with the Meta
 * image model, or pasted as a URL. This is the image shown on Events cards.
 * Uploads/generated images are downscaled and stored with the conference.
 */
export function CoverImageField({ value, onChange, title, topics }: {
  value: string
  onChange: (url: string) => void
  title?: string
  topics?: string
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function onUpload(file: File | null) {
    if (!file) return
    setNote(null)
    try {
      onChange(await imageFileToDataUrl(file, 1400, 0.8))
      setNote('Cover image uploaded. It will appear on the Events card.')
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not process that image.')
    }
  }

  async function generateWithAI() {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: getAIRequestHeaders(),
        body: JSON.stringify({
          prompt: `Generate a modern, cinematic 16:9 YouTube-thumbnail style cover image for an academic conference listing card. Conference title context: "${title || 'Academic conference'}". Research topics: ${topics || 'research, innovation, science'}. Use a clean, professional design with abstract geometric shapes, subtle gradients, or relevant academic imagery. NO text, NO letters, NO logos, NO watermarks, NO people faces with text. Photographic or minimal flat illustration, high contrast, eye-catching but elegant. Aspect ratio landscape 16:9.`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data.error as string) || `Image generation failed (HTTP ${res.status})`)
      const image = data.image as { base64?: string; url?: string; mime?: string }
      if (image?.url) {
        onChange(image.url)
        setNote('AI cover image generated. It will appear on the Events card.')
      } else if (image?.base64) {
        onChange(await dataUrlToShrunkDataUrl(`data:${image.mime || 'image/png'};base64,${image.base64}`, 1400, 0.8))
        setNote('AI cover image generated. It will appear on the Events card.')
      } else {
        throw new Error('The model returned no image data.')
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'AI image generation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-700">Event cover image (shown on Events cards)</span>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-provided/data-URL cover
        <img src={value} alt="Event cover" className="aspect-video w-full rounded-lg border object-cover" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-gradient-to-br from-[#4F46E5] to-violet-600 px-4 text-center text-sm font-medium text-white">
          No cover yet — upload one or generate it with AI.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center rounded-md border bg-white px-3 text-sm font-medium hover:bg-gray-50">
          Upload image
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onUpload(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </label>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void generateWithAI()}>
          {busy ? 'Generating...' : 'Generate with AI'}
        </Button>
        {value ? <Button type="button" variant="ghost" onClick={() => onChange('')}>Remove</Button> : null}
      </div>
      <input type="url" value={value.startsWith('data:') ? '' : value} onChange={(e) => onChange(e.target.value)} placeholder="…or paste an image URL (https://...)" className="rounded-md border px-3 py-2 text-sm w-full" aria-label="Cover image URL" />
      {note ? <p className="text-xs text-gray-600">{note}</p> : null}
      <p className="text-xs text-gray-500">AI generation needs your Meta key in Profile. Uploads are resized automatically.</p>
    </div>
  )
}
