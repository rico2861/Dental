// Script de modification temporaire (sera supprimé). Remplacements littéraux uniquement.
const fs = require('fs'), path = require('path'), ROOT = path.resolve(__dirname, '..', '..')
const R = (f, pairs) => { const p = path.join(ROOT, f); let s = fs.readFileSync(p, 'utf8')
  for (const [a, b] of pairs) { const k = s.indexOf(a); if (k < 0) throw new Error(f + ' introuvable : ' + a.slice(0, 90)); s = s.slice(0, k) + b + s.slice(k + a.length) }
  fs.writeFileSync(p, s); console.log(f, pairs.length, 'modifs') }

// ── Plans : séances multiples, report, tableau de bord du médecin ──
R('backend/src/routes/planning.js', [
  ["const s = req.body.status, b = req.body; if (!['todo', 'in_progress', 'done', 'cancelled'].includes(s)) return fail(res, 400, 'Statut invalide')",
   "const s = req.body.status, b = req.body; if (!['todo', 'in_progress', 'postponed', 'done', 'cancelled'].includes(s)) return fail(res, 400, 'Statut invalide')\n    if (s === 'postponed' && !clean(b.reason, 200)) return fail(res, 400, 'Motif du report obligatoire')"],
  ["      if (s === 'done' && it.status === 'done') return E(409, 'Intervention déjà terminée')",
   "      if (s === 'done' && it.status === 'done') return E(409, 'Intervention déjà terminée')\n      if (['done', 'cancelled'].includes(it.status) && s !== it.status) return E(409, 'Intervention déjà terminée ou annulée')\n      await c.query('update treatment_plan_items set postponed_reason=$2 where id=$1', [it.id, s === 'postponed' ? clean(b.reason, 200) : null])"],
  ["select i.id,i.description,i.tooth,i.price::text,i.status,i.done_at,u.first_name||' '||u.last_name doctor from treatment_plan_items i",
   "select i.id,i.description,i.tooth,i.price::text,i.status,i.done_at,i.sessions_planned,i.sessions_done,i.postponed_reason,u.first_name||' '||u.last_name doctor from treatment_plan_items i"],
  ["for (const i of items) await c.query('insert into treatment_plan_items(plan_id,description,tooth,price,doctor_id) values($1,$2,$3,$4,$5)', [p.id, clean(i.description), i.tooth || null, i.pric",
   "for (const i of items) await c.query('insert into treatment_plan_items(plan_id,description,tooth,price,doctor_id,sessions_planned) values($1,$2,$3,$4,$5,$6)', [p.id, clean(i.description), i.tooth || null, Math.min(60, Math.max(1, parseInt(i.sessions) || 1)), i.pric"],
  ["  // ── Prothèses & laboratoires ──", `  // ── Séance réalisée : avancement « n / prévues », enregistrée dans l'historique du patient ──
  app.post('/api/plans/:id/items/:item/session', need('manage_treatment_plans'), wrap(async (req, res) => {
    const b = req.body, doc = UUID.test(b.doctor_id || '') ? b.doctor_id : req.user.id
    const out = await tx(async c => {
      const p = (await c.query('select id,status,patient_id,primary_doctor_id from treatment_plans where id=$1 and clinic_id=$2 for update', [req.params.id, req.user.clinic_id])).rows[0]; if (!p) return E(404, 'Plan introuvable')
      if (!['approved', 'in_progress'].includes(p.status)) return E(409, 'Le plan doit être approuvé ou en cours')
      const it = (await c.query('select * from treatment_plan_items where id=$1 and plan_id=$2 for update', [req.params.item, p.id])).rows[0]; if (!it) return E(404, 'Intervention introuvable')
      if (['done', 'cancelled'].includes(it.status)) return E(409, 'Intervention déjà terminée ou annulée')
      if (it.sessions_done >= it.sessions_planned) return E(409, 'Toutes les séances prévues sont réalisées : terminez l\\'intervention')
      const n = it.sessions_done + 1
      await c.query("update treatment_plan_items set sessions_done=$2, status='in_progress', postponed_reason=null, doctor_id=$3 where id=$1", [it.id, n, doc])
      await c.query("insert into consultations(clinic_id,patient_id,doctor_id,primary_doctor_id,reason,treatment,teeth,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [req.user.clinic_id, p.patient_id, doc, p.primary_doctor_id, \`Séance \${n}/\${it.sessions_planned} · \${it.description}\`, clean(b.treatment, 1000) || it.description, it.tooth ? [it.tooth] : [], clean(b.notes, 2000), req.user.id])
      if (p.status === 'approved') await c.query("update treatment_plans set status='in_progress' where id=$1", [p.id])
      return { sessions_done: n, sessions_planned: it.sessions_planned, last: n >= it.sessions_planned } })
    if (!out.err) await audit(req, 'PLAN_SESSION', 'treatment_plan_items', req.params.item, out); done(res, out) }))

  // ── Tableau de bord personnel : uniquement l'activité du médecin connecté ──
  app.get('/api/me/activity', need(), wrap(async (req, res) => {
    const m = /^\\d{4}-\\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7), d0 = m + '-01', me = req.user.id, cid = req.user.clinic_id
    const kpi = (await q(COMMISSION_SQL + 'and u.id=$3', [cid, d0, me])).rows.map(withCommission)[0] || null
    if (kpi) { kpi.paid_direct = Number((await q('select coalesce(sum(amount),0) s from commission_payments where clinic_id=$1 and doctor_id=$2 and period=$3', [cid, me, m])).rows[0].s)
      kpi.in_payroll = Number((await q('select coalesce(sum(r.commissions),0) s from payroll_records r join employees e on e.id=r.employee_id where e.user_id=$1 and r.period=$2', [me, m])).rows[0].s)
      kpi.remaining = Math.max(0, Math.round((kpi.commission - kpi.paid_direct - kpi.in_payroll) * 100) / 100) }
    const [patients, acts, all, upcoming, items] = await Promise.all([
      q("select p.id,p.last_name||' '||p.first_name patient,p.file_number,count(*)::int n,max(c.consulted_at) last,min(c.consulted_at) first,(select c2.reason from consultations c2 where c2.patient_id=p.id and c2.doctor_id=$1 order by c2.consulted_at desc limit 1) last_reason from consultations c join patients p on p.id=c.patient_id where c.doctor_id=$1 and c.clinic_id=$2 group by p.id order by max(c.consulted_at) desc limit 300", [me, cid]),
      q(\`select c.id,c.consulted_at,c.reason,c.teeth,p.id patient_id,p.last_name||' '||p.first_name patient,i.total::float8 total,i.currency,coalesce((select sum(y.applied_amount) from payments y where y.invoice_id=i.id and y.voided_at is null),0)::float8 paid
          from consultations c join patients p on p.id=c.patient_id left join lateral (select * from invoices x where x.consultation_id=c.id and x.status<>'cancelled' limit 1) i on true where c.doctor_id=$1 and c.clinic_id=$2 and c.consulted_at>=$3::date and c.consulted_at<($3::date+interval '1 month') order by c.consulted_at desc limit 300\`, [me, cid, d0]),
      q(\`select (select count(*) from consultations where doctor_id=$1)::int acts,(select count(distinct patient_id) from consultations where doctor_id=$1)::int patients,
          (select coalesce(sum(i.total * case when i.currency='USD' then coalesce(i.rate_htg_per_usd,0) else 1 end),0) from invoices i where i.doctor_id=$1 and i.kind='invoice' and i.status<>'cancelled')::float8 billed,
          (select coalesce(sum(y.amount_htg),0) from payments y join invoices i on i.id=y.invoice_id where i.doctor_id=$1 and y.voided_at is null)::float8 collected,
          (select coalesce(sum(amount),0) from commission_payments where doctor_id=$1)::float8 commissions_paid\`, [me]),
      q("select a.id,a.starts_at,a.duration_min,a.reason,a.status,p.id patient_id,p.last_name||' '||p.first_name patient from appointments a join patients p on p.id=a.patient_id where a.doctor_id=$1 and a.starts_at>now() and a.status in ('planned','confirmed') order by a.starts_at limit 8", [me]),
      q("select i.id,i.description,i.status,i.sessions_planned,i.sessions_done,t.id plan_id,p.id patient_id,p.last_name||' '||p.first_name patient from treatment_plan_items i join treatment_plans t on t.id=i.plan_id join patients p on p.id=t.patient_id where t.clinic_id=$2 and (i.doctor_id=$1 or (i.doctor_id is null and t.responsible_doctor_id=$1)) and i.status in ('todo','in_progress','postponed') and t.status in ('approved','in_progress') order by i.status desc limit 30", [me, cid])])
    res.json({ month: m, kpi, patients: patients.rows, acts: acts.rows, all: all.rows[0], upcoming: upcoming.rows, items: items.rows }) }))

  // ── Prothèses & laboratoires ──`]])

// ── Dettes : export PDF (mêmes filtres que la page) ──
R('backend/src/routes/billing.js', [
  ["import { pipe, invoicePdf, receiptPdf, payslipPdf } from '../lib/pdf.js'", "import { pipe, invoicePdf, receiptPdf, payslipPdf } from '../lib/pdf.js'\nimport { makePdf, header as pdfHeader, table as pdfTable, num as pdfNum, fd as pdfFd } from '../lib/dossier-pdf.js'"],
  ["  app.get('/api/debts', need('view_finances'), wrap(async (req, res) => {", "  const debtRows = async req => {"],
  ["    res.json(rows.map(r => ({ ...r, balance: Math.round((r.total - r.paid) * 100) / 100 }))) }))", `    return rows.map(r => ({ ...r, balance: Math.round((r.total - r.paid) * 100) / 100 })) }
  app.get('/api/debts', need('view_finances'), wrap(async (req, res) => res.json(await debtRows(req))))
  app.get('/api/debts/pdf', need('view_finances'), wrap(async (req, res) => {
    const rows = await debtRows(req), cl = await clinic(req.user.clinic_id) || {}, tot = {}; for (const r of rows) tot[r.currency] = Math.round(((tot[r.currency] || 0) + r.balance) * 100) / 100
    const per = [req.query.from && 'du ' + req.query.from.split('-').reverse().join('/'), req.query.to && 'au ' + req.query.to.split('-').reverse().join('/')].filter(Boolean).join(' ') || 'toutes périodes'
    await audit(req, 'DEBTS_EXPORTED', 'invoices', null, { count: rows.length, format: 'pdf' })
    makePdf(res, 'dettes-patients-' + new Date().toISOString().slice(0, 10), doc => {
      pdfHeader(doc, cl, 'Dettes patients', \`\${rows.length} facture(s) impayée(s) · \${per} · édité le \${pdfFd(new Date())}\`)
      pdfTable(doc, [{ h: 'Patient', w: 17 }, { h: 'Téléphone', w: 11 }, { h: 'Facture', w: 12 }, { h: 'Date', w: 8 }, { h: 'Âge', w: 5, a: 'right' }, { h: 'Médecin', w: 13 }, { h: 'Total', w: 11, a: 'right' }, { h: 'Remise', w: 9, a: 'right' }, { h: 'Payé', w: 11, a: 'right' }, { h: 'Solde', w: 11, a: 'right' }],
        rows.map(r => [r.patient + ' (' + r.file_number + ')', r.phone || '', r.number, pdfFd(r.created_at), r.age_days + ' j', r.doctor || '', pdfNum(r.total, r.currency), r.discount ? pdfNum(r.discount, r.currency) : '', pdfNum(r.paid, r.currency), pdfNum(r.balance, r.currency)]),
        { totals: Object.keys(tot).length ? ['TOTAL DÛ', '', '', '', '', '', '', '', '', Object.entries(tot).map(([c, v]) => pdfNum(v, c)).join('\\n')] : null })
    }, { footer: \`\${cl.name || 'DENTAL LIGHT'}  ·  Dettes patients  ·  confidentiel\`, landscape: true }) }))`]])

// ── Documents rattachés à une intervention ──
R('backend/src/routes/documents.js', [
  ["insert into documents(clinic_id,patient_id,kind,original_name,mime,size,sha256,storage_key,uploaded_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id', [req.use",
   "insert into documents(clinic_id,patient_id,kind,original_name,mime,size,sha256,storage_key,uploaded_by,consultation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,(select id from consultations where id::text=$10 and patient_id=$2)) returning id', [req.use"],
  ["select d.id,d.kind,d.original_name,d.mime,d.size,d.created_at,u.first_name||' '||u.last_name by from documents d left join users u on u.id=d.uploaded_by",
   "select d.id,d.kind,d.original_name,d.mime,d.size,d.created_at,d.consultation_id,c.reason consultation_reason,c.consulted_at,u.first_name||' '||u.last_name by from documents d left join users u on u.id=d.uploaded_by left join consultations c on c.id=d.consultation_id"]])
// le 10e paramètre (intervention liée) est ajouté à la liste des valeurs
{ const p = path.join(ROOT, 'backend/src/routes/documents.js'); let s = fs.readFileSync(p, 'utf8')
  const a = s.indexOf('(select id from consultations where id::text=$10 and patient_id=$2)) returning id'), e = s.indexOf('])', a); if (a < 0 || e < 0) throw new Error('valeurs documents')
  s = s.slice(0, e) + ", String(req.headers['x-consultation-id'] || '')" + s.slice(e); fs.writeFileSync(p, s); console.log('documents.js : paramètre intervention ajouté') }
