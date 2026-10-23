import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { edgeCases } from '../../corpus/edge.ts'

const root = join(import.meta.dir, '../../corpus')

export interface Snippet {
  label: string
  code: string
}

export const corpusLangs = () =>
  [...new Set(['samples', 'extra'].flatMap((d) => readdirSync(join(root, d)).map((f) => f.slice(0, -7))))].sort()

const sampleOf = async (lang: string) => {
  for (const dir of ['samples', 'extra']) {
    const file = Bun.file(join(root, dir, `${lang}.sample`))
    if (await file.exists()) return file.text()
  }
  return null
}

/** The full sample plus variants that cut it mid-construct, change line endings, and an empty input. */
export const snippetsFor = async (lang: string): Promise<Snippet[]> => {
  const out: Snippet[] = [{ label: 'empty', code: '' }]
  const full = await sampleOf(lang)
  if (full !== null) {
    const lines = full.split('\n')
    out.push(
      { label: 'full', code: full },
      { label: 'half', code: lines.slice(0, Math.max(1, lines.length >> 1)).join('\n') },
      { label: 'cut', code: full.slice(0, Math.floor(full.length * 0.37)) },
      { label: 'crlf', code: full.replace(/\n/g, '\r\n') },
    )
  }
  for (const edge of edgeCases) if (edge.lang === lang) out.push({ label: `edge:${edge.label}`, code: edge.code })
  return out
}
