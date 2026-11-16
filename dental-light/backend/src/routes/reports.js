import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
const D = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null, TZ = "'America/Port-au-Prince'"
const L = c => `(${c} at time zone ${TZ})::date`, BT = c => `${L(c)} between $2::date and $3::date`
const PAID = "coalesce((select sum(applied_amount) from payments y where y.invoice_id=i.id and y.voided_at is null),0)"
const PURCH_PAID = "exists(select 1 from expenses e where e.source_type='purchase' and e.source_id=p.id::text)"
const CAT = {
  patients: { perm: 'view_all_patients', title: 'Patients inscrits', cols: 'file_number:Dossier,last_name:Nom,first_name:Prénom,sex:Sexe,age:Âge:n,phone:Téléphone,registered_at:Inscription,status:Statut',
    sql: `select file_number,last_name,first_name,sex,date_part('year',age(birth_date))::int age,phone,registered_at::text registered_at,status from patients where clinic_id=$1 and registered_at between $2::date and $3::date order by registered_at,last_name` },
  consultations: { perm: 'view_medical_records', title: 'Consultations', cols: 'date:Date,file_number:Dossier,patient:Patient,doctor:Médecin,reason:Motif,diagnosis:Diagnostic,treatment:Traitement,teeth:Dents,cost:Coût (HTG):n',
    sql: `select ${L('c.consulted_at')}::text date,p.file_number,p.last_name||' '||p.first_name patient,u.first_name||' '||u.last_name doctor,c.reason,c.diagnosis,c.treatment,array_to_string(c.teeth,' ') teeth,coalesce(c.cost,0)::text cost from consultations c join patients p on p.id=c.patient_id join users u on u.id=c.doctor_id where c.clinic_id=$1 and ${BT('c.consulted_at')} order by c.consulted_at` },
  doctors: { perm: 'view_medical_records', title: 'Activité des médecins', cols: 'doctor:Médecin,consultations:Consultations:n,interventions:Interventions:n,generated_htg:Revenus générés (HTG):n,prostheses:Prothèses posées:n',
    sql: `select u.first_name||' '||u.last_name doctor,(select count(*) from consultations c where c.doctor_id=u.id and ${BT('c.consulted_at')})::int consultations,(select count(*) from treatment_plan_items i where i.doctor_id=u.id and i.status='done' and ${BT('i.done_at')})::int interventions,(select coalesce(sum(i.price),0) from treatment_plan_items i where i.doctor_id=u.id and i.status='done' and ${BT('i.done_at')})::text generated_htg,(select count(*) from prostheses x where x.doctor_id=u.id and x.placed_at between $2::date and $3::date)::int prostheses from users u where u.clinic_id=$1 and u.status='active' and u.role in ('DENTIST','OWNER','ADMIN_MEDICAL') order by u.last_name` },
  revenues: { perm: 'view_finances', title: 'Revenus encaissés', cols: 'date:Date,invoice:Facture,patient:Patient,receipt:Reçu,method:Mode,amount:Montant:n,currency:Devise,rate:Taux HTG/USD:n,amount_htg:Montant HTG:n',
    sql: `select ${L('y.created_at')}::text date,i.number invoice,p.last_name||' '||p.first_name patient,y.receipt_number receipt,y.method,y.amount::text amount,y.currency,y.rate_htg_per_usd::text rate,y.amount_htg::text amount_htg from payments y join invoices i on i.id=y.invoice_id join patients p on p.id=i.patient_id where y.clinic_id=$1 and y.voided_at is null and ${BT('y.created_at')} order by y.created_at` },
  expenses: { perm: 'view_finances', title: 'Dépenses', cols: 'date:Date,category:Catégorie,description:Description,amount:Montant:n,currency:Devise,amount_htg:Montant HTG:n,status:Statut',
    sql: `select ${L('created_at')}::text date,category,description,amount::text amount,currency,amount_htg::text amount_htg,case status when 'paid' then 'payée' else 'engagée' end status from expenses where clinic_id=$1 and ${BT('created_at')} order by created_at` },
  salaries: { perm: 'view_salaries', title: 'Salaires', cols: 'employee:Employé,period:Période,base:Base:n,commissions:Commissions:n,bonuses:Primes:n,deductions:Déductions:n,advances:Avances:n,net:Net:n,paid:Payé:n,remaining:Reste:n,status:Statut',
    sql: `select e.first_name||' '||e.last_name employee,r.period::text period,r.base::text base,r.commissions::text commissions,r.bonuses::text bonuses,r.deductions::text deductions,r.advances::text advances,r.net::text net,r.paid::text paid,(r.net-r.paid)::text remaining,r.status from payroll_records r join employees e on e.id=r.employee_id where r.clinic_id=$1 and r.period between to_char($2::date,'YYYY-MM') and to_char($3::date,'YYYY-MM') order by r.period,e.last_name` },
  receivables: { perm: 'view_finances', noRange: 1, title: 'Créances patients (factures impayées)', cols: 'number:Facture,patient:Patient,date:Date,currency:Devise,total:Total:n,paid:Payé:n,balance:Reste:n',
    sql: `select i.number,p.last_name||' '||p.first_name patient,${L('i.created_at')}::text date,i.currency,i.total::text total,${PAID}::text paid,(i.total-${PAID})::text balance from invoices i join patients p on p.id=i.patient_id where i.clinic_id=$1 and i.kind='invoice' and i.status='issued' and i.total-${PAID}>0 order by i.created_at` },
  debts: { perm: 'view_finances', noRange: 1, title: 'Dettes et engagements', cols: 'type:Type,party:Concerné,date:Date / période,amount_htg:Montant HTG:n',
    sql: `select 'Fournisseur (achat impayé)' type,coalesce(s.name,'—') party,${L('p.created_at')}::text date,p.total_htg::text amount_htg from purchases p left join suppliers s on s.id=p.supplier_id where p.clinic_id=$1 and not ${PURCH_PAID}
      union all select 'Salaire à payer',e.first_name||' '||e.last_name,r.period::text,(r.net-r.paid)::text from payroll_records r join employees e on e.id=r.employee_id where r.clinic_id=$1 and r.net-r.paid>0
      union all select 'Avance accordée',e.first_name||' '||e.last_name,r.period::text,r.advances::text from payroll_records r join employees e on e.id=r.employee_id where r.clinic_id=$1 and r.advances>0` },
  purchases: { perm: 'manage_inventory', title: 'Achats', cols: 'date:Date,supplier:Fournisseur,currency:Devise,total:Total:n,total_htg:Total HTG:n,status:Réception,payment:Paiement',
    sql: `select ${L('p.created_at')}::text date,coalesce(s.name,'—') supplier,p.currency,p.total::text total,p.total_htg::text total_htg,p.status,case when ${PURCH_PAID} then 'payé' else 'impayé' end payment from purchases p left join suppliers s on s.id=p.supplier_id where p.clinic_id=$1 and ${BT('p.created_at')} order by p.created_at` },
  consumptions: { perm: 'manage_inventory', title: 'Consommation de matériaux', cols: 'date:Date,product:Produit,lot:Lot,qty:Quantité:n,unit_cost:Coût unit. HTG:n,cost:Coût HTG:n,patient:Patient,doctor:Médecin',
    sql: `select ${L('m.created_at')}::text date,pr.name product,l.lot_number lot,(-m.qty)::text qty,m.unit_cost_htg::text unit_cost,round(-m.qty*m.unit_cost_htg,2)::text cost,coalesce(pa.last_name||' '||pa.first_name,'') patient,coalesce(u.first_name||' '||u.last_name,'') doctor from stock_movements m join products pr on pr.id=m.product_id left join product_lots l on l.id=m.lot_id left join patients pa on pa.id=m.patient_id left join users u on u.id=m.doctor_id where m.clinic_id=$1 and m.type='consume' and ${BT('m.created_at')} order by m.created_at` },
  stock: { perm: 'manage_inventory', noRange: 1, title: 'Valeur du stock et produits à commander', cols: 'product:Produit,category:Catégorie,stock:Disponible:n,min_stock:Minimum:n,value:Valeur HTG:n,to_order:À commander',
    sql: `select * from (select p.name product,p.category,coalesce(sum(l.qty_remaining) filter (where l.expiry is null or l.expiry>=current_date),0)::numeric(14,3) stock,p.min_stock,coalesce(sum(l.qty_remaining*l.unit_cost_htg),0)::numeric(14,2) value from products p left join product_lots l on l.product_id=p.id where p.clinic_id=$1 group by p.id) t order by product` },
  expiries: { perm: 'manage_inventory', noRange: 1, title: 'Péremptions', cols: 'product:Produit,lot:Lot,expiry:Expiration,qty:Quantité:n,state:État',
    sql: `select pr.name product,l.lot_number lot,l.expiry::text expiry,l.qty_remaining::text qty,case when l.expiry<current_date then 'Expiré' else 'Proche (60 j)' end state from product_lots l join products pr on pr.id=l.product_id where l.clinic_id=$1 and l.qty_remaining>0 and l.expiry<=current_date+60 order by l.expiry` },
  profit_doctors: { perm: 'view_finances', title: 'Marge brute par médecin', cols: 'doctor:Médecin,interventions_htg:Interventions:n,prostheses_htg:Prothèses facturées:n,materials_htg:Matériaux consommés:n,prostheses_costs_htg:Coûts prothèses:n,margin_htg:Marge brute:n',
    sql: `with t as (select u.first_name||' '||u.last_name doctor,
      coalesce((select sum(i.price) from treatment_plan_items i where i.doctor_id=u.id and i.status='done' and ${BT('i.done_at')}),0) iv,
      coalesce((select sum(x.price) from prostheses x where x.doctor_id=u.id and x.placed_at between $2::date and $3::date),0) pv,
      coalesce((select sum(-m.qty*m.unit_cost_htg) from stock_movements m where m.doctor_id=u.id and m.type='consume' and ${BT('m.created_at')}),0) mv,
      coalesce((select sum(x.material_cost+x.lab_cost) from prostheses x where x.doctor_id=u.id and x.placed_at between $2::date and $3::date),0) pc
      from users u where u.clinic_id=$1 and u.status='active' and u.role in ('DENTIST','OWNER','ADMIN_MEDICAL'))
      select doctor,iv::numeric(14,2)::text interventions_htg,pv::numeric(14,2)::text prostheses_htg,mv::numeric(14,2)::text materials_htg,pc::numeric(14,2)::text prostheses_costs_htg,(iv+pv-mv-pc)::numeric(14,2)::text margin_htg from t order by doctor` },
  profit_prostheses: { perm: 'view_finances', title: 'Marge par type de prothèse (posées)', cols: 'type:Type,n:Nombre:n,price:Prix facturé:n,material:Matériaux:n,lab:Laboratoire:n,margin:Marge:n',
    sql: `select t.name type,count(*)::int n,sum(x.price)::text price,sum(x.material_cost)::text material,sum(x.lab_cost)::text lab,sum(x.price-x.material_cost-x.lab_cost)::text margin from prostheses x join prosthesis_types t on t.id=x.type_id where x.clinic_id=$1 and x.placed_at between $2::date and $3::date group by t.name order by t.name` },
  profit_treatments: { perm: 'view_finances', title: 'Revenus par type de soin (sans coût direct rattaché)', cols: 'description:Intervention,n:Réalisées:n,revenue:Revenus HTG:n',
    sql: `select i.description,count(*)::int n,sum(i.price)::text revenue from treatment_plan_items i join treatment_plans p on p.id=i.plan_id where p.clinic_id=$1 and i.status='done' and ${BT('i.done_at')} group by i.description order by sum(i.price) desc` }
}
for (const r of Object.values(CAT)) r.cols = r.cols.split(',').map(s => s.split(':'))
const safe = v => { v = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? "'" + v : v }
const csv = (cols, rows) => '\ufeff' + [cols.map(c => c[1]), ...rows.map(r => cols.map(c => safe(r[c[0]])))].map(l => l.map(v => /[",;\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(';')).join('\r\n')
export default function (app, { pool, q, need, audit, fail, wrap, clean }) {
  app.get('/api/reports', need(), (req, res) => res.json(Object.entries(CAT).filter(([, r]) => req.perms.has(r.perm)).map(([key, r]) => ({ key, title: r.title, noRange: !!r.noRange }))))
  app.get('/api/reports/:type', need(), wrap(async (req, res) => {
    const r = CAT[req.params.type]; if (!r || !req.perms.has(r.perm)) return fail(res, 403, 'Rapport non autorisé')
    const to = D(req.query.to) || new Date().toISOString().slice(0, 10), from = D(req.query.from) || to.slice(0, 8) + '01', fmt = req.query.format || 'json'
    if (fmt !== 'json' && !req.perms.has('export_reports')) return fail(res, 403, "Permission d'export requise")
    let rows = (await q(r.sql, r.noRange ? [req.user.clinic_id] : [req.user.clinic_id, from, to])).rows.slice(0, 20000)
    if (req.params.type === 'stock') rows = rows.map(x => ({ ...x, to_order: Number(x.stock) <= Number(x.min_stock) ? 'Oui' : '' }))
    const name = `${req.params.type}-${from}_${to}`, head = r.noRange ? r.title : `${r.title} — du ${from} au ${to}`
    if (fmt === 'json') return res.json({ title: head, cols: r.cols, rows: rows.slice(0, 500), total: rows.length })
    await audit(req, 'REPORT_EXPORTED', 'reports', req.params.type, { format: fmt, from, to })
    if (fmt === 'csv') { res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${name}.csv"`); return res.send(csv(r.cols, rows)) }
    if (fmt === 'xlsx') {
      const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(r.title.slice(0, 30)); ws.addRow([head]).font = { bold: true, size: 13 }; ws.addRow([])
      ws.addRow(r.cols.map(c => c[1])).font = { bold: true }; for (const x of rows) ws.addRow(r.cols.map(c => c[2] === 'n' && x[c[0]] !== '' && x[c[0]] != null && !isNaN(x[c[0]]) ? Number(x[c[0]]) : safe(x[c[0]])))
      ws.columns.forEach(c => c.width = 18); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('Content-Disposition', `attachment; filename="${name}.xlsx"`); return res.send(Buffer.from(await wb.xlsx.writeBuffer())) }
    if (fmt === 'pdf') {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 }), w = (842 - 60) / r.cols.length; res.type('application/pdf').set('Content-Disposition', `inline; filename="${name}.pdf"`); doc.pipe(res)
      doc.fontSize(13).text('DENTAL LIGHT — ' + head).moveDown(.5); let y = doc.y
      const line = (vals, bold) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5); vals.forEach((v, i) => doc.text(String(v ?? ''), 30 + i * w, y, { width: w - 4, height: 10, ellipsis: true, lineBreak: false })); y += 14 }
      line(r.cols.map(c => c[1]), true); for (const x of rows.slice(0, 3000)) { if (y > 540) { doc.addPage(); y = 30; line(r.cols.map(c => c[1]), true) } line(r.cols.map(c => x[c[0]])) }
      doc.end(); return }
    fail(res, 400, 'Format inconnu') }))

  // ── Dashboard propriétaire ──
  app.get('/api/dashboard/owner', need(), wrap(async (req, res) => {
    const c = req.user.clinic_id, P = req.perms, per = ['month', 'quarter', 'year'].includes(req.query.period) ? req.query.period : 'month', ref = D(req.query.date) || new Date().toISOString().slice(0, 10)
    const span = { month: '1 month', quarter: '3 months', year: '1 year' }[per]
    const { rows: [rg] } = await q(`select date_trunc('${per}',$1::date)::date::text f,(date_trunc('${per}',$1::date)+interval '${span}')::date::text n, to_char($1::date,'YYYY') y`, [ref])
    const f = rg.f, t = (await q("select ($1::date - 1)::text t", [rg.n])).rows[0].t, one = async (s, p) => (await q(s, p)).rows[0], out = { period: { from: f, to: t, kind: per }, alerts: [] }
    const n = async (s, p = [c]) => Object.values(await one(s, p))[0]
    const S = (tbl, col, extra, rangeCol, p = [c, f, t]) => n(`select coalesce(sum(${col}),0)::numeric(14,2)::text from ${tbl} where clinic_id=$1 ${extra} and ${BT(rangeCol)}`, p)
    const yr = [c, rg.y + '-01-01', rg.y + '-12-31']
    if (P.has('view_all_patients') || P.has('manage_appointments')) {
      const months = (await one('select active_patient_months m from clinics where id=$1', [c])).m
      const pt = await one(`select count(*)::int total,count(*) filter (where status='active' and (registered_at>=current_date-make_interval(months=>$2) or exists(select 1 from consultations x where x.patient_id=p.id and x.consulted_at>=now()-make_interval(months=>$2))))::int active,count(*) filter (where registered_at between $3::date and $4::date)::int news from patients p where clinic_id=$1`, [c, months, f, t])
      const ap = await one(`select count(*) filter (where starts_at>now() and status in ('planned','confirmed'))::int upcoming from appointments where clinic_id=$1`, [c])
      out.medical = { patients_total: pt.total, patients_active: pt.active, patients_inactive: pt.total - pt.active, patients_new: pt.news, active_definition_months: months, appointments_upcoming: ap.upcoming,
        consultations_today: await n(`select count(*)::int from consultations where clinic_id=$1 and ${L('consulted_at')}=${L('now()')}`), to_recall: await n("select count(*)::int from follow_up_reminders where clinic_id=$1 and status='pending' and due_date<=current_date"),
        plans_in_progress: await n("select count(*)::int from treatment_plans where clinic_id=$1 and status in ('approved','in_progress')"), plans_done: await n("select count(*)::int from treatment_plans where clinic_id=$1 and status='done'"),
        prostheses_in_progress: await n("select count(*)::int from prostheses where clinic_id=$1 and step<>'placed'") }
      if (out.medical.to_recall) out.alerts.push({ level: 'warn', title: 'Patients à revoir', text: out.medical.to_recall + ' rappel(s) de suivi à traiter' }) }
    if (P.has('view_finances')) {
      const rev = (p) => S('payments', 'amount_htg', 'and voided_at is null', 'created_at', p), exp = p => S('expenses', 'amount_htg', "and status='paid'", 'paid_at', p)
      const [rd, rp, ry, ep, ey, rec, deb, due] = await Promise.all([n(`select coalesce(sum(amount_htg),0)::numeric(14,2)::text from payments where clinic_id=$1 and voided_at is null and ${L('created_at')}=${L('now()')}`), rev([c, f, t]), rev(yr), exp([c, f, t]), exp(yr),
        n(`select coalesce(sum((i.total-${PAID})*case when i.currency='HTG' then 1 else coalesce(i.rate_htg_per_usd,0) end),0)::numeric(14,2)::text from invoices i where i.clinic_id=$1 and i.kind='invoice' and i.status='issued'`),
        n(`select coalesce(sum(p.total_htg),0)::numeric(14,2)::text from purchases p where p.clinic_id=$1 and not ${PURCH_PAID}`), n("select coalesce(sum(net-paid),0)::numeric(14,2)::text from payroll_records where clinic_id=$1 and status<>'paid'")])
      const cash = (await q(`select a.name,a.currency,(a.opening_balance+coalesce((select sum(case when m.kind in ('in','transfer_in') then m.amount else -m.amount end) from cash_movements m where m.account_id=a.id),0))::text balance from cash_accounts a where a.clinic_id=$1 and a.active order by a.created_at`, [c])).rows
      const fin = (rev_, exp_) => (Number(rev_) - Number(exp_)).toFixed(2)
      out.finance = { revenue_day: rd, revenue_period: rp, revenue_year: ry, expenses_period: ep, expenses_year: ey, profit_period: fin(rp, ep), profit_year: fin(ry, ey), receivables_htg: rec, supplier_debts_htg: deb, salaries_due: due, cash,
        invoiced_period: await n(`select coalesce(sum(case when currency='HTG' then total else total*coalesce(rate_htg_per_usd,0) end),0)::numeric(14,2)::text from invoices where clinic_id=$1 and kind='invoice' and status='issued' and ${BT('created_at')}`, [c, f, t]) }
      if (Number(rec) > 0) out.alerts.push({ level: 'warn', title: 'Créances patients', text: rec + ' HTG à recevoir' }); if (Number(deb) > 0) out.alerts.push({ level: 'warn', title: 'Dettes fournisseurs', text: deb + ' HTG à payer' }); if (Number(due) > 0) out.alerts.push({ level: 'warn', title: 'Salaires à payer', text: due + ' HTG restants' }) }
    if (P.has('view_salaries')) out.staff = { ...(await one("select (select count(*) from users where clinic_id=$1 and status='active' and role in ('DENTIST','ADMIN_MEDICAL'))::int doctors,(select count(*) from employees where clinic_id=$1 and status='active')::int employees", [c])),
      ...(await one("select coalesce(sum(net),0)::text payroll,coalesce(sum(commissions),0)::text commissions,coalesce(sum(paid),0)::text paid,coalesce(sum(net-paid),0)::text pending from payroll_records where clinic_id=$1 and period between to_char($2::date,'YYYY-MM') and to_char($3::date,'YYYY-MM')", [c, f, t])) }
    if (P.has('manage_inventory')) {
      const st = await one(`select coalesce(sum(l.qty_remaining*l.unit_cost_htg),0)::numeric(14,2)::text value,(select count(*) from product_lots where clinic_id=$1 and qty_remaining>0 and expiry<current_date)::int expired,(select count(*) from product_lots where clinic_id=$1 and qty_remaining>0 and expiry between current_date and current_date+60)::int near from product_lots l where l.clinic_id=$1`, [c])
      const low = (await q("select name,stock::text,min_stock::text from (select p.name,p.min_stock,coalesce(sum(l.qty_remaining) filter (where l.expiry is null or l.expiry>=current_date),0) stock from products p left join product_lots l on l.product_id=p.id where p.clinic_id=$1 group by p.id) t where stock<=min_stock order by name", [c])).rows
      out.stock = { ...st, out: low.filter(x => Number(x.stock) === 0).length, low: low.length, low_items: low.slice(0, 8), purchases_period: await S('purchases', 'total_htg', '', 'created_at'), consumption_period: await n(`select coalesce(sum(-qty*unit_cost_htg),0)::numeric(14,2)::text from stock_movements where clinic_id=$1 and type='consume' and ${BT('created_at')}`, [c, f, t]) }
      for (const x of low.slice(0, 4)) out.alerts.push({ level: 'warn', title: x.name, text: `Stock : ${x.stock} (seuil : ${x.min_stock})` }); if (st.expired) out.alerts.push({ level: 'err', title: 'Produits expirés', text: st.expired + ' lot(s) expiré(s) en stock' }); if (st.near) out.alerts.push({ level: 'warn', title: 'Péremption proche', text: st.near + ' lot(s) expirent sous 60 jours' }) }
    if (P.has('approve_purchases')) { const k = await n("select count(*)::int from purchase_requests where clinic_id=$1 and status='pending'"); if (k) out.alerts.push({ level: 'warn', title: "Demandes d'achat en attente", text: k + ' demande(s) à traiter' }) }
    if (P.has('view_audit_logs')) { const k = (await one("select count(*)::int n from notifications x where x.clinic_id=$1 and x.perm='view_audit_logs' and x.created_at>now()-interval '7 days' and not exists(select 1 from notification_reads r where r.notification_id=x.id and r.user_id=$2)", [c, req.user.id])).n; if (k) out.alerts.push({ level: 'err', title: 'Alertes de sécurité', text: k + ' nouvelle(s) alerte(s) cette semaine' }) }
    const m6 = `generate_series(date_trunc('month',current_date)-interval '5 month',date_trunc('month',current_date),interval '1 month') m`
    const ch = out.charts = {}
    if (out.finance) { ch.revenue_6m = (await q(`select to_char(m,'YYYY-MM') m,coalesce(sum(y.amount_htg),0)::float v from ${m6} left join payments y on y.clinic_id=$1 and y.voided_at is null and date_trunc('month',y.created_at at time zone ${TZ})=m group by m order by m`, [c])).rows
      ch.expenses_6m = (await q(`select to_char(m,'YYYY-MM') m,coalesce(sum(e.amount_htg),0)::float v from ${m6} left join expenses e on e.clinic_id=$1 and e.status='paid' and date_trunc('month',e.paid_at at time zone ${TZ})=m group by m order by m`, [c])).rows
      ch.profit_6m = ch.revenue_6m.map((r, i) => ({ m: r.m, v: r.v - ch.expenses_6m[i].v }))
      ch.expense_breakdown = (await q(`select category label,sum(amount_htg)::float v from expenses where clinic_id=$1 and status='paid' and ${BT('paid_at')} group by category order by v desc`, [c, f, t])).rows }
    if (out.medical) { ch.patients_6m = (await q(`select to_char(m,'YYYY-MM') m,count(p.id)::int v from ${m6} left join patients p on p.clinic_id=$1 and date_trunc('month',p.registered_at)=m group by m order by m`, [c])).rows
      ch.consult_by_doctor = (await q(`select u.first_name||' '||u.last_name label,count(*)::int v from consultations x join users u on u.id=x.doctor_id where x.clinic_id=$1 and ${BT('x.consulted_at')} group by u.id order by v desc limit 8`, [c, f, t])).rows
      ch.prosthesis_types = (await q('select t.name label,count(*)::int v from prostheses x join prosthesis_types t on t.id=x.type_id where x.clinic_id=$1 group by t.name order by v desc', [c])).rows
      ch.clinical_activity = [{ label: 'Plans terminés', v: out.medical.plans_done }, { label: 'Plans en cours', v: out.medical.plans_in_progress }, { label: 'Prothèses en cours', v: out.medical.prostheses_in_progress }] }
    if (out.stock) ch.consumption_top = (await q(`select pr.name label,sum(-m.qty*m.unit_cost_htg)::float v from stock_movements m join products pr on pr.id=m.product_id where m.clinic_id=$1 and m.type='consume' and ${BT('m.created_at')} group by pr.name order by v desc limit 5`, [c, f, t])).rows
    res.json(out) }))
}
