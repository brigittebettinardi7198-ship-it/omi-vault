// Favorites: starred properties, saved on this device in settings (so they ride along in backup / export). Tap again to remove.
import { $$, toast } from './util.js';
import { setting, setSetting } from './store.js';
export const favIds = () => setting('favs', []);
export const isFav = id => favIds().includes(id);
export function toggleFav(id) { const L = favIds(), on = !L.includes(id); setSetting('favs', on ? [id, ...L] : L.filter(x => x !== id)); return on; }
export const favBtn = (id, cls = '') => { const on = isFav(id); return `<span role="button" tabindex="0" class="favb ${on ? 'on' : ''} ${cls}" data-fav="${id}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} favorites" title="${on ? 'Remove from' : 'Add to'} favorites">${on ? '★' : '☆'}</span>`; };
let bound = false;
export function bindFavs() {
  if (bound) return; bound = true;
  const h = e => { const b = e.target.closest && e.target.closest('[data-fav]'); if (!b) return; if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); e.stopPropagation(); const id = b.dataset.fav, on = toggleFav(id);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach(x => { x.classList.toggle('on', on); x.textContent = on ? '★' : '☆'; x.setAttribute('aria-pressed', on); x.setAttribute('aria-label', (on ? 'Remove from' : 'Add to') + ' favorites'); x.title = x.getAttribute('aria-label'); });
    toast(on ? 'Added to Favorites' : 'Removed from Favorites'); };
  document.addEventListener('click', h, true); document.addEventListener('keydown', h, true);
}
