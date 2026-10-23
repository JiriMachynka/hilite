import data from '@iconify-json/vscode-icons/icons.json' with { type: 'json' }

interface IconSet {
  icons: Record<string, { body: string }>
}
const set: IconSet = data

const PREFIX = 'file-type-'
const available = new Set(
  Object.keys(set.icons)
    .filter((key) => key.startsWith(PREFIX))
    .map((key) => key.slice(PREFIX.length)),
)

// Languages whose name differs from the icon's, or that share one. Everything else is matched by name or alias.
const overrides: Record<string, string> = {
  javascript: 'js',
  'objective-c': 'objectivec',
  'objective-cpp': 'objectivecpp',
  'cpp-macro': 'cpp',
  dart: 'dartlang',
  'emacs-lisp': 'emacs',
  'fortran-fixed-form': 'fortran',
  'fortran-free-form': 'fortran',
  'git-commit': 'git',
  'git-rebase': 'git',
  'glimmer-js': 'glimmer',
  'glimmer-ts': 'glimmer',
  'html-derivative': 'html',
  'jinja-html': 'jinja',
  jsonc: 'json',
  jsonl: 'json',
  jsx: 'reactjs',
  tsx: 'reactts',
  latex: 'tex',
  bibtex: 'tex',
  'markdown-nix': 'markdown',
  'markdown-vue': 'markdown',
  'nextflow-groovy': 'nextflow',
  nsis: 'nsi',
  shellsession: 'shell',
  'system-verilog': 'systemverilog',
  hcl: 'terraform',
  'es-tag-css': 'css',
  'es-tag-glsl': 'glsl',
  'es-tag-html': 'html',
  'es-tag-sql': 'sql',
  'es-tag-xml': 'xml',
  'vue-directives': 'vue',
  'vue-html': 'vue',
  'vue-interpolations': 'vue',
  'vue-sfc-style-variable-injection': 'vue',
  'vue-vine': 'vue',
  'angular-expression': 'angular',
  'angular-html': 'angular',
  'angular-inline-style': 'angular',
  'angular-inline-template': 'angular',
  'angular-let-declaration': 'angular',
  'angular-template': 'angular',
  'angular-template-blocks': 'angular',
  'angular-ts': 'angular',
}
for (const [language, icon] of Object.entries(overrides)) {
  if (!available.has(icon)) throw new Error(`no icon "${icon}" for ${language}`)
}

const svg = (body: string, extra = '') =>
  `<svg class="lang-icon${extra}" viewBox="0 0 32 32" width="16" height="16" aria-hidden="true" focusable="false">${body}</svg>`

// Languages with no icon of their own get a pair of braces, drawn in the current text color.
const generic = svg(
  '<path d="M12 6c-3 0-4 1-4 4v3c0 2-1 3-3 3 2 0 3 1 3 3v3c0 3 1 4 4 4M20 6c3 0 4 1 4 4v3c0 2 1 3 3 3-2 0-3 1-3 3v3c0 3-1 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  ' generic',
)

/** Inline SVG for any vscode-icons file type, such as `npm` or `bun`. */
export const fileIcon = (name: string) => {
  const icon = set.icons[`${PREFIX}${name}`]
  if (!icon) throw new Error(`no icon "${name}"`)
  return svg(icon.body)
}

/** Inline SVG for a language, found by its id or one of its aliases. */
export const iconFor = (id: string, aliases: string[] = []) => {
  const key = overrides[id] ?? [id, ...aliases].find((name) => available.has(name))
  return key ? svg(set.icons[`${PREFIX}${key}`]!.body) : generic
}
