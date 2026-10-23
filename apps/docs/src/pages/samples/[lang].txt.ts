import type { APIRoute } from 'astro'
import { build } from '../../lib/data.ts'
import { sampleOf } from '../../lib/samples.ts'

// Fetched when a language name is picked on the landing page.
export const getStaticPaths = () => build.languages.map((l) => ({ params: { lang: l.name } }))

export const GET: APIRoute = ({ params }) => new Response(sampleOf(params.lang!))
