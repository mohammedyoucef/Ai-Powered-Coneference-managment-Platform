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

export default function NewOrganizationPage() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const configured = isSupabaseConfigured()

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
      const { data: sessionData } = await supabase.auth.getSession()
      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      if (userErr || !user || !sessionData.session) {
        console.error('[org-create] session missing or invalid')
        throw new Error('Not authenticated')
      }

      const orgSlug = slug || slugify(name)
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name, slug: orgSlug, description: description || null, created_by: user.id })
        .select()
        .single()
      if (orgErr) {
        console.error('[org-create] org insert failed:', orgErr.message)
        throw orgErr
      }

      const { error: memErr } = await supabase
        .from('organization_members')
        .insert({ organization_id: org.id, user_id: user.id, role: 'owner' })
      if (memErr) {
        console.error('[org-create] membership insert failed:', memErr.message)
        throw memErr
      }

      router.push(`/organizations/${org.slug}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create organization</h1>
        <p className="text-sm text-muted-foreground">You will become the owner.</p>
      </header>
      <form onSubmit={onSubmit} className="rounded-lg border p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-medium">Name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
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
          {loading ? 'Creating...' : 'Create organization'}
        </Button>
      </form>
    </div>
  )
}
