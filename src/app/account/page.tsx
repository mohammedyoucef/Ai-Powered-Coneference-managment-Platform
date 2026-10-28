import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { Suspense } from 'react'

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl py-12 text-sm text-muted-foreground">Loading...</div>}>
      <AccountContent />
    </Suspense>
  )
}

async function AccountContent() {
  if (!isSupabaseConfigured()) {
    redirect('/auth/setup')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile.</p>
      </header>
      <div className="rounded-lg border p-6 flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">Email</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div>
          <p className="text-sm font-medium">Display name</p>
          <p className="text-sm text-muted-foreground">{profile?.display_name || 'Not set'}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/organizations">Organizations</Link>
          </Button>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </div>
      </div>
    </div>
  )
}

