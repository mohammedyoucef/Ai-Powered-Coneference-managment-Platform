'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { apiCreateOrganization, slugify } from '@/lib/demo/storage'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

export default function NewOrganizationPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [type, setType] = useState('University')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const org = await apiCreateOrganization({
        name,
        slug: slug || slugify(name),
        description: description || undefined,
        type,
        websiteUrl: websiteUrl || undefined,
        contactEmail: contactEmail || undefined,
      })
      router.push(`/organizations/${org.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Create organization</h1>
        <p className="text-sm text-[#64748B]">An organization hosts one or more conferences. You become its owner; invite members afterwards from the organization page.</p>
      </header>
      <form onSubmit={onSubmit} className="rounded-lg border p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-medium">Name</label>
          <input id="name" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} required className={inputCls} placeholder="International Society for ..." />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="slug" className="text-sm font-medium">Slug</label>
          <input id="slug" value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true) }} required className={inputCls} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="type" className="text-sm font-medium">Type</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            <option>University</option>
            <option>Academic society</option>
            <option>Research institute</option>
            <option>Company</option>
            <option>Non-profit</option>
            <option>Other</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="description" className="text-sm font-medium">Description (optional)</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} rows={3} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="website" className="text-sm font-medium">Website (optional)</label>
            <input id="website" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." className={inputCls} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium">Contact email (optional)</label>
            <input id="email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="bg-[#4F46E5] hover:bg-[#4338CA]">{saving ? 'Creating...' : 'Create organization'}</Button>
          <Button asChild type="button" variant="outline"><Link href="/organizations">Cancel</Link></Button>
        </div>
      </form>
    </div>
  )
}
