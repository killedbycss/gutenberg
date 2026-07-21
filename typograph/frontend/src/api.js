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
  let result = text
  const edits = []
  const protectedText = (value) => exceptions.some((word) => word && value.toLowerCase().includes(word.toLowerCase()))
  const apply = (regex, replacement, type, rule, message) => {
    result = result.replace(regex, (...args) => {
      const original = args[0]
      const offset = args.at(-2)
      if (protectedText(original)) return original
      const next = typeof replacement === 'function' ? replacement(...args) : replacement
      if (next === original) return original
      const finalStart = offset
      edits.push({ id: edits.length, start: finalStart, end: finalStart + next.length,
        osrc_start: finalStart, osrc_end: finalStart + original.length, original, new: next,
        rule_type: type, rule, message, lang: detectLang(original, defaultLang) })
      return next
    })
  }
  if (enabledTypes.includes('quotes')) {
    apply(/"([^"\n]+)"/g, (_, inner) => `«${inner}»`, 'quotes', 'double_quotes', 'Типографские кавычки')
    apply(/(?<=[A-Za-zА-Яа-яЁё])'(?=[A-Za-zА-Яа-яЁё]|\b)/g, '’', 'quotes', 'apostrophe', 'Апостроф')
  }
  if (enabledTypes.includes('dashes')) {
    apply(/(?<![-\d])(\d{1,4})\s*-\s*(\d{1,4})(?![-\d])/g, '$1–$2', 'dashes', 'range_dash', 'Тире диапазона')
    apply(/^([ \t]*)-{1,2}[ \t]+(?=\S)/gm, '$1— ', 'dashes', 'dialogue_dash', 'Тире в диалоге')
    apply(/(?<=\S)[ \t]+-{1,2}[ \t]+(?=\S)/g, (value, offset, whole) => {
      const lang = detectLang(whole, defaultLang)
      return lang === 'en' ? (enDashStyle === 'uk' ? ' – ' : '—') : ' — '
    }, 'dashes', 'thought_dash', 'Тире в предложении')
  }
  if (enabledTypes.includes('nbsp')) {
    apply(/(^|[^A-Za-zА-Яа-яЁё0-9'’-])([A-Za-zА-Яа-яЁё]{1,2}) (?=[A-Za-zА-Яа-яЁё0-9«"“„‘(])/g,
      (all, before, word) => `${before}${word}\u00a0`, 'nbsp', 'short_word_nbsp', 'Неразрывный пробел')
    apply(/([A-Za-zА-Яа-яЁё])\.\s+([A-Za-zА-Яа-яЁё])\.\s+([A-Za-zА-Яа-яЁё]{2,})/g,
      '$1.\u00a0$2.\u00a0$3', 'nbsp', 'initials_nbsp', 'Неразрывный пробел между инициалами')
    apply(/(\S) ([—–])(?= )/g, '$1\u00a0$2', 'nbsp', 'dash_nbsp', 'Неразрывный пробел перед тире')
  }
  edits.sort((a, b) => a.start - b.start).forEach((edit, id) => { edit.id = id })
  return { original: text, result, edits, count: edits.length }
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
