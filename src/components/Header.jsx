import { useEffect, useState } from 'react';
import Brands from './Brands.jsx';
import { NAV } from '../data/content.jsx';

export default function Header() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const onScroll = () => setSolid(scrollY > 40);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    // the section in the middle of the screen lights up its menu item
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    NAV.forEach(([id]) => { const s = document.getElementById(id); if (s) io.observe(s); });
    return () => { removeEventListener('scroll', onScroll); io.disconnect(); };
  }, []);

  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; }, [open]);

  return (
    <header className={`top${solid ? ' solid' : ''}${open ? ' menu-open' : ''}`} id="top">
      <div className="wrap top-in">
        <Brands home />
        <nav className={`menu${open ? ' open' : ''}`} id="menu" aria-label="Boʻlimlar" onClick={e => { if (e.target.closest('a')) setOpen(false); }}>
          {NAV.map(([id, t]) => <a key={id} href={`#${id}`} className={active === id ? 'on' : undefined}>{t}</a>)}
        </nav>
        <a className="btn btn-gold top-cta" href="#manzil">Bogʻlanish</a>
        <button className="burger" type="button" aria-label="Menyu" aria-expanded={open} aria-controls="menu" onClick={() => setOpen(o => !o)}><span /></button>
      </div>
    </header>
  );
}
