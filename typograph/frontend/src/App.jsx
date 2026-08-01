import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fetchRules, correct } from './api.js'
import Toolbar from './components/Toolbar.jsx'
import { TYPE_META } from './typeMeta.js'

const SAMPLE =
  'Он сказал: "Это - лучший шрифт 1990-2000 годов", и я согласился.\n' +
  '- А что думает А. С. Иванов?\n' +
  'The label "New Type" by O\'Brien is a must-have - don\'t miss it.'

const LS_EXCEPTIONS = 'typograph.exceptions'
const LS_SETTINGS = 'typograph.settings'

export default function App() {
  const [mobilePane, setMobilePane] = useState('content')
  const [ruleTypes, setRuleTypes] = useState([])
  const [enabledTypes, setEnabledTypes] = useState(['quotes', 'dashes', 'nbsp'])
  const [enDashStyle, setEnDashStyle] = useState('us')
  const [defaultLang, setDefaultLang] = useState('auto')

  const [inputHtml, setInputHtml] = useState(textToHtml(SAMPLE))
  const input = useMemo(() => htmlToText(inputHtml), [inputHtml])
  const [resultHtml, setResultHtml] = useState('')
  const [edits, setEdits] = useState([])
  const [processed, setProcessed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const [exceptions, setExceptions] = useState('')

  // --- начальная загрузка: правила + сохранённые настройки/исключения ---
  useEffect(() => {
    fetchRules()
      .then((d) => {
        setRuleTypes(d.types)
        const saved = loadSettings()
        setEnabledTypes(saved?.enabledTypes || d.default_enabled)
      })
      .catch((e) => setError(e.message))

    const savedExc = localStorage.getItem(LS_EXCEPTIONS)
    if (savedExc != null) setExceptions(savedExc)
    const s = loadSettings()
    if (s) {
      if (s.enDashStyle) setEnDashStyle(s.enDashStyle)
      if (s.languageModeVersion === 2 && s.defaultLang) setDefaultLang(s.defaultLang)
    }
  }, [])

  // --- персист настроек и исключений ---
  useEffect(() => {
    localStorage.setItem(LS_EXCEPTIONS, exceptions)
  }, [exceptions])

  useEffect(() => {
    localStorage.setItem(
      LS_SETTINGS,
      JSON.stringify({ enabledTypes, enDashStyle, defaultLang, languageModeVersion: 2 }),
    )
  }, [enabledTypes, enDashStyle, defaultLang])

  const exceptionList = useMemo(
    () => exceptions.split('\n').map((s) => s.trim()).filter(Boolean),
    [exceptions],
  )

  // Подсчёт слов (последовательности непробельных символов) и символов.
  const wordCount = useMemo(() => (input.match(/\S+/g) || []).length, [input])

  async function handleCorrect() {
    setLoading(true)
    setError('')
    setCopied(false)
    try {
      const data = await correct({
        text: input,
        enabledTypes,
        enDashStyle,
        exceptions: exceptionList,
        defaultLang,
      })
      setResultHtml(toHtmlCode(applyEditsToHtml(inputHtml, data.edits)))
      setEdits(data.edits)
      setProcessed(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Откат одной правки: возвращаем original на место и сдвигаем остальные.
  function undoEdit(id) {
    const nextEdits = edits.filter((edit) => edit.id !== id)
    setEdits(nextEdits)
    setResultHtml(toHtmlCode(applyEditsToHtml(inputHtml, nextEdits)))
    setCopied(false)
  }

  function undoAll() {
    setResultHtml(toHtmlCode(inputHtml))
    setEdits([])
    setCopied(false)
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(resultHtml)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Не удалось скопировать в буфер обмена')
    }
  }

  function toggleType(id) {
    setEnabledTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  const counts = useMemo(() => {
    const c = {}
    edits.forEach((e) => {
      c[e.rule_type] = (c[e.rule_type] || 0) + 1
    })
    return c
  }, [edits])

  return (
    <div className="app">
      <nav className="mobile-pane-tabs"><button className={mobilePane === 'tools' ? 'on' : ''} onClick={() => setMobilePane('tools')}>Настройки</button><button className={mobilePane === 'content' ? 'on' : ''} onClick={() => setMobilePane('content')}>Текст</button></nav>
      <div className={`layout mobile-pane-${mobilePane}`}>
        <Toolbar
          ruleTypes={ruleTypes}
          enabledTypes={enabledTypes}
          onToggleType={toggleType}
          enDashStyle={enDashStyle}
          onEnDashStyle={setEnDashStyle}
          defaultLang={defaultLang}
          onDefaultLang={setDefaultLang}
          exceptions={exceptions}
          onExceptions={setExceptions}
          counts={counts}
        />

        <main className="panes">
          <section className="pane">
            <div className="pane-head">
              <h2>Исходный текст</h2>
            </div>
            <RichEditor html={inputHtml} onChange={setInputHtml} />
            <div className="actions">
              <button className="primary" onClick={handleCorrect} disabled={loading}>
                {loading ? 'Обработка…' : 'Исправить'}
              </button>
              <span className="chars">{wordCount} сл. · {input.length} симв.</span>
            </div>
          </section>

          <section className="pane">
            <div className="pane-head">
              <h2>
                Результат
                {processed && (
                  <span className="badge">{edits.length} правок</span>
                )}
              </h2>
              <div className="pane-head-actions">
                <button
                  className="ghost"
                  onClick={undoAll}
                  disabled={!edits.length}
                >
                  Отменить всё
                </button>
                <button
                  className="ghost"
                  onClick={copyResult}
                  disabled={!processed}
                >
                  {copied ? 'Скопировано ✓' : 'Скопировать'}
                </button>
              </div>
            </div>

            {error && <div className="error">{error}</div>}

            {!processed ? (
              <div className="preview placeholder">
                Нажмите «Исправить» — здесь появится текст с подсветкой правок.
                Клик по подсвеченному участку отменяет отдельную правку.
              </div>
            ) : (
              <HighlightedCode code={resultHtml} edits={edits} onUndo={undoEdit} />
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

function RichEditor({ html, onChange }) {
  const ref = useRef(null)
  const selectionRef = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html
  }, [html])
  const format = (command) => {
    ref.current?.focus()
    document.execCommand('styleWithCSS', false, true)
    document.execCommand(command, false)
    onChange(normalizeRichHtml(ref.current?.innerHTML || ''))
  }
  const formatColor = (command, value) => {
    ref.current?.focus()
    const selection = window.getSelection()
    if (selectionRef.current && selection) {
      selection.removeAllRanges()
      selection.addRange(selectionRef.current)
    }
    document.execCommand('styleWithCSS', false, true)
    document.execCommand(command, false, value)
    onChange(normalizeRichHtml(ref.current?.innerHTML || ''))
  }
  const rememberSelection = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount && ref.current?.contains(selection.anchorNode)) {
      selectionRef.current = selection.getRangeAt(0).cloneRange()
    }
  }
  return <div className="rich-editor-wrap">
    <div className="rich-toolbar">
      <button onClick={() => format('bold')}><b>B</b></button>
      <button onClick={() => format('italic')}><i>I</i></button>
      <button onClick={() => format('underline')}><u>U</u></button>
      <button onClick={() => format('strikeThrough')}><s>S</s></button>
      <label className="rich-color rich-color--text" title="Цвет текста" onPointerDown={rememberSelection}><span>A</span><input aria-label="Цвет текста" type="color" defaultValue="#3d3650" onInput={(event) => formatColor('foreColor', event.target.value)} /></label>
      <label className="rich-color rich-color--fill" title="Цвет выделения" onPointerDown={rememberSelection}><span aria-hidden="true">◇</span><input aria-label="Цвет выделения" type="color" defaultValue="#e8ddff" onInput={(event) => formatColor('hiliteColor', event.target.value)} /></label>
    </div>
    <div ref={ref} className="editor rich-editor" contentEditable suppressContentEditableWarning
      spellCheck={false} data-placeholder="Вставьте текст…"
      onInput={(event) => onChange(event.currentTarget.innerHTML)} onKeyUp={rememberSelection} onMouseUp={rememberSelection} />
  </div>
}

function HighlightedCode({ code, edits, onUndo }) {
  const segments = useMemo(() => {
    if (!edits.length) return [{ text: code }]
    const remaining = [...edits].sort((a, b) => a.osrc_start - b.osrc_start)
    const output = []
    let cursor = 0
    remaining.forEach((edit) => {
      const needle = toHtmlCode(edit.new)
      const at = needle ? code.indexOf(needle, cursor) : -1
      if (at < 0) return
      if (at > cursor) output.push({ text: code.slice(cursor, at) })
      output.push({ text: code.slice(at, at + needle.length), edit })
      cursor = at + needle.length
    })
    if (cursor < code.length) output.push({ text: code.slice(cursor) })
    return output.length ? output : [{ text: code }]
  }, [code, edits])

  return <pre className="preview html-code"><code>{segments.map((segment, index) => segment.edit ? (
    <mark key={segment.edit.id} className={`code-mark ${TYPE_META[segment.edit.rule_type]?.cls || ''}`}
      title={`${segment.edit.message}\nКлик — отменить`} onClick={() => onUndo(segment.edit.id)}>{segment.text}</mark>
  ) : <React.Fragment key={index}>{segment.text}</React.Fragment>)}</code></pre>
}

function textToHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  return flattenRichText(doc.body.firstElementChild).text
}

function applyEditsToHtml(html, edits) {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.querySelector('#root')
  const domEdits = edits.flatMap((edit) => splitWrapperEdit(edit))
  // Идём справа налево, чтобы исходные координаты не сдвигались. Range умеет
  // заменить фрагмент даже если он пересекает несколько inline-тегов.
  for (const edit of [...domEdits].sort((a, b) => b.osrc_start - a.osrc_start)) {
    const nodes = flattenRichText(root).nodes
    const startEntry = nodes.find((entry) => edit.osrc_start >= entry.start && edit.osrc_start <= entry.end)
    const endEntry = [...nodes].reverse().find((entry) => edit.osrc_end >= entry.start && edit.osrc_end <= entry.end)
    if (!startEntry || !endEntry) continue
    const range = doc.createRange()
    range.setStart(startEntry.node, Math.max(0, edit.osrc_start - startEntry.start))
    range.setEnd(endEntry.node, Math.max(0, edit.osrc_end - endEntry.start))
    range.deleteContents()
    range.insertNode(doc.createTextNode(edit.new))
  }
  return normalizeRichHtml(root.innerHTML)
}

// Кавычки и похожие правила меняют только оболочку фрагмента. Разделяем такую
// правку на левую и правую границы: цветные/жирные span внутри остаются живы,
// а вложенное тире или неразрывный пробел не затираются внешней заменой.
function splitWrapperEdit(edit) {
  const original = edit.original || ''
  const next = edit.new || ''
  if (original.length >= 2 && next.length >= 2 && original.slice(1, -1) === next.slice(1, -1)) {
    return [
      { ...edit, osrc_end: edit.osrc_start + 1, new: next[0] },
      { ...edit, osrc_start: edit.osrc_end - 1, new: next[next.length - 1] },
    ]
  }
  return [edit]
}

function normalizeRichHtml(html) {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.querySelector('#root')
  root.querySelectorAll('font').forEach((font) => {
    const span = doc.createElement('span')
    if (font.getAttribute('color')) span.style.color = font.getAttribute('color')
    span.innerHTML = font.innerHTML
    font.replaceWith(span)
  })
  // contentEditable любит добавлять служебные div при Enter/вставке. В итоговом
  // коде они не нужны: сохраняем только реальные inline-стили и переносы.
  root.querySelectorAll('div, p').forEach((block) => {
    if (block.previousSibling && block.previousSibling.nodeName !== 'BR') {
      block.before(doc.createElement('br'))
    }
    block.replaceWith(...block.childNodes)
  })
  root.querySelectorAll('span').forEach((span) => {
    if (!span.getAttribute('style')?.trim()) span.replaceWith(...span.childNodes)
  })
  while (root.lastChild?.nodeName === 'BR') root.lastChild.remove()
  return root.innerHTML
}

function flattenRichText(root) {
  let text = ''; const nodes = []
  const blocks = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
  function walk(element) {
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const start = text.length; text += child.data
        nodes.push({ node: child, start, end: text.length })
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') text += '\n'
        else {
          if (blocks.has(child.tagName) && text && !text.endsWith('\n')) text += '\n'
          walk(child)
        }
      }
    }
  }
  walk(root)
  return { text, nodes }
}

function toHtmlCode(html) { return html.replace(/\u00a0/g, '&nbsp;') }
function escapeHtml(value) { return value.replace(/[&<>]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' })[char]) }

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null')
  } catch {
    return null
  }
}
