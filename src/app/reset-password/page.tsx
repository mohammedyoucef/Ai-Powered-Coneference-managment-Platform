'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

function passwordChecks(password: string) {
  return [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(password) },
    { label: 'Contains a number', ok: /[0-9]/.test(password) },
  ]
}

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const checks = passwordChecks(password)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('This reset link is invalid or expired. Request a new one.')
      return
    }
    if (!checks.every((c) => c.ok)) {
      setError('Password must be 8+ characters with a letter and a number.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || `Password reset failed (HTTP ${res.status}).`)
        return
      }
      setDone(true)
    } catch {
      setError('Could not reach the server. Is the app running?')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <div className="flex flex-col gap-4 rounded-lg border p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Password updated</h1>
            <p className="mt-1 text-sm text-[#64748B]">Your password has been reset. Sign in with your new password.</p>
          </div>
          <Button asChild className="w-full bg-[#4F46E5] hover:bg-[#4338CA]">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Reset password</h1>
          <p className="mt-1 text-sm text-[#64748B]">Choose a new password for your Confexa account.</p>
        </div>
        {!token ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            This reset link is missing its token. Request a new link from the{' '}
            <Link href="/forgot-password" className="underline underline-offset-4">forgot password page</Link>.
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium">New password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          <ul className="flex flex-col gap-0.5 text-xs">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? 'text-emerald-700' : 'text-[#64748B]'}>
                {c.ok ? '✓' : '•'} {c.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputCls}
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <Button type="submit" disabled={submitting || !token} className="w-full bg-[#4F46E5] hover:bg-[#4338CA]">
          {submitting ? 'Resetting password...' : 'Reset password'}
        </Button>
        <p className="text-sm text-[#64748B]">
          Need a new link?{' '}
          <Link href="/forgot-password" className="text-[#4F46E5] underline-offset-4 hover:underline">Request another reset</Link>
        </p>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading password reset...</p>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
