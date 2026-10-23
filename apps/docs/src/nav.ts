import { build } from './lib/data.ts'

interface Page {
  title: string
  /** Sidebar label when it differs from the title. */
  label?: string
  description: string
  layout?: 'plain' | 'wide'
}

// Keyed by output path. Order is the search index order.
export const pages: Record<string, Page> = {
  'guide/index.html': {
    title: 'Introduction',
    description: `Hilite is a syntax highlighter that produces Shiki's HTML on the JavaScript regex engine, with ${build.languages.length} languages compiled ahead of time.`,
  },
  'guide/concepts.html': {
    title: 'Concepts',
    description: 'Grammars, scopes, themes and tokens: what each one is, and how code becomes colored markup.',
  },
  'guide/install.html': {
    title: 'Installation',
    description: 'Install Hilite and highlight code with one import. Languages and themes are included.',
  },
  'guide/usage.html': {
    title: 'Usage',
    description: 'codeToHtml, createHighlighter, typed names, codeToTokens, codeToAnsi and class mode.',
  },
  'guide/dual-themes.html': {
    title: 'Dual themes',
    description: 'Render light and dark themes in one pass with CSS variables.',
  },
  'guide/transformers.html': {
    title: 'Transformers',
    description:
      'Mark diff, highlighted and focused lines with comments like [!code ++], or with line numbers. Output matches Shiki transformers.',
  },
  'guide/bundles.html': {
    title: 'Bundling languages',
    label: 'Bundling',
    description:
      'Ship only the languages a page needs. Each language is an ES module, so bundlers split it into its own chunk.',
  },
  'guide/performance.html': {
    title: 'Performance',
    description: 'Let the shared highlighter warm up, tokenize once for several themes, and ship fewer languages.',
  },
  'guide/migrate.html': {
    title: 'Migrate from Shiki',
    description: 'What changes when you move from Shiki to Hilite, and what does not exist yet.',
  },
  'guide/compat.html': {
    title: 'Compatibility',
    description: 'How closely Hilite matches Shiki, how it was checked, and the known differences.',
  },
  'api/hilite.html': {
    title: 'Hilite',
    description: 'The package: codeToHtml, createHighlighter, the transformers and the bundled names.',
  },
  'api/packages.html': {
    title: 'Internal packages',
    description: 'The four packages Hilite is built from: highlight, core, render and compiler.',
  },
  'languages.html': {
    title: 'Languages',
    description: `${build.languages.length} languages with the brotli size of each.`,
  },
  'themes.html': {
    title: 'Themes',
    description: `${build.themes.length} bundled themes.`,
  },
  'comparison.html': {
    title: 'Comparison',
    layout: 'wide',
    description:
      'Hilite next to Shiki, starry-night, highlight.js and Prism: engine, size, speed, themes and features.',
  },
  'benchmarks.html': {
    title: 'Benchmarks',
    description: 'Hilite measured against Shiki: bundle size, speed and output equality.',
  },
  'how-it-works.html': {
    title: 'Internals',
    label: 'How it works',
    description: 'What happens between a TextMate grammar and a token: resolve, convert, intern, encode, scan, walk.',
  },
  'playground.html': {
    title: 'Playground',
    layout: 'plain',
    description: 'Paste code and watch Hilite highlight it in the browser.',
  },
}

// Sidebar groups, in reading order. Home and the playground sit outside it.
export const groups: { title: string; paths: string[] }[] = [
  {
    title: 'Guide',
    paths: [
      'guide/index.html',
      'guide/install.html',
      'guide/concepts.html',
      'guide/usage.html',
      'guide/dual-themes.html',
      'guide/transformers.html',
      'guide/bundles.html',
      'guide/performance.html',
      'guide/migrate.html',
    ],
  },
  {
    title: 'Reference',
    paths: [
      'api/hilite.html',
      'api/packages.html',
      'languages.html',
      'themes.html',
      'comparison.html',
      'benchmarks.html',
      'guide/compat.html',
      'how-it-works.html',
    ],
  },
]
export const reading = groups.flatMap((g) => g.paths)

export const topNav: [string, string][] = [
  ['Guide', 'guide/index.html'],
  ['Reference', 'api/hilite.html'],
  ['Benchmarks', 'benchmarks.html'],
  ['Playground', 'playground.html'],
]

export const sectionOf = (path: string) =>
  path === 'playground.html'
    ? 'Playground'
    : path === 'benchmarks.html'
      ? 'Benchmarks'
      : path.startsWith('guide/') && path !== 'guide/compat.html'
        ? 'Guide'
        : path === 'index.html'
          ? ''
          : 'Reference'

/** `/guide/usage`, `/guide/usage.html` or `/guide` to the key used in `pages`. */
export const pathOf = (pathname: string) => {
  const clean = pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '')
  if (clean === '' || clean === 'index') return 'index.html'
  return `${clean}.html` in pages ? `${clean}.html` : `${clean.replace(/\/index$/, '')}/index.html`
}
