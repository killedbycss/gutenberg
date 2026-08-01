import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Preview from './components/Preview'
import Bento from './components/Bento'
import PropertiesPanel from './components/PropertiesPanel'
import { checkHealth } from './api'
import { loadFont, readImageAsDataUrl } from './font/fontSource'
import { generateLayout } from './layout/engine'
import { purposeById, PURPOSES, VARIANT_OPTIONS } from './layout/purposes'
import { makeMeasurer } from './render/textLayout'
import { exportPng, exportSvg } from './render/exportImage'
import { cloneSpec, RENDER_FONT_FAMILY } from './layout/schema'

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

function semanticPalette(colors, indexes = [0, 1, 2]) {
  const active = indexes.map((i) => colors[i]).filter(Boolean)
  const candidates = active.length ? active : colors
  let best = { bg: candidates[0] || '#ffffff', fg: '#111111', ratio: 1 }
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
    { cols: 2, rows: 2, type: 'square' }, { cols: 1, rows: 2, type: 'tall' },
    { cols: 1, rows: 2, type: 'tall' }, { cols: 4, rows: 1, type: 'wide' },
  ],
  [
    { cols: 3, rows: 1, type: 'wide' }, { cols: 1, rows: 2, type: 'tall' },
    { cols: 1, rows: 1, type: 'square' }, { cols: 2, rows: 1, type: 'wide' },
  ],
  [
    { cols: 1, rows: 2, type: 'tall' }, { cols: 2, rows: 2, type: 'square' },
    { cols: 1, rows: 2, type: 'tall' }, { cols: 4, rows: 1, type: 'wide' },
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

function buildBento(metrics, content, seed, paletteColors) {
  const measurer = makeMeasurer(RENDER_FONT_FAMILY)
  const r = mulberry32(seed * 7 + 3)
  const slots = BENTO_GRIDS[Math.floor(r() * BENTO_GRIDS.length)]
  return slots.map((slot, index) => {
    const candidates = PURPOSES_BY_SHAPE[slot.type]
    const purposeId = candidates[Math.floor(r() * candidates.length)]
    const purpose = purposeById(purposeId)
    const count = paletteColors.length
    const paletteIndexes = [index % count, (index + 1) % count, (index + 2) % count]
    const palette = semanticPalette(paletteColors, paletteIndexes)
    const variant = VARIANT_OPTIONS[Math.floor(r() * VARIANT_OPTIONS.length)].id
    const copy = metrics.hasCyrillic === false ? BENTO_COPY_EN : BENTO_COPY
    const sample = copy[(Math.floor(r() * copy.length) + index) % copy.length]
    const itemContent = {
      ...content,
      ...sample,
      images: content.images || [],
    }
    return {
      cols: slot.cols, rows: slot.rows,
      purposeId, purposeLabel: purpose.label, palette, paletteIndexes, variant, content: itemContent,
      textAnimation: ['float', 'reveal', 'drift', 'pulse'][Math.floor(r() * 4)],
      spec: generateLayout({ purpose, metrics, content: itemContent, variant, palette, measurer }),
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
  const [fontInfo, setFontInfo] = useState(null)
  const [loadingFont, setLoadingFont] = useState(false)
  const [fontError, setFontError] = useState(null)

  const [mode, setMode] = useState('editor') // 'editor' | 'bento'
  const [purposeId, setPurposeId] = useState(PURPOSES[0].id)
  const [variant, setVariant] = useState('top-left')

  const [paletteId, setPaletteId] = useState('custom')
  const [paletteColors, setPaletteColors] = useState(['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'])
  const [paletteLocked, setPaletteLocked] = useState(new Set())
  const [paletteSelected, setPaletteSelected] = useState(new Set([0, 1, 2]))
  const customPalette = useMemo(
    () => semanticPalette(paletteColors, [...paletteSelected]),
    [paletteColors, paletteSelected],
  )
  const [content, setContent] = useState(DEFAULT_CONTENT)

  const [overrides, setOverrides] = useState({})
  const [bgColor, setBgColor] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [bentoSeed, setBentoSeed] = useState(1)
  const [bentoAnimation, setBentoAnimation] = useState('mixed')
  const [bentoSpeed, setBentoSpeed] = useState(1)

  useEffect(() => { checkHealth().then(setHealth) }, [])

  const purpose = purposeById(purposeId)
  const paletteValue = paletteId === 'custom' ? customPalette : paletteId

  const spec = useMemo(() => {
    if (!fontInfo || !purpose) return null
    const measurer = makeMeasurer(RENDER_FONT_FAMILY)
    const base = generateLayout({
      purpose, metrics: fontInfo.metrics, content, variant, palette: paletteValue, measurer,
    })
    return applyOverrides(base, overrides, bgColor)
  }, [fontInfo, purpose, content, variant, paletteValue, overrides, bgColor])

  const bentoItems = useMemo(
    () => (mode !== 'bento' || !fontInfo ? [] : buildBento(fontInfo.metrics, content, bentoSeed, paletteColors)),
    [mode, fontInfo, content, bentoSeed, paletteColors],
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
  }

  async function onExportPng() {
    if (!spec) return
    setExporting(true)
    try {
      await exportPng(spec, makeMeasurer(RENDER_FONT_FAMILY), fontInfo.fontCss, 1)
    } finally {
      setExporting(false)
    }
  }

  function onExportSvg() {
    if (!spec) return
    exportSvg(spec, makeMeasurer(RENDER_FONT_FAMILY), fontInfo.fontCss)
  }

  return (
    <div className="app">
      <div className="module-actions">
        <div className="topbar-right">
          {fontInfo && (
            <div className="mode-switch">
              <button className={mode === 'editor' ? 'on' : ''} onClick={() => setMode('editor')}>Редактор</button>
              <button className={mode === 'bento' ? 'on' : ''} onClick={() => setMode('bento')}>Бенто</button>
            </div>
          )}
          {!health && <span className="health-warn">Сервис метрик недоступен — запусти backend на :5070</span>}
        </div>
      </div>

      <div className="layout with-properties">
        {mode === 'bento' ? <aside className="toolbar bento-controls">
          <div className="tool-group anim-in"><h3>Редактор анимации</h3>
            <label className="field"><span className="field-label">Движение</span><select className="select" value={bentoAnimation} onChange={(e) => setBentoAnimation(e.target.value)}>
              <option value="mixed">Смешанное</option><option value="float">Всплытие</option><option value="reveal">Проявление</option><option value="drift">Сдвиг</option><option value="pulse">Импульс</option>
            </select></label>
            <label className="field"><span className="field-label">Скорость · {bentoSpeed.toFixed(1)}×</span><input type="range" min="0.5" max="2" step="0.1" value={bentoSpeed} onChange={(e) => setBentoSpeed(+e.target.value)} /></label>
            <p className="hint-sm">Настройки применяются ко всей мозаике. PNG экспортируется с фирменной подписью.</p>
          </div>
          <div className="tool-group anim-in"><button className="btn-ghost wide" onClick={() => setBentoSeed((s) => s + 1)}>↻ Новая композиция</button></div>
        </aside> : <Sidebar
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
        />}

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
              speed={bentoSpeed}
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
        <PropertiesPanel frame={mode === 'editor' ? selected : null} onMove={onMoveFrame}
            paletteColors={paletteColors} paletteLocked={paletteLocked} paletteSelected={paletteSelected}
            onPaletteColor={onPaletteColor} onTogglePaletteLock={onTogglePaletteLock}
            onTogglePaletteColor={onTogglePaletteColor} onRandomPalette={onRandomPalette}
            onAddPaletteColor={onAddPaletteColor} onRemovePaletteColor={onRemovePaletteColor}
            images={content.images || []} selectedId={selectedId} onSelect={setSelectedId}
            onAddImage={onAddImage} onRemoveImage={onRemoveImage}
            spec={spec} onToggleHidden={onToggleHidden} />
      </div>
    </div>
  )
}
