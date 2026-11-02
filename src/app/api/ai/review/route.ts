import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/server/auth'
import { getAIProviderFromHeaders, PaperReviewSchema } from '@/lib/ai/provider'
import { query, queryOne } from '@/lib/server/db'
import { isConferenceManager } from '@/lib/server/business'
import type { Conference, Submission } from '@/lib/demo/types'

/**
 * AI reviewing tools are for Reviewer accounts assigned to the paper and
 * for the event's organizers — never for the paper's author (a Researcher
 * must not AI-review their own submission) or unrelated accounts.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const body = (await req.json()) as { submission?: Partial<Submission>; conference?: Conference | null }
    const sub = body.submission
    if (!sub?.title?.trim() || !sub?.abstract?.trim()) {
      return NextResponse.json({ error: 'A paper title and abstract are required for AI review.' }, { status: 400 })
    }
    if (sub.id) {
      const row = await queryOne<{ conference_id: string; author_id: string }>('select conference_id, author_id from submissions where id=$1', [String(sub.id)]).catch(() => null)
      if (!row) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 })
      if (String(row.author_id) === user.id) {
        return NextResponse.json({ error: 'Authors cannot run AI reviewing tools on their own paper. AI review is available to the assigned reviewer and the event organizers.' }, { status: 403 })
      }
      const conf = await queryOne<Parameters<typeof isConferenceManager>[1]>('select * from conferences where id=$1', [String(row.conference_id)]).catch(() => null)
      const manager = conf ? await isConferenceManager(user, conf) : false
      const assigned = await query('select id from review_assignments where submission_id=$1 and reviewer_id=$2', [String(sub.id), user.id]).catch(() => [])
      if (!manager && assigned.length === 0) {
        return NextResponse.json({ error: 'AI reviewing tools are only available to the reviewer assigned to this paper and the event organizers.' }, { status: 403 })
      }
    } else if (user.account_type !== 'reviewer' && user.account_type !== 'organizer' && user.platform_role !== 'platform_admin') {
      return NextResponse.json({ error: 'AI reviewing tools are only available to Reviewer and Organizer accounts.' }, { status: 403 })
    }
    const provider = getAIProviderFromHeaders(req.headers)
    const result = await provider.reviewPaper(
      {
        title: sub.title,
        abstract: sub.abstract,
        authors: Array.isArray(sub.authors) ? sub.authors : [],
        topics: Array.isArray(sub.topics) ? sub.topics : [],
        extractedText: typeof sub.extractedText === 'string' ? sub.extractedText.slice(0, 12000) : undefined,
      },
      body.conference ?? null,
    )
    const validated = PaperReviewSchema.parse(result.data)
    return NextResponse.json({ review: validated, source: result.source, label: result.label, model: result.model ?? null })
  } catch {
    return NextResponse.json({ error: 'Failed to generate AI review' }, { status: 500 })
  }
}
