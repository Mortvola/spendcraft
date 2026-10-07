import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import { compareBaseline, cyclicComponents, resolvedGraph } from '../../../scripts/checkCircular.mjs'

const baseline = { members: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a']] }
const graph = { a: ['b'], b: ['c'], c: ['a'] }

test.group('Circular dependency regression', () => {
  test('accepts the reviewed graph', ({ assert }) => {
    assert.isTrue(compareBaseline(graph, baseline).ok)
  })
  test('compares SCC membership independently of traversal and member order', ({ assert }) => {
    assert.deepEqual(cyclicComponents({ c: ['a'], b: ['c'], a: ['b'] }), cyclicComponents(graph))
    assert.isTrue(compareBaseline(graph, { ...baseline, members: ['c', 'a', 'b', 'a'] }).ok)
  })
  test('compares directed edges independently of order and duplicates', ({ assert }) => {
    assert.isTrue(compareBaseline({ c: ['a'], b: ['c'], a: ['b', 'b'] }, {
      ...baseline, edges: [['c', 'a'], ['a', 'b'], ['b', 'c'], ['a', 'b']],
    }).ok)
  })
  test('rejects an unexpected cyclic component', ({ assert }) => {
    const result = compareBaseline({ ...graph, x: ['y'], y: ['x'] }, baseline)
    assert.isFalse(result.ok)
    assert.deepEqual(result.unexpectedComponents[0].members, ['x', 'y'])
  })
  test('detects singleton self-loops but accepts acyclic singleton nodes', ({ assert }) => {
    const result = compareBaseline({ ...graph, x: ['x'], leaf: [] }, baseline)
    assert.isFalse(result.ok)
    assert.deepEqual(result.unexpectedComponents, [{ members: ['x'], edges: [['x', 'x']] }])
  })
  test('rejects membership expansion', ({ assert }) => {
    const result = compareBaseline({ ...graph, c: ['a', 'd'], d: ['a'] }, baseline)
    assert.isFalse(result.ok)
    assert.deepEqual(result.addedMembers, ['d'])
  })
  test('rejects membership reduction', ({ assert }) => {
    const result = compareBaseline({ a: ['b'], b: ['a'], c: [] }, baseline)
    assert.isFalse(result.ok)
    assert.deepEqual(result.removedMembers, ['c'])
  })
  test('rejects an added internal edge', ({ assert }) => {
    const result = compareBaseline({ ...graph, a: ['b', 'c'] }, baseline)
    assert.isFalse(result.ok)
    assert.deepEqual(result.addedEdges, [['a', 'c']])
  })
  test('rejects a removed edge even if the component remains cyclic', ({ assert }) => {
    const extra = { ...baseline, edges: [...baseline.edges, ['a', 'c']] }
    const result = compareBaseline(graph, extra)
    assert.isFalse(result.ok)
    assert.deepEqual(result.removedEdges, [['a', 'c']])
  })
  test('rejects a missing or split accepted component', ({ assert }) => {
    assert.isTrue(compareBaseline({ a: [], b: [], c: [] }, baseline).acceptedComponentMissing)
    assert.isTrue(compareBaseline({ a: ['a'], b: ['b'], c: ['c'] }, baseline).acceptedComponentMissing)
  })
  test('accepts the actual reviewed baseline without repository analysis', async ({ assert }) => {
    const accepted = JSON.parse(await readFile(new URL('../../../scripts/circular-baseline.json', import.meta.url), 'utf8'))
    const reviewedGraph = Object.fromEntries(accepted.members.map((member) => [member, []]))
    for (const [issuer, target] of accepted.edges) reviewedGraph[issuer].push(target)
    assert.lengthOf(accepted.members, 11)
    assert.lengthOf(accepted.edges, 26)
    assert.isTrue(compareBaseline(reviewedGraph, accepted).ok)
  })
  test('normalizes paths and classifies built-ins without hiding missing/skipped files', ({ assert }) => {
    const result = resolvedGraph({
      '/repo/a.ts': [
        { request: './b', id: './b.ts' },
        { request: 'node:fs', id: null },
        { request: 'crypto', id: 'crypto' },
        { request: 'missing-package', id: null },
        { request: 'dependency', id: 'node_modules/dependency/index.js' },
      ],
      './b.ts': null, crypto: [], 'node_modules/dependency/index.js': null,
    }, '/repo')
    assert.deepEqual(result.graph, { 'a.ts': ['b.ts'] })
    assert.deepEqual(result.builtins, ['crypto', 'node:fs'])
    assert.deepEqual(result.problems, [
      'Skipped repository file: b.ts', 'Unresolved import "missing-package" in a.ts',
    ])
  })
})
