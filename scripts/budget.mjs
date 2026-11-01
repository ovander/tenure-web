// The performance budget of RENT-FE-001 §7: the first load is under 1 MB
// gzipped. Counted as an upper bound: every script, style and page of dist/
// gzipped, plus the woff2 icon font (already compressed); route chunks count
// although they load on demand.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const limit = 1024 * 1024
const dist = new URL('../dist/', import.meta.url).pathname
let total = 0
/** @param {string} dir */
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p)
    else if (/\.(js|css|html|webmanifest)$/.test(e.name)) total += gzipSync(await readFile(p)).length
    else if (e.name.endsWith('.woff2')) total += (await readFile(p)).length
  }
}
await walk(dist)
const kb = (/** @type {number} */ n) => `${(n / 1024).toFixed(0)} KiB`
if (total > limit) {
  console.error(`budget: ${kb(total)} gzipped, over the ${kb(limit)} budget`)
  process.exit(1)
}
console.log(`budget: ${kb(total)} gzipped of ${kb(limit)}`)
