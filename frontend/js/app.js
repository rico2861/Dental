import { ic } from './icons.js'
import './ui.js'
import install7 from './views7.js'
import install from './views2.js'
import install3 from './views3.js'
import install4 from './views4.js'
import install5 from './views5.js'
import install6 from './views6.js'
import install8 from './views8.js'
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmt = d => d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince' }) : '—'
async function api(p, body, method) {
  const r = await fetch('/api' + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({})); if (!r.ok) { if (r.status === 401 && me) { me = null; challenge = null; render(); toast(j.error || 'Session terminée') } else if (j.code === 'TWOFA_SETUP_REQUIRED' || j.code === 'PASSWORD_CHANGE_REQUIRED') boot(); throw Object.assign(new Error(j.error || 'Erreur'), { code: j.code, status: r.status }) } return j }
function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 4000) }
const TOOTH = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#fff"><path d="M12 2.5c-1.6 0-2.6.6-4 .6-2.2 0-4 1.8-4 4.6 0 2.2.8 3.6 1.4 5.6.6 2 .7 4.6 1.6 6.4.5 1 1.5 1.3 2.2.3.7-1 .8-3.3 1.4-4.4.3-.6.9-.9 1.4-.9s1.1.3 1.4.9c.6 1.1.7 3.4 1.4 4.4.7 1 1.7.7 2.2-.3.9-1.8 1-4.4 1.6-6.4.6-2 1.4-3.4 1.4-5.6 0-2.8-1.8-4.6-4-4.6-1.4 0-2.4-.6-4-.6z"/></svg>'
const authShell = inner => `<div class="auth"><aside class="abrand"><div class="alogo">${TOOTH}</div><h1>DENTAL LIGHT</h1><p class="tag">La gestion de votre clinique dentaire, simple et sécurisée.</p><ul><li>Dossiers patients et plans de traitement</li><li>Facturation multi-devises et caisse</li><li>Rendez-vous, stock et rapports</li></ul></aside><main class="apanel"><div class="acard">${inner}</div></main></div>`
let pstatus = 'active', me = null, page = 0, search = '', challenge = null, lastAct = Date.now()
const can = p => me.perms.includes(p)
const NAV = [['dashboard', 'Tableau de bord', 1, 'tableau-de-bord', 'grid'], ['patients', 'Patients', 'view_all_patients', 'patients', 'users'], ['record', 'Dossiers', 'view_medical_records', 'dossiers', 'folder'], ['cal', 'Calendrier', 'manage_appointments', 'calendrier', 'calendar'], ['appts', 'Rendez-vous', 'manage_appointments', 'rendez-vous', 'clock'], ['plans', 'Plans de traitement', 'manage_treatment_plans', 'plans-de-traitement', 'clipboard'], ['pros', 'Prothèses', 'manage_prostheses', 'protheses', 'tool'], ['perf', 'Médecins', 'staff_stats', 'medecins', 'activity'], ['billing', 'Facturation', 'view_finances', 'facturation', 'file'], ['debts', 'Dettes patients', 'view_finances', 'dettes', 'wallet'], ['cash', 'Caisse & dépenses', 'view_finances', 'caisse-depenses', 'wallet'], ['rates', 'Taux de change', 'view_finances', 'taux-de-change', 'dollar'], ['stock', 'Stock', 'manage_inventory', 'stock', 'package'], ['requests', "Demandes d'achat", 'manage_inventory', 'demandes-achat', 'cart'], ['hr', 'Personnel & paie', 'view_salaries', 'personnel-paie', 'briefcase'], ['reports', 'Rapports', 1, 'rapports', 'chart'], ['users', 'Utilisateurs', 'manage_users', 'utilisateurs', 'sliders'], ['security', 'Mon profil', 1, 'profil', 'user'], ['tariffs', 'Tarifs des soins', 1, 'tarifs', 'receipt'], ['backups', 'Sauvegardes', 'admin_only', 'sauvegardes', 'shield'], ['audit', 'Journal', 'view_audit_logs', 'journal', 'list']]
const isAdmin = () => !!me && (me.role === 'OWNER' || String(me.role).startsWith('ADMIN'))
// Accès à une entrée du menu : 1 = tout le monde ; 'staff_stats' = statistiques des médecins (direction et finances uniquement)
const allowed = n => n[2] === 1 || (n[2] === 'staff_stats' ? isAdmin() || can('view_finances') : n[2] === 'admin_only' ? isAdmin() : can(n[2]))
async function boot() { try { me = await api('/me') } catch { me = null } render() }
const GROUPS = [['Principal', ['dashboard', 'patients', 'record', 'cal', 'appts']], ['Soins', ['plans', 'pros', 'perf', 'tariffs']], ['Finances', ['billing', 'debts', 'cash', 'rates']], ['Gestion', ['stock', 'requests', 'hr', 'reports']], ['Administration', ['users', 'backups', 'audit']]]
const ROLE_L = { OWNER: 'Propriétaire', ADMIN: 'Administrateur', ADMIN_MEDICAL: 'Admin. médical', ADMIN_FINANCIER: 'Admin. financier', DENTIST: 'Médecin dentiste', DENTAL_ASSISTANT: 'Assistant(e)', SECRETARY: 'Secrétariat', ACCOUNTANT: 'Comptable', STOCK_MANAGER: 'Gestion du stock', DENTAL_TECH: 'Prothésiste', STAFF: 'Personnel' }
// Menu réduit (icônes seules) mémorisé sur ce poste ; sur téléphone, le menu s'ouvre en tiroir
const mini = () => { try { return localStorage.getItem('dl_side_mini') === '1' } catch { return false } }
document.addEventListener('click', e => { const b = e.target.closest('[data-side]'); if (b) { const k = b.dataset.side
    if (k === 'mini') { try { localStorage.setItem('dl_side_mini', mini() ? '0' : '1') } catch {} render() }
    else document.body.classList.toggle('sopen', k === 'open'); return }
  if (e.target.closest('.side .snav a, .side .sme')) document.body.classList.remove('sopen') })
// Barre latérale regroupée par sections + barre du haut (titre, recherche patient, nouveau patient, alertes, menu du compte)
function layoutHtml(nv, h) {
  const av = esc((me.first_name[0] || '') + (me.last_name?.[0] || '')), byKey = Object.fromEntries(NAV.map(n => [n[0], n])), srch = can('view_all_patients') || can('view_medical_records'), role = ROLE_L[me.role] || esc(me.role)
  const side = GROUPS.map(([g, keys]) => { const items = keys.map(k => byKey[k]).filter(n => n && allowed(n))
    return items.length ? `<div class="sg"><span class="sgl">${g}</span>${items.map(n => `<a href="#${n[3]}" class="${h === n[0] ? 'on' : ''}" ${mini() ? `title="${n[1]}"` : ''}><span class="ni">${ic(n[4], 18)}</span><span class="nl">${n[1]}</span></a>`).join('')}</div>` : '' }).join('')
  return `<div class="layout${mini() ? ' mini' : ''}"><div class="sdim" data-side="close"></div><nav class="side" aria-label="Menu principal"><div class="brand"><span class="bl">${ic('tooth', 20)}</span><span class="bt">DENTAL LIGHT<small>Gestion de clinique</small></span><button class="scol" data-side="mini" aria-label="${mini() ? 'Déplier le menu' : 'Réduire le menu'}">${ic(mini() ? 'right' : 'left', 16)}</button><button class="sx" data-side="close" aria-label="Fermer le menu">${ic('x', 18)}</button></div><div class="snav">${side}</div>
    <div class="sfoot"><a class="sme ${h === 'security' ? 'on' : ''}" href="#profil" ${mini() ? 'title="Mon profil"' : ''}><span class="av">${av}</span><span class="hn"><b>${esc(me.first_name)} ${esc(me.last_name || '')}</b><small>${role}</small></span></a><button class="slo" data-a="logout" aria-label="Déconnexion" ${mini() ? 'title="Déconnexion"' : ''}>${ic('logout', 17)}</button></div></nav>
    <div class="mainwrap"><header class="top"><div class="tl"><button class="hamb" data-side="open" aria-label="Ouvrir le menu">${ic('list', 20)}</button><span class="tico">${ic(nv?.[4] || 'grid', 18)}</span><div class="ptitle">${esc(nv?.[1] || '')}<small>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div></div>
      ${srch ? `<label class="gsearch">${ic('search', 17)}<input name="patient_file" data-go="1" placeholder="Rechercher un patient…" autocomplete="off" aria-label="Rechercher un patient"><kbd>/</kbd></label>` : '<span class="gsp"></span>'}
      <div class="tr">${can('create_patients') ? `<button class="tnew" data-pnew="1">${ic('plus', 17)}<span>Nouveau patient</span></button>` : ''}<div class="bellw"><button class="ibtn" id="bell" aria-label="Alertes">${ic('bell', 20)}<span class="bdg" id="bdg" hidden></span></button><div class="bp" id="bp" hidden></div></div>
      <div class="umw"><button class="usr" id="umb" aria-label="Mon compte"><span class="av">${av}</span><span class="un">${esc(me.first_name)}<small>${role}</small></span>${ic('down', 14).replace('class="ic"', 'class="ic chev"')}</button>
        <div class="umenu" id="umenu" hidden><div class="umh"><span class="av">${av}</span><div><b>${esc(me.first_name)} ${esc(me.last_name || '')}</b><small>${role}</small></div></div><a href="#profil">${ic('user', 16)} Mon profil</a><a href="#profil">${ic('lock', 16)} Changer le mot de passe</a><button data-a="logout">${ic('logout', 16)} Déconnexion</button></div></div></div></header>
    <main class="main" id="view">Chargement…</main></div></div>` }
function render() {
  const app = $('#app')
  if (!me && challenge) return app.innerHTML = authShell(`<h2>Vérification en deux étapes</h2><p class="sub">Saisissez le code à 6 chiffres de votre application d'authentification, ou un code de secours.</p><form data-f="otp" class="af"><label>Code de vérification<input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" required autofocus></label><div class="aerr" id="authErr" role="alert" hidden></div><button class="abtn">Valider</button></form><button class="alink" data-a="cancelotp">${ic('left', 16)} Retour à la connexion</button>`)
  if (!me) return app.innerHTML = authShell(`<h2>Connexion</h2><p class="sub">Entrez vos identifiants pour accéder à la clinique.</p><form data-f="login" class="af"><label>Adresse e-mail<input name="email" type="email" placeholder="vous@clinique.com" required autocomplete="username" autofocus></label><label>Mot de passe<span class="pw"><input name="password" type="password" placeholder="••••••••••" required autocomplete="current-password"><button type="button" class="eye" aria-label="Afficher le mot de passe"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></span></label><div class="aerr" id="authErr" role="alert" hidden></div><button class="abtn">Se connecter</button></form><p class="foot">${ic('lock', 14)} Connexion sécurisée · accès réservé au personnel autorisé</p>`)
  if (me.must_change_password) return app.innerHTML = authShell(`<h2>Nouveau mot de passe</h2><p class="sub">Pour votre sécurité, remplacez le mot de passe temporaire. Minimum 10 caractères avec majuscule, minuscule et chiffre.</p><form data-f="pw" class="af"><label>Mot de passe temporaire<input name="current" type="password" required autocomplete="current-password"></label><label>Nouveau mot de passe<input name="next" type="password" placeholder="10+ caractères, Aa1" required autocomplete="new-password"></label><div class="aerr" id="authErr" role="alert" hidden></div><button class="abtn">Enregistrer</button></form>`)
  if (me.needs_2fa_setup) { app.innerHTML = '<div class="center card" id="v2fa"></div>'; V.mount2fa($('#v2fa')); return }
  const parts = location.hash.slice(1).split('/'), nv = NAV.find(n => n[3] === parts[0] || n[0] === parts[0]) || (parts[0] ? null : NAV[0]), h = nv?.[0]
  // Page inconnue ou non autorisée : on ne révèle rien, retour silencieux au tableau de bord
  if (!nv || !allowed(nv)) { history.replaceState(null, '', '#tableau-de-bord'); return render() }
  app.innerHTML = layoutHtml(nv, h)
  views[h]?.().catch(e => { $('#view').innerHTML = `<p class="err">${esc(e.message)}</p>` }); loadAlerts()
}
const views = {
  async dashboard() { const d = await api('/dashboard'); $('#view').innerHTML = `<h2>Bonjour ${esc(me.first_name)}</h2><div class="grid">${'patients_active' in d ? `<div class="card"><div>Patients actifs</div><div class="kpi">${d.patients_active}</div></div><div class="card"><div>Nouveaux ce mois</div><div class="kpi">${d.patients_new_month}</div></div>` : ''}${'rate' in d ? `<div class="card"><div>Taux actuel</div><div class="kpi">${d.rate ? '1 USD = ' + esc(d.rate) + ' HTG' : 'Non défini'}</div></div>` : ''}${[['appointments_today', 'RDV aujourd\'hui'], ['appointments_upcoming', 'RDV à venir'], ['patients_to_recall', 'Patients à revoir'], ['plans_in_progress', 'Plans en cours'], ['prostheses_in_progress', 'Prothèses en cours']].filter(([k]) => k in d).map(([k, l]) => `<div class="card"><div>${l}</div><div class="kpi">${d[k]}</div></div>`).join('')}</div><p class="muted">Les indicateurs affichés dépendent de vos permissions.</p>` },
  async patients() {
    $('#view').innerHTML = `<div class="ph"><div><h2>Patients</h2><span class="muted" id="pcount">Chargement…</span></div><div class="row"><select id="pstat" class="selm"><option value="active">Dossiers actifs</option><option value="archived">Dossiers inactifs</option><option value="all">Tous les dossiers</option></select>${can('create_patients') ? `<button data-pnew="1">${ic('plus', 18)} Nouveau patient</button>` : ''}</div></div>
    <div class="card"><div class="sbox">${ic('search', 18)}<input id="psearch" placeholder="Rechercher : nom, prénom, téléphone ou n° de dossier…" value="${esc(search)}" autocomplete="off"><button type="button" class="sec" data-clear="1" aria-label="Effacer">${ic('x', 16)}</button></div><div id="plist"></div></div>`
    $('#pstat').value = pstatus; await loadPatients() },
  async rates() { const rows = await api('/rates')
    $('#view').innerHTML = `<h2>Paramètres ${ic('right', 18)} Finances ${ic('right', 18)} Taux de change</h2>${can('manage_exchange_rates') ? `<form class="card row" data-f="rate"><label>1 USD = <input name="rate" inputmode="decimal" required style="width:110px"> HTG</label><input name="justification" placeholder="Justification (facultatif)"><button>Appliquer</button></form>` : ''}
    <div class="card"><table><tr><th>Date</th><th>Taux</th><th>Par</th><th>Justification</th></tr>${rows.map(r => `<tr><td>${fmt(r.effective_at)}</td><td>${esc(r.rate)}</td><td>${esc(r.by)}</td><td>${esc(r.justification)}</td></tr>`).join('') || '<tr><td>Aucun taux.</td></tr>'}</table></div>` },
  async users() { const rows = await api('/users'), roles = ['ADMIN', 'ADMIN_MEDICAL', 'ADMIN_FINANCIER', 'DENTIST', 'DENTAL_ASSISTANT', 'SECRETARY', 'ACCOUNTANT', 'STOCK_MANAGER', 'DENTAL_TECH', 'STAFF']
    $('#view').innerHTML = `<h2>Utilisateurs</h2><form class="card row" data-f="user"><input name="first_name" placeholder="Prénom" required><input name="last_name" placeholder="Nom" required><input name="email" type="email" placeholder="Email" required><select name="role">${roles.filter(r => me.role === 'OWNER' || !r.startsWith('ADMIN')).map(r => `<option>${r}</option>`).join('')}</select><button>Créer</button></form>
    <div class="card"><table><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th></th></tr>${rows.map(u => `<tr><td>${esc(u.first_name)} ${esc(u.last_name)}</td><td>${esc(u.email)}</td><td><span class="badge">${esc(u.role)}</span></td><td>${esc(u.status)}</td><td>${fmt(u.last_login_at)}</td><td>${u.role === 'OWNER' || u.id === me.id ? '' : `<button class="sec" data-a="${u.status === 'active' ? 'block' : 'unblock'}" data-id="${u.id}">${u.status === 'active' ? 'Bloquer' : 'Débloquer'}</button> <button class="sec" data-a="reset" data-id="${u.id}">Réinit. mdp</button>`}</td></tr>`).join('')}</table></div>` },
  async audit() { const rows = await api('/audit'); $('#view').innerHTML = `<h2>Journal d'activité</h2><div class="card"><table><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet</th></tr>${rows.map(a => `<tr><td>${fmt(a.created_at)}</td><td>${esc(a.who)}</td><td>${esc(a.action)}</td><td>${esc(a.table_name)}</td></tr>`).join('')}</table></div>` }
}
async function loadPatients() {
  if (!$('#plist')) return
  const r = await api(`/patients?page=${page}&status=${pstatus}&q=${encodeURIComponent(search)}`); const el = $('#plist'); if (!el) return
  const pages = Math.max(1, Math.ceil(r.total / 20)), rec = can('view_medical_records'), adm = isAdmin(), dt = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
  $('#pcount').textContent = `${r.total} patient${r.total > 1 ? 's' : ''}${search ? ' trouvé' + (r.total > 1 ? 's' : '') : ''}`
  el.innerHTML = (r.rows.length ? `<div class="tw"><table class="ptable"><tr><th>N° dossier</th><th>Patient</th><th>Âge / sexe</th><th>Téléphone</th><th>Statut</th><th></th></tr>${r.rows.map(p => `<tr class="${p.status === 'archived' ? 'inact' : ''}"><td><span class="fn" data-copy="${esc(p.file_number)}" data-tip="Copier le n° de dossier">${esc(p.file_number)}</span></td><td>${rec ? `<a href="#dossiers/${p.id}">${esc(p.last_name)} ${esc(p.first_name)}</a>` : esc(p.last_name + ' ' + p.first_name)}</td><td>${p.age ?? '—'}${p.sex ? ' · ' + esc(p.sex) : ''}</td><td>${esc(p.phone) || '—'}</td><td>${p.status === 'archived' ? `<span class="badge st-off" data-tip="Désactivé le ${dt(p.deleted_at)} par ${esc(p.deleted_by_name)}\nMotif : ${esc(p.delete_reason)}">Inactif</span>` : '<span class="badge st-ok">Actif</span>'}</td><td class="act">${rec ? `<a class="ibtn" href="#dossiers/${p.id}" data-tip="Ouvrir le dossier">${ic('folder', 18)}</a>` : ''}${adm ? (p.status === 'archived' ? `<button class="ibtn" data-prest="${p.id}" data-tip="Réactiver le dossier">${ic('undo', 18)}</button>` : `<button class="ibtn dng" data-parch="${p.id}" data-name="${esc(p.last_name + ' ' + p.first_name)}" data-tip="Désactiver le dossier">${ic('trash', 18)}</button>`) : ''}</td></tr>`).join('')}</table></div>`
    : `<div class="empty"><div class="eico">${ic('tooth', 40)}</div><b>${search ? 'Aucun résultat' : 'Aucun patient pour le moment'}</b><span class="muted">${search ? 'Essayez un autre nom ou un autre n° de dossier.' : 'Cliquez sur « Nouveau patient » pour créer le premier dossier.'}</span></div>`)
    + (r.total > 20 ? `<div class="row pager"><button class="sec" data-a="prev" ${page ? '' : 'disabled'}>${ic('left', 16)} Précédent</button><span>Page ${page + 1} / ${pages}</span><button class="sec" data-a="next" ${(page + 1) * 20 >= r.total ? 'disabled' : ''}>Suivant ${ic('right', 16)}</button></div>` : '') }
async function patientModal() {
  const today = new Date().toISOString().slice(0, 10), docs = await api('/doctors').catch(() => [])
  const f = (l, n, o = '', cls = '', icon = '') => `<label class="${cls}"><span class="fl">${l}</span>${icon ? `<span class="iw">${ic(icon, 16)}<input name="${n}" ${o}></span>` : `<input name="${n}" ${o}>`}</label>`
  const s = (l, n, opts, cls = '', none = 'Non renseigné') => `<label class="${cls}"><span class="fl">${l}</span><select name="${n}"><option value="">${none}</option>${opts.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}">${esc(o[1])}</option>` : `<option>${o}</option>`).join('')}</select></label>`
  const pills = (n, opts, v = '') => `<div class="pills">${opts.map(([val, l]) => `<label class="pill"><input type="radio" name="${n}" value="${val}" ${val === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`
  const sec = (icon, t, d, body) => `<section class="fsec"><div class="fsh"><span class="fsi">${ic(icon, 17)}</span><div><b>${t}</b>${d ? `<small>${d}</small>` : ''}</div></div>${body}</section>`
  const COND = [['diabetes', 'Diabète'], ['cardiovascular', 'Maladie cardiaque'], ['hemophilia', 'Hémophilie'], ['pregnancy', 'Enceinte'], ['epilepsy', 'Épilepsie'], ['hiv', 'VIH / Sida'], ['pulmonary', 'Maladie pulmonaire'], ['smoking', 'Fumeur'], ['cancer', 'Cancer']]
  let made = null
  await ui.dialog({ title: 'Nouveau patient', sub: 'Le n° de dossier est attribué automatiquement et ne change jamais. Les champs marqués * sont obligatoires.', icon: 'users', size: 'xl',
    html: sec('user', 'Identité', '', `<div class="fg">${f('Nom <i>*</i>', 'last_name', 'required autocomplete="off" placeholder="Ex : Joseph"')}${f('Prénom <i>*</i>', 'first_name', 'required autocomplete="off" placeholder="Ex : Marie-Ange"')}${f('Date de naissance', 'birth_date', `type="date" max="${today}"`)}${f('Lieu de naissance', 'birth_place', 'placeholder="Ex : Jacmel"')}<label><span class="fl">Sexe</span>${pills('sex', [['M', 'Masculin'], ['F', 'Féminin']])}</label>${f("Pièce d'identité (CIN / NIF)", 'id_number', 'placeholder="Facultatif"', '', 'lock')}</div>`)
      + sec('phone', 'Coordonnées', '', `<div class="fg">${f('Téléphone <i>*</i>', 'phone', 'required inputmode="tel" placeholder="+509 …"', '', 'phone')}${f('Téléphone 2', 'phone2', 'inputmode="tel" placeholder="Facultatif"', '', 'phone')}${f('E-mail', 'email', 'type="email" placeholder="Facultatif"', 's2', 'mail')}${f('Adresse <i>*</i>', 'address', 'required placeholder="Rue, numéro, quartier"', 's2', 'pin')}${f('Département', 'department', 'placeholder="Ex : Ouest"')}${f('Zone / commune', 'zone', 'placeholder="Ex : Delmas"')}</div>`)
      + sec('alert', "Contact en cas d'urgence", 'Personne à prévenir si nécessaire', `<div class="fg">${f('Nom de la personne <i>*</i>', 'emergency_contact', 'required placeholder="Ex : Jean Joseph (frère)"', '', 'user')}${f('Téléphone <i>*</i>', 'emergency_phone', 'required inputmode="tel" placeholder="+509 …"', '', 'phone')}</div>`)
      + sec('heart', 'Santé', 'Important avant tout soin', `<div class="fq"><span class="fl">Le patient a-t-il des allergies ?</span>${pills('has_allergy', [['no', 'Non'], ['yes', 'Oui'], ['unknown', 'Ne sait pas']], 'no')}</div>
        <div class="algy" hidden><span class="fl">Allergies connues</span><div class="chipsel">${['Pénicilline', 'Anesthésiques locaux', 'Latex', 'Aspirine / anti-inflammatoires', 'Iode'].map(a => `<label class="chk"><input type="checkbox" name="allergy_items" value="${a}"><span>${ic('check', 13)}${a}</span></label>`).join('')}</div>${f('Autres précisions', 'allergy_other', 'placeholder="Autre allergie, réaction connue…"')}</div>
        <span class="fl" style="display:block;margin:14px 0 8px">Antécédents (touchez ce qui s'applique)</span><div class="togs">${COND.map(([k, l]) => `<label class="tog"><input type="checkbox" name="${k}"><span>${ic('check', 14)}${l}</span></label>`).join('')}</div>
        <div class="fg" style="margin-top:12px">${s('Groupe sanguin', 'blood_group', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], '', 'Inconnu')}${f('Médicaments en cours', 'medications', 'placeholder="Ex : Metformine, aspirine…"')}</div>`)
      + sec('clipboard', 'Suivi et assurance', '', `<div class="fg">${s('Médecin traitant', 'primary_doctor_id', docs.map(d => [d.id, d.name]), '', 'À attribuer plus tard')}${s('Référé par', 'referred_by', ['Bouche à oreille', 'Patient de la clinique', 'Médecin', 'Réseaux sociaux', 'Radio / télévision', 'Passage devant la clinique', 'Autre'])}
        ${f('Assurance', 'insurance', 'placeholder="Nom de l\'assureur (facultatif)"')}${f("N° d'assuré", 'insurance_number', 'placeholder="Facultatif"')}${f('Motif de la première visite', 'motif', 'placeholder="Ex : douleur, contrôle, détartrage…"', 's2')}<label class="s2"><span class="fl">Notes</span><textarea name="notes" rows="2" placeholder="Informations utiles pour l'équipe (facultatif)"></textarea></label></div>`)
      + sec('briefcase', 'Situation', 'Facultatif', `<div class="fg">${s('Statut matrimonial', 'marital_status', ['Célibataire', 'Marié(e)', 'Union libre', 'Divorcé(e)', 'Veuf / veuve'])}${f("Nombre d'enfants", 'children_count', 'type="number" min="0" max="30" placeholder="0"')}${f('Profession', 'profession', 'placeholder="Ex : Enseignante"', 's2')}</div>`),
    onOpen: md => md.addEventListener('change', e => { if (e.target.name === 'has_allergy') md.querySelector('.algy').hidden = e.target.value !== 'yes' }),
    buttons: [{ label: 'Annuler', cls: 'sec', value: null }, { label: `${ic('check', 16)} Créer le dossier`, cls: 'pri', collect: true, submit: async v => { const al = v.has_allergy === 'yes' ? [v.allergy_items, v.allergy_other].filter(Boolean).join(', ') : ''; if (v.has_allergy === 'yes' && !al) throw new Error('Indiquez au moins une allergie, ou choisissez « Non » / « Ne sait pas ».'); made = await api('/patients', { ...v, sex: v.sex || '', allergies: al }) } }] })
  if (made) { toast('Patient créé — n° de dossier ' + made.file_number); location.hash = '#dossiers/' + made.id } }
const notified = new Set()
async function loadAlerts() {
  if (!me || !can('manage_appointments')) return
  const day = x => new Date(x).toISOString().slice(0, 10), now = Date.now(); let list; try { list = await api(`/appointments?from=${day(now - 864e5)}&to=${day(now + 2 * 864e5)}`) } catch { return }
  const soon = list.filter(a => ['planned', 'confirmed'].includes(a.status) && new Date(a.starts_at) > now - 15 * 6e4 && new Date(a.starts_at) < now + 36 * 36e5).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const b = $('#bdg'), p = $('#bp'), rel = a => { const m = Math.round((new Date(a.starts_at) - now) / 6e4); return m <= 0 ? 'maintenant' : m < 60 ? `dans ${m} min` : `dans ${Math.round(m / 60)} h` }
  if (b) { b.textContent = soon.length; b.hidden = !soon.length }
  if (p) p.innerHTML = `<div class="bph">Rendez-vous à venir</div>${soon.map(a => `<a class="bpi" href="#dossiers/${a.patient_id}"><b>${esc(a.patient)}</b><span>${new Date(a.starts_at).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${rel(a)}</span></a>`).join('') || '<div class="bpe">Aucun rendez-vous dans les 36 prochaines heures.</div>'}<a class="bpa" href="#calendrier">Ouvrir le calendrier</a>`
  for (const a of soon) { const m = (new Date(a.starts_at) - now) / 6e4; if (m > 0 && m <= 30 && !notified.has(a.id)) { notified.add(a.id); toast(`Rendez-vous ${rel(a)} : ${a.patient}`) } } }
setInterval(() => { if (me) loadAlerts() }, 60000)
const F = e => Object.fromEntries(new FormData(e.target))
const submit = {
  async login(e) { const r = await api('/login', F(e)); if (r.need_otp) { challenge = r.challenge; render() } else await boot() },
  async otp(e) { await api('/login/otp', { challenge, code: F(e).code }); challenge = null; await boot() },
  async pw(e) { await api('/change-password', F(e)); toast('Mot de passe modifié'); location.hash = ''; await boot() },
  async search(e) { search = F(e).q; page = 0; render() },
  async patient(e) { const r = await api('/patients', F(e)); toast('Patient créé — n° de dossier ' + r.file_number); search = r.file_number; page = 0; render() },
  async rate(e) { if (!await ui.confirm('Enregistrer ce taux ? Les anciennes transactions ne seront pas modifiées.')) return; await api('/rates', F(e)); toast('Taux enregistré'); render() },
  async user(e) { const r = await api('/users', F(e)); await ui.alert('Mot de passe temporaire (affiché une seule fois) :\n\n' + r.temporary_password); render() }
}
const X = install({ $, esc, api, can, toast, render: () => render() }); Object.assign(views, X.views); Object.assign(submit, X.submit)
const Y = install3({ $, esc, api, can, toast, render: () => render() }); Object.assign(views, Y.views); Object.assign(submit, Y.submit)
const Z = install4({ $, esc, api, can, toast, render: () => render(), me: () => me }); Object.assign(views, Z.views); Object.assign(submit, Z.submit)
const W = install5({ $, esc, api, can, toast, render: () => render(), me: () => me }); Object.assign(views, W.views); Object.assign(submit, W.submit)
const V = install6({ $, esc, api, can, toast, render: () => render() }); Object.assign(views, V.views); Object.assign(submit, V.submit)
const S8 = install8({ $, esc, api, toast, render: () => render() }); Object.assign(views, S8.views); Object.assign(submit, S8.submit)
const U = install7({ $, esc, api, can, toast, render: () => render(), me: () => me, isAdmin }); Object.assign(views, U.views); Object.assign(submit, U.submit)
document.addEventListener('submit', async e => { const f = e.target.dataset.f; if (!f) return; e.preventDefault()
  const b = e.target.querySelector('.abtn'), err = $('#authErr'), txt = b && b.textContent
  if (err) err.hidden = true; if (b) { b.disabled = true; b.textContent = 'Veuillez patienter…' }
  try { await submit[f](e) } catch (x) { toast(x.message); const a = $('#authErr'); if (a) { a.textContent = x.message; a.hidden = false } if (b && b.isConnected) { b.disabled = false; b.textContent = txt } } })
document.addEventListener('click', e => { const t = e.target.closest('.eye'); if (!t) return; const i = t.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password' })
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id
  try {
    if (await X.click(b, a, id)) return
    if (await Y.click(b, a, id)) return
    if (await Z.click(b, a, id)) return
    if (await W.click(b, a, id)) return
    if (await V.click(b, a, id)) return
    if (await S8.click(b, a, id)) return
    if (a === 'cancelotp') { challenge = null; render(); return }
    if (a === 'logout') { await api('/logout', {}); me = null; render() }
    else if (a === 'prev') { page--; render() } else if (a === 'next') { page++; render() }
    else if (a === 'block' && await ui.confirm('Bloquer ce compte ? Ses sessions seront révoquées.')) { await api(`/users/${id}/status`, { status: 'blocked' }); render() }
    else if (a === 'unblock') { await api(`/users/${id}/status`, { status: 'active' }); render() }
    else if (a === 'reset' && await ui.confirm('Réinitialiser le mot de passe ?')) { const r = await api(`/users/${id}/reset-password`, {}); await ui.alert('Mot de passe temporaire :\n\n' + r.temporary_password) }
  } catch (x) { toast(x.message) }
})

// ── Infobulle globale (survol / toucher) ──
const tip = document.createElement('div'); tip.id = 'tip'; document.body.appendChild(tip)
const showTip = e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) { tip.style.display = 'none'; return }
  tip.textContent = t.dataset.tip; tip.style.display = 'block'; const w = tip.offsetWidth, h = tip.offsetHeight; let x = e.clientX + 14, y = e.clientY + 16
  if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y + h > innerHeight - 8) y = e.clientY - h - 14; tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px' }
document.addEventListener('mousemove', showTip); document.addEventListener('click', showTip); document.addEventListener('scroll', () => { tip.style.display = 'none' }, true)
// ── Recherche patients en direct, copie du n° de dossier ──
let lst; document.addEventListener('input', e => { if (e.target.id !== 'psearch') return; clearTimeout(lst); lst = setTimeout(() => { search = e.target.value.trim(); page = 0; loadPatients().catch(x => toast(x.message)) }, 250) })
document.addEventListener('click', e => {
  const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard?.writeText(c.dataset.copy).then(() => toast('N° de dossier copié : ' + c.dataset.copy)).catch(() => {}); return }
  if (e.target.closest('[data-clear]')) { const i = $('#psearch'); if (i) { i.value = ''; search = ''; page = 0; i.focus(); loadPatients().catch(x => toast(x.message)) } } })
// ── Dans les formulaires : taper un nom propose les n° de dossier correspondants (et inversement) ──
// Sélecteur de patient : on tape le nom (ou le téléphone, ou le n°) et on choisit dans une liste claire.
const pk = document.createElement('div'); pk.className = 'ppk'; pk.hidden = true; pk.setAttribute('role', 'listbox'); document.body.appendChild(pk)
let pkIn = null, pkRows = [], pkI = -1, pkT, pkSeq = 0
const pkPlace = () => { if (!pkIn) return; const r = pkIn.getBoundingClientRect(), below = innerHeight - r.bottom > 300; pk.style.left = Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 300) - 8)) + 'px'; pk.style.width = Math.max(r.width, 300) + 'px'
  pk.style.top = below ? (r.bottom + 6) + 'px' : ''; pk.style.bottom = below ? '' : (innerHeight - r.top + 6) + 'px' }
const pkDraw = () => { const q = pkIn.value.trim()
  pk.innerHTML = `<div class="pph">${ic('search', 14)} ${q ? `Résultats pour « ${esc(q)} »` : 'Tapez le nom, le téléphone ou le n° de dossier'}</div>` + (pkRows.length ? pkRows.map((r, i) => `<button type="button" class="ppi${i === pkI ? ' on' : ''}" data-pi="${i}" role="option"><span class="dav xs">${esc((r.last_name[0] || '') + (r.first_name[0] || ''))}</span><span class="hn"><b>${esc(r.last_name)} ${esc(r.first_name)}</b><small>${r.phone ? ic('phone', 12) + ' ' + esc(r.phone) : 'Pas de téléphone'}</small></span><span class="fn sm">${esc(r.file_number)}</span></button>`).join('') : `<div class="ppe">${ic('users', 22)}<span>Aucun patient trouvé${q ? ' pour « ' + esc(q) + ' »' : ''}</span></div>`)
  pkPlace(); pk.hidden = false }
const pkLoad = async () => { const s = ++pkSeq, inp = pkIn; let rows = []; try { rows = await api('/patients/lookup?q=' + encodeURIComponent(inp.value.trim())) } catch {}
  if (s !== pkSeq || inp !== pkIn || document.activeElement !== inp) return; pkRows = rows; pkI = rows.length ? 0 : -1; pkDraw() }
const pkHint = (inp, txt) => { let h = inp.parentElement.querySelector(':scope > .pkh'); if (!txt) { h?.remove(); return } if (!h) { h = document.createElement('span'); h.className = 'pkh'; inp.after(h) } h.innerHTML = `${ic('check', 13)} ${txt}` }
// ouvre le dossier : l'identifiant vient de la recherche, sinon on le retrouve par le n° de dossier
const goPatient = async r => { let pid = r.id; if (!pid) { try { pid = (await api('/patients?q=' + encodeURIComponent(r.file_number))).rows.find(x => x.file_number === r.file_number)?.id } catch {} } if (pid) location.hash = '#dossiers/' + pid; else toast('Dossier introuvable') }
const pkPick = i => { const r = pkRows[i]; if (!r || !pkIn) return; if (pkIn.dataset.go) { pk.hidden = true; pkIn.value = ''; pkIn.blur(); goPatient(r); return } pkIn.value = r.file_number; pkHint(pkIn, `<b>${esc(r.last_name)} ${esc(r.first_name)}</b> · ${esc(r.file_number)}`); pk.hidden = true; pkIn.dispatchEvent(new Event('change', { bubbles: true })) }
document.addEventListener('focusin', e => { if (e.target.name !== 'patient_file') { if (!pk.contains(e.target)) pk.hidden = true; return } pkIn = e.target; pkIn.setAttribute('autocomplete', 'off'); pkIn.removeAttribute('list'); pkLoad() })
document.addEventListener('input', e => { if (e.target !== pkIn) return; pkHint(pkIn, ''); clearTimeout(pkT); pkT = setTimeout(pkLoad, 160) })
addEventListener('keydown', e => { if (pk.hidden || e.target !== pkIn) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pkI = (pkI + (e.key === 'ArrowDown' ? 1 : -1) + pkRows.length) % Math.max(1, pkRows.length); pkDraw(); pk.querySelector('.ppi.on')?.scrollIntoView({ block: 'nearest' }) }
  else if (e.key === 'Enter' && pkI >= 0) { e.preventDefault(); e.stopPropagation(); pkPick(pkI) }
  else if (e.key === 'Escape') { e.stopPropagation(); pk.hidden = true } }, true)
pk.addEventListener('mousedown', e => e.preventDefault())
pk.addEventListener('click', e => { const b = e.target.closest('[data-pi]'); if (b) pkPick(Number(b.dataset.pi)) })
document.addEventListener('focusout', e => { if (e.target === pkIn) setTimeout(() => { if (document.activeElement !== pkIn) pk.hidden = true }, 120) })
addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.querySelector('.mo,.lbx')) { const g = document.querySelector('.gsearch input'); if (g) { e.preventDefault(); g.focus() } } })
addEventListener('scroll', () => { if (!pk.hidden) pkPlace() }, true); addEventListener('resize', () => { if (!pk.hidden) pkPlace() })
document.addEventListener('change', e => { if (e.target.id === 'pstat') { pstatus = e.target.value; page = 0; loadPatients().catch(x => toast(x.message)) } })
document.addEventListener('click', async e => {
  if (!e.target.closest('.bellw')) { const bp = $('#bp'); if (bp) bp.hidden = true } else if (e.target.closest('#bell')) { const bp = $('#bp'); if (bp) bp.hidden = !bp.hidden }
  const um = $('#umenu'); if (um) { if (e.target.closest('#umb')) um.hidden = !um.hidden; else if (!e.target.closest('#umenu') || e.target.closest('a,button')) um.hidden = true }
  const n = e.target.closest('[data-pnew]'), a = e.target.closest('[data-parch]'), r = e.target.closest('[data-prest]')
  try {
    if (n) await patientModal()
    else if (a) { const v = await ui.dialog({ title: 'Désactiver le dossier', icon: 'alert', tone: 'danger', lock: true, html: `<p>Le dossier de <b>${esc(a.dataset.name)}</b> ne sera pas supprimé : il reste conservé, marqué comme inactif avec votre nom et la date, et pourra être réactivé à tout moment.</p><label class="ml">Motif (obligatoire)<input name="reason" required></label>`, buttons: [{ label: 'Annuler', cls: 'sec', value: null }, { label: 'Désactiver', cls: 'pri danger', collect: true, submit: v => api(`/patients/${a.dataset.parch}/archive`, { reason: v.reason }) }] }); if (v) { toast('Dossier désactivé'); loadPatients() } }
    else if (r) { if (await ui.confirm('Réactiver ce dossier patient ?', { title: 'Réactiver le dossier', ok: 'Réactiver' })) { await api(`/patients/${r.dataset.prest}/restore`, {}); toast('Dossier réactivé'); loadPatients() } }
  } catch (x) { toast(x.message) } })
window.addEventListener('hashchange', () => me && render()); boot()

// Déconnexion automatique : le serveur applique le même délai (la session est invalidée côté serveur)
;['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastAct = Date.now() }, { passive: true }))
setInterval(async () => {
  if (!me) return; const idle = (me.idle_minutes || 30) * 60000
  if (Date.now() - lastAct > idle) { await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); me = null; challenge = null; render(); toast('Déconnecté pour inactivité'); return }
  if (Date.now() - lastAct < 60000) fetch('/api/me').catch(() => {})   // signal d'activité pour la session serveur
}, 30000)
