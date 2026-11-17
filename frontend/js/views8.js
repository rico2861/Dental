// Sauvegardes et restauration (administration).
import { ic } from './icons.js'
import { head, btn, kpi, kpis, tips, card, empty, badge, modal, fld } from './kit.js'
export default function install({ $, esc, api, toast, render }) {
  const fdt = d => d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince', dateStyle: 'short', timeStyle: 'short' }) : '—'
  const size = n => n > 1e9 ? (n / 1e9).toFixed(2) + ' Go' : n > 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1e3)) + ' Ko'
  const KIND = { manuelle: ['Manuelle', 'st-info'], auto: ['Automatique', 'st-ok'], 'avant-restauration': ['Sécurité (avant restauration)', 'st-warn'] }
  const OPS = { backup: 'Sauvegarde', retention: 'Nettoyage (conservation)', restore_requested: 'Restauration demandée', restore_applied: 'Restauration appliquée', restore_failed: 'Restauration échouée', restore_cancelled: 'Restauration annulée' }
  const views = {
    async backups() {
      const d = await api('/backups'), bk = d.backups, last = bk[0], s = d.settings, used = bk.reduce((t, b) => t + b.db_size + b.files_size, 0)
      const lastAuto = bk.find(b => b.kind === 'auto'), fails = d.journal.filter(j => !j.ok && j.op === 'backup'), age = last ? (Date.now() - new Date(last.created_at)) / 36e5 : null
      const row = b => `<tr data-s="${esc(b.id)}"><td><b>${fdt(b.created_at)}</b><br><small class="muted">${esc(b.id)}</small></td><td>${badge(...(KIND[b.kind] || [b.kind, 'st-done']))}</td><td>${esc(b.by || '—')}</td>
        <td>${b.verified ? badge(ic('check', 12) + ' Vérifiée', 'st-ok') : badge('Non vérifiée', 'st-off')}</td><td class="r">${b.counts.patients} patients · ${b.counts.invoices} factures<br><small class="muted">${b.files} document(s)</small></td><td class="r">${size(b.db_size + b.files_size)}</td>
        <td class="act"><div class="acts">${d.owner ? `<a class="bs" href="/api/backups/${encodeURIComponent(b.id)}/download">${ic('download', 14)}Base</a><button class="bs dng" data-a="bk-restore" data-id="${esc(b.id)}" data-t="${esc(fdt(b.created_at))}">${ic('undo', 14)}Restaurer</button>` : ''}</div></td></tr>`
      $('#view').innerHTML = head('Sauvegardes', 'Base de données, documents et images · chaque sauvegarde est vérifiée avant d\'être déclarée réussie', btn('bk-now', 'Sauvegarder maintenant', 'download'))
        + (d.pending ? `<div class="banner dangr">${ic('alert', 18)}<span><b>Restauration en attente</b> de la sauvegarde du ${fdt(bk.find(b => b.id === d.pending.id)?.created_at)} : elle sera appliquée au <b>prochain redémarrage du serveur</b>. Une sauvegarde de sécurité de l'état actuel a été faite.</span>${d.owner ? `<button class="sec bs" data-a="bk-cancel">Annuler la restauration</button>` : ''}</div>` : '')
        + kpis([kpi(age == null || age > 26 ? 'red' : 'green', 'Dernière sauvegarde', last ? fdt(last.created_at) : 'Aucune', last ? (last.verified ? 'vérifiée' : 'non vérifiée') : 'à faire maintenant', 'shield'), kpi('blue', 'Sauvegardes', bk.length, `conservées ${s.retention_days} jours`, 'folder'), kpi(s.auto ? 'teal' : 'orange', 'Automatique', s.auto ? 'Activée' : 'Désactivée', s.auto ? (lastAuto ? 'dernière : ' + fdt(lastAuto.created_at) : 'première dans l\'heure') : 'à activer', 'clock'), kpi('violet', 'Espace utilisé', size(used), 'sur ce serveur', 'package')])
        + tips([!last && { icon: 'alert', tone: 'danger', text: 'Aucune sauvegarde n\'existe encore : faites-en une maintenant.' }, age > 26 && { icon: 'clock', tone: 'warn', text: `Dernière sauvegarde il y a ${Math.round(age)} heures.` },
          fails.length && { icon: 'alert', tone: 'danger', text: `${fails.length} échec(s) de sauvegarde récents : ${esc(fails[0].error || '')}` },
          { icon: 'info', text: 'Les sauvegardes sont sur ce même ordinateur. Copiez régulièrement le dossier <b>backend/backups</b> sur un disque externe ou un autre ordinateur pour vous protéger d\'une panne ou d\'un vol.' }])
        + card('Réglages', 'sliders', `<form class="row bkset" data-f="bkset" style="margin:0"><label class="ck"><input type="checkbox" name="auto" ${s.auto ? 'checked' : ''}> Sauvegarde automatique chaque jour</label><label class="ml" style="margin:0;flex-direction:row;align-items:center;gap:8px">Conserver<input name="retention_days" type="number" min="1" max="3650" value="${s.retention_days}" style="width:90px">jours</label><button class="sec">${ic('check', 15)} Enregistrer</button></form><p class="muted fnote" style="margin:10px 0 0">Les ${s.keep_min} sauvegardes les plus récentes et les sauvegardes de sécurité ne sont jamais supprimées automatiquement.</p>`)
        + card('Sauvegardes disponibles', 'folder', bk.length ? `<div class="tw"><table class="ptable" id="bktab" data-page="10"><tr><th>Date</th><th>Type</th><th>Par</th><th>État</th><th class="r">Contenu</th><th class="r">Taille</th><th></th></tr>${bk.map(row).join('')}</table></div>` : empty('shield', 'Aucune sauvegarde', 'Cliquez sur « Sauvegarder maintenant ».'))
        + card('Journal des opérations', 'list', d.journal.length ? `<div class="bkj" data-page="10">${d.journal.map(j => `<div class="kvr" data-pi="1">${ic(j.ok ? 'check' : 'alert', 15)}<span><b>${OPS[j.op] || esc(j.op)}</b>${j.kind ? ' · ' + esc(j.kind) : ''}${j.by ? ' · ' + esc(j.by) : ''}${j.error ? ` · <span class="err">${esc(j.error)}</span>` : ''}${j.note ? ` · <span class="muted">${esc(j.note)}</span>` : ''}</span><b>${fdt(j.at)}</b></div>`).join('')}</div>` : '<span class="muted">Aucune opération.</span>')
    }
  }
  const submit = { async bkset(e) { const f = Object.fromEntries(new FormData(e.target)); await api('/backups/settings', { auto: 'auto' in f, retention_days: f.retention_days }); toast('Réglages enregistrés'); render() } }
  const click = async (b, a, id) => {
    if (a === 'bk-now') { b.disabled = true; b.innerHTML = `${ic('clock', 17)} Sauvegarde et vérification…`; try { const r = await api('/backups', {}); toast(`Sauvegarde vérifiée : ${r.counts.patients} patients, ${r.counts.invoices} factures, ${r.files} document(s)`) } finally { render() } }
    else if (a === 'bk-cancel') { await api('/backups/restore/cancel', {}); toast('Restauration annulée'); render() }
    else if (a === 'bk-restore') { const v = await modal({ title: 'Restaurer une sauvegarde', icon: 'alert', tone: 'danger', danger: true, ok: 'Programmer la restauration',
        html: `<p class="note" style="background:#fdecec;color:#8f1f1f">Toutes les données saisies <b>après le ${esc(b.dataset.t)}</b> seront remplacées par celles de cette sauvegarde.</p><ul class="bkul"><li>Une <b>sauvegarde de sécurité</b> de l'état actuel est faite d'abord.</li><li>L'ancienne base et les anciens documents sont <b>conservés</b> (jamais supprimés).</li><li>La restauration s'applique au <b>prochain redémarrage du serveur</b>.</li></ul>
          ${fld('Tapez RESTAURER pour confirmer *', 'confirm', 'required autocomplete="off"', 's2')}${fld('Votre mot de passe *', 'password', 'type="password" required autocomplete="current-password"', 's2')}`,
        submit: f => api(`/backups/${encodeURIComponent(id)}/restore`, f) }); if (v) { toast('Restauration programmée : redémarrez le serveur pour l\'appliquer'); render() } }
    else return false
    return true }
  return { views, submit, click }
}
