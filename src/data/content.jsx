// Order Plaza — page content: contacts, galleries, interior styles, engineering systems.

/* site settings: fill in to show contacts on the page */
export const CONTACT = {
  phone: '+998 78 777-00-88',   // loyihaning reklama videosidan (3333.mp4) — tasdiqlash kerak
  telegram: '',     // masalan: 'orderplaza'
  email: '',
};
export const ADDRESS = 'Sharof Rashidov shoh koʻchasi 69, Yunusobod tumani, Toshkent';

export const NAV = [
  ['bino', 'Bino'], ['maket', '3D maket'], ['galereya', 'Galereya'],
  ['interyer', 'Interyer'], ['muhandislik', 'Muhandislik'], ['manzil', 'Manzil'],
];

export const GAL = {
  ext: {
    label: 'Yakuniy fasad',
    note: 'Yakuniy yechim: oq fasad, vertikal oltin girih panellari, minora tepasida belgi.',
    items: [
      ['hero', 'Asosiy fasad — koʻcha tomondan'], ['ext-01', 'Burchakdan koʻrinish, avtoturargoh'],
      ['ext-02', 'Minora va asosiy blok'], ['ext-03', 'Koʻcha bilan umumiy koʻrinish'],
      ['ext-04', 'Pastdan perspektiva'], ['ext-05', 'Minora tomondan'],
      ['ext-06', 'Minora tepasi — “Order Plaza” belgisi'], ['ext-07', 'Yon (torets) fasad'],
    ],
  },
  vid: {
    label: 'Video',
    note: 'Loyiha animatsiyasi: fasad, koʻcha tomoni, kirish holli va tomdan koʻrinish.',
    items: [],
  },
  det: {
    label: 'Detallar',
    note: 'Fasad detallari: girih panel, terrasa panjarasi, deraza va fransuz balkonlari.',
    items: [
      ['det-01', '9-qavat terrasasi va girih panel'], ['det-02', 'Terrasa burchagi'],
      ['det-03', 'Fasad fragmenti — derazalar'], ['det-04', 'Karniz va terrasa panjarasi'],
      ['var-a4', 'Kirish guruhi'], ['var-a5', 'Minora belgisi va tom terrasasi'],
    ],
  },
  var: {
    label: 'Konsept variantlar',
    note: 'Loyiha jarayonidagi oldingi fasad variantlari: shishali minora, mis rangli panellar.',
    items: [
      ['var-a1', 'A variant — umumiy koʻrinish'], ['var-a2', 'A variant — minora'], ['var-a3', 'A variant — vitrinalar'],
      ['var-a7', 'A variant — old fasad'], ['var-a6', 'A variant — tom terrasasi'],
      ['var-b1', 'B variant — old fasad'], ['var-b2', 'B variant — burchakdan'], ['var-b3', 'B variant — minora'],
      ['var-b4', 'B variant — pastdan'], ['var-b5', 'B variant — daraxtlar ortidan'], ['var-b6', 'B variant — perspektiva'],
      ['var-b7', 'B variant — tom'], ['var-b8', 'B variant — yuqori qavatlar'], ['var-b9', 'B variant — torets'], ['var-b10', 'B variant — markaziy oʻq'],
    ],
  },
};

/* the gallery film: only a poster until the visitor presses play */
export const FILM = { src: 'assets/video/film-720.mp4', poster: 'assets/video/film-poster.webp', len: '1:33' };

export const LOBBY = [
  ['lob-01', 'Kirish holli — “Order Plaza” devori'], ['lob-02', 'Lift holli'], ['lob-04', 'Qavat koridori'],
  ['lob-03', 'Zinapoya va resepshn'], ['lob-05', 'Holl — qora marmar varianti'],
  ['lobby2-3', 'Holl — oltin girih devori'], ['lobby2-5', 'Holl — kutish zonasi'], ['lob-07', 'Koridor — qora marmar'],
  ['lobby2-6', 'Holl — zinapoya tomoni'], ['lob-08', 'Koridor — lift tomoni'],
];

export const STYLES = {
  y: { name: 'Zumrad', desc: 'Toʻq yashil devorlar, oltin detallar va oq marmar. Yotoqxona, oshxona-yemakxona va hammom bir uslubda.', sw: ['#1F4A3A', '#C9A04A', '#EFEDE8', '#8A8F93'],
    imgs: ['int-y1', 'int-y2', 'int-y3', 'int-y4', 'int-y6', 'int-y7', 'int-y5', 'int-y10'] },
  k: { name: 'Toʻq koʻk', desc: 'Toʻq koʻk baxmal va mebel fasadlari, oq paneldagi devorlar, oltin chiroqlar.', sw: ['#1C2C4A', '#C9A04A', '#F1F0EC', '#6D7884'],
    imgs: ['int-k1', 'int-k6', 'int-k3', 'int-k11'] },
  d: { name: 'Grafit', desc: 'Grafit kulrang yumshoq panellar, ikki kishilik xona varianti, kamin-TV devori.', sw: ['#3B4047', '#B9B2A6', '#F2F1EE', '#C9A04A'],
    imgs: ['int-d1', 'int-d2', 'int-d6', 'int-d7', 'int-d3', 'int-d4', 'int-d11'] },
  b: { name: 'Bej', desc: 'Iliq bej va kulrang ranglar, yumshoq bosh taxtasi, oq oshxona.', sw: ['#CBBCA8', '#8D8476', '#F4F2EE', '#3F444A'],
    imgs: ['int-b1', 'int-b6', 'int-b3', 'int-b11'] },
  s: { name: 'Lounge', desc: 'Yashil va oltin rangdagi mehmonxona-lounge: katta divan, girih naqshli devor, halqa chiroqlar.', sw: ['#24503F', '#C9A04A', '#F3F1EC', '#2B2F33'],
    imgs: ['int-s3', 'int-s4', 'int-s1', 'int-s2', 'int-s0'] },
  w: { name: 'Oq marmar', desc: 'Oq marmar devorlar, kulrang-koʻk toʻqimachilik, oltin rangli dush va chiroqlar.', sw: ['#E9E7E3', '#5D6C80', '#C9A04A', '#B8BDC2'],
    imgs: ['int-w1', 'int-w3', 'int-w2', 'int-w4', 'int-w5', 'int-w6'] },
};

export const ICON = {
  arch: <path d="M4 21V9l8-6 8 6v12M9 21v-6h6v6" />,
  frame: <path d="M4 4h16v16H4zM4 12h16M12 4v16" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  flame: <path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z" />,
  fan: <><circle cx="12" cy="12" r="2" /><path d="M12 10c0-4 1-7 4-7s2 5-2 7M14 12c4 0 7 1 7 4s-5 2-7-2M12 14c0 4-1 7-4 7s-2-5 2-7M10 12c-4 0-7-1-7-4s5-2 7 2" /></>,
  therm: <path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z" />,
  drop: <path d="M12 2s7 7.5 7 13a7 7 0 0 1-14 0c0-5.5 7-13 7-13z" />,
  net: <><rect x="9" y="2" width="6" height="5" rx="1" /><rect x="2" y="17" width="6" height="5" rx="1" /><rect x="16" y="17" width="6" height="5" rx="1" /><path d="M12 7v5M5 17v-5h14v5" /></>,
  cam: <path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" />,
  alarm: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />,
};

export const ENG = [
  ['arch', 'Arxitektura yechimlari', 'Qavat rejalari, fasadlar, kesimlar'],
  ['frame', 'Temir-beton konstruksiyalar', 'Monolit karkas, ustunlar va plitalar'],
  ['bolt', 'Elektr jihozlari va yoritish', 'Kuch tarmoqlari va yoritish tizimi'],
  ['sun', 'Quyosh elektr stansiyasi', 'Tomga oʻrnatiladigan fotoelektr panellar'],
  ['flame', 'Gaz taʼminoti', 'Gaz xoʻjaligi va tarmoqlari'],
  ['fan', 'Isitish va ventilyatsiya', 'Havo almashinuvi va isitish'],
  ['therm', 'Issiqlik-mexanik yechimlar', 'Issiqlik punkti va uskunalar'],
  ['drop', 'Suv taʼminoti va kanalizatsiya', 'Ichki va tashqi tarmoqlar'],
  ['net', 'Strukturaviy kabel tizimi', 'Internet, telefon, lokal tarmoq (SKS)'],
  ['cam', 'Videokuzatuv', 'Bino va hudud boʻyicha kameralar'],
  ['alarm', 'Yongʻin signalizatsiyasi', 'Avtomatik aniqlash va ogohlantirish'],
];
