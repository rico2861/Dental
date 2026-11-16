import PDFDocument from 'pdfkit'
export const m = (n, c) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + c
const fd = d => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' })
export function pipe(res, name, build) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 })
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`)
  doc.pipe(res); build(doc); doc.end()
}
const head = (doc, cl, title, num, date) => {
  doc.fontSize(18).fillColor('#1d6fd8').text(cl.name).fontSize(9).fillColor('#444').text(cl.address || '').text(cl.phone || '')
  doc.moveDown().fontSize(15).fillColor('#000').text(title).fontSize(10).text(`N° ${num}  —  ${fd(date)}`).moveDown()
}
const table = (doc, cols, rows) => {
  const w = [260, 60, 90, 90]; let y = doc.y
  const line = (r, bold) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9); let x = 48
    r.forEach((t, i) => { doc.text(String(t), x, y, { width: w[i] - 6, align: i ? 'right' : 'left' }); x += w[i] }); y += 16 }
  line(cols, true); rows.forEach(r => { if (y > 740) { doc.addPage(); y = 48 } line(r) }); doc.y = y + 8; doc.x = 48
}
export const invoicePdf = (doc, { clinic, inv, items, patient, paid }) => {
  head(doc, clinic, inv.kind === 'proforma' ? 'PROFORMA (DEVIS)' : 'FACTURE', inv.number, inv.created_at)
  doc.font('Helvetica').fontSize(10).text(`Patient : ${patient.last_name} ${patient.first_name} (${patient.file_number})`).moveDown()
  table(doc, ['Prestation', 'Qté', 'Prix unit.', 'Total'], items.map(i => [i.description, Number(i.qty), m(i.unit_price, inv.currency), m(i.line_total, inv.currency)]))
  doc.font('Helvetica').fontSize(10).text(`Sous-total : ${m(inv.subtotal, inv.currency)}`, { align: 'right' }).text(`Remise : ${m(inv.discount, inv.currency)}`, { align: 'right' })
  doc.font('Helvetica-Bold').text(`TOTAL : ${m(inv.total, inv.currency)}`, { align: 'right' })
  if (inv.kind === 'invoice') doc.font('Helvetica').text(`Payé : ${m(paid, inv.currency)}`, { align: 'right' }).font('Helvetica-Bold').text(`SOLDE : ${m(inv.total - paid, inv.currency)}`, { align: 'right' })
  if (inv.rate_htg_per_usd) doc.moveDown().font('Helvetica').fontSize(8).fillColor('#666').text(`Taux appliqué à l'émission : 1 USD = ${Number(inv.rate_htg_per_usd)} HTG`)
  if (inv.kind === 'proforma') doc.moveDown().fontSize(8).fillColor('#666').text("Document non comptable : devis sans valeur de facture.")
}
export const receiptPdf = (doc, { clinic, pay, inv, patient }) => {
  head(doc, clinic, 'REÇU DE PAIEMENT', pay.receipt_number, pay.created_at)
  doc.font('Helvetica').fontSize(10).text(`Patient : ${patient.last_name} ${patient.first_name}`).text(`Facture : ${inv.number}`).text(`Mode : ${pay.method}`)
  doc.moveDown().font('Helvetica-Bold').text(`Montant reçu : ${m(pay.amount, pay.currency)}`)
  if (pay.currency !== inv.currency) doc.font('Helvetica').text(`Imputé sur la facture : ${m(pay.applied_amount, inv.currency)} (taux ${Number(pay.rate_htg_per_usd)} HTG/USD)`)
  if (pay.voided_at) doc.fillColor('#d93a3a').text('PAIEMENT ANNULÉ')
}
export const payslipPdf = (doc, { clinic, emp, r, pays }) => {
  head(doc, clinic, 'BULLETIN DE PAIE', `${emp.matricule || emp.id.slice(0, 8)} — ${r.period}`, new Date())
  doc.font('Helvetica').fontSize(10).text(`Employé : ${emp.last_name} ${emp.first_name}`).text(`Fonction : ${emp.job_title || '—'}`).moveDown()
  for (const [l, v] of [['Salaire de base', r.base], ['Commissions', r.commissions], ['Primes', r.bonuses], ['Déductions', -r.deductions], ['Avances déduites', -r.advances]])
    doc.text(`${l} : ${m(v, 'HTG')}`)
  doc.moveDown().font('Helvetica-Bold').text(`NET À PAYER : ${m(r.net, 'HTG')}`).font('Helvetica').text(`Déjà payé : ${m(r.paid, 'HTG')}`).font('Helvetica-Bold').text(`Reste : ${m(r.net - r.paid, 'HTG')}`)
  doc.moveDown().font('Helvetica').fontSize(8).fillColor('#666').text('Déductions saisies manuellement (aucun taux d\'impôt n\'est appliqué automatiquement).')
  pays.forEach(p => doc.text(`Paiement du ${fd(p.paid_at)} : ${m(p.amount, 'HTG')} (${p.method})`))
}
