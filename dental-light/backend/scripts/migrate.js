// Applique uniquement les migrations en attente (mises à jour).
import '../src/config/env.js'
import pg from 'pg'
import { migrate } from '../src/db/migrate.js'

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try { await migrate(c) } finally { await c.end() }
