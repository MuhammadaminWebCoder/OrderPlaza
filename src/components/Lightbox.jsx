import { useEffect, useRef, useSyncExternalStore } from 'react';
import { subscribe, getState, showImage, closeImages } from '../lib/lightbox.js';
import { img } from '../lib/img.js';

export default function Lightbox() {
  const { list, i, open } = useSyncExternalStore(subscribe, getState);
  const root = useRef(null), closeBtn = useRef(null), sx = useRef(null);
  const cur = list[i];

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    const onKey = e => {
      if (e.key === 'Escape') closeImages();
      else if (e.key === 'ArrowLeft') showImage(getState().i - 1);
      else if (e.key === 'ArrowRight') showImage(getState().i + 1);
      else if (e.key === 'Tab') {   // keep focus inside the dialog
        e.preventDefault();
        const f = [...root.current.querySelectorAll('button:not([hidden])')], k = f.indexOf(document.activeElement);
        f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  // warm up the neighbours
  useEffect(() => {
    if (!open) return;
    for (const d of [1, -1]) { const n = list[(i + d + list.length) % list.length]; if (n) new Image().src = img.src(n.id, 1920); }
  }, [open, i, list]);

  if (!open || !cur) return null;
  const m = img.size(cur.id), many = list.length > 1;
  return (
    <div className="lb" ref={root} role="dialog" aria-modal="true" aria-label="Rasm koʻrish"
      onClick={e => { if (e.target === root.current || e.target.classList.contains('lb-fig')) closeImages(); }}
      onTouchStart={e => { sx.current = e.touches.length === 1 ? e.touches[0].clientX : null; }}
      onTouchEnd={e => { if (sx.current == null) return; const dx = e.changedTouches[0].clientX - sx.current; sx.current = null; if (Math.abs(dx) > 50) showImage(i + (dx < 0 ? 1 : -1)); }}>
      <button className="lb-x" ref={closeBtn} type="button" aria-label="Yopish" onClick={closeImages}>×</button>
      <button className="lb-nav prev" type="button" aria-label="Oldingi" hidden={!many} onClick={() => showImage(i - 1)}>‹</button>
      <figure className="lb-fig">
        <img key={cur.id} src={img.src(cur.id, 1920)} srcSet={img.srcset(cur.id)} sizes="100vw" width={m.w} height={m.h} alt={cur.cap || ''} />
        <figcaption>{cur.cap}</figcaption>
      </figure>
      <button className="lb-nav next" type="button" aria-label="Keyingi" hidden={!many} onClick={() => showImage(i + 1)}>›</button>
      <div className="lb-count">{many ? `${i + 1} / ${list.length}` : ''}</div>
    </div>
  );
}
