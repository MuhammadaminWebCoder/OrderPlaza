// scroll reveals: text and blocks rise in as they come into view. Set up after the first render, so a page
// without JavaScript (or with reduced motion) shows everything at once.
import { reduceMotion } from './img.js';

const GROUPS = [
  ['.sec-head', '.about-text>*', '.loc-text>*', '.tab-note', '.style-desc', '.maket'],
  ['.fact', '.eng li', '.grid-gal .g', '.lobby .g', '.iso-strip .g', '.style-side>*', '.foot-in>*'],
  ['.about-fig', '.style-main', '.map'],     // pictures open from below
];

export function setupReveals() {
  if (reduceMotion || !('IntersectionObserver' in window)) return () => {};
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } }),
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  GROUPS.forEach((sels, g) => document.querySelectorAll(sels.join(',')).forEach(el => {
    if (el.closest('.hero') || el.classList.contains('rv')) return;
    el.classList.add('rv'); if (g === 2) el.classList.add('rv-img');
    // siblings in a row come in one after another
    const sib = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
    el.style.setProperty('--rd', `${Math.min(sib, 6) * 0.07}s`);
    io.observe(el);
  }));
  return () => io.disconnect();
}
