// Short programs for the editors on the landing page and the playground.
export const samples: Record<string, string> = {
  typescript:
    'type Ok<T> = { ok: true; value: T }\nexport const parse = (text: string): Ok<number> | { ok: false } => {\n  const n = Number(text)\n  return Number.isNaN(n) ? { ok: false } : { ok: true, value: n }\n}\n',
  javascript: 'const sum = (...xs) => xs.reduce((a, b) => a + b, 0)\nconsole.log(`total: ${sum(1, 2, 3)}`) // 6\n',
  python:
    'def fib(n: int) -> int:\n    """Naive on purpose."""\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint([fib(i) for i in range(10)])\n',
  rust: 'fn main() {\n    let words = ["tiny", "fast", "exact"];\n    for (i, w) in words.iter().enumerate() {\n        println!("{i}: {w}");\n    }\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tch := make(chan int, 2)\n\tch <- 1\n\tfmt.Println(<-ch)\n}\n',
  css: ':root { --accent: oklch(62% 0.2 35) }\n.card:hover > a { color: var(--accent); }\n@media (width < 600px) { .card { display: block } }\n',
  json: '{\n  "name": "hilite",\n  "languages": 260,\n  "wasm": false\n}\n',
  yaml: 'name: build\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: bun test\n',
  sql: 'select lang, count(*) as n\nfrom tokens\nwhere matched = true -- exact\ngroup by lang\norder by n desc;\n',
  html: '<!doctype html>\n<style>a { color: tomato }</style>\n<a href="#top" onclick="go()">top</a>\n<script>const go = () => scrollTo(0, 0)</script>\n',
}
