// Lanceur des tests d'intégration.
// Usage : TEST_DATABASE_URL=postgres://…/dental_light_test npm test
// ATTENTION : la base de test est VIDÉE (schéma public recréé). Son nom doit contenir « test ».
import '../src/config/env.js'
import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { migrate, ensureOwner } from '../src/db/migrate.js'

const url = process.env.TEST_DATABASE_URL
if (!url) { console.error('TEST_DATABASE_URL requis (base dédiée aux tests, ex. dental_light_test).'); process.exit(2) }
if (!/test/i.test(url) && process.env.TEST_ALLOW_WIPE !== '1') { console.error('Refus : le nom de la base de test doit contenir « test » (ou TEST_ALLOW_WIPE=1).'); process.exit(2) }

const here = path.dirname(fileURLToPath(import.meta.url)), PORT = 3999
const c = new pg.Client({ connectionString: url }); await c.connect()
await c.query('drop schema public cascade; create schema public')
await migrate(c, () => {})
await ensureOwner(c, 'owner@test.com', 'Temp#Passw0rd2026', () => {})
await c.query('update clinics set require_2fa=false'); await c.end()

const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'dlstore-'))
const server = spawn(process.execPath, [path.join(here, '../src/server.js')], {
  env: { ...process.env, DATABASE_URL: url, PORT: String(PORT), STORAGE_DIR: storage, NODE_ENV: 'test', JWT_SECRET: crypto.randomBytes(48).toString('hex') }, stdio: ['ignore', 'inherit', 'inherit'] })
const stop = () => { server.kill('SIGTERM'); fs.rmSync(storage, { recursive: true, force: true }) }

let up = false
for (let i = 0; i < 50 && !up; i++) { try { up = (await fetch(`http://localhost:${PORT}/api/health`)).ok } catch {} if (!up) await new Promise(r => setTimeout(r, 200)) }
if (!up) { console.error('Le serveur de test ne démarre pas.'); stop(); process.exit(1) }

let failed = 0
for (const f of ['test.mjs', 'test2.mjs', 'test3.mjs', 'test4.mjs']) {
  console.log(`\n══ ${f} ══`)
  // Les scripts n'utilisent pas de code de sortie : on compte les lignes « FAIL ».
  const code = await new Promise(r => {
    const ch = spawn(process.execPath, [path.join(here, f)], { stdio: ['ignore', 'pipe', 'inherit'] }); let out = '', bad = 0
    ch.stdout.on('data', d => { process.stdout.write(d); out += d; const ls = out.split('\n'); out = ls.pop(); bad += ls.filter(l => l.startsWith('FAIL')).length })
    ch.on('exit', c => r(c || bad ? 1 : 0)) })
  if (code) failed++
}
stop(); console.log(failed ? `\n${failed} fichier(s) de test en échec` : '\nTous les tests sont passés'); process.exit(failed ? 1 : 0)
