const files = import.meta.glob<string>('../../../bench/corpus/{samples,extra}/*.sample', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const byName = new Map(
  Object.entries(files).map(([path, text]) => [path.split('/').pop()!.replace('.sample', ''), text]),
)

/** The opening lines of a language's benchmark sample. */
export const sampleOf = (lang: string) => {
  const text = byName.get(lang)
  if (!text) throw new Error(`no sample for ${lang} in apps/bench/corpus`)
  return text.split('\n').slice(0, 16).join('\n').trimEnd()
}
