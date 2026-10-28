'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/config'

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function NewOrgConferencePage({ params }: { params: { slug: string } }) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const configured = isSupabaseConfigured()
  const orgSlug = params.slug

  useEffect(() => {
    if (!configured) {
      router.replace('/auth/setup')
    }
  }, [configured, router])

  if (!configured) {
    return null
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()
      if (!org) throw new Error('Organization not found')

      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .single()
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new Error('Not authorized')
      }

      const { count } = await supabase
        .from('conferences')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)

      if (count && count >= 1) {
        throw new Error('This organization already has a conference (limit: 1 per organization).')
      }

      const confSlug = slug || slugify(title)
      const { data: conf, error: confErr } = await supabase
        .from('conferences')
        .insert({
          organization_id: org.id,
          title,
          slug: confSlug,
          description: description || null,
          status: 'draft',
          visibility: 'private',
          created_by: user.id,
        })
        .select()
        .single()
      if (confErr) throw confErr

      router.push(`/organizations/${orgSlug}/conferences/${conf.slug}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create conference')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create conference</h1>
        <p className="text-sm text-muted-foreground">Draft conference for this organization.</p>
      </header>
      <form onSubmit={onSubmit} className="rounded-lg border p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="title" className="text-sm font-medium">Title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (!slug) setSlug(slugify(e.target.value))
            }}
            required
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="slug" className="text-sm font-medium">Slug</label>
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            required
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="description" className="text-sm font-medium">Description (optional)</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
            rows={3}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create conference'}
        </Button>
      </form>
    </div>
  )
}
