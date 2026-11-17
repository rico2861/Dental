// Base de données EMBARQUÉE : PGlite = PostgreSQL complet exécuté dans Node.js.
// Aucun serveur ni logiciel à installer. Les données sont dans backend/data/db (DB_DIR pour changer).
import fs from 'fs'
import { PGlite } from '@electric-sql/pglite'
import { config } from '../config/env.js'
import { applyPendingRestore } from '../lib/backup-restore.js'

const dir = config.dbDir
if (!dir.startsWith('memory://')) fs.mkdirSync(dir, { recursive: true })
// restauration demandée depuis l'application : appliquée ici, au démarrage, avant d'ouvrir la base
const restored = dir.startsWith('memory://') ? null : await applyPendingRestore(dir)

// Mêmes types de retour que le module « pg » : bigint et numeric en chaînes, date en minuit local.
const db = new PGlite(dir, { ...(restored ? { loadDataDir: restored } : {}), parsers: {
  20: v => v,
  1700: v => v,
  1082: v => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d) }
} })
await db.waitReady

const norm = v => v === undefined ? null
  : v instanceof Date ? v.toISOString()
  : (v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v)) ? JSON.stringify(v) : v

async function run(text, params) {
  let r
  if (params === undefined || params === null) { const rs = await db.exec(text); r = rs[rs.length - 1] || { rows: [] } }
  else r = await db.query(text, params.map(norm))
  const rows = r.rows || []
  return { rows, rowCount: r.affectedRows > 0 ? r.affectedRows : rows.length, fields: r.fields }
}

// Une seule connexion : les requêtes (et chaque transaction) passent l'une après l'autre.
let tail = Promise.resolve()
const acquire = () => { let release; const prev = tail; tail = new Promise(r => { release = r }); return prev.then(() => release) }

export const pool = {
  async query(text, params) { const release = await acquire(); try { return await run(text, params) } finally { release() } },
  async connect() { const release = await acquire(); let open = true; return { query: run, release() { if (open) { open = false; release() } } } },
  end: () => db.close()
}
export const q = (text, params) => pool.query(text, params)
// copie complète et cohérente de la base (aucune requête ne passe pendant l'export)
export const dumpDb = async () => { const release = await acquire(); try { return await db.dumpDataDir('gzip') } finally { release() } }
