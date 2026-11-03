// responsive images: every render exists in a few widths (see images.js), the browser picks one by srcset
import { IMG } from './images.js';

export const img = {
  src(id, want = 1280) {
    const m = IMG[id]; if (!m) return '';
    const w = m.s.find(s => s >= want) || m.s[m.s.length - 1];
    return `assets/img/${id}-${w}.webp`;
  },
  srcset: id => IMG[id].s.map(w => `assets/img/${id}-${w}.webp ${w}w`).join(', '),
  ratio: id => IMG[id].w / IMG[id].h,
  size: id => IMG[id],
};

/* device and network: heavy extras only where they will not hurt */
const conn = (typeof navigator !== 'undefined' && navigator.connection) || {};
export const saveData = !!conn.saveData;
export const slowNet = saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '');
export const weakDevice = (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
