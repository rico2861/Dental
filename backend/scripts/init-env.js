// Crée (ou complète) backend/.env automatiquement : clé secrète aléatoire, mot de passe propriétaire temporaire.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), envp = path.join(root, '.env')
const secret = () => crypto.randomBytes(48).toString('hex')
if (!fs.existsSync(envp)) {
  const pw = crypto.randomBytes(9).toString('base64url') + '!1a'
  let t = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  t = t.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + secret()).replace(/^OWNER_PASSWORD=.*$/m, 'OWNER_PASSWORD=' + pw)
  fs.writeFileSync(envp, t)
  console.log('.env créé. Compte propriétaire :', (t.match(/^OWNER_EMAIL=(.*)$/m) || [])[1], '/ mot de passe temporaire :', pw)
} else {
  let t = fs.readFileSync(envp, 'utf8')
  if (/^JWT_SECRET=(remplacez|\s*$)/m.test(t)) { fs.writeFileSync(envp, t.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + secret())); console.log('JWT_SECRET généré dans .env') }
  if (!/^REQUIRE_2FA=/m.test(t)) { fs.appendFileSync(envp, '\n# Double authentification obligatoire (propriétaire/admins) : false = désactivée, true = imposée\nREQUIRE_2FA=false\n'); console.log('REQUIRE_2FA=false ajouté à .env (2FA désactivée)') }
}
