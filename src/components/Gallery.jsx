import { useState } from 'react';
import Tabs from './Tabs.jsx';
import { Zoom } from './Img.jsx';
import { GAL, FILM } from '../data/content.jsx';
import { img } from '../lib/img.js';
import { openImages, toList } from '../lib/lightbox.js';

// the film: a poster until the visitor presses play, then the video in its place
function Film() {
  const [play, setPlay] = useState(false);
  return (
    <div className="g film fade-in">
      {play
        ? <video className="film-v" src={FILM.src} poster={FILM.poster} controls autoPlay playsInline preload="auto" />
        : <button className="film-play" type="button" aria-label="Videoni koʻrish" onClick={() => setPlay(true)}>
            <img src={FILM.poster} width="1280" height="720" alt="" loading="lazy" decoding="async" />
            <span className="film-btn" aria-hidden="true" />
            <span className="cap">Animatsiya · {FILM.len}</span>
          </button>}
    </div>
  );
}

export default function Gallery() {
  const [tab, setTab] = useState('ext');
  const { note, items } = GAL[tab], list = toList(items);
  return (
    <section className="sec" id="galereya" aria-labelledby="gal-t">
      <div className="wrap sec-head">
        <div>
          <p className="eyebrow">Vizualizatsiyalar</p>
          <h2 id="gal-t">Fasad va atrof</h2>
        </div>
        <Tabs label="Galereya boʻlimlari" items={Object.entries(GAL).map(([k, g]) => [k, g.label])} value={tab} onChange={setTab} />
      </div>
      <div className="wrap">
        <p className="tab-note">{note}</p>
        <div className="grid-gal" key={tab}>
          {tab === 'vid' ? <Film /> : items.map(([id, cap], i) => {
            const r = img.ratio(id), cls = r < 1 ? 'g t' : (i % 5 === 0 && r > 1.3) ? 'g w' : 'g';
            return (
              <div key={id} className={`${cls} fade-in`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <Zoom id={id} cap={cap} sizes={cls === 'g w' ? '(min-width: 860px) 66vw, 100vw' : '(min-width: 860px) 33vw, 50vw'} onOpen={() => openImages(list, i)}>
                  <span className="cap">{cap}</span>
                </Zoom>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
