// Envoi d'e-mails par SMTP, sans dépendance : TLS direct (port 465) ou STARTTLS (port 587/25), authentification LOGIN.
// Utilisé pour les codes de connexion à usage unique. Sans Internet, l'envoi échoue proprement (délai de 15 s).
import net from 'net'
import tls from 'tls'
import crypto from 'crypto'

const b64 = s => Buffer.from(String(s), 'utf8').toString('base64')
const hdr = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`
export function sendMail({ host, port = 587, user, pass, from, to, subject, text, html, timeout = 15000 }) {
  return new Promise((resolve, reject) => {
    let sock = null, buf = '', step = 0, done = false, timer = null
    const fail = e => { if (done) return; done = true; clearTimeout(timer); try { sock?.destroy() } catch {} reject(e instanceof Error ? e : new Error(String(e))) }
    timer = setTimeout(() => fail(new Error('Serveur e-mail injoignable (pas de connexion Internet ?)')), timeout)
    const send = l => sock.write(l + '\r\n')
    const boundary = 'dl' + crypto.randomBytes(8).toString('hex'), dom = String(from).split('@')[1] || 'localhost'
    const body = [`From: DENTAL LIGHT <${from}>`, `To: <${to}>`, `Subject: ${hdr(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${dom}>`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
      `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/.{76}/g, '$&\r\n'), `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html || text).replace(/.{76}/g, '$&\r\n'), `--${boundary}--`].join('\r\n').replace(/\r\n\./g, '\r\n..')
    const seq = [['EHLO dental-light', 250], ...(Number(port) === 587 ? [['STARTTLS', 220, 'tls'], ['EHLO dental-light', 250]] : []), ...(user ? [['AUTH LOGIN', 334], [b64(user), 334], [b64(pass), 235]] : []), [`MAIL FROM:<${from}>`, 250], [`RCPT TO:<${to}>`, 250], ['DATA', 354], [body + '\r\n.', 250], ['QUIT', 221]]
    const onLine = line => { const code = Number(line.slice(0, 3)); if (line[3] === '-') return   // réponse multiligne
      if (step === 0) { if (code !== 220) return fail(new Error('Serveur e-mail : ' + line)); send(seq[0][0]); step = 1; return }
      const [cmd, want, mode] = seq[step - 1]; if (code !== want) return fail(new Error(cmd.startsWith('AUTH') || want === 235 ? 'Identifiants e-mail refusés par le serveur' : 'Serveur e-mail : ' + line))
      if (mode === 'tls') { sock.removeAllListeners('data'); sock = tls.connect({ socket: sock, servername: host }, () => { send(seq[step][0]); step++ }); sock.on('data', onData); sock.on('error', fail); return }
      if (step >= seq.length) { done = true; clearTimeout(timer); sock.end(); return resolve({ ok: true }) }
      send(seq[step][0]); step++ }
    const onData = d => { buf += d.toString('utf8'); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); onLine(l) } }
    sock = Number(port) === 465 ? tls.connect({ host, port: 465, servername: host }) : net.connect({ host, port: Number(port) })
    sock.on('data', onData); sock.on('error', e => fail(new Error(e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN' ? 'Serveur e-mail introuvable (pas de connexion Internet ?)' : 'Serveur e-mail : ' + e.message))); sock.on('close', () => { if (!done) fail(new Error('Connexion au serveur e-mail interrompue')) })
  }) }
