// Order Plaza — interactive 3D maket. Loaded lazily by app.js when the #maket section nears the viewport.
// Geometry comes from the cadastral plans (chizma.pdf): wing 6.70 m + main block 42.40 x 14.10 m. Storey heights from the DWG.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TYPES, MODELS, ROOF10, getPlan, interiorGeometry, nearestFree, findPath, drawMap, spawnPoint, facadeGeometry, planOutline, planCover, planRooms, planFloorOutline } from './interior.js';

// light build: Lambert shading (no PBR, no environment map, no shadow maps) — the maket has to run on ordinary laptops
// and phones; PBR-only options are dropped so callers can keep passing them
const PBR_ONLY = ['roughness', 'metalness', 'roughnessMap', 'metalnessMap', 'normalMap', 'normalScale', 'envMapIntensity'];
const lambert = (o = {}) => new THREE.MeshLambertMaterial(Object.fromEntries(Object.entries(o).filter(([k]) => !PBR_ONLY.includes(k))));
const toLambert = m => {
  if (!m || m.isMeshLambertMaterial) return m;
  return lambert({ color: m.color, map: m.map, vertexColors: m.vertexColors, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
    transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, depthWrite: m.depthWrite });
};

const $ = s => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- building dimensions (metres), from the cadastral plans (chizma.pdf) ---------- */
// wing 6.70 m | tower part 15.4 m | main block 27 m; main block 14.10 m deep; wing 13.80 m deep, 0.6 m proud of
// the street face like the tower (whose 6.4 m centre bay stands 1.75 m out)
const X0 = -24.55, XW = -17.85, XT = -2.45, X1 = 24.55;
const ZF = 7.05, ZB = -7.05, ZWF = 7.65, ZWB = -6.15, ZW1 = -4.6;      // ZW1: back of the wing on the 1st floor
const ENT = { x0: -24.3, x1: -17.6, z0: ZWF, z1: 11.0 };                 // 1st floor entrance hall, 3 m out of the wing
const LG = { x0: X1, x1: 35.0, z0: 0.8, z1: 7.05 };                      // logistics hall past the east end (10.25 m)
const SB = { x0: X1, x1: 26.7, z0: -3.4, z1: 0.8 };                      // stair box behind it
const PIL = [XT, XT + 6, XT + 12, XT + 18, XT + 24, X1];                 // pilasters on the main block's street face
const S9 = { f: 1.45, b: 1.45, r: 3.05 };                                // 9th floor: offices set back behind the terrace
const X9 = X1 - S9.r, ZF9 = ZF - S9.f, ZB9 = ZB + S9.b;
const TF9 = ZF + 0.15, TB9 = ZB - 0.15;                                  // terrace slab: 14.40 m deep, 0.15 m out over the facades below
const SH = { x0: X0, x1: XW, z0: 1.3, z1: ZWF };                         // 10th floor: closed stair hall in the wing, chiller roof behind it
const NF = 10, ROOF = 11;
const FH1 = 4.2, FH = 3.6;                                    // storey heights (+4.200, then every 3.6 m)
const base = n => n === 0 ? -FH : n === 1 ? 0 : FH1 + (n - 2) * FH;
const fh = n => n === 0 ? FH : n === 1 ? FH1 : FH;
const TOP_T = base(NF) + fh(NF);
const level = n => { const b = base(n); return b === 0 ? '±0,00' : (b > 0 ? '+' : '−') + Math.abs(b).toFixed(2).replace('.', ','); };

const FLOORS = {
  0: { lbl: 'Yerto‘la', short: 'Y', text: 'Texnik xonalar, omborlar, zinapoya va ikkita lift.' },
  1: { lbl: 'Savdo qavati', text: 'Koʻcha tomonda 7 ta doʻkon, gʻarbiy qanotda kirish holli (3 m oldinga chiqqan), sharqiy uchida logistika zali.' },
  9: { lbl: 'Terrasa qavati', text: 'Minora qismida ofislar; asosiy blokda ichkariga chekingan ofislar va ularni aylanib oʻtgan ochiq terrasa.' },
  10: { lbl: 'Texnik qavat', text: 'Faqat minora ustida, lift kelmaydi. Zinadan chiqqach ikki eshik: biri katta xonalarga olib boradigan yoʻlakka, biri tepasi ochiq chiller maydoniga.' },
};
for (let n = 2; n <= 8; n++) FLOORS[n] = { lbl: 'Ofis qavati', iso: n <= 7 ? `iso-${n}` : null, text: 'Markaziy koridor, ikki tomonida ofislar, sanuzel va yordamchi xonalar. Zina yonida ikkita lift.' };
const planKey = n => ({ 0: 'b', 1: '1', 2: '2', 3: '3', 4: '3', 5: '3', 6: '6', 7: '7', 8: '7', 9: '9', 10: '10' })[n];
const wallH = n => n === 0 ? 3.2 : n === 1 ? 3.9 : 3.3;    // clear heights
const outline = n => planOutline(planKey(n));
const area = pts => Math.abs(pts.reduce((s, [x, z], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; return s + x * z2 - x2 * z; }, 0) / 2);

export async function initMaket({ img, openImages }) {
  const stage = $('#stage'), maketEl = $('#maketBox');
  // phones and low-memory machines: fewer pixels so the page stays responsive
  const lite = (navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !lite || devicePixelRatio < 1.5, powerPreference: 'high-performance' });
  } catch (e) {
    $('#loaderText').textContent = 'Brauzeringiz WebGL’ni qoʻllamaydi.';
    $('.spin')?.remove();
    return;
  }
  try { await Promise.race([document.fonts.load('600 64px "Space Grotesk"'), new Promise(r => setTimeout(r, 1500))]); } catch (e) {}

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.75));
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  $('#loader').remove();
  stage.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = -1;
  renderer.domElement.setAttribute('aria-label', 'Order Plaza binosining 3D maketi');

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(32, 1, 1, 1500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.enableZoom = false; controls.rotateSpeed = 0.7;
  controls.minDistance = 30; controls.maxDistance = 320;
  controls.minPolarAngle = 0.2; controls.maxPolarAngle = 1.45;
  // vertical swipes keep scrolling the page; horizontal drags rotate the building
  renderer.domElement.style.touchAction = 'pan-y';

  /* ---------- lights: fixed, no shadows (the same light outside and while walking) ---------- */
  const hemi = new THREE.HemisphereLight('#ffffff', '#b8b1a3', 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.0);
  sun.position.set(-60, 95, 70);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#e6eef5', 0.7);    // keeps the faces turned away from the sun readable
  fill.position.set(70, 40, -60);
  scene.add(fill);

  /* ---------- textures ---------- */
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const PX = 56;
  function canvasTex(wm, hm, draw, { flip = true, px = PX } = {}) {
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.min(4096, Math.round(wm * px)));
    c.height = Math.max(8, Math.min(4096, Math.round(hm * px)));
    const g = c.getContext('2d');
    if (flip) g.setTransform(c.width / wm, 0, 0, -c.height / hm, 0, c.height);
    draw(g, wm, hm, c);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    t.userData.canvas = c;
    return t;
  }
  const C = { white: '#F3F2EE', groove: '#DEDBD3', frame: '#E7E4DD', mull: '#4E5B68', rail: '#9FA8AE', gold: '#C9A04A', goldLine: '#8F6D2A' };

  function glassRegion(g, x0, x1, h, mullion, spandrel) {
    const w = x1 - x0;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#26303B'); gr.addColorStop(1, '#45525F');
    g.fillStyle = gr; g.fillRect(x0, 0, w, h);
    if (spandrel > 0) { g.fillStyle = '#1D252E'; g.fillRect(x0, 0, w, spandrel); }
    const n = Math.max(1, Math.round(w / mullion)), step = w / n;
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < n; i += 3) g.fillRect(x0 + i * step, spandrel, step * 0.55, h - spandrel);
    g.fillStyle = C.mull;
    for (let i = 0; i <= n; i++) g.fillRect(x0 + i * step - 0.03, 0, 0.06, h);
    if (spandrel > 0) g.fillRect(x0, spandrel - 0.03, w, 0.06);
    g.fillRect(x0, h - 0.05, w, 0.05);
  }
  function drawBays(g, w, h, bays, { ww = 0.9, y0 = 0.5, y1 = 3.0, railing = true, bg = C.white } = {}) {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const bw = w / bays;
    for (let i = 0; i < bays; i++) {
      const x = bw * i, cx = x + bw / 2;
      g.fillStyle = C.groove; g.fillRect(x + 0.3, 0, 0.04, h); g.fillRect(x + bw - 0.34, 0, 0.04, h);
      g.fillStyle = C.frame; g.fillRect(cx - ww / 2 - 0.1, y0 - 0.1, ww + 0.2, y1 - y0 + 0.2);
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, '#252F39'); gr.addColorStop(1, '#4A5763');
      g.fillStyle = gr; g.fillRect(cx - ww / 2, y0, ww, y1 - y0);
      g.fillStyle = '#5F6C77';
      g.fillRect(cx - 0.025, y0, 0.05, y1 - y0); g.fillRect(cx - ww / 2, y1 - 0.6, ww, 0.05);
      if (railing) {
        g.fillStyle = C.rail; g.fillRect(cx - ww / 2 - 0.05, y0 + 0.9, ww + 0.1, 0.05);
        for (let r = cx - ww / 2; r <= cx + ww / 2 + 1e-3; r += 0.11) g.fillRect(r - 0.012, y0, 0.024, 0.9);
      }
    }
    g.fillStyle = C.groove; g.fillRect(0, 0, w, 0.04);
  }
  const W_T = XT - XW, W_M = X1 - XT, W_W = XW - X0, D = ZF - ZB, D_W = ZWF - ZWB;
  const T = {};
  T.mainFront = canvasTex(W_M, FH, (g, w, h) => drawBays(g, w, h, 12));
  T.mainSide = canvasTex(D, FH, (g, w, h) => drawBays(g, w, h, 5));
  T.mainBack = canvasTex(W_M, FH, (g, w, h) => drawBays(g, w, h, 10, { railing: false }));
  const HW = 3.2;                                     // half width of the projecting centre bay (6.4 m)
  const BAY = 1.75;                                   // how far the centre bay stands out of the facade
  const LOBBY_H = 3.6;                                // entrance hall front: glass up to 3.6 m, slab above
  const W_FL = W_T / 2 - HW;                          // each flank bay
  T.towerCenter = canvasTex(HW * 2, FH, (g, w, h) => {
    g.fillStyle = C.white; g.fillRect(0, 0, w, h);
    glassRegion(g, 0.85, w - 0.85, h, 1.1, 0.0);
    g.fillStyle = C.white; g.fillRect(0.85, h - 0.32, w - 1.7, 0.32);   // slab band between storeys
  });
  T.towerFlank = canvasTex(W_FL, FH, (g, w, h) => {
    g.fillStyle = C.white; g.fillRect(0, 0, w, h);
    for (const a of [0.55, w - 1.55]) {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#232C36'); gr.addColorStop(1, '#3E4B58');
      g.fillStyle = gr; g.fillRect(a, 0.25, 1.0, h - 0.6);
      g.fillStyle = C.mull; g.fillRect(a + 0.48, 0.25, 0.04, h - 0.6);
      g.fillStyle = C.rail; g.fillRect(a - 0.04, 1.15, 1.08, 0.05);
      for (let r = a; r <= a + 1.0; r += 0.1) g.fillRect(r - 0.01, 0.25, 0.02, 0.9);
    }
    g.fillStyle = C.groove; g.fillRect(w / 2 - 0.02, 0, 0.04, h);
  });
  // entrance hall standing out of the wing: glass box with double doors and a white fascia
  const lobbyFace = (g, w, h, doors) => {
    glassRegion(g, 0, w, h, 1.25, 0);
    g.fillStyle = C.white; g.fillRect(0, h - 0.55, w, 0.55);
    g.fillStyle = C.gold; g.fillRect(0, h - 0.55, w, 0.06);
    if (doors) {
      g.fillStyle = '#1E252C'; g.fillRect(w / 2 - 1.15, 0, 2.3, 2.75);
      const dg = g.createLinearGradient(0, 0, 0, 2.7); dg.addColorStop(0, '#5D6E7C'); dg.addColorStop(1, '#8FA2B1');
      g.fillStyle = dg; g.fillRect(w / 2 - 1.09, 0.05, 1.06, 2.64); g.fillRect(w / 2 + 0.03, 0.05, 1.06, 2.64);   // glass leaves
      g.fillStyle = C.gold; g.fillRect(w / 2 - 0.12, 0.9, 0.04, 0.9); g.fillRect(w / 2 + 0.08, 0.9, 0.04, 0.9);
    }
  };
  T.lobbyFront = canvasTex(ENT.x1 - ENT.x0, LOBBY_H, (g, w, h) => lobbyFace(g, w, h, true));
  T.lobbySide = canvasTex(ENT.z1 - ENT.z0, LOBBY_H, (g, w, h) => lobbyFace(g, w, h, false));
  T.towerFront = canvasTex(W_T, FH, (g, w, h) => {
    g.fillStyle = C.white; g.fillRect(0, 0, w, h);
    for (const a of [1.0, 2.1, 3.2, w - 3.6, w - 2.5, w - 1.4]) {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#232C36'); gr.addColorStop(1, '#3E4B58');
      g.fillStyle = gr; g.fillRect(a, 0.1, 0.42, h - 0.1);
      g.fillStyle = C.mull; g.fillRect(a, 2.2, 0.42, 0.05);
    }
    glassRegion(g, w / 2 - 2.7, w / 2 + 2.7, h, 1.08, 0);
  });
  T.towerSide = canvasTex(D, FH, (g, w, h) => drawBays(g, w, h, 4, { railing: false }));
  T.towerBack = canvasTex(W_T, FH, (g, w, h) => drawBays(g, w, h, 5, { railing: false }));
  T.wingFront = canvasTex(W_W, FH, (g, w, h) => glassRegion(g, 0, w, h, 1.1, 0.8));
  T.wingSide = canvasTex(D_W, FH, (g, w, h) => glassRegion(g, 0, w, h, 1.2, 0.8));
  T.headSide = canvasTex(SH.z1 - SH.z0, FH, (g, w, h) => glassRegion(g, 0, w, h, 1.2, 0.8));
  T.glass9 = canvasTex(X9 - XT, FH, (g, w, h) => glassRegion(g, 0, w, h, 1.5, 0.35));
  T.glass9s = canvasTex(ZF9 - ZB9, FH, (g, w, h) => glassRegion(g, 0, w, h, 1.5, 0.35));
  // air-cooled chiller casing: light steel panels, dark condenser louvres along the long sides
  const chillerFace = (g, w, h, louvre) => {
    g.fillStyle = '#CDD1D4'; g.fillRect(0, 0, w, h);
    if (louvre) {
      g.fillStyle = '#3D444B'; g.fillRect(0.15, 0.35, w - 0.3, h - 0.75);
      g.fillStyle = '#6A737B'; for (let x = 0.15; x < w - 0.15; x += 0.07) g.fillRect(x, 0.35, 0.02, h - 0.75);
    } else { g.fillStyle = '#B4B9BD'; g.fillRect(0.2, 0.3, w - 0.4, h - 0.6); }
    g.fillStyle = '#9EA4A9'; for (let x = 0; x <= w; x += 1.4) g.fillRect(x - 0.03, 0, 0.06, h);
  };
  T.chiller = canvasTex(5.6, 2.3, (g, w, h) => chillerFace(g, w, h, true));
  T.chillerEnd = canvasTex(2.2, 2.3, (g, w, h) => chillerFace(g, w, h, false));
  // shop fronts (cadastral plan of the 1st floor): each shop is glazed across its whole frontage in four panes, the
  // middle two are its doors; slim white piers between the shops; the sign box over them is a separate box
  const SHOPS = planRooms('1').filter(r => r.name === 'Магазин').map(r => [r.bb[0], r.bb[2]]).sort((p, q) => p[0] - q[0]);
  const LOGI = planRooms('1').filter(r => r.name === 'Logistika').map(r => [r.bb[0], r.bb[2]]);   // the last shop, past the east end
  // the east stair hall beside the last shops: glazed like them, doors in the middle
  const EASTH = planRooms('1').filter(r => !r.name && r.c[0] > 21 && r.c[0] < X1 && r.area > 10).map(r => [r.bb[0], r.bb[2]]);
  const SHOP_GLASS = LOBBY_H;                          // glazing up to the canopy, level with the entrance hall's
  const shopFront = (g, w, h, entrance, spans = null) => {
    g.fillStyle = C.white; g.fillRect(0, 0, w, h);
    if (!spans) { glassRegion(g, 0, w, SHOP_GLASS, 2.0, 0); return; }
    for (const [a, b, kind] of spans) {
      const gr = g.createLinearGradient(0, 0, 0, SHOP_GLASS); gr.addColorStop(0, '#2C3843'); gr.addColorStop(1, '#4C5B68');
      g.fillStyle = gr; g.fillRect(a, 0, b - a, SHOP_GLASS);
      const q = (b - a) / 4;
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (let k = 0; k < 4; k++) g.fillRect(a + k * q + 0.15, 0.2, q * 0.25, SHOP_GLASS - 0.4);
      g.fillStyle = '#1E252C';
      for (let k = 0; k <= 4; k++) g.fillRect(a + k * q - 0.03, 0, 0.06, SHOP_GLASS);          // frames
      g.fillRect(a, SHOP_GLASS - 0.06, b - a, 0.06); g.fillRect(a, 0, b - a, 0.05);
      if (kind === 'none') continue;
      const c = a + 2 * q;                                                                      // the two doors meet here
      g.fillRect(c - q, 2.55, 2 * q, 0.04);                                                     // door heads
      g.fillStyle = C.gold; g.fillRect(c - 0.2, 0.9, 0.04, 1.0); g.fillRect(c + 0.16, 0.9, 0.04, 1.0);   // pull bars
    }
  };
  T.shopR = canvasTex(X1 - XW, FH1, (g, w, h) => shopFront(g, w, h, false, [...SHOPS, ...EASTH].map(([a, b, k]) => [a - XW, b - XW, k])));
  // sign box over the shops: dark fascia with a light sign panel per shop
  T.banner = canvasTex(LG.x1 - ENT.x1, 0.45, (g, w, h) => {
    g.fillStyle = '#1F252B'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(240,236,226,0.9)';
    for (const [a, b] of [...SHOPS, ...LOGI]) { const c = (a + b) / 2 - ENT.x1, sw = Math.min(3.2, (b - a) * 0.6); g.fillRect(c - sw / 2, 0.1, sw, 0.25); }
  });
  T.shopEs = canvasTex(LG.z1 - LG.z0, FH1, (g, w, h) => shopFront(g, w, h, false, [[0, w, 'none']]));   // glazed east end: four fixed panes
  T.shopE = canvasTex(LG.x1 - LG.x0, FH1, (g, w, h) => {
    const sp = LOGI.map(([a, b]) => [a - LG.x0, b - LG.x0]);
    shopFront(g, w, h, false, sp);
    if (sp.length) { glassRegion(g, 0, sp[0][0], SHOP_GLASS, 1.2, 0); glassRegion(g, sp[0][1], w, SHOP_GLASS, 1.2, 0); }   // fixed glass beside it
  });
  T.gSide = canvasTex(D, FH1, (g, w, h) => { glassRegion(g, 0, w, h, 2.0, 0); g.fillStyle = C.white; g.fillRect(0, h - 0.85, w, 0.85); });
  T.gBack = canvasTex(X1 - X0, FH1, (g, w, h) => drawBays(g, w, h, 14, { ww: 1.4, y0: 0.9, y1: 3.2, railing: false }));
  {
    const speck = (g, x0, y0, w, h, base, n) => {
      g.fillStyle = base; g.fillRect(x0, y0, w, h);
      for (let k = 0; k < n; k++) { const r = Math.random(); g.fillStyle = r < 0.45 ? '#3E4144' : r < 0.7 ? '#77797C' : '#F2F2F0'; g.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, 0.006 + Math.random() * 0.012, 0.006 + Math.random() * 0.01); }
    };
    T.granite = canvasTex(1.2, 2.2, (g, w, h) => {
      speck(g, 0, 0, w, h, '#B4B6B8', 9000);
      const band = (xk, col) => { g.beginPath(); g.moveTo(xk, 0); g.lineTo(xk + 0.55, h / 2); g.lineTo(xk, h); g.lineTo(xk + 0.6, h); g.lineTo(xk + 1.15, h / 2); g.lineTo(xk + 0.6, 0); g.closePath(); g.fillStyle = col; g.fill(); };
      for (const xk of [-1.2, 0, 1.2]) band(xk, 'rgba(232,233,231,0.94)');
      g.strokeStyle = '#1C1E20'; g.lineWidth = 0.012;
      for (const xk of [-1.2, -0.6, 0, 0.6, 1.2]) { g.beginPath(); g.moveTo(xk, 0); g.lineTo(xk + 0.55, h / 2); g.lineTo(xk, h); g.stroke(); }
    }, { px: 220 });
    T.veneer = canvasTex(1.2, 2.4, (g, w, h) => {
      g.fillStyle = '#B98F64'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 520; k++) {                 // fine vertical grain, slightly wavy
        const x = Math.random() * w, a = 0.05 + Math.random() * 0.16, dark = Math.random() < 0.55;
        g.strokeStyle = dark ? `rgba(110,74,44,${a})` : `rgba(226,196,158,${a})`; g.lineWidth = 0.002 + Math.random() * 0.007;
        g.beginPath(); g.moveTo(x, 0);
        for (let y = 0.2; y <= h + 0.01; y += 0.2) g.lineTo(x + Math.sin(y * 1.7 + x * 9) * 0.006, y);
        g.stroke();
      }
    }, { px: 200 });
    T.cgrid = canvasTex(1, 1, (g, w, h) => {
      g.fillStyle = '#0B0C0E'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#3A3E44'; g.lineWidth = 0.012;
      for (let k = 0; k <= 10; k++) { g.beginPath(); g.moveTo(k / 10, 0); g.lineTo(k / 10, h); g.stroke(); g.beginPath(); g.moveTo(0, k / 10); g.lineTo(w, k / 10); g.stroke(); }
    }, { px: 256 });
  }
  T.girih = canvasTex(1, FH, (g, w, h) => {
    g.fillStyle = C.gold; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.goldLine; g.lineWidth = 0.022;
    const s = 0.5, r = s * 0.36;
    for (let y = s / 2; y < h; y += s) for (let x = s / 2; x < w; x += s) {
      for (const rot of [0, Math.PI / 4]) {
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = rot + k * Math.PI / 2 + Math.PI / 4;
          const px = x + Math.cos(a) * r * Math.SQRT2 * 0.75, py = y + Math.sin(a) * r * Math.SQRT2 * 0.75;
          k ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath(); g.stroke();
      }
      g.beginPath(); g.arc(x, y, r * 0.28, 0, Math.PI * 2); g.stroke();
    }
  });
  T.crown = canvasTex(7.9, 4.6, (g, w, h, c) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.white; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = C.groove; g.fillRect(0, c.height - 6, c.width, 6);
    const cx = c.width / 2, ey = c.height * 0.3;
    g.fillStyle = C.gold;
    g.beginPath(); g.moveTo(cx, ey - 70); g.lineTo(cx + 26, ey + 40); g.lineTo(cx - 26, ey + 40); g.closePath(); g.fill();
    g.fillRect(cx - 52, ey + 4, 14, 36); g.fillRect(cx + 38, ey + 4, 14, 36);
    g.font = '600 64px "Space Grotesk", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    try { g.letterSpacing = '6px'; } catch (e) {}
    g.fillStyle = '#A7802F';
    g.fillText('ORDER PLAZA', cx, c.height * 0.64);
    g.font = '500 26px "Space Grotesk", system-ui, sans-serif';
    try { g.letterSpacing = '8px'; } catch (e) {}
    g.fillText('BUSINESS CENTER', cx, c.height * 0.78);
  }, { flip: false, px: 80 });
  const tile = canvasTex(5, 5, (g, w, h) => {
    g.fillStyle = '#ECEAE4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#DCD8CF'; for (let i = 0; i < 5; i++) { g.fillRect(i, 0, 0.02, h); g.fillRect(0, i, w, 0.02); }
  });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(0.2, 0.2);

  /* ---------- materials ---------- */
  const std = o => lambert(o);
  const facade = (t, o = {}) => std(Object.assign({ map: t }, o));
  const M = {
    white: std({ color: C.white }),
    roof: std({ color: '#E1DFD9' }),
    deck: std({ color: '#B9A58A' }),
    dark: std({ color: '#2F3944', roughness: 0.45, metalness: 0.2 }),
    rail: std({ color: '#C9A04A', roughness: 0.35, metalness: 0.6 }),
    steel: std({ color: '#BCC2C6', roughness: 0.5, metalness: 0.4 }),
    solar: std({ color: '#22324A', roughness: 0.12, metalness: 0.8 }),
    green: std({ color: '#6E9E52', flatShading: true }),
    gold: std({ map: T.girih, metalness: 0.45, roughness: 0.38, emissive: '#3a2a08', emissiveIntensity: 0.6 }),
    crown: std({ map: T.crown }),
    mainFront: facade(T.mainFront), mainSide: facade(T.mainSide), mainBack: facade(T.mainBack),
    towerFront: facade(T.towerFront), towerCenter: facade(T.towerCenter), towerFlank: facade(T.towerFlank), towerSide: facade(T.towerSide), towerBack: facade(T.towerBack),
    wingFront: facade(T.wingFront),
    wingSide: facade(T.wingSide), headSide: facade(T.headSide),
    glass9: facade(T.glass9),
    glass9s: facade(T.glass9s),
    chiller: facade(T.chiller), chillerEnd: facade(T.chillerEnd), chillerTop: std({ color: '#4A5056' }),
    fan: std({ color: '#2C3136' }),
    lobbyFront: facade(T.lobbyFront), lobbySide: facade(T.lobbySide),
    shopR: facade(T.shopR), shopEs: facade(T.shopEs), banner: facade(T.banner), bannerTop: std({ color: '#25292D', roughness: 0.8 }), shopE: facade(T.shopE), paving: std({ color: '#D8D4CB' }),
    gSide: facade(T.gSide),
    gBack: facade(T.gBack),
  };

  function box(x0, x1, y0, y1, z0, z1, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  function instBoxes(sx, sy, sz, mat, positions) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(sx, sy, sz), mat, positions.length);
    const m4 = new THREE.Matrix4();
    positions.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
    im.castShadow = im.receiveShadow = true;
    return im;
  }
  // box face order: +x, -x, +y, -y, +z (street), -z
  const faces = (px, nx, front, back, top = M.roof) => [px, nx, top, top, front, back];

  /* ---------- building: one group per floor (0 = basement, 11 = roof) ---------- */
  const building = new THREE.Group();
  scene.add(building);
  const floors = [];
  for (let n = 0; n <= ROOF; n++) {
    const grp = new THREE.Group();
    building.add(grp);
    floors[n] = { n, grp, y: 0, op: 1, mats: [], tw: null };
  }
  const tag = (grp, n) => grp.children.forEach(o => o.userData.floorTag = n);

  // 1 — shops along the street (flush with the facade), the entrance hall 3 m out of the wing, the logistics
  // hall past the east end (cadastral plan of the 1st floor)
  {
    const g = floors[1].grp;
    g.add(box(XW, X1, 0, FH1, ZB, ZF, faces(M.gSide, M.gSide, M.shopR, M.gBack)));
    // shop canopy over the doors, like the entrance hall's but slimmer: 1.1 m out, near-black on top; the sign fascia above
    // one canopy from the entrance hall to the end of the last shop, level with the entrance hall's roof and joining
    // it: 2.2 m out, near-black on top, white underneath; the sign fascia above it
    const CAN = M.bannerTop;                                                                    // dark all over
    g.add(box(ENT.x1, LG.x1, LOBBY_H, LOBBY_H + 0.25, ZF - 0.05, ZF + 2.2, CAN));
    // shop names raised on the front edge of the canopy
    g.add(box(ENT.x1, LG.x1, LOBBY_H + 0.25, LOBBY_H + 0.7, ZF + 2.0, ZF + 2.2, faces(M.bannerTop, M.bannerTop, M.banner, M.bannerTop, M.bannerTop)));
    g.add(box(X0, XW, 0, FH1, ZW1, ZWF, faces(M.white, M.wingSide, M.wingFront, M.white)));
    // entrance hall: glass box with doors, roof slab, steps
    g.add(box(ENT.x0, ENT.x1, 0, LOBBY_H, ENT.z0, ENT.z1, faces(M.lobbySide, M.lobbySide, M.lobbyFront, M.white)));
    g.add(box(ENT.x0 - 0.25, ENT.x1 + 0.25, LOBBY_H, LOBBY_H + 0.25, ENT.z0, ENT.z1 + 0.35, CAN));
    const ec = (ENT.x0 + ENT.x1) / 2;
    g.add(box(ec - 2.2, ec + 2.2, 0, 0.15, ENT.z1, ENT.z1 + 1.2, M.steel));
    g.add(box(ec - 1.9, ec + 1.9, 0.15, 0.3, ENT.z1, ENT.z1 + 0.6, M.steel));
    // logistics hall and the stair box beside it
    g.add(box(LG.x0, LG.x1, 0, FH1, LG.z0, LG.z1, [M.shopEs, M.white, M.bannerTop, M.paving, M.shopE, M.white]));   // glazed front and east end, wall behind; dark roof like the canopy
    g.add(box(SB.x0, SB.x1, 0, FH1, SB.z0, SB.z1, [M.white, M.white, M.bannerTop, M.paving, M.white, M.white]));
    g.add(box(LG.x0, LG.x1, FH1, FH1 + 0.12, LG.z1 - 0.2, LG.z1, M.bannerTop));
    g.add(box(LG.x1 - 0.2, LG.x1, FH1, FH1 + 0.12, LG.z0, LG.z1, M.bannerTop));
  }
  let terracePlants = [];
  // air-cooled chiller on a steel frame, fans on top; alongZ: long side runs front-to-back
  function chiller(g, x, z, y0, l, w, alongZ) {
    const [sx, sz] = alongZ ? [w, l] : [l, w], h = 2.3, b = 0.3;
    g.add(box(x - sx / 2 - 0.2, x + sx / 2 + 0.2, y0, y0 + b, z - sz / 2 - 0.2, z + sz / 2 + 0.2, M.steel));
    g.add(box(x - sx / 2, x + sx / 2, y0 + b, y0 + b + h, z - sz / 2, z + sz / 2,
      alongZ ? faces(M.chiller, M.chiller, M.chillerEnd, M.chillerEnd, M.chillerTop) : faces(M.chillerEnd, M.chillerEnd, M.chiller, M.chiller, M.chillerTop)));
    const n = Math.max(1, Math.floor(l / 1.3)), fan = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.56, 0.56, 0.24, 18), M.fan, n);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < n; k++) {
      const a = -l / 2 + (k + 0.5) * l / n;
      fan.setMatrixAt(k, m4.makeTranslation(alongZ ? x : x + a, y0 + b + h + 0.12, alongZ ? z + a : z));
    }
    g.add(fan);
  }
  // 2..10
  for (let n = 2; n <= NF; n++) {
    const g = floors[n].grp, y0 = base(n), y1 = y0 + fh(n);
    if (n < NF) g.add(box(X0, XW, y0, y1, ZWB, ZWF, faces(M.white, M.wingSide, M.wingFront, M.white)));
    else {
      // top of the wing: open roof for the chillers, only the stair head over the staircase is closed
      g.add(box(SH.x0, SH.x1, y0, y1, SH.z0, SH.z1, faces(M.white, M.headSide, M.wingFront, M.white)));   // glazed like the wing below
      g.add(box(X0, X0 + 0.25, y0, y0 + 1.1, ZWB, SH.z0, M.white));                 // parapet, west end
      g.add(box(X0, XW, y0, y0 + 1.1, ZWB, ZWB + 0.25, M.white));                   // parapet, back
      for (const [x, z, a, b, alongZ] of ROOF10.chillers) chiller(g, x, z, y0, a, b, alongZ);
    }
    if (n < NF) g.add(box(X0 + 1.9, X0 + 3.4, y0, y1, ZWF, ZWF + 0.12, M.gold));
    g.add(box(XW, XT, y0, y1, ZB, ZF, faces(M.towerSide, M.white, M.white, M.towerBack)));
    const cx = (XW + XT) / 2;
    // step 2: flank bays 0.7 m proud of the wing / main block; step 1: centre bay BAY m proud
    g.add(box(XW, cx - HW, y0, y1, ZF - 0.01, ZF + 0.65, faces(M.white, M.white, M.towerFlank, M.white)));
    g.add(box(cx + HW, XT, y0, y1, ZF - 0.01, ZF + 0.65, faces(M.white, M.white, M.towerFlank, M.white)));
    g.add(box(cx - HW, cx + HW, y0, y1, ZF - 0.01, ZF + BAY, faces(M.white, M.white, M.towerCenter, M.white)));
    for (const x of [cx - HW, cx + HW]) g.add(box(x - 0.2, x + 0.2, y0, y1, ZF + 0.6, ZF + BAY + 0.2, M.white));   // framing fins
    for (const x of [XW, XT]) g.add(box(x - 0.2, x + 0.2, y0, y1, ZF, ZF + 0.85, M.white));
    if (n <= 8) {
      g.add(box(XT, X1, y0, y1, ZB, ZF, faces(M.mainSide, M.white, M.mainFront, M.mainBack)));
      const p = PIL.map(x => [x + (x === XT ? 0.25 : x === X1 ? -0.25 : 0), y0 + fh(n) / 2, ZF + 0.11]);
      g.add(instBoxes(0.5, fh(n), 0.22, M.white, p));
      for (const gx of [XT + 9, XT + 21]) g.add(box(gx - 0.7, gx + 0.7, y0, y1, ZF + 0.22, ZF + 0.34, M.gold));
      g.add(box(X1, X1 + 0.12, y0, y1, -0.7, 0.7, M.gold));
      if (n === 8) g.add(box(XT, X1 + 0.3, y1 - 0.45, y1, ZB - 0.3, ZF + 0.4, M.white)); // cornice
    } else if (n === 9) {
      g.add(box(XT, X9, y0, y1, ZB9, ZF9, faces(M.glass9s, M.white, M.glass9, M.glass9)));
      // terrace deck, gold railing and planters around the setback
      g.add(box(XT, X1, y0, y0 + 0.08, TB9, TF9, M.deck));
      g.add(box(XT, X1, y0 - 0.25, y0, TB9, ZB, M.white)); g.add(box(XT, X1, y0 - 0.25, y0, ZF, TF9, M.white));   // slab edge
      const ry = y0 + 1.15;
      g.add(box(XT, X1, ry - 0.06, ry, TF9 - 0.05, TF9 + 0.05, M.rail));
      g.add(box(XT, X1, ry - 0.06, ry, TB9 - 0.05, TB9 + 0.05, M.rail));
      g.add(box(X1 - 0.05, X1 + 0.05, ry - 0.06, ry, TB9, TF9, M.rail));
      const posts = [];
      for (let x = XT + 0.6; x <= X1; x += 1.4) posts.push([x, y0 + 0.6, TF9], [x, y0 + 0.6, TB9]);
      for (let z = TB9; z <= TF9; z += 1.4) posts.push([X1, y0 + 0.6, z]);
      g.add(instBoxes(0.06, 1.1, 0.06, M.rail, posts));
      const spots = [];
      for (let x = XT + 1.6; x < X1 - 0.8; x += 4.4) spots.push([x, ZF - 0.6], [x, ZB + 0.6]);
      for (let z = ZB + 3; z < ZF - 2; z += 4.4) spots.push([X1 - 0.6, z]);
      g.add(instBoxes(0.7, 0.55, 0.7, M.white, spots.map(([x, z]) => [x, y0 + 0.36, z])));
      terracePlants = spots.map(([x, z], i) => ({ m: 'plant', x, z, rot: i * 1.7, y: y0 + 0.62, s: 2.4, v: i }));
      // 9th roof slab: a canopy over the terrace, a little smaller than it, on slender columns
      const RX = X1 - 0.9, RF = ZF - 0.6, RB = ZB + 0.6;
      g.add(box(XT - 0.1, RX, y1, y1 + 0.32, RB, RF, M.white));
      g.add(box(XT - 0.1, RX, y1 - 0.06, y1, RB, RF, M.dark));
      const cols = [];
      for (let x = XT + 4.5; x < RX; x += 9) cols.push([x, (y0 + y1) / 2, RF - 0.3], [x, (y0 + y1) / 2, RB + 0.3]);
      cols.push([RX - 0.3, (y0 + y1) / 2, RF - 0.3], [RX - 0.3, (y0 + y1) / 2, RB + 0.3]);
      g.add(instBoxes(0.22, y1 - y0, 0.22, M.white, cols));
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 1.8), M.solar);
        sp.position.set(XT + 3.2 + i * 5.2, y1 + 0.9, -1.2); sp.rotation.x = -0.4;
        sp.castShadow = true; g.add(sp);
        const sp2 = sp.clone(); sp2.position.z = 2.6; g.add(sp2);
      }
    }
  }
  // roof: tower crown, parapets, solar on the tower roof
  {
    const g = floors[ROOF].grp, cx = (XW + XT) / 2;
    g.add(box(SH.x0 - 0.1, SH.x1 + 0.1, TOP_T, TOP_T + 0.3, SH.z0 - 0.1, SH.z1 + 0.1, M.white));   // stair head roof; the chiller roof stays open
    g.add(box(XW, XT, TOP_T, TOP_T + 0.6, ZB, ZF + 0.85, M.white));
    // logo crown: runs the whole depth of the tower, logo and lettering on the street face and on the back face
    g.add(box(cx - HW - 0.2, cx + HW + 0.2, TOP_T, TOP_T + 4.6, ZB - 0.2, ZF + BAY + 0.2, faces(M.white, M.white, M.crown, M.crown)));
    g.add(box(cx - HW - 1.6, cx + HW + 1.6, TOP_T + 2.2, TOP_T + 2.5, ZB + 0.4, ZF + BAY - 0.4, M.white));
    // solar panels on the strips left and right of the crown
    for (const x of [XW + 2.1, XT - 2.1]) for (let j = 0; j < 4; j++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.8), M.solar);
      sp.position.set(x, TOP_T + 1.2, -5.4 + j * 2.8); sp.rotation.x = -0.4;
      sp.castShadow = true; g.add(sp);
    }
  }
  // basement shell sits underground; only its cut view is ever shown
  floors.forEach((f, i) => f.grp.traverse(o => { if (o.isMesh) o.userData.floor = i === ROOF ? NF : i; }));

  /* ---------- cut views: furnished interior traced from the plans (built on first visit) ---------- */
  const cuts = [];
  for (let n = 0; n <= NF; n++) {
    const grp = new THREE.Group(); grp.visible = false;
    building.add(grp);
    const y0 = base(n), pts = outline(n);
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const slab = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), std({ color: '#E3DED5', roughness: 0.95 }));
    slab.position.y = y0 + 0.01; slab.receiveShadow = true;
    grp.add(slab);
    const under = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), M.dark);
    under.position.y = y0 - 0.25; grp.add(under);
    cuts[n] = { n, grp, y: 0, op: 0, mats: [], tw: null, area: area(pts), shape, built: false, ceiling: null, slab, under };
  }
  /* ---------- interior materials: Poly Haven textures (CC0), loaded on the first open floor ---------- */
  const texLoader = new THREE.TextureLoader();
  const texCache = {};
  function tex(name, kind, metres) {
    const key = `${name}_${kind}`;
    if (!texCache[key]) {
      const t = texLoader.load(`assets/tex/${key}.webp?v=2`, () => request());
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
      if (kind === 'diff') t.colorSpace = THREE.SRGBColorSpace;
      texCache[key] = t;
    }
    const t = texCache[key].clone();          // own repeat, shared image
    t.repeat.set(1 / metres, 1 / metres);
    return t;
  }
  // key: [texture set, metres per tile, extra material props]
  const TEXMAT = {
    plaster: ['plaster', 2.2, { normalScale: new THREE.Vector2(0.3, 0.3) }],
    parquet: ['parquet', 1.8, {}], marble: ['marble', 2.6, { roughness: 0.55 }], tiles: ['tiles', 1.2, {}],
    stone: ['stone', 2.0, {}], concrete: ['concrete', 3.0, {}], oak: ['oak', 1.4, {}],
    fabric: ['fabric', 0.6, { roughness: 1 }], linen: ['fabric', 1.2, { roughness: 1 }], leather: ['leather', 0.8, {}],
  };
  const PLAINMAT = {
    plain: { roughness: 0.85 }, gloss: { roughness: 0.16 }, metal: { roughness: 0.28, metalness: 0.9 },
    mirror: { roughness: 0.02, metalness: 1 },
    glass: { roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false },
    led: { emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 1 },
  };
  const matCache = {};
  function baseMat(key) {
    if (matCache[key]) return matCache[key];
    let m;
    if (TEXMAT[key]) {
      const [set, metres, extra] = TEXMAT[key];
      m = lambert(Object.assign({
        vertexColors: true, map: tex(set, 'diff', metres),
      }, extra));
    } else if (key === 'granite') {             // corridor floor: chevrons of light marble and speckled granite
      const t = T.granite.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 1.2, 1 / 2.2); t.offset.set(0, 0.5 + 0.1 / 2.2); t.needsUpdate = true;
      m = lambert({ vertexColors: true, map: t, roughness: 0.22, metalness: 0.05 });
    } else if (key === 'veneer') {              // light oak veneer of the corridor render
      const t = T.veneer.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 1.2, 1 / 2.4); t.needsUpdate = true;
      m = lambert({ vertexColors: true, map: t, roughness: 0.6 });
    } else if (key === 'cgrid') {               // black open-cell grid ceiling
      const t = T.cgrid.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); t.needsUpdate = true;
      m = lambert({ vertexColors: true, map: t, roughness: 0.85, side: THREE.DoubleSide });
    } else if (key === 'girih') {               // gold lattice screen of the lobby, world-space uv in metres
      const t = T.girih.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1 / 3.4); t.needsUpdate = true;
      m = lambert({ vertexColors: true, map: t, metalness: 0.5, roughness: 0.35, emissive: '#3a2a08', emissiveIntensity: 0.35 });
    } else m = lambert(Object.assign({ vertexColors: true }, PLAINMAT[key] || PLAINMAT.plain));
    matCache[key] = m;
    return m;
  }

  /* ---------- furniture models (Poly Haven CC0 + project GLBs), instanced per floor ---------- */
  let modelsP = null;
  function loadModels() {
    return modelsP ||= Promise.all([
      import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js'),
    ]).then(([{ GLTFLoader }, { DRACOLoader }]) => {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/'));
      const all = Object.keys(MODELS).length;
      let done = 0;
      busy('Mebel yuklanmoqda', 0);
      return Promise.all(Object.entries(MODELS).map(([k, m]) => new Promise(res => {
        const url = m.glb ? `assets/models/${m.file}.glb?v=1` : `assets/models/${m.file}/${m.file}.gltf`;
        const fin = v => { busy('Mebel yuklanmoqda', ++done / all); res(v); };
        loader.load(url, g => {
          g.scene.updateMatrixWorld(true);
          const collect = (root, origin) => {
            const parts = [], inv = new THREE.Matrix4().makeTranslation(-origin.x, 0, -origin.z);
            root.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry, mat: toLambert(o.material), mx: inv.clone().multiply(o.matrixWorld) }); });
            return parts;
          };
          const variants = m.variants ? g.scene.children.map(c => collect(c, c.position)) : [collect(g.scene, new THREE.Vector3())];
          fin([k, variants]);
        }, undefined, () => fin([k, [[]]]));
      }))).then(Object.fromEntries);
    });
  }
  // small "loading…" badge in the stage corner while anything heavy is still on its way
  const busyEl = document.createElement('div');
  busyEl.className = 'm-busy'; busyEl.hidden = true; busyEl.setAttribute('role', 'status');
  stage.appendChild(busyEl);
  function busy(text, k) {
    busyEl.hidden = k >= 1;
    busyEl.innerHTML = `<span class="spin" aria-hidden="true"></span>${text}… ${Math.round(k * 100)}%`;
  }
  // door leaves: the Vogue leaf model replaces the plain boxes once it has arrived
  function dressDoors(c) {
    loadModels().then(models => {
      const part = models.door?.[0]?.[0];
      if (!part) return;
      const geo = c.doorGeo ||= part.geo.clone().applyMatrix4(part.mx);
      for (const d of c.doors || []) {
        if (d.kind === 'glass' || d.fixed || !d.leaf) continue;
        d.leaf.geometry = geo;
        // mirrored so the handle sits on the free edge, away from the hinge at x = 0
        d.leaf.scale.set(-d.w / MODELS.door.w, d.h / MODELS.door.h, 0.045 / 0.05);
        d.leaf.position.y = 0.01;
        // the gold handles stay: they mark the leaf against the wall
      }
      shadowDirty = true; request();
    });
  }
  function addProps(c, props, y0) {
    loadModels().then(models => {
      const groups = {};
      for (const p of props) { const vs = models[p.m] || [[]], v = (p.v || 0) % vs.length; (groups[`${p.m}|${v}`] ||= []).push(p); }
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
      for (const [key, list] of Object.entries(groups)) {
        const [k, v] = key.split('|');
        for (const part of models[k][+v]) {
          const mat = part.mat.clone(); mat.userData.baseOpacity = mat.opacity;
          const im = new THREE.InstancedMesh(part.geo, mat, list.length);
          list.forEach((p, i) => {
            const s = p.s || 1;
            m4.compose(new THREE.Vector3(p.x, y0 + (p.y || 0), p.z), q.setFromAxisAngle(up, p.rot), sc.set(s, s, s)).multiply(part.mx);
            im.setMatrixAt(i, m4);
          });
          im.receiveShadow = true; im.castShadow = k !== 'plant';
          im.traverse(o => o.userData.floor = c.n);
          c.grp.add(im); c.mats.push(mat);
        }
      }
      setOpacity(c, c.op); shadowDirty = true; request();
    });
  }

  // telescopic leaves: they gather against the jambs instead of sliding out of the narrow shaft
  function setLiftDoors(L) {
    const k = 1 - 0.9 * L.open, half = L.width / 2, lw = half * k, off = half - lw / 2;
    L.leaves.forEach((m, i) => {
      const sgn = i ? 1 : -1;
      m.scale.x = k;
      m.position.set(L.x + sgn * L.sx * off + L.nx * 0.02, L.y, L.z + sgn * L.sz * off + L.nz * 0.02);
    });
  }
  // the reception that stands out of the 1st floor under the tower's centre bay: the outside shell is hidden while the
  // floor is cut open, so the cut view gets its own open-top version of the part in front of the podium
  // (glass walls, doors, steps); the reception desk itself stands in the lobby behind it
  function ensureInterior(n) {
    const c = cuts[n];
    if (c.built) return;
    c.built = true;
    if (n === 1) {        // the 1st floor's fronts are redrawn in its plan: the slab follows them
      c.shape = new THREE.Shape(planFloorOutline('1').map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const m of [c.slab, c.under]) { m.geometry.dispose(); m.geometry = new THREE.ShapeGeometry(c.shape).rotateX(-Math.PI / 2); }
    }
    const g = interiorGeometry(planKey(n), wallH(n), fh(n)), y0 = base(n) + 0.03;
    if (g.holes.length) {
      // open the slab over the descending flight so you can look down the stairwell
      const holed = new THREE.Shape(c.shape.getPoints());
      for (const [ax, az, bx, bz] of g.holes) holed.holes.push(new THREE.Path([new THREE.Vector2(ax, -az), new THREE.Vector2(ax, -bz), new THREE.Vector2(bx, -bz), new THREE.Vector2(bx, -az)]));
      for (const m of [c.slab, c.under]) { m.geometry.dispose(); m.geometry = new THREE.ShapeGeometry(holed).rotateX(-Math.PI / 2); }
    }
    for (const [k, geo] of Object.entries(g.meshes)) {
      const key = k.replace('f:', ''), m = baseMat(key).clone();
      m.userData.baseOpacity = m.opacity;
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = y0; mesh.receiveShadow = true;
      mesh.castShadow = key === 'plaster' || k.startsWith('f:');
      if (key === 'glass') mesh.renderOrder = 2;
      c.grp.add(mesh); c.mats.push(m);
    }
    // ceiling with LED panels, only shown while walking inside
    const ceil = new THREE.Group(); ceil.visible = false;
    const ceilShape = new THREE.Shape(c.shape.getPoints());
    for (const [ax, az, bx, bz] of g.ceilHoles || []) ceilShape.holes.push(new THREE.Path([new THREE.Vector2(ax, -az), new THREE.Vector2(ax, -bz), new THREE.Vector2(bx, -bz), new THREE.Vector2(bx, -az)]));
    const slab = new THREE.Mesh(new THREE.ShapeGeometry(ceilShape).rotateX(Math.PI / 2), lambert({ color: '#F4F2EE', roughness: 1, side: THREE.DoubleSide, emissive: '#d8d3cb', emissiveIntensity: 0.45 }));
    slab.scale.z = -1; slab.position.y = y0 + wallH(n) + 0.02;
    ceil.add(slab);
    for (const [k, geo] of Object.entries(g.ceiling)) { const mesh = new THREE.Mesh(geo, baseMat(k)); mesh.position.y = y0; ceil.add(mesh); }
    c.grp.add(ceil); c.ceiling = ceil;
    // lift doors: two brushed-steel leaves that slide apart
    const steel = lambert({ color: '#C8CDD2', metalness: 0.9, roughness: 0.32 });
    steel.userData.baseOpacity = 1; c.mats.push(steel);
    c.lifts = (g.lifts || []).map(L => {
      const len = Math.hypot(L.sx, L.sz), sx = L.sx / len, sz = L.sz / len, nl = Math.hypot(L.nx, L.nz);
      const geo = new THREE.BoxGeometry(L.width / 2, 2.12, 0.04);
      const leaves = [new THREE.Mesh(geo, steel), new THREE.Mesh(geo, steel)];
      for (const m of leaves) { m.rotation.y = Math.atan2(sz, sx) * -1; m.castShadow = true; c.grp.add(m); }
      const lift = { ...L, sx, sz, nx: L.nx / nl, nz: L.nz / nl, leaves, open: 0, hold: false, y: y0 + 1.07 };
      setLiftDoors(lift);
      return lift;
    });
    // lobby logo wall: brushed-gold lettering on the walnut panel
    for (const f of g.features || []) if (f.type === 'logo') {
      const t = canvasTex(f.w, f.h, (gx, w, h) => {
        gx.setTransform(gx.canvas.width / w, 0, 0, gx.canvas.height / h, 0, 0);
        gx.clearRect(0, 0, w, h);
        gx.fillStyle = C.gold; gx.textAlign = 'center'; gx.textBaseline = 'middle';
        gx.font = `600 ${h * 0.34}px Montserrat, "Segoe UI", sans-serif`;
        gx.fillText('ORDER PLAZA', w / 2, h * 0.42);
        gx.fillRect(w * 0.18, h * 0.72, w * 0.64, h * 0.025);
        gx.font = `500 ${h * 0.11}px Montserrat, "Segoe UI", sans-serif`; gx.fillStyle = '#E9D9B0';
        gx.fillText('BUSINESS CENTER', w / 2, h * 0.86);
      }, { flip: false, px: 160 });
      const m = lambert({ map: t, transparent: true, metalness: 0.6, roughness: 0.3, emissive: '#5a4210', emissiveMap: t, emissiveIntensity: 0.4 });
      m.userData.baseOpacity = 1; c.mats.push(m);
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), m);
      logo.position.set(f.x, y0 + f.y, f.z); logo.rotation.y = Math.atan2(f.nx, f.nz);
      c.grp.add(logo);
    }
    // doors: closed leaves on hinges, they swing open as you walk up to them
    const wood = lambert({ color: '#5A3B29' });            // dark walnut leaves, not the light oak of the wall panels
    const dm = {
      wood, wc: lambert({ color: '#F4F3F0', roughness: 0.2 }),
      glass: lambert({ color: '#CFE3EE', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }),
      frost: lambert({ color: '#E3EBEE', transparent: true, opacity: 0.62, depthWrite: false }),
      gold: lambert({ color: '#D2A954', metalness: 0.9, roughness: 0.28 }),
      frame: lambert({ color: '#2E343A', metalness: 0.7, roughness: 0.35 }),
    };
    for (const m of Object.values(dm)) { m.userData.baseOpacity = m.opacity; c.mats.push(m); }
    c.doors = (g.doors || []).map(D => {
      const pivot = new THREE.Group(); pivot.position.set(D.x, y0, D.z);
      const box = (sx, sy, sz, px, py, pz, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(px, py, pz); pivot.add(b); return b; };
      const glassy = D.kind === 'glass' || D.fixed, handles = [];        // fixed side panels are frosted glass
      const leaf = box(D.w, D.h, glassy ? 0.02 : 0.045, D.w / 2, D.h / 2 + 0.01, 0, glassy ? (D.fixed ? dm.frost : dm.glass) : D.kind === 'wc' ? dm.wc : dm.wood);
      leaf.castShadow = !glassy;
      if (glassy) {
        box(D.w, 0.08, 0.05, D.w / 2, 0.05, 0, dm.frame); box(D.w, 0.06, 0.05, D.w / 2, D.h - 0.02, 0, dm.frame);
        box(0.05, D.h, 0.05, D.w - 0.025, D.h / 2 + 0.01, 0, dm.frame); box(0.05, D.h, 0.05, 0.025, D.h / 2 + 0.01, 0, dm.frame);
        if (!D.fixed) for (const z of [-0.05, 0.05]) box(0.03, 0.9, 0.03, D.w - 0.14, 1.05, z, dm.gold);
      } else for (const z of [-0.085, 0.085]) handles.push(box(0.14, 0.025, 0.03, D.w - 0.13, 1.0, z, dm.gold), box(0.06, 0.12, 0.012, D.w - 0.08, 1.0, z * 0.75, dm.gold));
      c.grp.add(pivot);
      const door = { ...D, pivot, leaf, handles, open: 0, cx: D.x + D.ax * D.w / 2, cz: D.z + D.az * D.w / 2 };
      setDoor(door);
      return door;
    });
    dressDoors(c);
    addProps(c, g.props, y0);
    setOpacity(c, c.op);
  }

  // clone materials per group so each floor can fade on its own; tag meshes with floor number
  const pickables = [];
  function own(entry, floorNo, pick = true) {
    const cache = new Map();
    const cl = m => { if (!cache.has(m)) { const c = m.clone(); c.userData.baseOpacity = m.opacity; cache.set(m, c); entry.mats.push(c); } return cache.get(m); };
    entry.grp.traverse(o => {
      if (!o.isMesh) return;
      if (o.material === entry.slabMat) { entry.mats.push(o.material); o.material.userData.baseOpacity = 1; }
      else o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material);
      if (floorNo != null) o.userData.floor = floorNo;
      if (pick) pickables.push(o);
    });
  }
  floors.forEach((f, i) => own(f, null, i > 0));
  cuts.forEach((c, i) => own(c, i));
  cuts.forEach(c => setOpacity(c, 0));

  function setOpacity(entry, op) {
    for (const m of entry.mats) {
      const want = op < 0.999 || m.userData.baseOpacity < 1;
      if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
      m.opacity = op * (m.userData.baseOpacity ?? 1);
    }
  }

  /* ---------- surroundings ---------- */
  const PARK = { z: 16.95, step: 3.5, ang: Math.PI / 4 };          // angled parking: bay centre line, spacing, angle
  const env = new THREE.Group(); scene.add(env);
  const ground = { mats: [], op: 1, tw: null, grp: env, y: 0 };
  const flat = (x0, x1, z0, z1, y, color) => {
    const mat = std({ color });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true;
    mat.userData.baseOpacity = 1; ground.mats.push(mat);
    env.add(m); return m;
  };
  flat(-700, 700, -700, 700, 0, '#D6DDD0');
  flat(-36, 36, -18, 12.2, 0.02, '#E6E4DE');     // plot paving + front sidewalk
  flat(-90, -27, 12.2, 14.6, 0.03, '#8DB466');   // green strip: grass and one row of trees, before the parking
  flat(-15, 90, 12.2, 14.6, 0.03, '#8DB466');     // (paved in front of the main entrance)
  flat(-27, -15, 12.2, 14.6, 0.022, '#E6E4DE');
  flat(-90, 90, 14.6, 20.4, 0.025, '#B7BCBF');   // parking, bays at 45°
  flat(-700, 700, 20.4, 21.4, 0.03, '#C9CCCB');  // curb
  flat(-700, 700, 21.4, 36.2, 0.02, '#A1A7AB');  // road
  flat(-700, 700, 36.2, 40.2, 0.03, '#E2E0DA');  // far sidewalk
  flat(56, 75, -700, 700, 0.015, '#A1A7AB');     // avenue to the east
  flat(64.6, 66.4, -700, 19.8, 0.035, '#C3D1B3');
  flat(64.6, 66.4, 40.2, 700, 0.035, '#C3D1B3');
  const lineM = std({ color: '#F4F3EF' });
  {
    const bays = [], dashes = [];
    // angled bays: lines at 45°, 3.5 m apart along the kerb (2.5 m stalls)
    const bl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.02, 5.4), lineM, Math.ceil(70 / PARK.step) + 1);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PARK.ang), one = new THREE.Vector3(1, 1, 1);
    let nb = 0; for (let x = -34; x <= 34; x += PARK.step) bl.setMatrixAt(nb++, m4.compose(new THREE.Vector3(x, 0.04, PARK.z), q, one));
    bl.count = nb; env.add(bl);
    env.add(instBoxes(70, 0.02, 0.12, lineM, [[0, 0.04, 14.75]]));
    for (let x = -300; x <= 300; x += 9) if (x < 54 || x > 77) dashes.push([x, 0.035, 28.8]);
    env.add(instBoxes(3.2, 0.02, 0.2, lineM, dashes));
  }

  let seed = 7;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // neighbours
  {
    const list = [
      [-56, -3, 26, 18, 8], [-92, 2, 22, 30, 14], [40, -6, 12, 12, 7], [36, -40, 20, 14, 10],
      [-52, 70, 34, 16, 7], [12, 72, 28, 16, 9], [48, 72, 20, 16, 6],
      [96, -22, 30, 24, 18], [96, 30, 26, 20, 12], [-30, -66, 34, 14, 12],
    ];
    for (let i = -4; i <= 3; i++) for (let j = 0; j < 3; j++) {
      if (rnd() < 0.2) continue;
      list.push([-40 + i * 12.5 + rnd() * 3, -30 - j * 12 - rnd() * 2, 8 + rnd() * 2, 8 + rnd() * 2, 3 + rnd() * 1.6]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std({ color: '#ffffff', roughness: 0.95 }), list.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const tones = ['#E6E4DE', '#E0DED7', '#EAE8E2', '#DDDBD3'];
    list.forEach(([x, z, w, d, h], i) => {
      m4.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
      im.setMatrixAt(i, m4); im.setColorAt(i, col.set(tones[i % tones.length]));
    });
    im.castShadow = im.receiveShadow = true;
    env.add(im);
  }

  // trees
  {
    const spots = [];
    const add = (x, z, s = 1) => spots.push([x + (rnd() - 0.5) * 1.2, z + (rnd() - 0.5) * 0.3, s * (0.85 + rnd() * 0.35)]);
    const entry = (X0 + XW) / 2;                                   // keep the entrance (wing, 3 m out) in view
    for (let x = -33; x <= 40; x += 7.5) if (Math.abs(x - entry) > 5) add(x, 13.4, 1.0);   // one row in the green strip
    for (let x = -130; x <= 130; x += 18) if (x < 52 || x > 79) add(x, 38.4);
    for (let z = -150; z <= 150; z += 22) if (z < 18 || z > 42) add(65.5, z);
    for (let i = 0; i < 4; i++) add(-30 + i * 20 + rnd() * 4, -13, 0.9);
    for (let i = 0; i < 8; i++) add(-66 + rnd() * 116, -28 - rnd() * 38, 0.95);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6), std({ color: '#8C7862' }), spots.length);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std({ color: '#ffffff', flatShading: true, roughness: 0.9 }), spots.length * 2);
    const greens = ['#86B062', '#93BC6C', '#76A657', '#9DC476', '#7DAA5C'];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    spots.forEach(([x, z, s], i) => {
      m4.compose(new THREE.Vector3(x, 1.2 * s, z), q.identity(), new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, m4);
      const r = 2.3 * s;
      m4.compose(new THREE.Vector3(x, 3.6 * s, z), q.setFromEuler(new THREE.Euler(rnd(), rnd(), 0)), new THREE.Vector3(r, r * 0.95, r));
      crowns.setMatrixAt(i * 2, m4); crowns.setColorAt(i * 2, col.set(greens[i % greens.length]));
      const r2 = r * 0.7;
      m4.compose(new THREE.Vector3(x + (rnd() - 0.5) * 1.4, 5.2 * s, z + (rnd() - 0.5) * 1.4), q.setFromEuler(new THREE.Euler(rnd(), rnd(), 0)), new THREE.Vector3(r2, r2, r2));
      crowns.setMatrixAt(i * 2 + 1, m4); crowns.setColorAt(i * 2 + 1, col.set(greens[(i + 2) % greens.length]));
    });
    trunks.castShadow = crowns.castShadow = true; crowns.receiveShadow = true;
    env.add(trunks, crowns);
  }

  // cars
  {
    const cars = [];
    for (let x = -34; x < 34; x += PARK.step) if (rnd() > 0.3) cars.push([x + PARK.step / 2, PARK.z, PARK.ang]);
    const lanes = [[-80, 25.2], [-34, 25.2], [22, 25.2], [-55, 32.2], [8, 32.2], [44, 32.2], [65 - 4.2, -40], [65 + 4.2, 80]];
    lanes.forEach(([x, z], i) => cars.push([x, z, i >= 6 ? 0 : Math.PI / 2]));
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.85, 0.78, 4.3), std({ color: '#ffffff', roughness: 0.35, metalness: 0.3 }), cars.length);
    const cab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.62, 0.62, 2.3), std({ color: '#36414B', roughness: 0.25, metalness: 0.3 }), cars.length);
    const paints = ['#F3F3F1', '#1D2125', '#E7E8E8', '#BFC4C7', '#2A2F35', '#F3F3F1', '#8F969B', '#F3F3F1', '#1D2125', '#4B5560'];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), one = new THREE.Vector3(1, 1, 1);
    cars.forEach(([x, z, ry], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      m4.compose(new THREE.Vector3(x, 0.62, z), q, one); body.setMatrixAt(i, m4);
      body.setColorAt(i, col.set(paints[i % paints.length]));
      const off = new THREE.Vector3(0, 0, 0.3).applyQuaternion(q);
      m4.compose(new THREE.Vector3(x + off.x, 1.3, z + off.z), q, one); cab.setMatrixAt(i, m4);
    });
    body.castShadow = cab.castShadow = true;
    env.add(body, cab);
  }

  /* ---------- hover highlight ---------- */
  const ACCENT = '#C9A04A';
  const hlMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.3, depthWrite: false });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hlMat);
  hl.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: ACCENT })));
  hl.visible = false; hl.renderOrder = 2;
  scene.add(hl);
  function showHighlight(n) {
    if (n == null || n === 0) { hl.visible = false; return; }
    const y0 = base(n), h = fh(n), x1 = n === NF ? XT : X1;
    hl.scale.set(x1 - X0 + 0.9, h - 0.08, ZF - ZB + 1.3);
    hl.position.set((X0 + x1) / 2, y0 + h / 2, (ZF + ZB) / 2 + 0.2);
    hl.visible = true;
  }

  /* ---------- render on demand ---------- */
  let raf = 0, shadowDirty = true, warmNext = () => {};
  const request = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const tweens = new Set();
  const easeInOut = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  function tween(o) { const tw = Object.assign({ start: performance.now() + (o.delay || 0), ease: easeInOut, dead: false }, o); tweens.add(tw); request(); return tw; }
  let slowFrames = 0, prevFrame = 0;
  function frame(now) {
    raf = 0;
    const gap = now - prevFrame; prevFrame = now;
    if (gap < 250) {
      slowFrames = gap > 34 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 24 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25)); slowFrames = 0; resize(); }
    }
    let floorMoving = false;
    for (const tw of tweens) {
      if (tw.dead) { tweens.delete(tw); continue; }
      if (now < tw.start) continue;
      const k = Math.min(1, (now - tw.start) / tw.dur);
      tw.update(tw.ease(k));
      if (tw.shadow) floorMoving = true;
      if (k >= 1) { tweens.delete(tw); tw.done && tw.done(); }
    }
    let moved = false;
    if (walking) {
      const dt = W.last ? Math.min(0.05, (now - W.last) / 1000) : 0.016;
      moved = walkStep(dt); W.last = moved || W.keys.size ? now : 0;
    } else moved = controls.update();
    if (floorMoving || shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    renderer.render(scene, camera);
    updateLabels();
    if (tweens.size || moved || W.keys.size) request();
  }
  controls.addEventListener('change', request);

  function animateEntry(e, to, { dur = 650, delay = 0, ease = easeInOut } = {}) {
    if (e.tw) e.tw.dead = true;
    const from = { y: e.y, op: e.op };
    if (reduceMotion) { dur = 1; delay = 0; }
    e.tw = tween({
      dur, delay, ease, shadow: true,
      update: k => {
        if (to.op > 0) e.grp.visible = true;
        e.y = from.y + (to.y - from.y) * k; e.op = from.op + (to.op - from.op) * k;
        if (e !== ground) e.grp.position.y = e.y;
        setOpacity(e, e.op);
      },
      done: () => { e.tw = null; if (e.op <= 0.001 && e !== ground) e.grp.visible = false; },
    });
  }

  /* ---------- camera ---------- */
  let narrow = false;
  const overviewTarget = () => new THREE.Vector3(0, 15, 0);
  function fitRadius(w, min) {
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hv = Math.atan(Math.tan(v) * camera.aspect);
    return Math.max(min, (w / 2) / Math.tan(hv));
  }
  const overviewRadius = () => fitRadius(narrow ? 76 : 64, 122);
  const floorRadius = () => fitRadius(narrow ? 66 : 58, 96);
  let camTw = null;
  function flyTo(target, radius, phi, dur = 950, theta = null) {
    if (camTw) camTw.dead = true;
    const t0 = controls.target.clone();
    const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t0));
    const dTh = theta == null ? 0 : Math.atan2(Math.sin(theta - s0.theta), Math.cos(theta - s0.theta));
    if (reduceMotion) dur = 1;
    controls.enabled = false;
    camTw = tween({
      dur,
      update: k => {
        controls.target.lerpVectors(t0, target, k);
        const s = new THREE.Spherical(s0.radius + (radius - s0.radius) * k, s0.phi + (phi - s0.phi) * k, s0.theta + dTh * k);
        camera.position.setFromSpherical(s).add(controls.target);
        camera.lookAt(controls.target);
      },
      done: () => { controls.enabled = true; camTw = null; },
    });
  }
  function dolly(f) {
    if (camTw) return;
    const off = camera.position.clone().sub(controls.target);
    const r = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
    const from = off.length();
    tween({ dur: reduceMotion ? 1 : 260, ease: easeOut, update: k => {
      const o = camera.position.clone().sub(controls.target).setLength(from + (r - from) * k);
      camera.position.copy(controls.target).add(o);
    } });
  }

  /* ---------- floor rail ---------- */
  const rail = $('#floors');
  const btns = {};
  const floorLabel = n => FLOORS[n].lbl;
  for (let n = NF; n >= 0; n--) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'fbtn';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', n === 0 ? 'Yerto‘la' : `${n}-qavat, ${floorLabel(n).toLowerCase()}`);
    b.innerHTML = `<span class="num">${FLOORS[n].short || n}</span><span class="meta"><span class="lbl">${floorLabel(n)}</span><span class="lvl">${level(n)}</span></span>`;
    rail.appendChild(b);
    btns[n] = b;
  }
  if (matchMedia('(pointer: coarse)').matches) $('#hint').textContent = 'Gorizontal suring — aylantirish';

  /* ---------- selection: building → floor → room → walk inside ---------- */
  let selected = null, room = null, walking = false;
  const isFloorVisible = n => selected == null || n < selected;
  const planOf = n => getPlan(planKey(n));
  const pickRooms = n => planOf(n).rooms.filter(r => TYPES[r.type].pick).sort((a, b) => a.idx - b.idx);
  const roomNo = (n, r) => n === 0 ? `Y-${String(r.idx).padStart(2, '0')}` : `${n}${String(r.idx).padStart(2, '0')}`;
  const m2 = a => a.toFixed(1).replace('.', ',') + ' m²';

  // gold overlay on a room's floor cells
  function roomGeo(n, id) {
    const P = planOf(n), { w, grid, cell, x0, z0 } = P, r = P.byId.get(id), pos = [];
    const j0 = P.cj(r.bb[1]), j1 = P.cj(r.bb[3]) + 1, i0 = P.ci(r.bb[0]), i1 = P.ci(r.bb[2]) + 1;
    for (let j = j0; j < j1; j++) {
      let i = i0;
      while (i < i1) {
        if (grid[j * w + i] !== id) { i++; continue; }
        let k = i; while (k < i1 && grid[j * w + k] === id) k++;
        const xa = x0 + i * cell, xb = x0 + k * cell, za = z0 + j * cell, zb = za + cell;
        pos.push(xa, 0, za, xa, 0, zb, xb, 0, zb, xa, 0, za, xb, 0, zb, xb, 0, za);
        i = k;
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }
  const mkOverlay = op => { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide })); m.renderOrder = 3; m.visible = false; scene.add(m); return m; };
  const roomHl = mkOverlay(0.42), roomHover = mkOverlay(0.2);
  function setOverlay(mesh, n, r) {
    if (!r) { mesh.visible = false; return; }
    if (mesh.userData.id !== `${n}:${r.id}`) { mesh.geometry.dispose(); mesh.geometry = roomGeo(n, r.id); mesh.userData.id = `${n}:${r.id}`; }
    mesh.position.y = base(n) + 0.1; mesh.visible = true;
  }

  function select(n) {
    if (walking) exitWalk();
    if (n === selected) return;
    selected = n; room = null;
    setOverlay(roomHl, 0, null); setOverlay(roomHover, 0, null);
    showHighlight(null); hideTip();
    for (let i = 1; i <= ROOF; i++) {
      const f = floors[i];
      let to;
      if (selected == null || i < selected) to = { y: 0, op: 1 };
      else if (i === selected) to = { y: 0, op: 0 };
      else to = { y: 12 + (i - selected) * 1.4, op: 0 };
      animateEntry(f, to, { dur: 700, delay: selected == null ? (ROOF - i) * 35 : (i - selected) * 40 });
    }
    animateEntry(ground, { op: selected === 0 ? 0.18 : 1 }, { dur: 600 });
    for (let i = 0; i <= NF; i++) {
      if (i === selected) { ensureInterior(i); warmNext(i); shadowDirty = true; }
      animateEntry(cuts[i], { y: 0, op: i === selected ? 1 : 0 }, { dur: 600, delay: i === selected ? 150 : 0 });
    }
    if (selected == null) flyTo(overviewTarget(), overviewRadius(), 1.12);
    else flyTo(new THREE.Vector3(0, base(selected) + 1, 0), floorRadius(), selected === 0 ? 0.62 : 0.8);
    buildLabels();
    updateUI();
  }
  function selectRoom(r) {
    if (selected == null) return;
    room = r;
    setOverlay(roomHl, selected, r); setOverlay(roomHover, 0, null); hideTip();
    if (r) {
      const size = Math.max(r.bb[2] - r.bb[0], r.bb[3] - r.bb[1]);
      // look down from the corridor side so the facade wall never hides the room
      flyTo(new THREE.Vector3(r.x, base(selected) + 0.5, r.z), Math.max(24, size * 3.4), 0.55, 950, r.z > 0 ? Math.PI * 0.92 : 0.08);
    } else flyTo(new THREE.Vector3(0, base(selected) + 1, 0), floorRadius(), selected === 0 ? 0.62 : 0.8);
    labels.forEach(l => l.el.classList.toggle('on', r != null && l.r.id === r.id));
    updateUI();
  }

  /* ---------- room labels floating over the open floor ---------- */
  const labelsEl = $('#labels');
  let labels = [];
  function buildLabels() {
    labelsEl.textContent = ''; labels = [];
    if (selected == null) return;
    for (const r of pickRooms(selected)) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'rchip';
      el.textContent = `№ ${roomNo(selected, r)}`;
      el.setAttribute('aria-label', `${TYPES[r.type].name} ${roomNo(selected, r)}, ${m2(r.area)}`);
      el.addEventListener('click', () => selectRoom(r));
      labelsEl.appendChild(el);
      labels.push({ el, r });
    }
  }
  const pv = new THREE.Vector3();
  function updateLabels() {
    if (!labels.length) return;
    const w = stage.clientWidth, h = stage.clientHeight, show = !walking && selected != null && cuts[selected].op > 0.6;
    labelsEl.classList.toggle('show', show);
    if (!show) return;
    for (const { el, r } of labels) {
      pv.set(r.x, base(selected) + wallH(selected) + 0.4, r.z).project(camera);
      if (pv.z > 1) { el.style.visibility = 'hidden'; continue; }
      el.style.visibility = '';
      el.style.transform = `translate(${((pv.x + 1) / 2 * w).toFixed(1)}px, ${((1 - pv.y) / 2 * h).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  function updateUI() {
    for (let n = 0; n <= NF; n++) btns[n].setAttribute('aria-pressed', String(n === selected));
    $('#ov').hidden = selected != null;
    $('#fv').hidden = selected == null || room != null;
    $('#rv').hidden = room == null;
    if (selected != null && room == null) {
      const f = FLOORS[selected], rs = pickRooms(selected);
      $('#fvLevel').textContent = `Otmetka ${level(selected)} m · ≈${Math.round(cuts[selected].area)} m²`;
      $('#fvTitle').textContent = selected === 0 ? 'Yerto‘la' : `${selected}-qavat`;
      $('#fvSub').textContent = `${f.lbl} · ${selected >= 2 ? rs.filter(r => r.type === 'room').length + ' ta ofis' : rs.length + ' ta xona'}`;
      $('#fvText').textContent = f.text;
      const th = $('#fvThumb');
      th.hidden = !f.iso;
      if (f.iso) {
        $('#fvThumbImg').src = img.src(f.iso, 320);
        th.onclick = () => openImages([{ id: f.iso, cap: `${selected}-qavat — vizualizatsiya` }], 0);
      }
      $('#roomList').innerHTML = rs.map(r => `<button type="button" class="rrow" data-id="${r.id}"><b>№ ${roomNo(selected, r)}</b><span>${TYPES[r.type].name}</span><span class="a">${m2(r.area)}</span></button>`).join('');
      $('#prev').disabled = selected === 0;
      $('#next').disabled = selected === NF;
    }
    if (room) {
      $('#rvLevel').textContent = `${selected === 0 ? 'Yerto‘la' : selected + '-qavat'} · ${TYPES[room.type].name}`;
      $('#rvTitle').textContent = `№ ${roomNo(selected, room)}`;
      $('#rvArea').textContent = m2(room.area);
      $('#rvSize').textContent = `${(room.bb[2] - room.bb[0]).toFixed(1).replace('.', ',')} × ${(room.bb[3] - room.bb[1]).toFixed(1).replace('.', ',')}`;
      $('#rvSide').textContent = room.z > 0 ? 'Koʻcha' : 'Hovli';
      drawMap($('#rvMap'), planOf(selected), { roomId: room.id });
    }
    requestAnimationFrame(updateViewOffset);
  }
  $('#roomList').addEventListener('click', e => {
    const b = e.target.closest('.rrow'); if (!b) return;
    selectRoom(planOf(selected).byId.get(+b.dataset.id));
  });
  $('#roomList').addEventListener('mouseover', e => {
    const b = e.target.closest('.rrow'); setOverlay(roomHover, selected, b ? planOf(selected).byId.get(+b.dataset.id) : null); request();
  });
  $('#roomList').addEventListener('mouseleave', () => { setOverlay(roomHover, 0, null); request(); });
  for (let n = 0; n <= NF; n++) {
    btns[n].addEventListener('click', () => select(n === selected ? null : n));
    btns[n].addEventListener('mouseenter', () => { if (n !== selected && isFloorVisible(n)) { showHighlight(n); request(); } });
    btns[n].addEventListener('mouseleave', () => { showHighlight(null); request(); });
  }
  $('#back').addEventListener('click', () => select(null));
  $('#prev').addEventListener('click', () => selected > 0 && select(selected - 1));
  $('#next').addEventListener('click', () => selected < NF && select(selected + 1));
  $('#rvBack').addEventListener('click', () => selectRoom(null));
  $('#walkBtn').addEventListener('click', () => room && enterWalk(room));
  maketEl.addEventListener('keydown', e => {
    if (walking) return;
    if (e.key === 'Escape' && room) selectRoom(null);
    else if (e.key === 'Escape' && selected != null) select(null);
    else if (selected != null && e.key === 'ArrowUp' && selected < NF) { e.preventDefault(); select(selected + 1); }
    else if (selected != null && e.key === 'ArrowDown' && selected > 0) { e.preventDefault(); select(selected - 1); }
  });

  /* ---------- walk mode: first person inside the floor ---------- */
  const walkUi = $('#walkUi'), walkMap = $('#walkMap'), walkRoomEl = $('#walkRoom');
  const W = { x: 0, z: 0, yaw: 0, pitch: 0, path: null, keys: new Set(), plan: null, n: 0, last: 0, roomId: -1, saved: null };
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
  marker.visible = false; marker.renderOrder = 4; scene.add(marker);
  const EYE = 1.6;
  function enterWalk(r) {
    const sp = spawnPoint(planOf(selected), r); if (!sp) return;
    enterWalkAt(sp.x, sp.z, sp.yaw, -0.12);
  }
  function enterWalkAt(x, z, yaw, pitch, deck = 'floor') {
    const n = selected, P = planOf(n);
    const st = deck === 'floor' && !onStair(P, x, z) ? nearestFree(P, P.ci(x), P.cj(z)) : [P.ci(x), P.cj(z)];
    if (!st) return;
    if (camTw) { camTw.dead = true; camTw = null; }
    walking = true; Object.assign(W, { plan: P, n, path: null, roomId: -1, last: 0, stairs: null, deck, prevReg: null });
    if (deck === 'floor' && !onStair(P, x, z)) { W.x = P.x0 + (st[0] + 0.5) * P.cell; W.z = P.z0 + (st[1] + 0.5) * P.cell; } else { W.x = x; W.z = z; }
    W.yaw = yaw; W.pitch = pitch; W.hy = stairHeight(P, W.x, W.z, deck) ?? 0;
    W.saved = { pos: camera.position.clone(), target: controls.target.clone() };
    controls.enabled = false;
    camera.fov = 70; camera.near = 0.05; camera.clearViewOffset(); camera.updateProjectionMatrix();
    cuts[n].ceiling.visible = true; setOverlay(roomHl, 0, null);

    maketEl.classList.add('walking'); walkUi.hidden = false;
    renderer.domElement.style.touchAction = 'none'; renderer.domElement.style.cursor = 'grab';
    hideTip(); request();
  }
  function exitWalk() {
    if (!walking) return;
    walking = false; W.path = null; W.keys.clear(); marker.visible = false; stairUi.hidden = true; W.stairs = null; liftUi.hidden = true; W.lift = null;
    camera.fov = 32; camera.near = 1; camera.updateProjectionMatrix();
    cuts[W.n].ceiling.visible = false;
    cuts.forEach(c => (c.doors || []).forEach(d => { d.open = 0; setDoor(d); }));       // every door shut again
    maketEl.classList.remove('walking'); walkUi.hidden = true;
    renderer.domElement.style.touchAction = 'pan-y'; renderer.domElement.style.cursor = '';
    camera.position.copy(W.saved.pos); controls.target.copy(W.saved.target); camera.lookAt(controls.target);
    controls.enabled = true;
    if (room) setOverlay(roomHl, selected, room);
    updateViewOffset(); request();
  }
  $('#walkExit').addEventListener('click', exitWalk);

  /* stairs: near a stair core, offer the floor above / below and arrive at the same spot there */
  const stairUi = $('#stairUi'), stairUp = $('#stairUp'), stairDown = $('#stairDown');
  function nearStairs(P, x, z, r = 14) {
    const ci = P.ci(x), cj = P.cj(z);
    for (let dj = -r; dj <= r; dj += 2) for (let di = -r; di <= r; di += 2) if (P.at(ci + di, cj + dj) === 254) return true;
    return false;
  }
  function updateStairUi() {
    const near = nearStairs(W.plan, W.x, W.z);
    if (near === W.stairs) return;
    W.stairs = near; stairUi.hidden = !near;
    if (near) {
      stairUp.hidden = W.n >= NF; stairDown.hidden = W.n <= 0;
      stairUp.querySelector('span').textContent = `${W.n + 1}-qavatga chiqish`;
      stairDown.querySelector('span').textContent = W.n - 1 === 0 ? 'Yerto‘laga tushish' : `${W.n - 1}-qavatga tushish`;
    }
  }
  function goFloor(n2) {
    if (n2 < 0 || n2 > NF || n2 === W.n) return;
    const x = W.x, z = W.z, yaw = W.yaw, pitch = W.pitch;
    select(n2);                 // opens the new floor (and leaves walk mode)
    enterWalkAt(x, z, yaw, pitch);
    stairUi.hidden = true;
  }
  const changeFloor = d => goFloor(W.n + d);

  /* lift: doors open when you come close, inside you get the floor buttons */
  const liftUi = $('#liftUi'), liftBtns = $('#liftBtns');
  for (let n = NF; n >= 0; n--) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lbtn'; b.dataset.n = n; b.textContent = n === 0 ? 'Y' : n;
    b.setAttribute('aria-label', n === 0 ? 'Yerto‘la' : `${n}-qavat`);
    liftBtns.appendChild(b);
  }
  let liftBusy = false;
  // the passenger lifts serve the basement to the 9th floor; the goods lift only the basement and the 1st floor
  const liftStops = (L, n) => n !== W.n && (L.stops ? L.stops.includes(planKey(n)) : n < NF);
  liftBtns.addEventListener('click', e => {
    const b = e.target.closest('.lbtn'); if (!b || liftBusy) return;
    const n2 = +b.dataset.n; if (n2 === W.n) return;
    const L = W.lift; if (!L || !liftStops(L, n2)) return;
    liftBusy = true; L.hold = true;
    $$lbtn().forEach(x => x.classList.toggle('on', x === b));
    request();
    // doors close, then the ride
    setTimeout(() => { L.hold = false; liftBusy = false; goFloor(n2); }, reduceMotion ? 50 : 1100);
  });
  const $$lbtn = () => [...liftBtns.querySelectorAll('.lbtn')];
  function setDoor(d) {
    const a = d.open * Math.PI / 2 * 0.95, dx = d.ax * Math.cos(a) + d.nx * Math.sin(a), dz = d.az * Math.cos(a) + d.nz * Math.sin(a);
    d.pivot.rotation.y = Math.atan2(-dz, dx);
  }
  // a door opens while you are within reach of it and swings shut behind you
  function updateDoors(dt) {
    let moving = false;
    // only the nearest door within reach opens (both leaves of a double door), so neighbouring doors never collide
    let near = null, best = 1e9;
    for (const d of cuts[W.n]?.doors || []) {
      if (d.fixed) continue;
      const dist = Math.hypot(W.x - d.cx, W.z - d.cz);
      if (dist < (d.kind === 'glass' ? 2.2 : 1.7) && dist < best) { best = dist; near = d; }
    }
    cuts.forEach((c, n) => {
      for (const d of c.doors || []) {
        const want = !d.fixed && n === W.n && near && (d === near || (d.pair != null && d.pair === near.pair)) ? 1 : 0;
        if (d.open !== want) { d.open = want > d.open ? Math.min(1, d.open + dt * 2.2) : Math.max(0, d.open - dt * 1.4); setDoor(d); moving = true; }
      }
    });
    return moving;
  }
  function updateLifts(dt) {
    const lifts = cuts[W.n].lifts || []; let moving = false, inside = null;
    for (const L of lifts) {
      const fx = L.x - L.nx * 0.7, fz = L.z - L.nz * 0.7;
      const inCab = W.x > L.cabin[0] && W.x < L.cabin[2] && W.z > L.cabin[1] && W.z < L.cabin[3];
      if (inCab) inside = L;
      const want = !L.hold && (inCab || Math.hypot(W.x - fx, W.z - fz) < 1.6) ? 1 : 0;
      if (L.open !== want) {
        L.open = want > L.open ? Math.min(1, L.open + dt * 1.6) : Math.max(0, L.open - dt * 1.6);
        setLiftDoors(L); moving = true;
      }
    }
    W.lift = inside;
    liftUi.hidden = !inside;
    if (inside) { stairUi.hidden = true; $$lbtn().forEach(x => { const n = +x.dataset.n; x.classList.toggle('cur', n === W.n); x.disabled = !liftStops(inside, n); if (!liftBusy) x.classList.remove('on'); }); }
    return moving;
  }
  stairUp.addEventListener('click', () => changeFloor(1));
  stairDown.addEventListener('click', () => changeFloor(-1));
  /* stairs you can walk: up flight, landing, flight over the well, down flight — heights from the core layout */
  function stairAt(P, x, z) {
    for (const c of P.cores) {
      if (c.small) continue;
      const [u, v] = c.toLocal(x, z);
      if (u < -0.2 || u > c.Ld - 0.08 || v < 0.1 || v > c.Wd - 0.1) continue;
      let reg = null;
      if (u >= c.run) reg = 'L';
      else if (v < c.lv0 - 0.05) reg = 'A';
      else if (v > c.lv1 + 0.05) reg = 'B';
      if (reg) return { c, u, v, reg };
    }
    return null;
  }
  const onStair = (P, x, z) => !!stairAt(P, x, z);
  function stairHeight(P, x, z, deck) {
    const s = stairAt(P, x, z); if (!s) return deck === 'floor' ? 0 : null;
    const { c, u, reg } = s, H = fh(W.n ?? selected), t = Math.max(0, Math.min(1, u / c.run));
    if (reg === 'A') { if (deck === 'lower') return null; return c.up ? t * H / 2 : 0; }
    if (reg === 'B') { if (deck === 'upper') return c.up ? H / 2 + (1 - t) * H / 2 : null; return c.down ? -t * H / 2 : 0; }
    // landing
    if (deck === 'upper') return c.up ? H / 2 : null;
    if (deck === 'lower') return c.down ? -H / 2 : null;
    return (!c.up && s.v < c.lv1) || (!c.down && s.v > c.lv1) ? 0 : null;
  }
  const freeAt = (x, z) => {
    const P = W.plan, i = P.ci(x), j = P.cj(z);
    if (W.deck === 'floor' && i >= 0 && j >= 0 && i < P.w && j < P.h && !P.blocked[j * P.w + i]) return true;
    const s = stairAt(P, x, z); if (!s) return false;
    if (W.deck === 'floor' && s.reg === 'L') return (W.prevReg === 'A' && s.c.up) || (W.prevReg === 'B' && s.c.down) || stairHeight(P, x, z, 'floor') === 0;
    return stairHeight(P, x, z, W.deck) !== null;
  };
  // deck bookkeeping + floor changes while walking the stairs
  function stairStep() {
    const s = stairAt(W.plan, W.x, W.z);
    const reg = s ? s.reg : null;
    if (s && reg === 'L' && W.deck === 'floor') {
      if (W.prevReg === 'A' && s.c.up) W.deck = 'upper';
      else if (W.prevReg === 'B' && s.c.down) {           // lower half-landing = upper half-landing of the floor below
        const x = W.x, z = W.z, yaw = W.yaw, pitch = W.pitch;
        select(W.n - 1); enterWalkAt(x, z, yaw, pitch, 'upper'); W.prevReg = 'L'; return;
      }
    }
    if (s && W.deck === 'upper' && reg === 'A' && s.u < s.c.run * 0.06) W.deck = 'floor';
    if (s && W.deck === 'upper' && reg === 'B' && s.u < 0.12) {          // top of the flight over the well = next floor
      const x = W.x, z = W.z, yaw = W.yaw, pitch = W.pitch;
      select(W.n + 1); enterWalkAt(x, z, yaw, pitch, 'floor'); W.prevReg = 'B'; return;
    }
    if (!s && W.deck !== 'floor') W.deck = 'floor';
    if (reg) W.prevReg = reg; else W.prevReg = null;
  }
  function tryMove(dx, dz) {
    if (freeAt(W.x + dx, W.z)) W.x += dx;
    if (freeAt(W.x, W.z + dz)) W.z += dz;
  }
  function walkTo(x, z) {
    const P = W.plan;
    // on or right next to the stairs: walk straight there, the stair rules keep you on the steps
    if (onStair(P, W.x, W.z)) {
      // inside the stairwell: go round by the landing when switching flights
      const sa = stairAt(P, W.x, W.z), sb = stairAt(P, x, z), c = sa.c, L = (v) => c.W2(c.run + 0.45, v);
      if (sb && sb.c === c) {
        if (sa.reg !== sb.reg && sa.reg !== 'L' && sb.reg !== 'L') W.path = [L(sa.v), L(sb.v), [x, z]];
        else if (sa.reg === 'L' && sb.reg !== 'L') W.path = [L(sb.v), [x, z]];
        else W.path = [[x, z]];
      } else if (W.deck === 'floor' && sa.reg !== 'L') {
        const [fx, fz] = c.W2(-0.4, sa.v), from = nearestFree(P, P.ci(fx), P.cj(fz)), to = nearestFree(P, P.ci(x), P.cj(z));
        const path = from && to ? findPath(P, from, to) : null;
        W.path = [[fx, fz]].concat(path ? path.slice(1).map(([i, j]) => [P.x0 + (i + 0.5) * P.cell, P.z0 + (j + 0.5) * P.cell]) : []);
      } else W.path = [[x, z]];
      request(); return;
    }
    if (onStair(P, x, z)) {             // walk to the foot of that flight (corridor side), then step on
      const sa = stairAt(P, x, z), v = sa.reg === 'A' ? Math.min(sa.v, sa.c.lv0 - 0.3) : sa.reg === 'B' ? Math.max(sa.v, sa.c.lv1 + 0.3) : sa.v;
      const [fx, fz] = sa.c.W2(-0.45, Math.max(0.3, Math.min(sa.c.Wd - 0.3, v)));
      const [ex, ez] = sa.c.W2(0.15, Math.max(0.3, Math.min(sa.c.Wd - 0.3, v)));
      const to = nearestFree(P, P.ci(fx), P.cj(fz)), from = nearestFree(P, P.ci(W.x), P.cj(W.z));
      const path = to && from ? findPath(P, from, to) : null;
      W.path = (path ? path.slice(1).map(([i, j]) => [P.x0 + (i + 0.5) * P.cell, P.z0 + (j + 0.5) * P.cell]) : []).concat([[fx, fz], [ex, ez], [x, z]]);
      request(); return;
    }
    if (false) {
      const to = nearestFree(P, P.ci(x), P.cj(z)), from = nearestFree(P, P.ci(W.x), P.cj(W.z));
      const path = to && from ? findPath(P, from, to) : null;
      W.path = (path ? path.slice(1).map(([i, j]) => [P.x0 + (i + 0.5) * P.cell, P.z0 + (j + 0.5) * P.cell]) : []).concat([[x, z]]);
      request(); return;
    }
    const to = nearestFree(P, P.ci(x), P.cj(z)), from = nearestFree(P, P.ci(W.x), P.cj(W.z));
    if (!to || !from) return;
    const path = findPath(P, from, to);
    if (!path) return;
    W.path = path.slice(1).map(([i, j]) => [P.x0 + (i + 0.5) * P.cell, P.z0 + (j + 0.5) * P.cell]);
    request();
  }
  function walkStep(dt) {
    const k = W.keys; let moving = false;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const sd = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    const turn = (k.has('arrowleft') || k.has('q') ? 1 : 0) - (k.has('arrowright') || k.has('e') ? 1 : 0);
    if (turn) { W.yaw += turn * dt * 1.9; moving = true; }
    if (f || sd) {
      W.path = null;
      const sp = 1.7 * dt, fx = -Math.sin(W.yaw), fz = -Math.cos(W.yaw);
      tryMove((fx * f - fz * sd) * sp, (fz * f + fx * sd) * sp);
      moving = true;
    }
    if (W.path && W.path.length) {
      const [tx, tz] = W.path[0], dx = tx - W.x, dz = tz - W.z, d = Math.hypot(dx, dz), sp = 1.9 * dt;
      if (d <= sp) { if (freeAt(tx, tz)) { W.x = tx; W.z = tz; } W.path.shift(); }
      else { const ox = W.x, oz = W.z; tryMove(dx / d * sp, dz / d * sp); if (ox === W.x && oz === W.z) W.path = []; }
      // turn gently towards where we are going
      if (d > 0.05) { let dy = Math.atan2(-dx, -dz) - W.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); W.yaw += dy * Math.min(1, dt * 3); }
      moving = true;
      if (!W.path.length) W.path = null;
    }
    stairStep();
    if (!walking) return false;
    const th = stairHeight(W.plan, W.x, W.z, W.deck) ?? W.hy ?? 0;
    W.hy = W.hy == null ? th : W.hy + (th - W.hy) * Math.min(1, dt * 9);
    if (Math.abs(th - W.hy) > 0.005) moving = true;
    camera.position.set(W.x, base(W.n) + 0.03 + EYE + W.hy, W.z);
    camera.rotation.set(W.pitch, W.yaw, 0, 'YXZ');
    const P = W.plan, r = P.byId.get(P.at(P.ci(W.x), P.cj(W.z)));
    if (r && r.id !== W.roomId) {
      W.roomId = r.id;
      walkRoomEl.textContent = TYPES[r.type].pick ? `№ ${roomNo(W.n, r)} · ${TYPES[r.type].name} · ${m2(r.area)}` : `${TYPES[r.type].name} · ${m2(r.area)}`;
    }
    drawMap(walkMap, P, { roomId: W.roomId, pos: [W.x, W.z], yaw: W.yaw });
    if (updateLifts(dt)) moving = true;
    if (updateDoors(dt)) moving = true;
    if (!W.lift) updateStairUi(); else W.stairs = null;
    return moving;
  }
  const WALK_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  addEventListener('keydown', e => {
    if (!walking) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') { exitWalk(); return; }
    if (WALK_KEYS.has(key)) { e.preventDefault(); W.keys.add(key); request(); }
  });
  addEventListener('keyup', e => W.keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => W.keys.clear());

  /* ---------- picking ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const tip = $('#tip');
  const visibleChain = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function setRay(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pick(cx, cy) {
    setRay(cx, cy);
    const hits = ray.intersectObjects(pickables, false);
    for (const h of hits) if (visibleChain(h.object)) return h.object.userData.floor;
    return null;
  }
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
  function floorPoint(cx, cy, n) {
    setRay(cx, cy);
    floorPlane.constant = -(base(n) + 0.05);
    return ray.ray.intersectPlane(floorPlane, hitV);
  }
  function roomAt(n, cx, cy) {
    const p = floorPoint(cx, cy, n); if (!p) return null;
    const P = planOf(n), r = P.byId.get(P.at(P.ci(p.x), P.cj(p.z)));
    return r && TYPES[r.type].pick ? r : null;
  }
  function hideTip() { tip.hidden = true; Object.values(btns).forEach(b => b.classList.remove('hot')); }
  function showTip(text, e) {
    const br = maketEl.getBoundingClientRect();
    tip.textContent = text; tip.hidden = false;
    tip.style.transform = `translate(${e.clientX - br.left + 14}px, ${e.clientY - br.top - 30}px)`;
  }
  let hoverN = null, hoverRoom = null, moveQueued = false, lastMove = null, down = null, look = null;
  renderer.domElement.addEventListener('pointermove', e => {
    if (walking) {
      if (look) {
        W.yaw -= (e.clientX - look.x) * 0.0045; W.pitch = THREE.MathUtils.clamp(W.pitch - (e.clientY - look.y) * 0.0035, -1.1, 0.9);
        look.x = e.clientX; look.y = e.clientY; request(); return;
      }
      if (e.pointerType === 'mouse') {
        const p = floorPoint(e.clientX, e.clientY, W.n);
        marker.visible = !!p && freeAt(p.x, p.z) && p.distanceTo(camera.position) < 25;
        if (marker.visible) marker.position.set(p.x, base(W.n) + 0.09, p.z);
        request();
      }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    lastMove = e;
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      if (walking) return;
      if (camTw || lastMove.buttons) { if (hoverN != null || hoverRoom) { hoverN = null; hoverRoom = null; showHighlight(null); setOverlay(roomHover, 0, null); hideTip(); request(); } return; }
      // inside an open floor: hover rooms
      const r = selected != null && cuts[selected].op > 0.6 ? roomAt(selected, lastMove.clientX, lastMove.clientY) : null;
      if (r !== hoverRoom) { hoverRoom = r; setOverlay(roomHover, selected, r && r !== room ? r : null); request(); }
      if (r) {
        if (hoverN != null) { hoverN = null; showHighlight(null); }
        showTip(`№ ${roomNo(selected, r)} · ${TYPES[r.type].name} · ${m2(r.area)}`, lastMove);
        renderer.domElement.style.cursor = 'pointer';
        return;
      }
      const n = pick(lastMove.clientX, lastMove.clientY);
      const target = n != null && n !== selected && n > 0 ? n : null;
      if (target !== hoverN) {
        hoverN = target; showHighlight(target); hideTip();
        if (target != null) btns[target].classList.add('hot');
        request();
      }
      if (target != null) showTip(`${target}-qavat · ${floorLabel(target)}`, lastMove); else hideTip();
      renderer.domElement.style.cursor = target != null ? 'pointer' : '';
    });
  });
  renderer.domElement.addEventListener('pointerleave', () => { hoverN = null; hoverRoom = null; marker.visible = false; showHighlight(null); setOverlay(roomHover, 0, null); hideTip(); request(); });
  renderer.domElement.addEventListener('pointerdown', e => {
    down = [e.clientX, e.clientY];
    if (walking) { look = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture?.(e.pointerId); renderer.domElement.style.cursor = 'grabbing'; }
  });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
    down = null;
    if (walking) {
      look = null; renderer.domElement.style.cursor = 'grab';
      if (moved > 6) return;
      let p = floorPoint(e.clientX, e.clientY, W.n);
      if (!p || p.distanceTo(camera.position) > 30) return;
      // the steps rise above the floor plane: also try a plane 0.8 m up
      if (W.plan.at(W.plan.ci(p.x), W.plan.cj(p.z)) !== 254) {
        floorPlane.constant = -(base(W.n) + 0.85);
        const p2 = ray.ray.intersectPlane(floorPlane, new THREE.Vector3());
        if (p2 && W.plan.at(W.plan.ci(p2.x), W.plan.cj(p2.z)) === 254) p = p2;
      }
      walkTo(p.x, p.z);
      return;
    }
    if (moved > 6) return;
    if (selected != null && cuts[selected].op > 0.6) {
      const r = roomAt(selected, e.clientX, e.clientY);
      if (r) { if (r === room) enterWalk(r); else selectRoom(r); return; }
    }
    const n = pick(e.clientX, e.clientY);
    if (n != null && n > 0 && n !== selected) select(n);
  });

  /* ---------- size, view offset, theme ---------- */
  function updateViewOffset() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (walking) { camera.clearViewOffset(); camera.updateProjectionMatrix(); request(); return; }
    let ox = 0, oy = 0;
    if (!narrow) {
      const sr = stage.getBoundingClientRect();
      const railR = rail.getBoundingClientRect(), cardR = $('.card').getBoundingClientRect();
      ox = -(railR.right - sr.left) / 2;
      oy = Math.max(0, (sr.bottom - cardR.top) * 0.16);
    }
    camera.setViewOffset(w, h, ox, oy, w, h);
    camera.updateProjectionMatrix();
    request();
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    const wasNarrow = narrow;
    narrow = w < 720 || maketEl.clientWidth < 720;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateViewOffset();
    if (wasNarrow !== narrow && !camTw) {
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      s.radius = selected == null ? overviewRadius() : floorRadius(); camera.position.setFromSpherical(s).add(controls.target);
    }
    request();
  }
  new ResizeObserver(resize).observe(stage);
  new ResizeObserver(() => updateViewOffset()).observe($('.card'));

  function applyTheme() {
    const sky = getComputedStyle(document.documentElement).getPropertyValue('--sky').trim() || '#DCE3E2';
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, 220, 560);
    request();
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  applyTheme();


  setTimeout(() => addProps(floors[9], terracePlants, 0), 1200);

  /* ---------- start ---------- */
  narrow = stage.clientWidth < 720;
  camera.aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
  controls.target.copy(overviewTarget());
  camera.position.setFromSpherical(new THREE.Spherical(overviewRadius(), 1.12, 0.55)).add(controls.target);
  camera.lookAt(controls.target);
  resize();
  if (!reduceMotion) {
    for (let n = 1; n <= ROOF; n++) {
      const f = floors[n];
      f.y = 9; f.op = 0; f.grp.position.y = 9; setOpacity(f, 0);
      animateEntry(f, { y: 0, op: 1 }, { dur: 560, delay: 120 + (n - 1) * 80, ease: easeOut });
    }
  }
  updateUI();
  request();

  // Opening a floor for the first time builds its plan and furniture (0.15-0.25 s here, longer on a phone) and the
  // page stood still meanwhile. The floors are worked out ahead instead, one at a time in idle moments, never while
  // the visitor turns the model, a floor is animating or someone walks inside, so a later click finds them ready.
  {
    let lastTouch = performance.now();
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) renderer.domElement.addEventListener(ev, () => { lastTouch = performance.now(); }, { passive: true });
    const queue = [1, 2, 3, 0, 6, 7, 9, 10];            // one per plan (4-5 share 3, 8 shares 7)
    const idle = cb => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 5000 }) : setTimeout(cb, 400));
    const warm = () => {
      if (!queue.length) return;
      if (walking || tweens.size || performance.now() - lastTouch < 1500 || document.hidden) { setTimeout(() => idle(warm), 800); return; }
      const n = queue.shift();
      if (!cuts[n].built) interiorGeometry(planKey(n), wallH(n), fh(n));   // cached: ensureInterior() reuses it
      setTimeout(() => idle(warm), 250);
    };
    // the chosen floor's neighbours first
    warmNext = n => { for (const m of [n + 1, n - 1]) { const i = queue.indexOf(m); if (i > 0) { queue.splice(i, 1); queue.unshift(m); } } };
    setTimeout(() => idle(warm), 3000);
  }
  // testing hooks: set an orbit view, grab a still
  const view = (theta, phi, r, ty = 15, tx = 0) => { if (camTw) { camTw.dead = true; camTw = null; } controls.target.set(tx, ty, 0); camera.position.setFromSpherical(new THREE.Spherical(r, phi, theta)).add(controls.target); camera.lookAt(controls.target); request(); };
  const snap = (q = 0.82) => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', q); };
  window.__op = { select, selectRoom, enterWalk, exitWalk, changeFloor, view, snap, walkTo, sim: sec => { frame(performance.now() + 5000); for (let t = 0; t < sec; t += 0.05) if (walking) walkStep(0.05); }, look: (yaw, pitch = 0) => { W.yaw = yaw; W.pitch = pitch; request(); }, walkState: () => ({ ...W, plan: undefined }), rooms: n => pickRooms(n), get selected() { return selected; }, get walking() { return walking; } };
}
