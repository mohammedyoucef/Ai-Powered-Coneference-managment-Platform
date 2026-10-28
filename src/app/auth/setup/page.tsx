import { getMissingSupabaseEnv, isSupabaseConfigured } from '@/lib/supabase/config'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function SetupPage() {
  const configured = isSupabaseConfigured()
  const missing = getMissingSupabaseEnv()

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Supabase Setup Required</h1>
        <p className="text-sm text-muted-foreground">
          Configure environment variables to enable authentication and database features.
        </p>
      </header>
      <div className="rounded-lg border p-6 flex flex-col gap-4">
        <div>
          <p className="font-medium">Status</p>
          <p className="text-sm text-muted-foreground">
            {configured ? 'Configured' : 'Not configured'}
          </p>
        </div>
        {!configured && (
          <div>
            <p className="font-medium">Missing variables</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="font-medium">Next steps</p>
          <ol className="mt-2 list-decimal pl-5 text-sm text-muted-foreground flex flex-col gap-1">
            <li>Copy <code>.env.example</code> to <code>.env.local</code></li>
            <li>Add your Supabase project URL and anon key</li>
            <li>Apply the SQL migration in <code>supabase/migrations/</code></li>
            <li>Restart the dev server</li>
          </ol>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
