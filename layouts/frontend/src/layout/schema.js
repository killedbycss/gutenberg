// Контракт данных макета (LayoutSpec) — единственный «шов» между слоем ПОДБОРА
// (сейчас формульный движок engine.js; в будущем — библиотека готовых шаблонов)
// и слоем РЕНДЕРИНГА (svg.js + превью). Любой генератор, отдающий объект такой
// формы, рисуется и экспортируется без изменений рендера.
//
// Координаты фреймов НОРМАЛИЗОВАНЫ (0..1) относительно холста — одна схема
// одинаково работает на 1080×1080 и на A3 и переносима между шаблонами.
//
// Форма:
//   { schemaVersion, meta:{ purpose, generator, variant, title, createdAt },
//     canvas:{ width, height, unit, dpi, background:{ type, color } },
//     grid:{ columns, gutter, margin, baseline },
//     fonts:{ [key]: { ref, family, metrics } },
//     frames:[ Frame ] }
//
//   Frame (text):  { id, type:'text', role, editable, box:{x,y,w,h}, z,
//                    text:{ content, font, fontSize, lineHeight, letterSpacing,
//                           align, valign, color, transform, maxLines } }
//   Frame (image): { id, type:'image', role, editable, box:{x,y,w,h}, z,
//                    image:{ src, fit, align } }

export const SCHEMA_VERSION = '1.0'

// Ключ основного шрифта в spec.fonts и CSS-имя, под которым шрифт
// регистрируется в браузере и встраивается в экспортируемый SVG.
export const FONT_KEY = 'primary'
export const RENDER_FONT_FAMILY = 'LayoutUserFont'
export const BOOK_DEFAULT_FONT_FAMILY = 'LayoutBookDefault'

export const ROLES = ['headline', 'subhead', 'body', 'caption']
export const ROLE_LABEL = {
  headline: 'Заголовок',
  subhead: 'Подзаголовок',
  body: 'Текст',
  caption: 'Подпись',
}

// Пустой каркас — до генерации и как справка по форме.
export function emptySpec() {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { purpose: null, generator: 'formula@1', variant: 'top-left', title: '', createdAt: null },
    canvas: { width: 1080, height: 1080, unit: 'px', dpi: 72, background: { type: 'solid', color: '#0E0F12' } },
    grid: { columns: 6, gutter: 0.02, margin: 0.08, baseline: 0.03 },
    fonts: {},
    frames: [],
  }
}

// Глубокая копия спека — для иммутабельных правок в состоянии React.
export function cloneSpec(spec) {
  return JSON.parse(JSON.stringify(spec))
}
