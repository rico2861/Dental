// Composants partagés des pages de gestion (facturation, caisse, stock, personnel).
import { ic } from './icons.js'
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const num = v => Number(v ?? 0) || 0
export const money = (v, c = 'HTG') => num(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (c ? ' ' + c : '')
export const qty = v => num(v).toLocaleString('fr-FR', { maximumFractionDigits: 3 })
export const fdate = d => d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' }) : '—'
export const fdt = d => d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince', dateStyle: 'short', timeStyle: 'short' }) : '—'
export const monthLabel = p => new Date(p + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
export const initials = (a, b) => esc(((a || '')[0] || '') + ((b || '')[0] || ''))

// En-tête de page : titre, sous-titre, boutons d'action
export const head = (title, sub, actions = '') => `<div class="ph"><div><h2>${title}</h2>${sub ? `<span class="muted">${sub}</span>` : ''}</div>${actions ? `<div class="row phact">${actions}</div>` : ''}</div>`
export const btn = (a, label, icon, cls = '', extra = '') => `<button type="button" class="${cls}" data-a="${a}" ${extra}>${icon ? ic(icon, 17) : ''}${label}</button>`
// Petit bouton d'action dans un tableau (icône + texte, pas d'infobulle)
export const bs = (a, id, label, icon, cls = '', extra = '') => `<button type="button" class="bs ${cls}" data-a="${a}" data-id="${id}" ${extra}>${icon ? ic(icon, 15) : ''}${label}</button>`
export const bsLink = (href, label, icon = 'file') => `<a class="bs" href="${href}" target="_blank" rel="noopener">${ic(icon, 15)}${label}</a>`

// Cartes indicateurs (même style que le tableau de bord)
const G = { blue: 'linear-gradient(135deg,#1d6fd8,#0a4fb0)', teal: 'linear-gradient(135deg,#16a394,#0b7a6f)', violet: 'linear-gradient(135deg,#7c5cf0,#5a3fd1)', green: 'linear-gradient(135deg,#12a36a,#0b7c4f)', red: 'linear-gradient(135deg,#e5484d,#b9303a)', orange: 'linear-gradient(135deg,#f5a524,#d9780a)', slate: 'linear-gradient(135deg,#4a5a78,#2c3a55)' }
export const kpi = (tone, label, value, sub, icon) => `<div class="kg" style="background:${G[tone] || G.blue}">${ic(icon, 48).replace('class="ic"', 'class="kico"')}<div class="kl">${label}</div><div class="kv">${value}</div><div class="ks">${sub || ''}</div></div>`
export const kpis = cards => `<div class="kpis">${cards.join('')}</div>`

export const badge = (t, cls = 'st-info') => `<span class="badge ${cls}">${t}</span>`
export const pbar = (ratio, color = 'var(--ok)') => `<div class="pbar"><i style="width:${Math.max(0, Math.min(100, ratio * 100)).toFixed(1)}%;background:${color}"></i></div>`
export const empty = (icon, title, text = '', action = '') => `<div class="empty"><div class="eico">${ic(icon, 38)}</div><b>${title}</b>${text ? `<span class="muted">${text}</span>` : ''}${action}</div>`
// Carte avec en-tête (titre + zone à droite)
export const card = (title, icon, body, right = '', cls = '') => `<div class="card ${cls}"><div class="chd"><h3>${icon ? ic(icon, 18) : ''}${title}</h3>${right ? `<div class="row chr">${right}</div>` : ''}</div>${body}</div>`
export const search = (target, ph) => `<label class="sbox sm">${ic('search', 16)}<input data-filter="${target}" placeholder="${ph}" autocomplete="off"></label>`
export const person = (a, b, sub = '') => `<div class="pn"><span class="dav xs">${initials(a, b)}</span><span class="hn"><b>${esc(a)} ${esc(b)}</b>${sub ? `<small>${sub}</small>` : ''}</span></div>`

// Champs de formulaire pour les fenêtres modales
export const fld = (label, name, attrs = '', cls = '') => `<label class="${cls}">${label}<input name="${name}" ${attrs}></label>`
export const sel = (label, name, opts, value = '', cls = '') => `<label class="${cls}">${label}<select name="${name}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>` }).join('')}</select></label>`
// Fenêtre modale de saisie : renvoie les valeurs saisies, ou null si annulée
export const modal = ({ title, icon = 'edit', html, ok = 'Enregistrer', submit, wide = false, onOpen, tone = 'info', danger = false }) =>
  window.ui.dialog({ title, icon, tone, wide, lock: true, onOpen, html, buttons: [{ label: 'Annuler', cls: 'sec', value: null }, { label: ok, cls: 'pri' + (danger ? ' danger' : ''), collect: true, submit }] })

const topS = box => { const all = [...box.querySelectorAll('[data-s]')], set = new Set(all); return all.filter(x => { for (let p = x.parentElement; p && p !== box; p = p.parentElement) if (set.has(p)) return false; return true }) }
// Filtre instantané des lignes d'un tableau (attribut data-s sur chaque ligne)
document.addEventListener('input', e => {
  const t = e.target.closest && e.target.closest('[data-filter]'); if (!t) return
  const v = t.value.trim().toLowerCase(), box = document.querySelector(t.dataset.filter); if (!box) return
  let n = 0; topS(box).forEach(r => { const ok = !v || r.dataset.s.includes(v); r.hidden = !ok; if (ok) n++ })
  const none = box.querySelector('.nores'); if (none) none.hidden = n > 0 || !v
  if (box.dataset.page) { topS(box).forEach(r => { r.dataset.m = !v || r.dataset.s.includes(v) ? '1' : '0' }); box.dataset.p = '0'; paginate(box) }
})
// ── Pagination automatique : tout conteneur avec data-page="N" n'affiche que N éléments (boutons Précédent / Suivant) ──
// éléments de premier niveau seulement (les boutons à l'intérieur d'une ligne, qui portent aussi data-s, ne comptent pas)
const pItems = box => { const all = [...box.querySelectorAll('[data-s],[data-pi]')].filter(x => x.closest('[data-page]') === box), set = new Set(all)
  return all.filter(x => { for (let p = x.parentElement; p && p !== box; p = p.parentElement) if (set.has(p)) return false; return true }) }
export function paginate(box) {
  if (!box.id) box.id = 'pg' + Math.random().toString(36).slice(2, 8)
  const size = Math.max(1, +box.dataset.page || 10), all = pItems(box), match = all.filter(x => x.dataset.m !== '0'), pages = Math.max(1, Math.ceil(match.length / size))
  const p = Math.min(pages - 1, Math.max(0, +box.dataset.p || 0)); box.dataset.p = p
  all.forEach(x => { x.hidden = true }); match.slice(p * size, p * size + size).forEach(x => { x.hidden = false })
  const anchor = box.closest('.tw') || box; let bar = anchor.nextElementSibling?.classList?.contains('kpager') ? anchor.nextElementSibling : null
  if (pages <= 1) { bar?.remove(); return }
  if (!bar) { bar = document.createElement('div'); bar.className = 'kpager'; anchor.after(bar) }
  bar.innerHTML = `<button type="button" class="sec bs" data-kp="${box.id}" data-d="-1" ${p ? '' : 'disabled'}>${ic('left', 15)}Précédent</button><span>Page <b>${p + 1}</b> / ${pages} · ${match.length} élément(s)</span><button type="button" class="sec bs" data-kp="${box.id}" data-d="1" ${p < pages - 1 ? '' : 'disabled'}>Suivant${ic('right', 15)}</button>`
}
document.addEventListener('click', e => { const b = e.target.closest('[data-kp]'); if (!b) return; const box = document.getElementById(b.dataset.kp); if (!box) return
  box.dataset.p = (+box.dataset.p || 0) + (+b.dataset.d); paginate(box); (box.closest('.card') || box).scrollIntoView({ block: 'nearest', behavior: 'smooth' }) })
let pgT; new MutationObserver(() => { clearTimeout(pgT); pgT = setTimeout(() => document.querySelectorAll('[data-page]:not([data-pinit])').forEach(b => { b.dataset.pinit = '1'; paginate(b) }), 0) }).observe(document.documentElement, { childList: true, subtree: true })
// ── Bloc « À retenir » : recommandations calculées pour la page ──
export const tips = (items, title = 'À retenir') => { items = items.filter(Boolean); if (!items.length) return ''
  return `<div class="card ktips"><div class="chd"><h3>${ic('zap', 18)}${title}</h3><span class="muted" style="font-size:12.5px">${items.length} point(s)</span></div><div class="ktl">${items.map(t => t.href ? `<a href="${t.href}" class="ktip ${t.tone || ''}">${ic(t.icon || 'info', 16)}<span>${t.text}</span>${ic('right', 15)}</a>` : `<div class="ktip ${t.tone || ''}">${ic(t.icon || 'info', 16)}<span>${t.text}</span></div>`).join('')}</div></div>` }
export const noRes = cols => `<tr class="nores" hidden><td colspan="${cols}" class="muted" style="text-align:center;padding:22px">Aucun résultat pour cette recherche.</td></tr>`

// ── Bloc « Facturation et paiement » d'un acte : réduction (HTG ou %), paiement immédiat, balance en direct ──
export const METHODS = ['espèces', 'MonCash', 'NatCash', 'virement', 'carte', 'chèque', 'Autre']
const n0 = s => Number(String(s ?? '').replace(',', '.')) || 0
export const payBlock = (amount = '', withAmount = true) => `<div class="payb"><div class="paybh">${ic('dollar', 16)}<b>Facturation et paiement</b><small>La facture est créée automatiquement au nom du médecin qui réalise l'acte.</small></div>
  <div class="fg">${withAmount ? `<label>Montant de l'acte (HTG)<input name="cost" inputmode="decimal" value="${amount}" placeholder="0"></label>` : ''}
  <label>Réduction<span class="disc"><input name="discount" inputmode="decimal" placeholder="0"><select name="disc_mode" aria-label="Type de réduction"><option value="htg">HTG</option><option value="pct">%</option></select></span></label>
  <label>Payé maintenant (HTG)<input name="paid" inputmode="decimal" placeholder="0"></label>
  <label>Mode de paiement<select name="method">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></label></div>
  <div class="qchips"><button type="button" class="qc" data-payall>${ic('check', 13)} Tout payé</button><button type="button" class="qc" data-paynone>Rien payé (à crédit)</button></div>
  <div class="paysum"><span>Montant<b data-ps="a">0</b></span><span>Réduction<b data-ps="d">0</b></span><span>Total à payer<b data-ps="t">0</b></span><span>Payé<b data-ps="p">0</b></span><span class="bal">Balance<b data-ps="b">0</b></span></div></div>`
export const payCalc = (md, fixed) => { const a = fixed ?? n0(md.querySelector('[name=cost]')?.value), dv = n0(md.querySelector('[name=discount]')?.value), pct = md.querySelector('[name=disc_mode]')?.value === 'pct'
  const d = Math.min(a, Math.round((pct ? a * dv / 100 : dv) * 100) / 100), t = Math.round((a - d) * 100) / 100, p = n0(md.querySelector('[name=paid]')?.value); return { a, d, t, p, b: Math.round((t - p) * 100) / 100 } }
export const wirePay = (md, fixed) => {
  const upd = () => { const r = payCalc(md, fixed), set = (k, v) => { const e = md.querySelector(`[data-ps="${k}"]`); if (e) e.textContent = money(v) }
    set('a', r.a); set('d', r.d); set('t', r.t); set('p', r.p); set('b', r.b); const b = md.querySelector('.paysum .bal'); b.classList.toggle('neg', r.b < 0); b.classList.toggle('ok', r.b === 0 && r.t > 0); b.classList.toggle('due', r.b > 0) }
  md.addEventListener('input', upd); md.addEventListener('change', upd)
  md.addEventListener('click', e => { if (e.target.closest('[data-payall]')) { md.querySelector('[name=paid]').value = payCalc(md, fixed).t.toFixed(2); upd() } if (e.target.closest('[data-paynone]')) { md.querySelector('[name=paid]').value = ''; upd() } }); upd() }
export const payFields = (md, fixed) => { const r = payCalc(md, fixed); if (r.b < -0.001) throw new Error('Le montant payé dépasse le total à payer'); return { discount: r.d ? r.d.toFixed(2) : '', paid: r.p ? r.p.toFixed(2) : '', method: md.querySelector('[name=method]')?.value } }
export const billMsg = b => !b ? '' : `Facture ${b.number} · total ${money(b.total)}${b.discount ? ' (réduction ' + money(b.discount) + ')' : ''} · payé ${money(b.paid)} · balance ${money(b.balance)}`

// ── Grille des tarifs : chargée une fois, rafraîchie après modification ──
let tfCache = null
export const loadTariffs = async (api, force) => { if (!tfCache || force) tfCache = api('/tariffs').catch(() => ({ rows: [], rate: null })); return tfCache }
export const resetTariffs = () => { tfCache = null }
// montant en HTG d'un tarif (dollars convertis au taux du jour) ; null si « à déterminer » ou taux manquant
export const tHTG = (t, rate) => t.price == null ? null : t.currency === 'USD' ? (rate ? Math.round(t.price * rate * 100) / 100 : null) : t.price
export const tLabel = (t, rate) => t.price == null ? 'Prix à déterminer' : t.currency === 'USD' ? `${num(t.price).toLocaleString('fr-FR')} $${rate ? ' ≈ ' + money(t.price * rate) : ''}` : money(t.price)
