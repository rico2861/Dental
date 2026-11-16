// Applique les migrations SQL de /db/migrations, dans l'ordre, une seule fois chacune.
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { config } from '../config/env.js'

export async function migrate(client, log = console.log) {
  await client.query('create table if not exists schema_migrations(name text primary key, applied_at timestamptz not null default now())')
  const files = fs.readdirSync(config.migrationsDir).filter(f => /^\d+_.+\.sql$/.test(f)).sort()
  const done = new Set((await client.query('select name from schema_migrations')).rows.map(r => r.name))
  let n = 0
  for (const f of files) {
    if (done.has(f)) continue
    await client.query('begin')
    try {
      await client.query(fs.readFileSync(path.join(config.migrationsDir, f), 'utf8'))
      await client.query('insert into schema_migrations(name) values($1)', [f])
      await client.query('commit')
    } catch (e) { await client.query('rollback'); throw new Error(`Migration ${f} échouée : ${e.message}`) }
    log('  ✔ migration appliquée :', f); n++
  }
  if (!n) log('  Base déjà à jour.')
  return n
}

export async function ensureOwner(client, email, password, log = console.log) {
  if ((await client.query("select 1 from users where role='OWNER'")).rowCount) { log('Propriétaire déjà créé.'); return false }
  if (!email || !password || password.length < 10) throw new Error('OWNER_EMAIL / OWNER_PASSWORD (10+ car.) requis')
  const { rows: [cl] } = await client.query("insert into clinics(name,address,phone) values('DENTAL LIGHT','Communauté de Saint-Marie, Canapé-Vert','+509 4418-9475') returning id")
  await client.query("insert into users(clinic_id,email,password_hash,first_name,last_name,role,must_change_password) values($1,$2,$3,'Propriétaire','DENTAL LIGHT','OWNER',true)",
    [cl.id, email.toLowerCase(), await bcrypt.hash(password, 12)])
  log('Clinique et propriétaire créés. Changement de mot de passe exigé à la 1re connexion.')
  return true
}
