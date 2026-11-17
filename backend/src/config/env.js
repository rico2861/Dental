// Charge .env (quel que soit le dossier de lancement) et normalise la configuration.
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')   // …/backend
dotenv.config({ path: path.join(ROOT, '.env') })

if (!process.env.STORAGE_DIR) process.env.STORAGE_DIR = path.join(ROOT, 'storage')
else process.env.STORAGE_DIR = path.resolve(ROOT, process.env.STORAGE_DIR)

const PROJECT = path.resolve(ROOT, '..')
export const config = {
  root: ROOT,
  secret: process.env.JWT_SECRET,
  prod: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,
  get dbDir() { const d = process.env.DB_DIR; return d ? (d.startsWith('memory://') ? d : path.resolve(ROOT, d)) : path.join(ROOT, 'data', 'db') },
  storageDir: process.env.STORAGE_DIR,
  backupDir: process.env.BACKUP_DIR ? path.resolve(ROOT, process.env.BACKUP_DIR) : path.join(ROOT, 'backups'),
  frontendDir: process.env.FRONTEND_DIR ? path.resolve(ROOT, process.env.FRONTEND_DIR) : path.join(PROJECT, 'frontend'),
  migrationsDir: process.env.MIGRATIONS_DIR ? path.resolve(ROOT, process.env.MIGRATIONS_DIR) : path.join(PROJECT, 'db', 'migrations')
}
