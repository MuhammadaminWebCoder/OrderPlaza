import Img from './Img.jsx';
import { GAL } from '../data/content.jsx';
import { openImages, toList } from '../lib/lightbox.js';

export default function About() {
  return (
    <section className="sec" id="bino" aria-labelledby="bino-t">
      <div className="wrap about">
        <div className="about-text">
          <p className="eyebrow">Loyiha haqida</p>
          <h2 id="bino-t">Ikki hajmli bino: minora va asosiy blok</h2>
          <p>Bino ikki qismdan iborat. Chap tomondagi <b>minora</b> (6,70 m qanot + 15,4 m, jami ≈22 m) 10 qavatgacha koʻtariladi: 10-qavat texnik, qanot ustida chillerlar uchun ochiq tom, tepasida “Order Plaza” belgisi. Oʻngdagi <b>asosiy blok</b> (27 m) 8 qavatli, 9-qavati ichkariga chekingan va atrofida ochiq terrasa bor. Kirish holli gʻarbiy qanotda, koʻchaga 3 m chiqib turadi; sharqiy uchida 10,25 m logistika zali.</p>
          <p>Karkas monolit temir-betondan, ustunlar asosan 6 m qadamda joylashgan. Zinapoya va lift yadrosi minora tomonda, 1–2 o‘qlar orasida.</p>
          <ul className="ticks">
            <li><b>Yerto‘la:</b> texnik va yordamchi xonalar</li>
            <li><b>1-qavat:</b> koʻcha tomonga vitrinali savdo maydonlari</li>
            <li><b>2–8-qavatlar:</b> bir xil (tipik) reja, markazda koridor</li>
            <li><b>9-qavat:</b> asosiy blokda chekinish va terrasa</li>
            <li><b>10-qavat:</b> faqat minora qismida (texnik)</li>
          </ul>
        </div>
        <figure className="about-fig">
          <button className="zoom" type="button" aria-label="Rasmni kattalashtirish" onClick={() => openImages(toList(GAL.ext.items), 1)}>
            <Img id="ext-01" sizes="(min-width: 960px) 46vw, 100vw" alt="Bino perspektivasi, avtoturargoh tomondan" />
          </button>
          <figcaption>Asosiy blok va minora — burchakdan koʻrinish</figcaption>
        </figure>
      </div>

      <div className="wrap">
        <div className="facts">
          <div className="fact"><span className="k">Bino turi</span><span className="v">Noturar joy binosi</span><span className="d">Eskiz loyiha</span></div>
          <div className="fact"><span className="k">Qavat maydoni</span><span className="v">≈683 m²</span><span className="d">tipik qavat, tashqi oʻlcham boʻyicha</span></div>
          <div className="fact"><span className="k">Qavat balandligi</span><span className="v">4,5 / 3,4 m</span><span className="d">1-qavat / tipik qavat (taxminiy)</span></div>
          <div className="fact"><span className="k">Energiya</span><span className="v">Quyosh stansiyasi</span><span className="d">tomda fotoelektr panellar</span></div>
        </div>
      </div>
    </section>
  );
}
