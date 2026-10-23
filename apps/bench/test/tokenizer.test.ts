import { expect, test } from 'bun:test'
import { compileLanguage, createRegistry as createSources } from '@hilite/compiler'
import { addLang, createGrammar, createRegistry, decode, scopeName, tokenizeLine } from '@hilite/core'
import { both, grammar } from './helpers.ts'
import type { Inline } from './helpers.ts'

const same = async (grammars: Inline[], code: string, root = grammars[0]!.name) => {
  const { want, got } = await both(grammars, root, code)
  // Guard against comparing two empty results.
  expect(want.flat().length).toBeGreaterThan(0)
  expect(got).toEqual(want)
}

test('earliest match wins, ties go to the first pattern', () =>
  same(
    [
      grammar('tie', [
        { match: 'ab', name: 'first' },
        { match: 'a', name: 'second' },
        { match: 'b+', name: 'third' },
        { match: 'x(?=y)', name: 'look' },
      ]),
    ],
    'ab a bb xy abb',
  ))

test('begin/end rules nest and applyEndPatternLast changes who wins at a tie', () =>
  same(
    [
      grammar('nest', [
        { begin: '\\(', end: '\\)', name: 'paren', patterns: [{ include: '$self' }] },
        { begin: '"', end: '"', name: 'str', contentName: 'str.body', patterns: [{ match: '\\\\.', name: 'esc' }] },
        { begin: '<', end: '>', name: 'last', applyEndPatternLast: true, patterns: [{ match: '>', name: 'inner' }] },
        { begin: '\\[', end: '\\]', name: 'first', patterns: [{ match: '\\]', name: 'inner' }] },
      ]),
    ],
    '(a "b\\"c" (d)) <x>y> [z]w] "open',
  ))

test('captures name groups and retokenize captured text with their own patterns', () =>
  same(
    [
      grammar('caps', [
        {
          match: '(let)\\s+(\\w+)\\s*=\\s*(\\d+)?',
          captures: {
            '1': { name: 'kw' },
            '2': { name: 'id' },
            '3': { patterns: [{ match: '\\d', name: 'digit' }], name: 'num' },
          },
        },
        {
          begin: '(\\{)',
          end: '(\\})',
          beginCaptures: { '1': { name: 'open' } },
          endCaptures: { '1': { name: 'close' } },
          name: 'braces',
        },
      ]),
    ],
    'let a = 42\nlet b =\n{ x }',
  ))

test('end patterns can refer to begin captures (heredocs, quotes)', () =>
  same(
    [
      grammar('heredoc', [
        { begin: '<<(\\w+)', end: '^\\1$', name: 'doc', beginCaptures: { '1': { name: 'tag' } } },
        { begin: '([\'"])', end: '\\1', name: 'q' },
        { match: 'EOF', name: 'plain' },
      ]),
    ],
    'x <<EOF\nbody EOF "\nEOF\ny "a\'b" \'c"d\' z',
  ))

test('names and contentNames can interpolate captures', () =>
  same(
    [
      grammar('dyn', [
        { match: '(\\w+)(?:\\.(\\w+))?', name: 'ref.$1.${2:/upcase}.$3' },
        { begin: '(<)(\\w+)', end: '</\\2>', name: 'tag.$2', contentName: 'body.${2:/downcase}' },
      ]),
    ],
    'Ab.cd e <Foo>x</Foo>',
  ))

test('\\G anchors to where the previous match ended', () =>
  same(
    [
      grammar('anchor', [
        {
          begin: 'list:',
          end: '$',
          name: 'list',
          patterns: [
            { match: '\\G\\s*\\w+', name: 'first' },
            { match: ',\\s*\\w+', name: 'rest' },
          ],
        },
        { match: '\\Afirst-line', name: 'start' },
      ]),
    ],
    'first-line list: a, b, c\nlist: one\nfirst-line',
  ))

test('while rules keep a block open until the condition fails', () =>
  same(
    [
      grammar('quote', [
        { begin: '^> ', while: '^> ', name: 'quote', patterns: [{ match: '\\w+', name: 'word' }] },
        { match: '\\w+', name: 'plain' },
      ]),
    ],
    '> one two\n> three\nfour\n> five\n',
  ))

test('rules that match nothing cannot loop forever', () =>
  same(
    [
      grammar('empty', [
        { match: '(?=x)', name: 'peek' },
        { begin: '(?=y)', end: '(?=z)', name: 'span' },
        { match: 'w', name: 'w' },
      ]),
    ],
    'wxwy w z',
  ))

test('includes of missing rules drop the rule that depended on them', () =>
  same(
    [
      grammar(
        'missing',
        [
          { begin: '<<', end: '>>', name: 'gone', patterns: [{ include: '#nope' }] },
          { begin: '\\[', end: '\\]', name: 'kept', patterns: [{ include: '#word' }] },
        ],
        { repository: { word: { match: '\\w+', name: 'word' } } },
      ),
    ],
    '<<a>> [b]',
  ))

test('$base resolves to the grammar tokenizing, not the one defining the rule', () =>
  same(
    [
      grammar('host', [{ match: 'host', name: 'host' }, { include: 'source.guest' }]),
      grammar('guest', [
        { begin: '\\{', end: '\\}', name: 'block', patterns: [{ include: '$base' }] },
        { match: 'guest', name: 'guest' },
      ]),
    ],
    '{ host guest { host } } guest',
    'host',
  ))

test('injections apply by scope selector and priority', () =>
  same(
    [
      grammar('target', [
        { begin: '"', end: '"', name: 'string.quoted' },
        { match: 'word', name: 'word' },
      ]),
      grammar('inject', [{ match: 'TODO|word', name: 'todo' }], {
        injectTo: ['source.target'],
        injectionSelector: 'L:string -comment, R:source.target',
      }),
    ],
    'word "a TODO word" TODO',
    'target',
  ))

test('grammar-level injections can be negated and grouped', () =>
  same(
    [
      grammar(
        'own',
        [
          { begin: '#', end: '$', name: 'comment.line' },
          { begin: "'", end: "'", name: 'string.quoted' },
        ],
        {
          injections: {
            'comment, string - (string.quoted | meta.x)': { patterns: [{ match: 'FIXME', name: 'note' }] },
          },
        },
      ),
    ],
    "# FIXME here\n'FIXME'\nFIXME",
  ))

test('a nameless include injection enters at the nested begin', () =>
  same(
    [
      grammar(
        'wrap',
        [
          {
            begin: '<(script)',
            end: '</\\1>',
            name: 'meta.script',
            beginCaptures: {
              '0': {
                patterns: [
                  {
                    match: '(<)(\\w+)',
                    name: 'meta.tag',
                    captures: { '1': { name: 'punc' }, '2': { name: 'tag' } },
                  },
                ],
              },
            },
          },
        ],
        {
          injections: {
            'L:meta.script': {
              patterns: [
                {
                  begin: '(?<=>)(?!</)',
                  end: '(?=</)',
                  name: 'meta.embedded',
                  contentName: 'source.js',
                  patterns: [
                    { match: '<|>', name: 'relop' },
                    { match: '\\w+', name: 'id' },
                  ],
                },
              ],
            },
          },
        },
      ),
    ],
    '<script>let x</script>',
  ))

test('a raw begin/end injection compiles as its insides, like vscode-textmate', () =>
  same(
    [
      grammar(
        'raw',
        [
          {
            begin: '<(script)',
            end: '</\\1>',
            name: 'meta.script',
            beginCaptures: {
              '0': {
                patterns: [
                  {
                    match: '(<)(\\w+)',
                    name: 'meta.tag',
                    captures: { '1': { name: 'punc' }, '2': { name: 'tag' } },
                  },
                ],
              },
            },
          },
        ],
        {
          injections: {
            'L:meta.script': {
              begin: '(?<=>)(?!</)',
              end: '(?=</)',
              name: 'meta.embedded',
              contentName: 'source.js',
              patterns: [
                { match: '<|>', name: 'relop' },
                { match: '\\w+', name: 'id' },
              ],
            },
          },
        },
      ),
    ],
    '<script>let x</script>',
  ))

test('a capture that wraps \\G patterns in a peek begin can match them', () =>
  same(
    [
      grammar('num', [
        {
          match: '\\d+',
          captures: {
            '0': {
              patterns: [
                {
                  begin: '(?=.)',
                  end: '$',
                  patterns: [
                    { match: '\\G\\d+$', name: 'good' },
                    { match: '\\d+', name: 'bad' },
                  ],
                },
              ],
            },
          },
        },
      ]),
    ],
    '7 42',
  ))

test('lines are independent apart from the carried state, CRLF and empty lines included', () =>
  same(
    [
      grammar('lines', [
        { begin: '/\\*', end: '\\*/', name: 'c' },
        { match: '\\w+', name: 'w' },
      ]),
    ],
    'a /* x\r\n\r\n y */ b\r\n\r\nc',
  ))

test('patterns that need emulation behave like Oniguruma', () =>
  same(
    [
      grammar('emulated', [
        { match: '(?>a+)(b)', name: 'atomic', captures: { '1': { name: 'after' } } },
        { match: '\\d++x', name: 'possessive' },
        { match: '(?i)select|FROM', name: 'folded' },
        { match: '(["\'])[^"\']*\\1', name: 'backref' },
        { match: '(\\w)\\1', name: 'double', captures: { '1': { name: 'letter' } } },
        { match: '\\p{Lu}\\p{Ll}+', name: 'unicode' },
        { match: '(?<=@)\\w+', name: 'behind' },
        { match: '\\h{2,}', name: 'hex' },
      ]),
    ],
    'aab 12x SELECT from "q" \'r\' book Éa @user ff\n',
  ))

test('several alternatives with groups and backreferences share one scan', () =>
  same(
    [
      grammar('combined', [
        { match: '(a)(b)\\2', name: 'one', captures: { '1': { name: 'a' }, '2': { name: 'b' } } },
        { match: '(c)(d)?\\1', name: 'two', captures: { '1': { name: 'c' }, '2': { name: 'd' } } },
        { match: '(e)(?:f)(g)', name: 'three', captures: { '2': { name: 'g' } } },
      ]),
    ],
    'abb cdc cc efg abc',
  ))

test('a pattern that needs class sets still ties by order with a plain one', async () => {
  const plain = { match: 'x+', name: 'plain' }
  const sets = { match: '[\\w&&[^\\d]]+', name: 'sets' }
  await same([grammar('tie-first', [sets, plain])], 'xxx 1xx')
  await same([grammar('tie-last', [plain, sets])], 'xxx 1xx')
})

test('injections with L: win ties against the grammar and R: ones lose', () =>
  same(
    [
      grammar('host', [{ match: 'aa|bb|cc', name: 'plain' }]),
      grammar('left', [{ match: 'aa', name: 'left' }], {
        injectTo: ['source.host'],
        injectionSelector: 'L:source.host',
      }),
      grammar('right', [{ match: 'bb', name: 'right' }], {
        injectTo: ['source.host'],
        injectionSelector: 'R:source.host',
      }),
    ],
    'aa bb cc',
    'host',
  ))

test('injections reach grammars below the scope they target', () =>
  same(
    [
      grammar('target.deep', [{ match: 'word', name: 'plain' }]),
      grammar('inject', [{ match: 'word', name: 'injected' }], {
        injectTo: ['source.target'],
        injectionSelector: 'L:source',
      }),
    ],
    'word',
    'target.deep',
  ))

test('a begin that is immediately ended stops instead of looping', () =>
  same(
    [
      grammar('loop', [
        { begin: '(?=a)', end: '(?=a)', name: 'stuck' },
        { match: 'b', name: 'b' },
      ]),
    ],
    'bab\nab',
  ))

test('captures inside atomic groups keep their Oniguruma numbers', () =>
  same(
    [
      grammar('atomic-captures', [
        { match: '(?>(a+))(b)', name: 'm', captures: { '1': { name: 'inner' }, '2': { name: 'outer' } } },
        { match: '(?>(c)(d+))e', name: 'n', captures: { '1': { name: 'c' }, '2': { name: 'd' } } },
      ]),
    ],
    'aab cddde',
  ))

test('retokenizing a capture cannot read past the end of that capture', () =>
  same(
    [
      grammar('bounded', [
        {
          match: '(ab) (cd)',
          captures: {
            '1': {
              name: 'left',
              patterns: [
                { match: 'ab cd', name: 'crossed' },
                { match: 'a', name: 'a' },
              ],
            },
            '2': { name: 'right' },
          },
        },
      ]),
    ],
    'ab cd',
  ))

test('a capture map picks the group that took part when emulation split one group in two', () => {
  const g = grammar('mapped', [{ match: '(?:(a)|(b))x', name: 'm', captures: { '1': { name: 'which' } } }])
  const sources = createSources([{ name: 'mapped', grammar: g, injectTo: [] }])
  const lang = decode(compileLanguage(sources, 'mapped').text)
  // Oniguruma sees one group 1; the JS source has two, the map says either can supply it.
  const conv = lang.convs.find((c) => c.src.includes('(a)'))!
  conv.map = [[1, 2]]
  const registry = createRegistry()
  addLang(registry, lang)
  const grammarOf = createGrammar(registry, 'source.mapped')!
  const scopes = (text: string) =>
    tokenizeLine(grammarOf, text, null).tokens.map((t) => [
      text.slice(t.start, t.end),
      t.scopeIds.map(scopeName).join(' '),
    ])
  expect(scopes('bx')).toContainEqual(['b', 'source.mapped m which'])
  expect(scopes('ax')).toContainEqual(['a', 'source.mapped m which'])
})
