import { ENG, ICON } from '../data/content.jsx';

export default function Engineering() {
  return (
    <section className="sec sec-soft" id="muhandislik" aria-labelledby="eng-t">
      <div className="wrap sec-head">
        <div>
          <p className="eyebrow">Loyiha boʻlimlari</p>
          <h2 id="eng-t">Muhandislik tizimlari</h2>
        </div>
        <p className="sec-sub">Har bir tizim uchun loyihada alohida chizma bor (AutoCAD).</p>
      </div>
      <div className="wrap">
        <ul className="eng">
          {ENG.map(([ic, t, d]) => (
            <li key={t}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[ic]}</svg>
              <b>{t}</b><span>{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
