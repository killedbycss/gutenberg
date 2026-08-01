import React, { useEffect, useMemo, useRef, useState } from 'react'
import Dropzone from './components/Dropzone.jsx'
import FormatPicker from './components/FormatPicker.jsx'
import FontCard from './components/FontCard.jsx'
import ResultBanner from './components/ResultBanner.jsx'
import CompressionPanel from './components/CompressionPanel.jsx'
import { fetchFormats, analyzeFonts, convertFonts, downloadBlob } from './api.js'

export default function App() {
  const [formats, setFormats] = useState(null)
  const [items, setItems] = useState([]) // [{ id, file, report|null }]
  const [selected, setSelected] = useState(new Set())
  const [preset, setPreset] = useState('basic')
  const [busy, setBusy] = useState(false)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [conversionOptions, setConversionOptions] = useState({ quality: 90, width: '', height: '' })
  const idRef = useRef(0)

  // Загрузка метаданных форматов + разумные форматы по умолчанию.
  useEffect(() => {
    fetchFormats()
      .then((f) => {
        setFormats(f)
        const def = new Set(['woff2', 'woff'].filter((k) =>
          k === 'woff2' ? f.woff2 : true))
        setSelected(def)
      })
      .catch((e) => setError(e.message))
  }, [])

  const files = useMemo(() => items.map((i) => i.file), [items])
  const fileKinds = useMemo(
    () => new Set(items.map((i) => i.report?.kind).filter(Boolean)),
    [items],
  )

  async function addFiles(newFiles) {
    setError(null)
    setResult(null)
    const entries = newFiles.map((file) => ({ id: ++idRef.current, file, report: null }))
    setItems((prev) => [...prev, ...entries])
    setBusy(true)
    try {
      const { reports } = await analyzeFonts(newFiles, preset)
      if (reports.some((report) => report.ok && report.kind === 'image')) {
        setSelected((prev) => new Set([...prev, 'ico', 'jpg', 'webp']))
      }
      if (reports.some((report) => report.ok && report.kind === 'media')) {
        setSelected((prev) => new Set([...prev, 'mp4', 'webm-video', 'gif-video']))
      }
      setItems((prev) => {
        const next = [...prev]
        entries.forEach((entry, i) => {
          const idx = next.findIndex((n) => n.id === entry.id)
          if (idx !== -1) next[idx] = { ...next[idx], report: reports[i] }
        })
        return next
      })
    } catch (e) {
      setError(e.message)
      // Убираем «повисшие» записи без отчёта.
      setItems((prev) => prev.filter((n) => !entries.some((e2) => e2.id === n.id)))
    } finally {
      setBusy(false)
    }
  }

  async function reanalyzeAll(nextPreset) {
    if (items.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const { reports } = await analyzeFonts(items.map((i) => i.file), nextPreset)
      setItems((prev) => prev.map((n, i) => ({ ...n, report: reports[i] })))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function onPreset(p) {
    if (p === preset) return
    setPreset(p)
    reanalyzeAll(p)
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((n) => n.id !== id))
    setResult(null)
  }

  function clearAll() {
    setItems([])
    setResult(null)
    setError(null)
  }

  function toggleTarget(key) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function onConvert() {
    if (files.length === 0 || selected.size === 0) return
    setConverting(true)
    setError(null)
    setResult(null)
    try {
      const targets = formats.targets
        .filter((t) => selected.has(t.key) && (fileKinds.size === 0 || fileKinds.has(t.kind)))
        .map((t) => t.key)
      const res = await convertFonts(files, targets, preset, conversionOptions)
      downloadBlob(res.blob, res.filename)
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="app">
      {formats && !formats.woff2 && (
        <div className="health-warn module-warning">WOFF2 недоступен: нет brotli на сервере</div>
      )}

      {error && <div className="banner banner-err">{error}</div>}

      <div className="layout">
        {formats ? (
          <FormatPicker
            targets={formats.targets}
            selected={selected}
            onToggle={toggleTarget}
            preset={preset}
            onPreset={onPreset}
            woff2={formats.woff2}
            hasFonts={items.some((item) => item.report?.kind === 'font')}
            fileKinds={fileKinds}
            fileCount={files.length}
            converting={converting}
            onConvert={onConvert}
          />
        ) : (
          <aside className="toolbar"><div className="skeleton-line" /></aside>
        )}

        <main className="main">
          <Dropzone onFiles={addFiles} disabled={busy || converting} />

          <CompressionPanel items={items} options={conversionOptions}
            onChange={(patch) => { setConversionOptions((value) => ({ ...value, ...patch })); setResult(null) }} result={result} />

          {result && (
            <ResultBanner
              result={result}
              onDownload={() => downloadBlob(result.blob, result.filename)}
              onDismiss={() => setResult(null)}
            />
          )}

          {items.length > 0 && (
            <div className="cards-head">
              <span>{items.length} файл(ов){busy ? ' · анализирую…' : ''}</span>
              <button className="link-btn" onClick={clearAll}>Очистить всё</button>
            </div>
          )}

          <div className="cards">
            {items.map((it) =>
              it.report ? (
                <FontCard key={it.id} report={it.report} file={it.file} onRemove={() => removeItem(it.id)} />
              ) : (
                <div className="card font-card loading" key={it.id}>
                  <div className="card-top">
                    <div className="file-name"><strong>{it.file.name}</strong></div>
                  </div>
                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />
                </div>
              )
            )}
          </div>

        </main>
      </div>
    </div>
  )
}
