export default function install({ $, esc, api, can, toast, render }) {
  const F = e => Object.fromEntries(new FormData(e.target)), pid = () => location.hash.split('/')[1]
  let tab = 'general', tooth = null, month = new Date().toISOString().slice(0, 7)
  const COL = { saine: '#d7f0e0', carie: '#f6c6c6', extraite: '#d9d9d9', a_extraire: '#ffd9a8', restauree: '#cfe3fb', couronne: '#e6d5fa', implant: '#c8efef', bridge: '#f3eec0', anomalie: '#ffb3d1' }
  const UP = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], LOW = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
  const HB = ['diabetes', 'hemophilia', 'hiv', 'smoking', 'alcohol', 'pregnancy', 'cardiovascular', 'pulmonary', 'epilepsy', 'stomach', 'cancer', 'migraines']
  const HL = { diabetes: 'Diabète', hemophilia: 'Hémophilie', hiv: 'VIH/SIDA', smoking: 'Tabagisme', alcohol: 'Alcool', pregnancy: 'Grossesse', cardiovascular: 'Cardiovasculaire', pulmonary: 'Pulmonaire', epilepsy: 'Épilepsie', stomach: 'Estomac', cancer: 'Cancer', migraines: 'Migraines' }
  const fd = d => d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince' }) : '—'
  const opts = (a, v = 'id', l = 'name') => a.map(x => `<option value="${esc(x[v])}">${esc(x[l])}</option>`).join('')
  const views = {
    async record() {
      const id = pid(); if (!id) { $('#view').innerHTML = '<h2>Dossiers</h2><p>Ouvrez un dossier depuis la liste des patients (cliquez sur le numéro de dossier).</p>'; return }
      const r = await api(`/patients/${id}/record`), p = r.patient, H = r.history, tm = new Map(r.teeth.map(t => [t.tooth_fdi, t.state]))
      const T = (n) => `<button type="button" data-a="tooth" data-id="${n}" style="min-width:38px;padding:8px 4px;background:${COL[tm.get(n)] || '#fff'};color:#000;border:${tooth === n ? '3px solid var(--b)' : '1px solid #bbb'}">${n}</button>`
      const tabs = [['general', 'Vue générale'], ['hist', 'Histoire médicale'], ['cons', 'Consultations'], ['odo', 'Odontogramme'], ['time', 'Timeline'], ['docs', 'Documents & consentements'], ['care', 'Hygiène & examen']]
      const body = { general: `<div class="card"><b>${esc(p.last_name)} ${esc(p.first_name)}</b> — ${esc(p.file_number)}<br>Tél : ${esc(p.phone)} · Naissance : ${esc(p.birth_date?.slice(0, 10))}<br><br><b>Historique des médecins traitants</b><table>${r.doctors.map(d => `<tr><td>${esc(d.doctor)}</td><td>${fd(d.started_at)}</td><td>${d.ended_at ? '→ ' + fd(d.ended_at) : 'actuel'}</td></tr>`).join('') || '<tr><td>Aucun médecin traitant défini.</td></tr>'}</table>
        ${can('edit_patients') ? `<form class="row" data-f="pdoc"><select name="doctor_id" id="docsel"></select><button class="sec">Changer le médecin traitant</button></form>` : ''}</div>`,
        hist: `<form class="card col" data-f="hist"><div class="row">${HB.map(k => `<label><input type="checkbox" name="${k}" ${H[k] ? 'checked' : ''}> ${HL[k]}</label>`).join('')}</div>
          <div class="row"><input name="blood_pressure" placeholder="Tension" value="${esc(H.blood_pressure)}"><input name="blood_group" placeholder="Groupe sanguin" value="${esc(H.blood_group)}"></div>
          <input name="allergies" placeholder="Allergies" value="${esc(H.allergies)}"><input name="medications" placeholder="Médicaments" value="${esc(H.medications)}"><input name="other" placeholder="Autres antécédents" value="${esc(H.other)}"><input name="observations" placeholder="Observations" value="${esc(H.observations)}">
          <span class="muted">Dernière mise à jour : ${fd(r.history_at)}</span>${can('edit_medical_records') ? '<button>Enregistrer</button>' : ''}</form>`,
        cons: `${can('edit_medical_records') ? `<form class="card col" data-f="cons"><div class="row"><select name="doctor_id" id="docsel2"></select><input name="reason" placeholder="Motif" required><input name="teeth" placeholder="Dents (ex : 26, 27)"><input name="cost" placeholder="Coût (HTG)" inputmode="decimal"></div><input name="diagnosis" placeholder="Diagnostic"><input name="treatment" placeholder="Traitement réalisé"><input name="notes" placeholder="Observations"><button>Enregistrer la consultation</button></form>` : ''}
          <div class="card"><table><tr><th>Date</th><th>Médecin intervenant</th><th>Médecin traitant</th><th>Motif</th><th>Diagnostic</th><th>Traitement</th><th>Dents</th><th>Coût</th></tr>${r.consultations.map(c => `<tr><td>${fd(c.consulted_at)}</td><td>${esc(c.doctor)}</td><td>${esc(c.primary_doctor)}</td><td>${esc(c.reason)}</td><td>${esc(c.diagnosis)}</td><td>${esc(c.treatment)}</td><td>${(c.teeth || []).join(', ')}</td><td>${esc(c.cost)}</td></tr>`).join('') || '<tr><td>Aucune consultation.</td></tr>'}</table></div>`,
        odo: `<div class="card"><div class="row">${UP.map(T).join('')}</div><div class="row">${LOW.map(T).join('')}</div>
          ${can('edit_medical_records') ? `<form class="row" data-f="tooth"><b>Dent ${tooth ?? '—'}</b><select name="state">${Object.keys(COL).map(s => `<option>${s}</option>`).join('')}</select><input name="note" placeholder="Note"><button ${tooth ? '' : 'disabled'}>Enregistrer l'état</button></form>` : ''}
          <div class="row">${Object.entries(COL).map(([s, c]) => `<span class="badge" style="background:${c};color:#000">${s}</span>`).join('')}</div></div>
          <div class="card"><b>Historique des modifications</b><table>${r.tooth_log.map(t => `<tr><td>${fd(t.recorded_at)}</td><td>Dent ${t.tooth_fdi}</td><td>${esc(t.state)}</td><td>${esc(t.doctor)}</td><td>${esc(t.note)}</td></tr>`).join('') || '<tr><td>Aucune modification.</td></tr>'}</table></div>`,
        time: `<div class="card">${r.timeline.map(t => `<div style="border-left:3px solid var(--b);padding:4px 12px;margin:8px 0"><b>${fd(t.at)}</b> — ${esc(t.doctor)}<br>${esc(t.text)}</div>`).join('') || 'Aucun événement.'}</div>` }[tab]
      $('#view').innerHTML = `<h2>${esc(p.last_name)} ${esc(p.first_name)}</h2><div class="row">${tabs.map(([k, l]) => `<button class="${tab === k ? '' : 'sec'}" data-a="tab" data-id="${k}">${l}</button>`).join('')}</div>${body}`
      if ($('#docsel') || $('#docsel2')) { const d = await api('/doctors'); for (const s of ['#docsel', '#docsel2']) if ($(s)) $(s).innerHTML = (s === '#docsel2' ? '<option value="">Médecin intervenant (moi)</option>' : '') + opts(d) }
    },
    async stock() {
      const [prods, sups, purs, al] = await Promise.all([api('/products'), api('/suppliers'), api('/purchases'), api('/stock/alerts')])
      $('#view').innerHTML = `<h2>Stock</h2>
      <div class="grid"><div class="card"><div>Stock faible</div><div class="kpi">${al.low.length}</div></div><div class="card"><div>Lots expirés</div><div class="kpi" style="color:var(--err)">${al.expired.length}</div></div><div class="card"><div>Expirent sous 60 j</div><div class="kpi" style="color:var(--warn)">${al.near_expiry.length}</div></div></div>
      <form class="card row" data-f="product"><input name="ref" placeholder="Référence"><input name="name" placeholder="Produit" required><input name="category" placeholder="Catégorie"><input name="unit" placeholder="Unité"><input name="min_stock" placeholder="Stock min." inputmode="decimal"><button>+ Produit</button></form>
      <div class="card"><table><tr><th>Produit</th><th>Catégorie</th><th>Disponible</th><th>Min.</th><th>Valeur (HTG)</th><th>Prochaine expiration</th></tr>${prods.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td ${Number(p.stock) <= Number(p.min_stock) ? 'class="err"' : ''}>${p.stock} ${esc(p.unit)}</td><td>${p.min_stock}</td><td>${p.value}</td><td>${esc(p.next_expiry?.slice(0, 10))}</td></tr>`).join('') || '<tr><td>Aucun produit.</td></tr>'}</table></div>
      <div class="row"><form class="card row" data-f="supplier"><input name="name" placeholder="Fournisseur" required><input name="phone" placeholder="Téléphone"><button class="sec">+ Fournisseur</button></form></div>
      <form class="card row" data-f="purchase"><b>Achat</b><select name="supplier_id"><option value="">Fournisseur</option>${opts(sups)}</select><select name="currency"><option>HTG</option><option>USD</option></select><select name="product_id">${opts(prods)}</select><input name="qty" placeholder="Quantité" inputmode="decimal" required><input name="unit_price" placeholder="Prix unitaire" inputmode="decimal" required><input name="lot_number" placeholder="N° de lot"><input name="expiry" type="date"><button>Commander</button></form>
      <div class="card"><table><tr><th>Date</th><th>Fournisseur</th><th>Articles</th><th>Total</th><th>Statut</th><th></th></tr>${purs.map(p => `<tr><td>${fd(p.created_at)}</td><td>${esc(p.supplier)}</td><td>${esc(p.items)}</td><td>${p.total} ${p.currency}</td><td>${p.status === 'received' ? 'Reçu' : 'Commandé'}${p.paid ? ' · payé' : ''}</td><td>${p.status === 'ordered' ? `<button class="sec" data-a="recv" data-id="${p.id}">Réceptionner</button>` : ''} ${!p.paid && can('manage_finances') ? `<button class="sec" data-a="ppay" data-id="${p.id}">Payer</button>` : ''}</td></tr>`).join('') || '<tr><td>Aucun achat.</td></tr>'}</table></div>
      <div class="row"><form class="card row" data-f="consume"><b>Consommation (FEFO)</b><select name="product_id">${opts(prods)}</select><input name="qty" placeholder="Qté" inputmode="decimal" required><input name="patient_file" placeholder="N° dossier patient"><button>Utiliser</button></form>
      <form class="card row" data-f="count"><b>Inventaire physique</b><select name="product_id">${opts(prods)}</select><input name="counted" placeholder="Quantité comptée" inputmode="decimal" required><input name="reason" placeholder="Motif de l'écart" required><button class="sec">Corriger</button></form></div>`
    },
    async cash() {
      const can2 = can('manage_finances'), [acc, mv, ex, sm] = await Promise.all([api('/cash/accounts'), api('/cash/movements'), api('/expenses'), api('/finance/summary?month=' + month)])
      const cats = ['Salaires', 'Loyer', 'Électricité', 'Eau', 'Internet', 'Matériaux dentaires', 'Fournitures', 'Laboratoire', 'Maintenance', 'Transport', 'Marketing', 'Autres']
      $('#view').innerHTML = `<h2>Caisse & dépenses</h2><div class="grid">${acc.map(a => `<div class="card"><div>${esc(a.name)} (${a.kind === 'bank' ? 'banque' : 'caisse'})</div><div class="kpi">${esc(a.balance)} ${a.currency}</div></div>`).join('') || '<div class="card">Aucune caisse : créez-en une ci-dessous.</div>'}</div>
      ${can2 ? `<form class="card row" data-f="account"><input name="name" placeholder="Nom (ex : Caisse HTG)" required><select name="currency"><option>HTG</option><option>USD</option></select><select name="kind"><option value="cash">Caisse</option><option value="bank">Banque</option></select><input name="opening_balance" placeholder="Solde initial" inputmode="decimal"><button>+ Caisse</button></form>
      <div class="row"><form class="card row" data-f="movement"><select name="account_id">${opts(acc)}</select><select name="kind"><option value="in">Entrée</option><option value="out">Sortie</option></select><input name="amount" placeholder="Montant" inputmode="decimal" required><input name="reason" placeholder="Motif" required><button>Enregistrer</button></form>
      <form class="card row" data-f="transfer"><select name="from">${opts(acc)}</select>→<select name="to">${opts(acc)}</select><input name="amount" placeholder="Montant" inputmode="decimal" required><button class="sec">Transférer</button></form>
      <form class="card row" data-f="close"><select name="account_id">${opts(acc)}</select><input name="day" type="date" required><input name="physical" placeholder="Solde physique compté" inputmode="decimal" required><button class="sec">Clôturer la journée</button></form></div>` : ''}
      <form class="row" data-f="month"><input type="month" name="month" value="${month}"><button class="sec">Période</button></form>
      <div class="grid"><div class="card"><div>Facturé</div><div class="kpi">${sm.invoiced_htg}</div></div><div class="card"><div>Encaissé</div><div class="kpi">${sm.collected_htg}</div></div><div class="card"><div>Dépenses payées</div><div class="kpi">${sm.expenses_paid_htg}</div></div><div class="card"><div>Dépenses à payer</div><div class="kpi">${sm.expenses_unpaid_htg}</div></div><div class="card"><div>Coût matériaux consommés</div><div class="kpi">${sm.materials_cost_htg}</div></div><div class="card"><div>Résultat de trésorerie</div><div class="kpi">${(Number(sm.collected_htg) - Number(sm.expenses_paid_htg)).toFixed(2)}</div></div></div><p class="muted">Montants en HTG. Le coût des matériaux est une attribution de coût, jamais une sortie de caisse.</p>
      ${can2 ? `<form class="card row" data-f="expense"><select name="category">${cats.map(c => `<option>${c}</option>`).join('')}</select><input name="description" placeholder="Description"><input name="amount" placeholder="Montant" inputmode="decimal" required><select name="currency"><option>HTG</option><option>USD</option></select><label><input type="checkbox" name="pay_now"> Payée</label><button>+ Dépense</button></form>` : ''}
      <div class="card"><table><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Montant</th><th>Statut</th><th></th></tr>${ex.map(e => `<tr><td>${fd(e.created_at)}</td><td>${esc(e.category)}</td><td>${esc(e.description)}</td><td>${e.amount} ${e.currency}</td><td>${e.status === 'paid' ? 'Payée' : 'Engagée'}</td><td>${e.status === 'committed' && can2 ? `<button class="sec" data-a="xpay" data-id="${e.id}">Payer</button>` : ''}</td></tr>`).join('') || '<tr><td>Aucune dépense.</td></tr>'}</table></div>
      <div class="card"><b>Derniers mouvements de caisse</b><table>${mv.map(m => `<tr><td>${fd(m.created_at)}</td><td>${esc(m.account)}</td><td>${m.kind}</td><td>${m.amount} ${m.currency}</td><td>${esc(m.reason)}</td></tr>`).join('') || '<tr><td>Aucun mouvement.</td></tr>'}</table></div>`
    }
  }
  const post = (path, msg) => async e => { await api(path, F(e)); toast(msg); render() }
  const submit = {
    async hist(e) { const d = F(e); for (const k of HB) d[k] = k in d; await api(`/patients/${pid()}/history`, d); toast('Histoire médicale enregistrée'); render() },
    async cons(e) { const d = F(e); if (!d.doctor_id) delete d.doctor_id; await api(`/patients/${pid()}/consultations`, d); toast('Consultation enregistrée'); tab = 'cons'; render() },
    async tooth(e) { await api(`/patients/${pid()}/teeth`, { tooth_fdi: tooth, ...F(e) }); toast('État enregistré'); render() },
    async pdoc(e) { await api(`/patients/${pid()}/primary-doctor`, F(e)); toast('Médecin traitant mis à jour'); render() },
    product: post('/products', 'Produit créé'), supplier: post('/suppliers', 'Fournisseur créé'),
    async purchase(e) { const f = F(e); await api('/purchases', { supplier_id: f.supplier_id || null, currency: f.currency, items: [{ product_id: f.product_id, qty: f.qty, unit_price: f.unit_price, lot_number: f.lot_number, expiry: f.expiry }] }); toast('Achat commandé (le stock n\'augmente qu\'à la réception)'); render() },
    async consume(e) { const r = await api('/consumptions', F(e)); toast('Consommé. Coût attribué : ' + r.cost_htg + ' HTG'); render() },
    async count(e) { const r = await api('/stock-counts', F(e)); toast('Écart appliqué : ' + r.diff); render() },
    account: post('/cash/accounts', 'Caisse créée'), movement: post('/cash/movements', 'Mouvement enregistré'), transfer: post('/cash/transfer', 'Transfert effectué'),
    async close(e) { const r = await api('/cash/close', F(e)); toast('Journée clôturée. Écart : ' + r.diff); render() },
    async expense(e) { const d = F(e); d.pay_now = 'pay_now' in d; await api('/expenses', d); toast('Dépense enregistrée'); render() },
    async month(e) { month = F(e).month; render() }
  }
  const click = async (b, a, id) => {
    if (a === 'tab') { if (id === 'docs' || id === 'care') { location.hash = '#' + id + '/' + pid(); return true } tab = id; render() } else if (a === 'tooth') { tooth = Number(id); render() }
    else if (a === 'recv') { if (!confirm('Confirmer la réception ? Le stock augmentera.')) return true; await api(`/purchases/${id}/receive`, {}); toast('Réception enregistrée'); render() }
    else if (a === 'ppay') { if (!confirm('Payer cet achat ? Une dépense sera enregistrée.')) return true; await api(`/purchases/${id}/pay`, {}); toast('Achat payé'); render() }
    else if (a === 'xpay') { await api(`/expenses/${id}/pay`, {}); toast('Dépense payée'); render() }
    else return false
    return true
  }
  return { views, submit, click }
}
