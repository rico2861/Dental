// ═══════════════════════════════════════════════════════════════════════════
//  DENTAL — Pré-démarrage (porte de licence + personnalisation)
//
//  S'exécute AVANT l'app de gestion. Il :
//   1. applique la personnalisation de la clinique (couleur, nom) ;
//   2. vérifie la licence ;
//   3. charge l'app (app.js) seulement si la licence est valable ;
//      sinon il affiche l'écran de licence (activation / clé) et n'ouvre rien.
//  app.js n'est pas modifié : il est importé dynamiquement une fois le feu vert.
// ═══════════════════════════════════════════════════════════════════════════

const $app = document.getElementById('app')

function applyBrand(brand = {}) {
  if (brand.color && /^#[0-9a-fA-F]{6}$/.test(brand.color)) document.documentElement.style.setProperty('--b', brand.color)
  if (brand.name) document.title = brand.name + ' — DENTAL'
}

async function licenseStatus() {
  const r = await fetch('/api/license/status', { headers: { 'Cache-Control': 'no-cache' } })
  if (!r.ok) throw new Error('Statut de licence indisponible')
  return r.json()
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }

async function loadApp(grace) {
  if (grace && grace.grace_days_left != null) banner(`Abonnement expiré — il vous reste ${grace.grace_days_left} jour(s) pour renouveler avant blocage.`)
  await import('./app.js')
}

function banner(text) {
  const b = document.createElement('div')
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:var(--warn,#e98a15);color:#fff;padding:9px 16px;font:600 13.5px system-ui;text-align:center'
  b.textContent = text
  const x = document.createElement('button'); x.textContent = '✕'; x.style.cssText = 'margin-left:14px;background:transparent;border:0;color:#fff;cursor:pointer;font-size:14px'
  x.onclick = () => b.remove(); b.appendChild(x)
  document.body.appendChild(b)
}

// ─── Écran de licence (affiché quand l'accès est bloqué) ─────────────────────
function licenseScreen(s) {
  const titles = {
    needs_activation: 'Activer DENTAL',
    blocked: 'Abonnement expiré',
    revoked: 'Licence suspendue',
    wrong_machine: 'Licence sur un autre ordinateur',
    invalid: 'Licence illisible'
  }
  const msgs = {
    needs_activation: 'Entrez le code fourni avec votre abonnement, ou importez votre fichier <b>licence.key</b>.',
    blocked: 'Votre abonnement est arrivé à échéance. <b>Vos données restent intactes sur cet ordinateur (conservées 90 jours).</b> Renouvelez, puis importez la nouvelle clé pour débloquer l’accès.',
    revoked: 'Cette licence a été suspendue. Contactez votre fournisseur DENTAL.',
    wrong_machine: 'Cette clé est verrouillée sur un autre ordinateur. Demandez une activation pour ce poste.',
    invalid: 'Le fichier de licence est abîmé. Importez une clé valide.'
  }
  const fp = (s.fingerprint || '').slice(0, 12)
  $app.innerHTML = `
  <div style="min-height:100vh;display:grid;place-items:center;background:var(--bg,#f5f7fa);padding:20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="width:100%;max-width:440px;background:#fff;border:1px solid var(--bd,#e3e8ef);border-radius:16px;padding:30px 28px;box-shadow:0 10px 40px rgba(16,40,80,.08)">
      <div style="width:46px;height:46px;border-radius:12px;background:var(--b,#1d6fd8);display:grid;place-items:center;color:#fff;font-weight:800;font-size:19px;margin-bottom:16px">D</div>
      <h1 style="font-size:20px;margin:0 0 6px;color:var(--tx,#1b2430)">${esc(titles[s.status] || 'Licence requise')}</h1>
      <p style="margin:0 0 20px;color:#5b6675;font-size:14px;line-height:1.5">${msgs[s.status] || ''}</p>

      <div id="lic-err" style="display:none;background:#fdecec;color:#b42318;border-radius:9px;padding:10px 12px;font-size:13px;margin-bottom:14px"></div>

      ${s.status === 'needs_activation' || s.status === 'wrong_machine' ? `
      <label style="display:block;font-size:12.5px;font-weight:600;color:#44505f;margin-bottom:6px">Code de la clinique</label>
      <input id="lic-code" placeholder="ex. SOLEIL-2026" style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--bd,#e3e8ef);border-radius:9px;font-size:14px;margin-bottom:12px">
      <button id="lic-activate" style="width:100%;padding:12px;background:var(--b,#1d6fd8);color:#fff;border:0;border-radius:9px;font-weight:700;font-size:14.5px;cursor:pointer">Activer ce poste</button>
      <div style="text-align:center;color:#99a3b2;font-size:12px;margin:16px 0">— ou —</div>
      ` : ''}

      <label style="display:block;font-size:12.5px;font-weight:600;color:#44505f;margin-bottom:6px">Fichier licence.key</label>
      <textarea id="lic-key" rows="3" placeholder="Collez le contenu de licence.key (DL1.…)" style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--bd,#e3e8ef);border-radius:9px;font-size:12px;font-family:ui-monospace,monospace;resize:vertical;margin-bottom:8px"></textarea>
      <input type="file" id="lic-file" accept=".key,.txt,text/plain" style="font-size:12.5px;margin-bottom:12px">
      <button id="lic-install" style="width:100%;padding:12px;background:#fff;color:var(--b,#1d6fd8);border:1.5px solid var(--b,#1d6fd8);border-radius:9px;font-weight:700;font-size:14.5px;cursor:pointer">Installer la clé</button>

      ${s.status !== 'needs_activation' ? `<button id="lic-recheck" style="width:100%;padding:10px;margin-top:10px;background:transparent;color:#5b6675;border:0;font-size:13px;cursor:pointer;text-decoration:underline">Vérifier en ligne</button>` : ''}

      <p style="margin:18px 0 0;color:#99a3b2;font-size:11.5px;text-align:center">Poste n° <code>${esc(fp)}</code> — communiquez-le à votre fournisseur si besoin.</p>
    </div>
  </div>`

  const errBox = document.getElementById('lic-err')
  const showErr = m => { errBox.textContent = m; errBox.style.display = 'block' }
  const busy = (btn, on) => { if (!btn) return; btn.disabled = on; btn.style.opacity = on ? '.6' : '1' }
  const done = () => location.reload()

  const call = async (url, body, btn) => {
    errBox.style.display = 'none'; busy(btn, true)
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showErr(j.error || 'Opération refusée'); busy(btn, false); return }
      done()
    } catch { showErr('Pas de connexion au serveur. Réessayez.'); busy(btn, false) }
  }

  document.getElementById('lic-activate')?.addEventListener('click', e => {
    const code = document.getElementById('lic-code').value.trim()
    if (!code) return showErr('Entrez le code de votre clinique.')
    call('/api/license/activate', { code }, e.target)
  })
  document.getElementById('lic-install')?.addEventListener('click', e => {
    const token = document.getElementById('lic-key').value.trim()
    if (!token) return showErr('Collez ou importez votre fichier licence.key.')
    call('/api/license/key', { token }, e.target)
  })
  document.getElementById('lic-file')?.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return
    document.getElementById('lic-key').value = (await f.text()).trim()
  })
  document.getElementById('lic-recheck')?.addEventListener('click', e => call('/api/license/check', {}, e.target))
}

// ─── Démarrage ───────────────────────────────────────────────────────────────
;(async () => {
  try {
    const s = await licenseStatus()
    applyBrand(s.brand)
    if (s.status === 'active') return loadApp()
    if (s.status === 'grace') return loadApp(s)
    licenseScreen(s)
  } catch {
    // Serveur injoignable au tout démarrage : on laisse l'app tenter (elle gérera ses propres erreurs).
    try { await import('./app.js') } catch {}
  }
})()
