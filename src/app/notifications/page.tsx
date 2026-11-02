'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/demo/storage'
import type { AppNotification } from '@/lib/demo/types'

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api<{ notifications: AppNotification[] }>('/api/notifications')
      setItems(data.notifications)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server (external system) on mount
  useEffect(() => { void load() }, [load])

  async function mark(id: string) {
    await api('/api/notifications', { method: 'PATCH', body: JSON.stringify({ id }) }).catch(() => {})
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
  }

  async function markAll() {
    await api('/api/notifications', { method: 'PATCH', body: JSON.stringify({ all: true }) }).catch(() => {})
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Notifications</h1>
          <p className="text-sm text-[#64748B]">In-app notifications from PostgreSQL. Email is not configured in this deployment, so nothing below was emailed unless marked “sent”.</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAll} disabled={items.every((n) => n.isRead)}>Mark all read</Button>
      </header>
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-[#64748B]">Loading notifications...</p> : items.length === 0 ? (
        <div className="rounded-lg border p-6">
          <h2 className="font-medium text-[#111827]">No notifications yet</h2>
          <p className="mt-1 text-sm text-[#64748B]">Invitations, submission confirmations, review assignments, review completions, and decision releases will appear here.</p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {items.map((n) => (
            <div key={n.id} className={`flex flex-wrap items-start justify-between gap-3 p-4 ${n.isRead ? '' : 'bg-indigo-50/50'}`}>
              <div>
                <p className="text-sm font-medium text-[#111827]">{n.title}</p>
                {n.body ? <p className="mt-0.5 text-sm text-[#64748B]">{n.body}</p> : null}
                <p className="mt-1 text-xs text-[#94A3B8]">{new Date(n.createdAt).toLocaleString()} · {n.type} · email: {n.emailStatus === 'not_configured' ? 'not configured (in-app only)' : n.emailStatus}</p>
              </div>
              <div className="flex gap-2">
                {n.link ? <Button asChild variant="outline" size="sm"><Link href={n.link}>Open</Link></Button> : null}
                {!n.isRead ? <Button size="sm" onClick={() => mark(n.id)}>Mark read</Button> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
