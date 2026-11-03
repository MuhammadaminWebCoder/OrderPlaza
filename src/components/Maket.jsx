import { memo, useEffect } from 'react';
import { img, slowNet, weakDevice } from '../lib/img.js';
import { openImages } from '../lib/lightbox.js';

// The 3D engine (src/maket) drives this markup itself through its ids, so React renders it once as plain HTML
// and never touches it again.
const UI = `
<div class="stage" id="stage">
  <div class="loader" id="loader"><span class="spin" aria-hidden="true"></span><span id="loaderText">3D maket yuklanmoqda…</span></div>
  <div class="labels" id="labels"></div>
  <div class="walk-ui" id="walkUi" hidden>
    <div class="walk-top"><span class="walk-room" id="walkRoom">—</span><button class="mbtn" id="walkExit" type="button">✕ Qavatga qaytish</button></div>
    <div class="stair-ui" id="stairUi" hidden><button class="mbtn" id="stairUp" type="button">⬆ <span>Yuqoriga</span></button><button class="mbtn" id="stairDown" type="button">⬇ <span>Pastga</span></button></div>
    <div class="lift-ui" id="liftUi" hidden><b>Lift</b><span>Qavatni tanlang</span><div class="lift-btns" id="liftBtns"></div></div>
    <canvas class="walk-map" id="walkMap" width="440" height="150" aria-label="Qavat xaritasi"></canvas>
    <div class="walk-hint">Polga bosing — yurish · Sudrang — qarash · W A S D · Zina yoki lift orqali boshqa qavatga oʻting</div>
  </div>
</div>
<div class="m-ui">
  <nav class="floors panel" id="floors" aria-label="Qavatlar"><div class="ttl">Qavatlar</div></nav>
  <section class="card panel" aria-live="polite">
    <div id="ov">
      <div class="m-eyebrow">Butun bino</div>
      <h3>Qavatni tanlang</h3>
      <p class="m-p">Binoni aylantiring yoki qavat ustiga bosing.</p>
      <div class="m-facts"><div><b>10</b><span>qavat</span></div><div><b>1</b><span>yerto‘la</span></div><div><b>49,1</b><span>m uzunlik</span></div></div>
    </div>
    <div id="fv" hidden>
      <div class="m-eyebrow" id="fvLevel">Otmetka</div>
      <h3 id="fvTitle">—</h3>
      <div class="m-sub" id="fvSub">—</div>
      <p class="m-p" id="fvText"></p>
      <div class="room-list" id="roomList"></div>
      <button class="fv-thumb" id="fvThumb" type="button" hidden><img alt="" id="fvThumbImg"><span id="fvThumbCap">Qavat vizualizatsiyasi — kattalashtirish</span></button>
      <div class="m-nav">
        <button class="mbtn" id="prev" type="button" aria-label="Pastki qavat">↓</button>
        <button class="mbtn primary" id="back" type="button">Butun bino</button>
        <button class="mbtn" id="next" type="button" aria-label="Yuqori qavat">↑</button>
      </div>
    </div>
    <div id="rv" hidden>
      <div class="m-eyebrow" id="rvLevel">—</div>
      <h3 id="rvTitle">—</h3>
      <canvas class="rv-map" id="rvMap" width="700" height="220" aria-label="Xonaning qavatdagi joyi"></canvas>
      <div class="m-facts"><div><b id="rvArea">—</b><span>maydon</span></div><div><b id="rvSize">—</b><span>oʻlcham, m</span></div><div><b id="rvSide">—</b><span>derazalar</span></div></div>
      <button class="mbtn walk-btn" id="walkBtn" type="button">▶ Ichida yurish (3D)</button>
      <div class="m-nav"><button class="mbtn primary" id="rvBack" type="button">← Butun qavat</button></div>
    </div>
  </section>
  <div class="m-tools">
    <button class="mbtn icon" id="zoomIn" type="button" aria-label="Yaqinlashtirish">+</button>
    <button class="mbtn icon" id="zoomOut" type="button" aria-label="Uzoqlashtirish">−</button>
    <button class="mbtn icon" id="fs" type="button" aria-label="Toʻliq ekran">⤢</button>
  </div>
  <div class="m-hint" id="hint">Sudrang — aylantirish · Ctrl + gʻildirak — yaqinlashtirish</div>
</div>
<div class="tip" id="tip" hidden></div>`;

const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const $ = s => document.querySelector(s);
const loaderText = t => { const el = $('#loaderText'); if (el) el.textContent = t; };

// three.js and the engine (~700 kB) are fetched only when the maket is about to be seen
let started = null;
function loadMaket() {
  return started ||= (async () => {
    $('#loadMaket')?.remove();
    loaderText('3D maket yuklanmoqda…');
    const m = await import('../maket/maket.js');
    loaderText('Bino tayyorlanmoqda…');
    await nextFrame();
    return m.initMaket({ img, openImages });
  })().catch(err => {
    console.error(err);
    loaderText('3D maketni yuklab boʻlmadi. Internet aloqasini tekshiring.');
    started = null; manualMaket('Qayta urinish');
  });
}
// slow connection or weak device: wait for a tap instead of pulling the 3D files on its own
function manualMaket(label = '3D maketni yuklash (≈4 MB)') {
  $('.loader .spin')?.setAttribute('hidden', '');
  const b = document.createElement('button');
  b.className = 'btn btn-gold'; b.id = 'loadMaket'; b.type = 'button'; b.textContent = label;
  b.addEventListener('click', () => { $('.loader .spin')?.removeAttribute('hidden'); loadMaket(); });
  $('#loader')?.appendChild(b);
}

function Maket() {
  useEffect(() => {
    if (slowNet || weakDevice) { loaderText('Internet sekin yoki qurilma kuchsiz boʻlishi mumkin.'); manualMaket(); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); loadMaket(); } }, { rootMargin: '600px 0px' });
    io.observe($('#maket'));
    return () => io.disconnect();
  }, []);

  return (
    <section className="sec sec-dark" id="maket" aria-labelledby="maket-t">
      <div className="wrap sec-head">
        <div>
          <p className="eyebrow light">Interaktiv</p>
          <h2 id="maket-t">3D maket va qavatlar</h2>
        </div>
        <p className="sec-sub">Qavatni tanlang — u tepadan ochiladi va ichidagi ofislar mebeli bilan koʻrinadi. Xonani tanlab, ichida yurib koʻring.</p>
      </div>
      <div className="maket" id="maketBox" dangerouslySetInnerHTML={{ __html: UI }} />
    </section>
  );
}
export default memo(Maket, () => true);
