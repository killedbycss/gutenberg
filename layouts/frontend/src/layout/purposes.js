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
  { id: 'mobile-portrait', label: 'Смартфон — экран', group: 'Цифровые устройства', width: 1179, height: 2556, unit: 'px', dpi: 72, palette: 'ink', safe: { x:.045,y:.075,w:.91,h:.89 }, scale: { headlineCap:.105,ratio:1.5,marginX:.075,marginY:.105,minBody:.016 } },
  { id: 'tablet-portrait', label: 'Планшет — портрет', group: 'Цифровые устройства', width: 1640, height: 2360, unit: 'px', dpi: 72, palette: 'ocean', safe: { x:.035,y:.03,w:.93,h:.94 }, scale: { headlineCap:.10,ratio:1.48,marginX:.07,marginY:.06,minBody:.015 } },
  { id: 'desktop-hd', label: 'Десктоп — 16:9', group: 'Цифровые устройства', width: 1920, height: 1080, unit: 'px', dpi: 72, palette: 'mono', safe: { x:.025,y:.09,w:.95,h:.865 }, scale: { headlineCap:.14,ratio:1.5,marginX:.055,marginY:.12,minBody:.025 } },
  { id: 'book-a5', label: 'Книга A5 — страница', group: 'Книги', width: 1748, height: 2480, unit: 'px', dpi: 300, palette: 'paper', safe: { x:.08,y:.07,w:.84,h:.86 }, scale: { headlineCap:.075,ratio:1.42,marginX:.09,marginY:.075,minBody:.012 } },
  { id: 'book-145x215', label: 'Книга 145×215 мм', group: 'Книги', width: 1713, height: 2539, unit: 'px', dpi: 300, palette: 'paper', safe: { x:.085,y:.07,w:.83,h:.86 }, scale: { headlineCap:.072,ratio:1.42,marginX:.095,marginY:.075,minBody:.0115 } },
  { id: 'ebook-reader', label: 'Электронная книга — 4:3', group: 'Книги', width: 1264, height: 1680, unit: 'px', dpi: 72, palette: 'mono', safe: { x:.055,y:.045,w:.89,h:.91 }, scale: { headlineCap:.085,ratio:1.4,marginX:.08,marginY:.065,minBody:.017 } },
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
