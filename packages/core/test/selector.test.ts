import { expect, test } from 'bun:test'
import { parseSelector } from '../src/selector.ts'

const run = (selector: string, scopes: string[]) => parseSelector(selector).map((m) => m.matches(scopes))

test('identifiers match scope prefixes on dot boundaries only', () => {
  expect(run('meta.tag', ['text.html', 'meta.tag.start'])).toEqual([true])
  expect(run('meta.ta', ['meta.tag'])).toEqual([false])
})

test('descendant selectors keep their order', () => {
  expect(run('text meta', ['text.html', 'meta.tag'])).toEqual([true])
  expect(run('meta text', ['text.html', 'meta.tag'])).toEqual([false])
})

test('negation, groups and alternatives', () => {
  expect(run('source -comment', ['source.js', 'comment.line'])).toEqual([false])
  expect(run('source -comment', ['source.js', 'string'])).toEqual([true])
  expect(run('source - (comment | string)', ['source.js', 'string.quoted'])).toEqual([false])
  expect(run('a, b', ['b'])).toEqual([false, true])
})

test('L: and R: set the priority of each comma separated selector', () => {
  expect(parseSelector('L:a, b, R:c').map((m) => m.priority)).toEqual([-1, 0, 1])
})
