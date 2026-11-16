import { pipe, invoicePdf, receiptPdf, payslipPdf } from '../lib/pdf.js'
const NUM = /^\d{1,10}(\.\d{1,4})?$/, c100 = v => Math.round(Number(v) * 100)
export default function (app, { pool, q, need, audit, fail, wrap, clean }) {
  const tx = async fn => { const c = await pool.connect(); try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r } catch (e) { await c.query('rollback'); throw e } finally { c.release() } }
  const rateNow = async (c, cid) => (await c.query('select rate::text from exchange_rates where clinic_id=$1 and effective_at<=now() order by effective_at desc, created_at desc limit 1', [cid])).rows[0]?.rate ?? null
  const clinic = async cid => (await q('select name,address,phone from clinics where id=$1', [cid])).rows[0]
  const E = (s, m) => ({ err: [s, m] })

  app.get('/api/invoices', need('view_finances'), wrap(async (req, res) => {
    const kind = req.query.kind === 'proforma' ? 'proforma' : 'invoice', page = Math.max(0, parseInt(req.query.page) || 0)
    res.json((await q(`select i.id,i.number,i.kind,i.status,i.currency,i.total::text,i.created_at,p.last_name||' '||p.first_name patient,
      coalesce((select sum(applied_amount) from payments y where y.invoice_id=i.id and y.voided_at is null),0)::text paid
      from invoices i join patients p on p.id=i.patient_id where i.clinic_id=$1 and i.kind=$2 order by i.created_at desc limit 20 offset ${page * 20}`, [req.user.clinic_id, kind])).rows) }))

  app.post('/api/invoices', need('manage_finances'), wrap(async (req, res) => {
    const b = req.body, kind = b.kind === 'proforma' ? 'proforma' : 'invoice', cur = b.currency === 'USD' ? 'USD' : 'HTG'
    const items = Array.isArray(b.items) ? b.items.slice(0, 100) : []; if (!items.length) return fail(res, 400, 'Au moins une prestation')
    let sub = 0; const lines = []
    for (const i of items) { const d = clean(i.description); if (!d || !NUM.test(String(i.qty)) || !NUM.test(String(i.unit_price)) || Number(i.qty) <= 0) return fail(res, 400, 'Ligne invalide')
      const lt = Math.round(Number(i.qty) * c100(i.unit_price)); sub += lt; lines.push([d, i.qty, i.unit_price, lt / 100]) }
    const disc = b.discount ? c100(b.discount) : 0; if (!(disc >= 0 && disc <= sub)) return fail(res, 400, 'Remise invalide')
    const out = await tx(async c => {
      const pat = (await c.query('select id from patients where clinic_id=$1 and file_number=$2', [req.user.clinic_id, clean(b.patient_file, 30)])).rows[0]; if (!pat) return E(404, 'Patient introuvable')
      const rate = await rateNow(c, req.user.clinic_id); if (cur === 'USD' && !rate) return E(409, "Définissez d'abord un taux de change")
      const seq = (await c.query(`select nextval('${kind === 'invoice' ? 'invoice_seq' : 'proforma_seq'}') n`)).rows[0].n
      const num = `${kind === 'invoice' ? 'FAC' : 'PRO'}-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`
      const { rows: [inv] } = await c.query('insert into invoices(clinic_id,kind,number,patient_id,currency,rate_htg_per_usd,subtotal,discount,total,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id,number',
        [req.user.clinic_id, kind, num, pat.id, cur, rate, sub / 100, disc / 100, (sub - disc) / 100, clean(b.notes, 500), req.user.id])
      for (const l of lines) await c.query('insert into invoice_items(invoice_id,description,qty,unit_price,line_total) values($1,$2,$3,$4,$5)', [inv.id, ...l])
      if (/^[0-9a-f-]{36}$/.test(b.plan_id || '')) await c.query('update invoices set plan_id=$1 where id=$2 and exists(select 1 from treatment_plans where id=$1 and clinic_id=$3 and patient_id=$4)', [b.plan_id, inv.id, req.user.clinic_id, pat.id])
      return inv })
    if (out.err) return fail(res, ...out.err)
    await audit(req, 'INVOICE_CREATED', 'invoices', out.id, { number: out.number }); res.json(out) }))

  app.post('/api/invoices/:id/convert', need('manage_finances'), wrap(async (req, res) => {
    const out = await tx(async c => {
      const p = (await c.query("select * from invoices where id=$1 and clinic_id=$2 and kind='proforma' and status='issued' for update", [req.params.id, req.user.clinic_id])).rows[0]; if (!p) return E(404, 'Proforma introuvable ou déjà convertie')
      const rate = await rateNow(c, req.user.clinic_id); if (p.currency === 'USD' && !rate) return E(409, 'Taux de change requis')
      const n = (await c.query("select nextval('invoice_seq') n")).rows[0].n, num = `FAC-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`
      const { rows: [inv] } = await c.query("insert into invoices(clinic_id,kind,number,patient_id,currency,rate_htg_per_usd,subtotal,discount,total,notes,created_by) select clinic_id,'invoice',$2,patient_id,currency,$3,subtotal,discount,total,notes,$4 from invoices where id=$1 returning id,number", [p.id, num, rate, req.user.id])
      await c.query('insert into invoice_items(invoice_id,description,qty,unit_price,line_total) select $2,description,qty,unit_price,line_total from invoice_items where invoice_id=$1', [p.id, inv.id])
      await c.query("update invoices set status='converted' where id=$1", [p.id]); return inv })
    if (out.err) return fail(res, ...out.err); await audit(req, 'PROFORMA_CONVERTED', 'invoices', out.id); res.json(out) }))

  app.post('/api/invoices/:id/cancel', need('manage_finances'), wrap(async (req, res) => {
    const out = await tx(async c => {
      const i = (await c.query("select id,status from invoices where id=$1 and clinic_id=$2 and kind='invoice' for update", [req.params.id, req.user.clinic_id])).rows[0]; if (!i) return E(404, 'Introuvable')
      if ((await c.query('select 1 from payments where invoice_id=$1 and voided_at is null', [i.id])).rowCount) return E(409, "Annulez d'abord les paiements")
      await c.query("update invoices set status='cancelled' where id=$1", [i.id]); return {} })
    if (out.err) return fail(res, ...out.err); await audit(req, 'INVOICE_CANCELLED', 'invoices', req.params.id); res.json({ ok: true }) }))

  app.get('/api/invoices/:id/pdf', need('view_finances'), wrap(async (req, res) => {
    const inv = (await q('select * from invoices where id=$1 and clinic_id=$2', [req.params.id, req.user.clinic_id])).rows[0]; if (!inv) return fail(res, 404, 'Introuvable')
    const [items, pat, paid] = await Promise.all([q('select * from invoice_items where invoice_id=$1 order by description', [inv.id]), q('select * from patients where id=$1', [inv.patient_id]),
      q('select coalesce(sum(applied_amount),0) s from payments where invoice_id=$1 and voided_at is null', [inv.id])])
    const cl = await clinic(req.user.clinic_id)
    pipe(res, inv.number, d => invoicePdf(d, { clinic: cl, inv, items: items.rows, patient: pat.rows[0], paid: Number(paid.rows[0].s) })) }))

  app.get('/api/invoices/:id/payments', need('view_finances'), wrap(async (req, res) => res.json((await q(
    'select id,receipt_number,amount::text,currency,method,created_at,voided_at from payments where invoice_id=$1 and clinic_id=$2 order by created_at', [req.params.id, req.user.clinic_id])).rows)))

  app.post('/api/invoices/:id/payments', need('manage_finances'), wrap(async (req, res) => {
    const { amount, currency, method, idempotency_key: key } = req.body, cur = currency === 'USD' ? 'USD' : 'HTG'
    if (!NUM.test(String(amount)) || Number(amount) <= 0 || typeof key !== 'string' || key.length < 8 || key.length > 80 || !clean(method, 30)) return fail(res, 400, 'Paiement invalide')
    const out = await tx(async c => {
      const dup = (await c.query('select id,receipt_number from payments where clinic_id=$1 and idempotency_key=$2', [req.user.clinic_id, key])).rows[0]; if (dup) return { ...dup, duplicate: true }
      const inv = (await c.query("select * from invoices where id=$1 and clinic_id=$2 and kind='invoice' for update", [req.params.id, req.user.clinic_id])).rows[0]
      if (!inv) return E(404, 'Facture introuvable'); if (inv.status !== 'issued') return E(409, 'Facture non payable')
      const rate = await rateNow(c, req.user.clinic_id); if ((cur !== inv.currency || cur === 'USD') && !rate) return E(409, 'Taux de change requis')
      const a = c100(amount), r = Number(rate)
      const applied = cur === inv.currency ? a : inv.currency === 'HTG' ? Math.round(a * r) : Math.round(a / r), htg = cur === 'HTG' ? a : Math.round(a * r)
      const paid = c100((await c.query('select coalesce(sum(applied_amount),0) s from payments where invoice_id=$1 and voided_at is null', [inv.id])).rows[0].s)
      if (paid + applied > c100(inv.total)) return E(409, 'Le paiement dépasse le solde de la facture')
      const rn = `REC-${new Date().getFullYear()}-${String((await c.query("select nextval('receipt_seq') n")).rows[0].n).padStart(5, '0')}`
      const pr = (await c.query('insert into payments(clinic_id,invoice_id,receipt_number,amount,currency,rate_htg_per_usd,applied_amount,amount_htg,method,idempotency_key,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id,receipt_number',
        [req.user.clinic_id, inv.id, rn, a / 100, cur, rate, applied / 100, htg / 100, clean(method, 30), key, req.user.id])).rows[0]
      await c.query("select cash_post($1,$2,'in',$3,$4,$5,'payment',$6,$7)", [req.user.clinic_id, cur, a / 100, rn, 'Paiement ' + inv.number, pr.id, req.user.id]); return pr })
    if (out.err) return fail(res, ...out.err)
    if (!out.duplicate) await audit(req, 'PAYMENT_RECORDED', 'payments', out.id, { receipt: out.receipt_number }); res.json(out) }))

  app.post('/api/payments/:id/void', need('manage_finances'), wrap(async (req, res) => {
    const reason = clean(req.body.reason, 200); if (!reason) return fail(res, 400, 'Motif requis')
    const r = await q('update payments set voided_at=now(), void_reason=$3 where id=$1 and clinic_id=$2 and voided_at is null returning id,receipt_number,amount,currency', [req.params.id, req.user.clinic_id, reason])
    if (!r.rowCount) return fail(res, 404, 'Paiement introuvable ou déjà annulé')
    const v = r.rows[0]; await q("select cash_post($1,$2,'out',$3,$4,$5,'payment_void',$6,$7)", [req.user.clinic_id, v.currency, v.amount, 'VOID-' + v.receipt_number, 'Annulation ' + v.receipt_number, v.id, req.user.id]); await audit(req, 'PAYMENT_VOIDED', 'payments', req.params.id, { reason }); res.json({ ok: true }) }))
  app.get('/api/payments/:id/receipt', need('view_finances'), wrap(async (req, res) => {
    const pay = (await q('select * from payments where id=$1 and clinic_id=$2', [req.params.id, req.user.clinic_id])).rows[0]; if (!pay) return fail(res, 404, 'Introuvable')
    const inv = (await q('select * from invoices where id=$1', [pay.invoice_id])).rows[0], pat = (await q('select * from patients where id=$1', [inv.patient_id])).rows[0]
    const cl = await clinic(req.user.clinic_id)
    pipe(res, pay.receipt_number, d => receiptPdf(d, { clinic: cl, pay, inv, patient: pat })) }))

  // ── Personnel & paie ──
  app.get('/api/employees', need('view_salaries'), wrap(async (req, res) => res.json((await q('select id,matricule,first_name,last_name,job_title,pay_mode,base_salary::text,status from employees where clinic_id=$1 order by last_name', [req.user.clinic_id])).rows)))
  app.post('/api/employees', need('manage_payroll'), wrap(async (req, res) => {
    const b = req.body, fn = clean(b.first_name), ln = clean(b.last_name); if (!fn || !ln || !NUM.test(String(b.base_salary ?? '0'))) return fail(res, 400, 'Champs invalides')
    const { rows: [e] } = await q('insert into employees(clinic_id,matricule,first_name,last_name,job_title,base_salary,hire_date) values($1,$2,$3,$4,$5,$6,$7) returning id',
      [req.user.clinic_id, clean(b.matricule, 30), fn, ln, clean(b.job_title), b.base_salary || 0, /^\d{4}-\d{2}-\d{2}$/.test(b.hire_date || '') ? b.hire_date : null])
    await audit(req, 'EMPLOYEE_CREATED', 'employees', e.id); res.json(e) }))
  app.get('/api/payroll', need('view_salaries'), wrap(async (req, res) => res.json((await q(
    "select r.id,r.period,e.first_name||' '||e.last_name employee,r.base::text,r.commissions::text,r.bonuses::text,r.deductions::text,r.advances::text,r.net::text,r.paid::text,r.status from payroll_records r join employees e on e.id=r.employee_id where r.clinic_id=$1 and r.period=$2 order by e.last_name",
    [req.user.clinic_id, /^\d{4}-\d{2}$/.test(req.query.period || '') ? req.query.period : new Date().toISOString().slice(0, 7)])).rows)))
  app.post('/api/payroll/generate', need('manage_payroll'), wrap(async (req, res) => {
    const p = req.body.period; if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p || '')) return fail(res, 400, 'Période invalide (AAAA-MM)')
    const r = await q("insert into payroll_records(clinic_id,employee_id,period,base,net) select clinic_id,id,$2,base_salary,base_salary from employees where clinic_id=$1 and status='active' on conflict(employee_id,period) do nothing", [req.user.clinic_id, p])
    await audit(req, 'PAYROLL_GENERATED', 'payroll_records', null, { period: p, created: r.rowCount }); res.json({ created: r.rowCount }) }))
  app.post('/api/payroll/:id/adjust', need('manage_payroll'), wrap(async (req, res) => {
    const f = ['commissions', 'bonuses', 'deductions', 'advances'], v = {}; for (const k of f) { const x = String(req.body[k] ?? '0'); if (!NUM.test(x)) return fail(res, 400, k + ' invalide'); v[k] = c100(x) }
    const out = await tx(async c => {
      const r = (await c.query('select * from payroll_records where id=$1 and clinic_id=$2 for update', [req.params.id, req.user.clinic_id])).rows[0]; if (!r) return E(404, 'Introuvable')
      const net = c100(r.base) + v.commissions + v.bonuses - v.deductions - v.advances; if (net < 0 || net < c100(r.paid)) return E(409, 'Net négatif ou inférieur au montant déjà payé')
      await c.query('update payroll_records set commissions=$2,bonuses=$3,deductions=$4,advances=$5,net=$6 where id=$1', [r.id, v.commissions / 100, v.bonuses / 100, v.deductions / 100, v.advances / 100, net / 100]); return {} })
    if (out.err) return fail(res, ...out.err); await audit(req, 'PAYROLL_ADJUSTED', 'payroll_records', req.params.id); res.json({ ok: true }) }))
  app.post('/api/payroll/:id/pay', need('manage_payroll'), wrap(async (req, res) => {
    const a = String(req.body.amount ?? ''); if (!NUM.test(a) || Number(a) <= 0 || !clean(req.body.method, 30)) return fail(res, 400, 'Paiement invalide')
    const out = await tx(async c => {
      const r = (await c.query('select * from payroll_records where id=$1 and clinic_id=$2 for update', [req.params.id, req.user.clinic_id])).rows[0]; if (!r) return E(404, 'Introuvable')
      const paid = c100(r.paid) + c100(a); if (paid > c100(r.net)) return E(409, 'Dépasse le net à payer')
      const pp = (await c.query('insert into payroll_payments(payroll_id,amount,method,created_by) values($1,$2,$3,$4) returning id', [r.id, a, clean(req.body.method, 30), req.user.id])).rows[0]
      await c.query("insert into expenses(clinic_id,category,description,amount,currency,amount_htg,status,paid_at,source_type,source_id,created_by) values($1,'Salaires',$2,$3,'HTG',$3,'paid',now(),'payroll_payment',$4,$5)", [req.user.clinic_id, 'Salaire ' + r.period, a, pp.id, req.user.id])
      await c.query("select cash_post($1,'HTG','out',$2,$3,$4,'payroll',$5,$6)", [req.user.clinic_id, a, 'SAL-' + pp.id.slice(0, 8), 'Salaire ' + r.period, pp.id, req.user.id])
      await c.query("update payroll_records set paid=$2, status=case when $2>=net then 'paid' else 'partial' end where id=$1", [r.id, paid / 100]); return {} })
    if (out.err) return fail(res, ...out.err); await audit(req, 'SALARY_PAID', 'payroll_records', req.params.id, { amount: a }); res.json({ ok: true }) }))
  app.get('/api/payroll/:id/payslip', need('view_salaries'), wrap(async (req, res) => {
    const r = (await q('select * from payroll_records where id=$1 and clinic_id=$2', [req.params.id, req.user.clinic_id])).rows[0]; if (!r) return fail(res, 404, 'Introuvable')
    const emp = (await q('select * from employees where id=$1', [r.employee_id])).rows[0], pays = (await q('select * from payroll_payments where payroll_id=$1 order by paid_at', [r.id])).rows
    const cl = await clinic(req.user.clinic_id)
    pipe(res, `paie-${emp.last_name}-${r.period}`, d => payslipPdf(d, { clinic: cl, emp, r: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, ['base', 'commissions', 'bonuses', 'deductions', 'advances', 'net', 'paid'].includes(k) ? Number(v) : v])), pays })) }))
}
