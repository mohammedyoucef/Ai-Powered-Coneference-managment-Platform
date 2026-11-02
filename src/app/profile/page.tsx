'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  clearAISettings,
  getAISettings,
  saveAISettings,
  DEFAULT_META_ENDPOINT,
  DEFAULT_META_MODEL,
} from '@/lib/demo/profile'
import { ACCOUNT_TYPE_META, type AccountType, type UserProfile } from '@/lib/demo/types'
import { Avatar } from '@/components/ui/avatar'
import { imageFileToDataUrl } from '@/lib/demo/image-file'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

type MeUser = {
  id: string
  email: string
  displayName: string
  affiliation?: string
  bio?: string
  profile?: UserProfile
  profileCompleted?: boolean
  platformRole: 'platform_admin' | 'user'
  accountType: AccountType
  createdAt?: string
}

function AccountSection() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<MeUser | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [affiliation, setAffiliation] = useState('')
  const [bio, setBio] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('researcher')
  const [position, setPosition] = useState('')
  const [contact, setContact] = useState('')
  const [expertise, setExpertise] = useState('')
  const [researchInterests, setResearchInterests] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [orcid, setOrcid] = useState('')
  const [attendeeInfo, setAttendeeInfo] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)

  function fillProfile(u: MeUser) {
    setAccountType(u.accountType || 'researcher')
    const p = u.profile || {}
    setAvatarUrl(p.avatarUrl || '')
    setPosition(p.position || '')
    setContact(p.contact || '')
    setExpertise((p.expertise || []).join(', '))
    setResearchInterests((p.researchInterests || []).join(', '))
    setQualifications(p.qualifications || '')
    setOrcid(p.orcid || '')
    setAttendeeInfo(p.attendeeInfo || '')
  }
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { user?: MeUser | null; error?: string }
        if (cancelled) return
        if (!res.ok) {
          setLoadError(data.error || `Could not load your account (HTTP ${res.status}).`)
          return
        }
        if (data.user) {
          setUser(data.user)
          setDisplayName(data.user.displayName || '')
          setAffiliation(data.user.affiliation || '')
          setBio(data.user.bio || '')
          fillProfile(data.user)
        } else {
          setUser(null)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not reach the server. Is the app running?')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(null)
    setSaving(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          affiliation: affiliation.trim(),
          bio: bio.trim(),
          profile: {
            avatarUrl: avatarUrl || '',
            position: position.trim() || undefined,
            contact: contact.trim() || undefined,
            expertise: expertise.split(',').map((s) => s.trim()).filter(Boolean),
            researchInterests: researchInterests.split(',').map((s) => s.trim()).filter(Boolean),
            qualifications: qualifications.trim() || undefined,
            orcid: orcid.trim() || undefined,
            attendeeInfo: attendeeInfo.trim() || undefined,
          },
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { user?: MeUser; error?: string }
      if (!res.ok) {
        setError(data.error || `Could not save your profile (HTTP ${res.status}).`)
        return
      }
      if (data.user) {
        setUser(data.user)
        setDisplayName(data.user.displayName || '')
        setAffiliation(data.user.affiliation || '')
        setBio(data.user.bio || '')
        fillProfile(data.user)
      }
      setSaved('Profile saved.')
      router.refresh()
    } catch {
      setError('Could not reach the server. Is the app running?')
    } finally {
      setSaving(false)
    }
  }

  async function signOut() {
    setError(null)
    setSigningOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
      router.push('/login')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border p-6">
        <p className="text-sm text-[#64748B]">Loading profile...</p>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="rounded-lg border p-6">
        <h2 className="font-medium text-[#111827]">Account</h2>
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="flex flex-col gap-4 rounded-lg border p-6">
        <div>
          <h2 className="font-medium text-[#111827]">Account</h2>
          <p className="mt-1 text-sm text-[#64748B]">You are not signed in. Sign in or create an account to edit your profile.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]">
            <Link href="/login?next=/profile">Sign in</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/register?next=/profile">Create account</Link>
          </Button>
        </div>
      </section>
    )
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-lg border p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-[#111827]">Account</h2>
          <p className="mt-1 text-sm text-[#64748B]">Your real Confexa account, as stored on the server.</p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-[#4F46E5]">
            {ACCOUNT_TYPE_META[user.accountType || 'researcher'].label}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${user.platformRole === 'platform_admin' ? 'border-[#4F46E5] bg-indigo-50 text-[#4F46E5]' : 'border-slate-300 bg-slate-50 text-[#64748B]'}`}>
            {user.platformRole === 'platform_admin' ? 'Platform admin' : 'User'}
          </span>
        </span>
      </div>

      <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-[#475569]">
        Primary account type: <span className="font-medium text-[#111827]">{ACCOUNT_TYPE_META[accountType].label}</span> — fixed at registration so permissions cannot be changed from Profile.
        {user.profileCompleted ? null : <span className="block text-amber-700">Your profile is incomplete: add the required fields for your account type below.</span>}
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={displayName || user.displayName} url={avatarUrl || undefined} size={64} />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Profile picture</span>
          <span className="text-xs text-gray-500">Shown in the header, directories, and on event pages that feature you. Resized automatically.</span>
          <div className="mt-1 flex gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-gray-50">
              {avatarUrl ? 'Replace photo' : 'Upload photo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try { setAvatarUrl(await imageFileToDataUrl(file, 256)) } catch (err) { setError(err instanceof Error ? err.message : 'Could not process that image.') }
                }}
              />
            </label>
            {avatarUrl ? <Button type="button" size="sm" variant="ghost" onClick={() => setAvatarUrl('')}>Remove</Button> : null}
          </div>
        </div>
      </div>
      {accountType === 'organizer' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2"><label htmlFor="position" className="text-sm font-medium">Position / role</label><input id="position" value={position} onChange={(e) => setPosition(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-2"><label htmlFor="contact" className="text-sm font-medium">Contact</label><input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} /></div>
        </div>
      ) : null}
      {accountType === 'reviewer' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2"><label htmlFor="expertise" className="text-sm font-medium">Areas of expertise (comma separated)</label><input id="expertise" value={expertise} onChange={(e) => setExpertise(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-2"><label htmlFor="qualifications" className="text-sm font-medium">Qualifications / experience</label><textarea id="qualifications" value={qualifications} onChange={(e) => setQualifications(e.target.value)} rows={2} className={inputCls} /></div>
        </div>
      ) : null}
      {accountType === 'reviewer' || accountType === 'researcher' ? (
        <div className="flex flex-col gap-2"><label htmlFor="researchInterests" className="text-sm font-medium">Research interests (comma separated)</label><input id="researchInterests" value={researchInterests} onChange={(e) => setResearchInterests(e.target.value)} className={inputCls} /></div>
      ) : null}
      {accountType === 'researcher' ? (
        <div className="flex flex-col gap-2"><label htmlFor="orcid" className="text-sm font-medium">ORCID</label><input id="orcid" value={orcid} onChange={(e) => setOrcid(e.target.value)} className={inputCls} /></div>
      ) : null}
      {accountType === 'visitor' ? (
        <div className="flex flex-col gap-2"><label htmlFor="attendeeInfo" className="text-sm font-medium">Attendee information</label><textarea id="attendeeInfo" value={attendeeInfo} onChange={(e) => setAttendeeInfo(e.target.value)} rows={2} className={inputCls} /></div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="displayName" className="text-sm font-medium">Display name</label>
        <input id="displayName" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Dr. Amine Cherif" className={inputCls} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input id="email" value={user.email} readOnly disabled className={`${inputCls} bg-slate-50 text-[#64748B]`} />
        <span className="text-xs text-[#64748B]">Email cannot be changed here.</span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="affiliation" className="text-sm font-medium">Affiliation</label>
        <input id="affiliation" value={affiliation} onChange={(e) => setAffiliation(e.target.value)} placeholder="e.g. University of Tunis" className={inputCls} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="bio" className="text-sm font-medium">Bio</label>
        <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Short biography" className={inputCls} />
      </div>

      {user.createdAt ? (
        <p className="text-xs text-[#64748B]">Account created {new Date(user.createdAt).toLocaleDateString()}</p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {saved ? <p role="status" className="text-sm text-emerald-700">{saved}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={saving} className="bg-[#4F46E5] hover:bg-[#4338CA]">
          {saving ? 'Saving...' : 'Save profile'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={signingOut} onClick={signOut}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </Button>
      </div>
    </form>
  )
}

function AISettingsForm() {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_META_MODEL)
  const [endpoint, setEndpoint] = useState(DEFAULT_META_ENDPOINT)
  const [imageModel, setImageModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; source?: string } | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    const stored = getAISettings()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-held AI settings on mount
    setApiKey(stored.apiKey)
    setModel(stored.model || DEFAULT_META_MODEL)
    setEndpoint(stored.endpoint || DEFAULT_META_ENDPOINT)
    setImageModel(stored.imageModel || '')
  }, [])

  function currentSettings() {
    return {
      apiKey: apiKey.trim(),
      model: model.trim() || DEFAULT_META_MODEL,
      endpoint: endpoint.trim() || DEFAULT_META_ENDPOINT,
      imageModel: imageModel.trim(),
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    saveAISettings(currentSettings())
    setSaved('AI settings saved in this browser only.')
    setTestResult(null)
  }

  async function test() {
    saveAISettings(currentSettings())
    setTesting(true)
    setTestResult(null)
    try {
      const stored = getAISettings()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (stored.apiKey) headers['x-meta-api-key'] = stored.apiKey
      if (stored.model) headers['x-meta-model'] = stored.model
      if (stored.endpoint) headers['x-meta-endpoint'] = stored.endpoint
      if (stored.imageModel) headers['x-meta-image-model'] = stored.imageModel
      const res = await fetch('/api/ai/test-connection', { method: 'POST', headers })
      const raw = await res.text()
      let data: { ok?: unknown; message?: unknown; error?: unknown; source?: unknown } = {}
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {}
      } catch {
        data = {}
      }
      const serverMessage = typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : null
      setTestResult({
        ok: Boolean(data.ok),
        message: serverMessage || `The server replied with HTTP ${res.status} and no details. Restart the app (npm run dev) so the latest API routes are running, then test again.`,
        source: data.source as string,
      })
    } catch {
      setTestResult({ ok: false, message: 'Could not reach the Confexa API route. Is the app running?' })
    } finally {
      setTesting(false)
    }
  }

  function clear() {
    clearAISettings()
    setApiKey('')
    setModel(DEFAULT_META_MODEL)
    setEndpoint(DEFAULT_META_ENDPOINT)
    setImageModel('')
    setTestResult(null)
    setSaved('AI key cleared. The labeled deterministic fallback is active.')
  }

  return (
    <form onSubmit={save} className="rounded-lg border p-6 flex flex-col gap-4">
      <div>
        <h2 className="font-medium text-[#111827]">Meta model API</h2>
        <p className="text-sm text-[#64748B]">Connect your own Meta model key to enable real AI landing-page generation, natural-language edits, and content-based AI paper reviews. Without a key, a clearly labeled deterministic fallback is used.</p>
      </div>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Demo-grade storage: your key is kept only in this browser&apos;s localStorage and sent only to this app&apos;s own API routes, which forward it to Meta. It is never stored on a server. Prefer a key scoped for this purpose, and clear it on shared machines.
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="apiKey" className="text-sm font-medium">API key</label>
        <div className="flex gap-2">
          <input id="apiKey" type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your Meta model API key" autoComplete="off" className={inputCls} />
          <Button type="button" variant="outline" size="sm" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="model" className="text-sm font-medium">Model</label>
          <input id="model" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="endpoint" className="text-sm font-medium">Endpoint</label>
          <input id="endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="imageModel" className="text-sm font-medium">AI image generation model (optional)</label>
          <input id="imageModel" value={imageModel} onChange={(e) => setImageModel(e.target.value)} placeholder="Leave empty to use the model above" className={inputCls} />
          <span className="text-xs text-[#64748B]">Used only when you choose “AI-generated” images in the website builder. It must be an image-capable Meta model available to your key; if the model rejects image generation, the exact Meta error is shown and stock photos are offered instead. Your text model may not support images.</span>
        </div>
      </div>
      {testResult ? (
        <p className={`rounded-md border px-3 py-2 text-sm ${testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {testResult.ok ? 'Connected: ' : 'Not connected: '}{testResult.message}{testResult.source ? ` (source: ${testResult.source})` : ''}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-emerald-700">{saved}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="bg-[#4F46E5] hover:bg-[#4338CA]">Save AI settings</Button>
        <Button type="button" size="sm" variant="outline" disabled={testing || !apiKey.trim()} onClick={test}>{testing ? 'Testing...' : 'Test connection'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={clear}>Clear key</Button>
      </div>
      <p className="text-xs text-[#64748B]">Status is also shown on the <Link href="/dashboard" className="underline underline-offset-4">dashboard</Link>. When generation falls back, the UI says so explicitly — fallback output is never presented as real AI.</p>
    </form>
  )
}

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Profile & Settings</h1>
        <p className="text-sm text-gray-600">Manage your account information and preferences.</p>
      </header>
      <AccountSection />
      <AISettingsForm />
    </div>
  )
}
