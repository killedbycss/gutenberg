// Тонкая обёртка над сервисом метрик. Пути относительные — их проксирует Vite.
//
// API_BASE: пусто при автономном запуске, «/layouts» — внутри Студии
// (задаётся сборкой через VITE_API_BASE).
const API_BASE = import.meta.env.VITE_API_BASE || ''
const BROWSER_ONLY = import.meta.env.VITE_BROWSER_ONLY === '1'

// Отправить файл шрифта, получить объект метрик (см. backend/fontmetrics.py).
export async function fetchMetrics(file) {
  if (BROWSER_ONLY) {
    const name = file.name.replace(/\.[^.]+$/, '')
    return {
      family: name, subfamily: 'Regular', unitsPerEm: 1000,
      ascender: 800, descender: -200, lineGap: 0,
      capHeight: 700, xHeight: 500, hasCyrillic: true,
      source: 'Браузерные метрики',
    }
  }
  const form = new FormData()
  form.append('font', file, file.name)
  const res = await fetch(`${API_BASE}/api/metrics`, { method: 'POST', body: form })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Не удалось прочитать шрифт (${res.status})`)
  }
  const json = await res.json()
  return json.metrics
}

// Независимая проверка покрытия через встроенный конвертер. Она служит
// страховкой для уже запущенного shell, который мог закешировать старую версию
// сервиса метрик до обновления приложения.
export async function fetchCyrillicSupport(file) {
  if (BROWSER_ONLY) return null
  const form = new FormData()
  form.append('fonts', file, file.name)
  form.append('preset', 'basic')
  const res = await fetch('/converter/api/analyze', { method: 'POST', body: form })
  if (!res.ok) return null
  const data = await res.json()
  const category = data.reports?.[0]?.coverage?.categories?.find((item) => item.key === 'cyrillic')
  if (!category?.total) return null
  return category.present / category.total >= 0.8
}

export async function checkHealth() {
  if (BROWSER_ONLY) return true
  try {
    const res = await fetch(`${API_BASE}/api/health`)
    return res.ok
  } catch {
    return false
  }
}
