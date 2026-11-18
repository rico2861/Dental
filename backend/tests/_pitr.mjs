// Vérification temporaire (sera supprimée).
import { spawn } from 'child_process'; import crypto from 'crypto'; import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url'
const here = path.dirname(fileURLToPath(import.meta.url)), PORT = 3997, T = d => fs.mkdtempSync(path.join(os.tmpdir(), d))
const env = { ...process.env, DB_DIR: T('dlui-db-'), STORAGE_DIR: T('dlui-st-'), BACKUP_DIR: T('dlui-bk-'), OWNER_EMAIL: 'owner@test.com', OWNER_PASSWORD: 'Temp#Passw0rd2026', REQUIRE_2FA: 'false', PORT: String(PORT), NODE_ENV: 'test', SUPABASE_DB_URL: '', SUPABASE_SERVICE_KEY: '', JWT_SECRET: crypto.randomBytes(48).toString('hex') }
const OUT = T('dlui-shots-'); let srv
const start = async () => { srv = spawn(process.execPath, [path.join(here, '../src/server.js')], { env, stdio: 'ignore' }); for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return } catch {} await new Promise(r => setTimeout(r, 250)) } }
const stop = () => new Promise(r => { srv.on('exit', r); srv.kill('SIGTERM') })
await start(); await stop(); await start()
const B = `http://localhost:${PORT}/api`
const mk = () => { let ck = ''; const f = async (m, p, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) } }; f.ck = () => ck; return f }
const o = mk(); await o('POST', '/login', { email: 'owner@test.com', password: 'Temp#Passw0rd2026' }); await o('POST', '/change-password', { current: 'Temp#Passw0rd2026', next: 'NouveauMdp#2026a' })
const P = n => ({ last_name: n, first_name: 'Test', phone: '3700' + String(n.length).padStart(4, '1'), address: 'Delmas', emergency_contact: 'Marie', emergency_phone: '3700000', sex: 'F', birth_date: '1990-03-15', has_allergy: 'no' })
const names = async () => { const r = (await o('GET', '/patients')).j; return (r.patients || r.rows || r).map(p => p.last_name).sort().join(',') }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const MIR = T('dlui-st-mirror-')
console.log('réglages + miroir :', (await o('POST', '/backups/settings', { mirror_dir: MIR, log_minutes: 15, diff_hours: 6 })).s, (await o('POST', '/backups/settings', { mirror_dir: 'relatif' })).j.error)
const f1 = (await o('POST', '/backups', { type: 'complete' })).j; console.log('complète :', f1.type, 'lsn', f1.lsn, 'chaîne', f1.epoch, 'miroir', f1.mirror?.ok, f1.error || '')
const lg0 = (await o('POST', '/backups', { type: 'journal' })).j; console.log('journal sans changement :', lg0.skipped)
const A = (await o('POST', '/patients', P('Alpha'))).j; await sleep(300)
const l1 = (await o('POST', '/backups', { type: 'journal' })).j; console.log('journal 1 :', l1.count, 'transaction(s)', JSON.stringify(l1.per_table), 'miroir', l1.mirror?.ok)
await o('POST', '/patients', P('Beta'))
const d1 = (await o('POST', '/backups', { type: 'differentielle' })).j; console.log('différentielle :', d1.rows, 'ligne(s) modifiée(s),', d1.tables, 'table(s)', d1.error || '')
await sleep(1200); const TT = new Date().toISOString(); await sleep(1200)
await o('POST', '/patients', P('Gamma')); await o('POST', `/patients/${A.id}/update`, { ...P('Alpha'), phone: '38889999' })
const l2 = (await o('POST', '/backups', { type: 'journal' })).j; console.log('journal 2 :', l2.count, 'transaction(s)')
await o('POST', '/patients', P('Delta'))   // reste dans le journal actif (non exporté)
console.log('avant restauration :', await names())
const pl = (await o('GET', '/backups/plan?at=' + encodeURIComponent(TT))).j; console.log('plan :', JSON.stringify({ ok: pl.ok, full: !!pl.full, diff: !!pl.diff, logs: pl.logs?.length, live: pl.live, sessions: pl.sessions?.length, err: pl.error }))
const bad = await o('POST', '/backups/pitr', { at: TT, password: 'x', confirm: 'RESTAURER' }); console.log('mauvais mot de passe :', bad.s, bad.j.error)
const r = await o('POST', '/backups/pitr', { at: TT, password: 'NouveauMdp#2026a', confirm: 'RESTAURER' }); console.log('PITR :', r.s, JSON.stringify(r.j))
const o2 = mk(); await o2('POST', '/login', { email: 'owner@test.com', password: 'NouveauMdp#2026a' }); Object.assign(globalThis, { o2 })
const n2 = await (async () => { const x = (await o2('GET', '/patients')).j; return (x.patients || x.rows || x) })(); console.log('après restauration à T :', n2.map(p => p.last_name).sort().join(','), '| tél Alpha :', JSON.stringify((await o2('GET', '/patients/' + A.id + '/summary')).j.patient?.phone))
const st = (await o2('GET', '/backups')).j.strategy; console.log('stratégie :', JSON.stringify({ epoch: st.epoch, full: !!st.full, logs: st.logs, pending: st.pending, rpo: st.rpo, mirror: st.mirror?.ok, same: st.mirror?.same_disk, advice: st.advice.map(a => a.tone) }))
await o2('POST', '/patients', P('Epsilon')); const l3 = (await o2('POST', '/backups', { type: 'journal' })).j; console.log('nouvelle chaîne, journal :', l3.count, 'transaction(s)', l3.epoch)
// restauration « en avant » : revenir à l'état d'avant la restauration (journaux de l'ancienne chaîne)
await sleep(1500); const T2 = new Date().toISOString(); await sleep(1500)
const v1 = (await o2('POST', '/backups/' + f1.id + '/verify', {})).j; console.log('vérification complète :', v1.ok, v1.checks.map(c => (c[1] ? '✓ ' : '✗ ') + c[0]).join(' | '))
const v2 = (await o2('POST', '/backups/' + l1.id + '/verify', {})).j; console.log('vérification journal :', v2.ok, JSON.stringify(v2.checks))
const ins = (await o2('GET', '/backups/' + f1.id + '/inspect')).j; console.log('contenu :', ins.files_total, 'fichier(s),', ins.dependents.length, 'élément(s) dépendants; en-tête lsn', ins.header.lsn)
const ig = (await o2('POST', '/backups/integrity', {})).j; console.log('intégrité :', ig.ok, ig.tables.length, 'tables,', ig.fks, 'liens vérifiés,', ig.orphans.length, 'orphelin(s)', ig.ms + ' ms')
const pa = (await o2('POST', '/backups', { type: 'partielle' })).j; console.log('partielle :', pa.type, pa.partial, pa.files, 'document(s)')
// restauration partielle : seulement la table patients, à l'instant T2
await o2('POST', '/patients', P('Zeta'))
const rp = await o2('POST', '/backups/pitr', { at: T2, tables: ['patients'], password: 'NouveauMdp#2026a', confirm: 'RESTAURER' }); console.log('restauration partielle :', rp.s, rp.j.tables, 'table', rp.j.error || '')
const o3 = mk(); await o3('POST', '/login', { email: 'owner@test.com', password: 'NouveauMdp#2026a' }); const n3 = (await o3('GET', '/patients')).j; console.log('après partielle :', (n3.patients || n3.rows || n3).map(p => p.last_name).sort().join(','))
console.log('miroir :', fs.readdirSync(MIR).join(', ').slice(0, 200))
const jr = (await o3('GET', '/backups')).j.journal.slice(0, 12).map(j => j.op + (j.ok ? '' : '✗')).join(' '); console.log('journal ops :', jr)
await stop()
for (const x of fs.readdirSync(os.tmpdir()).filter(x => /^dlui-(db|st|bk)-/.test(x))) try { fs.rmSync(path.join(os.tmpdir(), x), { recursive: true, force: true }) } catch {}
process.exit(0)
