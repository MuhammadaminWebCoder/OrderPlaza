# OrderPlaza

Order Plaza biznes-markazi sayti (Toshkent, Yunusobod tumani, Sharof Rashidov shoh koʻchasi, 69) — hamkor: 3D Kadastr.
Interaktiv 3D maket: kadastr chizmasi boʻyicha qavatlar, mebelli ofislar va ularda yurish; fasad va interyer
vizualizatsiyalari.

## Stek

| Qatlam      | Texnologiya                                             |
| ----------- | ------------------------------------------------------- |
| UI          | React 19 + Vite                                         |
| 3D          | three.js 0.165 (faqat maket koʻrinishga yaqinlashganda yuklanadi) |
| Stil        | oddiy CSS (`src/styles/site.css`), shriftlar: Space Grotesk, Manrope, JetBrains Mono |

## Ishga tushirish

```bash
npm install
npm run dev        # http://localhost:8765 (lokal tarmoqda ham ochiladi)
```

Production:

```bash
npm run build      # dist/ — istalgan statik hostingga (GitHub Pages, Vercel, Netlify) yuklanadi
npm run preview
```

## Tuzilma

```
index.html            — sahifa qobigʻi va yuklanish ekrani (preloader)
src/main.jsx, App.jsx — React ilova
src/components/       — sahifa boʻlimlari (Header, Hero, About, Maket, Gallery, Interior, Engineering, Location, Footer, Lightbox)
src/data/content.jsx  — matnlar, galereyalar, interyer uslublari, kontaktlar (telefon shu yerda)
src/maket/            — 3D maket: maket.js (sahna), interior.js (qavat ichi), plans.js (qavat rejalari)
src/lib/              — rasm oʻlchamlari, lightbox, scroll animatsiyalari
public/assets/        — renderlar (WebP), videolar, teksturalar, mebel modellari
tools/                — rasm, model, video va qavat rejalarini tayyorlash skriptlari (saytga kerak emas)
```

## 3D maket tezligi

- three.js va maket kodi alohida boʻlakda, faqat maket ekranga yaqinlashganda yuklanadi; sekin internet yoki kuchsiz
  qurilmada «3D maketni yuklash» tugmasi chiqadi.
- Qavatlar rejasi va mebeli boʻsh paytlarda oldindan, bittadan hisoblab qoʻyiladi (maketga tegilmayotganda), shuning
  uchun qavat bosilganda sahifa qotmaydi.
- Render faqat kerak boʻlganda chiziladi; aylantirish sekinlashsa, render aniqligi avtomatik pasayadi.

## Qavat rejalari

Rejalar kadastr chizmasidan (`chizma.pdf`) olingan. Qayta yaratish (manba fayllar repozitoriyda yoʻq):

```bash
python tools/pdf_extract.py _manba/chizma/chizma.pdf _manba/work/pdf.pkl _manba/work
python tools/pdf_plans.py  _manba/work/pdf.pkl _manba/work/pdfplans
# so'ng _manba/work/pdfplans/plans.js -> src/maket/plans.js
```

Qavatlar: Y (yerto'la), 1 (savdo), 2, 3-5, 6, 7-8 (ofis), 9 (terrasa), 10 (texnik, chiller tomi).

Teksturalar, modellar va osmon: [Poly Haven](https://polyhaven.com) (CC0).
