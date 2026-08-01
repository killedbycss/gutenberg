import { useEffect, useMemo, useRef, useState } from 'react';
import SuggestionPopup from './SuggestionPopup.jsx';
import { buildHighlightHtml, pickRenderable } from '../utils/highlight.js';

const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/**
 * Редактор в стиле Google Docs: textarea сверху (реальный ввод и каретка),
 * подложка снизу с волнистыми подчёркиваниями. Попап открывается по клику
 * на подчёркнутое слово (определяется по позиции каретки).
 */
export default function Editor({
  text,
  matches,
  onChange,
  onApply,
  onIgnore,
  onAddToDictionary,
  navigateOffset,
  contentStyle,
}) {
  const containerRef = useRef(null);
  const taRef = useRef(null);
  const backdropRef = useRef(null);
  const [active, setActive] = useState(null); // { match, top, left }

  useEffect(() => {
    if (navigateOffset == null || !taRef.current) return;
    const ta = taRef.current;
    ta.focus(); ta.setSelectionRange(navigateOffset, navigateOffset);
    const ratio = navigateOffset / Math.max(1, text.length);
    ta.scrollTop = Math.max(0, ratio * (ta.scrollHeight - ta.clientHeight));
    syncScroll();
  }, [navigateOffset, text]);

  const html = useMemo(() => buildHighlightHtml(text, matches), [text, matches]);
  const rendered = useMemo(() => pickRenderable(matches), [matches]);

  const syncScroll = () => {
    if (backdropRef.current && taRef.current) {
      backdropRef.current.scrollTop = taRef.current.scrollTop;
      backdropRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  // Найти ошибку под кареткой и разместить попап под её подчёркиванием.
  const locate = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (ta.selectionStart !== ta.selectionEnd) {
      setActive(null);
      return;
    }
    const pos = ta.selectionStart;
    const hit = rendered.find(
      (m) => pos >= m.offset && pos <= m.offset + m.length
    );
    if (!hit) {
      setActive(null);
      return;
    }
    const markEl = backdropRef.current?.querySelector(
      `mark[data-id="${hit.id}"]`
    );
    if (!markEl || !containerRef.current) {
      setActive(null);
      return;
    }
    const c = containerRef.current.getBoundingClientRect();
    const r = markEl.getBoundingClientRect();
    let left = r.left - c.left;
    const maxLeft = c.width - 312;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    setActive({ match: hit, top: r.bottom - c.top + 6, left });
  };

  // Закрывать попап при клике вне редактора.
  useEffect(() => {
    const onDown = (e) => {
      if (!containerRef.current?.contains(e.target)) setActive(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Если ошибка исчезла после правки — закрыть попап.
  useEffect(() => {
    if (active && !matches.some((m) => m.id === active.match.id)) {
      setActive(null);
    }
  }, [matches, active]);

  return (
    <div className="editor" ref={containerRef}>
      <div
        className="editor__backdrop"
        ref={backdropRef}
        aria-hidden="true"
        // хвостовой перевод строки держит высоту подложки равной textarea
        dangerouslySetInnerHTML={{ __html: html + '\n' }}
        style={contentStyle}
      />
      <textarea
        ref={taRef}
        className="editor__input"
        value={text}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(null);
        }}
        onScroll={() => {
          syncScroll();
          setActive(null);
        }}
        onClick={locate}
        onKeyUp={(e) => {
          if (e.key === 'Escape') setActive(null);
          else if (ARROW_KEYS.includes(e.key)) locate();
        }}
        placeholder="Введите или вставьте текст…"
        style={contentStyle}
      />
      {active && (
        <SuggestionPopup
          match={active.match}
          top={active.top}
          left={active.left}
          onApply={(rep) => {
            onApply(active.match, rep);
            setActive(null);
          }}
          onIgnore={() => {
            onIgnore(active.match);
            setActive(null);
          }}
          onAddToDictionary={() => {
            onAddToDictionary(active.match);
            setActive(null);
          }}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
