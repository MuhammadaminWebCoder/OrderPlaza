import { img } from '../lib/img.js';

// a render in all its widths; lazy unless it is above the fold
export default function Img({ id, sizes = '100vw', alt = '', eager = false, className }) {
  const m = img.size(id);
  return (
    <img src={img.src(id, 640)} srcSet={img.srcset(id)} sizes={sizes} width={m.w} height={m.h} alt={alt}
      className={className} loading={eager ? undefined : 'lazy'} decoding="async" />
  );
}

// a picture tile that opens the lightbox
export function Zoom({ id, cap, sizes, onOpen, children }) {
  return (
    <button className="zoom" type="button" aria-label={`${cap || 'Rasm'} — kattalashtirish`} onClick={onOpen}>
      <Img id={id} sizes={sizes} alt={cap} />
      {children}
    </button>
  );
}
