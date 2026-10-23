export const kb = (n: number) => (n / 1024).toFixed(1)
export const int = (n: number) => n.toLocaleString('en-US')
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const ms = (n: number) => `${n.toFixed(0)} ms`

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Definition list; backticks in a description become `<code>`. */
// A call shows its name bright and its arguments muted; a list of names gets one line per name.
const term = (text: string) => {
  const call = /^([\w.]+)(\(.*\))$/.exec(text)
  if (call) {
    const [, name = '', args = ''] = call
    const object = /^\((.*?)\{ (.*) \}\)$/.exec(args)
    // A long object argument gets one field per line, the way Prettier would print it.
    if (object && text.length > 26) {
      const fields = (object[2] ?? '').split(', ').map((field) => `\n  ${esc(field)}`)
      return `<span class="sig-name">${esc(name)}</span><span class="sig-args fields">(${esc(object[1] ?? '')}{${fields.join(',')}\n})</span>`
    }
    return `<span class="sig-name">${esc(name)}</span><span class="sig-args">${esc(args)}</span>`
  }
  return text
    .split(', ')
    .map((name) => `<span class="sig-name">${esc(name)}</span>`)
    .join('')
}

export const dl = (rows: [string, string][]) =>
  `<dl>${rows.map(([t, d]) => `<dt>${term(t)}</dt><dd>${esc(d).replace(/`([^`]+)`/g, '<code>$1</code>')}</dd>`).join('')}</dl>`

/** Cells are HTML and are not escaped. */
export const table = (head: string[], rows: string[][]) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
