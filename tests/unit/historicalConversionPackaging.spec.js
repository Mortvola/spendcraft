import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { dirname, posix } from 'node:path'

test('release metadata includes the historical conversion import graph and PM2 manifest', async ({ assert }) => {
  const configuration = await readFile('adonisrc.ts', 'utf8')
  const patterns = [...configuration.matchAll(/pattern: '([^']+)'/g)].map(match => match[1])
  const pending = ['scripts/convertHistoricalTransactionCategories.mjs', 'installer/pm2-processes.json']
  const visited = new Set()
  while (pending.length) {
    const file = pending.pop()
    if (visited.has(file)) continue
    visited.add(file)
    assert.include(patterns, file, `Missing release metadata for ${file}`)
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) {
      pending.push(posix.normalize(posix.join(dirname(file), match[1])))
    }
  }
  assert.isAbove(visited.size, 6)
})
