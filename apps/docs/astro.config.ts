import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import { rehypeHeadingIds, unified } from '@astrojs/markdown-remark'
import { defineConfig } from 'astro/config'
import { rehypeDocMarkup, rehypeSlugs, remarkCode } from './src/lib/markdown.ts'
import { pathOf } from './src/nav.ts'

// Absolute URLs for canonical links, share cards and the sitemap.
const site = process.env.SITE_URL ?? 'https://hilite.dev'

export default defineConfig({
  site,
  // `guide/index.mdx` builds `guide/index.html` and `usage.mdx` builds `usage.html`, the URLs the site always had.
  build: { format: 'preserve' },
  trailingSlash: 'never',
  integrations: [
    mdx(),
    // List the same .html URLs the pages link to and declare as canonical.
    sitemap({
      serialize: (item) => {
        const path = pathOf(new URL(item.url).pathname)
        return { ...item, url: new URL(path === 'index.html' ? '' : path, site).href }
      },
    }),
    {
      name: 'index-html-in-dev',
      hooks: {
        // The dev server answers `guide/index.mdx` at `/guide` only; the links and the build use `/guide/index.html`.
        'astro:server:setup': ({ server }) => {
          server.middlewares.use((req, _res, next) => {
            if (req.url) req.url = req.url.replace(/(.)\/index\.html(?=$|\?)/, '$1')
            next()
          })
        },
      },
    },
  ],
  // Keep the shared site script a cached file instead of inlining it into every page.
  vite: { build: { assetsInlineLimit: 0 } },
  markdown: {
    syntaxHighlight: false,
    processor: unified({
      smartypants: false,
      remarkPlugins: [remarkCode],
      rehypePlugins: [rehypeSlugs, rehypeHeadingIds, rehypeDocMarkup],
    }),
  },
})
