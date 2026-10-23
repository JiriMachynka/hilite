export interface EdgeCase {
  lang: string
  label: string
  code: string
}

const fence = '```'

/** Hand-written snippets for the places tokenizers usually break. */
export const edgeCases: EdgeCase[] = [
  { lang: 'markdown', label: 'fenced-multi', code: `# T\n\n${fence}ts\nconst a: number = 1\n${fence}\n\n${fence}css\n.a{color:red}\n${fence}\n\n${fence}html\n<div class="x">hi</div>\n${fence}\n\n${fence}python\ndef f(): return 1\n${fence}\n\n- item\n  - nested **bold** and \`code\`\n> quote\n` },
  { lang: 'markdown', label: 'fence-unterminated', code: `text\n\n${fence}ts\nconst a = \`unterminated` },
  { lang: 'markdown', label: 'lists-quotes', code: `1. one\n2. two\n   - sub\n\n> a\n> > b\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[link](http://x.y "t") ![img](a.png)\n` },
  { lang: 'html', label: 'embedded', code: `<!doctype html>\n<style>a{color:red}</style>\n<script type="module">import x from 'y'; const a = \`\${x}\`</script>\n<div onclick="go('a')" style="color:red">t</div>\n<script>/* unterminated\n` },
  { lang: 'html', label: 'unterminated-tag', code: `<div class="a\n<span>` },
  { lang: 'vue', label: 'sfc', code: `<script setup lang="ts">\nimport { ref } from 'vue'\nconst n = ref<number>(0)\n</script>\n\n<template>\n  <button :class="{ a: n > 1 }" @click="n++">{{ n * 2 }}</button>\n</template>\n\n<style scoped lang="scss">\n.a { .b { color: v-bind(color) } }\n</style>\n` },
  { lang: 'svelte', label: 'blocks', code: `<script lang="ts">\n  let n = 0\n</script>\n{#if n > 1}<p>{n}</p>{:else}<p>no</p>{/if}\n{#each [1,2] as x}<i>{x}</i>{/each}\n<style>p{color:red}</style>\n` },
  { lang: 'php', label: 'in-html', code: `<html><body>\n<?php foreach ($items as $i): ?>\n  <p><?= htmlspecialchars($i['name']) ?></p>\n<?php endforeach; ?>\n<?php\n$x = <<<EOT\nheredoc $x\nEOT;\n` },
  { lang: 'tsx', label: 'jsx', code: `export const A = ({ x }: { x: number }) => (\n  <div className="a" onClick={() => go(\`\${x}\`)}>\n    {x > 1 ? <b>big</b> : 'small'}\n    <>{...[1]}</>\n  </div>\n)\n` },
  { lang: 'typescript', label: 'unterminated-string', code: `const a = 'abc\nconst b = "def\nconst c = \`tpl \${a\n` },
  { lang: 'typescript', label: 'unterminated-comment', code: `/* never closed\nconst x = 1\n` },
  { lang: 'typescript', label: 'regex-and-generics', code: `const r = /a[/]b\\/(?<n>x)/giu\nfunction f<T extends Record<string, unknown>>(x: T): x is T { return a < b > c }\ntype A = { [K in keyof T]?: T[K] }\n` },
  { lang: 'javascript', label: 'es-tags', code: 'const a = css`\n  a { color: red }\n`\nconst b = html`<p>${x}</p>`\nconst c = sql`select 1`\n' },
  { lang: 'shellscript', label: 'heredoc', code: `cat <<EOF > out.txt\nhello $USER\nEOF\ncat <<'RAW'\nno $expansion\nRAW\necho "unterminated\n` },
  { lang: 'ruby', label: 'heredoc', code: `x = <<~EOS\n  text #{1 + 1}\n  more\nEOS\nputs x\ny = <<-'RAW'\n  raw\n  RAW\n` },
  { lang: 'python', label: 'strings', code: `s = f"{a!r:>{w}} {{x}}"\nb = b'\\x00'\nd = """doc\nline"""\nu = 'unterminated\n` },
  { lang: 'rust', label: 'raw-lifetimes', code: `let s = r#"raw "quoted""#;\nfn f<'a>(x: &'a str) -> &'a str { x }\nlet c = '\\u{1F600}';\n/* nested /* block */ comment */\n` },
  { lang: 'c', label: 'preproc', code: `#include <stdio.h>\n#define M(a) \\\n  ((a) + 1)\n#if 0\nint dead;\n#endif\nint main(void){return 0;}\n` },
  { lang: 'css', label: 'unterminated', code: `a { color: red; background: url(data:image/png;base64,AAA\n/* open\n` },
  { lang: 'json', label: 'broken', code: `{"a": [1, 2, {"b": tru\n"c": 'x'}` },
  { lang: 'yaml', label: 'multi-doc', code: `---\na: &x [1, 2]\nb: *x\nc: |\n  block\n  text\nd: >-\n  folded\n---\n- {k: v}\n` },
  { lang: 'sql', label: 'mixed', code: `select a, count(*) from t where b like '%x%' -- c\n/* open` },
  { lang: 'latex', label: 'envs', code: `\\documentclass{article}\n\\begin{document}\n$x^2 + \\frac{a}{b}$\n\\begin{equation}\n  E = mc^2\n\\end{equation}\n% comment\n\\end{document}\n` },
  { lang: 'go', label: 'raw-string', code: 'var s = `raw\nstring`\nfunc main() { fmt.Println("hi") }\nvar t = `open\n' },
  { lang: 'typescript', label: 'long-line', code: `const a = [${Array.from({ length: 800 }, (_, i) => `'s${i}'`).join(', ')}]\n` },
  { lang: 'typescript', label: 'unicode', code: `const 变量 = '😀 héllo'; // 注释 ☃\nconst t = "tab\there\\u{1F600}"\n\uFFFF\n` },
  { lang: 'typescript', label: 'only-newlines', code: `\n\n\n` },
  { lang: 'typescript', label: 'whitespace', code: `   \n\t\t\n  const a = 1   \n` },
  { lang: 'python', label: 'no-trailing-newline', code: `x = 1\nif x:\n    pass` },
]
