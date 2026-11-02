'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

const inputCls = 'rounded-md border px-3 py-2 text-sm w-full'

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/dashboard'
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const hasNext = Boolean(searchParams.get('next')) && next !== '/dashboard' || searchParams.get('next') === '/dashboard'
  const registerHref = hasNext ? `/register?next=${encodeURIComponent(next)}` : '/register'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || `Sign-in failed (HTTP ${res.status}).`)
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('Could not reach the server. Is the app running?')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#4F46E5]">
            <span className="text-lg font-bold text-white">C</span>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Sign in to Confexa</h1>
        <p className="mt-2 text-sm text-gray-600">Enter your credentials to access your account</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
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
        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className={inputCls}
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full bg-[#4F46E5] hover:bg-[#4338CA]">
          {submitting ? 'Signing in...' : 'Sign in'}
        </Button>
        <div className="text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link href={registerHref} className="font-medium text-[#4F46E5] hover:underline">Sign up</Link>
        </div>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#64748B]">Loading sign-in...</p>}>
      <LoginForm />
    </Suspense>
  )
}
