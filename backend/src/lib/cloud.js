// ═══ Sauvegarde en ligne vers Supabase Storage ═══
// L'application reste 100 % locale : Supabase reçoit des COPIES de sauvegarde, chiffrées (AES-256-GCM) avant de quitter
// la clinique. Sans la phrase secrète du propriétaire, le contenu est illisible, y compris pour Supabase.
// Fonctionnement automatique : vérification de la connexion toutes les 2 minutes ; dès qu'Internet est disponible,
// les sauvegardes locales vérifiées qui ne sont pas encore en ligne sont envoyées (morceaux, puis fiche « meta » en dernier).
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { BDIR, readJson, journal } from './backup-restore.js'
import { listBackups, createBackup } from './backup.js'

const CFG = () => path.join(BDIR(), 'cloud.json'), STATE = () => path.join(BDIR(), 'cloud-etat.json')
const PART = 40 * 1024 * 1024                 // morceaux de 40 Mo (sous la limite d'envoi standard de Supabase)
const MAGIC = 'DENTAL-LIGHT-CLOUD-1'
const sha = b => crypto.createHash('sha256').update(b).digest('hex')
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1), { mode: 0o600 }) }

// ── configuration (fichier local du serveur, jamais renvoyé en clair au navigateur) ──
export const getCloud = () => ({ enabled: false, url: '', key: '', bucket: 'dental-light-sauvegardes', prefix: 'clinique', keep: 30, fresh_hours: 6, ...readJson(CFG(), {}) })
export const cloudState = () => ({ online: null, last_check: null, last_sync: null, last_error: null, uploading: null, ...readJson(STATE(), {}) })
const setState = p => writeJson(STATE(), { ...cloudState(), ...p })
export const configured = c => !!(c.url && c.key && c.bucket && c.enc_key)
export const publicCloud = () => { const c = getCloud(); return { enabled: c.enabled, configured: configured(c), url: c.url, bucket: c.bucket, prefix: c.prefix, keep: c.keep, fresh_hours: c.fresh_hours, key_hint: c.key ? '…' + c.key.slice(-6) : '', encrypted: !!c.enc_key } }
const deriveKey = (pass, salt) => crypto.scryptSync(String(pass), Buffer.from(salt, 'base64'), 32, { N: 16384, r: 8, p: 1 })
const keyCheck = key => crypto.createHmac('sha256', key).update(MAGIC).digest('hex')

// ── appels à l'API Storage de Supabase ──
async function api(c, method, p, body, { timeout = 30000, raw = false, type } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout)
  try { const r = await fetch(`${c.url.replace(/\/+$/, '')}/storage/v1/${p}`, { method, signal: ctl.signal, headers: { Authorization: `Bearer ${c.key}`, apikey: c.key, ...(body !== undefined ? { 'Content-Type': type || (Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json') } : {}), ...(method === 'POST' && Buffer.isBuffer(body) ? { 'x-upsert': 'true' } : {}) }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) })
    if (!r.ok) { const txt = await r.text().catch(() => ''); const e = new Error(`Supabase ${r.status} : ${txt.slice(0, 160) || r.statusText}`); e.status = r.status; throw e }
    return raw ? Buffer.from(await r.arrayBuffer()) : r.headers.get('content-type')?.includes('json') ? r.json() : r.text() }
  finally { clearTimeout(t) } }
const objPath = (c, ...p) => [c.prefix, ...p].join('/')
// connexion Internet + accès au stockage : « en ligne » seulement si Supabase répond
export async function checkOnline(c = getCloud()) {
  if (!configured(c)) return { online: false, reason: 'not_configured' }
  try { await api(c, 'GET', `bucket/${encodeURIComponent(c.bucket)}`, undefined, { timeout: 7000 }); setState({ online: true, last_check: new Date().toISOString(), last_error: null }); return { online: true } }
  catch (e) { const offline = !e.status; setState({ online: offline ? false : true, last_check: new Date().toISOString(), last_error: offline ? 'Pas de connexion Internet (ou Supabase injoignable)' : e.message }); return { online: !offline, error: e.message, status: e.status } } }

// ── emballage d'une sauvegarde (base + manifeste + documents) en un seul flux, puis chiffrement ──
function pack(dir) { const files = [], walk = (p, rel) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name), r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(f, r); else if (e.name !== 'cloud.json') files.push([r, f]) } }; walk(dir, '')
  const chunks = []; for (const [r, f] of files) { const name = Buffer.from(r), data = fs.readFileSync(f), h = Buffer.alloc(12); h.writeUInt32BE(name.length, 0); h.writeUInt32BE(Math.floor(data.length / 2 ** 32), 4); h.writeUInt32BE(data.length >>> 0, 8); chunks.push(h, name, data) }
  return { buf: Buffer.concat(chunks), count: files.length } }
function unpack(buf, dir) { let o = 0, n = 0; while (o < buf.length) { const nl = buf.readUInt32BE(o), size = buf.readUInt32BE(o + 4) * 2 ** 32 + buf.readUInt32BE(o + 8); o += 12; const name = buf.subarray(o, o + nl).toString(); o += nl
    const target = path.resolve(dir, name); if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error('Archive invalide'); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, buf.subarray(o, o + size)); o += size; n++ } return n }
const encrypt = (key, plain) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv), ct = Buffer.concat([c.update(plain), c.final()]); return Buffer.concat([iv, ct, c.getAuthTag()]) }
const decrypt = (key, blob) => { const d = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12)); d.setAuthTag(blob.subarray(blob.length - 16)); return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]) }

// ── envoi d'une sauvegarde ──
async function uploadBackup(c, b) {
  const dir = path.join(BDIR(), b.id), key = Buffer.from(c.enc_key, 'base64'), { buf, count } = pack(dir), blob = encrypt(key, buf), parts = Math.max(1, Math.ceil(blob.length / PART))
  setState({ uploading: { id: b.id, part: 0, parts, started: new Date().toISOString() } })
  for (let i = 0; i < parts; i++) { await api(c, 'POST', `object/${encodeURIComponent(c.bucket)}/${objPath(c, b.id, `part-${String(i).padStart(3, '0')}.dlc`)}`, blob.subarray(i * PART, (i + 1) * PART), { timeout: 10 * 60e3 }); setState({ uploading: { id: b.id, part: i + 1, parts } }) }
  // fiche descriptive envoyée EN DERNIER : une copie sans « meta » est incomplète et ignorée
  const meta = { format: MAGIC, id: b.id, seq: b.seq, kind: b.kind, created_at: b.created_at, uploaded_at: new Date().toISOString(), parts, size: blob.length, sha256: sha(blob), files: count, counts: b.counts, kdf_salt: c.kdf_salt, key_check: keyCheck(key) }
  await api(c, 'POST', `object/${encodeURIComponent(c.bucket)}/${objPath(c, b.id, 'meta.json')}`, Buffer.from(JSON.stringify(meta)), { type: 'application/json' })
  // relecture de la fiche : l'envoi n'est déclaré réussi que s'il est vérifié côté Supabase
  const back = JSON.parse((await api(c, 'GET', `object/${encodeURIComponent(c.bucket)}/${objPath(c, b.id, 'meta.json')}`, undefined, { raw: true })).toString()); if (back.sha256 !== meta.sha256) throw new Error('Vérification de la copie en ligne échouée')
  const mf = path.join(dir, 'manifest.json'), man = readJson(mf, {}); man.cloud = { at: meta.uploaded_at, parts, size: blob.length, sha256: meta.sha256 }; fs.writeFileSync(mf, JSON.stringify(man, null, 1))
  journal({ op: 'cloud_upload', id: b.id, ok: true, size: blob.length, parts }); return meta }

// ── liste des copies en ligne (seules les copies complètes, avec fiche « meta ») ──
export async function listCloud(c = getCloud()) {
  const dirs = await api(c, 'POST', `object/list/${encodeURIComponent(c.bucket)}`, { prefix: c.prefix + '/', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'desc' } })
  const out = []; for (const d of dirs.filter(x => !x.id)) { try { out.push(JSON.parse((await api(c, 'GET', `object/${encodeURIComponent(c.bucket)}/${objPath(c, d.name, 'meta.json')}`, undefined, { raw: true, timeout: 15000 })).toString())) } catch { out.push({ id: d.name, incomplete: true }) } }
  return out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) }
async function removeCloud(c, id) { const files = await api(c, 'POST', `object/list/${encodeURIComponent(c.bucket)}`, { prefix: objPath(c, id) + '/', limit: 1000, offset: 0 }); const prefixes = files.filter(f => f.id).map(f => objPath(c, id, f.name)); if (prefixes.length) await api(c, 'DELETE', `object/${encodeURIComponent(c.bucket)}`, { prefixes }) }
// conservation en ligne : garde les N copies les plus récentes ; supprime les envois incomplets anciens
async function cloudRetention(c) { const all = await listCloud(c), ok = all.filter(x => !x.incomplete), drop = [...ok.slice(c.keep), ...all.filter(x => x.incomplete && x.id !== cloudState().uploading?.id)]
  for (const x of drop) { try { await removeCloud(c, x.id) } catch {} } if (drop.length) journal({ op: 'cloud_retention', ok: true, removed: drop.map(x => x.id) }) }

// ── synchronisation : envoie tout ce qui manque (plus récent d'abord) ──
let running = null
export function syncNow(opts = {}) { if (running) return running; running = doSync(opts).finally(() => { running = null; setState({ uploading: null }) }); return running }
async function doSync({ by = 'automatique' } = {}) {
  const c = getCloud(); if (!c.enabled || !configured(c)) return { skipped: 'désactivé ou non configuré' }
  const wasOnline = cloudState().online, chk = await checkOnline(c); if (!chk.online) return { offline: true, error: chk.error }
  if (chk.error) return { error: chk.error }
  // retour de connexion après une longue coupure : une sauvegarde fraîche d'abord, pour envoyer l'état le plus récent
  const local = listBackups().filter(b => b.verified), newest = local[0]
  if (!newest || Date.now() - new Date(newest.created_at) > c.fresh_hours * 36e5 || (wasOnline === false && Date.now() - new Date(newest.created_at) > 30 * 6e4)) { try { await createBackup({ kind: 'auto', by: 'avant envoi en ligne' }) } catch (e) { setState({ last_error: 'Sauvegarde locale impossible : ' + e.message }) } }
  const pending = listBackups().filter(b => b.verified && !b.cloud).slice(0, 3), sent = []
  for (const b of pending) { try { sent.push((await uploadBackup(c, b)).id) } catch (e) { journal({ op: 'cloud_upload', id: b.id, ok: false, error: e.message }); setState({ last_error: e.message, online: !!e.status }); return { sent, error: e.message } } }
  try { await cloudRetention(c) } catch {}
  setState({ last_sync: new Date().toISOString(), last_error: null }); return { sent, pending: listBackups().filter(b => b.verified && !b.cloud).length } }

// ── configuration par le propriétaire (phrase secrète obligatoire ; réutilise le sel des copies existantes) ──
export async function configure(body) {
  const cur = getCloud(), url = String(body.url || cur.url).trim().replace(/\/+$/, ''), key = String(body.key || '').trim() || cur.key, bucket = String(body.bucket || cur.bucket).trim(), prefix = String(body.prefix || cur.prefix).trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'clinique'
  if (!/^https?:\/\/[^\s]+$/.test(url)) throw new Error('Adresse du projet Supabase invalide (ex : https://xxxx.supabase.co)')
  if (!key || key.length < 20) throw new Error('Clé Supabase manquante')
  if (!/^[a-z0-9][a-z0-9_.-]{1,62}$/.test(bucket)) throw new Error('Nom du bucket invalide (minuscules, chiffres, tirets)')
  const c = { ...cur, url, key, bucket, prefix, keep: Math.min(365, Math.max(1, parseInt(body.keep) || cur.keep)), fresh_hours: Math.min(168, Math.max(1, parseInt(body.fresh_hours) || cur.fresh_hours)), enabled: body.enabled === undefined ? true : !!body.enabled }
  // accès au stockage ; création du bucket privé s'il n'existe pas
  try { await api(c, 'GET', `bucket/${encodeURIComponent(bucket)}`, undefined, { timeout: 10000 }) }
  catch (e) { if (!e.status) throw new Error('Supabase injoignable : vérifiez la connexion Internet et l\'adresse du projet'); if (e.status === 401 || e.status === 403) throw new Error('Clé refusée par Supabase : utilisez la clé « service_role » du projet')
    await api(c, 'POST', 'bucket', { id: bucket, name: bucket, public: false }) }
  if (body.passphrase) { const pass = String(body.passphrase); if (pass.length < 12) throw new Error('Phrase de chiffrement : 12 caractères minimum')
    const existing = (await listCloud(c).catch(() => [])).find(x => x.kdf_salt && x.key_check), salt = existing?.kdf_salt || crypto.randomBytes(16).toString('base64'), k = deriveKey(pass, salt)
    if (existing && keyCheck(k) !== existing.key_check) throw new Error('Cette phrase ne correspond pas aux copies déjà présentes dans Supabase : utilisez la même phrase que lors de la première configuration')
    c.kdf_salt = salt; c.enc_key = k.toString('base64') }
  if (!c.enc_key) throw new Error('Phrase de chiffrement obligatoire : les sauvegardes contiennent des données médicales')
  writeJson(CFG(), c); setState({ online: true, last_check: new Date().toISOString(), last_error: null }); return publicCloud() }

// ── récupération d'une copie en ligne vers les sauvegardes locales (puis restauration normale) ──
export async function importCloud(id, passphrase) {
  const c = getCloud(); if (!c.url || !c.key) throw new Error('Supabase non configuré'); if (!/^[\w.:-]+$/.test(id)) throw new Error('Copie invalide')
  if (listBackups().some(b => b.id === id)) throw new Error('Cette sauvegarde existe déjà sur cet ordinateur')
  const meta = JSON.parse((await api(c, 'GET', `object/${encodeURIComponent(c.bucket)}/${objPath(c, id, 'meta.json')}`, undefined, { raw: true })).toString())
  const key = passphrase ? deriveKey(passphrase, meta.kdf_salt) : c.enc_key && Buffer.from(c.enc_key, 'base64'); if (!key || keyCheck(key) !== meta.key_check) throw new Error('Phrase de chiffrement incorrecte pour cette copie')
  const parts = []; for (let i = 0; i < meta.parts; i++) parts.push(await api(c, 'GET', `object/${encodeURIComponent(c.bucket)}/${objPath(c, id, `part-${String(i).padStart(3, '0')}.dlc`)}`, undefined, { raw: true, timeout: 10 * 60e3 }))
  const blob = Buffer.concat(parts); if (sha(blob) !== meta.sha256) throw new Error('Copie en ligne altérée ou incomplète (empreinte différente)')
  const plain = decrypt(key, blob), dir = path.join(BDIR(), id), tmp = dir + '.import'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true })
  try { unpack(plain, tmp); const man = readJson(path.join(tmp, 'manifest.json'), null); if (!man?.verified || !fs.existsSync(path.join(tmp, 'db.tar.gz')) || sha(fs.readFileSync(path.join(tmp, 'db.tar.gz'))) !== man.db_sha256) throw new Error('Contenu de la copie invalide')
    man.cloud = { at: meta.uploaded_at, parts: meta.parts, size: meta.size, sha256: meta.sha256, imported: new Date().toISOString() }; fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(man, null, 1)); fs.renameSync(tmp, dir) }
  catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e }
  journal({ op: 'cloud_import', id, ok: true }); return { id, counts: meta.counts } }

// ── automatisation ──
export function startCloud() { const every = Number(process.env.CLOUD_INTERVAL_MS) || 2 * 60e3, tick = () => syncNow().catch(e => console.error('Sauvegarde en ligne :', e.message)); setTimeout(tick, Math.min(45e3, every)); return setInterval(tick, every) }
export const setEnabled = on => { const c = getCloud(); c.enabled = !!on; writeJson(CFG(), c); return publicCloud() }
