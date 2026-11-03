import { useState } from 'react';
import Tabs from './Tabs.jsx';
import { Zoom } from './Img.jsx';
import { LOBBY, STYLES } from '../data/content.jsx';
import { openImages, toList } from '../lib/lightbox.js';

const ISO = [2, 3, 4, 5, 6, 7].map(n => ({ id: `iso-${n}`, cap: `${n}-qavat — izometriya` }));

function Styles() {
  const [k, setK] = useState('y');
  const s = STYLES[k];
  const caps = s.imgs.map(id => /11$|s0$/.test(id) ? `${s.name} — apartament rejasi (yuqoridan)` : `${s.name} uslubi`);
  const list = s.imgs.map((id, i) => ({ id, cap: caps[i] }));
  return (
    <>
      <div className="wrap sec-head mt">
        <div>
          <p className="eyebrow">Apartamentlar</p>
          <h3 className="h2">Dizayn yechimlari</h3>
        </div>
        <Tabs label="Dizayn yechimlari" items={Object.entries(STYLES).map(([key, v]) => [key, v.name])} value={k} onChange={setK} />
      </div>
      <div className="wrap">
        <div className="style-box" key={k}>
          <div className="style-main fade-in"><Zoom id={s.imgs[0]} cap={caps[0]} sizes="(min-width: 860px) 60vw, 100vw" onOpen={() => openImages(list, 0)} /></div>
          <div className="style-desc fade-in">
            <h4>{s.name}</h4><p>{s.desc}</p>
            <div className="swatches">{s.sw.map(c => <i key={c} style={{ background: c }} title={c} />)}</div>
          </div>
          <div className="style-side">
            {s.imgs.slice(1, 5).map((id, i) => (
              <div key={id} className="fade-in" style={{ animationDelay: `${(i + 1) * 50}ms` }}>
                <Zoom id={id} cap={caps[i + 1]} sizes="(min-width: 860px) 20vw, 50vw" onOpen={() => openImages(list, i + 1)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Interior() {
  const lobby = toList(LOBBY);
  return (
    <section className="sec sec-soft" id="interyer" aria-labelledby="int-t">
      <div className="wrap sec-head">
        <div>
          <p className="eyebrow">Interyer</p>
          <h2 id="int-t">Kirish holli va koridorlar</h2>
        </div>
        <p className="sec-sub">Marmar pol, yongʻoq rangli devor panellari, oltin girih naqshli dekor va qora panjarali shift.</p>
      </div>
      <div className="wrap">
        <div className="lobby">
          {LOBBY.slice(0, 5).map(([id, cap], i) => (
            <div key={id} className="g">
              <Zoom id={id} cap={cap} sizes={i === 0 ? '(min-width: 860px) 50vw, 100vw' : '(min-width: 860px) 25vw, 50vw'} onOpen={() => openImages(lobby, i)}>
                <span className="cap">{cap}</span>
              </Zoom>
            </div>
          ))}
        </div>
      </div>

      <Styles />

      <div className="wrap sec-head mt">
        <div>
          <p className="eyebrow">Qavatlar</p>
          <h3 className="h2">Qavat izometriyalari</h3>
        </div>
        <p className="sec-sub">2–7-qavatlarning ichki joylashuvi — mebel va pardozi bilan.</p>
      </div>
      <div className="wrap">
        <div className="iso-strip">
          {ISO.map(({ id, cap }, i) => (
            <div key={id} className="g">
              <Zoom id={id} cap={cap} sizes="420px" onOpen={() => openImages(ISO, i)} />
              <span className="lbl">{cap}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
