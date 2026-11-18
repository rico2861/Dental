// Sauvegardes : base complète (copie cohérente) + documents/images, VÉRIFIÉES avant d'être déclarées réussies.
// Chaque sauvegarde = un dossier backups/<id>/ contenant db.tar.gz, storage/ et manifest.json.
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { config } from '../config/env.js'
import { q, dumpDb } from '../db/pool.js'
import { BDIR, MARKER, LOG, sha256, readJson, journal } from './backup-restore.js'

const SETTINGS = () => path.join(BDIR(), 'reglages.json')
const COUNTED = ['users', 'employees', 'patients', 'medical_histories', 'consultations', 'tooth_states', 'treatment_plans', 'treatment_plan_items', 'appointments', 'documents', 'prostheses', 'invoices', 'invoice_items', 'payments', 'expenses', 'cash_movements', 'payroll_records', 'commission_payments', 'stock_movements', 'tariffs', 'audit_logs']
export const FREQ = { '1h': 1, '6h': 6, daily: 24, weekly: 168 }
export const getSettings = () => ({ auto: true, frequency: 'daily', weekly: true, weekly_keep: 12, retention_days: 30, keep_min: 5, ...readJson(SETTINGS(), {}) })
export const saveSettings = s => { fs.mkdirSync(BDIR(), { recursive: true }); const cur = getSettings()
  const next = { auto: s.auto === undefined ? cur.auto : !!s.auto, frequency: FREQ[s.frequency] ? s.frequency : cur.frequency, weekly: s.weekly === undefined ? cur.weekly : !!s.weekly, weekly_keep: Math.min(520, Math.max(1, parseInt(s.weekly_keep) || cur.weekly_keep)), retention_days: Math.min(3650, Math.max(1, parseInt(s.retention_days) || cur.retention_days)), keep_min: cur.keep_min }
  fs.writeFileSync(SETTINGS(), JSON.stringify(next, null, 1)); return next }
const counts = async run => { const o = {}; for (const t of COUNTED) o[t] = Number((await run(`select count(*)::int n from ${t}`)).rows[0].n); return o }
const dirStats = d => { let files = 0, size = 0; const walk = p => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else { files++; size += fs.statSync(f).size } } }; if (fs.existsSync(d)) walk(d); return { files, size } }

let running = null   // une seule sauvegarde à la fois
export function createBackup({ kind = 'manuelle', by = null } = {}) { if (running) return running; running = doBackup(kind, by).finally(() => { running = null }); return running }
async function doBackup(kind, by) {
  const id = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) + '_' + kind.slice(0, 4), dir = path.join(BDIR(), id)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const live = await counts(t => q(t))                                    // nombres de lignes au moment de la sauvegarde
    const blob = await dumpDb(), buf = Buffer.from(await blob.arrayBuffer())
    fs.writeFileSync(path.join(dir, 'db.tar.gz'), buf)
    if (fs.existsSync(config.storageDir)) fs.cpSync(config.storageDir, path.join(dir, 'storage'), { recursive: true })
    // VÉRIFICATION : le fichier écrit est relu, rechargé dans une base temporaire, puis recompté
    const written = fs.readFileSync(path.join(dir, 'db.tar.gz')), hash = sha256(written); if (hash !== sha256(buf)) throw new Error('Écriture du fichier de sauvegarde incorrecte')
    const tmp = new PGlite({ loadDataDir: new Blob([written]) }); await tmp.waitReady
    const back = await counts(t => tmp.query(t)); await tmp.close()
    const diff = COUNTED.filter(t => back[t] !== live[t]); if (diff.length) throw new Error('Contenu différent après rechargement : ' + diff.join(', '))
    const st = dirStats(config.storageDir), sb = dirStats(path.join(dir, 'storage')); if (st.files !== sb.files) throw new Error(`Documents incomplets (${sb.files}/${st.files})`)
    const seq = (readJson(path.join(BDIR(), 'sequence.json'), { n: listBackups().length }).n || 0) + 1; fs.writeFileSync(path.join(BDIR(), 'sequence.json'), JSON.stringify({ n: seq }))
    const man = { id, seq, kind, by, created_at: new Date().toISOString(), db_size: written.length, db_sha256: hash, files: sb.files, files_size: sb.size, counts: back, verified: true }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man, null, 1))
    journal({ op: 'backup', id, kind, by, ok: true, size: written.length + sb.size })
    const removed = applyRetention(); return { ...man, removed }
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}   // jamais de sauvegarde incomplète laissée comme « valable »
    journal({ op: 'backup', id, kind, by, ok: false, error: e.message })
    try { const c = (await q('select id from clinics limit 1')).rows[0]; if (c) await q("insert into notifications(clinic_id,perm,kind,title,text) values($1,'view_audit_logs','backup_failed','Échec de la sauvegarde',$2)", [c.id, e.message]) } catch {}
    throw e
  }
}
export const listBackups = () => { if (!fs.existsSync(BDIR())) return []
  return fs.readdirSync(BDIR(), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => readJson(path.join(BDIR(), d.name, 'manifest.json'), null)).filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at)) }
// conservation : supprime les sauvegardes plus anciennes que la durée choisie, en gardant toujours les plus récentes
export function applyRetention() { const s = getSettings(), all = listBackups(), limit = Date.now() - s.retention_days * 864e5, removed = []
  all.slice(s.keep_min).filter(b => b.kind !== 'avant-restauration' && (b.kind === 'hebdomadaire' ? new Date(b.created_at).getTime() < Date.now() - s.weekly_keep * 7 * 864e5 : new Date(b.created_at).getTime() < limit)).forEach(b => { fs.rmSync(path.join(BDIR(), b.id), { recursive: true, force: true }); removed.push(b.id) })
  if (removed.length) journal({ op: 'retention', ok: true, removed }); return removed }
export const backupPath = id => { const b = listBackups().find(x => x.id === id); return b ? path.join(BDIR(), b.id) : null }
export const journalEntries = () => readJson(LOG(), [])
export const pendingRestore = () => readJson(MARKER(), null)
export async function requestRestore(id, by) {
  const b = listBackups().find(x => x.id === id); if (!b || !b.verified) throw new Error('Sauvegarde introuvable ou non vérifiée')
  const buf = fs.readFileSync(path.join(BDIR(), b.id, 'db.tar.gz')); if (sha256(buf) !== b.db_sha256) throw new Error('Fichier de sauvegarde altéré : restauration refusée')
  const safety = await createBackup({ kind: 'avant-restauration', by })   // sauvegarde de sécurité de l'état actuel
  fs.writeFileSync(MARKER(), JSON.stringify({ id: b.id, by, requested_at: new Date().toISOString(), safety: safety.id }, null, 1))
  journal({ op: 'restore_requested', id: b.id, by, ok: true, safety: safety.id }); return { id: b.id, safety: safety.id } }
export function cancelRestore(by) { const m = pendingRestore(); if (!m) return false; fs.rmSync(MARKER(), { force: true }); journal({ op: 'restore_cancelled', id: m.id, by, ok: true }); return true }
// sauvegarde automatique quotidienne (vérifiée toutes les 30 minutes)
export function startScheduler() {
  const tick = async () => { try { const s = getSettings(); if (!s.auto) return; const all = listBackups(), age = k => { const b = all.find(x => x.kind === k); return b ? Date.now() - new Date(b.created_at).getTime() : Infinity }
    // hebdomadaire complète (conservée plus longtemps), puis sauvegarde périodique selon la fréquence choisie
    if (s.weekly && age('hebdomadaire') > 7 * 864e5 - 18e5) { await createBackup({ kind: 'hebdomadaire', by: 'automatique' }); applyRetention(); return }
    if (age('auto') > FREQ[s.frequency || 'daily'] * 36e5 - 18e5) { await createBackup({ kind: 'auto', by: 'automatique' }); applyRetention() } } catch (e) { console.error('Sauvegarde automatique échouée :', e.message) } }
  setTimeout(tick, 60e3); return setInterval(tick, 10 * 60e3)
}
