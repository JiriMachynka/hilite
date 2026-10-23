import { fileURLToPath } from 'node:url'
import type { ElementContent, Root as Hast } from 'hast'
import type { Root as Mdast, RootContent } from 'mdast'
// Adds the MDX node types (JSX elements, ESM) to mdast.
import type {} from 'mdast-util-mdx'
import { visit } from 'unist-util-visit'
import { slug } from './html.ts'

const text = (node: ElementContent): string =>
  node.type === 'text' ? node.value : node.type === 'element' ? node.children.map(text).join('') : ''

/** Heading ids from the same slug the old generator used, so existing `#hilite-compiler` links keep working. */
export const rehypeSlugs = () => (tree: Hast) => {
  visit(tree, 'element', (node) => {
    if (node.tagName === 'h2' || node.tagName === 'h3') node.properties.id = slug(node.children.map(text).join(''))
  })
}

/** `#` anchors on h2 and the `list` class on Markdown lists. Runs after heading collection so the `#` stays out of the outline. */
export const rehypeDocMarkup = () => (tree: Hast) => {
  visit(tree, 'element', (node) => {
    if (node.tagName === 'ul') node.properties.className = ['list']
    if (node.tagName === 'h2') {
      const id = String(node.properties.id)
      node.children.push({
        type: 'element',
        tagName: 'a',
        properties: { className: ['anchor'], href: `#${id}`, ariaLabel: 'Link to this section' },
        children: [{ type: 'text', value: '#' }],
      })
    }
  })
}

const component = fileURLToPath(new URL('../components/Code.astro', import.meta.url))

/**
 * Fenced code becomes `<Code>`, which highlights it with Hilite: ```typescript title="highlight.ts"
 * Highlighting happens when the page renders, because grammars load lazily and markdown plugins run outside the page build.
 */
export const remarkCode = () => (tree: Mdast) => {
  let found = false
  visit(tree, 'code', (node, index, parent) => {
    if (!parent || index === undefined) return
    if (!node.lang) throw new Error(`code block without a language: ${node.value.slice(0, 40)}`)
    const title = node.meta?.match(/title="([^"]+)"/)?.[1]
    const attributes = [
      { type: 'mdxJsxAttribute' as const, name: 'lang', value: node.lang },
      { type: 'mdxJsxAttribute' as const, name: 'code', value: node.value },
      ...(title ? [{ type: 'mdxJsxAttribute' as const, name: 'title', value: title }] : []),
    ]
    const replacement: RootContent = { type: 'mdxJsxFlowElement', name: 'HiliteCode', attributes, children: [] }
    parent.children[index] = replacement
    found = true
  })
  if (!found) return
  tree.children.unshift({
    type: 'mdxjsEsm',
    value: `import HiliteCode from ${JSON.stringify(component)}`,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ImportDeclaration',
            specifiers: [{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: 'HiliteCode' } }],
            source: { type: 'Literal', value: component },
            attributes: [],
          },
        ],
      },
    },
  })
}
