// Sauvegardes et restauration : réservées au propriétaire et aux administrateurs ; la restauration exige le mot de passe.
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { createBackup, listBackups, getSettings, saveSettings, journalEntries, pendingRestore, requestRestore, cancelRestore, backupPath } from '../lib/backup.js'
export default function (app, { need, audit, fail, wrap }) {
  const admin = req => req.user.role === 'OWNER' || String(req.user.role).startsWith('ADMIN'), who = req => `${req.user.first_name} ${req.user.last_name}`.trim()
  app.get('/api/backups', need(), wrap(async (req, res) => { if (!admin(req)) return fail(res, 403, "Réservé à l'administration")
    res.json({ backups: listBackups(), settings: getSettings(), journal: journalEntries().slice(0, 60), pending: pendingRestore(), owner: req.user.role === 'OWNER' }) }))
  app.post('/api/backups', need(), wrap(async (req, res) => { if (!admin(req)) return fail(res, 403, "Réservé à l'administration")
    try { const b = await createBackup({ kind: 'manuelle', by: who(req) }); await audit(req, 'BACKUP_CREATED', 'backups', null, { id: b.id, size: b.db_size + b.files_size }); res.json(b) }
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
  void fs
}
