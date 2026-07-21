// Утилиты подсветки ошибок в «подложке» под textarea.

export const TYPE_LABEL = {
  spelling: 'Орфография',
  grammar: 'Грамматика',
  punctuation: 'Пунктуация',
  style: 'Стиль',
};

export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Отпечаток ошибки для «пропустить» — устойчив к сдвигу позиций:
// правило + само подчёркнутое слово (в нижнем регистре).
export function fingerprint(text, m) {
  const token = text.slice(m.offset, m.offset + m.length).toLowerCase();
  return `${m.rule?.id || ''}::${token}`;
}

// LanguageTool может возвращать пересекающиеся ошибки. Для отрисовки берём
// непересекающийся набор: жадно слева направо, при равенстве — более длинную.
export function pickRenderable(matches) {
  const sorted = [...matches].sort(
    (a, b) => a.offset - b.offset || b.length - a.length
  );
  const result = [];
  let end = -1;
  for (const m of sorted) {
    if (m.offset >= end && m.length > 0) {
      result.push(m);
      end = m.offset + m.length;
    }
  }
  return result;
}

// Собрать HTML подложки: исходный текст, где ошибки обёрнуты в <mark>.
export function buildHighlightHtml(text, matches) {
  const rendered = pickRenderable(matches);
  let html = '';
  let cursor = 0;
  for (const m of rendered) {
    if (m.offset > cursor) html += escapeHtml(text.slice(cursor, m.offset));
    const seg = escapeHtml(text.slice(m.offset, m.offset + m.length));
    html += `<mark class="u u-${m.type}" data-id="${m.id}">${seg}</mark>`;
    cursor = m.offset + m.length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}
