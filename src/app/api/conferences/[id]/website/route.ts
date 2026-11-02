import { NextResponse } from 'next/server'
import { query, logActivity } from '@/lib/server/db'
import { requireUser, requireConferenceManager, errorJson, HttpError } from '@/lib/server/auth'

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    await requireConferenceManager(user, id)
    const { config } = (await req.json().catch(() => ({}))) as { config?: unknown }
    if (!config || typeof config !== 'object') throw new HttpError(400, 'Website config required.')
    await query(
      `insert into website_configs (conference_id,is_published,config,updated_at) values ($1,false,$2,now())
       on conflict (conference_id,is_published) do update set config=excluded.config, updated_at=now()`,
      [id, JSON.stringify(config)],
    )
    await logActivity(user.id, null, id, 'website_draft_saved')
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser()
    const conf = await requireConferenceManager(user, id)
    const { action } = (await req.json().catch(() => ({}))) as { action?: 'publish' | 'unpublish' }
    if (action === 'unpublish') {
      await query('delete from website_configs where conference_id=$1 and is_published=true', [id])
      if (conf.lifecycle !== 'draft') await query("update conferences set lifecycle='draft', updated_at=now() where id=$1", [id])
      await logActivity(user.id, null, id, 'website_unpublished')
      return NextResponse.json({ ok: true })
    }
    const draft = (await query('select config from website_configs where conference_id=$1 and is_published=false', [id]))[0]
    if (!draft) throw new HttpError(400, 'No website draft to publish. Generate or save a website first.')
    const config = draft.config as Record<string, unknown>
    const snapshot = { ...config, published: true, publishedAt: new Date().toISOString() }
    await query(
      `insert into website_configs (conference_id,is_published,config,published_at,updated_at) values ($1,true,$2,now(),now())
       on conflict (conference_id,is_published) do update set config=excluded.config, published_at=now(), updated_at=now()`,
      [id, JSON.stringify(snapshot)],
    )
    if (conf.lifecycle === 'draft') await query("update conferences set lifecycle='published', updated_at=now() where id=$1", [id])
    await logActivity(user.id, null, id, 'website_published')
    return NextResponse.json({ ok: true, config: snapshot })
  } catch (err) {
    const e = errorJson(err)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
