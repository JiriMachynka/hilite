import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Each mutation breaks one rule the tokenizer or renderer depends on. A test suite that guards
// that rule must go red; a mutation that survives means the tests do not actually pin it down.
const root = join(import.meta.dir, '../../..')

interface Mutation {
  name: string
  file: string
  from: string
  to: string
}

const tokenizer = 'packages/core/src/tokenizer.ts'
const theme = 'packages/render/src/theme.ts'
const html = 'packages/render/src/html.ts'
const style = 'packages/render/src/style.ts'

const mutations: Mutation[] = [
  {
    name: 'ties between parts go to the later part',
    file: tokenizer,
    from: 'if (!best || hit.indices[0]! < best.indices[0]!) best = hit',
    to: 'if (!best || hit.indices[0]! <= best.indices[0]!) best = hit',
  },
  {
    name: 'tie inside a scan prefers the later alternative',
    file: tokenizer,
    from: 'alt.index < best.index))',
    to: 'alt.index > best.index))',
  },
  {
    name: 'priority injections lose ties',
    file: tokenizer,
    from: 'injected.priorityMatch && injectedStart === resultStart',
    to: 'false',
  },
  { name: 'anchor not set after a begin match', file: tokenizer, from: '        anchor = matchEnd\n', to: '' },
  {
    name: '\\G never allowed',
    file: tokenizer,
    from: 'return scan(scannerFor(rule, stack.endValues, isFirstLine, pos === anchor, 0), text, pos)',
    to: 'return scan(scannerFor(rule, stack.endValues, isFirstLine, false, 0), text, pos)',
  },
  {
    name: '\\A never allowed on the first line',
    file: tokenizer,
    from: 'return scan(scannerFor(rule, stack.endValues, isFirstLine, pos === anchor, 0), text, pos)',
    to: 'return scan(scannerFor(rule, stack.endValues, false, pos === anchor, 0), text, pos)',
  },
  { name: 'end backreferences not filled', file: tokenizer, from: 'if (rule.regex2?.refs) {', to: 'if (false) {' },
  {
    name: 'downcase command ignored',
    file: tokenizer,
    from: "command === 'downcase' ? value.toLowerCase()",
    to: "command === 'downcase' ? value",
  },
  {
    name: 'empty tokens are emitted',
    file: tokenizer,
    from: 'if (out.last >= end) return',
    to: 'if (out.last > end) return',
  },
  {
    name: 'while failure keeps the block open',
    file: tokenizer,
    from: '      stack = node.parent!\n      break',
    to: '      break',
  },
  {
    name: 'endless loop guard removed',
    file: tokenizer,
    from: 'if (!advanced && old.enterPos === pos) {',
    to: 'if (false) {',
  },
  {
    name: 'applyEndPatternLast ignored',
    file: tokenizer,
    from: 'owner.applyEndPatternLast ? [children, end] : [end, children]',
    to: '[end, children]',
  },
  {
    name: 'backreferences in combined regex not shifted',
    file: tokenizer,
    from: '`(?:\\\\${Number(n) + offset})`',
    to: '`(?:\\\\${Number(n)})`',
  },
  {
    name: 'transferred capture groups ignored',
    file: tokenizer,
    from: 'for (const raw of raws) if (found[raw]) chosen = raw',
    to: '',
  },
  {
    name: 'retokenized captures see the whole line',
    file: tokenizer,
    from: 'tokenizeString(grammar, text.slice(0, end),',
    to: 'tokenizeString(grammar, text,',
  },
  {
    name: '$base resolves to nothing',
    file: tokenizer,
    from: "if (scope === '$base') return linked.grammar.root",
    to: "if (scope === '$base') return undefined",
  },
  {
    name: 'newline-only token kept',
    file: tokenizer,
    from: 'list[list.length - 1]!.start === line.length',
    to: 'false',
  },
  {
    name: 'injection by scope prefix broken',
    file: tokenizer,
    from: 'scope === t || scope.startsWith(`${t}.`)',
    to: 'scope === t',
  },
  {
    name: 'missing capture groups interpolate as literal',
    file: tokenizer,
    from: "start < 0 ? '' :",
    to: 'start < 0 ? all :',
  },
  {
    name: 'theme specificity reversed',
    file: theme,
    from: 'if (a.depth !== b.depth) return b.depth - a.depth',
    to: 'if (a.depth !== b.depth) return a.depth - b.depth',
  },
  { name: 'strict parent selector ignored', file: theme, from: 'if (strict) return false', to: '' },
  {
    name: 'background not part of token identity',
    file: style,
    from: 'a.fg === b.fg && a.bg === b.bg',
    to: 'a.fg === b.fg',
  },
  {
    name: 'whitespace tokens never merge',
    file: html,
    from: 'if (mergeable && whitespace.test(token.content) && line[index + 1]) {',
    to: 'if (false) {',
  },
  {
    name: 'ampersand not escaped in text',
    file: html,
    from: "text.replace(/&/g, '&#x26;').replace(/</g, '&#x3C;')",
    to: "text.replace(/</g, '&#x3C;')",
  },
]

const run = (cwd: string) =>
  Bun.spawnSync(['bun', 'test', '--bail'], {
    cwd: join(root, cwd),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30_000,
    killSignal: 'SIGKILL',
  }).exitCode

const only = process.argv[2]
const survivors: string[] = []
for (const mutation of mutations) {
  if (only && !mutation.name.includes(only)) continue
  const path = join(root, mutation.file)
  const original = readFileSync(path, 'utf8')
  const count = original.split(mutation.from).length - 1
  if (count !== 1) {
    console.log(`SKIP ${mutation.name}: snippet found ${count} times`)
    survivors.push(`${mutation.name} (bad snippet)`)
    continue
  }
  writeFileSync(
    path,
    original.replace(mutation.from, () => mutation.to),
  )
  try {
    // Fast suites first; the Shiki-backed ones only when nothing else caught it.
    const killedBy = ['packages/core', 'packages/compiler', 'apps/bench'].find((dir) => run(dir) !== 0)
    console.log(`${killedBy ? 'killed  ' : 'SURVIVED'} ${mutation.name}${killedBy ? `  (${killedBy})` : ''}`)
    if (!killedBy) survivors.push(mutation.name)
  } finally {
    writeFileSync(path, original)
  }
}
if (!only) {
  mkdirSync(join(root, 'reports'), { recursive: true })
  writeFileSync(
    join(root, 'reports/mutation.json'),
    JSON.stringify({ total: mutations.length, killed: mutations.length - survivors.length, survivors }, null, 2),
  )
}
console.log(
  survivors.length
    ? `\n${survivors.length} survived:\n${survivors.map((s) => `  - ${s}`).join('\n')}`
    : '\nall mutations killed',
)
process.exit(survivors.length ? 1 : 0)
