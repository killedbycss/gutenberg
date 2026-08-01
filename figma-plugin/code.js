figma.showUI(__html__, { width: 440, height: 720, themeColors: true, title: 'Гутенберг' })
figma.clientStorage.getAsync('gutenberg.settings').then((settings) => figma.ui.postMessage({ type: 'settings', settings: settings || null }))

const DEFAULT_FONT = { family: 'Inter', style: 'Regular' }

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === 'resize') figma.ui.resize(clamp(message.width, 320, 760), clamp(message.height, 420, 960))
    if (message.type === 'create-layout') await createLayout(message.payload)
    if (message.type === 'create-bento') await createBento(message.payload)
    if (message.type === 'apply-typograph') await applyTypograph(message.payload)
    if (message.type === 'create-palette') await createPalette(message.payload)
    if (message.type === 'export-selection') await exportSelection(message.payload)
    if (message.type === 'selection') await sendSelection()
    if (message.type === 'save-settings') await figma.clientStorage.setAsync('gutenberg.settings', message.payload)
  } catch (error) {
    figma.notify(error?.message || 'Не удалось выполнить действие', { error: true })
    figma.ui.postMessage({ type: 'error', message: error?.message || String(error) })
  }
}

figma.on('selectionchange', sendSelection)

async function sendSelection() {
  const nodes = figma.currentPage.selection
  figma.ui.postMessage({ type: 'selection', nodes: nodes.slice(0, 20).map((node) => ({ id: node.id, name: node.name, type: node.type })) })
}

async function resolveFont(requested) {
  const fonts = await figma.listAvailableFontsAsync()
  const exact = requested && fonts.find((item) => item.fontName.family === requested.family && item.fontName.style === requested.style)
  const family = requested && fonts.find((item) => item.fontName.family === requested.family)
  const chosen = exact?.fontName || family?.fontName || DEFAULT_FONT
  await figma.loadFontAsync(chosen)
  return chosen
}

async function createLayout(payload) {
  const width = clamp(+payload.width || 1080, 160, 4096)
  const height = clamp(+payload.height || 1080, 160, 4096)
  const frame = figma.createFrame()
  frame.name = payload.name || 'Гутенберг · Макет'
  frame.resize(width, height)
  frame.clipsContent = true
  frame.fills = [solid(payload.colors?.[0] || '#FFFFFF')]
  frame.layoutMode = 'NONE'
  const font = await resolveFont(payload.font)
  const colors = payload.colors?.length ? payload.colors : ['#FFFFFF', '#111111', '#2F80ED', '#777777']
  const content = payload.content || {}
  const margin = Math.round(Math.min(width, height) * .075)
  const blocks = [
    { name: 'Заголовок', text: content.headline || 'Форма и содержание', size: Math.round(Math.min(width, height) * .105), y: margin, color: colors[1] },
    { name: 'Подзаголовок', text: content.subhead || 'Типографическая система', size: Math.round(Math.min(width, height) * .045), y: height * .46, color: colors[2] || colors[1] },
    { name: 'Текст', text: content.body || 'Ритм, масштаб и ясная иерархия.', size: Math.round(Math.min(width, height) * .026), y: height * .62, color: colors[1] },
    { name: 'Подпись', text: content.caption || 'Гутенберг · 2026', size: Math.round(Math.min(width, height) * .018), y: height - margin * 1.5, color: colors[3] || colors[1] },
  ]
  for (const block of blocks) frame.appendChild(await makeText(block, font, margin, width - margin * 2))
  figma.currentPage.appendChild(frame)
  placeNearViewport(frame)
  figma.currentPage.selection = [frame]
  figma.viewport.scrollAndZoomIntoView([frame])
  figma.notify('Макет создан редактируемыми слоями')
}

async function createBento(payload) {
  const width = clamp(+payload.width || 1440, 640, 4096)
  const height = Math.round(width * 9 / 16)
  const root = figma.createFrame()
  root.name = 'Гутенберг · Бенто'
  root.resize(width, height)
  root.clipsContent = true
  root.fills = []
  const font = await resolveFont(payload.font)
  const colors = payload.colors?.length ? payload.colors : ['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51']
  const copy = payload.items?.length ? payload.items : [
    'Форма и содержание', 'Новый взгляд', 'Больше воздуха', 'Смысл в ритме', 'Точка сборки'
  ]
  const cells = [
    { x: 0, y: 0, w: 3, h: 1 }, { x: 3, y: 0, w: 1, h: 2 },
    { x: 0, y: 1, w: 2, h: 2 }, { x: 2, y: 1, w: 1, h: 1 }, { x: 2, y: 2, w: 2, h: 1 },
  ]
  const cellW = width / 4; const cellH = height / 3
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]
    const tile = figma.createFrame()
    tile.name = `Блок ${String(index + 1).padStart(2, '0')}`
    tile.x = cell.x * cellW; tile.y = cell.y * cellH
    tile.resize(cell.w * cellW, cell.h * cellH)
    tile.clipsContent = true
    tile.fills = [solid(colors[index % colors.length])]
    const ink = contrastInk(colors[index % colors.length])
    const padding = Math.max(18, Math.round(Math.min(tile.width, tile.height) * .09))
    const text = await makeText({ name: 'Заголовок', text: copy[index % copy.length], size: Math.max(20, Math.round(Math.min(tile.width, tile.height) * .16)), y: padding, color: ink }, font, padding, tile.width - padding * 2)
    tile.appendChild(text)
    root.appendChild(tile)
  }
  figma.currentPage.appendChild(root)
  placeNearViewport(root)
  figma.currentPage.selection = [root]
  figma.viewport.scrollAndZoomIntoView([root])
  figma.notify('Бенто создано единой редактируемой сеткой')
}

async function makeText(block, font, x, width) {
  const node = figma.createText()
  node.name = block.name
  node.fontName = font
  node.characters = block.text
  node.fontSize = Math.max(8, block.size)
  node.lineHeight = { unit: 'PERCENT', value: block.name === 'Заголовок' ? 105 : 135 }
  node.fills = [solid(block.color)]
  node.textAutoResize = 'HEIGHT'
  node.resize(Math.max(20, width), Math.max(20, block.size * 1.4))
  node.x = x; node.y = block.y
  return node
}

async function applyTypograph(payload) {
  const nodes = figma.currentPage.selection.filter((node) => node.type === 'TEXT')
  if (!nodes.length) throw new Error('Выберите один или несколько текстовых слоёв')
  for (const node of nodes) {
    if (node.hasMissingFont) throw new Error(`Недоступен шрифт в слое «${node.name}»`)
    const fonts = node.getRangeAllFontNames(0, node.characters.length)
    await Promise.all(fonts.map((font) => figma.loadFontAsync(font)))
    node.characters = typograph(node.characters, payload)
  }
  figma.notify(`Типографика применена: ${nodes.length}`)
}

async function createPalette(payload) {
  const colors = payload.colors || []
  if (!colors.length) throw new Error('Добавьте цвета')
  const root = figma.createFrame()
  root.name = 'Гутенберг · Палитра'
  root.layoutMode = 'HORIZONTAL'; root.itemSpacing = 0; root.fills = []
  for (const color of colors) {
    const swatch = figma.createRectangle(); swatch.name = color.toUpperCase(); swatch.resize(140, 180); swatch.fills = [solid(color)]; root.appendChild(swatch)
  }
  figma.currentPage.appendChild(root); placeNearViewport(root); figma.currentPage.selection = [root]; figma.viewport.scrollAndZoomIntoView([root])
}

async function exportSelection(payload) {
  const node = figma.currentPage.selection[0]
  if (!node || typeof node.exportAsync !== 'function') throw new Error('Выберите фрейм или слой для экспорта')
  const format = payload?.format || 'PNG'
  let data; let mime; let extension
  if (format === 'SVG') {
    data = await node.exportAsync({ format: 'SVG_STRING' }); mime = 'image/svg+xml'; extension = 'svg'
  } else if (format === 'GIF') {
    const top = node.getTopLevelFrame?.() || (node.type === 'FRAME' && node.parent?.type === 'PAGE' ? node : null)
    if (!top) throw new Error('Для GIF выберите верхнеуровневый анимированный фрейм')
    data = await top.exportAsync({ format: 'GIF', fps: 15, loopCount: 0 }); mime = 'image/gif'; extension = 'gif'
  } else {
    data = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: clamp(+payload?.scale || 1, .5, 4) } }); mime = 'image/png'; extension = 'png'
  }
  figma.ui.postMessage({ type: 'download', data, mime, filename: `${safeName(node.name || 'gutenberg')}.${extension}` })
}

function typograph(text, options = {}) {
  let value = text.replace(/\.\.\./g, '…').replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
  value = value.replace(/(^|\s)-\s+/gm, '$1— ').replace(/\s+-\s+/g, ' — ')
  if (options.quotes !== false) value = value.replace(/"([^"\n]+)"/g, '«$1»').replace(/'([^'\n]+)'/g, '‘$1’')
  if (options.nbsp !== false) value = value.replace(/(^|\s)([А-Яа-яA-Za-z]{1,2})\s+(?=\S)/g, '$1$2 ')
  return value
}

function solid(hex) { const { r, g, b } = rgb(hex); return { type: 'SOLID', color: { r: r / 255, g: g / 255, b: b / 255 } } }
function rgb(hex) { const value = String(hex).replace('#', '').padEnd(6, '0').slice(0, 6); return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) } }
function contrastInk(hex) { const { r, g, b } = rgb(hex); return (r * 299 + g * 587 + b * 114) / 1000 < 145 ? '#FFFFFF' : '#111111' }
function placeNearViewport(node) { const center = figma.viewport.center; node.x = Math.round(center.x - node.width / 2); node.y = Math.round(center.y - node.height / 2) }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)) }
function safeName(value) { return value.toLowerCase().replace(/[^a-zа-я0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'gutenberg' }
