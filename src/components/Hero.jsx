import { useEffect, useRef } from 'react';
import { img, saveData, reduceMotion } from '../lib/img.js';

// the photo shows at once; the street-level loop fades in over it as the loading screen opens
function startVideo(box) {
  if (saveData || reduceMotion) return () => {};
  const v = document.createElement('video');
  // attributes, not just properties: iOS only autoplays a video that is muted and inline from the start
  for (const a of ['muted', 'playsinline', 'autoplay', 'loop']) v.setAttribute(a, '');
  Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' });
  v.className = 'hero-vid'; v.setAttribute('aria-hidden', 'true'); v.disablePictureInPicture = true;
  v.src = 'assets/video/hero-loop.mp4?v=1';
  v.addEventListener('playing', () => v.classList.add('on'), { once: true });
  v.addEventListener('error', () => v.remove(), { once: true });
  box.appendChild(v);
  // no decoding while the hero is scrolled away
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); });
  io.observe(box);
  return () => { io.disconnect(); v.remove(); };
}

export default function Hero() {
  const box = useRef(null), photo = useRef(null);

  useEffect(() => {
    // tell the loading screen the picture is in
    const ready = () => dispatchEvent(new Event('hero:ready'));
    const p = photo.current;
    if (p.complete) ready(); else { p.addEventListener('load', ready, { once: true }); p.addEventListener('error', ready, { once: true }); }
    let stop = () => {};
    const go = () => { stop = startVideo(box.current); };
    if (window.__preloaderOpen || !document.documentElement.classList.contains('is-preloading')) go();
    else addEventListener('preloader:open', go, { once: true });
    return () => { removeEventListener('preloader:open', go); stop(); };
  }, []);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <picture className="hero-img" ref={box}>
        <img ref={photo} src={img.src('hero', 1400)} srcSet={img.srcset('hero')} sizes="100vw" width="5000" height="3536"
          alt="Order Plaza biznes-markazi — koʻchadan koʻrinish" fetchPriority="high" decoding="async" />
      </picture>
      <div className="hero-shade" />
      <div className="wrap hero-in">
        <p className="eyebrow light">Toshkent · Yunusobod tumani</p>
        <h1 id="hero-title">Order Plaza<span>biznes-markazi</span></h1>
        <p className="hero-lead">Sharof Rashidov shoh koʻchasi, 69. Birinchi qavatda savdo, yuqori qavatlarda ofislar; 9-qavatda ochiq terrasa, tepasida “Order Plaza” belgisi.</p>
        <div className="hero-actions">
          <a className="btn btn-gold" href="#maket">3D maketni ochish</a>
          <a className="btn btn-ghost" href="#galereya">Vizualizatsiyalar</a>
        </div>
        <dl className="hero-stats">
          <div><dt>Qavatlar</dt><dd>10<small>+ yerto‘la</small></dd></div>
          <div><dt>Oʻlchami</dt><dd>49,1<small>× 14,1 m</small></dd></div>
          <div><dt>Balandlik</dt><dd>≈37<small>m</small></dd></div>
          <div><dt>Umumiy maydon</dt><dd>≈7 000<small>m²</small></dd></div>
        </dl>
      </div>
    </section>
  );
}
