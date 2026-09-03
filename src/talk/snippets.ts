import { languageOf, showCode } from '../shared/highlight'

/**
 * Slide code samples are pulled out of the real source files at build time, so a
 * snippet can never drift away from the code it claims to show.
 */
const sources = import.meta.glob('/src/**/*.{ts,wgsl}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const DECLARATION = /\b(?:fn|const|let|var|function|struct|interface|class|type)\s+([A-Za-z_]\w*)/

/** Attributes and comments directly above a declaration belong to it. */
const isPreamble = (line: string): boolean => /^\s*(@|\/\/|\/\*|\*)/.test(line)

const countBraces = (line: string): number =>
  [...line].reduce((depth, ch) => depth + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0)

const dedent = (lines: string[]): string[] => {
  const indents = lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length)
  const shortest = Math.min(...indents, Infinity)
  return Number.isFinite(shortest) ? lines.map((l) => l.slice(shortest)) : lines
}

/** The whole declaration named `symbol`, from its attributes down to its closing brace. */
export const extract = (path: string, symbol: string): string => {
  const source = sources[path.startsWith('/') ? path : `/${path}`]
  if (source === undefined) throw new Error(`No such source file: ${path}`)

  const lines = source.replace(/\r/g, '').split('\n')
  const start = lines.findIndex((line) => DECLARATION.exec(line)?.[1] === symbol)
  if (start === -1) throw new Error(`No declaration of "${symbol}" in ${path}`)

  let first = start
  while (first > 0 && isPreamble(lines[first - 1] ?? '')) first -= 1

  let depth = 0
  let opened = false
  let last = start
  for (; last < lines.length; last += 1) {
    depth += countBraces(lines[last] ?? '')
    opened ||= depth > 0
    if (opened && depth === 0) break
    // A declaration with no body at all ends at the first blank line.
    if (!opened && !(lines[last] ?? '').trim() && last > start) break
  }

  return dedent(lines.slice(first, Math.min(last + 1, lines.length))).join('\n').trim()
}

/**
 * Fills every `<pre data-src data-symbol>` on the page with the code it names.
 * The plain text goes in first so the deck is readable before the highlighter
 * has finished loading, then each block is replaced with the coloured version.
 */
export const mountSnippets = async (root: ParentNode): Promise<void> => {
  const blocks = [...root.querySelectorAll<HTMLElement>('pre[data-src][data-symbol]')].map(
    (element) => {
      const { src = '', symbol = '' } = element.dataset
      const source = extract(src, symbol)

      const code = document.createElement('code')

      const caption = document.createElement('span')
      caption.className = 'cap'
      caption.textContent = `${src} - ${symbol}`

      element.replaceChildren(caption, code)
      return { code, source, language: languageOf(src) }
    },
  )

  await Promise.all(blocks.map(({ code, source, language }) => showCode(code, source, language)))
}
