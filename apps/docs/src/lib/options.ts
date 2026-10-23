/** `codeToHtml` options, shown on Usage and on the API page. */
export const optionRows: [string, string][] = [
  ['theme', 'One theme name. Colors are written inline.'],
  ['themes', 'An object of names, such as `{ light, dark }`. Colors become CSS variables.'],
  [
    'defaultColor',
    'Which key of `themes` is written inline. `false` writes none, `"light-dark()"` uses the CSS function.',
  ],
  ['cssVariablePrefix', 'Prefix of the variables. Default `--shiki-`.'],
  ['colorsRendering', '`"css-vars"` (default) or `"none"` to drop the variables.'],
  ['classMode', 'Classes and a stylesheet instead of inline styles. Single theme only.'],
  ['tabindex', 'The `pre` tabindex. `false` removes it.'],
  ['transformers', 'An array of transformers, run in order.'],
  [
    'tokenizeTimeLimit',
    'Milliseconds one line may take before the rest of it is left unstyled. Default `500`, `0` for no limit. Same default as Shiki.',
  ],
  [
    'tokenizeMaxLineLength',
    'Lines at least this long are not tokenized and come out unstyled. Default `20000`, `0` for no limit.',
  ],
]
