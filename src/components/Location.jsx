import { useState } from 'react';
import Img from './Img.jsx';
import { ADDRESS, CONTACT } from '../data/content.jsx';

const q = encodeURIComponent(ADDRESS);

export default function Location() {
  const [map, setMap] = useState(false);   // the Google map loads only on request
  const contacts = [
    CONTACT.phone && <a key="p" href={`tel:${CONTACT.phone.replace(/[^\d+]/g, '')}`}>{CONTACT.phone}</a>,
    CONTACT.telegram && <a key="t" href={`https://t.me/${encodeURIComponent(CONTACT.telegram)}`} target="_blank" rel="noopener">Telegram: @{CONTACT.telegram}</a>,
    CONTACT.email && <a key="e" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>,
  ].filter(Boolean);
  return (
    <section className="sec" id="manzil" aria-labelledby="loc-t">
      <div className="wrap loc">
        <div className="loc-text">
          <p className="eyebrow">Manzil</p>
          <h2 id="loc-t">Yunusobod tumani, Sharof Rashidov shoh koʻchasi, 69</h2>
          <p>Bino koʻchaga parallel joylashgan. Old tomonda daraxtlar qatori va avtoturargoh bor. Kirish va vitrinalar koʻcha tomonda.</p>
          {contacts.length > 0 && <div className="contact">{contacts}</div>}
          <div className="hero-actions">
            <a className="btn btn-dark" href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener">Xaritada ochish</a>
            <a className="btn btn-line" href="#maket">3D maketga qaytish</a>
          </div>
        </div>
        <div className="map">
          {map
            ? <iframe title="Order Plaza xaritada" src={`https://maps.google.com/maps?q=${q}&z=16&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            : <button className="map-load" type="button" onClick={() => setMap(true)}>
                <Img id="ext-03" sizes="(min-width: 960px) 50vw, 100vw" />
                <span>Xaritani yuklash</span>
              </button>}
        </div>
      </div>
    </section>
  );
}
