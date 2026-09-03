import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const THEME = 'github-dark-default'

/** File extension to Shiki language id. Anything else is rendered as plain text. */
const LANGUAGES: Record<string, string> = { ts: 'typescript', wgsl: 'wgsl' }

export const languageOf = (path: string): string =>
  LANGUAGES[path.split('.').pop() ?? ''] ?? 'text'

/**
 * Both grammars tokenize under the JavaScript regex engine, so the pages avoid
 * shipping the Oniguruma WebAssembly build.
 */
const highlighter = createHighlighterCore({
  themes: [import('@shikijs/themes/github-dark-default')],
  langs: [import('@shikijs/langs/typescript'), import('@shikijs/langs/wgsl')],
  engine: createJavaScriptRegexEngine(),
})

/** Coloured markup for one snippet. The page supplies its own background. */
export const highlight = async (code: string, language: string): Promise<string> => {
  const shiki: HighlighterCore = await highlighter
  return shiki.codeToHtml(code, { lang: language, theme: THEME, structure: 'inline' })
}

/**
 * Puts code in an element, plain first so it is readable straight away, then
 * coloured once the grammar for its language has loaded.
 */
export const showCode = async (
  element: HTMLElement,
  code: string,
  language: string,
): Promise<void> => {
  element.textContent = code
  element.innerHTML = await highlight(code, language)
}
