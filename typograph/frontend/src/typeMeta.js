// Единая карта типов правок: подпись и CSS-класс (цвет). Используется и в
// подсветке, и в легенде, и в счётчиках.

export const TYPE_META = {
  quotes: { label: 'Кавычки', cls: 'mk-quotes' },
  dashes: { label: 'Тире', cls: 'mk-dashes' },
  nbsp: { label: 'Неразрывный пробел', cls: 'mk-nbsp' },
}

const NBSP = '\u00A0'

// Отобразить «невидимые» символы правки в читаемом виде для превью.
// В буфер обмена при этом уходит настоящий текст результата, а не эти маркеры.
export function displayChars(str) {
  return str
    .split(NBSP).join('␣') // неразрывный пробел → видимый маркер
    .split('\n').join('↵\n')
}
