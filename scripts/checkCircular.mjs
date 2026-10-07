import { readFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import console from 'node:console'
import process from 'node:process'
import { parseDependencyTree, globFiles } from 'dpdm'

const root = fileURLToPath(new URL('../', import.meta.url))
// Match check:circular's scope. Knip also includes migrations/seeders, so its
// configuration is deliberately not used as the circular check's entry list.
const entries = [
  'client-src/App.tsx', 'bin/*.ts', 'adonisrc.ts', 'config/**/*.ts',
  'start/**/*.ts', 'commands/**/*.ts', 'tests/**/*.spec.{js,ts}', 'tests/bootstrap.ts',
]

const sorted = (values) => [...new Set(values)].sort()
const edgeKey = (edge) => JSON.stringify(edge)

/** Find cyclic SCCs in a resolved adjacency graph, including self-loops. */
export function cyclicComponents(graph) {
  let nextIndex = 0
  const indices = new Map()
  const low = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  function visit(node) {
    indices.set(node, nextIndex)
    low.set(node, nextIndex++)
    stack.push(node)
    onStack.add(node)
    for (const target of graph[node] ?? []) {
      if (!indices.has(target)) {
        visit(target)
        low.set(node, Math.min(low.get(node), low.get(target)))
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node), indices.get(target)))
      }
    }
    if (low.get(node) !== indices.get(node)) return
    const members = []
    let member
    do {
      member = stack.pop()
      onStack.delete(member)
      members.push(member)
    } while (member !== node)
    if (members.length === 1 && !(graph[node] ?? []).includes(node)) return
    const membership = new Set(members)
    const edges = members.flatMap((issuer) => (graph[issuer] ?? [])
      .filter((target) => membership.has(target))
      .map((target) => [issuer, target]))
    components.push({ members: sorted(members), edges: sorted(edges.map(edgeKey)).map(JSON.parse) })
  }
  for (const node of Object.keys(graph).sort()) {
    if (!indices.has(node)) visit(node)
  }
  return components.sort((a, b) => JSON.stringify(a.members).localeCompare(JSON.stringify(b.members)))
}

/** Compare a single explicitly reviewed component without accepting new edges. */
export function compareBaseline(graph, baseline) {
  const components = cyclicComponents(graph)
  const expected = new Set(baseline.members)
  const matching = components.filter((component) => component.members.some((member) => expected.has(member)))
  const members = sorted(matching.flatMap((component) => component.members))
  const edges = sorted(matching.flatMap((component) => component.edges).map(edgeKey))
  const expectedEdges = sorted(baseline.edges.map(edgeKey))
  const differences = {
    addedMembers: members.filter((member) => !expected.has(member)),
    removedMembers: sorted(baseline.members).filter((member) => !members.includes(member)),
    addedEdges: edges.filter((edge) => !expectedEdges.includes(edge)).map(JSON.parse),
    removedEdges: expectedEdges.filter((edge) => !edges.includes(edge)).map(JSON.parse),
    unexpectedComponents: components.filter((component) => !matching.includes(component)),
    acceptedComponentMissing: matching.length !== 1,
  }
  const ok = !differences.acceptedComponentMissing
    && Object.entries(differences).every(([key, value]) => key === 'acceptedComponentMissing' || value.length === 0)
  return { ok, ...differences }
}

/** Normalize dpdm nodes, preserving genuine analysis problems as failures. */
export function resolvedGraph(tree, repositoryRoot) {
  const graph = {}
  const problems = []
  const builtins = new Set()
  const relative = (id) => path.relative(repositoryRoot, path.resolve(repositoryRoot, id)).split(path.sep).join('/')
  for (const [id, dependencies] of Object.entries(tree)) {
    if (isBuiltin(id)) { builtins.add(id); continue }
    const node = relative(id)
    if (node === 'node_modules' || node.startsWith('node_modules/')) continue
    if (dependencies === null) { problems.push(`Skipped repository file: ${node}`); continue }
    graph[node] = []
    for (const dependency of dependencies) {
      if (isBuiltin(dependency.request) || (dependency.id && isBuiltin(dependency.id))) {
        builtins.add(dependency.request)
      } else if (!dependency.id) {
        problems.push(`Unresolved import ${JSON.stringify(dependency.request)} in ${node}`)
      } else {
        const target = relative(dependency.id)
        if (target !== 'node_modules' && !target.startsWith('node_modules/')) graph[node].push(target)
      }
    }
    graph[node] = sorted(graph[node])
  }
  return { graph, problems: sorted(problems), builtins: sorted(builtins) }
}

async function main() {
  const matched = await Promise.all(entries.map((entry) => globFiles(entry, root)))
  if (!matched.flat().length) throw new Error('No configured circular-check entry files matched')
  let analyzed = 0
  const tree = await parseDependencyTree(entries, {
    cwd: root, context: root, transform: true,
    onProgress: (event) => { if (event === 'end') analyzed++ },
  })
  const { graph, problems, builtins } = resolvedGraph(tree, root)
  if (!Object.keys(graph).length) throw new Error('Dependency analysis returned no repository files')
  if (builtins.length) console.log(`Node built-ins (informational): ${builtins.join(', ')}`)
  const baseline = JSON.parse(await readFile(new URL('./circular-baseline.json', import.meta.url), 'utf8'))
  const result = compareBaseline(graph, baseline)
  if (problems.length || !result.ok) {
    console.error('Circular dependency regression check failed; review changes before updating the baseline.')
    for (const problem of problems) console.error(problem)
    for (const [label, values] of Object.entries(result)) {
      if (label === 'ok') continue
      if (values === true || (Array.isArray(values) && values.length)) console.error(`${label}: ${JSON.stringify(values)}`)
    }
    process.exitCode = 1
    return
  }
  console.log(`Accepted Lucid model SCC: ${baseline.members.length} members / ${baseline.edges.length} internal edges; no unexpected cyclic components.`)
  console.log(`Analyzed ${analyzed} files; graph contains ${Object.keys(graph).length} repository nodes (including asset leaves). Full cycle paths: npm run check:circular`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Circular dependency analysis failed: ${error.message}`)
    process.exitCode = 1
  })
}
