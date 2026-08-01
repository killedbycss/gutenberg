import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Editor from './components/Editor.jsx';
import DictionaryPanel from './components/DictionaryPanel.jsx';
import {
  checkText,
  getHealth,
  getDictionary,
  addWord,
  removeWord,
} from './api.js';
import { fingerprint } from './utils/highlight.js';

const DEMO = `Привет всем!  Это тестовый текст на руском языке, в котором есть ашибка.
Он содержит  двойные пробелы и забытые запятые например здесь.

This are a sample text in english with some erors and bad grammar.`;

const DEBOUNCE_MS = 550;
const FISH_RU = ['Типографика помогает выстроить ясную и выразительную систему.', 'Хороший шрифт уверенно работает в заголовках, подписях и длинном тексте.', 'Ритм строки, поля и интервалы создают спокойное пространство для чтения.', 'Форма буквы раскрывается в разных кеглях и на разных носителях.'];
const FISH_EN = ['Typography builds a clear and expressive visual system.', 'A good typeface works confidently in headlines, captions and long-form text.', 'Rhythm, margins and spacing create a calm space for reading.', 'Letterforms reveal their character across sizes and media.'];

function makeFish(language, paragraphs = 6) {
  const source = language === 'en-US' ? FISH_EN : FISH_RU
  return Array.from({ length: paragraphs }, (_, i) => source.map((line, j) => source[(i + j) % source.length]).join(' ')).join('\n\n')
}

function splitPages(value, capacity) {
  if (!value) return ['']
  const pages = []
  let rest = value
  while (rest.length > capacity) {
    let cut = rest.lastIndexOf('\n', capacity)
    if (cut < capacity * .55) cut = rest.lastIndexOf(' ', capacity)
    if (cut < capacity * .55) cut = capacity
    pages.push(rest.slice(0, cut + (rest[cut] === '\n' ? 1 : 0)))
    rest = rest.slice(cut + (rest[cut] === '\n' ? 1 : 0))
  }
  pages.push(rest)
  return pages
}

export default function App() {
  const [text, setText] = useState(DEMO);
  const [language, setLanguage] = useState('auto');
  const [enableStyle, setEnableStyle] = useState(false);
  const [rawMatches, setRawMatches] = useState([]);
  const [ignored, setIgnored] = useState(() => new Set());
  const [status, setStatus] = useState('idle'); // idle | checking | ready | error
  const [ltAvailable, setLtAvailable] = useState(null);
  const [detected, setDetected] = useState(null);
  const [words, setWords] = useState([]);
  const [showDict, setShowDict] = useState(false);
  const [navigateOffset, setNavigateOffset] = useState(null);
  const [fontSize, setFontSize] = useState(17);
  const [pageFormat, setPageFormat] = useState('a4');
  const [contentFont, setContentFont] = useState(null);

  const reqId = useRef(0);
  const abortRef = useRef(null);

  // При старте: доступность LanguageTool и загрузка словаря.
  useEffect(() => {
    getHealth()
      .then((h) => setLtAvailable(!!h.languagetool))
      .catch(() => setLtAvailable(false));
    getDictionary().then(setWords).catch(() => {});
  }, []);

  const runCheck = useCallback(async () => {
    if (!text.trim()) {
      setRawMatches([]);
      setDetected(null);
      setStatus('ready');
      return;
    }
    const id = ++reqId.current;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus('checking');
    try {
      const data = await checkText({ text, language, enableStyle }, ctrl.signal);
      if (id !== reqId.current) return; // устаревший ответ
      setRawMatches(data.matches.map((m, i) => ({ ...m, id: i })));
      setDetected(data.language);
      setLtAvailable(true);
      setStatus('ready');
    } catch (e) {
      if (e.name === 'AbortError' || id !== reqId.current) return;
      if (e.status === 503) setLtAvailable(false);
      setRawMatches([]);
      setStatus('error');
    }
  }, [text, language, enableStyle]);

  // Проверка в реальном времени с задержкой (debounce).
  useEffect(() => {
    const t = setTimeout(runCheck, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [runCheck]);

  // Видимые ошибки = все, кроме «пропущенных» пользователем.
  const matches = useMemo(
    () => rawMatches.filter((m) => !ignored.has(fingerprint(text, m))),
    [rawMatches, ignored, text]
  );

  // Подсчёт слов (последовательности непробельных символов) и символов.
  const wordCount = useMemo(() => (text.match(/\S+/g) || []).length, [text]);
  const headings = useMemo(() => extractHeadings(text), [text]);
  const pageCapacity = Math.max(700, Math.round((pageFormat === 'book' ? 2500 : 3300) * (17 / fontSize) ** 2));
  const pages = useMemo(() => splitPages(text, pageCapacity), [text, pageCapacity]);

  function uploadContentFont(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setContentFont({ name: file.name.replace(/\.[^.]+$/, ''), url: reader.result })
    reader.readAsDataURL(file)
  }

  // Принять исправление: заменить фрагмент и мгновенно сдвинуть остальные ошибки
  // (полная перепроверка придёт следом по debounce).
  const applyReplacement = useCallback((m, replacement) => {
    const delta = replacement.length - m.length;
    const cut = m.offset + m.length;
    setText((prev) => prev.slice(0, m.offset) + replacement + prev.slice(cut));
    setRawMatches((prev) =>
      prev
        .filter((x) => x.id !== m.id)
        .map((x) => (x.offset >= cut ? { ...x, offset: x.offset + delta } : x))
    );
  }, []);

  const ignoreMatch = useCallback(
    (m) => setIgnored((prev) => new Set(prev).add(fingerprint(text, m))),
    [text]
  );

  const addToDictionary = useCallback(
    async (m) => {
      const token = text.slice(m.offset, m.offset + m.length).trim();
      if (!token) return;
      try {
        setWords(await addWord(token));
        runCheck();
      } catch {
        /* ignore */
      }
    },
    [text, runCheck]
  );

  const handleAddWord = useCallback(
    async (w) => {
      try {
        setWords(await addWord(w));
        runCheck();
      } catch {
        /* ignore */
      }
    },
    [runCheck]
  );

  const handleRemoveWord = useCallback(
    async (w) => {
      try {
        setWords(await removeWord(w));
        runCheck();
      } catch {
        /* ignore */
      }
    },
    [runCheck]
  );

  return (
    <div className="app">
      <div className="spell-layout">
        <aside className="spell-sidebar">
          <Toolbar
            language={language} onLanguage={setLanguage}
            enableStyle={enableStyle} onToggleStyle={() => setEnableStyle((v) => !v)}
            status={status} ltAvailable={ltAvailable} count={matches.length}
            detected={detected} dictCount={words.length} onToggleDict={() => setShowDict((v) => !v)}
            wordCount={wordCount} charCount={text.length}
          />
          <section className="document-outline">
            <h3>Структура документа</h3>
            <div className="outline-actions">
              <button onClick={() => setText((value) => `${value.trimEnd()}\n\n# Новая глава\n`)}>+ Глава</button>
              <button onClick={() => setText((value) => `${value.trimEnd()}\n\n## Новый раздел\n`)}>+ Раздел</button>
            </div>
            {headings.length ? headings.map((heading, index) => (
              <button className={`outline-item level-${heading.level}`} key={`${heading.text}-${index}`}
                onClick={() => setNavigateOffset(heading.offset)}>{heading.text}</button>
            )) : <p>Добавьте строки «Глава…», «Раздел…» или заголовки через #.</p>}
          </section>
          <section className="document-outline text-tools">
            <h3>Образец текста</h3>
            <div className="outline-actions">
              <button onClick={() => setText(makeFish(language, 4))}>Рыба ×4</button>
              <button onClick={() => setText(makeFish(language, 10))}>Рыба ×10</button>
            </div>
            <label className="control-row">Кегль <output>{fontSize}px</output>
              <input type="range" min="8" max="96" value={fontSize} onChange={(e) => setFontSize(+e.target.value)} />
            </label>
            <label className="control-row">Формат
              <select value={pageFormat} onChange={(e) => setPageFormat(e.target.value)}>
                <option value="a4">A4</option><option value="book">Книга 145×215</option>
              </select>
            </label>
            <label className="font-upload">Заменить шрифт<input type="file" accept=".otf,.ttf,.woff,.woff2" onChange={(e) => uploadContentFont(e.target.files[0])} /></label>
            {contentFont && <button className="reset-font" onClick={() => setContentFont(null)}>Сбросить · {contentFont.name}</button>}
          </section>
          {showDict && <DictionaryPanel words={words} onAdd={handleAddWord}
            onRemove={handleRemoveWord} onClose={() => setShowDict(false)} />}
          <Legend matches={matches} />
        </aside>
        <main className="spell-main">
          {ltAvailable === false && <div className="banner banner--warn">LanguageTool недоступен. Проверьте интернет.</div>}
          {contentFont && <style>{`@font-face{font-family:'SpellContent';src:url(${contentFont.url});font-display:swap}`}</style>}
          <div className={`workspace paper-workspace format-${pageFormat}`}>
            <div className="paper-carousel" aria-label={`Страниц: ${pages.length}`}>
              {pages.map((page, index) => {
                const start = pages.slice(0, index).reduce((sum, item) => sum + item.length, 0)
                return <div className="paper-page" key={`${index}-${pages.length}`}>
                  <Editor text={page} matches={matches.filter((m) => m.offset >= start && m.offset < start + page.length).map((m) => ({ ...m, offset: m.offset - start }))}
                    onChange={(next) => setText(text.slice(0, start) + next + text.slice(start + page.length))}
                    navigateOffset={navigateOffset == null ? null : navigateOffset - start}
                    onApply={(m, rep) => applyReplacement({ ...m, offset: m.offset + start }, rep)} onIgnore={(m) => ignoreMatch({ ...m, offset: m.offset + start })}
                    onAddToDictionary={(m) => addToDictionary({ ...m, offset: m.offset + start })}
                    contentStyle={{ fontSize, fontFamily: contentFont ? "'SpellContent', var(--font)" : 'var(--font)' }} />
                </div>
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function extractHeadings(text) {
  let offset = 0
  return text.split('\n').map((line) => {
    const value = line.trim()
    const markdown = /^(#{1,6})\s+(.+)$/.exec(value)
    let result = null
    if (markdown) result = { level: markdown[1].length, text: markdown[2], offset }
    else if (/^глава\b/i.test(value)) result = { level: 1, text: value, offset }
    else if (/^раздел\b/i.test(value)) result = { level: 2, text: value, offset }
    offset += line.length + 1
    return result
  }).filter(Boolean)
}

function Legend({ matches }) {
  const items = [
    ['spelling', 'Орфография'],
    ['grammar', 'Грамматика'],
    ['punctuation', 'Пунктуация'],
    ['style', 'Стиль'],
  ];
  return (
    <div className="legend sidebar-legend">
      <h3>Исправления</h3>
      {items.map(([type, label]) => (
        <span key={type} className="legend__item">
          <span className={`legend__mark legend__mark--${type}`} />
          {label}
          <em>{matches.filter((match) => match.type === type).length}</em>
        </span>
      ))}
    </div>
  );
}
