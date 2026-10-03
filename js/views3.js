// Comps, listings, flyers. Public-record sales are computed from county data; everything else is entered by you.
import { $, $$, esc, fmt, kmoney, money, today, uid, toast, download, toCSV, badge } from './util.js';
import { S, save, remove, val, setting } from './store.js';
import { table, modal } from './ui.js';
import { saleComps, leaseComps, listings, median, parseFlyer, SRC_PUB, SRC_YOU } from './comps.js';
import { MARKET } from './markets.js';
const srcTag = c => c.src === 'public' ? SRC_PUB : SRC_YOU;
const psf = v => v ? '$' + v.toFixed(v < 10 ? 2 : 0) : '–';
const findProp = (addr, city) => { const a = String(addr || '').toUpperCase().trim(); if (!a) return null; return S.props.find(p => (val(p, 'address') || '').toUpperCase() === a && (!city || (val(p, 'city') || '').toUpperCase() === String(city).toUpperCase())) || S.props.find(p => (val(p, 'address') || '').toUpperCase() === a) || null; };
const CF = {
  sale: [['date', 'Sale date', 'date'], ['address', 'Address'], ['city', 'City'], ['price', 'Price ($)', 'number'], ['sf', 'Building SF', 'number'], ['acres', 'Land (acres)', 'number'], ['buyer', 'Buyer'], ['seller', 'Seller'], ['notes', 'Source / notes']],
  lease: [['date', 'Lease start / signed', 'date'], ['address', 'Address'], ['city', 'City'], ['tenant', 'Tenant'], ['sf', 'Leased SF', 'number'], ['rate', 'Rent ($/SF/yr)', 'number'], ['rateType', 'Rent type (NNN / Gross / MG)'], ['termMonths', 'Term (months)', 'number'], ['notes', 'Source / notes']],
  listing: [['date', 'Date checked', 'date'], ['address', 'Address'], ['city', 'City'], ['status', 'Status'], ['askingPrice', 'Asking price ($)', 'number'], ['askingRent', 'Asking rent ($/SF/yr)', 'number'], ['sf', 'Available SF', 'number'], ['listingBroker', 'Listing broker / firm'], ['url', 'Link (flyer or listing page)', 'url'], ['notes', 'Notes']],
};
const LSTAT = ['Listed for sale', 'Listed for lease', 'Under contract', 'Recently sold', 'Off-market'];
export function compForm(kind, init = {}, done = () => {}) {
  const c = { id: uid('cm'), kind, src: 'broker', date: today(), ...init };
  modal(`<div class="ch"><h2>${{ sale: 'Sale comp', lease: 'Lease comp', listing: 'Listing' }[kind]} ${SRC_YOU}</h2><button class="x" data-close>✕</button></div>
    <form id="cmf" class="fgrid2">${CF[kind].map(([k, l, t]) => k === 'status' ? `<label>${l}<select name="status">${LSTAT.map(s => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>` : `<label class="${k === 'notes' ? 'full' : ''}">${l}<input name="${k}" type="${t || 'text'}" ${t === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(c[k] ?? '')}"></label>`).join('')}</form>
    <div class="mfoot">${init.id && S.comps.has(init.id) ? '<button class="btn ghost" id="cmdel">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" id="cmsv">Save</button></div>`, (m, close) => {
    $('#cmsv', m).onclick = async () => {
      const fd = new FormData($('#cmf', m)); CF[kind].forEach(([k]) => c[k] = String(fd.get(k) ?? '').trim());
      if (!c.propertyId) { const p = findProp(c.address, c.city); if (p) c.propertyId = p.id; }
      await save('comps', c);
      if (kind === 'listing' && c.propertyId) { const p = S.prop.get(c.propertyId); p.ed = p.ed || {}; p.cf = p.cf || {}; p.ed.marketStatus = c.status; p.cf.marketStatus = 'broker'; if (c.askingPrice) { p.ed.askingPrice = +c.askingPrice; p.cf.askingPrice = 'broker'; } if (c.askingRent) { p.ed.askingRent = +c.askingRent; p.cf.askingRent = 'broker'; } p.listingChecked = c.date || today(); await save('properties', p); }
      close(); toast('Saved'); done(c);
    };
    const d = $('#cmdel', m); if (d) d.onclick = async () => { await remove('comps', c.id); close(); done(); };
  });
}
// Paste brochure / flyer text, review what was found, then save to the property (labeled as yours) and/or as a listing / lease comp
export function flyerModal(p, done = () => {}) {
  modal(`<div class="ch"><h2>Paste flyer / brochure text</h2><button class="x" data-close>✕</button></div>
    <div class="muted xs">Copy the text from a PDF flyer, OM or listing email and paste it here. The app pulls out SF, acres, clear height, docks, drive-ins, year built, price and rent. Check every value before saving: it's saved as data you entered, never as public record.</div>
    <textarea id="fly" rows="8" style="width:100%" placeholder="e.g. 125,000 SF warehouse on 8.2 acres, 32' clear, 18 docks, 2 drive-ins, built 2004, asking $14,500,000 ..."></textarea>
    <div class="mfoot"><button class="btn primary" id="fparse">Extract</button></div><div id="fout"></div>`, (m, close) => {
    const L = { bldgSf: 'Building SF', officeSf: 'Office SF', landSf: 'Land SF', clearHeight: 'Clear height (ft)', docks: 'Docks', driveIns: 'Drive-ins', yearBuilt: 'Year built', askingPrice: 'Asking price', askingRent: 'Asking rent ($/SF/yr)', zoning: 'Zoning', power: 'Power' };
    $('#fparse', m).onclick = () => {
      const x = parseFlyer($('#fly', m).value);
      $('#fout', m).innerHTML = Object.keys(x).length ? `<form id="ff" class="fgrid2">${Object.entries(x).map(([k, v]) => `<label><span><input type="checkbox" name="use_${k}" checked> ${L[k] || k}</span><input name="${k}" value="${esc(v)}"></label>`).join('')}
        <label>Market status<select name="status"><option value="">(don't change)</option>${LSTAT.map(s => `<option>${s}</option>`).join('')}</select></label><label>Listing broker / firm<input name="listingBroker"></label></form>
        <div class="mfoot">${p ? '<button class="btn primary" id="fsave">Save to this property</button>' : ''}<button class="btn" id="flist">Save as listing</button><button class="btn" id="flease">Save as lease comp</button></div>` : '<div class="muted pad">Nothing recognized. Enter the values by hand with Edit fields.</div>';
      const vals = () => { const fd = new FormData($('#ff', m)), o = {}; Object.keys(x).forEach(k => { if (fd.get('use_' + k)) o[k] = String(fd.get(k)).trim(); }); return { o, status: fd.get('status'), broker: fd.get('listingBroker') }; };
      const fs = $('#fsave', m); if (fs) fs.onclick = async () => { const { o, status } = vals(); p.ed = p.ed || {}; p.cf = p.cf || {}; Object.entries(o).forEach(([k, v]) => { p.ed[k] = /^(zoning|power)$/.test(k) ? v : +String(v).replace(/[^\d.]/g, ''); p.cf[k] = 'broker'; }); if (status) { p.ed.marketStatus = status; p.cf.marketStatus = 'broker'; } p.flyerAdded = today(); await save('properties', p); close(); toast('Flyer data saved (labeled as entered by you)'); done(); };
      $('#flist', m).onclick = () => { const { o, status, broker } = vals(); close(); compForm('listing', { propertyId: p?.id, address: p ? val(p, 'address') : '', city: p ? val(p, 'city') : '', status: status || 'Listed for sale', askingPrice: o.askingPrice || '', askingRent: o.askingRent || '', sf: o.bldgSf || '', listingBroker: broker || '', notes: 'From pasted flyer' }, done); };
      $('#flease', m).onclick = () => { const { o } = vals(); close(); compForm('lease', { propertyId: p?.id, address: p ? val(p, 'address') : '', city: p ? val(p, 'city') : '', sf: o.bldgSf || '', rate: o.askingRent || '', notes: 'From pasted flyer' }, done); };
    };
  });
}
// ---- Comps page: sale comps, lease comps, listings, territory stats ----
const CFLT = { tab: 'sales', county: '', q: '', minSf: '', years: 3, src: '' };
export async function compsView(el) {
  const F = CFLT, since = String(new Date().getFullYear() - F.years);
  const q = F.q.toLowerCase();
  const sales = saleComps().filter(c => c.d >= since && (!F.county || c.co === F.county) && (!F.minSf || c.sf >= +F.minSf) && (!F.src || c.src === F.src) && (!q || (c.addr + ' ' + c.city + ' ' + c.buyer + ' ' + c.seller).toLowerCase().includes(q)));
  const lc = leaseComps().filter(c => (!q || ((c.address || '') + ' ' + (c.city || '') + ' ' + (c.tenant || '')).toLowerCase().includes(q)));
  const ls = listings().filter(c => (!q || ((c.address || '') + ' ' + (c.city || '')).toLowerCase().includes(q)));
  const tabs = [['sales', `Sale comps (${sales.length})`], ['lease', `Lease comps (${lc.length})`], ['listings', `Listings (${ls.length})`], ['stats', 'Territory stats']];
  el.innerHTML = `<div class="page wide"><div class="ph"><div><h1>Comps & listings</h1><div class="muted">Sale comps are built automatically from county recorded sales: Cook Assessor sales and Lake County. DuPage and McHenry don't publish sale prices for free. Lease comps and listings are what you enter or import. Every row is labeled ${SRC_PUB} or ${SRC_YOU}.</div></div>
    <div class="ph-act"><button class="btn" id="asale">+ Sale comp</button><button class="btn" id="alease">+ Lease comp</button><button class="btn" id="alist">+ Listing</button><button class="btn" id="afly">Paste flyer</button><a class="btn ghost" href="#/tools">Import CSV</a><button class="btn ghost" id="cexp">Export CSV</button></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${F.tab === k ? 'on' : ''}" data-ct="${k}">${l}</button>`).join('')}</div>
    <div class="filters"><input id="cq" placeholder="Address, city, buyer, seller, tenant" value="${esc(F.q)}"><select id="cco"><option value="">All counties</option>${Object.keys(MARKET.counties).map(c => `<option ${F.county === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <select id="cyr">${[1, 2, 3, 5, 7].map(y => `<option value="${y}" ${F.years === y ? 'selected' : ''}>Last ${y} yr${y > 1 ? 's' : ''}</option>`).join('')}</select><input id="csf" type="number" inputmode="numeric" placeholder="Min SF" value="${F.minSf}">
      <select id="csrc"><option value="">Public + yours</option><option value="public" ${F.src === 'public' ? 'selected' : ''}>Public record only</option><option value="broker" ${F.src === 'broker' ? 'selected' : ''}>Yours only</option></select></div>
    <div id="ctab"></div></div>`;
  const T = $('#ctab');
  if (F.tab === 'sales') { T.innerHTML = `<div class="muted xs pad">Median $/SF (building, arm's-length, full sales): <b>${psf(median(sales.filter(c => c.psf).map(c => c.psf)))}</b> · ${sales.length} sales · volume ${kmoney(sales.reduce((s, c) => s + c.price, 0))}</div><div id="ct2"></div>`;
    table($('#ct2'), sales, [{ k: 'd', l: 'Date', v: c => c.d, h: c => esc(c.d) }, { k: 'a', l: 'Address', h: c => `${c.pid ? `<a href="#/property/${c.pid}">${esc(c.addr)}</a>` : esc(c.addr)}<div class="xs muted">${esc(c.city)}${c.co ? ', ' + esc(c.co) : ''}</div>`, v: c => c.addr },
      { k: 'p', l: 'Price', cls: 'num', h: c => money(c.price), v: c => c.price }, { k: 'sf', l: 'Bldg SF', cls: 'num', h: c => fmt(c.sf), v: c => c.sf || null }, { k: 'ac', l: 'Acres', cls: 'num', h: c => c.lsf ? (c.lsf / 43560).toFixed(1) : '', v: c => c.lsf || null },
      { k: 'psf', l: '$/SF bldg', cls: 'num', h: c => psf(c.psf), v: c => c.psf || null }, { k: 'pl', l: '$/SF land', cls: 'num', h: c => psf(c.plsf), v: c => c.plsf || null },
      { k: 'b', l: 'Buyer / seller', h: c => `<div class="xs">${esc(c.buyer)}${c.seller ? ' ← ' + esc(c.seller) : ''}</div>` }, { k: 's', l: 'Source', h: c => srcTag(c) + (c.flag ? `<div class="xs muted">${esc(c.flag)}</div>` : '') }],
      { sort: 'd', page: 150 }); }
  if (F.tab === 'lease') table(T, lc, [{ k: 'date', l: 'Date' }, { k: 'a', l: 'Address', h: c => `${c.propertyId ? `<a href="#/property/${c.propertyId}">${esc(c.address || '')}</a>` : esc(c.address || '')}<div class="xs muted">${esc(c.city || '')}</div>` }, { k: 'tenant', l: 'Tenant' }, { k: 'sf', l: 'SF', cls: 'num', h: c => fmt(c.sf), v: c => +c.sf }, { k: 'rate', l: 'Rent $/SF/yr', cls: 'num', h: c => c.rate ? '$' + (+c.rate).toFixed(2) : '', v: c => +c.rate }, { k: 'rateType', l: 'Type' }, { k: 'termMonths', l: 'Term (mo)' }, { k: 's', l: 'Source', h: c => SRC_YOU + (c.notes ? `<div class="xs muted">${esc(c.notes)}</div>` : '') }, { k: 'e', l: '', h: c => `<button class="btn sm ghost" data-ed="${c.id}">Edit</button>` }], { sort: 'date', empty: 'No lease comps yet. Add the ones you collect, paste a flyer, or import a CSV (Tools → Import → Comps).' });
  if (F.tab === 'listings') table(T, ls, [{ k: 'date', l: 'Checked' }, { k: 'a', l: 'Address', h: c => `${c.propertyId ? `<a href="#/property/${c.propertyId}">${esc(c.address || '')}</a>` : esc(c.address || '')}<div class="xs muted">${esc(c.city || '')}</div>` }, { k: 'status', l: 'Status' }, { k: 'ap', l: 'Asking', h: c => c.askingPrice ? kmoney(+c.askingPrice) : c.askingRent ? '$' + c.askingRent + '/SF' : '' }, { k: 'sf', l: 'SF', cls: 'num', h: c => fmt(c.sf) }, { k: 'listingBroker', l: 'Listing broker' }, { k: 'u', l: 'Link', h: c => c.url ? `<a target="_blank" rel="noopener" href="${esc(c.url)}">Open ↗</a>` : '' }, { k: 's', l: 'Source', h: () => SRC_YOU }, { k: 'e', l: '', h: c => `<button class="btn sm ghost" data-ed="${c.id}">Edit</button>` }], { sort: 'date', empty: 'No listings recorded. Use the LoopNet / Crexi / Google checks on a property page, then "Listing status" to record what you find.' });
  if (F.tab === 'stats') {
    const by = new Map(); for (const c of sales) { const k = (c.city || 'Unknown') + '|' + (c.co || ''); const g = by.get(k) || { city: c.city || 'Unknown', co: c.co, n: 0, vol: 0, psf: [], sf: 0 }; g.n++; g.vol += c.price; if (c.psf) g.psf.push(c.psf); g.sf += c.sf; by.set(k, g); }
    const lby = new Map(); for (const c of lc) { const k = (c.city || 'Unknown'); const g = lby.get(k) || []; if (+c.rate) g.push(+c.rate); lby.set(k, g); }
    const parcels = new Map(); for (const p of S.props) { const k = (val(p, 'city') || 'Unknown') + '|' + p.co; parcels.set(k, (parcels.get(k) || 0) + 1); }
    table(T, [...by.entries()].map(([k, g]) => ({ ...g, k, mpsf: median(g.psf), parcels: parcels.get(k) || 0, rent: median(lby.get(g.city) || []) })), [
      { k: 'city', l: 'Submarket / town', h: g => `${esc(g.city)} <span class="xs muted">${esc(g.co || '')}</span>` }, { k: 'n', l: 'Sales', cls: 'num', v: g => g.n }, { k: 'vol', l: 'Volume', cls: 'num', h: g => kmoney(g.vol), v: g => g.vol },
      { k: 'mpsf', l: 'Median $/SF bldg', cls: 'num', h: g => psf(g.mpsf), v: g => g.mpsf || null }, { k: 'sf', l: 'SF sold', cls: 'num', h: g => fmt(g.sf), v: g => g.sf }, { k: 'parcels', l: 'Industrial parcels', cls: 'num', v: g => g.parcels },
      { k: 'turn', l: 'Turnover / yr', cls: 'num', h: g => g.parcels ? (100 * g.n / g.parcels / F.years).toFixed(1) + '%' : '', v: g => g.parcels ? g.n / g.parcels : null }, { k: 'rent', l: 'Median rent (your comps)', cls: 'num', h: g => g.rent ? '$' + g.rent.toFixed(2) : '–', v: g => g.rent || null },
    ], { sort: 'vol', page: 200 });
  }
  const re = () => compsView(el), deb = fn => { let t; return () => { clearTimeout(t); t = setTimeout(fn, 300); }; };
  $$('[data-ct]', el).forEach(b => b.onclick = () => { F.tab = b.dataset.ct; re(); });
  $('#cq').addEventListener('input', deb(() => { F.q = $('#cq').value; re(); })); $('#csf').addEventListener('input', deb(() => { F.minSf = $('#csf').value; re(); }));
  $('#cco').onchange = e => { F.county = e.target.value; re(); }; $('#cyr').onchange = e => { F.years = +e.target.value; re(); }; $('#csrc').onchange = e => { F.src = e.target.value; re(); };
  $('#asale').onclick = () => compForm('sale', {}, re); $('#alease').onclick = () => compForm('lease', {}, re); $('#alist').onclick = () => compForm('listing', { status: 'Listed for sale' }, re); $('#afly').onclick = () => flyerModal(null, re);
  $$('[data-ed]', el).forEach(b => b.onclick = () => { const c = S.comps.get(b.dataset.ed); compForm(c.kind, c, re); });
  $('#cexp').onclick = () => { const rows = F.tab === 'lease' ? lc : F.tab === 'listings' ? ls : sales.map(c => ({ date: c.d, address: c.addr, city: c.city, county: c.co, price: c.price, bldg_sf: c.sf, land_acres: c.lsf ? (c.lsf / 43560).toFixed(2) : '', psf_bldg: c.psf ? c.psf.toFixed(2) : '', buyer: c.buyer, seller: c.seller, deed: c.deed || '', source: c.src === 'public' ? 'Public record (county sales)' : 'Entered by you', note: c.flag || '' })); download(`comps-${F.tab}-${today()}.csv`, toCSV(rows.map(r => { const o = { ...r }; delete o.props; return o; }))); };
}
