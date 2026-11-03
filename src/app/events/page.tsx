'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { Conference } from '@/lib/demo/types'

type PublicEvent = Conference & { organizationName: string; organizationSlug: string; heroImage?: string }

function fmt(date?: string) {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Public events directory: published public events (plus your private events). */
export default function EventsDirectoryPage() {
  const [events, setEvents] = useState<PublicEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/events', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Could not load events.')
        setEvents(data.events as PublicEvent[])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load events.'))
  }, [])

  const filtered = (events ?? []).filter((e) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [e.title, e.organizationName, ...(e.researchTopics || [])].join(' ').toLowerCase().includes(needle)
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Events</h1>
          <p className="text-sm text-gray-600">Browse conferences and events</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events or topics" className="w-full max-w-md rounded-md border px-3 py-2 text-sm" aria-label="Search events" />
      </header>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {events === null && !error ? <p className="text-sm text-[#64748B]">Loading events...</p> : null}
      {events !== null && filtered.length === 0 ? (
        <div className="rounded-lg border p-6">
          <h2 className="font-medium text-[#111827]">No events found</h2>
          <p className="mt-1 text-sm text-[#64748B]">{q ? 'Try a different search.' : 'No published events yet. Organizers can create and publish the first one.'}</p>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <article key={e.id} className="flex flex-col rounded-lg border bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="aspect-video bg-gradient-to-br from-[#4F46E5] to-violet-600 relative">
              {e.branding?.coverImageUrl || e.heroImage ? (
                <img
                  src={e.branding?.coverImageUrl || e.heroImage}
                  alt={e.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <span className="text-white text-lg font-semibold px-4 text-center">{e.title}</span>
                </div>
              )}
              {e.visibility === 'private' && (
                <span className="absolute top-2 right-2 rounded-full bg-black/70 text-white px-2 py-1 text-xs">Private</span>
              )}
            </div>
            <div className="flex flex-col gap-3 p-5 flex-1">
              <div>
                <h2 className="font-semibold text-gray-900 line-clamp-2">{e.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{e.organizationName}</p>
              </div>
              {e.shortDescription && (
                <p className="text-sm text-gray-600 line-clamp-2">{e.shortDescription}</p>
              )}
              <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                {fmt(e.startDate) && (
                  <span>{fmt(e.startDate)}{fmt(e.endDate) ? ` - ${fmt(e.endDate)}` : ''}</span>
                )}
                {[e.city, e.country].filter(Boolean).length > 0 && (
                  <span>{[e.city, e.country].filter(Boolean).join(', ')}</span>
                )}
              </div>
              {e.researchTopics?.length ? (
                <div className="flex flex-wrap gap-1">
                  {e.researchTopics.slice(0, 3).map((t) => (
                    <span key={t} className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">{t}</span>
                  ))}
                </div>
              ) : null}
              <div className="mt-auto pt-2">
                <Button asChild size="sm" className="w-full bg-[#4F46E5] hover:bg-[#4338CA]">
                  <Link href={`/events/${e.slug}`}>View event</Link>
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
