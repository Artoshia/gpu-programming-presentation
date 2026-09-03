import { SQUARE_COUNT, WORKGROUP_SIZE } from '../compute/square'

const SVG_NS = 'http://www.w3.org/2000/svg'

const GROUP_WIDTH = 330
const GROUP_GAP = 18
const CELL_GAP = 4
const TOP = 30
const HEIGHT = 30

/**
 * Draws the thread grid on the compute slide from the constants the demo itself
 * uses, so the picture and the caption cannot disagree with the running code.
 */
export const drawWorkgroups = (svg: SVGSVGElement): void => {
  const groups = Math.ceil(SQUARE_COUNT / WORKGROUP_SIZE)
  const cellWidth = (GROUP_WIDTH - CELL_GAP * (WORKGROUP_SIZE - 1)) / WORKGROUP_SIZE

  const cells = document.createElementNS(SVG_NS, 'g')
  for (let thread = 0; thread < groups * WORKGROUP_SIZE; thread += 1) {
    const group = Math.floor(thread / WORKGROUP_SIZE)
    const slot = thread % WORKGROUP_SIZE
    const idle = thread >= SQUARE_COUNT

    const cell = document.createElementNS(SVG_NS, 'rect')
    cell.setAttribute('x', String(group * (GROUP_WIDTH + GROUP_GAP) + slot * (cellWidth + CELL_GAP)))
    cell.setAttribute('y', String(TOP))
    cell.setAttribute('width', String(cellWidth))
    cell.setAttribute('height', String(HEIGHT))
    cell.setAttribute('rx', '4')
    cell.setAttribute('fill', idle ? '#1a1d25' : '#22406e')
    cell.setAttribute('stroke', idle ? '#2a2f3b' : '#3f6bb0')
    cells.append(cell)
  }

  const labels = document.createElementNS(SVG_NS, 'g')
  for (let group = 0; group < groups; group += 1) {
    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('x', String(group * (GROUP_WIDTH + GROUP_GAP)))
    label.setAttribute('y', String(TOP - 10))
    label.setAttribute('class', 'label')
    label.textContent = `workgroup ${group}`
    labels.append(label)
  }

  const caption = document.createElementNS(SVG_NS, 'text')
  caption.setAttribute('x', '0')
  caption.setAttribute('y', String(TOP + HEIGHT + 24))
  const idle = groups * WORKGROUP_SIZE - SQUARE_COUNT
  caption.textContent =
    `${SQUARE_COUNT} elements, ${WORKGROUP_SIZE} threads per group, ` +
    `${groups} groups dispatched, the last ${idle} threads exit immediately`

  svg.setAttribute('viewBox', `0 0 ${groups * GROUP_WIDTH + (groups - 1) * GROUP_GAP} ${TOP + HEIGHT + 34}`)
  svg.replaceChildren(labels, cells, caption)
}
