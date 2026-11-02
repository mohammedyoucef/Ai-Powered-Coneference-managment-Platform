'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/demo/storage'
import type { AppUser } from '@/lib/demo/types'

type AdminData = {
  users: AppUser[]
  organizations: { id: string; name: string; slug: string }[]
  conferences: { id: string; title: string; lifecycle: string }[]
  health: { database: string; timestamp: string }
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api<AdminData>('/api/admin'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data')
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server (external system) on mount
  useEffect(() => { void load() }, [load])

  async function setRole(userId: string, platformRole: string) {
    try {
      await api('/api/admin', { method: 'PATCH', body: JSON.stringify({ userId, platformRole }) })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error} This page is only for platform administrators (Confexa platform admins). Organizers cannot access it.</div>
  if (!data) return <p className="text-sm text-[#64748B]">Loading platform administration...</p>

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Platform administration</h1>
        <p className="text-sm text-[#64748B]">{data.health.database} · {new Date(data.health.timestamp).toLocaleString()}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Users', value: data.users.length },
          { label: 'Organizations', value: data.organizations.length },
          { label: 'Conferences', value: data.conferences.length },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border p-5"><p className="text-3xl font-semibold">{s.value}</p><p className="mt-1 text-sm text-[#64748B]">{s.label} (real database counts)</p></div>
        ))}
      </div>
      <div className="rounded-lg border">
        <div className="border-b p-4"><h2 className="font-medium">Users & platform roles</h2></div>
        <div className="divide-y">
          {data.users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div><p className="text-sm font-medium">{u.displayName}</p><p className="text-xs text-[#64748B]">{u.email} · {u.platformRole}</p></div>
              {u.platformRole === 'platform_admin'
                ? <Button size="sm" variant="outline" onClick={() => setRole(u.id, 'user')}>Remove admin</Button>
                : <Button size="sm" variant="outline" onClick={() => setRole(u.id, 'platform_admin')}>Make platform admin</Button>}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-5">
          <h2 className="font-medium">Organizations</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-[#475569]">{data.organizations.map((o) => <li key={o.id}>{o.name} <span className="text-[#94A3B8]">/{o.slug}</span></li>)}</ul>
        </div>
        <div className="rounded-lg border p-5">
          <h2 className="font-medium">Conferences</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-[#475569]">{data.conferences.map((c) => <li key={c.id}>{c.title} <span className="text-[#94A3B8]">({c.lifecycle})</span></li>)}</ul>
        </div>
      </div>
    </div>
  )
}
