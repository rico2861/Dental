// Installation initiale : migrations + clinique + compte propriétaire.
import '../src/config/env.js'
import pg from 'pg'
import { migrate, ensureOwner } from '../src/db/migrate.js'

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  console.log('Migrations…'); await migrate(c)
  await ensureOwner(c, process.env.OWNER_EMAIL, process.env.OWNER_PASSWORD)
} finally { await c.end() }
