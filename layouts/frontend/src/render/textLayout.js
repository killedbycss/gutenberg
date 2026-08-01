// Перенос текста по словам с учётом РЕАЛЬНОЙ ширины в загруженном шрифте.
// Замер идёт через canvas 2d в том же шрифте, что и превью, — поэтому разбивка
// на строки совпадает с тем, что увидит пользователь и что уйдёт в экспорт.

// Создать измеритель ширины для семейства `family` (уже добавленного в
// document.fonts). Возвращает (text, fontSizePx, letterSpacingPx) → ширина, px.
export function makeMeasurer(family) {
  const ctx = document.createElement('canvas').getContext('2d')
  const stack = family.includes(',') ? family : `"${family}", Arial, sans-serif`
  return (text, fontSizePx, letterSpacingPx = 0) => {
    ctx.font = `${fontSizePx}px ${stack}`
    // letterSpacing поддерживается в Chromium/Safari; где нет — просто игнор.
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacingPx}px`
    return ctx.measureText(text).width
  }
}

// Разбить текст на строки под ширину `maxWidthPx`. Уважает явные переводы строк
// (\n). При превышении `maxLines` последняя видимая строка усекается многоточием.
export function wrapText({ text, measurer, fontSizePx, letterSpacingPx = 0, maxWidthPx, maxLines = 1000 }) {
  const measure = (t) => measurer(t, fontSizePx, letterSpacingPx)
  const all = []
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      all.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word
      if (line && measure(trial) > maxWidthPx) {
        all.push(line)
        line = word
      } else {
        line = trial
      }
    }
    all.push(line)
  }

  if (all.length <= maxLines) return all.length ? all : ['']

  const visible = all.slice(0, maxLines)
  let last = visible[maxLines - 1]
  while (last && measure(`${last}…`) > maxWidthPx && last.includes(' ')) {
    last = last.slice(0, last.lastIndexOf(' '))
  }
  visible[maxLines - 1] = `${last.replace(/\s+$/, '')}…`
  return visible
}
