import install from './views2.js'
import install3 from './views3.js'
import install4 from './views4.js'
import install5 from './views5.js'
import install6 from './views6.js'
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmt = d => d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince' }) : '—'
async function api(p, body, method) {
  const r = await fetch('/api' + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({})); if (!r.ok) { if (r.status === 401 && me) { me = null; challenge = null; render(); toast(j.error || 'Session terminée') } else if (j.code === 'TWOFA_SETUP_REQUIRED' || j.code === 'PASSWORD_CHANGE_REQUIRED') boot(); throw Object.assign(new Error(j.error || 'Erreur'), { code: j.code, status: r.status }) } return j }
function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 4000) }
let me = null, page = 0, search = '', challenge = null, lastAct = Date.now()
const can = p => me.perms.includes(p)
const NAV = [['dashboard', 'Dashboard', 1], ['patients', 'Patients', 'view_all_patients'], ['rates', 'Taux de change', 'view_finances'], ['reports', 'Rapports', 1], ['requests', "Demandes d'achat", 'manage_inventory'], ['security', 'Sécurité', 1], ['appts', 'Rendez-vous', 'manage_appointments'], ['record', 'Dossiers', 'view_medical_records'], ['plans', 'Plans de traitement', 'manage_treatment_plans'], ['pros', 'Prothèses', 'manage_prostheses'], ['perf', 'Médecins', 'view_medical_records'], ['stock', 'Stock', 'manage_inventory'], ['cash', 'Caisse & dépenses', 'view_finances'], ['billing', 'Facturation', 'view_finances'], ['hr', 'Personnel & paie', 'view_salaries'], ['users', 'Utilisateurs', 'manage_users'], ['audit', 'Journal', 'view_audit_logs']]
async function boot() { try { me = await api('/me') } catch { me = null } render() }
function render() {
  const app = $('#app')
  if (!me && challenge) return app.innerHTML = `<div class="center card"><h2>Vérification en deux étapes</h2><p class="muted">Saisissez le code de votre application d'authentification, ou un code de secours.</p><form data-f="otp"><input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="Code à 6 chiffres" required autofocus><button>Valider</button></form><p><button class="sec" data-a="cancelotp">Retour</button></p></div>`
  if (!me) return app.innerHTML = `<div class="center card"><h2 style="color:var(--b)">DENTAL LIGHT</h2><form data-f="login"><input name="email" type="email" placeholder="Email" required autocomplete="username"><input name="password" type="password" placeholder="Mot de passe" required autocomplete="current-password"><button>Se connecter</button></form></div>`
  if (me.must_change_password) return app.innerHTML = `<div class="center card"><h2>Changement de mot de passe obligatoire</h2><form data-f="pw"><input name="current" type="password" placeholder="Mot de passe temporaire" required><input name="next" type="password" placeholder="Nouveau (10+ car., Aa1)" required><button>Valider</button></form></div>`
  if (me.needs_2fa_setup) { app.innerHTML = '<div class="center card" id="v2fa"></div>'; V.mount2fa($('#v2fa')); return }
  const h = (location.hash.slice(1) || 'dashboard').split('/')[0]
  app.innerHTML = `<div class="layout"><nav class="side"><h1>DENTAL LIGHT</h1>${NAV.filter(n => n[2] === 1 || can(n[2])).map(n => `<a href="#${n[0]}" class="${h === n[0] ? 'on' : ''}">${n[1]}</a>`).join('')}<button class="lnk" data-a="logout" style="margin-top:auto">Déconnexion</button></nav><main class="main" id="view">Chargement…</main></div>`
  views[h]?.().catch(e => { $('#view').innerHTML = `<p class="err">${esc(e.message)}</p>` })
}
const views = {
  async dashboard() { const d = await api('/dashboard'); $('#view').innerHTML = `<h2>Bonjour ${esc(me.first_name)}</h2><div class="grid">${'patients_active' in d ? `<div class="card"><div>Patients actifs</div><div class="kpi">${d.patients_active}</div></div><div class="card"><div>Nouveaux ce mois</div><div class="kpi">${d.patients_new_month}</div></div>` : ''}${'rate' in d ? `<div class="card"><div>Taux actuel</div><div class="kpi">${d.rate ? '1 USD = ' + esc(d.rate) + ' HTG' : 'Non défini'}</div></div>` : ''}${[['appointments_today', 'RDV aujourd\'hui'], ['appointments_upcoming', 'RDV à venir'], ['patients_to_recall', 'Patients à revoir'], ['plans_in_progress', 'Plans en cours'], ['prostheses_in_progress', 'Prothèses en cours']].filter(([k]) => k in d).map(([k, l]) => `<div class="card"><div>${l}</div><div class="kpi">${d[k]}</div></div>`).join('')}</div><p class="muted">Les indicateurs affichés dépendent de vos permissions.</p>` },
  async patients() { const r = await api(`/patients?page=${page}&q=${encodeURIComponent(search)}`)
    $('#view').innerHTML = `<h2>Patients</h2><div class="row"><form data-f="search" class="row"><input name="q" placeholder="Nom, téléphone, n° dossier" value="${esc(search)}"><button class="sec">Rechercher</button></form></div>
    ${can('create_patients') ? `<form class="card row" data-f="patient"><input name="last_name" placeholder="Nom" required><input name="first_name" placeholder="Prénom" required><input name="phone" placeholder="Téléphone"><input name="birth_date" type="date"><select name="sex"><option value="">Sexe</option><option>M</option><option>F</option></select><button>+ Nouveau patient</button></form>` : ''}
    <div class="card">${r.rows.length ? `<table><tr><th>Dossier</th><th>Nom</th><th>Prénom</th><th>Âge</th><th>Téléphone</th></tr>${r.rows.map(p => `<tr><td>${can('view_medical_records') ? `<a href="#record/${p.id}">${esc(p.file_number)}</a>` : esc(p.file_number)}</td><td>${esc(p.last_name)}</td><td>${esc(p.first_name)}</td><td>${p.age ?? '—'}</td><td>${esc(p.phone)}</td></tr>`).join('')}</table>` : 'Aucun patient.'}</div>
    <div class="row"><button class="sec" data-a="prev" ${page ? '' : 'disabled'}>Précédent</button><span>Page ${page + 1} / ${Math.max(1, Math.ceil(r.total / 20))}</span><button class="sec" data-a="next" ${(page + 1) * 20 >= r.total ? 'disabled' : ''}>Suivant</button></div>` },
  async rates() { const rows = await api('/rates')
    $('#view').innerHTML = `<h2>Paramètres → Finances → Taux de change</h2>${can('manage_exchange_rates') ? `<form class="card row" data-f="rate"><label>1 USD = <input name="rate" inputmode="decimal" required style="width:110px"> HTG</label><input name="justification" placeholder="Justification (facultatif)"><button>Appliquer</button></form>` : ''}
    <div class="card"><table><tr><th>Date</th><th>Taux</th><th>Par</th><th>Justification</th></tr>${rows.map(r => `<tr><td>${fmt(r.effective_at)}</td><td>${esc(r.rate)}</td><td>${esc(r.by)}</td><td>${esc(r.justification)}</td></tr>`).join('') || '<tr><td>Aucun taux.</td></tr>'}</table></div>` },
  async users() { const rows = await api('/users'), roles = ['ADMIN', 'ADMIN_MEDICAL', 'ADMIN_FINANCIER', 'DENTIST', 'DENTAL_ASSISTANT', 'SECRETARY', 'ACCOUNTANT', 'STOCK_MANAGER', 'DENTAL_TECH', 'STAFF']
    $('#view').innerHTML = `<h2>Utilisateurs</h2><form class="card row" data-f="user"><input name="first_name" placeholder="Prénom" required><input name="last_name" placeholder="Nom" required><input name="email" type="email" placeholder="Email" required><select name="role">${roles.filter(r => me.role === 'OWNER' || !r.startsWith('ADMIN')).map(r => `<option>${r}</option>`).join('')}</select><button>Créer</button></form>
    <div class="card"><table><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th></th></tr>${rows.map(u => `<tr><td>${esc(u.first_name)} ${esc(u.last_name)}</td><td>${esc(u.email)}</td><td><span class="badge">${esc(u.role)}</span></td><td>${esc(u.status)}</td><td>${fmt(u.last_login_at)}</td><td>${u.role === 'OWNER' || u.id === me.id ? '' : `<button class="sec" data-a="${u.status === 'active' ? 'block' : 'unblock'}" data-id="${u.id}">${u.status === 'active' ? 'Bloquer' : 'Débloquer'}</button> <button class="sec" data-a="reset" data-id="${u.id}">Réinit. mdp</button>`}</td></tr>`).join('')}</table></div>` },
  async audit() { const rows = await api('/audit'); $('#view').innerHTML = `<h2>Journal d'activité</h2><div class="card"><table><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet</th></tr>${rows.map(a => `<tr><td>${fmt(a.created_at)}</td><td>${esc(a.who)}</td><td>${esc(a.action)}</td><td>${esc(a.table_name)}</td></tr>`).join('')}</table></div>` }
}
const F = e => Object.fromEntries(new FormData(e.target))
const submit = {
  async login(e) { const r = await api('/login', F(e)); if (r.need_otp) { challenge = r.challenge; render() } else await boot() },
  async otp(e) { await api('/login/otp', { challenge, code: F(e).code }); challenge = null; await boot() },
  async pw(e) { await api('/change-password', F(e)); toast('Mot de passe modifié'); location.hash = ''; await boot() },
  async search(e) { search = F(e).q; page = 0; render() },
  async patient(e) { const r = await api('/patients', F(e)); toast('Patient créé : ' + r.file_number); render() },
  async rate(e) { if (!confirm('Enregistrer ce taux ? Les anciennes transactions ne seront pas modifiées.')) return; await api('/rates', F(e)); toast('Taux enregistré'); render() },
  async user(e) { const r = await api('/users', F(e)); alert('Mot de passe temporaire (affiché une seule fois) :\n\n' + r.temporary_password); render() }
}
const X = install({ $, esc, api, can, toast, render: () => render() }); Object.assign(views, X.views); Object.assign(submit, X.submit)
const Y = install3({ $, esc, api, can, toast, render: () => render() }); Object.assign(views, Y.views); Object.assign(submit, Y.submit)
const Z = install4({ $, esc, api, can, toast, render: () => render() }); Object.assign(views, Z.views); Object.assign(submit, Z.submit)
const W = install5({ $, esc, api, can, toast, render: () => render() }); Object.assign(views, W.views); Object.assign(submit, W.submit)
const V = install6({ $, esc, api, can, toast, render: () => render() }); Object.assign(views, V.views); Object.assign(submit, V.submit)
document.addEventListener('submit', async e => { const f = e.target.dataset.f; if (!f) return; e.preventDefault(); try { await submit[f](e) } catch (x) { toast(x.message) } })
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id
  try {
    if (await X.click(b, a, id)) return
    if (await Y.click(b, a, id)) return
    if (await Z.click(b, a, id)) return
    if (await W.click(b, a, id)) return
    if (await V.click(b, a, id)) return
    if (a === 'cancelotp') { challenge = null; render(); return }
    if (a === 'logout') { await api('/logout', {}); me = null; render() }
    else if (a === 'prev') { page--; render() } else if (a === 'next') { page++; render() }
    else if (a === 'block' && confirm('Bloquer ce compte ? Ses sessions seront révoquées.')) { await api(`/users/${id}/status`, { status: 'blocked' }); render() }
    else if (a === 'unblock') { await api(`/users/${id}/status`, { status: 'active' }); render() }
    else if (a === 'reset' && confirm('Réinitialiser le mot de passe ?')) { const r = await api(`/users/${id}/reset-password`, {}); alert('Mot de passe temporaire :\n\n' + r.temporary_password) }
  } catch (x) { toast(x.message) }
})
window.addEventListener('hashchange', () => me && render()); boot()

// Déconnexion automatique : le serveur applique le même délai (la session est invalidée côté serveur)
['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastAct = Date.now() }, { passive: true }))
setInterval(async () => {
  if (!me) return; const idle = (me.idle_minutes || 30) * 60000
  if (Date.now() - lastAct > idle) { await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); me = null; challenge = null; render(); toast('Déconnecté pour inactivité'); return }
  if (Date.now() - lastAct < 60000) fetch('/api/me').catch(() => {})   // signal d'activité pour la session serveur
}, 30000)
