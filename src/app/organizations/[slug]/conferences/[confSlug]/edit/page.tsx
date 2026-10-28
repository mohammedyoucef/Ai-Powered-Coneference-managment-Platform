'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export default function EditConferencePage({
  params,
}: {
  params: { slug: string; confSlug: string }
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('draft')
  const [visibility, setVisibility] = useState('private')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const configured = isSupabaseConfigured()
  const orgSlug = params.slug
  const confSlug = params.confSlug

  useEffect(() => {
    if (!configured) {
      router.push('/auth/setup')
      return
    }
    async function load() {
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

        const { data: conf } = await supabase
          .from('conferences')
          .select('*')
          .eq('organization_id', org.id)
          .eq('slug', confSlug)
          .single()
        if (!conf) throw new Error('Conference not found')

        setTitle(conf.title)
        setDescription(conf.description || '')
        setStatus(conf.status)
        setVisibility(conf.visibility)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [configured, orgSlug, confSlug, router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
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

      const { error: updErr } = await supabase
        .from('conferences')
        .update({
          title,
          description: description || null,
          status,
          visibility,
        })
        .eq('organization_id', org.id)
        .eq('slug', confSlug)
      if (updErr) throw updErr

      router.push(`/organizations/${orgSlug}/conferences/${confSlug}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl py-12 text-sm text-muted-foreground">Loading...</div>
    )
  }

  return (
    <div className="mx-auto max-w-xl flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Edit conference</h1>
        <p className="text-sm text-muted-foreground">Only owners/admins can modify.</p>
      </header>
      <form onSubmit={onSubmit} className="rounded-lg border p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="title" className="text-sm font-medium">Title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="description" className="text-sm font-medium">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
            rows={4}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="status" className="text-sm font-medium">Status</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="visibility" className="text-sm font-medium">Visibility</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="private">private</option>
              <option value="unlisted">unlisted</option>
              <option value="public">public</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </form>
    </div>
  )
}
