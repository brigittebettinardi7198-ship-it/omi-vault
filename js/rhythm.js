// Section 7: morning brief (7.1, in-app, before noon) and Friday win summary (7.2, Share sheet; nothing auto-sent).
import { $, esc, kmoney, today, addDays, toast } from './util.js';
import { S, val, setting } from './store.js';
import { deal } from './scoring.js';
import { nc } from './extras.js';
import { takeHomeValue, takeHome, PROB, gross, chip } from './money.js';
import { callBtn, resiCallBtn } from './reach.js';
// 7.1: 3 most valuable calls from today's list (commercial rows + residential cards), by est. take-home
export function briefHTML(rows, resi, reason) { if (new Date().getHours() >= 12) return '';
  const L = [...rows.map(c => ({ v: deal(c.p).check ? 0 : takeHomeValue(deal(c.p).value || 0), raw: deal(c.p).value, h: `<div class="pc-top"><div class="pc-who"><b>${esc(nc(c.o.name))}</b><span class="xs">${esc(nc(val(c.p, 'address') || ''))} · ${esc(reason(c))}</span></div>${callBtn(c.o, c.p)}</div>` })),
    ...resi.map(x => ({ v: x.th || 0, h: `<div class="pc-top"><div class="pc-who"><b>${esc(nc(x.p.own || 'Owner'))}</b><span class="xs">${esc(nc(x.p.a))} · ${esc(x.R.slice(0, 2).join(' · '))}</span></div>${resiCallBtn(x)}</div>` }))]
    .sort((a, b) => b.v - a.v).slice(0, 3); if (!L.length) return '';
  return `<section class="card" id="brief" style="background:#eff6ff;border-color:#2563eb;padding:12px;margin:8px 0"><b>Morning brief: your 3 most valuable calls</b><div class="xs muted">Shown until noon. Ranked by est. take-home.</div>${L.map(x => `<div class="pcall" style="margin:6px 0">${x.h}${x.v ? `<span class="tag" style="background:#dcfce7;color:#166534">≈ ${kmoney(x.v)} to you (est.)</span>` : ''}</div>`).join('')}</section>`; }
// 7.2: week = Monday to today
export function weekStats() { const t = today(), mon = addDays(t, -((new Date().getDay() + 6) % 7)), O = setting('outc', {}) || {}; let dials = 0, mtg = 0;
  for (const k in O) for (const e of O[k]) if (e.d >= mon) { dials++; if (e.o === 'mtg') mtg++; }
  const D = setting('deals', []) || [], moved = D.filter(d => (d.moved && d.moved >= mon) || (d.created && d.created >= mon)).length;
  const pipe = D.filter(d => d.stage !== 'Closed').reduce((a, d) => a + takeHome(gross(d)) * (PROB[d.stage] || 0), 0);
  return { mon, dials, mtg, moved, pipe }; }
export function winText() { const w = weekStats(); return `This week: ${w.dials} dials, ${w.mtg} meeting${w.mtg === 1 ? '' : 's'} set, ${w.moved} deal${w.moved === 1 ? '' : 's'} moved, ${kmoney(w.pipe) || '$0'} weighted pipeline (my est. take-home).`; }
export function winHTML(force = false) { const d = new Date().getDay(); if (!force && d !== 5 && d !== 6) return '';
  return `<section class="card" id="win" style="background:#f0fdf4;border-color:#16a34a;padding:12px;margin:8px 0"><b>Friday win summary</b><p id="wintxt" style="margin:6px 0">${esc(winText())}</p><button class="btn primary" id="winshare" style="min-height:44px">Share</button> <span class="xs muted">Opens your share sheet. Nothing is sent until you pick who.</span></section>`; }
export function bindWin(root) { const b = $('#winshare', root); if (!b) return; b.onclick = async () => { const text = winText();
  if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} } else if (navigator.clipboard) { await navigator.clipboard.writeText(text); toast('Copied'); } }; }
