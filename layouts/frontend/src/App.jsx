import React, { useEffect, useMemo, useState } from 'react'
import Sidebar, { FontPanel } from './components/Sidebar'
import Preview from './components/Preview'
import Bento from './components/Bento'
import AnimationEditor from './components/AnimationEditor'
import PropertiesPanel from './components/PropertiesPanel'
import { checkHealth } from './api'
import { loadFont, readImageAsDataUrl } from './font/fontSource'
import { generateLayout } from './layout/engine'
import { purposeById, PURPOSES, VARIANT_OPTIONS } from './layout/purposes'
import { makeMeasurer } from './render/textLayout'
import { exportPng, exportSvg } from './render/exportImage'
import { cloneSpec, RENDER_FONT_FAMILY, BOOK_DEFAULT_FONT_FAMILY } from './layout/schema'
import astraFontUrl from './assets/pt-astra-serif_regular.woff?inline'

const DEFAULT_CONTENT = {
  headline: 'Заголовок\nмакета',
  subhead: 'Подзаголовок или слоган',
  body: 'Текст набирается выбранным шрифтом.',
  caption: 'студия · 2026',
  images: [],
}
const DEFAULT_CONTENT_EN = {
  headline: 'Layout\nheadline',
  subhead: 'A subtitle or a short statement',
  body: 'The text is set in your selected typeface.',
  caption: 'studio · 2026',
  images: [],
}
const SYSTEM_FONT_INFO = {
  isSystem: true,
  fileName: 'Системный шрифт', fontCss: '',
  metrics: { family: 'System UI', unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, capHeight: 700, xHeight: 520, capHeightSource: 'fallback', hasCyrillic: true },
}
const ASTRA_FONT_CSS = `@font-face{font-family:'${BOOK_DEFAULT_FONT_FAMILY}';src:url('${astraFontUrl}') format('woff');font-weight:400;font-style:normal}`

let _uidN = 0
const uid = () => `${Date.now().toString(36)}${(_uidN++).toString(36)}`

// Небольшой сид-ПРНГ для воспроизводимого «перемешивания» бенто.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x] : h < 240 ? [0, x, c]
      : h < 300 ? [x, 0, c] : [c, 0, x]
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

function relativeLuminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255)
  const linear = rgb.map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

// Пять согласованных цветов в духе Coolors: общий базовый тон и контрастные
// аналоговые/комплементарные ответвления с разной светлотой.
function generateCoolors(random = Math.random, count = 5) {
  const hue = Math.floor(random() * 360)
  const offsets = [0, 28, 155, 188, 218, 62, 272, 326]
  const lightSets = random() > 0.5
    ? [16, 31, 52, 70, 91, 42, 62, 80]
    : [89, 72, 54, 34, 15, 62, 42, 25]
  return Array.from({ length: count }, (_, i) => hslToHex(
    (hue + offsets[i % offsets.length] + random() * 14 - 7 + 360) % 360,
    48 + random() * 38,
    Math.max(8, Math.min(94, lightSets[i % lightSets.length] + random() * 8 - 4)),
  ))
}

function semanticPalette(colors, indexes = [0, 1, 2], enforceContrast = true) {
  const active = indexes.map((i) => colors[i]).filter(Boolean)
  const candidates = active.length ? active : colors
  let best = { bg: candidates[0] || '#ffffff', fg: candidates[1] || '#111111', ratio: contrastRatio(candidates[0] || '#fff', candidates[1] || '#111') }
  if (!enforceContrast) return { bg: best.bg, fg: best.fg, accent: candidates[2] || best.fg, muted: candidates[3] || candidates[2] || best.fg, contrast: Math.round(best.ratio * 100) / 100, wcag: best.ratio >= 7 ? 'AAA' : best.ratio >= 4.5 ? 'AA' : 'fail' }
  for (const bg of candidates) {
    for (const fg of [...candidates, '#111111', '#ffffff']) {
      if (bg === fg) continue
      const ratio = contrastRatio(bg, fg)
      if (ratio > best.ratio) best = { bg, fg, ratio }
    }
  }
  // Дополнительные роли тоже обязаны оставаться читаемыми. Если цвет палитры
  // не проходит AA, роль получает основную контрастную краску.
  const safeRole = (preferred) => contrastRatio(best.bg, preferred) >= 4.5 ? preferred : best.fg
  return {
    bg: best.bg,
    fg: best.fg,
    accent: safeRole(active[1] || best.fg),
    muted: safeRole(active[2] || active[1] || best.fg),
    contrast: Math.round(best.ratio * 100) / 100,
    wcag: best.ratio >= 7 ? 'AAA' : best.ratio >= 4.5 ? 'AA' : 'fail',
  }
}

// Несколько плотных схем одной общей бенто-сетки. При перемешивании меняется
// не только оформление, но и геометрия мозаики. type ограничивает выбор
// назначения подходящей пропорцией, чтобы макет заполнял ячейку без искажения.
const BENTO_GRIDS = [
  [
    { col: 1, row: 1, cols: 2, rows: 2, type: 'square' }, { col: 3, row: 1, cols: 1, rows: 2, type: 'tall' },
    { col: 4, row: 1, cols: 1, rows: 2, type: 'tall' }, { col: 1, row: 3, cols: 4, rows: 1, type: 'wide' },
  ],
  [
    { col: 1, row: 1, cols: 3, rows: 1, type: 'wide' }, { col: 4, row: 1, cols: 1, rows: 2, type: 'tall' },
    { col: 1, row: 2, cols: 2, rows: 2, type: 'square' }, { col: 3, row: 2, cols: 1, rows: 1, type: 'square' },
    { col: 3, row: 3, cols: 2, rows: 1, type: 'wide' },
  ],
  [
    { col: 1, row: 1, cols: 1, rows: 2, type: 'tall' }, { col: 2, row: 1, cols: 2, rows: 2, type: 'square' },
    { col: 4, row: 1, cols: 1, rows: 2, type: 'tall' }, { col: 1, row: 3, cols: 4, rows: 1, type: 'wide' },
  ],
]

const PURPOSES_BY_SHAPE = {
  square: ['instagram-post', 'tablet-portrait'],
  tall: ['instagram-story', 'poster-a3', 'mobile-portrait', 'book-a5', 'book-145x215', 'ebook-reader'],
  wide: ['vk-cover', 'business-card', 'desktop-hd'],
}

const BENTO_COPY = [
  { headline: 'Форма и\nсодержание', subhead: 'Типографическая система', body: 'Ритм, масштаб и ясная иерархия.', caption: 'визуальное исследование' },
  { headline: 'Новый\nвзгляд', subhead: 'Собрано в деталях', body: 'Сильная идея говорит коротко.', caption: 'gutenberg · studio' },
  { headline: 'Больше\nвоздуха', subhead: 'Меньше лишнего', body: 'Пространство становится частью сообщения.', caption: 'практика формы' },
  { headline: 'Смысл\nв ритме', subhead: 'Шрифт задаёт голос', body: 'Каждый формат продолжает общую историю.', caption: 'серия · 2026' },
  { headline: 'Точка\nсборки', subhead: 'Один стиль — разные носители', body: 'Композиция адаптируется к масштабу.', caption: 'design system' },
  { headline: 'Видеть\nглавное', subhead: 'Контраст и порядок', body: 'Текст работает вместе с формой.', caption: 'редакционный дизайн' },
]

const BENTO_COPY_EN = [
  { headline: 'Form and\nmeaning', subhead: 'A typographic system', body: 'Rhythm, scale and a clear hierarchy.', caption: 'visual study' },
  { headline: 'A fresh\nperspective', subhead: 'Built through detail', body: 'A strong idea speaks with clarity.', caption: 'gutenberg · studio' },
  { headline: 'More\nspace', subhead: 'Less visual noise', body: 'Space becomes part of the message.', caption: 'shape practice' },
  { headline: 'Rhythm\nmatters', subhead: 'Type gives ideas a voice', body: 'Every format continues one story.', caption: 'series · 2026' },
]

function buildBento(metrics, content, seed, paletteColors, enforceContrast) {
  const measurer = makeMeasurer(RENDER_FONT_FAMILY)
  const r = mulberry32(seed * 7 + 3)
  const slots = BENTO_GRIDS[Math.floor(r() * BENTO_GRIDS.length)]
  const count = paletteColors.length
  const copy = metrics.hasCyrillic === false ? BENTO_COPY_EN : BENTO_COPY
  return slots.map((slot, index) => {
    const paletteIndexes = [index % count, (index + 1) % count, (index + 2) % count]
    const palette = semanticPalette(paletteColors, paletteIndexes, enforceContrast)
    const variant = VARIANT_OPTIONS[index % VARIANT_OPTIONS.length].id
    const sample = copy[(Math.floor(r() * copy.length) + index) % copy.length]
    const itemContent = { ...content, ...sample, images: content.images || [] }
    const purpose = {
      ...purposeById('desktop-hd'),
      id: 'desktop-hd', label: 'Бенто-модуль', group: 'Бенто',
      width: slot.cols * 480, height: slot.rows * 360,
      safe: { x: .04, y: .04, w: .92, h: .92 },
      scale: { headlineCap: .13, ratio: 1.48, marginX: .07, marginY: .08, minBody: .025 },
    }
    return {
      col: slot.col, row: slot.row, cols: slot.cols, rows: slot.rows,
      purposeId: 'desktop-hd', purposeLabel: purpose.label, palette, paletteIndexes, variant, content: itemContent,
      textAnimation: ['float', 'reveal', 'drift', 'pulse', 'rotate', 'blur', 'wave'][Math.floor(r() * 7)],
      spec: generateLayout({ purpose, metrics, content: itemContent, variant, palette, measurer }),
      viewBox: null,
    }
  })
}

// Наложить ручные правки (overrides) поверх сгенерированного макета.
function applyOverrides(spec, overrides, bgColor) {
  if (!bgColor && Object.keys(overrides).length === 0) return spec
  const next = cloneSpec(spec)
  if (bgColor) next.canvas.background.color = bgColor
  for (const f of next.frames) {
    const o = overrides[f.id]
    if (!o) continue
    if (o.hidden != null) f.hidden = o.hidden
    if (o.z != null) f.z = o.z
    if (o.box) f.box = { ...f.box, ...o.box }
    if (f.type === 'text') {
      if (o.fontSize != null) f.text.fontSize = o.fontSize
      if (o.align) f.text.align = o.align
      if (o.color) f.text.color = o.color
    } else if (f.type === 'image' && o.fit) {
      f.image.fit = o.fit
    }
  }
  return next
}

export default function App() {
  const [health, setHealth] = useState(true)
  const [fontInfo, setFontInfo] = useState(SYSTEM_FONT_INFO)
  const [loadingFont, setLoadingFont] = useState(false)
  const [fontError, setFontError] = useState(null)

  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'bento' ? 'bento' : 'editor')
  const [purposeId, setPurposeId] = useState(PURPOSES[0].id)
  const [variant, setVariant] = useState('top-left')

  const [paletteId, setPaletteId] = useState('custom')
  const [paletteColors, setPaletteColors] = useState(['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'])
  const [paletteLocked, setPaletteLocked] = useState(new Set())
  const [paletteSelected, setPaletteSelected] = useState(new Set([0, 1, 2]))
  const [paletteWcag, setPaletteWcag] = useState(true)
  const [colorVision, setColorVision] = useState('normal')
  const customPalette = useMemo(
    () => semanticPalette(paletteColors, [...paletteSelected], paletteWcag),
    [paletteColors, paletteSelected, paletteWcag],
  )
  const [content, setContent] = useState(DEFAULT_CONTENT)

  const [overrides, setOverrides] = useState({})
  const [bgColor, setBgColor] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [bentoSeed, setBentoSeed] = useState(1)
  const [bentoAnimation, setBentoAnimation] = useState('mixed')
  const [bentoSpeed, setBentoSpeed] = useState(1)
  const [bentoDistance, setBentoDistance] = useState(18)
  const [bentoStagger, setBentoStagger] = useState(90)
  const [bentoEasing, setBentoEasing] = useState('smooth')
  const [customAnimationMode, setCustomAnimationMode] = useState(false)
  const [customAnimationCss, setCustomAnimationCss] = useState('textFloat 9200ms cubic-bezier(.2,.75,.2,1) 0ms infinite normal both running')
  const [mobilePanel, setMobilePanel] = useState('canvas')
  const [fishAmount, setFishAmount] = useState(4)
  const [themeVersion, setThemeVersion] = useState(0)

  useEffect(() => { checkHealth().then(setHealth) }, [])
  useEffect(() => {
    const receiveMode = (event) => { if (event.data?.type === 'studio-mode') setMode(event.data.mode === 'bento' ? 'bento' : 'editor') }
    window.addEventListener('message', receiveMode)
    return () => window.removeEventListener('message', receiveMode)
  }, [])
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((value) => value + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    document.fonts?.load(`16px '${BOOK_DEFAULT_FONT_FAMILY}'`).then(() => setThemeVersion((value) => value + 1)).catch(() => {})
  }, [])

  const purpose = purposeById(purposeId)
  const paletteValue = paletteId === 'custom' ? customPalette : paletteId

  const spec = useMemo(() => {
    if (!fontInfo || !purpose) return null
    const renderFamily = fontInfo.isSystem && purpose.group === 'Книги' ? BOOK_DEFAULT_FONT_FAMILY : RENDER_FONT_FAMILY
    const measurer = makeMeasurer(renderFamily)
    const base = generateLayout({
      purpose, metrics: fontInfo.metrics, content, variant, palette: paletteValue, measurer,
    })
    base.meta.renderFontFamily = renderFamily
    if (purpose.group === 'Книги' || purpose.group === 'Цифровые устройства') {
      const themedBackground = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff'
      base.canvas.background.color = themedBackground
      if (paletteWcag) {
        const safeInk = contrastRatio(themedBackground, '#111111') >= contrastRatio(themedBackground, '#ffffff') ? '#111111' : '#ffffff'
        base.frames.forEach((frame) => {
          if (frame.type === 'text' && contrastRatio(themedBackground, frame.text.color) < 4.5) frame.text.color = safeInk
        })
      }
    }
    return applyOverrides(base, overrides, bgColor)
  }, [fontInfo, purpose, content, variant, paletteValue, overrides, bgColor, paletteWcag, themeVersion])

  const bentoItems = useMemo(
    () => (mode !== 'bento' || !fontInfo ? [] : buildBento(fontInfo.metrics, content, bentoSeed, paletteColors, paletteWcag)),
    [mode, fontInfo, content, bentoSeed, paletteColors, paletteWcag],
  )

  const selected = spec ? spec.frames.find((f) => f.id === selectedId) || null : null
  const hasEdits = Object.keys(overrides).length > 0 || !!bgColor

  // --- Обработчики ---
  async function onUploadFont(file) {
    setLoadingFont(true)
    setFontError(null)
    try {
      const info = await loadFont(file)
      setFontInfo(info)
      setContent((current) => info.metrics.hasCyrillic === false
        ? { ...DEFAULT_CONTENT_EN, images: current.images || [] }
        : current)
    } catch (e) {
      setFontError(e.message)
    } finally {
      setLoadingFont(false)
    }
  }

  function onPurpose(id) {
    setPurposeId(id)
    setOverrides({})
    setBgColor(null)
    setSelectedId(null)
  }

  function onVariant(v) {
    setVariant(v)
    setOverrides({})
    setSelectedId(null)
  }

  function onPaletteColor(index, hex) {
    setPaletteColors((colors) => colors.map((color, i) => i === index ? hex : color))
    setBgColor(null)
  }

  function onRandomPalette() {
    const generated = generateCoolors(Math.random, paletteColors.length)
    setPaletteColors((colors) => colors.map((color, i) => paletteLocked.has(i) ? color : generated[i]))
    setPaletteId('custom')
    setBgColor(null)
    setOverrides({})
  }

  function onTogglePaletteLock(index) {
    setPaletteLocked((current) => {
      const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next
    })
  }

  function onTogglePaletteColor(index) {
    setPaletteSelected((current) => {
      const next = new Set(current)
      if (next.has(index) && next.size > 1) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function onAddPaletteColor() {
    if (paletteColors.length >= 8) return
    const next = generateCoolors(Math.random, 1)[0]
    setPaletteColors((colors) => [...colors, next])
  }

  function onRemovePaletteColor() {
    if (paletteColors.length <= 2) return
    const last = paletteColors.length - 1
    setPaletteColors((colors) => colors.slice(0, -1))
    setPaletteLocked((current) => new Set([...current].filter((index) => index !== last)))
    setPaletteSelected((current) => new Set([...current].filter((index) => index !== last)))
  }

  async function onExtractPalette(file) {
    const colors = await extractImagePalette(file, paletteColors.length)
    setPaletteColors(colors)
    setPaletteSelected(new Set(colors.map((_, index) => index)))
    setPaletteLocked(new Set())
    setPaletteId('custom')
    setBgColor(null)
  }

  function onContentField(role, value) {
    setContent((c) => ({ ...c, [role]: value }))
  }

  async function onAddImage(file) {
    try {
      const src = await readImageAsDataUrl(file)
      setContent((c) => ({ ...c, images: [...(c.images || []), { id: uid(), src }] }))
    } catch (e) {
      setFontError(e.message)
    }
  }

  function onRemoveImage(id) {
    setContent((c) => ({ ...c, images: (c.images || []).filter((im) => im.id !== id) }))
    if (selectedId === `img:${id}`) setSelectedId(null)
    setOverrides((prev) => { const n = { ...prev }; delete n[`img:${id}`]; return n })
  }

  function onFrameChange(id, patch) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function onMoveFrame(id, box) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], box: { ...(prev[id]?.box || {}), ...box } } }))
  }

  function onToggleHidden(id) {
    const cur = !!(overrides[id]?.hidden ?? (spec?.frames.find((f) => f.id === id)?.hidden))
    onFrameChange(id, { hidden: !cur })
  }

  function resetEdits() {
    setOverrides({})
    setBgColor(null)
    setSelectedId(null)
  }

  function onPickBento(item) {
    setPurposeId(item.purposeId)
    setPaletteId('custom')
    setPaletteSelected(new Set(item.paletteIndexes))
    setVariant(item.variant)
    setContent(item.content)
    setOverrides({})
    setBgColor(null)
    setSelectedId(null)
    setMode('editor')
    window.parent?.postMessage({ type: 'studio-activate', mod: 'layouts' }, '*')
  }

  async function onExportPng() {
    if (!spec) return
    setExporting(true)
    try {
      const family = spec.meta?.renderFontFamily || RENDER_FONT_FAMILY
      await exportPng(spec, makeMeasurer(family), family === BOOK_DEFAULT_FONT_FAMILY ? ASTRA_FONT_CSS : fontInfo.fontCss, 1)
    } finally {
      setExporting(false)
    }
  }

  function onExportSvg() {
    if (!spec) return
    const family = spec.meta?.renderFontFamily || RENDER_FONT_FAMILY
    exportSvg(spec, makeMeasurer(family), family === BOOK_DEFAULT_FONT_FAMILY ? ASTRA_FONT_CSS : fontInfo.fontCss)
  }

  return (
    <div className="app">
      <div className="module-actions">
        <div className="topbar-right">
          {!health && <span className="health-warn">Сервис метрик недоступен — запусти backend на :5070</span>}
        </div>
      </div>

      <nav className="mobile-panel-tabs" aria-label="Панели редактора"><button className={mobilePanel === 'left' ? 'on' : ''} onClick={() => setMobilePanel('left')}>Настройки</button><button className={mobilePanel === 'canvas' ? 'on' : ''} onClick={() => setMobilePanel('canvas')}>Холст</button><button className={mobilePanel === 'right' ? 'on' : ''} onClick={() => setMobilePanel('right')}>Свойства</button></nav>
      <div className={`layout with-properties mobile-panel-${mobilePanel}`}>
        {mode === 'bento' ? <aside className="toolbar bento-controls mobile-left-panel">
          <AnimationEditor animation={bentoAnimation} onAnimation={setBentoAnimation} speed={bentoSpeed} onSpeed={setBentoSpeed} distance={bentoDistance} onDistance={setBentoDistance} stagger={bentoStagger} onStagger={setBentoStagger} easing={bentoEasing} onEasing={setBentoEasing} customMode={customAnimationMode} onCustomMode={setCustomAnimationMode} customCss={customAnimationCss} onCustomCss={setCustomAnimationCss} />
          <FontPanel fontInfo={fontInfo} loadingFont={loadingFont} fontError={fontError} onUploadFont={onUploadFont} />
          <div className="tool-group anim-in"><button className="btn-ghost wide" onClick={() => setBentoSeed((s) => s + 1)}>↻ Новая композиция</button></div>
        </aside> : <div className="mobile-left-panel"><Sidebar
          fontInfo={fontInfo}
          loadingFont={loadingFont}
          fontError={fontError}
          onUploadFont={onUploadFont}
          purposeId={purposeId}
          onPurpose={onPurpose}
          variant={variant}
          onVariant={onVariant}
          paletteColors={paletteColors}
          paletteLocked={paletteLocked}
          paletteSelected={paletteSelected}
          onPaletteColor={onPaletteColor}
          onTogglePaletteLock={onTogglePaletteLock}
          onTogglePaletteColor={onTogglePaletteColor}
          onRandomPalette={onRandomPalette}
          content={content}
          onContentField={onContentField}
          fishAmount={fishAmount}
          onFishAmount={setFishAmount}
          onAddImage={onAddImage}
          onRemoveImage={onRemoveImage}
          spec={spec}
          selected={selected}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onFrameChange={onFrameChange}
          onMoveFrame={onMoveFrame}
          onToggleHidden={onToggleHidden}
          bgColor={bgColor}
          onBgColor={setBgColor}
          onResetEdits={resetEdits}
          hasEdits={hasEdits}
        /></div>}

        <main className="main">
          {!spec ? (
            <div className="empty">
              <div className="empty-icon">Aa</div>
              <h2>Загрузите шрифт</h2>
              <p>Выберите файл OTF / TTF / WOFF / WOFF2 слева — система рассчитает метрики
                и соберёт макет под выбранное назначение.</p>
            </div>
          ) : mode === 'bento' ? (
            <Bento
              items={bentoItems}
              fontReady={!!fontInfo}
              seed={bentoSeed}
              onShuffle={() => setBentoSeed((s) => s + 1)}
              onPick={onPickBento}
              animation={bentoAnimation}
              animationCss={customAnimationMode ? customAnimationCss : ''}
              speed={bentoSpeed}
              distance={bentoDistance}
              stagger={bentoStagger}
              easing={bentoEasing}
              showWcag={paletteWcag}
              colorVision={colorVision}
              fontCss={fontInfo.fontCss}
            />
          ) : (
            <Preview
              spec={spec}
              fontReady={!!fontInfo}
              selectedId={selectedId}
              selected={selected}
              onSelect={setSelectedId}
              onMoveFrame={onMoveFrame}
              onExportPng={onExportPng}
              onExportSvg={onExportSvg}
              exporting={exporting}
            />
          )}
        </main>
        <div className="mobile-right-panel"><PropertiesPanel frame={mode === 'editor' ? selected : null} onMove={onMoveFrame}
            paletteColors={paletteColors} paletteLocked={paletteLocked} paletteSelected={paletteSelected}
            onPaletteColor={onPaletteColor} onTogglePaletteLock={onTogglePaletteLock}
            onTogglePaletteColor={onTogglePaletteColor} onRandomPalette={onRandomPalette}
            onAddPaletteColor={onAddPaletteColor} onRemovePaletteColor={onRemovePaletteColor}
            onExtractPalette={onExtractPalette}
            paletteWcag={paletteWcag} onPaletteWcag={setPaletteWcag}
            colorVision={colorVision} onColorVision={setColorVision}
            images={content.images || []} selectedId={selectedId} onSelect={setSelectedId}
            onAddImage={onAddImage} onRemoveImage={onRemoveImage}
            spec={spec} onToggleHidden={onToggleHidden} /></div>
      </div>
    </div>
  )
}

async function extractImagePalette(file, count) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url })
    const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const pixels = []
    for (let i = 0; i < data.length; i += 16) if (data[i + 3] > 180) pixels.push([data[i], data[i + 1], data[i + 2]])
    if (!pixels.length) throw new Error('В изображении нет непрозрачных цветов')
    let centers = Array.from({ length: count }, (_, index) => pixels[Math.floor(index * (pixels.length - 1) / Math.max(1, count - 1))].slice())
    for (let pass = 0; pass < 8; pass += 1) {
      const sums = centers.map(() => [0, 0, 0, 0])
      pixels.forEach((pixel) => {
        let best = 0; let distance = Infinity
        centers.forEach((center, index) => { const next = (pixel[0]-center[0])**2 + (pixel[1]-center[1])**2 + (pixel[2]-center[2])**2; if (next < distance) { distance = next; best = index } })
        sums[best][0] += pixel[0]; sums[best][1] += pixel[1]; sums[best][2] += pixel[2]; sums[best][3] += 1
      })
      centers = centers.map((center, index) => sums[index][3] ? sums[index].slice(0, 3).map((value) => value / sums[index][3]) : center)
    }
    return centers.map((rgb) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`)
  } finally { URL.revokeObjectURL(url) }
}
