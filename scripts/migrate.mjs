// Apply db/migrations/*.sql to DATABASE_URL (PostgreSQL).
// Usage: DATABASE_URL=postgres://... npm run db:migrate
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local or export it.')
  process.exit(1)
}
const dir = path.join(process.cwd(), 'db', 'migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const client = new pg.Client({ connectionString: url, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined })
await client.connect()
for (const file of files) {
  console.log(`Applying ${file}...`)
  await client.query(readFileSync(path.join(dir, file), 'utf8'))
}
await client.end()
console.log('Migrations applied:', files.join(', '))
