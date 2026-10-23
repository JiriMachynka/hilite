import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { build, sizes } from '../lib/data.ts'
import { highlight } from '../lib/highlight.ts'
import { kb } from '../lib/html.ts'
import iconSvg from '../../public/icon.svg?raw'

// The share card, drawn from the same numbers and highlighter as the site so it can never go stale.
const require = createRequire(import.meta.url)
const font = (file: string) => readFileSync(require.resolve(`@fontsource/${file}`))
const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`

// Site tokens from styles.css, as hex because satori does not read hsl().
const paper = '#181b25'
const ink = '#edf0f3'
const muted = '#a9b1bc'
const mark = '#f5683d'

interface Node {
  type: string
  props: {
    style?: Record<string, string | number>
    src?: string
    width?: number
    height?: number
    children?: Node[] | string
  }
}
const el = (type: string, style: Record<string, string | number>, children?: Node[] | string): Node => ({
  type,
  props: { style, children },
})

const sample = `const parse = (text: string) => {
  const n = Number(text)
  return Number.isNaN(n) ? null : n
}`
const html = await highlight('typescript', sample)
const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
const codeBg = html.match(/background-color:(#[0-9a-fA-F]+)/)?.[1] ?? '#24292e'
const lines = html
  .split('<span class="line">')
  .slice(1)
  .map((line) =>
    [...line.matchAll(/<span style="color:(#[0-9a-fA-F]+)[^"]*">([^<]*)<\/span>/g)].map(([, color, text]) =>
      el('span', { color: color ?? ink, whiteSpace: 'pre' }, unescape(text ?? '')),
    ),
  )

const card = el(
  'div',
  {
    width: 1200,
    height: 630,
    display: 'flex',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: paper,
    backgroundImage: 'radial-gradient(900px 520px at 8% -10%, rgba(40, 59, 113, 0.75), rgba(24, 27, 37, 0) 70%)',
    color: ink,
    fontFamily: 'Figtree',
  },
  [
    // The hero's dome: a vermilion disc with the night sky laid over it, slightly offset.
    // Its glow is a gradient on a larger circle: resvg panics on a box-shadow blur this big.
    // Satori paints absolute elements over the flow, so the text column below sets position: relative to stay on top.
    el('div', {
      position: 'absolute',
      width: 1200,
      height: 1200,
      right: -410,
      top: 220,
      borderRadius: '50%',
      backgroundImage: 'radial-gradient(circle, rgba(245, 104, 61, 0.12) 81%, rgba(245, 104, 61, 0) 100%)',
    }),
    el('div', {
      position: 'absolute',
      width: 980,
      height: 980,
      right: -300,
      top: 330,
      borderRadius: '50%',
      backgroundColor: mark,
    }),
    el('div', {
      position: 'absolute',
      width: 980,
      height: 980,
      right: -282,
      top: 352,
      borderRadius: '50%',
      backgroundImage: 'radial-gradient(circle at 70% 18%, #2b3550, #1c2230 64%)',
    }),
    el(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        padding: '64px 72px',
        width: 640,
      },
      [
        el('div', { display: 'flex', alignItems: 'center', gap: 16 }, [
          { type: 'img', props: { src: icon, width: 48, height: 48 } },
          el('div', { display: 'flex', fontFamily: 'Bricolage Grotesque', fontWeight: 700, fontSize: 40 }, [
            el('span', {}, 'Hilite'),
            el('span', { color: mark }, '.'),
          ]),
        ]),
        el(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Bricolage Grotesque',
            fontWeight: 800,
            fontSize: 80,
            lineHeight: 0.98,
            letterSpacing: -2,
          },
          [
            el('span', {}, "VS Code's grammars"),
            el('div', { display: 'flex' }, [
              el('span', { marginRight: 20 }, 'on a'),
              el('div', { display: 'flex', position: 'relative' }, [
                el('div', { position: 'absolute', left: -4, right: -4, bottom: 8, height: 24, backgroundColor: mark }),
                el('span', { position: 'relative' }, `${kb(sizes.core.brotli)} KB`),
              ]),
            ]),
            el('div', { display: 'flex' }, [el('span', {}, 'tokenizer.')]),
          ],
        ),
        el(
          'div',
          { display: 'flex', fontFamily: 'JetBrains Mono', fontSize: 22, color: muted },
          `${build.languages.length} languages · ${build.themes.length} themes · no WebAssembly`,
        ),
      ],
    ),
    el(
      'div',
      {
        position: 'absolute',
        right: 64,
        top: 196,
        width: 466,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: '28px 30px',
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.13)',
        backgroundColor: codeBg,
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.45)',
        fontFamily: 'JetBrains Mono',
        fontSize: 18,
        lineHeight: 1.7,
      },
      lines.map((spans) => el('div', { display: 'flex', minHeight: 31 }, spans)),
    ),
  ],
)

export const GET = async () => {
  const svg = await satori(card, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Bricolage Grotesque',
        data: font('bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff'),
        weight: 800,
      },
      {
        name: 'Bricolage Grotesque',
        data: font('bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff'),
        weight: 700,
      },
      { name: 'Figtree', data: font('figtree/files/figtree-latin-500-normal.woff'), weight: 500 },
      { name: 'JetBrains Mono', data: font('jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'), weight: 400 },
    ],
  })
  return new Response(new Uint8Array(new Resvg(svg).render().asPng()), { headers: { 'Content-Type': 'image/png' } })
}
