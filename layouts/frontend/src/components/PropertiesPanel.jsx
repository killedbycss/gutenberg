import React, { useRef, useState } from 'react'
import { hexToCmyk, hexToRgb, cmykToHex } from '../layout/color'
import { ROLE_LABEL } from '../layout/schema'

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const normalizeHex = (value) => /^#?[0-9a-f]{6}$/i.test(value.trim()) ? `#${value.trim().replace('#', '')}` : null
const rgbaToHex = (value) => {
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) return null
  return `#${match.slice(1, 4).map((part) => Math.max(0, Math.min(255, +part)).toString(16).padStart(2, '0')).join('')}`
}

export default function PropertiesPanel({
  frame, onMove, paletteColors, paletteLocked, paletteSelected,
  onPaletteColor, onTogglePaletteLock, onTogglePaletteColor, onRandomPalette,
  onAddPaletteColor, onRemovePaletteColor,
  paletteWcag, onPaletteWcag, colorVision, onColorVision,
  images, selectedId, onSelect, onAddImage, onRemoveImage,
  spec, onToggleHidden,
}) {
  const imageInput = useRef(null)
  const [colorModel, setColorModel] = useState('rgb')
  const fields = [['w', 'Ширина'], ['h', 'Высота'], ['x', 'X'], ['y', 'Y']]
  return (
    <aside className="properties-panel">
      <div className="tool-group">
        <div className="tool-title-row"><h3>Палитра</h3><button className="random-palette" onClick={onRandomPalette}>Новая</button></div>
        <div className="palette-controls">
          <div className="segmented small"><button className={colorModel === 'rgb' ? 'on' : ''} onClick={() => setColorModel('rgb')}>RGB</button><button className={colorModel === 'cmyk' ? 'on' : ''} onClick={() => setColorModel('cmyk')}>CMYK</button></div>
          <div className="palette-count"><button onClick={onRemovePaletteColor}>−</button><span>{paletteColors.length}</span><button onClick={onAddPaletteColor}>+</button></div>
        </div>
        <div className="palette-accessibility">
          <label className="bento-check"><input type="checkbox" checked={paletteWcag} onChange={(event) => onPaletteWcag(event.target.checked)} /> Контраст WCAG</label>
          <label><span>Цветовое зрение</span><select value={colorVision} onChange={(event) => onColorVision(event.target.value)}>
            <option value="normal">Обычное</option><option value="protanopia">Протанопия</option><option value="deuteranopia">Дейтеранопия</option><option value="tritanopia">Тританопия</option><option value="achromatopsia">Ахроматопсия</option>
          </select></label>
        </div>
        <div className="palette-strips">
          {paletteColors.map((color, index) => {
            const cmyk = hexToCmyk(color)
            const rgb = hexToRgb(color)
            const rgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`
            return <div className={`palette-strip-wrap${paletteSelected.has(index) ? ' selected' : ''}`} key={index}>
            <div className="palette-strip">
              <button className="palette-strip-color" style={{ background: color }} onClick={() => onTogglePaletteColor(index)}>
                {paletteSelected.has(index) ? '✓' : ''}
              </button>
              <input type="color" value={color} onChange={(e) => onPaletteColor(index, e.target.value)} />
              <button onClick={() => onTogglePaletteLock(index)}>{paletteLocked.has(index) ? '●' : '○'}</button>
            </div>
            {colorModel === 'rgb' && <div className="strip-rgb">
              <label><span>HEX</span><input key={`hex-${color}`} defaultValue={color.toUpperCase()} onBlur={(event) => { const next = normalizeHex(event.target.value); if (next) onPaletteColor(index, next); else event.target.value = color.toUpperCase() }} aria-label={`HEX цвета ${index + 1}`} /></label>
              <label><span>RGBA</span><input key={`rgba-${color}`} defaultValue={rgba} onBlur={(event) => { const next = rgbaToHex(event.target.value); if (next) onPaletteColor(index, next); else event.target.value = rgba }} aria-label={`RGBA цвета ${index + 1}`} /></label>
            </div>}
            {colorModel === 'cmyk' && <div className="strip-cmyk">{['c','m','y','k'].map((channel) => <label key={channel}><span>{channel.toUpperCase()}</span><input type="number" min="0" max="100" value={cmyk[channel]} onChange={(event) => onPaletteColor(index, cmykToHex({...cmyk, [channel]: Math.max(0, Math.min(100, +event.target.value))}))} /></label>)}</div>}
            </div>
          })}
        </div>
      </div>
      <div className="tool-group properties-images">
        <h3>Изображения</h3>
        {images.length > 0 && <div className="img-list">{images.map((image) => (
          <div key={image.id} className={`img-item${selectedId === `img:${image.id}` ? ' sel' : ''}`}
            onClick={() => onSelect(`img:${image.id}`)}>
            <img src={image.src} alt="" />
            <button className="img-del" onClick={(event) => { event.stopPropagation(); onRemoveImage(image.id) }}>×</button>
          </div>
        ))}</div>}
        <button className="btn-ghost wide" onClick={() => imageInput.current?.click()}>+ Добавить</button>
        <input ref={imageInput} type="file" hidden accept="image/*" onChange={(event) => {
          if (event.target.files[0]) onAddImage(event.target.files[0]); event.target.value = ''
        }} />
      </div>
      {spec?.frames?.length > 0 && <div className="tool-group"><h3>Блоки</h3><ul className="blocks">
        {spec.frames.map((block) => <li key={block.id} className={`block-row${block.hidden ? ' off' : ''}${selectedId === block.id ? ' sel' : ''}`} onClick={() => onSelect(block.id)}>
          <span className="block-name">{block.type === 'image' ? 'изображение' : ROLE_LABEL[block.role] || block.role}</span>
          <button className="eye" onClick={(event) => { event.stopPropagation(); onToggleHidden(block.id) }}>{block.hidden ? '○' : '●'}</button>
        </li>)}
      </ul></div>}
      <div className="tool-group">
        <h3>Координаты и размер</h3>
        {frame ? (
          <div className="properties-fields">
            {fields.map(([key, label]) => (
              <label className="property-field" key={key}>
                <span>{label}</span>
                <div><input type="number" min="0" max="100" step="0.5"
                  value={Math.round(frame.box[key] * 1000) / 10}
                  onChange={(event) => onMove(frame.id, {
                    [key]: clamp01(+event.target.value / 100),
                  })} /><em>%</em></div>
              </label>
            ))}
          </div>
        ) : <p className="properties-empty">Выберите блок на макете.</p>}
      </div>
    </aside>
  )
}
