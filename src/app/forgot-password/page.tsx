'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

type ForgotResult = {
  message?: string
  emailConfigured?: boolean
  emailStatus?: string
  devResetPath?: string
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ForgotResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as ForgotResult & { error?: string }
      if (!res.ok) {
        setError(data.error || `Request failed (HTTP ${res.status}).`)
        return
      }
      setResult(data)
    } catch {
      setError('Could not reach the server. Is the app running?')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Forgot password</h1>
          <p className="mt-1 text-sm text-[#64748B]">Enter your account email and we will start a password reset if an account exists.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputCls}
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {result ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {result.message || 'If an account exists for that email, a password reset is available.'}
            </p>
            {result.devResetPath ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="font-medium">Local development only  this reset link was NOT emailed to you.</p>
                <p className="mt-1">Email is not configured on this local instance, so no message was sent. Use this link only on your own development machine:</p>
                <p className="mt-2">
                  <Link href={result.devResetPath} className="font-medium text-[#4F46E5] underline underline-offset-4">Open password reset link (local dev only)</Link>
                </p>
              </div>
            ) : result.emailConfigured === false || result.emailStatus === 'not_configured' ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Email is not configured on this instance (emailStatus: {result.emailStatus || 'not_configured'}), so a reset link cannot be emailed. Ask an administrator to configure email delivery.
              </p>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full bg-[#4F46E5] hover:bg-[#4338CA]">
          {submitting ? 'Sending...' : 'Request password reset'}
        </Button>
        <p className="text-sm text-[#64748B]">
          Remembered it?{' '}
          <Link href="/login" className="text-[#4F46E5] underline-offset-4 hover:underline">Back to sign in</Link>
        </p>
      </form>
    </div>
  )
}
