// Каталог назначений: размеры холста и коэффициенты пропорций для движка.
//
// Размеры в пикселях (v1 — экран, RGB). `dpi` — справочно (для будущей печати).
// Коэффициенты в `scale`:
//   headlineCap — целевая высота ПРОПИСНОЙ заголовка, доля КОРОТКОЙ стороны;
//   ratio       — шаг модульной шкалы кеглей (заголовок → подзаголовок → текст);
//   marginX/Y   — поля, доли соответствующей стороны (ширины/высоты);
//   minBody     — минимальный кегль текста, доля короткой стороны (защита от мелочи).

export const PURPOSES = [
  {
    id: 'instagram-post',
    label: 'Instagram — пост',
    group: 'Соцсети',
    width: 1080, height: 1080, unit: 'px', dpi: 72,
    palette: 'ink',
    scale: { headlineCap: 0.11, ratio: 1.5, marginX: 0.075, marginY: 0.075, minBody: 0.020 },
  },
  {
    id: 'instagram-story',
    label: 'Instagram — story / Reels',
    group: 'Соцсети',
    width: 1080, height: 1920, unit: 'px', dpi: 72,
    palette: 'sunset',
    scale: { headlineCap: 0.12, ratio: 1.5, marginX: 0.09, marginY: 0.06, minBody: 0.018 },
  },
  {
    id: 'vk-cover',
    label: 'VK — обложка сообщества',
    group: 'Соцсети',
    width: 1590, height: 400, unit: 'px', dpi: 72,
    palette: 'ocean',
    // Безопасная зона по центру — на мобильных края обрезаются.
    safe: { x: 0.13, y: 0, w: 0.74, h: 1 },
    scale: { headlineCap: 0.26, ratio: 1.4, marginX: 0.05, marginY: 0.14, minBody: 0.06 },
  },
  {
    id: 'poster-a3',
    label: 'Постер A3 (портрет)',
    group: 'Печать',
    width: 1754, height: 2480, unit: 'px', dpi: 150, // 297×420 мм @150dpi
    palette: 'paper',
    scale: { headlineCap: 0.12, ratio: 1.5, marginX: 0.08, marginY: 0.07, minBody: 0.014 },
  },
  {
    id: 'business-card',
    label: 'Визитка (90×50 мм)',
    group: 'Печать',
    width: 1063, height: 591, unit: 'px', dpi: 300, // 90×50 мм @300dpi
    palette: 'mono',
    scale: { headlineCap: 0.11, ratio: 1.35, marginX: 0.08, marginY: 0.10, minBody: 0.030 },
  },
]

export function purposeById(id) {
  return PURPOSES.find((p) => p.id === id) || null
}

// Палитры: bg — фон, fg — основной текст, accent — подзаголовок/выделение,
// muted — подписи. v1 — сплошные заливки; градиенты можно добавить позже.
export const PALETTES = {
  ink: { bg: '#0E0F12', fg: '#F5F6F8', accent: '#8AA0FF', muted: '#AEB4C0' },
  paper: { bg: '#F3EFE7', fg: '#191510', accent: '#B5461B', muted: '#6B6157' },
  sunset: { bg: '#2A1330', fg: '#FFF1E8', accent: '#FF8A5B', muted: '#D3A9BE' },
  ocean: { bg: '#0B2A3A', fg: '#EAF6FF', accent: '#48C6EF', muted: '#9FC2D6' },
  mono: { bg: '#FFFFFF', fg: '#111111', accent: '#111111', muted: '#666666' },
}

export const PALETTE_IDS = Object.keys(PALETTES)

// Варианты композиции (совместимы со всеми назначениями).
export const VARIANT_OPTIONS = [
  { id: 'top-left', label: 'Заголовок сверху' },
  { id: 'centered', label: 'По центру' },
  { id: 'bottom-band', label: 'Нижняя треть' },
]
