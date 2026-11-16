import { config } from './config/env.js'
import express from 'express'; import helmet from 'helmet'; import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'; import jwt from 'jsonwebtoken'; import bcrypt from 'bcryptjs'; import crypto from 'crypto'
import { pool, q } from './db/pool.js'
import { ALL, SENSITIVE, ROLES, makePermissions } from './core/permissions.js'
import billing from './routes/billing.js'; import clinical from './routes/clinical.js'; import stock from './routes/stock.js'; import cash from './routes/cash.js'
import planning from './routes/planning.js'; import reports from './routes/reports.js'; import documents from './routes/documents.js'
import security, { notify as notifyQ, verifySecondFactor } from './routes/security.js'; import clinical2 from './routes/clinical2.js'; import requests from './routes/requests.js'
const SECRET = config.secret
if (!SECRET || SECRET.length < 32) throw new Error('JWT_SECRET (32+ caractères) requis')
const prod = config.prod

// ── Permissions (voir core/permissions.js) ──
const { permsOf, canDelegate } = makePermissions(q)
const audit = (req, action, table, id, details) =>
  q('insert into audit_logs(clinic_id,user_id,action,table_name,record_id,details,ip) values($1,$2,$3,$4,$5,$6,$7)',
    [req.user?.clinic_id, req.user?.id, action, table, id, details ?? null, req.ip])

// ── App ──
const app = express()
app.set('trust proxy', 1)
app.use(helmet()); app.use(express.json({ limit: '100kb' })); app.use(cookieParser())
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next)
const fail = (res, s, error, code) => res.status(s).json({ error, code })

const notify = (c, k, t, x, perm, uid) => notifyQ(q, c, k, t, x, perm, uid)
const adminish = u => u.role === 'OWNER' || u.role.startsWith('ADMIN')
const auth = wrap(async (req, res, next) => {
  let d; try { d = jwt.verify(req.cookies.dl || '', SECRET) } catch { return fail(res, 401, 'Non connecté') }
  if (d.p || !d.sid) return fail(res, 401, 'Non connecté')
  const u = (await q('select u.*,c.inactivity_logout_minutes idle,c.require_2fa req2fa from users u join clinics c on c.id=u.clinic_id where u.id=$1', [d.id])).rows[0]
  if (!u || u.status !== 'active' || u.token_version !== d.tv) return fail(res, 401, 'Session révoquée')
  const s = (await q("select id,(now()-last_seen > ($2::int*interval '1 minute')) idle_out from user_sessions where id=$1 and user_id=$3 and revoked_at is null", [d.sid, u.idle, u.id])).rows[0]
  if (!s) return fail(res, 401, 'Session terminée')
  if (s.idle_out) { await q('update user_sessions set revoked_at=now() where id=$1', [s.id]); return fail(res, 401, 'Session expirée par inactivité', 'IDLE_TIMEOUT') }
  q("update user_sessions set last_seen=now() where id=$1 and last_seen<now()-interval '20 seconds'", [s.id]).catch(() => {})
  req.user = u; req.sid = s.id; req.perms = await permsOf(u); next()
})
const need = (...ps) => [auth, (req, res, next) => {
  if (req.user.must_change_password) return fail(res, 403, 'Changement de mot de passe obligatoire', 'PASSWORD_CHANGE_REQUIRED')
  if (adminish(req.user) && req.user.req2fa && !req.user.totp_enabled) return fail(res, 403, "Activez l'authentification à deux facteurs", 'TWOFA_SETUP_REQUIRED')
  if (ps.length && !ps.some(p => req.perms.has(p))) return fail(res, 403, 'Permission refusée')
  next() }]
const newSession = async (req, res, u) => { const { rows: [s] } = await q('insert into user_sessions(user_id,ip,user_agent) values($1,$2,$3) returning id', [u.id, req.ip, (req.headers['user-agent'] || '').slice(0, 200)])
  res.cookie('dl', jwt.sign({ id: u.id, tv: u.token_version, sid: s.id }, SECRET, { expiresIn: '8h' }), { httpOnly: true, sameSite: 'strict', secure: prod, maxAge: 8 * 3600e3 }) }
const strong = p => typeof p === 'string' && p.length >= 10 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)
const clean = (v, n = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

// ── Auth ──
const hist = (req, u, email, ok, reason) => q('insert into login_history(clinic_id,user_id,email,success,reason,ip,user_agent) values($1,$2,$3,$4,$5,$6,$7)', [u?.clinic_id ?? null, u?.id ?? null, email, ok, reason, req.ip, (req.headers['user-agent'] || '').slice(0, 200)])
const failLogin = async u => { const { rows: [r] } = await q("update users set failed_attempts=failed_attempts+1, locked_until=case when failed_attempts>=4 then now()+interval '15 minutes' end where id=$1 returning locked_until", [u.id]); if (r.locked_until && r.locked_until > new Date()) await notify(u.clinic_id, 'account_locked', 'Compte verrouillé', `${u.email} verrouillé 15 min après 5 échecs`) }
const finishLogin = async (req, res, u) => {
  if (adminish(u) && (await q('select 1 from login_history where user_id=$1 and success limit 1', [u.id])).rowCount && !(await q("select 1 from login_history where user_id=$1 and success and ip=$2 and created_at>now()-interval '60 days' limit 1", [u.id, req.ip])).rowCount)
    await notify(u.clinic_id, 'new_ip', 'Connexion depuis une nouvelle adresse', `${u.email} depuis ${req.ip}`)
  await q('update users set failed_attempts=0, locked_until=null, last_login_at=now() where id=$1', [u.id]); await newSession(req, res, u); req.user = u
  await hist(req, u, u.email, true, 'ok'); await audit(req, 'LOGIN', 'users', u.id); res.json({ ok: true }) }
app.get('/api/health', wrap(async (req, res) => { await q('select 1'); res.json({ status: 'ok', uptime: Math.round(process.uptime()) }) }))
const loginLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 40, standardHeaders: true })
app.post('/api/login', loginLimiter, wrap(async (req, res) => {
  const email = clean(req.body.email)?.toLowerCase(), pw = req.body.password
  const u = email && typeof pw === 'string' ? (await q('select * from users where email=$1', [email])).rows[0] : null
  if (u?.locked_until && u.locked_until > new Date()) { await hist(req, u, email, false, 'locked'); return fail(res, 429, 'Compte temporairement verrouillé') }
  if (!u || !(await bcrypt.compare(pw || '', u.password_hash))) { if (u) await failLogin(u); await hist(req, u, email, false, 'bad_password'); return fail(res, 401, 'Identifiants invalides') }
  if (u.status !== 'active') { await hist(req, u, email, false, 'account_' + u.status); return fail(res, 403, 'Compte bloqué ou désactivé') }
  if (u.totp_enabled) return res.json({ need_otp: true, challenge: jwt.sign({ id: u.id, tv: u.token_version, p: 'otp' }, SECRET, { expiresIn: '5m' }) })
  await finishLogin(req, res, u) }))
app.post('/api/login/otp', loginLimiter, wrap(async (req, res) => {
  let d; try { d = jwt.verify(req.body.challenge || '', SECRET) } catch { return fail(res, 401, 'Défi expiré : reconnectez-vous') } if (d.p !== 'otp') return fail(res, 401, 'Défi invalide')
  const u = (await q('select * from users where id=$1', [d.id])).rows[0]; if (!u || u.status !== 'active' || u.token_version !== d.tv) return fail(res, 401, 'Session révoquée')
  if (u.locked_until && u.locked_until > new Date()) return fail(res, 429, 'Compte temporairement verrouillé')
  if (!(await verifySecondFactor(q, u, req.body.code))) { await failLogin(u); await hist(req, u, u.email, false, 'otp_failed'); return fail(res, 401, 'Code invalide') }
  await finishLogin(req, res, u) }))
app.post('/api/logout', wrap(async (req, res) => { try { const d = jwt.verify(req.cookies.dl || '', SECRET); if (d.sid) await q('update user_sessions set revoked_at=now() where id=$1', [d.sid]) } catch {} res.clearCookie('dl'); res.json({ ok: true }) }))
app.get('/api/me', auth, (req, res) => { const u = req.user
  res.json({ id: u.id, first_name: u.first_name, last_name: u.last_name, role: u.role, must_change_password: u.must_change_password, totp_enabled: u.totp_enabled, idle_minutes: u.idle,
    needs_2fa_setup: !u.must_change_password && adminish(u) && u.req2fa && !u.totp_enabled, perms: [...req.perms] }) })
app.post('/api/change-password', auth, wrap(async (req, res) => {
  const { current, next: np } = req.body
  if (!(await bcrypt.compare(current || '', req.user.password_hash))) return fail(res, 400, 'Mot de passe actuel incorrect')
  if (!strong(np)) return fail(res, 400, '10 caractères min., avec majuscule, minuscule et chiffre')
  if (np === current) return fail(res, 400, 'Choisissez un mot de passe différent')
  const { rows: [u] } = await q('update users set password_hash=$1, must_change_password=false, token_version=token_version+1 where id=$2 returning *', [await bcrypt.hash(np, 12), req.user.id])
  await newSession(req, res, u); await audit(req, 'PASSWORD_CHANGED', 'users', u.id); res.json({ ok: true })
}))

// ── Utilisateurs ──
const tmpPw = () => crypto.randomBytes(9).toString('base64url') + 'aA1'
app.get('/api/users', need('manage_users'), wrap(async (req, res) => res.json((await q(
  'select id,email,first_name,last_name,role,status,job_title,last_login_at,created_at,(select concat(c.first_name,\' \',c.last_name) from users c where c.id=u.created_by) created_by from users u where clinic_id=$1 order by created_at', [req.user.clinic_id])).rows)))
app.post('/api/users', need('manage_users'), wrap(async (req, res) => {
  const { role } = req.body, email = clean(req.body.email)?.toLowerCase(), fn = clean(req.body.first_name), ln = clean(req.body.last_name)
  if (!email || !fn || !ln || !ROLES[role]) return fail(res, 400, 'Champs invalides')
  if (role === 'OWNER' || (role.startsWith('ADMIN') && req.user.role !== 'OWNER')) return fail(res, 403, 'Rôle réservé au propriétaire')
  const pw = tmpPw()
  try {
    const { rows: [u] } = await q('insert into users(clinic_id,email,password_hash,first_name,last_name,role,job_title,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id',
      [req.user.clinic_id, email, await bcrypt.hash(pw, 12), fn, ln, role, clean(req.body.job_title), req.user.id])
    await audit(req, 'USER_CREATED', 'users', u.id, { role }); if (role.startsWith('ADMIN')) await notify(req.user.clinic_id, 'admin_created', 'Administrateur créé', `${email} (${role}) par ${req.user.email}`); res.json({ id: u.id, temporary_password: pw })
  } catch (e) { if (e.code === '23505') return fail(res, 409, 'Email déjà utilisé'); throw e }
}))
const target = wrap(async (req, res, next) => {
  const t = (await q('select * from users where id=$1 and clinic_id=$2', [req.params.id, req.user.clinic_id])).rows[0]
  if (!t) return fail(res, 404, 'Introuvable')
  if (t.role === 'OWNER') return fail(res, 403, 'Le compte propriétaire est protégé')
  if (t.id === req.user.id) return fail(res, 403, 'Action interdite sur son propre compte')
  if (t.role.startsWith('ADMIN') && req.user.role !== 'OWNER') return fail(res, 403, 'Réservé au propriétaire')
  req.target = t; next() })
app.post('/api/users/:id/status', need('manage_users'), target, wrap(async (req, res) => {
  const s = req.body.status; if (!['active', 'blocked', 'disabled'].includes(s)) return fail(res, 400, 'Statut invalide')
  await q('update users set status=$1, token_version=token_version+1 where id=$2', [s, req.target.id])  // révoque les sessions
  await audit(req, 'USER_STATUS', 'users', req.target.id, { status: s })
  await notify(req.user.clinic_id, 'user_status', 'Statut de compte modifié', `${req.target.email} → ${s} (par ${req.user.email})`); res.json({ ok: true }) }))
app.post('/api/users/:id/reset-password', need('manage_users'), target, wrap(async (req, res) => {
  const pw = tmpPw()
  await q('update users set password_hash=$1, must_change_password=true, token_version=token_version+1 where id=$2', [await bcrypt.hash(pw, 12), req.target.id])
  await audit(req, 'PASSWORD_RESET', 'users', req.target.id)
  await notify(req.user.clinic_id, 'password_reset', 'Mot de passe réinitialisé', `${req.target.email} (par ${req.user.email})`); res.json({ temporary_password: pw }) }))
app.post('/api/users/:id/permissions', need('manage_roles'), target, wrap(async (req, res) => {
  const { perm, granted = true, can_delegate = false } = req.body
  if (!ALL.includes(perm)) return fail(res, 400, 'Permission inconnue')
  if (!(await canDelegate(req.user, perm))) return fail(res, 403, 'Vous ne pouvez pas déléguer cette permission')
  if (can_delegate && req.user.role !== 'OWNER' && SENSITIVE.has(perm)) return fail(res, 403, 'Délégation réservée au propriétaire')
  await q(`insert into user_permissions(user_id,perm,granted,can_delegate,granted_by) values($1,$2,$3,$4,$5)
    on conflict(user_id,perm) do update set granted=$3, can_delegate=$4, granted_by=$5, granted_at=now()`, [req.target.id, perm, !!granted, !!can_delegate, req.user.id])
  await audit(req, 'PERMISSION_CHANGED', 'user_permissions', req.target.id, { perm, granted: !!granted })
  await notify(req.user.clinic_id, 'permission_changed', 'Permission modifiée', `${req.user.email} : ${perm} ${granted ? 'accordée à' : 'retirée à'} ${req.target.email}`); res.json({ ok: true }) }))

// ── Taux de change (append-only) ──
app.get('/api/rates', need('view_finances', 'manage_exchange_rates'), wrap(async (req, res) => res.json((await q(
  "select r.id,r.rate::text,r.effective_at,r.justification,concat(u.first_name,' ',u.last_name) by from exchange_rates r join users u on u.id=r.created_by where r.clinic_id=$1 order by effective_at desc, r.created_at desc limit 100", [req.user.clinic_id])).rows)))
app.post('/api/rates', need('manage_exchange_rates'), wrap(async (req, res) => {
  const r = String(req.body.rate ?? ''); if (!/^\d{1,9}(\.\d{1,6})?$/.test(r) || Number(r) <= 0) return fail(res, 400, 'Taux invalide')
  const { rows: [x] } = await q('insert into exchange_rates(clinic_id,rate,justification,created_by) values($1,$2,$3,$4) returning id', [req.user.clinic_id, r, clean(req.body.justification, 300), req.user.id])
  await audit(req, 'RATE_SET', 'exchange_rates', x.id, { rate: r }); res.json({ ok: true }) }))

// ── Patients ──
app.get('/api/patients', need('view_all_patients'), wrap(async (req, res) => {
  const page = Math.max(0, parseInt(req.query.page) || 0), s = clean(req.query.q, 60), args = [req.user.clinic_id]
  let w = 'clinic_id=$1'; if (s) { args.push(`%${s.replace(/[%_\\]/g, '\\$&')}%`); w += ' and (last_name ilike $2 or first_name ilike $2 or phone ilike $2 or file_number ilike $2)' }
  const { rows } = await q(`select id,file_number,last_name,first_name,phone,sex,date_part('year',age(birth_date))::int age,registered_at,count(*) over() total from patients where ${w} order by last_name,first_name limit 20 offset ${page * 20}`, args)
  res.json({ rows, total: Number(rows[0]?.total ?? 0) }) }))
app.post('/api/patients', need('create_patients'), wrap(async (req, res) => {
  const b = req.body, ln = clean(b.last_name), fn = clean(b.first_name); if (!ln || !fn) return fail(res, 400, 'Nom et prénom requis')
  const bd = /^\d{4}-\d{2}-\d{2}$/.test(b.birth_date || '') ? b.birth_date : null, sex = ['M', 'F'].includes(b.sex) ? b.sex : null
  const { rows: [p] } = await q('insert into patients(clinic_id,last_name,first_name,birth_date,sex,phone,address,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,file_number',
    [req.user.clinic_id, ln, fn, bd, sex, clean(b.phone, 30), clean(b.address), req.user.id])
  await audit(req, 'PATIENT_CREATED', 'patients', p.id); res.json(p) }))

app.get('/api/dashboard', need(), wrap(async (req, res) => {
  const c = req.user.clinic_id, out = {}
  if (req.perms.has('view_all_patients')) {
    const { rows: [r] } = await q(`select count(*) filter (where status='active') active, count(*) filter (where registered_at>=date_trunc('month',current_date)) new_month from patients where clinic_id=$1`, [c])
    Object.assign(out, { patients_active: +r.active, patients_new_month: +r.new_month }) }
  if (req.perms.has('view_finances') || req.perms.has('manage_exchange_rates'))
    out.rate = (await q('select rate::text from exchange_rates where clinic_id=$1 and effective_at<=now() order by effective_at desc, created_at desc limit 1', [c])).rows[0]?.rate ?? null
  if (req.perms.has('manage_appointments')) { const { rows: [a] } = await q("select count(*) filter (where starts_at::date=current_date and status in ('planned','confirmed')) today, count(*) filter (where starts_at>now() and status in ('planned','confirmed')) upcoming from appointments where clinic_id=$1", [c])
    const { rows: [r] } = await q("select count(*) n from follow_up_reminders where clinic_id=$1 and status='pending' and due_date<=current_date", [c]); Object.assign(out, { appointments_today: +a.today, appointments_upcoming: +a.upcoming, patients_to_recall: +r.n }) }
  if (req.perms.has('manage_treatment_plans')) out.plans_in_progress = +(await q("select count(*) n from treatment_plans where clinic_id=$1 and status in ('approved','in_progress')", [c])).rows[0].n
  if (req.perms.has('manage_prostheses')) out.prostheses_in_progress = +(await q("select count(*) n from prostheses where clinic_id=$1 and step<>'placed'", [c])).rows[0].n
  res.json(out) }))
app.get('/api/audit', need('view_audit_logs'), wrap(async (req, res) => res.json((await q(
  "select a.id,a.action,a.table_name,a.created_at,concat(u.first_name,' ',u.last_name) who from audit_logs a left join users u on u.id=a.user_id where a.clinic_id=$1 order by a.id desc limit 100", [req.user.clinic_id])).rows)))

const D = { pool, q, need, auth, audit, fail, wrap, clean }; billing(app, D); clinical(app, D); stock(app, D); cash(app, D); planning(app, D); reports(app, D); documents(app, D); security(app, D); clinical2(app, D); requests(app, D)
app.use('/api', (req, res) => fail(res, 404, 'Route inconnue'))
app.use(express.static(config.frontendDir, { maxAge: prod ? '1h' : 0 }))
app.use((err, req, res, next) => { console.error(err.message); err.status === 413 ? fail(res, 413, 'Fichier trop volumineux (10 Mo maximum)') : fail(res, 500, 'Erreur serveur') })
const server = app.listen(config.port, () => console.log('DENTAL LIGHT prêt sur le port', config.port))
const shutdown = sig => { console.log(`${sig} reçu : arrêt propre…`); server.close(() => pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(1), 10000).unref() }
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'))
