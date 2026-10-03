// Drive-by mode ("Near me"): closest high-score properties to where you are, sorted by distance.
// Location comes from the browser's geolocation on this device and is used only in memory for this page. It is never saved or sent anywhere.
// A typed address / street / city / ZIP is matched locally against the parcel data (no outside geocoder), so that never leaves the device either.
import { $, $$, esc, fmt, kmoney, scorePill } from './util.js';
import { S, val } from './store.js';
import { scoreOf, deal } from './scoring.js';
import { nc, TYPE4, isType, officeProps, loadOffice } from './extras.js';
import { favIds, favBtn } from './favs.js';

const R = 3958.8, rad = d => d * Math.PI / 180;
export const miles = (a, b, c, d) => { const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };
const st = { c: null, label: '', min: 50, rad: 5, pt: '' }; // in memory only
const norm = s => String(s || '').toUpperCase().replace(/[.,#]/g, ' ').replace(/\b(STREET)\b/g, 'ST').replace(/\b(AVENUE)\b/g, 'AVE').replace(/\b(ROAD)\b/g, 'RD').replace(/\b(DRIVE)\b/g, 'DR').replace(/\b(BOULEVARD)\b/g, 'BLVD').replace(/\b(NORTH)\b/g, 'N').replace(/\b(SOUTH)\b/g, 'S').replace(/\b(EAST)\b/g, 'E').replace(/\b(WEST)\b/g, 'W').replace(/\s+/g, ' ').trim();
const has = p => p.lat && p.lon && Math.abs(p.lat) > 1;
const centroid = L => L.length ? { lat: L.reduce((a, p) => a + p.lat, 0) / L.length, lon: L.reduce((a, p) => a + p.lon, 0) / L.length } : null;
// Local "geocoder": lat,lon · exact address · ZIP · street (+ city) · city
export function centerFor(q) {
  const t = String(q || '').trim(); if (!t) return null;
  const ll = t.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/); if (ll) return { lat: +ll[1], lon: +ll[2], label: t, how: 'coordinates' };
  const P = S.props.filter(has), n = norm(t);
  const zip = n.match(/\b(6\d{4})\b/);
  const parts = n.split(/\s+(?=[A-Z])/); let street = n, city = '';
  for (const p of P) { const c = norm(val(p, 'city')); if (c && c.length > 3 && n.endsWith(' ' + c)) { city = c; street = n.slice(0, -c.length).trim(); break; } }
  const addrHits = P.filter(p => { const a = norm(val(p, 'address')); return a && (a === street || a.startsWith(street + ' ')) && (!city || norm(val(p, 'city')) === city); });
  if (addrHits.length && /^\d/.test(street)) { const c = centroid(addrHits.slice(0, 5)); return { ...c, label: nc(val(addrHits[0], 'address')) + (val(addrHits[0], 'city') ? ', ' + nc(val(addrHits[0], 'city')) : ''), how: 'matched parcel address' }; }
  if (zip) { const L = P.filter(p => String(val(p, 'zip') || '').startsWith(zip[1])); if (L.length) return { ...centroid(L), label: 'ZIP ' + zip[1], how: `center of ${L.length} parcels in the ZIP` }; }
  const st2 = street.replace(/^\d+\s+/, '');
  if (st2.length >= 4) { const L = P.filter(p => { const a = norm(val(p, 'address')).replace(/^\d+[A-Z]?\s+/, ''); return a.includes(st2) && (!city || norm(val(p, 'city')) === city); });
    if (L.length) { // nearest house number on that street if a number was typed
      const num = +(street.match(/^(\d+)/) || [])[1]; let pick = L;
      if (num) { const w = L.map(p => [p, Math.abs((+(String(val(p, 'address')).match(/^(\d+)/) || [])[1] || 1e9) - num)]).sort((a, b) => a[1] - b[1]); pick = w.slice(0, 3).map(x => x[0]); }
      return { ...centroid(pick), label: nc(t), how: num ? 'nearest numbered parcel on that street' : `center of ${L.length} parcels on that street` }; } }
  const cityOnly = P.filter(p => norm(val(p, 'city')) === n || norm(val(p, 'municipality')) === n);
  if (cityOnly.length) return { ...centroid(cityOnly), label: nc(t), how: `center of ${cityOnly.length} parcels in that town` };
  return null;
}
export function nearList(c, min = 50, radius = 5, k = 40, pt = '') {
  const dLat = radius / 69, dLon = radius / (69 * Math.cos(rad(c.lat))), out = [];
  for (const p of (pt === 'office' ? officeProps() : S.props)) {
    if (!has(p) || Math.abs(p.lat - c.lat) > dLat || Math.abs(p.lon - c.lon) > dLon) continue;
    const d = miles(c.lat, c.lon, p.lat, p.lon); if (d > radius) continue;
    if (pt && !isType(p, pt)) continue;
    const s = scoreOf(p).score; if (min && !(s >= min)) continue;
    out.push({ p, d, s });
  }
  return out.sort((a, b) => a.d - b.d || b.s - a.s).slice(0, k);
}
const card = ({ p, d, s }) => { const dl = deal(p), o = p.ownerId && S.owners.get(p.ownerId);
  return `<div class="nm-card"><div class="nm-top"><a class="nm-a" href="#/property/${p.id}">${esc(nc(val(p, 'address') || p.id))}</a>${d == null ? favBtn(p.id) : `<span class="nm-d">${d < .1 ? Math.round(d * 5280) + ' ft' : d.toFixed(1) + ' mi'}</span>`}</div>
    <div class="nm-m">${scorePill(s)}<span>${dl.sf ? fmt(dl.sf) + ' SF' : dl.acres ? dl.acres.toFixed(1) + ' ac' : 'size –'}</span><span>${dl.value ? kmoney(dl.value) : 'value –'}</span><span class="muted">${esc(nc(val(p, 'city') || ''))}</span></div>
    <div class="nm-o muted">${esc(nc(o ? o.name : val(p, 'taxpayer') || 'Owner unknown'))}</div>
    <div class="nm-b">${o ? `<a class="btn primary" href="#/prospect/${o.id}">Call</a>` : `<a class="btn" href="#/property/${p.id}">Open</a>`}<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lon.toFixed(6)}">Directions</a></div></div>`; };
export function nearView(el) {
  el.innerHTML = `<div class="page nearpg"><div class="ph"><div><div class="crumb"><a href="#/properties">Properties</a></div><h1>Near me</h1><div class="muted">Closest high-score properties, nearest first. Your location stays on this device: it is used only on this page and never saved or sent.</div></div></div>
    <div class="nm-ctl card"><div class="nm-row"><button class="btn primary" id="nmloc">Use my location</button><form id="nmf" class="nm-f"><input id="nmq" type="search" placeholder="or type an address, street, town or ZIP" autocomplete="off" aria-label="Center address"><button class="btn">Go</button></form></div>
    <div class="nm-row"><div class="seg" role="group" aria-label="Minimum score">${[[0, 'All'], [50, '50+'], [70, '70+']].map(([v, l]) => `<button data-min="${v}" class="${st.min === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Radius">${[2, 5, 10, 25].map(v => `<button data-rad="${v}" class="${st.rad === v ? 'on' : ''}">${v} mi</button>`).join('')}</div></div>
    <select id="nmpt" class="nm-pt" aria-label="Property type"><option value="">All property types</option>${TYPE4.map(([k, l]) => `<option value="${k}" ${st.pt === k ? 'selected' : ''}>${l}</option>`).join('')}</select><div id="nmc" class="xs muted"></div></div><div id="nml" class="nm-list"></div></div>`;
  const draw = () => { if (!st.c) { $('#nmc').textContent = 'Pick a center: your location or a typed address.'; $('#nml').innerHTML = ''; return; }
    const L = nearList(st.c, st.min, st.rad, 40, st.pt); $('#nmc').innerHTML = `Center: ${esc(st.label)} · ${L.length}${L.length === 40 ? '+' : ''} properties within ${st.rad} mi${st.min ? `, score ${st.min}+` : ''}`;
    $('#nml').innerHTML = L.length ? L.map(card).join('') : `<div class="empty muted">Nothing within ${st.rad} mi at this score. Try a bigger radius or "All".</div>`; };
  $('#nmloc').onclick = () => { if (!navigator.geolocation) { $('#nmc').textContent = 'This browser has no location access. Type an address instead.'; return; }
    $('#nmc').textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(pos => { st.c = { lat: pos.coords.latitude, lon: pos.coords.longitude }; st.label = `your location (±${Math.round(pos.coords.accuracy || 0)} m)`; draw(); },
      e => { $('#nmc').textContent = (e.code === 1 ? 'Location permission was denied.' : 'Could not get your location.') + ' Type an address instead.'; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }); };
  $('#nmf').onsubmit = e => { e.preventDefault(); const c = centerFor($('#nmq').value); if (!c) { $('#nmc').textContent = 'No parcel, street, town or ZIP in the data matches that. Try another spelling.'; return; } st.c = c; st.label = `${c.label} (${c.how})`; draw(); };
  $$('[data-min]', el).forEach(b => b.onclick = () => { st.min = +b.dataset.min; $$('[data-min]', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $$('[data-rad]', el).forEach(b => b.onclick = () => { st.rad = +b.dataset.rad; $$('[data-rad]', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#nmpt').onchange = async e => { st.pt = e.target.value; if (st.pt === 'office') await loadOffice(); draw(); };
  draw();
}

// Favorites tab: starred properties (saved on this device; tap ★ again to remove)
export function favView(el) {
  const L = favIds().map(id => S.prop.get(id)).filter(Boolean).map(p => ({ p, d: null, s: scoreOf(p).score }));
  el.innerHTML = `<div class="page favpg"><div class="ph"><div><h1>★ Favorites</h1><div class="muted">${L.length} starred propert${L.length === 1 ? 'y' : 'ies'}, saved on this device (included in backup). Tap ★ to remove.</div></div></div>
    ${L.length ? `<div class="nm-list">${L.map(card).join('')}</div>` : '<div class="empty muted">No favorites yet. Tap ☆ on any property, list row, map popup or Prospect card.</div>'}</div>`;
}
