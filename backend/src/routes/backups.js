// Sauvegardes et restauration : réservées au propriétaire et aux administrateurs ; la restauration exige le mot de passe.
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { createBackup, listBackups, getSettings, saveSettings, journalEntries, pendingRestore, requestRestore, cancelRestore, backupPath } from '../lib/backup.js'
import { publicCloud, cloudState, syncNow, listCloud, importCloud, checkOnline } from '../lib/cloud.js'
export default function (app, { need, audit, fail, wrap }) {
  const admin = req => req.user.role === 'OWNER' || String(req.user.role).startsWith('ADMIN'), who = req => `${req.user.first_name} ${req.user.last_name}`.trim()
  app.get('/api/backups', need(), wrap(async (req, res) => { if (!admin(req)) return fail(res, 403, "Réservé à l'administration")
    res.json({ backups: listBackups(), settings: getSettings(), journal: journalEntries().slice(0, 60), pending: pendingRestore(), owner: req.user.role === 'OWNER', cloud: { ...publicCloud(), state: cloudState() } }) }))
  app.post('/api/backups', need(), wrap(async (req, res) => { if (!admin(req)) return fail(res, 403, "Réservé à l'administration")
    try { const b = await createBackup({ kind: 'manuelle', by: who(req) }); await audit(req, 'BACKUP_CREATED', 'backups', null, { id: b.id, size: b.db_size + b.files_size }); res.json(b); syncNow().catch(() => {}) }   // envoi en ligne aussitôt si Internet est disponible
    catch (e) { await audit(req, 'BACKUP_FAILED', 'backups', null, { error: e.message }); fail(res, 500, 'Sauvegarde échouée : ' + e.message) } }))
  app.post('/api/backups/settings', need(), wrap(async (req, res) => { if (!admin(req)) return fail(res, 403, "Réservé à l'administration")
    const s = saveSettings(req.body); await audit(req, 'BACKUP_SETTINGS', 'backups', null, s); res.json(s) }))
  app.get('/api/backups/:id/download', need(), wrap(async (req, res) => { if (req.user.role !== 'OWNER') return fail(res, 403, 'Réservé au propriétaire')
    const d = backupPath(req.params.id); if (!d) return fail(res, 404, 'Introuvable'); await audit(req, 'BACKUP_DOWNLOADED', 'backups', null, { id: req.params.id })
    res.download(path.join(d, 'db.tar.gz'), `dental-light-base-${req.params.id}.tar.gz`) }))
  app.post('/api/backups/:id/restore', need(), wrap(async (req, res) => { if (req.user.role !== 'OWNER') return fail(res, 403, 'Restauration réservée au propriétaire')
    if (req.body.confirm !== 'RESTAURER') return fail(res, 400, 'Tapez RESTAURER pour confirmer')
    if (!(await bcrypt.compare(req.body.password || '', req.user.password_hash))) return fail(res, 400, 'Mot de passe incorrect')
    try { const r = await requestRestore(req.params.id, who(req)); await audit(req, 'RESTORE_REQUESTED', 'backups', null, r); res.json({ ok: true, ...r }) }
    catch (e) { fail(res, 400, e.message) } }))
  app.post('/api/backups/restore/cancel', need(), wrap(async (req, res) => { if (req.user.role !== 'OWNER') return fail(res, 403, 'Réservé au propriétaire')
    const ok = cancelRestore(who(req)); if (ok) await audit(req, 'RESTORE_CANCELLED', 'backups', null, {}); res.json({ ok }) }))
  // ── sauvegarde en ligne (Supabase) ──
  app.post('/api/cloud/sync', need(), wrap(async (req, res) => { if (!admin(req)) return fail(res, 403, "Réservé à l'administration")
    const r = await syncNow({ by: who(req) }); if (r.sent?.length || r.rows || r.files) await audit(req, 'CLOUD_SYNC', 'backups', null, { backups: r.sent, rows: r.rows, files: r.files }); res.json({ ...r, state: cloudState() }) }))
  app.get('/api/cloud/check', need(), wrap(async (req, res) => { if (!admin(req)) return fail(res, 403, "Réservé à l'administration"); res.json({ ...(await checkOnline()), state: cloudState() }) }))
  app.get('/api/cloud/list', need(), wrap(async (req, res) => { if (!admin(req)) return fail(res, 403, "Réservé à l'administration")
    try { res.json({ copies: await listCloud() }) } catch (e) { fail(res, 503, e.status ? e.message : 'Pas de connexion Internet : la liste en ligne est indisponible') } }))
  app.post('/api/cloud/import', need(), wrap(async (req, res) => { if (req.user.role !== 'OWNER') return fail(res, 403, 'Réservé au propriétaire')
    if (!(await bcrypt.compare(req.body.password || '', req.user.password_hash))) return fail(res, 400, 'Mot de passe incorrect')
    try { const r = await importCloud(String(req.body.id || ''), req.body.passphrase || ''); await audit(req, 'CLOUD_IMPORTED', 'backups', null, { id: r.id }); res.json(r) } catch (e) { fail(res, 400, e.message) } }))
  void fs
}
