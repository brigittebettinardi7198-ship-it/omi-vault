export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = n => (n == null || n === '' || isNaN(n)) ? '' : Math.round(+n).toLocaleString();
export const money = n => (n == null || n === '' || isNaN(n)) ? '' : '$' + Math.round(+n).toLocaleString();
export const kmoney = n => n == null || n === '' ? '' : '$' + (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : Math.round(n / 1000) + 'K');
export const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const today = () => new Date().toLocaleDateString('en-CA');
export const addDays = (d, n) => { const x = d ? new Date(d + 'T12:00:00') : new Date(); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
export const addMonths = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setMonth(x.getMonth() + n); return x.toLocaleDateString('en-CA'); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
export const dt = ts => ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
export const d8 = d => d ? new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
export const normName = n => String(n || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(THE|C O|ATTN|TAX DEPT|LLC|L L C|INC|CORP|CO|LP|LTD)\b/g, ' ').replace(/\s+/g, ' ').trim();
export const normAddr = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|BOULEVARD|BLVD|LANE|LN|COURT|CT|PLACE|PL|PKWY|PARKWAY|SUITE|STE|UNIT|FL|FLOOR)\b/g, ' ').replace(/\s+/g, ' ').trim();
export function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

// Confidence labels: facts vs assumptions
export const CONF = {
  public: { label: 'Public record', cls: 'c-pub', tip: 'From a county public-record file. Factual as filed, may be outdated.' },
  confirmed: { label: 'Confirmed', cls: 'c-ok', tip: 'Verified directly (owner, tenant, document).' },
  likely: { label: 'Likely', cls: 'c-likely', tip: 'Strong indication, not verified.' },
  estimated: { label: 'Estimated', cls: 'c-est', tip: 'Calculated or estimated, not a recorded fact.' },
  unverified: { label: 'Unverified', cls: 'c-unv', tip: 'Heard or imported, not checked.' },
  broker: { label: 'Broker intel', cls: 'c-broker', tip: 'Broker knowledge or market intelligence.' },
  inferred: { label: 'Inferred', cls: 'c-inf', tip: 'Computed by this app from patterns (e.g. name matching). An assumption.' },
  unknown: { label: 'Unknown', cls: 'c-unk', tip: 'Not known.' },
};
export const CONF_OPTS = ['confirmed', 'likely', 'estimated', 'unverified', 'broker', 'unknown'];
export const badge = c => c && CONF[c] ? `<span class="conf ${CONF[c].cls}" title="${esc(CONF[c].tip)}">${CONF[c].label}</span>` : '';

export function toCSV(rows, cols) {
  cols = cols || [...new Set(rows.flatMap(r => Object.keys(r)))];
  const q = v => { if (v == null) v = ''; if (typeof v === 'object') v = JSON.stringify(v); v = String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.join(',')].concat(rows.map(r => cols.map(c => q(r[c])).join(','))).join('\n');
}
export function download(name, text, type = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function toast(msg) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show'; clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 2200);
}
export function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[data-src="${src}"]`)) return res(); const s = document.createElement('script'); s.dataset.src = src; s.src = (window.__omiBlob && window.__omiBlob[src]) || src; /* encrypted build serves vendor files from memory */ s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
// One score color scale used everywhere (badges, map dots, legend)
export const SCORE_BANDS = [
  { min: 70, cls: 'sc-hi', color: '#c93c37', name: 'Red', range: '70–100', label: 'Hottest: call first' },
  { min: 50, cls: 'sc-md', color: '#d9861a', name: 'Orange', range: '50–69', label: 'Solid lead' },
  { min: 30, cls: 'sc-lo', color: '#2f6fd8', name: 'Blue', range: '30–49', label: 'Weaker signals: watch' },
  { min: -1, cls: 'sc-no', color: '#7a8495', name: 'Gray', range: 'under 30', label: 'Few signals' },
];
export const scoreBand = s => SCORE_BANDS.find(b => (+s || 0) >= b.min);
export const scoreColor = s => scoreBand(s).color;
export const scoreCls = s => scoreBand(s).cls;
export const scorePill = s => `<span class="sc ${scoreCls(s)}"><i style="background:${scoreColor(s)}"></i>${s ?? "–"}</span>`;
