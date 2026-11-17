// Facturation automatique d'un acte : facture attribuée au médecin, remise éventuelle, paiement immédiat éventuel (reçu + caisse).
// À appeler dans une transaction (client c). Montants en HTG.
import crypto from 'crypto'
const NUM = /^\d{1,10}(\.\d{1,2})?$/, c100 = v => Math.round(Number(v || 0) * 100)
export const validAmounts = ({ amount, discount, paid }) => {
  for (const v of [amount, discount, paid]) if (v !== undefined && v !== null && v !== '' && !NUM.test(String(v))) return 'Montant invalide'
  const a = c100(amount), d = c100(discount), p = c100(paid)
  if (d > a) return 'La réduction dépasse le montant'
  if (p > a - d) return 'Le montant payé dépasse le total à payer'
  return null }
export async function billService(c, { clinicId, patientId, doctorId, userId, description, amount, discount, paid, method, consultationId = null, planId = null, planItemId = null }) {
  const a = c100(amount), d = c100(discount), p = c100(paid), total = a - d
  if (a <= 0) return null
  const seq = (await c.query("select nextval('invoice_seq') n")).rows[0].n, number = `FAC-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`
  const { rows: [inv] } = await c.query(`insert into invoices(clinic_id,kind,number,patient_id,currency,subtotal,discount,total,created_by,doctor_id,consultation_id,plan_id,plan_item_id)
    values($1,'invoice',$2,$3,'HTG',$4,$5,$6,$7,$8,$9,$10,$11) returning id,number`, [clinicId, number, patientId, a / 100, d / 100, total / 100, userId, doctorId, consultationId, planId, planItemId])
  await c.query('insert into invoice_items(invoice_id,description,qty,unit_price,line_total) values($1,$2,1,$3,$3)', [inv.id, description || 'Acte dentaire', a / 100])
  let receipt = null
  if (p > 0) {
    const rn = `REC-${new Date().getFullYear()}-${String((await c.query("select nextval('receipt_seq') n")).rows[0].n).padStart(5, '0')}`
    receipt = (await c.query(`insert into payments(clinic_id,invoice_id,receipt_number,amount,currency,applied_amount,amount_htg,method,idempotency_key,created_by)
      values($1,$2,$3,$4,'HTG',$4,$4,$5,$6,$7) returning id,receipt_number`, [clinicId, inv.id, rn, p / 100, String(method || 'espèces').slice(0, 30), crypto.randomUUID(), userId])).rows[0]
    await c.query("select cash_post($1,'HTG','in',$2,$3,$4,'payment',$5,$6)", [clinicId, p / 100, rn, 'Paiement ' + number, receipt.id, userId])
  }
  return { invoice_id: inv.id, number: inv.number, amount: a / 100, discount: d / 100, total: total / 100, paid: p / 100, balance: (total - p) / 100, receipt_id: receipt?.id ?? null, receipt_number: receipt?.receipt_number ?? null }
}
// Commissions : taux de l'employé relié au médecin × montants encaissés sur ses actes (paiements de la période, hors annulés)
export const COMMISSION_SQL = `select u.id,u.first_name||' '||u.last_name doctor,u.role,coalesce(e.commission_pct,0)::float8 pct,e.id employee_id,(select commission_basis from clinics where id=$1) basis,
  (select count(*) from invoices i where i.doctor_id=u.id and i.status<>'cancelled' and i.kind='invoice' and i.created_at>=$2::date and i.created_at<($2::date+interval '1 month'))::int services,
  (select count(distinct i.patient_id) from invoices i where i.doctor_id=u.id and i.status<>'cancelled' and i.kind='invoice' and i.created_at>=$2::date and i.created_at<($2::date+interval '1 month'))::int patients,
  (select coalesce(sum(i.total * case when i.currency='USD' then coalesce(i.rate_htg_per_usd,0) else 1 end),0) from invoices i where i.doctor_id=u.id and i.status<>'cancelled' and i.kind='invoice' and i.created_at>=$2::date and i.created_at<($2::date+interval '1 month'))::float8 billed,
  (select coalesce(sum(y.amount_htg),0) from payments y join invoices i on i.id=y.invoice_id where i.doctor_id=u.id and y.voided_at is null and y.created_at>=$2::date and y.created_at<($2::date+interval '1 month'))::float8 collected
  from users u left join employees e on e.user_id=u.id where u.clinic_id=$1 and u.status='active' and u.role in ('DENTIST','OWNER','ADMIN_MEDICAL','ADMIN') `
export const withCommission = r => ({ ...r, commission: Math.round((r.basis === 'billed' ? r.billed : r.collected) * r.pct) / 100 })
