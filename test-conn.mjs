import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

function loadEnv() {
  try {
    const env = readFileSync('.env.local', 'utf8')
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) {
        process.env[m[1].trim()] = m[2].trim()
      }
    }
  } catch {}
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.log('MISSING_ENV')
  process.exit(0)
}

const supabase = createClient(url, key)
const { data, error } = await supabase.from('organizations').select('id').limit(1)
console.log(error ? 'ERR:' + error.message : 'OK')
process.exit(0)
