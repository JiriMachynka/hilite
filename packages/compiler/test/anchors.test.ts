import { expect, test } from 'bun:test'
import { hasAnchor, resolveAnchors, rewriteEndOfString } from '../src/anchors.ts'
import { createRegexPool } from '../src/regex-pool.ts'

test('\\z becomes an explicit end-of-text check but an escaped backslash does not', () => {
  expect(rewriteEndOfString('a\\z')).toBe('a$(?!\\n)(?<!\\n)')
  expect(rewriteEndOfString('a\\\\z')).toBe('a\\\\z')
})

test('anchors are only found outside escaped backslashes', () => {
  expect(hasAnchor('\\Gfoo')).toBe(true)
  expect(hasAnchor('\\\\Gfoo')).toBe(false)
  expect(hasAnchor('foo')).toBe(false)
})

test('a disallowed anchor becomes a character that cannot occur', () => {
  expect(resolveAnchors('\\Ga\\Ab', false, true)).toBe('\\Ga\\\uFFFFb')
  expect(resolveAnchors('\\Ga', true, false)).toBe('\\\uFFFFa')
  expect(resolveAnchors('\\Ga', true, true)).toBe('\\Ga')
})

test('the regex pool stores one variant per anchor combination only when anchors exist', () => {
  const pool = createRegexPool()
  const plain = pool.add('foo', false)
  const anchored = pool.add('\\Gfoo|bar', false)
  expect(pool.regexes[plain]!.conv).toHaveLength(1)
  expect(pool.regexes[anchored]!.conv).toHaveLength(4)
  expect(pool.add('foo', false)).toBe(plain)
})

test('end patterns swap \\N for a marker the tokenizer fills in later', () => {
  const pool = createRegexPool()
  const id = pool.add('^\\1$', true)
  expect(pool.regexes[id]!.refs).toBe(true)
  expect(pool.convs[pool.regexes[id]!.conv[0]!]!.src).toContain('\uE001')
  // The same text in a begin pattern is a real backreference, not a marker.
  const begin = pool.add('(a)\\1', false)
  expect(pool.regexes[begin]!.refs).toBe(false)
})

test('Oniguruma high-byte escapes inside classes are read as code points', () => {
  const pool = createRegexPool()
  const id = pool.add('[^\\x00-\\xff]', false)
  expect(pool.failures).toEqual([])
  const conv = pool.convs[pool.regexes[id]!.conv[0]!]!
  expect(new RegExp(conv.src, 'u').test('é')).toBe(false)
  expect(new RegExp(conv.src, 'u').test('€')).toBe(true)
})

test('patterns only use the costly v flag when u cannot express them', () => {
  const pool = createRegexPool()
  const plain = pool.add('(?<![\\w-])[a-z<>@]+', false)
  const intersection = pool.add('[\\w&&[^\\d]]', false)
  expect(pool.convs[pool.regexes[plain]!.conv[0]!]!.set).toBe(false)
  expect(pool.convs[pool.regexes[intersection]!.conv[0]!]!.set).toBe(true)
})

test('atomic groups keep Oniguruma group numbers through a capture map', () => {
  const pool = createRegexPool()
  const id = pool.add('(?>(a+))(b)', false)
  const conv = pool.convs[pool.regexes[id]!.conv[0]!]!
  expect(conv.map).toBeDefined()
  expect(conv.map!.length).toBe(2)
})
