'use client'

import { createBrowserClient } from '@supabase/ssr'
import { isSupabaseConfigured, supabaseConfig } from './config'

export function createClient() {
  if (!isSupabaseConfigured() || !supabaseConfig.url || !supabaseConfig.anonKey) {
    throw new Error('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local')
  }
  return createBrowserClient(supabaseConfig.url, supabaseConfig.anonKey)
}
