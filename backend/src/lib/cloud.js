// ═══ Synchronisation et sauvegarde en ligne : Supabase (PostgreSQL) ═══
// Configuré dans le code / .env (SUPABASE_DB_URL), jamais depuis l'interface.
// L'application reste 100 % locale ; dès qu'Internet est disponible, elle recopie automatiquement dans Supabase :
//   1. toutes les tables (schéma « dental_light »), en n'envoyant que les lignes nouvelles ou modifiées ;
//   2. les documents et radiographies (table dental_light.dl_files) ;
//   3. les sauvegardes complètes vérifiées (table dental_light.dl_backups), récupérables depuis l'application.
// Connexion : adresse directe (IPv6) puis, si elle échoue, pooler de session (IPv4, 5432) et de transaction (6543).
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { config } from '../config/env.js'
import { BDIR, readJson, journal } from './backup-restore.js'
import { listBackups, createBackup } from './backup.js'
import { q } from '../db/pool.js'

const SCHEMA = 'dental_light', PART = 8 * 1024 * 1024
const STATE = () => path.join(BDIR(), 'cloud-etat.json'), CACHE = () => path.join(BDIR(), 'cloud-sync.json')
const sha = b => crypto.createHash('sha256').update(b).digest('hex')
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o), { mode: 0o600 }) }
const qi = s => '"' + String(s).replace(/"/g, '""') + '"'
const env = () => ({ url: process.env.SUPABASE_DB_URL || '', enabled: (process.env.SUPABASE_SYNC || 'on') !== 'off', keep: Math.max(1, parseInt(process.env.SUPABASE_KEEP_BACKUPS) || 10), fresh_hours: Math.max(1, parseInt(process.env.SUPABASE_FRESH_HOURS) || 6), region: process.env.SUPABASE_REGION || '' })
export const cloudState = () => ({ online: null, last_check: null, last_sync: null, last_error: null, hint: null, uploading: null, via: null, tables: null, rows_sent: null, ...readJson(STATE(), {}) })
const setState = p => writeJson(STATE(), { ...cloudState(), ...p })
export const configured = () => !!env().url
export const publicCloud = () => { const e = env(); let host = ''; try { host = new URL(e.url).hostname } catch {} return { configured: !!e.url, enabled: e.enabled, host, keep: e.keep, fresh_hours: e.fresh_hours, schema: SCHEMA, source: '.env (SUPABASE_DB_URL)' } }

// ── connexion : directe, puis poolers Supabase (IPv4) ; l'adresse qui fonctionne est retenue ──
const REGIONS = ['us-west-2', 'us-east-1', 'us-east-2', 'us-west-1', 'ca-central-1', 'sa-east-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2', 'eu-north-1', 'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2']
function candidates(e) { const u = new URL(e.url), pass = decodeURIComponent(u.password), db = u.pathname.slice(1) || 'postgres', user = decodeURIComponent(u.username) || 'postgres'
  const out = [{ label: 'connexion directe', host: u.hostname, port: Number(u.port) || 5432, user, password: pass, database: db }]
  const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)
  if (m) { const regs = e.region ? [e.region] : REGIONS, saved = readJson(CACHE(), {}).via
    for (const r of regs) for (const pfx of ['aws-0', 'aws-1']) for (const [port, mode] of [[5432, 'pooler de session'], [6543, 'pooler de transaction']]) out.push({ label: `${mode} ${r}`, host: `${pfx}-${r}.pooler.supabase.com`, port, user: `postgres.${m[1]}`, password: pass, database: db })
    if (saved) out.sort((a, b) => (b.host === saved.host && b.port === saved.port) - (a.host === saved.host && a.port === saved.port)) }
  return out }
let fake = null
async function connect() {
  if (process.env.CLOUD_FAKE_PG) { const { PGlite } = await import('@electric-sql/pglite'); fake ||= new PGlite(process.env.CLOUD_FAKE_PG); if (process.env.CLOUD_FAKE_OFFLINE && fs.existsSync(process.env.CLOUD_FAKE_OFFLINE)) throw Object.assign(new Error('Pas de connexion Internet'), { code: 'ENOTFOUND' }); return { query: (t, p) => fake.query(t, p), end: async () => {}, via: { label: 'base de test', host: 'local' } } }
  const pg = (await import('pg')).default, e = env(), errs = [], cands = candidates(e)
  const tryOne = c => new Promise((resolve, reject) => { const cl = new pg.Client({ ...c, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 7000, statement_timeout: 120000, application_name: 'dental-light' })
    cl.connect().then(() => resolve({ cl, c }), err => { errs.push({ c, code: err.code, msg: err.message }); cl.end().catch(() => {}); reject(err) }) })
  const done = ({ cl, c }) => { const via = { label: c.label, host: c.host, port: c.port }; const cache = readJson(CACHE(), {}); cache.via = via; writeJson(CACHE(), cache); return { query: (t, p) => cl.query(t, p), end: () => cl.end(), via } }
  // 1) adresse retenue lors de la dernière connexion réussie, ou adresse directe
  try { return done(await tryOne(cands[0])) } catch (err) { if (/password authentication failed/i.test(err.message)) throw Object.assign(new Error('Mot de passe Supabase refusé : vérifiez SUPABASE_DB_URL dans backend/.env (caractères spéciaux encodés : @ → %40, # → %23)'), { auth: true }) }
  // 2) toutes les autres adresses (poolers IPv4) essayées en même temps : la première qui répond est gardée
  const rest = cands.slice(1); if (rest.length) { const tries = rest.map(tryOne)
    try { const win = await Promise.any(tries); Promise.allSettled(tries).then(rs => rs.forEach(x => x.status === 'fulfilled' && x.value.cl !== win.cl && x.value.cl.end().catch(() => {}))); return done(win) }
    catch { if (errs.some(x => /password authentication failed/i.test(x.msg))) throw Object.assign(new Error('Mot de passe Supabase refusé : vérifiez SUPABASE_DB_URL dans backend/.env'), { auth: true }) } }
  errs.sort((x, y) => (y.c === cands[0]) - (x.c === cands[0]))
  const direct = errs[0], allTimeout = errs.slice(1).every(x => /timeout|ETIMEDOUT/i.test(x.code || x.msg))
  const hint = direct && /ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH/.test(direct.code || '') && allTimeout ? "Connexion directe impossible (réseau sans IPv6) et ports 5432/6543 fermés vers les poolers : ouvrez ces ports sur le pare-feu / le routeur, ou activez l'option IPv4 de Supabase (Settings → Add-ons), ou indiquez l'adresse du Session pooler dans SUPABASE_DB_URL."
    : direct && /ENOTFOUND|EAI_AGAIN/.test(direct.code || '') ? 'Pas de connexion Internet (ou adresse Supabase inconnue)' : 'Supabase injoignable : ' + (direct?.msg || 'erreur inconnue')
  throw Object.assign(new Error(hint), { offline: true, details: errs.slice(0, 4).map(x => `${x.c.label} : ${x.code || x.msg}`) }) }

// ── schéma distant : chaque table locale est recréée dans dental_light (colonnes et clé primaire), sans contraintes ──
const SKIP = new Set(['schema_migrations'])
async function localTables() {
  const t = (await q("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name")).rows.map(r => r.table_name).filter(n => !SKIP.has(n))
  const out = []; for (const name of t) {
    const cols = (await q("select a.attname col, format_type(a.atttypid, a.atttypmod) typ from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1 and a.attnum>0 and not a.attisdropped order by a.attnum", [name])).rows
    const pk = (await q("select a.attname col from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=any(i.indkey) where n.nspname='public' and c.relname=$1 and i.indisprimary order by array_position(i.indkey, a.attnum)", [name])).rows.map(r => r.col)
    out.push({ name, cols, pk }) }
  return out }
async function ensureSchema(r, tables) {
  await r.query(`create schema if not exists ${SCHEMA}`)
  for (const t of tables) {
    await r.query(`create table if not exists ${SCHEMA}.${qi(t.name)} (${t.cols.map(c => `${qi(c.col)} ${c.typ}`).join(', ')}${t.pk.length ? `, primary key (${t.pk.map(qi).join(', ')})` : ''})`)
    for (const c of t.cols) await r.query(`alter table ${SCHEMA}.${qi(t.name)} add column if not exists ${qi(c.col)} ${c.typ}`) }
  await r.query(`create table if not exists ${SCHEMA}.dl_files (path text primary key, size bigint, sha256 text, data bytea, updated_at timestamptz default now())`)
  await r.query(`create table if not exists ${SCHEMA}.dl_backups (id text not null, part int not null, data bytea not null, meta jsonb, uploaded_at timestamptz default now(), primary key (id, part))`)
  await r.query(`create table if not exists ${SCHEMA}.dl_sync (clinic text primary key, last_sync timestamptz, tables int, rows bigint, app_version text)`) }

// ── données : seules les lignes nouvelles ou modifiées sont envoyées (empreinte par ligne, gardée localement) ──
const val = v => v === null || v === undefined ? null : Buffer.isBuffer(v) || v instanceof Uint8Array ? Buffer.from(v) : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v : typeof v === 'object' ? JSON.stringify(v) : v
async function syncTable(r, t, cache) {
  const rows = (await q(`select * from ${qi(t.name)}`)).rows, key = row => t.pk.length ? t.pk.map(k => String(row[k])).join('\u0001') : sha(JSON.stringify(row))
  let prev = cache[t.name] || {}; const next = {}, changed = []
  if (Object.keys(prev).length && t.pk.length && !(await r.query(`select exists(select 1 from ${SCHEMA}.${qi(t.name)}) e`)).rows[0].e) prev = {}   // table vidée côté Supabase : tout renvoyer
  for (const row of rows) { const k = key(row), h = sha(JSON.stringify(row, (_, v) => typeof v === 'bigint' ? v.toString() : v)); next[k] = h; if (prev[k] !== h) changed.push(row) }
  const removed = Object.keys(prev).filter(k => !(k in next))
  const cols = t.cols.map(c => c.col), casts = t.cols.map(c => c.typ)
  for (let i = 0; i < changed.length; i += 200) { const chunk = changed.slice(i, i + 200), params = [], tuples = chunk.map(row => '(' + cols.map((c, j) => { params.push(val(row[c])); return `$${params.length}::${casts[j]}` }).join(',') + ')')
    const upd = cols.filter(c => !t.pk.includes(c)).map(c => `${qi(c)}=excluded.${qi(c)}`).join(', ')
    await r.query(`insert into ${SCHEMA}.${qi(t.name)} (${cols.map(qi).join(',')}) values ${tuples.join(',')}${t.pk.length ? ` on conflict (${t.pk.map(qi).join(',')}) do ${upd ? 'update set ' + upd : 'nothing'}` : ''}`, params) }
  if (t.pk.length && removed.length) for (let i = 0; i < removed.length; i += 200) { const ks = removed.slice(i, i + 200).map(k => k.split('\u0001')), params = []
    await r.query(`delete from ${SCHEMA}.${qi(t.name)} where (${t.pk.map(qi).join(',')}) in (${ks.map(k => '(' + k.map((v, j) => { params.push(v); return `$${params.length}::${t.cols.find(c => c.col === t.pk[j]).typ}` }).join(',') + ')').join(',')})`, params) }
  cache[t.name] = next; return changed.length + removed.length }
async function syncFiles(r, cache) { const root = config.storageDir, prev = cache.__files || {}, next = {}; let n = 0
  const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : []
  for (const f of walk(root)) { const rel = path.relative(root, f).split(path.sep).join('/'), st = fs.statSync(f), tag = st.size + ':' + st.mtimeMs; next[rel] = tag; if (prev[rel] === tag) continue
    const buf = fs.readFileSync(f); await r.query(`insert into ${SCHEMA}.dl_files (path,size,sha256,data,updated_at) values ($1,$2,$3,$4,now()) on conflict (path) do update set size=excluded.size, sha256=excluded.sha256, data=excluded.data, updated_at=now()`, [rel, buf.length, sha(buf), buf]); n++ }
  cache.__files = next; return n }

// ── sauvegardes complètes : archive (base + documents) découpée en parties de 8 Mo ──
function pack(dir) { const files = [], walk = (p, rel) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name), r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(f, r); else files.push([r, f]) } }; walk(dir, '')
  const chunks = []; for (const [r, f] of files) { const name = Buffer.from(r), data = fs.readFileSync(f), h = Buffer.alloc(12); h.writeUInt32BE(name.length, 0); h.writeUInt32BE(Math.floor(data.length / 2 ** 32), 4); h.writeUInt32BE(data.length >>> 0, 8); chunks.push(h, name, data) }
  return Buffer.concat(chunks) }
function unpack(buf, dir) { let o = 0; while (o < buf.length) { const nl = buf.readUInt32BE(o), size = buf.readUInt32BE(o + 4) * 2 ** 32 + buf.readUInt32BE(o + 8); o += 12; const name = buf.subarray(o, o + nl).toString(); o += nl
    const target = path.resolve(dir, name); if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error('Archive invalide'); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, buf.subarray(o, o + size)); o += size } }
async function uploadBackup(r, b) { const blob = pack(path.join(BDIR(), b.id)), parts = Math.max(1, Math.ceil(blob.length / PART)), meta = { id: b.id, seq: b.seq, kind: b.kind, created_at: b.created_at, counts: b.counts, files: b.files, parts, size: blob.length, sha256: sha(blob) }
  setState({ uploading: { id: b.id, part: 0, parts } })
  for (let i = 0; i < parts; i++) { await r.query(`insert into ${SCHEMA}.dl_backups (id,part,data,meta) values ($1,$2,$3,$4) on conflict (id,part) do update set data=excluded.data, meta=excluded.meta`, [b.id, i, blob.subarray(i * PART, (i + 1) * PART), i === parts - 1 ? JSON.stringify(meta) : null]); setState({ uploading: { id: b.id, part: i + 1, parts } }) }
  const chk = (await r.query(`select count(*)::int n from ${SCHEMA}.dl_backups where id=$1`, [b.id])).rows[0].n; if (chk !== parts) throw new Error('Vérification de la copie en ligne échouée')
  const mf = path.join(BDIR(), b.id, 'manifest.json'), man = readJson(mf, {}); man.cloud = { at: new Date().toISOString(), parts, size: blob.length, sha256: meta.sha256, target: 'supabase' }; fs.writeFileSync(mf, JSON.stringify(man, null, 1))
  journal({ op: 'cloud_upload', id: b.id, ok: true, size: blob.length, parts }) }
export async function listCloud() { const r = await connect(); try { return (await r.query(`select meta, uploaded_at from ${SCHEMA}.dl_backups where meta is not null order by meta->>'created_at' desc`)).rows.map(x => ({ ...(typeof x.meta === 'string' ? JSON.parse(x.meta) : x.meta), uploaded_at: x.uploaded_at })) } catch (e) { if (/does not exist/.test(e.message)) return []; throw e } finally { await r.end() } }
export async function importCloud(id) {
  if (!/^[\w.:-]+$/.test(id)) throw new Error('Copie invalide'); if (listBackups().some(b => b.id === id)) throw new Error('Cette sauvegarde existe déjà sur cet ordinateur')
  const r = await connect(); let rows; try { rows = (await r.query(`select part, data, meta from ${SCHEMA}.dl_backups where id=$1 order by part`, [id])).rows } finally { await r.end() }
  const metaRow = rows.find(x => x.meta), meta = metaRow && (typeof metaRow.meta === 'string' ? JSON.parse(metaRow.meta) : metaRow.meta); if (!meta || rows.length !== meta.parts) throw new Error('Copie en ligne incomplète')
  const blob = Buffer.concat(rows.map(x => Buffer.from(x.data))); if (sha(blob) !== meta.sha256) throw new Error('Copie en ligne altérée (empreinte différente)')
  const dir = path.join(BDIR(), id), tmp = dir + '.import'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true })
  try { unpack(blob, tmp); const man = readJson(path.join(tmp, 'manifest.json'), null); if (!man?.verified || sha(fs.readFileSync(path.join(tmp, 'db.tar.gz'))) !== man.db_sha256) throw new Error('Contenu de la copie invalide')
    man.cloud = { ...(man.cloud || {}), imported: new Date().toISOString() }; fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(man, null, 1)); fs.renameSync(tmp, dir) }
  catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e }
  journal({ op: 'cloud_import', id, ok: true }); return { id, counts: meta.counts } }

// ── synchronisation complète ──
export async function checkOnline() { if (!configured()) return { online: false, reason: 'not_configured' }
  try { const r = await connect(); await r.query('select 1'); await r.end(); setState({ online: true, last_check: new Date().toISOString(), last_error: null, hint: null, via: r.via }); return { online: true, via: r.via } }
  catch (e) { setState({ online: false, last_check: new Date().toISOString(), last_error: e.message, hint: e.details || null }); return { online: false, error: e.message } } }
let running = null
export function syncNow(opts = {}) { if (running) return running; running = doSync(opts).finally(() => { running = null; setState({ uploading: null }) }); return running }
async function doSync() {
  const e = env(); if (!e.url || !e.enabled) return { skipped: 'non configuré (SUPABASE_DB_URL absent de .env) ou désactivé (SUPABASE_SYNC=off)' }
  let r; const wasOnline = cloudState().online
  try { r = await connect() } catch (err) { setState({ online: false, last_check: new Date().toISOString(), last_error: err.message, hint: err.details || null }); return { offline: true, error: err.message } }
  try {
    setState({ online: true, last_check: new Date().toISOString(), via: r.via, last_error: null, hint: null })
    // retour de connexion après une longue coupure : sauvegarde fraîche d'abord
    const newest = listBackups().filter(b => b.verified)[0]
    if (!newest || Date.now() - new Date(newest.created_at) > e.fresh_hours * 36e5 || (wasOnline === false && Date.now() - new Date(newest.created_at) > 30 * 6e4)) { try { await createBackup({ kind: 'auto', by: 'avant envoi en ligne' }) } catch (x) { journal({ op: 'backup', ok: false, error: x.message }) } }
    const tables = await localTables(); await ensureSchema(r, tables)
    const cache = readJson(CACHE(), {}); let rows = 0
    for (const t of tables) rows += await syncTable(r, t, cache)
    const files = await syncFiles(r, cache); writeJson(CACHE(), cache)
    const sent = []; for (const b of listBackups().filter(b => b.verified && !b.cloud).slice(0, 3)) { await uploadBackup(r, b); sent.push(b.id) }
    // conservation en ligne : les N sauvegardes les plus récentes
    const ids = (await r.query(`select id from ${SCHEMA}.dl_backups where meta is not null order by meta->>'created_at' desc`)).rows.map(x => x.id); for (const id of ids.slice(e.keep)) await r.query(`delete from ${SCHEMA}.dl_backups where id=$1`, [id])
    await r.query(`insert into ${SCHEMA}.dl_sync (clinic,last_sync,tables,rows) values ('principal',now(),$1,$2) on conflict (clinic) do update set last_sync=now(), tables=$1, rows=$2`, [tables.length, Object.values(cache).reduce((a, m) => a + Object.keys(m || {}).length, 0)])
    setState({ last_sync: new Date().toISOString(), last_error: null, tables: tables.length, rows_sent: rows, files_sent: files })
    if (rows || files || sent.length) journal({ op: 'cloud_sync', ok: true, rows, files, backups: sent.length })
    return { sent, rows, files, tables: tables.length, via: r.via }
  } catch (err) { setState({ last_error: err.message }); journal({ op: 'cloud_sync', ok: false, error: err.message }); return { error: err.message } }
  finally { try { await r.end() } catch {} } }

// ── automatisation : vérification de la connexion et envoi toutes les 2 minutes ──
export function startCloud() { const every = Number(process.env.CLOUD_INTERVAL_MS) || 2 * 60e3, tick = () => syncNow().catch(e => console.error('Synchronisation Supabase :', e.message)); setTimeout(tick, Math.min(30e3, every)); return setInterval(tick, every) }
