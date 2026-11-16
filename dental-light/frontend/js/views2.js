export default function install({ $, esc, api, can, toast, render }) {
  let kind = 'invoice', period = new Date().toISOString().slice(0, 7)
  const F = e => Object.fromEntries(new FormData(e.target))
  const views = {
    async billing() {
      const rows = await api('/invoices?kind=' + kind)
      $('#view').innerHTML = `<h2>Facturation</h2>
      <div class="row"><button class="${kind === 'invoice' ? '' : 'sec'}" data-a="bk" data-id="invoice">Factures</button><button class="${kind === 'proforma' ? '' : 'sec'}" data-a="bk" data-id="proforma">Proformas</button></div>
      ${can('manage_finances') ? `<form class="card col" data-f="invoice"><div class="row"><select name="kind"><option value="invoice">Facture</option><option value="proforma">Proforma</option></select><select name="currency"><option>HTG</option><option>USD</option></select><input name="patient_file" placeholder="N° dossier (DL-000001)" required><input name="discount" placeholder="Remise" inputmode="decimal"></div><textarea name="lines" rows="3" placeholder="Une ligne par prestation : Description | Quantité | Prix unitaire" required></textarea><button>Créer</button></form>` : ''}
      <div class="card"><table><tr><th>N°</th><th>Patient</th><th>Total</th><th>Payé</th><th>Statut</th><th></th></tr>
      ${rows.map(i => `<tr><td>${esc(i.number)}</td><td>${esc(i.patient)}</td><td>${esc(i.total)} ${i.currency}</td><td>${esc(i.paid)}</td><td>${esc(i.status)}</td><td><a href="/api/invoices/${i.id}/pdf" target="_blank">PDF</a> ${i.status !== 'issued' || !can('manage_finances') ? '' : i.kind === 'invoice'
        ? `<button class="sec" data-a="pay" data-id="${i.id}" data-cur="${i.currency}">Payer</button> <button class="sec" data-a="rec" data-id="${i.id}">Reçus</button> <button class="sec" data-a="cancel" data-id="${i.id}">Annuler</button>`
        : `<button class="sec" data-a="conv" data-id="${i.id}">Convertir en facture</button>`}</td></tr>`).join('') || '<tr><td>Aucun document.</td></tr>'}</table></div><div id="detail"></div>`
    },
    async hr() {
      const [emps, pay] = await Promise.all([api('/employees'), api('/payroll?period=' + period)])
      $('#view').innerHTML = `<h2>Personnel & paie</h2>
      ${can('manage_payroll') ? `<form class="card row" data-f="emp"><input name="first_name" placeholder="Prénom" required><input name="last_name" placeholder="Nom" required><input name="job_title" placeholder="Fonction"><input name="base_salary" placeholder="Salaire de base (HTG)" inputmode="decimal" required><button>+ Employé</button></form>` : ''}
      <div class="card"><table><tr><th>Employé</th><th>Fonction</th><th>Salaire de base</th><th>Statut</th></tr>${emps.map(e => `<tr><td>${esc(e.first_name)} ${esc(e.last_name)}</td><td>${esc(e.job_title)}</td><td>${esc(e.base_salary)} HTG</td><td>${esc(e.status)}</td></tr>`).join('') || '<tr><td>Aucun employé.</td></tr>'}</table></div>
      <form class="row" data-f="period"><input type="month" name="period" value="${period}"><button class="sec">Afficher</button>${can('manage_payroll') ? '<button type="button" data-a="gen">Générer la paie du mois</button>' : ''}</form>
      <div class="card"><table><tr><th>Employé</th><th>Base</th><th>Comm.</th><th>Primes</th><th>Déduct.</th><th>Avances</th><th>Net</th><th>Payé</th><th>Statut</th><th></th></tr>
      ${pay.map(r => `<tr><td>${esc(r.employee)}</td><td>${r.base}</td><td>${r.commissions}</td><td>${r.bonuses}</td><td>${r.deductions}</td><td>${r.advances}</td><td><b>${r.net}</b></td><td>${r.paid}</td><td>${r.status}</td><td><a href="/api/payroll/${r.id}/payslip" target="_blank">Bulletin PDF</a> ${can('manage_payroll') ? `<button class="sec" data-a="adj" data-id="${r.id}" data-v="${r.commissions},${r.bonuses},${r.deductions},${r.advances}">Ajuster</button> <button class="sec" data-a="spay" data-id="${r.id}">Payer</button>` : ''}</td></tr>`).join('') || '<tr><td>Aucune fiche pour cette période.</td></tr>'}</table></div>`
    }
  }
  const submit = {
    async invoice(e) {
      const f = F(e), items = f.lines.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0]).map(p => ({ description: p[0], qty: p[1], unit_price: p[2] }))
      kind = f.kind; await api('/invoices', { kind: f.kind, currency: f.currency, patient_file: f.patient_file, discount: f.discount || undefined, items }); toast('Document créé'); render()
    },
    async emp(e) { await api('/employees', F(e)); toast('Employé ajouté'); render() },
    async period(e) { period = F(e).period; render() }
  }
  const click = async (b, a, id) => {
    if (a === 'bk') { kind = id; render() }
    else if (a === 'conv') { if (!confirm('Convertir cette proforma en facture ?')) return true; await api(`/invoices/${id}/convert`, {}); kind = 'invoice'; toast('Facture créée'); render() }
    else if (a === 'cancel') { if (!confirm('Annuler cette facture ?')) return true; await api(`/invoices/${id}/cancel`, {}); render() }
    else if (a === 'pay') {
      const amount = prompt('Montant reçu :'); if (!amount) return true
      const currency = (prompt('Devise (HTG ou USD) :', b.dataset.cur) || '').toUpperCase(), method = prompt('Mode de paiement (espèces, carte, virement…) :', 'espèces')
      const r = await api(`/invoices/${id}/payments`, { amount, currency, method, idempotency_key: crypto.randomUUID() })
      toast('Paiement enregistré : ' + r.receipt_number); window.open(`/api/payments/${r.id}/receipt`, '_blank'); render()
    } else if (a === 'rec') {
      const p = await api(`/invoices/${id}/payments`)
      $('#detail').innerHTML = `<div class="card"><b>Paiements</b><table>${p.map(x => `<tr><td>${esc(x.receipt_number)}</td><td>${esc(x.amount)} ${x.currency}</td><td>${esc(x.method)}</td><td>${x.voided_at ? 'ANNULÉ' : `<a href="/api/payments/${x.id}/receipt" target="_blank">Reçu PDF</a> <button class="sec" data-a="void" data-id="${x.id}">Annuler</button>`}</td></tr>`).join('') || '<tr><td>Aucun paiement.</td></tr>'}</table></div>`
    } else if (a === 'void') { const reason = prompt("Motif de l'annulation :"); if (!reason) return true; await api(`/payments/${id}/void`, { reason }); toast('Paiement annulé'); render() }
    else if (a === 'gen') { const r = await api('/payroll/generate', { period }); toast(r.created + ' fiche(s) créée(s)'); render() }
    else if (a === 'adj') {
      const v = prompt('Commissions, primes, déductions, avances (séparées par des virgules) :', b.dataset.v); if (!v) return true
      const [commissions, bonuses, deductions, advances] = v.split(',').map(x => x.trim()); await api(`/payroll/${id}/adjust`, { commissions, bonuses, deductions, advances }); render()
    } else if (a === 'spay') {
      const amount = prompt('Montant payé (HTG) :'); if (!amount) return true; await api(`/payroll/${id}/pay`, { amount, method: prompt('Mode de paiement :', 'espèces') || 'espèces' }); toast('Salaire enregistré'); render()
    } else return false
    return true
  }
  return { views, submit, click }
}
