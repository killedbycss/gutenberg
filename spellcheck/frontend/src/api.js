const API_BASE = import.meta.env.VITE_API_BASE || '';
const BROWSER_ONLY = import.meta.env.VITE_BROWSER_ONLY === '1';
const LT_URL = 'https://api.languagetool.org/v2/check';
const DICT_KEY = 'gutenberg.browserDictionary';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const words = () => { try { return JSON.parse(localStorage.getItem(DICT_KEY) || '[]') } catch { return [] } };
const saveWords = (items) => { localStorage.setItem(DICT_KEY, JSON.stringify(items)); return items };
const classify = (match) => {
  const category = match.rule?.category?.id || '';
  const issue = match.rule?.issueType || '';
  if (['TYPOS', 'CASING'].includes(category) || issue === 'misspelling') return 'spelling';
  if (['PUNCTUATION', 'TYPOGRAPHY'].includes(category) || ['typographical', 'whitespace'].includes(issue)) return 'punctuation';
  if (['STYLE', 'REDUNDANCY', 'PLAIN_ENGLISH', 'COLLOQUIALISMS'].includes(category) || issue === 'style') return 'style';
  return 'grammar';
};

export async function checkText(payload, signal) {
  if (!BROWSER_ONLY) {
    const res = await fetch(`${API_BASE}/api/check`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload), signal });
    if (!res.ok) { const err = new Error('check_failed'); err.status = res.status; throw err }
    return res.json();
  }
  const body = new URLSearchParams({ text: payload.text, language: payload.language || 'auto' });
  const res = await fetch(LT_URL, { method: 'POST', body, signal });
  if (!res.ok) { const err = new Error('languagetool_unavailable'); err.status = 503; throw err }
  const data = await res.json();
  const allow = new Set(words().map((word) => word.toLowerCase()));
  const matches = data.matches.map((match) => ({ offset: match.offset, length: match.length, message: match.message,
    shortMessage: match.shortMessage, replacements: (match.replacements || []).slice(0, 8).map((item) => item.value),
    type: classify(match), rule: { id: match.rule?.id, category: match.rule?.category?.name }, context: match.context }))
    .filter((match) => match.type !== 'style' || payload.enableStyle)
    .filter((match) => match.type !== 'spelling' || !allow.has(payload.text.slice(match.offset, match.offset + match.length).trim().toLowerCase()));
  return { matches, language: data.language?.name || data.language?.code || null };
}

export async function getHealth() {
  if (BROWSER_ONLY) return { status: 'ok', languagetool: navigator.onLine, ltUrl: LT_URL };
  return (await fetch(`${API_BASE}/api/health`)).json();
}
export async function getDictionary() { if (BROWSER_ONLY) return words(); return (await (await fetch(`${API_BASE}/api/dictionary`)).json()).words || [] }
export async function addWord(word) { if (BROWSER_ONLY) return saveWords([...new Set([...words(), word.trim()])].filter(Boolean).sort()); const d = await (await fetch(`${API_BASE}/api/dictionary`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ word }) })).json(); return d.words || [] }
export async function removeWord(word) { if (BROWSER_ONLY) return saveWords(words().filter((item) => item !== word)); const d = await (await fetch(`${API_BASE}/api/dictionary/${encodeURIComponent(word)}`, { method: 'DELETE' })).json(); return d.words || [] }
