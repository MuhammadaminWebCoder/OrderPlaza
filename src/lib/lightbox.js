// a tiny store for the lightbox, so both React sections and the 3D maket can open pictures in it
let state = { list: [], i: 0, open: false };
const subs = new Set();
const emit = () => subs.forEach(f => f(state));

export function openImages(list, i = 0) {
  state = { list, i: (i + list.length) % list.length, open: true, from: document.activeElement };
  emit();
}
export function showImage(i) { state = { ...state, i: (i + state.list.length) % state.list.length }; emit(); }
export function closeImages() { const from = state.from; state = { ...state, open: false }; emit(); from?.focus?.(); }
export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export const getState = () => state;
export const toList = items => items.map(([id, cap]) => ({ id, cap }));
