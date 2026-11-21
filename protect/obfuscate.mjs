// Obscurcit tous les .js d'un dossier (récursif, en place). ESM-safe.
// Usage : node obfuscate.mjs <dossier> <node|browser>
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const JO = require('javascript-obfuscator')

const dir = process.argv[2], target = process.argv[3] || 'node'
if (!dir) { console.error('dossier requis'); process.exit(1) }

// Options modérées : illisible mais robuste (pas de selfDefending/controlFlow qui cassent l'ESM/wasm)
const opts = {
  compact: true,
  target,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,            // ne pas toucher aux globals (casse les imports)
  stringArray: true,
  stringArrayThreshold: 0.8,
  stringArrayEncoding: ['base64'],
  stringArrayWrappersType: 'variable',
  splitStrings: true,
  splitStringsChunkLength: 8,
  numbersToExpressions: true,
  simplify: true,
  transformObjectKeys: false,      // peut casser des accès dynamiques
  selfDefending: false,
  controlFlowFlattening: false,    // fiabilité avant tout
  deadCodeInjection: false,
  unicodeEscapeSequence: false
}

let count = 0, failed = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p) }
    else if (e.name.endsWith('.js')) {
      const src = fs.readFileSync(p, 'utf8')
      try {
        const out = JO.obfuscate(src, opts).getObfuscatedCode()
        fs.writeFileSync(p, out); count++
      } catch (err) { failed.push([p, err.message]) }
    }
  }
}
walk(dir)
console.log(`✓ ${count} fichiers obscurcis dans ${dir}`)
if (failed.length) { console.log('✗ échecs :'); failed.forEach(([p, m]) => console.log('  ', p, '—', m.slice(0, 80))) }
process.exit(failed.length ? 2 : 0)
