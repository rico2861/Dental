export default function install({ $, esc, api, can, toast, render }) {
  const F = e => Object.fromEntries(new FormData(e.target)), today = new Date().toISOString().slice(0, 10)
  let day = today, planId = null, month = today.slice(0, 7)
  const fd = d => d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince', dateStyle: 'short', timeStyle: 'short' }) : '—'
  const opts = (a, l = 'name') => a.map(x => `<option value="${esc(x.id)}">${esc(x[l])}</option>`).join('')
  const AS = { planned: 'Planifié', confirmed: 'Confirmé', cancelled: 'Annulé', no_show: 'Absent', done: 'Terminé' }
  const PS = { draft: 'Brouillon', pending: 'En attente', approved: 'Approuvé', in_progress: 'En cours', suspended: 'Suspendu', done: 'Terminé', cancelled: 'Annulé' }
  const IS = { todo: 'À venir', in_progress: 'En cours', done: 'Terminé', cancelled: 'Annulé' }
  const STEPS = ['prescription', 'impression', 'preparation', 'sent_lab', 'manufacturing', 'returned', 'fitting', 'adjustment', 'ready', 'placed']
  const SL = { prescription: 'Prescription', impression: 'Empreinte', preparation: 'Préparation', sent_lab: 'Envoi au labo', manufacturing: 'Fabrication', returned: 'Retour', fitting: 'Essayage', adjustment: 'Ajustement', ready: 'Prête à poser', placed: 'Posée / livrée' }
  const GL = { waiting: 'En attente', at_lab: 'Au laboratoire', in_progress: 'En cours', done: 'Terminées' }
  const views = {
    async appts() {
      const [ap, rem, docs] = await Promise.all([api(`/appointments?from=${day}&to=${day}`), api('/reminders'), api('/doctors').catch(() => [])])
      $('#view').innerHTML = `<h2>Rendez-vous</h2><form class="row" data-f="day"><input type="date" name="day" value="${day}"><button class="sec">Afficher</button></form>
      <form class="card row" data-f="appt"><input name="patient_file" placeholder="N° dossier" required><select name="doctor_id">${opts(docs)}</select><input name="starts_at" type="datetime-local" required><input name="duration_min" type="number" min="5" value="30" style="width:80px"><input name="chair" placeholder="Fauteuil"><input name="reason" placeholder="Motif"><button>+ Rendez-vous</button></form>
      <div class="card"><table><tr><th>Heure</th><th>Patient</th><th>Médecin</th><th>Fauteuil</th><th>Motif</th><th>Statut</th><th></th></tr>${ap.map(a => `<tr><td>${fd(a.starts_at)} (${a.duration_min} min)</td><td>${esc(a.patient)} <span class="muted">${esc(a.file_number)}</span></td><td>${esc(a.doctor)}</td><td>${esc(a.chair)}</td><td>${esc(a.reason)}</td><td>${AS[a.status]}</td><td>${['planned', 'confirmed'].includes(a.status) ? `${a.status === 'planned' ? `<button class="sec" data-a="as" data-id="${a.id}" data-s="confirmed">Confirmer</button> ` : ''}<button class="sec" data-a="as" data-id="${a.id}" data-s="done">Terminé</button> <button class="sec" data-a="as" data-id="${a.id}" data-s="no_show">Absent</button> <button class="sec" data-a="as" data-id="${a.id}" data-s="cancelled">Annuler</button> <button class="sec" data-a="rs" data-id="${a.id}">Reporter</button>` : ''}</td></tr>`).join('') || '<tr><td>Aucun rendez-vous ce jour.</td></tr>'}</table></div>
      <h3>Patients à revoir</h3><form class="card row" data-f="rem"><input name="patient_file" placeholder="N° dossier" required><select name="kind"><option value="controle">Contrôle périodique</option><option value="controle_extraction">Après extraction</option><option value="controle_prothese">Après prothèse</option></select><input name="due_date" type="date" required><input name="reason" placeholder="Motif"><button class="sec">Programmer</button></form>
      <div class="card"><table>${rem.map(r => `<tr><td>${esc(r.due_date?.slice(0, 10))} ${r.overdue ? '<span class="err">en retard</span>' : ''}</td><td>${esc(r.patient)}</td><td>${esc(r.kind)}</td><td>${esc(r.reason)}</td><td><button class="sec" data-a="rd" data-id="${r.id}">Fait</button></td></tr>`).join('') || '<tr><td>Aucun rappel en attente.</td></tr>'}</table></div>`
    },
    async plans() {
      const [pl, docs] = await Promise.all([api('/plans'), api('/doctors').catch(() => [])]), d = planId ? await api('/plans/' + planId) : null
      const nxt = { draft: ['pending'], pending: ['approved', 'draft'], approved: ['in_progress', 'suspended'], in_progress: ['suspended', 'done'], suspended: ['in_progress'] }
      $('#view').innerHTML = `<h2>Plans de traitement</h2>${can('manage_treatment_plans') ? `<form class="card col" data-f="plan"><div class="row"><input name="patient_file" placeholder="N° dossier" required><select name="responsible_doctor_id">${opts(docs)}</select><input name="teeth" placeholder="Dents (26, 27)"><input name="sessions" type="number" placeholder="Séances" style="width:90px"><input name="start_date" type="date"><input name="end_date" type="date"></div><input name="diagnosis" placeholder="Diagnostic"><input name="objective" placeholder="Objectif"><textarea name="lines" rows="3" placeholder="Une intervention par ligne : Description | Dent | Prix (HTG)" required></textarea><button>Créer le plan (brouillon)</button></form>` : ''}
      <div class="card"><table><tr><th>Patient</th><th>Statut</th><th>Total</th><th>Payé</th><th>Solde</th><th>Progression</th><th></th></tr>${pl.map(p => `<tr><td>${esc(p.patient)}</td><td>${PS[p.status]}</td><td>${p.total}</td><td>${p.paid}</td><td>${p.balance.toFixed(2)}</td><td>${p.progress}% (${p.remaining} restante${p.remaining > 1 ? 's' : ''})</td><td><button class="sec" data-a="po" data-id="${p.id}">Ouvrir</button></td></tr>`).join('') || '<tr><td>Aucun plan.</td></tr>'}</table></div>
      ${d ? `<div class="card"><h3>${esc(d.patient)} — ${PS[d.status]}</h3><p>${esc(d.diagnosis)} · Responsable : ${esc(d.responsible)}</p>${can('manage_treatment_plans') ? (nxt[d.status] || []).map(s => `<button class="sec" data-a="ps" data-id="${d.id}" data-s="${s}">→ ${PS[s]}</button> `).join('') + (['draft', 'pending', 'approved', 'in_progress', 'suspended'].includes(d.status) ? `<button class="red" data-a="ps" data-id="${d.id}" data-s="cancelled">Annuler le plan</button>` : '') : ''}
      <table><tr><th>Intervention</th><th>Dent</th><th>Médecin</th><th>Prix</th><th>Statut</th><th></th></tr>${d.items.map(i => `<tr><td>${esc(i.description)}</td><td>${i.tooth ?? ''}</td><td>${esc(i.doctor)}</td><td>${i.price}</td><td>${IS[i.status]}</td><td>${can('manage_treatment_plans') && ['approved', 'in_progress'].includes(d.status) && ['todo', 'in_progress'].includes(i.status) ? `<button class="sec" data-a="is" data-id="${d.id}" data-i="${i.id}" data-s="in_progress">En cours</button> <button class="sec" data-a="is" data-id="${d.id}" data-i="${i.id}" data-s="done">Terminé</button>` : ''}</td></tr>`).join('')}</table></div>` : ''}`
    },
    async pros() {
      const [list, types, labs, docs] = await Promise.all([api('/prostheses'), api('/prosthesis-types'), api('/laboratories'), api('/doctors').catch(() => [])])
      const cnt = g => list.filter(x => x.grp === g).length
      $('#view').innerHTML = `<h2>Prothèses</h2><div class="grid">${Object.keys(GL).map(g => `<div class="card"><div>${GL[g]}</div><div class="kpi">${cnt(g)}</div></div>`).join('')}</div>
      <form class="card col" data-f="pro"><div class="row"><input name="patient_file" placeholder="N° dossier" required><select name="type_id">${opts(types)}</select><select name="doctor_id">${opts(docs)}</select><input name="teeth" placeholder="Dents"><input name="material" placeholder="Matériau"><input name="color" placeholder="Couleur"><select name="lab_id"><option value="">Laboratoire</option>${opts(labs)}</select></div><div class="row"><input name="material_cost" placeholder="Coût matériaux" inputmode="decimal"><input name="lab_cost" placeholder="Coût labo" inputmode="decimal"><input name="price" placeholder="Prix facturé" inputmode="decimal"><input name="instructions" placeholder="Instructions"><button>+ Prothèse</button></div></form>
      <form class="card row" data-f="lab"><input name="name" placeholder="Nouveau laboratoire" required><input name="phone" placeholder="Téléphone"><input name="technician" placeholder="Technicien"><button class="sec">+ Laboratoire</button></form>
      <div class="card"><table><tr><th>Réf.</th><th>Patient</th><th>Type</th><th>Médecin</th><th>Labo</th><th>Étape</th><th>Prix</th><th>Coût</th><th>Marge</th><th></th></tr>${list.map(x => { const nx = STEPS[STEPS.indexOf(x.step) + 1]; return `<tr><td>${esc(x.ref)}</td><td>${esc(x.patient)}</td><td>${esc(x.type)}</td><td>${esc(x.doctor)}</td><td>${esc(x.lab)}</td><td>${SL[x.step]}</td><td>${x.price}</td><td>${(Number(x.material_cost) + Number(x.lab_cost)).toFixed(2)}</td><td>${x.margin}</td><td>${nx ? `<button class="sec" data-a="st" data-id="${x.id}" data-s="${nx}">→ ${SL[nx]}</button>` : ''} ${Number(x.lab_cost) > 0 && !x.lab_paid && can('manage_finances') ? `<button class="sec" data-a="pl" data-id="${x.id}">Payer le labo</button>` : ''}</td></tr>` }).join('') || '<tr><td>Aucune prothèse.</td></tr>'}</table></div>`
    },
    async perf() {
      const r = await api('/doctors/stats?month=' + month)
      $('#view').innerHTML = `<h2>Performance des médecins</h2><form class="row" data-f="pm"><input type="month" name="month" value="${month}"><button class="sec">Période</button></form>
      <div class="card"><table><tr><th>Médecin</th><th>Consultations</th><th>Interventions</th><th>Revenus générés (HTG)</th><th>Patients suivis</th><th>Plans en cours</th><th>Plans terminés</th><th>Prothèses posées</th><th>RDV à venir</th></tr>${r.map(x => `<tr><td>${esc(x.doctor)}</td><td>${x.consultations}</td><td>${x.interventions}</td><td>${x.generated_htg}</td><td>${x.patients_followed}</td><td>${x.plans_in_progress}</td><td>${x.plans_done}</td><td>${x.prostheses_placed}</td><td>${x.upcoming_appointments}</td></tr>`).join('') || '<tr><td>Aucune donnée.</td></tr>'}</table></div>
      <p class="muted">« Revenus générés » = valeur des interventions terminées : ce n'est ni le salaire, ni les montants encaissés, ni un indicateur de qualité des soins.</p>`
    }
  }
  const lines = (s, k) => s.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0]).map(p => k(p))
  const submit = {
    async day(e) { day = F(e).day; render() },
    async pm(e) { month = F(e).month; render() },
    async appt(e) { const f = F(e); f.starts_at = new Date(f.starts_at).toISOString(); await api('/appointments', f); toast('Rendez-vous enregistré'); render() },
    async rem(e) { await api('/reminders', F(e)); toast('Rappel programmé'); render() },
    async plan(e) { const f = F(e); f.items = lines(f.lines, p => ({ description: p[0], tooth: p[1] || undefined, price: p[2], doctor_id: f.responsible_doctor_id })); delete f.lines; const r = await api('/plans', f); planId = r.id; toast('Plan créé'); render() },
    async pro(e) { await api('/prostheses', F(e)); toast('Prothèse enregistrée'); render() },
    async lab(e) { await api('/laboratories', F(e)); toast('Laboratoire ajouté'); render() }
  }
  const click = async (b, a, id) => {
    const s = b.dataset.s
    if (a === 'as') { await api(`/appointments/${id}/status`, { status: s }); toast(s === 'no_show' ? 'Absence enregistrée : rappel créé' : 'Mis à jour'); render() }
    else if (a === 'rs') { const v = prompt('Nouvelle date et heure (AAAA-MM-JJ HH:MM) :'); if (!v) return true; await api(`/appointments/${id}/reschedule`, { starts_at: new Date(v.replace(' ', 'T')).toISOString() }); render() }
    else if (a === 'rd') { await api(`/reminders/${id}/done`, {}); render() }
    else if (a === 'po') { planId = id; render() }
    else if (a === 'ps') { if (s === 'cancelled' && !confirm('Annuler ce plan ?')) return true; await api(`/plans/${id}/status`, { status: s }); render() }
    else if (a === 'is') { await api(`/plans/${id}/items/${b.dataset.i}/status`, { status: s }); render() }
    else if (a === 'st') { await api(`/prostheses/${id}/step`, { step: s }); toast('Étape : ' + SL[s]); render() }
    else if (a === 'pl') { if (!confirm('Payer le laboratoire ? Une dépense sera enregistrée.')) return true; await api(`/prostheses/${id}/pay-lab`, {}); toast('Laboratoire payé'); render() }
    else return false
    return true
  }
  return { views, submit, click }
}
