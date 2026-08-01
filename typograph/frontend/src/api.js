const API_BASE = import.meta.env.VITE_API_BASE || ''
const BROWSER_ONLY = import.meta.env.VITE_BROWSER_ONLY === '1'

const TYPES = [
  { id: 'quotes', label: 'Кавычки', description: 'Типографские кавычки и апострофы' },
  { id: 'dashes', label: 'Тире', description: 'Тире в диапазонах, диалогах и предложениях' },
  { id: 'nbsp', label: 'Неразрывные пробелы', description: 'Короткие слова, инициалы и тире' },
]

export async function fetchRules() {
  if (BROWSER_ONLY) return { types: TYPES, default_enabled: ['quotes', 'dashes', 'nbsp'] }
  const res = await fetch(`${API_BASE}/api/rules`)
  if (!res.ok) throw new Error('Не удалось загрузить список правил')
  return res.json()
}

function detectLang(value, fallback = 'ru') {
  const ru = (value.match(/[А-Яа-яЁё]/g) || []).length
  const en = (value.match(/[A-Za-z]/g) || []).length
  return ru > en ? 'ru' : en ? 'en' : (fallback === 'auto' ? 'ru' : fallback)
}

function browserCorrect({ text, enabledTypes, enDashStyle, exceptions, defaultLang }) {
  const edits = []
  const protectedText = (value) => exceptions.some((word) => word && value.toLowerCase().includes(word.toLowerCase()))
  const collect = (regex, replacement, type, rule, message) => {
    for (const match of text.matchAll(regex)) {
      const original = match[0]; const offset = match.index
      if (protectedText(original)) continue
      const args = [...match, offset, text]
      const next = typeof replacement === 'function'
        ? replacement(...args)
        : replacement.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? '')
      if (next === original) continue
      edits.push({ start: offset, end: offset + next.length, osrc_start: offset,
        osrc_end: offset + original.length, original, new: next,
        rule_type: type, rule, message, lang: detectLang(original, defaultLang) })
    }
  }
  if (enabledTypes.includes('quotes')) {
    collect(/"([^"\n]+)"/g, (_, inner) => `«${inner}»`, 'quotes', 'double_quotes', 'Типографские кавычки')
    collect(/(?<=[A-Za-zА-Яа-яЁё])'(?=[A-Za-zА-Яа-яЁё]|\b)/g, '’', 'quotes', 'apostrophe', 'Апостроф')
  }
  if (enabledTypes.includes('dashes')) {
    collect(/(?<![-\d])(\d{1,4})\s*-\s*(\d{1,4})(?![-\d])/g, '$1–$2', 'dashes', 'range_dash', 'Тире диапазона')
    collect(/^([ \t]*)-{1,2}[ \t]+(?=\S)/gm, '$1— ', 'dashes', 'dialogue_dash', 'Тире в диалоге')
    collect(/(?<=\S)[ \t]+-{1,2}[ \t]+(?=\S)/g, (value, offset, whole) => {
      const lang = detectLang(whole, defaultLang)
      return lang === 'en' ? (enDashStyle === 'uk' ? ' – ' : '—') : ' — '
    }, 'dashes', 'thought_dash', 'Тире в предложении')
  }
  if (enabledTypes.includes('nbsp')) {
    collect(/(^|[^A-Za-zА-Яа-яЁё0-9'’-])([A-Za-zА-Яа-яЁё]{1,2}) (?=[A-Za-zА-Яа-яЁё0-9«"“„‘(])/g,
      (all, before, word) => `${before}${word}\u00a0`, 'nbsp', 'short_word_nbsp', 'Неразрывный пробел')
    collect(/([A-Za-zА-Яа-яЁё])\.\s+([A-Za-zА-Яа-яЁё])\.\s+([A-Za-zА-Яа-яЁё]{2,})/g,
      '$1.\u00a0$2.\u00a0$3', 'nbsp', 'initials_nbsp', 'Неразрывный пробел между инициалами')
    collect(/(\S) ([—–])(?= )/g, '$1\u00a0$2', 'nbsp', 'dash_nbsp', 'Неразрывный пробел перед тире')
  }
  // Правила могут найти один и тот же фрагмент. Оставляем первое правило,
  // затем применяем независимые правки справа налево в исходных координатах.
  const accepted = []
  edits.sort((a, b) => a.osrc_start - b.osrc_start || b.osrc_end - a.osrc_end).forEach((edit) => {
    if (!accepted.some((item) => edit.osrc_start < item.osrc_end && edit.osrc_end > item.osrc_start)) accepted.push(edit)
  })
  let result = text
  ;[...accepted].sort((a, b) => b.osrc_start - a.osrc_start).forEach((edit) => {
    result = result.slice(0, edit.osrc_start) + edit.new + result.slice(edit.osrc_end)
  })
  accepted.forEach((edit, id) => { edit.id = id; edit.start = edit.osrc_start })
  return { original: text, result, edits: accepted, count: accepted.length }
}

export async function correct(options) {
  if (BROWSER_ONLY) return browserCorrect(options)
  const res = await fetch(`${API_BASE}/api/correct`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    text: options.text, enabled_types: options.enabledTypes, en_dash_style: options.enDashStyle,
    exceptions: options.exceptions, default_lang: options.defaultLang,
  }) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Ошибка сервера (${res.status})`)
  return res.json()
}
