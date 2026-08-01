import React, { useMemo } from 'react'

const NAMES = { mixed: 'textFloat', float: 'textFloat', reveal: 'textReveal', drift: 'textDrift', pulse: 'textPulse', rotate: 'textRotate', blur: 'textBlur', wave: 'textWave' }
const EASINGS = { smooth: 'cubic-bezier(.2,.75,.2,1)', spring: 'cubic-bezier(.16,1.35,.3,1)', linear: 'linear' }

export default function AnimationEditor({ animation, onAnimation, speed, onSpeed, distance, onDistance, stagger, onStagger, easing, onEasing, bezier, onBezier, customMode, onCustomMode, customCss, onCustomCss }) {
  const duration = Math.round(9200 / speed)
  const timing = easing === 'bezier' ? `cubic-bezier(${bezier.join(',')})` : EASINGS[easing]
  const generated = useMemo(() => `${NAMES[animation]} ${duration}ms ${timing} 0ms infinite normal both running`, [animation, duration, timing])
  const activeCss = customMode ? customCss : generated
  const copy = async () => { try { await navigator.clipboard.writeText(`animation: ${activeCss};`) } catch {} }
  return <div className="tool-group anim-in"><h3>Редактор анимации</h3>
    <div className="animation-mode segmented"><button className={!customMode ? 'on' : ''} onClick={() => onCustomMode(false)}>Параметры</button><button className={customMode ? 'on' : ''} onClick={() => onCustomMode(true)}>CSS-код</button></div>
    <fieldset disabled={customMode} className="animation-fields">
      <label className="field"><span className="field-label">Движение</span><select className="select" value={animation} onChange={(e) => onAnimation(e.target.value)}>
        <option value="mixed">Смешанное</option><option value="float">Всплытие</option><option value="reveal">Проявление</option><option value="drift">Сдвиг</option><option value="pulse">Импульс</option><option value="rotate">Поворот</option><option value="blur">Фокус</option><option value="wave">Волна</option>
      </select></label>
      <label className="field"><span className="field-label">Скорость · {speed.toFixed(1)}×</span><input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(e) => onSpeed(+e.target.value)} /></label>
      <label className="field"><span className="field-label">Амплитуда · {distance}px</span><input type="range" min="4" max="48" value={distance} onChange={(e) => onDistance(+e.target.value)} /></label>
      <label className="field"><span className="field-label">Задержка букв · {stagger}мс</span><input type="range" min="0" max="240" step="10" value={stagger} onChange={(e) => onStagger(+e.target.value)} /></label>
      <label className="field"><span className="field-label">Кривая</span><select className="select" value={easing} onChange={(e) => onEasing(e.target.value)}><option value="smooth">Плавная</option><option value="spring">Пружина</option><option value="linear">Линейная</option><option value="bezier">Своя cubic-bezier</option></select></label>
      {easing === 'bezier' && <div className="bezier-editor"><div className="bezier-line"><i style={{ left: `${bezier[0] * 100}%`, bottom: `${bezier[1] * 100}%` }} /><i style={{ left: `${bezier[2] * 100}%`, bottom: `${bezier[3] * 100}%` }} /></div>{bezier.map((value, index) => <label key={index}>P{index + 1}<input type="number" min={index % 2 ? -2 : 0} max={index % 2 ? 2 : 1} step=".05" value={value} onChange={(e) => onBezier(bezier.map((item, i) => i === index ? +e.target.value : item))} /></label>)}</div>}
    </fieldset>
    <div className={`animation-trainer ease-${easing}`} style={{ '--bento-speed': speed, '--bento-distance': `${distance}px`, '--bento-ease': timing }}>
      <div className={`trainer-square text-${animation === 'mixed' ? 'float' : animation}`} style={customMode ? { animation: customCss } : undefined} />
      <div className="animation-code"><div><span>name</span><b>{NAMES[animation]}</b></div><div><span>duration</span><b>{duration}ms</b></div><div><span>timing</span><b>{timing}</b></div><div><span>iteration</span><b>infinite</b></div></div>
    </div>
    <label className="css-animation-line"><span>Готовый CSS shorthand</span><textarea disabled={!customMode} value={customMode ? customCss : generated} onChange={(e) => onCustomCss(e.target.value)} spellCheck="false" /></label>
    <button className="btn-ghost wide" onClick={copy}>⧉ Копировать `animation: …;`</button>
  </div>
}
