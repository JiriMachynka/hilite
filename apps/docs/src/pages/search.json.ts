import type { MarkdownHeading } from 'astro'
import { pages, sectionOf } from '../nav.ts'

const mdx = import.meta.glob<{ getHeadings: () => MarkdownHeading[] }>('./**/*.mdx', { eager: true })
const headingsOf = (path: string) => mdx[`./${path.replace(/\.html$/, '.mdx')}`]?.getHeadings() ?? []

// Every docs page and each of its sections, for the search dialog in site.ts.
export const GET = () =>
  Response.json(
    Object.entries(pages)
      .filter(([, page]) => page.layout !== 'plain')
      .flatMap(([path, page]) => [
        { title: page.title, path, group: sectionOf(path), text: page.description },
        ...headingsOf(path)
          .filter((h) => h.depth === 2)
          .map((h) => ({ title: h.text, path: `${path}#${h.slug}`, group: page.title, text: '' })),
      ]),
  )
