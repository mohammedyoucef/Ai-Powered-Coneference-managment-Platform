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
const checks = []
const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id').limit(1)
checks.push(orgErr ? 'orgs:ERR' : 'orgs:OK')
const { data: profs, error: profErr } = await supabase.from('profiles').select('id').limit(1)
checks.push(profErr ? 'profiles:ERR' : 'profiles:OK')
const { data: mems, error: memErr } = await supabase.from('organization_members').select('organization_id').limit(1)
checks.push(memErr ? 'members:ERR' : 'members:OK')
const { data: confs, error: confErr } = await supabase.from('conferences').select('id').limit(1)
checks.push(confErr ? 'confs:ERR' : 'confs:OK')
console.log(checks.join(' | '))
process.exit(0)
