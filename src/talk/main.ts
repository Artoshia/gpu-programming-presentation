import './talk.css'
import { mountSnippets } from './snippets'
import { drawWorkgroups } from './workgroups'

const slides = [...document.querySelectorAll<HTMLElement>('.slide')]
const bar = document.getElementById('bar') as HTMLElement
const counter = document.getElementById('counter') as HTMLElement
const title = document.getElementById('slide-title') as HTMLElement
const previous = document.getElementById('prev') as HTMLButtonElement
const next = document.getElementById('next') as HTMLButtonElement

const clamp = (n: number): number => Math.min(Math.max(n, 0), slides.length - 1)

/** The slide index in the URL hash, so a link can point at one slide. */
const readHash = (): number => clamp((Number.parseInt(location.hash.slice(1), 10) || 1) - 1)

let current = -1

const show = (index: number): void => {
  const target = clamp(index)
  if (target === current) return
  current = target

  slides.forEach((slide, i) => slide.classList.toggle('active', i === target))
  slides[target]?.scrollTo(0, 0)

  bar.style.width = `${((target + 1) / slides.length) * 100}%`
  counter.textContent = `${target + 1} / ${slides.length}`
  title.textContent = slides[target]?.dataset.title ?? ''
  previous.disabled = target === 0
  next.disabled = target === slides.length - 1

  const hash = `#${target + 1}`
  if (location.hash !== hash) history.replaceState(null, '', hash)
}

const keys: Record<string, number> = {
  ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1,
  ArrowLeft: -1, ArrowUp: -1, PageUp: -1, Backspace: -1,
}

addEventListener('keydown', (event) => {
  if (event.key === 'Home') return show(0)
  if (event.key === 'End') return show(slides.length - 1)

  const step = keys[event.key]
  if (step === undefined) return
  event.preventDefault()
  show(current + step)
})

previous.addEventListener('click', () => show(current - 1))
next.addEventListener('click', () => show(current + 1))
addEventListener('hashchange', () => show(readHash()))

void mountSnippets(document)
drawWorkgroups(document.querySelector<SVGSVGElement>('#workgroups')!)
show(readHash())
