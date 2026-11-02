'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api, deleteOrganization, refreshData, updateOrganization, useDemoData, useHydrated } from '@/lib/demo/storage'
import { canManageOrganization } from '@/lib/demo/permissions'
import type { OrgRole, Organization } from '@/lib/demo/types'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

function EditOrgForm({ org, onSaved, onDeleted }: { org: Organization; onSaved: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(org.name)
  const [description, setDescription] = useState(org.description ?? '')
  const [type, setType] = useState(org.type ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(org.websiteUrl ?? '')
  const [contactEmail, setContactEmail] = useState(org.contactEmail ?? '')

  function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    updateOrganization(org.id, {
      name: name || org.name,
      description: description || undefined,
      type: type || undefined,
      websiteUrl: websiteUrl || undefined,
      contactEmail: contactEmail || undefined,
    })
    onSaved()
  }

  return (
    <form onSubmit={saveEdit} className="rounded-lg border p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="ename">Name</label><input id="ename" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} /></div>
      <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="etype">Type</label><input id="etype" value={type} onChange={(e) => setType(e.target.value)} className={inputCls} /></div>
      <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="edesc">Description</label><textarea id="edesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="eweb">Website</label><input id="eweb" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col gap-2"><label className="text-sm font-medium" htmlFor="eemail">Contact email</label><input id="eemail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} /></div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]">Save changes</Button>
        <Button type="button" size="sm" variant="destructive" onClick={onDeleted}>Delete organization</Button>
      </div>
    </form>
  )
}

function OrganizationDetailPageInner() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const data = useDemoData()
  const hydrated = useHydrated()
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('member')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const org = data.organizations.find((o) => o.slug === params.slug) ?? null
  const confs = org ? data.conferences.filter((c) => c.organizationId === org.id) : []

  if (!hydrated) return <p className="text-sm text-[#64748B]">Loading organization...</p>

  if (!org) {
    return (
      <div className="rounded-lg border p-6 flex flex-col gap-3">
        <h1 className="font-medium text-[#111827]">Organization not found</h1>
        <p className="text-sm text-[#64748B]">This organization does not exist in this browser&apos;s demo data. It may have been created on another device or browser.</p>
        <div><Button asChild><Link href="/organizations">Back to organizations</Link></Button></div>
      </div>
    )
  }

  function onDelete() {
    if (!org) return
    if (window.confirm(`Delete “${org.name}” and all its conferences and websites? This cannot be undone.`)) {
      deleteOrganization(org.id)
      router.push('/organizations')
    }
  }

  const members = data.members.filter((m) => m.organizationId === org.id)
  const pendingInvitations = data.invitations.filter((i) => i.organizationId === org.id && i.status === 'pending')
  const canManage = canManageOrganization(data, org.id)
  const canManageTeam = canManage

  async function onInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!org) return
    setInviteBusy(true)
    setInviteMessage(null)
    setInviteError(null)
    try {
      const result = await api<{ ok?: boolean; joined?: boolean; message?: string }>(`/api/organizations/${org.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      setInviteMessage(result.message || 'Invitation sent.')
      setInviteEmail('')
      await refreshData()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite member.')
    } finally {
      setInviteBusy(false)
    }
  }

  async function onRemoveMember(userId: string, label: string) {
    if (!org) return
    if (!window.confirm(`Remove ${label} from “${org.name}”?`)) return
    setRemovingId(userId)
    setInviteMessage(null)
    setInviteError(null)
    try {
      await api(`/api/organizations/${org.id}/members`, { method: 'DELETE', body: JSON.stringify({ userId }) })
      setInviteMessage(`${label} removed.`)
      await refreshData()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to remove member.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">{org.name}</h1>
          <p className="text-sm text-[#64748B]">{org.type ?? 'Organization'} · /organizations/{org.slug}{org.contactEmail ? ` · ${org.contactEmail}` : ''}</p>
          {org.description ? <p className="mt-2 max-w-2xl text-sm text-[#64748B]">{org.description}</p> : null}
          {org.websiteUrl ? <a href={org.websiteUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 underline underline-offset-4">{org.websiteUrl}</a> : null}
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>{editing ? 'Close edit' : 'Edit organization'}</Button>
            <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/organizations/${org.slug}/conferences/new`}>Create conference</Link></Button>
          </div>
        ) : (
          <span className="rounded-full border px-2.5 py-1 text-xs text-gray-600">You participate in this organization&apos;s events — organizer controls are hidden for your account</span>
        )}
      </header>

      {message ? <p className="rounded-md border bg-slate-50 px-3 py-2 text-sm">{message}</p> : null}

      {editing ? <EditOrgForm key={org.id} org={org} onSaved={() => { setEditing(false); setMessage('Organization updated.') }} onDeleted={onDelete} /> : null}

      <div className="rounded-lg border">
        <div className="border-b p-4"><h2 className="font-medium text-[#111827]">Conferences ({confs.length})</h2></div>
        <div className="divide-y">
          {confs.length > 0 ? confs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-medium text-[#111827]">{c.title}</p>
                <p className="text-sm text-[#64748B]">{c.status} · /events/{c.slug}</p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm"><Link href={`/organizations/${org.slug}/conferences/${c.slug}`}>Manage</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link href={`/organizations/${org.slug}/conferences/${c.slug}/website`}>Website editor</Link></Button>
                  {c.status === 'Published' ? <Button asChild size="sm"><Link href={`/events/${c.slug}`} target="_blank">Public site</Link></Button> : null}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm"><Link href={`/events/${c.slug}`}>View event</Link></Button>
                  {data.currentUser?.accountType === 'researcher' && c.status === 'Published' ? <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/events/${c.slug}/submit`}>Submit a paper</Link></Button> : null}
                </div>
              )}
            </div>
          )) : (
            <div className="flex flex-col gap-3 p-4">
              <p className="text-sm text-[#64748B]">No conferences yet for this organization.</p>
              {canManage ? <div><Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]"><Link href={`/organizations/${org.slug}/conferences/new`}>Create first conference</Link></Button></div> : null}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h2 className="font-medium text-[#111827]">Team ({members.length})</h2>
          <p className="text-sm text-[#64748B]">People who can manage this organization and its conferences.</p>
        </div>
        <div className="divide-y">
          {members.length > 0 ? members.map((m) => (
            <div key={`${m.organizationId}-${m.userId}`} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-medium text-[#111827]">{m.user?.displayName || m.user?.email || m.userId}</p>
                <p className="text-sm text-[#64748B]">{m.user?.email ?? ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize">{m.role}</span>
                {canManageTeam ? (
                  <Button type="button" variant="outline" size="sm" disabled={removingId === m.userId} onClick={() => void onRemoveMember(m.userId, m.user?.displayName || m.user?.email || m.userId)}>
                    {removingId === m.userId ? 'Removing...' : 'Remove'}
                  </Button>
                ) : null}
              </div>
            </div>
          )) : (
            <p className="p-4 text-sm text-[#64748B]">No team members yet.</p>
          )}
        </div>

        {pendingInvitations.length > 0 ? (
          <div className="border-t p-4">
            <h3 className="text-sm font-medium text-[#111827]">Pending invitations</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {pendingInvitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-[#111827]">{inv.email}</span>
                  <span className="text-xs text-[#64748B] capitalize">{inv.role} · pending{inv.expiresAt ? ` · expires ${new Date(inv.expiresAt).toLocaleDateString('en-GB')}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {canManageTeam ? (
          <form onSubmit={(e) => void onInvite(e)} className="flex flex-col gap-3 border-t p-4">
            <h3 className="text-sm font-medium text-[#111827]">Invite a team member</h3>
            <div className="flex flex-wrap gap-2">
              <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@example.org" className={`${inputCls} max-w-sm`} aria-label="Invite email" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)} className="rounded-md border px-3 py-2 text-sm" aria-label="Invite role">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
              <Button type="submit" size="sm" disabled={inviteBusy} className="bg-[#4F46E5] hover:bg-[#4338CA]">{inviteBusy ? 'Inviting...' : 'Invite'}</Button>
            </div>
            {inviteMessage ? <p className="text-sm text-emerald-700">{inviteMessage}</p> : null}
            {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
            <p className="text-xs text-[#64748B]">Management controls are shown based on your role, but hiding them is not security — the server enforces permissions on every request.</p>
          </form>
        ) : (
          <p className="border-t p-4 text-xs text-[#64748B]">Only organization owners and admins can invite or remove team members. Permissions are enforced by the server on every request.</p>
        )}
      </div>
    </div>
  )
}

export default function OrganizationDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading organization...</p>}>
      <OrganizationDetailPageInner />
    </Suspense>
  )
}
