export default function install({ $, esc, api, can, toast, render }) {
  const F = e => Object.fromEntries(new FormData(e.target)), pid = () => location.hash.split('/')[1]
  const fd = d => d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince', dateStyle: 'short', timeStyle: 'short' }) : '—'
  let allH = false
  const flow = async el => {
    const s = await api('/2fa/setup', {})
    el.innerHTML = `<p><b>1.</b> Scannez ce QR code avec Google Authenticator, Microsoft Authenticator ou Authy.</p><img src="${s.qr}" width="200" height="200" alt="QR code"><p class="muted">Ou saisissez la clé manuellement : <code>${esc(s.secret)}</code></p>
      <p><b>2.</b> Entrez le code à 6 chiffres affiché :</p><form data-f="en2fa" class="row"><input name="code" inputmode="numeric" maxlength="7" autocomplete="one-time-code" placeholder="123456" required><button>Activer</button></form>` }
  const mount2fa = el => { el.innerHTML = `<h2>Activez la double authentification</h2><p>Elle est obligatoire pour le propriétaire et les administrateurs. Vous aurez besoin d'une application d'authentification sur votre téléphone.</p><div id="tfa"><button data-a="tfa-start">Commencer</button></div><p><button class="sec" data-a="logout">Déconnexion</button></p>` }
  const views = {
    async security() {
      const me = await api('/me'), [ses, hist, nt] = await Promise.all([api('/sessions'), api('/login-history' + (allH ? '?all=1' : '')), api('/notifications')]), sec = me.role === 'OWNER' ? await api('/settings/security') : null, all = can('view_audit_logs') || can('manage_users')
      $('#view').innerHTML = `<h2>Sécurité</h2>
      <div class="card"><h3>Double authentification (2FA)</h3>${me.totp_enabled ? `<p class="ok">✔ Activée sur votre compte.</p><form class="row" data-f="dis2fa"><input type="password" name="password" placeholder="Mot de passe" required><input name="code" placeholder="Code ou code de secours" required><button class="red">Désactiver</button></form><span class="muted" style="font-size:12px">Impossible si la clinique l'impose pour votre rôle.</span>` : `<p>Non activée. <button data-a="tfa-start">Activer</button></p><div id="tfa"></div>`}</div>
      ${sec ? `<div class="card"><h3>Paramètres de sécurité de la clinique</h3><form class="row" data-f="secset"><label>Déconnexion après <input type="number" name="inactivity_minutes" min="1" max="480" value="${sec.inactivity_minutes}" style="width:80px"> minutes d'inactivité</label><label><input type="checkbox" name="require_2fa" ${sec.require_2fa ? 'checked' : ''}> 2FA obligatoire (propriétaire et administrateurs)</label><button>Enregistrer</button></form></div>` : ''}
      <div class="card"><h3>Sessions actives</h3><table>${ses.map(s => `<tr><td>${esc(s.ip)}</td><td class="muted">${esc((s.user_agent || '').slice(0, 60))}</td><td>${fd(s.last_seen)}</td><td>${s.current ? '<b>cette session</b>' : `<button class="sec" data-a="srev" data-id="${s.id}">Déconnecter</button>`}</td></tr>`).join('')}</table>${ses.length > 1 ? '<button class="sec" data-a="srevall">Déconnecter toutes les autres sessions</button>' : ''}</div>
      <div class="card"><h3>Alertes de sécurité</h3>${nt.some(n => n.unread) ? '<button class="sec" data-a="nread">Tout marquer comme lu</button>' : ''}${nt.map(n => `<div class="alert ${n.unread ? '' : 'muted'}"><b>${esc(n.title)}</b> <span class="muted">${fd(n.created_at)}</span><br>${esc(n.text)}</div>`).join('') || '<p class="muted">Aucune alerte.</p>'}</div>
      <div class="card"><h3>Historique des connexions</h3>${all ? `<button class="sec" data-a="hall">${allH ? 'Mes connexions' : 'Toute la clinique'}</button>` : ''}<table><tr><th>Date</th><th>Compte</th><th>Résultat</th><th>Adresse</th></tr>${hist.map(h => `<tr><td>${fd(h.created_at)}</td><td>${esc(h.email)}</td><td class="${h.success ? 'ok' : 'err'}">${h.success ? 'réussie' : esc(h.reason)}</td><td>${esc(h.ip)}</td></tr>`).join('')}</table></div>`
    },
    async care() {
      const id = pid(); if (!id) { $('#view').innerHTML = '<p>Ouvrez un dossier patient puis l\'onglet « Hygiène & examen ».</p>'; return }
      const [rec, hy, ex] = await Promise.all([api(`/patients/${id}/record`), api(`/patients/${id}/hygiene`), api(`/patients/${id}/exams`)]), d = hy.data, ck = k => d[k] ? 'checked' : '', can2 = can('edit_medical_records')
      $('#view').innerHTML = `<p><a href="#record/${id}">← Dossier</a></p><h2>Hygiène & examen — ${esc(rec.patient.last_name)} ${esc(rec.patient.first_name)}</h2>
      <form class="card col" data-f="hyg"><h3>Hygiène bucco-dentaire</h3><div class="row"><input name="toothpaste_brand" placeholder="Marque du dentifrice" value="${esc(d.toothpaste_brand)}"><input name="toothpaste_type" placeholder="Type de dentifrice" value="${esc(d.toothpaste_type)}"><select name="brushing_frequency">${['', '1 fois/jour', '2 fois/jour', '3 fois/jour', 'Irrégulier'].map(o => `<option ${d.brushing_frequency === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="row">${[['fluoride', 'Fluoré'], ['whitening', 'Blanchissant'], ['sensitive', 'Dents sensibles'], ['tartar_control', 'Anti-tartre'], ['natural', 'Naturel'], ['flosses', 'Fil dentaire'], ['mouthwash', 'Bain de bouche']].map(([k, l]) => `<label><input type="checkbox" name="${k}" ${ck(k)}> ${l}</label>`).join('')}</div>
        <input name="other_habits" placeholder="Autres habitudes" value="${esc(d.other_habits)}"><span class="muted">Dernière mise à jour : ${fd(hy.updated_at)}</span>${can2 ? '<button>Enregistrer</button>' : ''}</form>
      ${can2 ? `<form class="card col" data-f="exam"><h3>Nouvel examen stomatologique</h3><div class="row"><input name="head" placeholder="Tête"><input name="face" placeholder="Visage"><input name="atm" placeholder="ATM"><input name="tongue" placeholder="Langue"></div><div class="row"><input name="periodontium" placeholder="Parodonte"><input name="tooth_morphology" placeholder="Morphologie dentaire"></div><input name="observations" placeholder="Observations"><button>Enregistrer l'examen</button></form>` : ''}
      <div class="card"><h3>Historique des examens</h3>${ex.map(e => `<div style="border-left:3px solid var(--b);padding:4px 12px;margin:8px 0"><b>${fd(e.examined_at)}</b> — ${esc(e.doctor)}<br>${[['Tête', e.head], ['Visage', e.face], ['ATM', e.atm], ['Langue', e.tongue], ['Parodonte', e.periodontium], ['Morphologie', e.tooth_morphology], ['Observations', e.observations]].filter(x => x[1]).map(x => `${x[0]} : ${esc(x[1])}`).join(' · ')}</div>`).join('') || '<p class="muted">Aucun examen enregistré.</p>'}</div>`
    },
    async requests() {
      const list = await api('/purchase-requests'), L = { pending: 'En attente', approved: 'Approuvée', rejected: 'Refusée', ordered: 'Commandée' }, ap = can('approve_purchases')
      $('#view').innerHTML = `<h2>Demandes d'achat</h2><form class="card col" data-f="req"><textarea name="lines" rows="3" placeholder="Une ligne par produit : Référence ou nom exact | Quantité | Prix unitaire estimé" required></textarea><input name="note" placeholder="Motif de la demande"><button>Envoyer la demande</button></form>
      <div class="card"><table><tr><th>Date</th><th>Demandeur</th><th>Articles</th><th>Statut</th><th></th></tr>${list.map(r => `<tr><td>${fd(r.created_at)}</td><td>${esc(r.requester)}</td><td>${esc(r.items)}<br><span class="muted">${esc(r.note)}${r.decision_note ? ' — ' + esc(r.decision_note) : ''}</span></td><td>${L[r.status]}${r.decider ? '<br><span class="muted">par ' + esc(r.decider) + '</span>' : ''}</td><td>${ap && r.status === 'pending' ? `<button class="sec" data-a="rqa" data-id="${r.id}">Approuver</button> <button class="sec" data-a="rqr" data-id="${r.id}">Refuser</button> <button class="sec" data-a="rqm" data-id="${r.id}">Modifier</button>` : ''}${ap && r.status === 'approved' ? `<button data-a="rqo" data-id="${r.id}">Commander</button>` : ''}</td></tr>`).join('') || '<tr><td>Aucune demande.</td></tr>'}</table></div>
      <p class="muted">Approuver ne crée pas de stock : la commande doit ensuite être réceptionnée (module Stock). Une demande ne peut pas être approuvée par son auteur, sauf le propriétaire.</p>`
    }
  }
  const lines = s => s.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0]).map(p => ({ product: p[0], qty: p[1], est_unit_price: p[2] || 0 }))
  const submit = {
    async en2fa(e) { const r = await api('/2fa/enable', F(e)); ($('#tfa') || $('#v2fa')).innerHTML = `<h3 class="ok">Double authentification activée</h3><p><b>Codes de secours</b> — notez-les maintenant, ils ne seront plus affichés. Chacun ne sert qu'une fois si vous perdez votre téléphone :</p><pre style="background:#f1f5fb;padding:12px;border-radius:8px">${r.recovery_codes.join('\n')}</pre><button data-a="tfa-done">J'ai noté mes codes</button>` },
    async dis2fa(e) { await api('/2fa/disable', F(e)); toast('Double authentification désactivée'); location.reload() },
    async secset(e) { const f = F(e); await api('/settings/security', { inactivity_minutes: Number(f.inactivity_minutes), require_2fa: 'require_2fa' in f }, 'PUT'); toast('Paramètres enregistrés'); render() },
    async hyg(e) { const f = F(e), d = {}; for (const k of ['toothpaste_brand', 'toothpaste_type', 'brushing_frequency', 'other_habits']) d[k] = f[k]; for (const k of ['fluoride', 'whitening', 'sensitive', 'tartar_control', 'natural', 'flosses', 'mouthwash']) d[k] = k in f; await api(`/patients/${pid()}/hygiene`, d); toast('Hygiène enregistrée'); render() },
    async exam(e) { await api(`/patients/${pid()}/exams`, F(e)); toast('Examen enregistré'); render() },
    async req(e) { const f = F(e); await api('/purchase-requests', { note: f.note, items: lines(f.lines) }); toast('Demande envoyée'); render() }
  }
  const click = async (b, a, id) => {
    if (a === 'tfa-start') { await flow($('#tfa')) } else if (a === 'tfa-done') location.reload()
    else if (a === 'srev') { await api(`/sessions/${id}/revoke`, {}); render() } else if (a === 'srevall') { await api('/sessions/revoke-others', {}); toast('Autres sessions déconnectées'); render() }
    else if (a === 'nread') { await api('/notifications/read', {}); render() } else if (a === 'hall') { allH = !allH; render() }
    else if (a === 'rqa') { await api(`/purchase-requests/${id}/approve`, {}); toast('Demande approuvée'); render() }
    else if (a === 'rqr') { const n = prompt('Motif du refus (obligatoire) :'); if (!n) return true; await api(`/purchase-requests/${id}/reject`, { note: n }); render() }
    else if (a === 'rqm') { const v = prompt('Nouvelles lignes (Réf | Quantité | Prix estimé), séparées par « ; » :'); if (!v) return true; await api(`/purchase-requests/${id}/modify`, { items: lines(v.replace(/;/g, '\n')) }); render() }
    else if (a === 'rqo') { const cur = (prompt('Devise (HTG ou USD) :', 'HTG') || '').toUpperCase(); if (!cur) return true; const name = prompt('Fournisseur (nom exact, vide = aucun) :', ''), sup = (await api('/suppliers')).find(s => s.name === name)
      await api(`/purchase-requests/${id}/order`, { currency: cur, supplier_id: sup?.id }); toast('Commande créée : réceptionnez-la dans Stock'); render() }
    else return false
    return true
  }
  return { views, submit, click, mount2fa }
}
