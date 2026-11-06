// Order Plaza — furnished floor interiors built from the traced plans (plans.js, 0.1 m grid).
// Walls, windows and stairs come straight from the cadastral plans (chizma.pdf); furniture is placed per room type
// by a small solver (against a wall, clear of doorways) so every room can be walked through.
// Surfaces carry world-space UVs and a material key, so maket.js can dress them with Poly Haven textures.
import * as THREE from 'three';
import { PLANS } from './plans.js';

export const TYPES = {
  room:   { name: 'Ofis', floor: 'parquet', pick: true },
  conf:   { name: 'Konferens-zal', floor: 'parquet', pick: true },
  shop:   { name: 'Savdo zali', floor: 'stone', pick: true },
  office: { name: 'Ofis', floor: 'parquet', pick: true },
  tech:   { name: 'Texnik xona', floor: 'concrete', pick: true },
  hall:   { name: 'Koridor / holl', floor: 'granite', pick: false },
  wc:     { name: 'Sanuzel', floor: 'tiles', pick: false },
  store:  { name: 'Yordamchi xona', floor: 'marble', pick: false },
  roof:   { name: 'Ochiq tom (chillerlar)', floor: 'concrete', pick: false },
  terrace: { name: 'Terrasa', floor: 'stone', pick: true },
  logistics: { name: 'Logistika zali', floor: 'concrete', pick: true },
};
const WALL = 255, STAIR = 254, WIN = 253;
const PARAPET = 252;                                   // low wall round the terrace and the chiller roof
// building lines (cadastral plans): wing | tower part | main block; the tower's centre bay is 6.4 m wide
const FX0 = -24.55, FXW = -17.85, FXT = -2.45, FX1 = 24.55, FZF = 7.05, FZB = -7.05;
const FCX = (FXW + FXT) / 2, FHW = 3.2;
const FBZ1 = FZB - 0.65, FBZ2 = FZB - 1.75;           // the tower's back: flank bays and centre bay, like the front
const BACK_BAYS = new Set(['2', '3', '6', '7', '9', '10']);
export const FLANK_WINS = [1.4, 3.5];                 // window centres in a tower flank, from its outer end (the sheets' positions)
export const EAST_WINS = [-5.75, -3.1, 3.1, 5.75];    // on the east end, either side of the gold strip
export const WING_WINS = [1.6, 5.1];                         // in the back of the wing, from its west end, either side of the gold strip
const FSG = 3.5;                                       // west side: wall along the rooms, glass only from here to the street
// window openings of the facade, so the inside matches the outside
function windowSpans(key, face, lo, hi, other) {
  if (key === 'b') return [];
  const out = [], glass = (a0, a1, sill = 0.05, top = 2.75) => out.push([a0, a1, sill, top]);
  // one window everywhere, as on the sheets: 1.5 m wide, in the piers between them the walls of the rooms
  const win = c => out.push([c - 0.75, c + 0.75, 0.5, 3.0]);
  const bays = (start, len, n) => { for (let k = 0; k < n; k++) win(start + (k + 0.5) * len / n); };
  const tower = () => { for (const c of FLANK_WINS) { win(FXW + c); win(FXT - c); } };
  if (key === '1') {
    if (face === 'back' || (face === 'front' && lo > FX1 - 0.2 && other < FZF - 1.5)) return [];   // the back of the shops and of the annex: plain wall
    else if (face === 'left' && other < FX0 + 0.8) glass(Math.max(lo, FSG), hi, 0.05, 3.6);        // west side: glass towards the street only
    else if (face === 'front' || other > FX1 - 0.8) glass(lo, hi, 0.05, 3.6);                      // storefront glazing up to the canopy
    // (a wall between two shops that reaches the glass stays a plain wall)
  } else if (face === 'front') {
    glass(FX0, FXW - 0.1);                                                // glass wing
    tower();
    out.find(o => o[0] < -15 && o[1] > -14)[0] = -14.85;                  // a dividing wall meets this window: the glass stops at it
    glass(FCX - 2.7, FCX + 2.7);                                          // curtain wall of the centre bay
    bays(FXT, FX1 - FXT, 9);
  } else if (face === 'back') {
    // the same as the front (the wing: a window either side of the gold strip)
    tower();
    glass(FCX - 2.7, FCX + 2.7);
    bays(FXT, FX1 - FXT, 9);
    WING_WINS.forEach(c => win(FX0 + c));
  } else if (face === 'right') {
    if (other > FXT + 1) EAST_WINS.forEach(win);
    else bays(FZB, FZF - FZB, 4);                        // east face of the tower above the main block
  } else if (face === 'left') {
    if (other < FX0 + 0.8) glass(Math.max(lo, FSG), hi);                  // wall along the rooms, glass towards the street
  }
  // the west glass and the wing's front glass run right through: nothing between the panes
  const m = face === 'left' || (face === 'front' && lo < FX0 + 1) ? 0 : 0.08;
  return out.map(([a, b, s0, t]) => [Math.max(a, lo + m), Math.min(b, hi - m), s0, t]).filter(([a, b]) => b - a > 0.3);
}
const isRoom = v => v > 0 && v < PARAPET;
// 10th floor (technical floor): the wing is an open roof with the chillers, behind a parapet (cadastral room 2).
// Shared with maket.js so the outside and the cut view agree.  centre x, z, long side, short side, long side along z?
export const ROOF10 = {
  chillers: [[-21.1, -4.0, 2.5, 2.2, true], [-21.1, -1.0, 2.5, 2.2, true]],
};

/* ---------- colours (multiplied with the textures) ---------- */
const COL = {
  wall: '#F6F3EE', cap: '#3B4651', sill: '#EDEAE4', step: '#D9D5CE', stepEdge: '#B7B2A9',
  oakL: '#F1E2CB', oak: '#D7B48C', oakD: '#7E5A3E', white: '#F7F6F3', linen: '#F1ECE3', grey: '#9097A0',
  dark: '#2E343A', black: '#16191C', steel: '#C9CFD4', gold: '#D2A954', green: '#2F5D4A',
  leaf: '#5E9A4C', leaf2: '#78AE5A', glass: '#CFE3EE', mirror: '#E6EEF2',
};
const OAKP = '#FFFFFF', STONEP = '#4E5256';
const ACCENTS = ['#2F5D4A', '#2A3C5F', '#4A4F57', '#B59A7A', '#355E4C', '#6B4F3A'];

/* ---------- box geometry builder: one bucket per material, world-space UVs, vertex colours ---------- */
class Boxes {
  constructor() { this.b = {}; }
  // ao: darken the bottom edge (cheap contact shadow where walls meet the floor)
  add(x0, x1, y0, y1, z0, z1, color, mat = 'plain', ao = false) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    (this.b[mat] ||= []).push([x0, x1, y0, y1, z0, z1, new THREE.Color(color), ao]);
  }
  // prism between x0..x1 / z0..z1 whose bottom/top heights go from (yb0,yt0) at the low end to (yb1,yt1) at the high end of `axis`
  addPrism(x0, x1, z0, z1, axis, yb0, yt0, yb1, yt1, color, mat = 'plain') {
    const c = [];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let d = 0; d < 2; d++) {
      const hi = axis === 'x' ? a : d;
      c[a * 4 + b * 2 + d] = [a ? x1 : x0, b ? (hi ? yt1 : yt0) : (hi ? yb1 : yb0), d ? z1 : z0];
    }
    (this.b[mat] ||= []).push([x0, x1, 0, 0, z0, z1, new THREE.Color(color), false, c]);
  }
  geometries() {
    const out = {};
    for (const [mat, list] of Object.entries(this.b)) out[mat] = boxGeometry(list);
    return out;
  }
}
const FACES = [ // normal, corners as indices into [min,max] of x/y/z
  [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]], [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
];
function boxGeometry(list) {
  const n = list.length, pos = new Float32Array(n * 72), nor = new Float32Array(n * 72), col = new Float32Array(n * 72), uv = new Float32Array(n * 48), idx = new Uint32Array(n * 36);
  let v = 0, u = 0, t = 0;
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  for (const [x0, x1, y0, y1, z0, z1, c, ao, corners] of list) {
    const X = [x0, x1], Y = [y0, y1], Z = [z0, z1];
    for (const [nm0, cs] of FACES) {
      const base = v / 3;
      let nm = nm0;
      if (corners) {   // sheared prism: flat normal from the face itself
        const P = cs.map(([a, b, d]) => corners[a * 4 + b * 2 + d]);
        e1.set(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]); e2.set(P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]);
        fn.crossVectors(e1, e2).normalize(); nm = [fn.x, fn.y, fn.z];
        if (!isFinite(fn.x)) nm = nm0;
      }
      for (const [a, b, d] of cs) {
        const q = corners ? corners[a * 4 + b * 2 + d] : null;
        const x = q ? q[0] : X[a], y = q ? q[1] : Y[b], z = q ? q[2] : Z[d];
        pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
        nor[v] = nm[0]; nor[v + 1] = nm[1]; nor[v + 2] = nm[2];
        const k = ao && nm0[1] === 0 ? (b === 0 ? 0.74 : 1.0) : 1.0;
        col[v] = c.r * k; col[v + 1] = c.g * k; col[v + 2] = c.b * k; v += 3;
        if (nm0[0]) { uv[u] = z; uv[u + 1] = y; } else if (nm0[1]) { uv[u] = x; uv[u + 1] = z; } else { uv[u] = x; uv[u + 1] = y; }
        u += 2;
      }
      idx.set([base, base + 1, base + 2, base, base + 2, base + 3], t); t += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/* ---------- plan decoding + room classification ---------- */
const cache = {};
// the concrete columns at the wall junctions stand out of the walls as cubes: the walls run through instead, at their own
// thickness. (Not the lift shafts, the stairs or the sides of the centre bay; columns standing free in a room stay.)
function dropColumns({ grid, w, h, x0, z0, cell }) {
  const core = new Uint8Array(w * h), seen = new Uint8Array(w * h);
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    let ok = true;
    for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) if (grid[(j + a) * w + i + b] !== WALL) { ok = false; break; }
    if (ok) core[j * w + i] = 1;
  }
  for (let s = 0; s < w * h; s++) {
    if (!core[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1; let a = 1e9, b = -1, c = 1e9, d = -1;
    for (let n = 0; n < q.length; n++) {
      const k = q[n], i = k % w, j = (k / w) | 0;
      a = Math.min(a, i); b = Math.max(b, i); c = Math.min(c, j); d = Math.max(d, j);
      for (const e of [1, -1, w, -w, w + 1, w - 1, -w + 1, -w - 1]) if (core[k + e] && !seen[k + e]) { seen[k + e] = 1; q.push(k + e); }
    }
    a--; b++; c--; d++;                                                   // the core grown back to the column
    const xc = x0 + (a + b + 1) / 2 * cell, zc = z0 + (c + d + 1) / 2 * cell;
    if (b - a > 6 || d - c > 6 || zc > 6.5 || xc < -20 || a < 4 || c < 4 || b > w - 5 || d > h - 5) continue;
    let nearStair = false;
    for (let j = c - 3; j <= d + 3; j++) for (let i = a - 3; i <= b + 3; i++) if (grid[j * w + i] === STAIR) nearStair = true;
    if (nearStair) continue;
    const L = [], R = [], T = [], B = [];
    for (let j = c; j <= d; j++) { if (grid[j * w + a - 1] === WALL) L.push(j); if (grid[j * w + b + 1] === WALL) R.push(j); }
    for (let i = a; i <= b; i++) { if (grid[(c - 1) * w + i] === WALL) T.push(i); if (grid[(d + 1) * w + i] === WALL) B.push(i); }
    if (!L.length && !R.length && !T.length && !B.length) continue;
    const H = [...L, ...R], V = [...T, ...B], keep = new Set();
    for (const j of L) for (let i = a, e = V.length ? Math.max(...V) : R.length ? b : a - 1; i <= e; i++) keep.add(j * w + i);
    for (const j of R) for (let i = V.length ? Math.min(...V) : L.length ? a : b + 1; i <= b; i++) keep.add(j * w + i);
    for (const i of T) for (let j = c, e = H.length ? Math.max(...H) : B.length ? d : c - 1; j <= e; j++) keep.add(j * w + i);
    for (const i of B) for (let j = H.length ? Math.min(...H) : T.length ? c : d + 1; j <= d; j++) keep.add(j * w + i);
    const rest = [];
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) if (grid[j * w + i] === WALL && !keep.has(j * w + i)) rest.push(j * w + i);
    for (let it = 0; it < 8 && rest.length; it++) for (let n = rest.length - 1; n >= 0; n--) {
      const v = [1, -1, w, -w].map(e => grid[rest[n] + e]).find(isRoom);
      if (v) { grid[rest[n]] = v; rest.splice(n, 1); }
    }
  }
}
// the outer corners of the sheets are cut back in small steps: square them
function squareCorners({ grid, w, h, ci, cj }) {
  for (const [xa, xb, za, zb] of [[-25.1, -24.45, -6.5, -5.7], [-25.1, -24.45, 7.2, 7.9], [24.45, 25.1, 6.6, 7.4]]) {
    const i0 = Math.max(0, ci(xa)), i1 = Math.min(w - 1, ci(xb)), j0 = Math.max(0, cj(za)), j1 = Math.min(h - 1, cj(zb));
    const inX = xa < 0 ? 1 : -1, inZ = za < 0 ? 1 : -1;                   // towards the building
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (grid[j * w + i] !== 0) continue;
      const solid = (di, dj) => { for (let q = 1; q < 8; q++) { const ii = i + di * q, jj = j + dj * q; if (ii >= 0 && jj >= 0 && ii < w && jj < h && grid[jj * w + ii]) return true; } return false; };
      if (solid(inX, 0) && solid(0, inZ) && (solid(-inX, 0) || solid(0, -inZ))) grid[j * w + i] = WALL;
    }
  }
}
// behind a window the wall is one thickness: columns and thick wall ends the sheets draw there would cut the opening in
// two, one half deep in the pier. (A dividing wall, with no room right behind it, stays.)
function clearWindowPiers({ key, grid, w, h, ci, cj }) {
  const T = 3;
  // cells of one line from outside inwards: k0 at the edge of the plan, step d, at most n of them
  const line = (k0, d, n) => {
    let t = 0; while (t < n && grid[k0 + t * d] === 0) t++;
    if (t === n) return;
    let u = t; while (u < n && u < t + 16 && !isRoom(grid[k0 + u * d])) { if (grid[k0 + u * d] === STAIR) return; u++; }
    const v = grid[k0 + u * d]; if (u === n || !isRoom(v)) return;
    for (let q = t; q < Math.max(u, t + T); q++) grid[k0 + q * d] = q < t + T ? WALL : v;   // (where the sheet leaves the wall out, it closes)
    // a stretch of wall just behind it, the same room on both sides, is a leftover of the drawing's layers
    let a = Math.max(u, t + T); while (a < n && a < t + 12 && grid[k0 + a * d] === v) a++;
    let b = a; while (b < n && b < a + 3 && grid[k0 + b * d] === WALL) b++;
    if (b > a && grid[k0 + b * d] === v) for (let q = a; q < b; q++) grid[k0 + q * d] = v;
  };
  const across = (c, f) => { for (let s = c - 0.7; s <= c + 0.71; s += 0.1) f(s); };
  const front = c => across(c, x => line((h - 1) * w + ci(x), -w, h)), back = c => across(c, x => line(ci(x), w, h));
  const tower = FLANK_WINS.flatMap(c => [FXW + c, FXT - c]);
  if (key !== '10') { tower.forEach(c => { front(c); back(c); }); WING_WINS.forEach(c => back(FX0 + c)); }
  // the front of the wing and the tower's flanks are one plane: the glass runs through, no wall pieces between the panes
  for (const [x0, x1] of [[FX0 + 0.25, FCX - FHW - 0.15], [FCX + FHW + 0.15, FXT - 0.15]]) for (let x = x0; x <= x1; x += 0.1) line((h - 1) * w + ci(x), -w, h);
  // the west glass of the hall is one window: the wall behind it is straight, on floors 2, 7, 8, 9 the sheets have a thick
  // stretch and a piece of wall from it across the way to the stair
  if (key !== '10') for (let j = cj(5.15); j <= cj(7.6); j++) line(j * w, 1, w);
  if (key === '9' || key === '10') return;                               // no main block with these windows up there
  for (let k = 0; k < 9; k++) { const c = FXT + 1.5 + 3 * k; front(c); back(c); }
  for (const c of EAST_WINS) across(c, z => line(cj(z) * w + w - 1, -1, w));
}
// where the wing's back meets the tower the sheets leave a hole in the outer wall (7, 8), or a pocket and a wall running
// off at an angle (9), with a piece of wall left inside: one straight wall of the wing's own thickness, up to the tower
function straightenWingBack({ grid, w, h, ci, cj }) {
  const T = 3, iA = ci(-20.2), iT = ci(FXW);
  let j0 = 0; while (j0 < h && !grid[j0 * w + ci(-21)]) j0++;             // the wall's outer face, from the stretch that is whole
  for (let i = iA; i < iT + T; i++) {
    const tower = i >= iT;
    for (let j = tower ? cj(FBZ1) : 0; j < j0 + T; j++) {
      const k = j * w + i;
      if (j < j0 && !tower) grid[k] = 0;
      else if (grid[k] !== WIN) grid[k] = WALL;
    }
    if (tower) continue;
    if (!isRoom(grid[(j0 + 8) * w + i])) continue;                       // a dividing wall going on into the building stays
    for (let j = j0 + 7; j >= j0 + T; j--) if (grid[j * w + i] === WALL && isRoom(grid[(j + 1) * w + i])) grid[j * w + i] = grid[(j + 1) * w + i];
  }
}
// the sheets draw the tower's back flat, but it stands out like the front: the rooms behind it run out into the bays,
// the outer wall moves to the line of the bays; dividing walls follow it
function pushBackBays({ grid, w, ci, cj, rooms, cell }) {
  const iA = ci(FXW), iB = ci(FXT), cA = ci(FCX - FHW), cB = ci(FCX + FHW), T = 3, jLim = cj(-5), j1 = cj(FBZ1), j2 = cj(FBZ2), won = new Map();
  for (let i = iA; i <= iB; i++) {
    const end = i < iA + T || i > iB - T, centre = i >= cA && i <= cB, jo = centre ? j2 : j1;
    if (end) { for (let j = j1; grid[j * w + i] === 0; j++) grid[j * w + i] = WALL; continue; }
    let jr = jo, v = 0;
    for (; jr <= jLim; jr++) if (isRoom(grid[jr * w + i])) { v = grid[jr * w + i]; break; }
    const side = centre && (i < cA + T || i > cB - T);            // the sides of the centre bay
    for (let j = jo; j < (v ? jr : jLim); j++) {
      const k = j * w + i;
      if (!v || j < jo + T || (side && j < j1 + T)) grid[k] = WALL;
      else { grid[k] = v; won.set(v, (won.get(v) || 0) + 1); }
    }
  }
  for (const r of rooms) if (won.has(r.id)) {
    let z = r.bb[1];
    for (let i = ci(r.bb[0]); i <= ci(r.bb[2]); i++) for (let j = j2; j < cj(z); j++) if (grid[j * w + i] === r.id) { z = FBZ2 + (j - j2) * cell; break; }
    r.area += won.get(r.id) * cell * cell; r.bb = [r.bb[0], z, r.bb[2], r.bb[3]];
  }
}
// the 1st floor's east stair hall (beside the last shops), entered from the street
const isEastHall = r => r.type === 'hall' && r.c[0] > 21 && r.c[0] < FX1 && r.area > 10;
const streetOnly = {};           // per plan: rooms that open to the street only (no inner doors are cut into them)
export function getPlan(key) {
  if (cache[key]) return cache[key];
  const P = PLANS[key], { w, cell, x0 } = P;
  const grow = BACK_BAYS.has(key) ? Math.ceil((P.z0 - FBZ2 + 0.45) / cell) : 0, h = P.h + grow, z0 = +(P.z0 - grow * cell).toFixed(2);   // rows for the bays behind the sheet's edge
  const grid = new Uint8Array(w * h);
  for (let i = 0, o = grow * w; i < P.rle.length; i += 2) { grid.fill(P.rle[i], o, o + P.rle[i + 1]); o += P.rle[i + 1]; }
  const ci = x => Math.floor((x - x0) / cell + 1e-6), cj = z => Math.floor((z - z0) / cell + 1e-6);
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? 0 : grid[j * w + i];
  cleanGrid(grid, w, h);
  const NAMED = { 'Магазин': 'shop', 'Logistika': 'logistics', 'Kirish holli': 'hall', 'Terrasa': 'terrace', 'Chiller maydoni': 'roof' };
  // small rooms touching a stair flight directly are its landings: corridor floor, not a room or a bathroom
  const landing = new Map();
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const v = grid[j * w + i]; if (!isRoom(v)) continue;
    if ([grid[j * w + i + 1], grid[j * w + i - 1], grid[(j + 1) * w + i], grid[(j - 1) * w + i]].includes(STAIR)) landing.set(v, (landing.get(v) || 0) + 1);
  }
  const rooms = P.rooms.map(r => {
    const bw = r.bb[2] - r.bb[0], bd = r.bb[3] - r.bb[1], mn = Math.min(bw, bd), mx = Math.max(bw, bd);
    let type;
    if (NAMED[r.name]) type = NAMED[r.name];
    else if (key !== 'b' && r.c[0] < FXW + 0.3 && ((key === '1' && r.area < 25) || (r.c[1] > 4.5 && r.area < 10) || r.area < 6)) type = 'hall';   // stair and lift zone of the wing (the 1st floor's 36 m² room behind it stays a room)
    else if (key === '1' && (landing.get(r.id) || 0) >= 20 && r.area < 25) type = 'hall';                    // 1st floor: the east stair's own room
    else if ((landing.get(r.id) || 0) >= 5 && r.area < 8) type = 'hall';
    else if (key === 'b') type = r.c[0] < -17.5 && r.area < 20 ? 'hall' : r.area < 4 ? 'store' : 'tech';   // basement: lobby in front of the lift core
    else if ((r.fill < 0.6 && r.area > 12) || (mn < 2.4 && mx / mn > 2.8)) type = 'hall';
    else if (r.area < 4.6) type = 'wc';
    else if (r.area < 7) type = 'store';
    else if (key === '1') type = r.area > 20 ? 'shop' : 'office';
    else if (r.area > 38 && r.fill < 0.6) type = 'hall';
    else type = 'room';                                                         // office (open-plan when big)
    return { ...r, type, x: r.c[0], z: r.c[1] };
  });
  if (key === '1') {
    // street fronts: every shop (and the last one, the logistics hall), and the east stair hall, has four panes, the
    // middle two its doors
    for (const r of rooms) r.front = r.name === 'Магазин' || r.name === 'Logistika' || isEastHall(r) ? 'mid' : null;
    // the narrow strip by the logistics hall (a small lobby beside the stair down, with partitions and three doors
    // into the hall) is open to the hall: one space, the stair stays
    const K = rooms.find(r => r.name === 'Logistika'), M = K && rooms.find(r => r.type === 'hall' && r.c[0] > FX1 - 0.2 && r.c[0] < K.bb[0]);
    if (M) {
      const nearOut = (i, j) => { for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) if (at(i + di, j + dj) === 0) return true; return false; };
      for (let j = cj(-0.3); j <= cj(M.bb[3] - 0.05); j++) for (let i = ci(FX1 - 0.4); i <= ci(K.bb[0] + 0.3); i++) {
        const k = j * w + i;
        if (grid[k] === M.id || (grid[k] === WALL && x0 + i * cell > FX1 + 0.05 && !nearOut(i, j))) grid[k] = K.id;
      }
      rooms.splice(rooms.indexOf(M), 1);
    }
    // the sheet draws the fronts in several layers (glass lines, door swings, the columns behind): one plane of glass,
    // the room's floor runs out to it; only the dividing walls between the rooms reach it
    const glassLine = (r, across, from = across === 'x' ? r.bb[0] : r.bb[1], face = WIN) => {
      const lines = [];
      const [a0, a1] = across === 'x' ? [ci(from), ci(r.bb[2])] : [cj(from), cj(r.bb[3])];
      const idx = (u, t) => across === 'x' ? t * w + u : u * w + t, T = across === 'x' ? h : w;
      for (let u = a0; u <= a1; u++) {
        let tr = -1; for (let t = 0; t < T; t++) if (grid[idx(u, t)] === r.id) tr = t;
        if (tr < 0 || (across === 'x' && z0 + tr * cell < 4)) continue;          // only the street side / the far end
        let tl = -1, other = false;
        for (let t = tr + 1; t <= Math.min(T - 1, tr + 16); t++) { const v = grid[idx(u, t)]; if (v !== 0) tl = t; if (isRoom(v) && v !== r.id) other = true; }
        if (tl >= 0 && !other) lines.push([u, tr, tl]);
      }
      const cnt = new Map(); for (const [, , tl] of lines) cnt.set(tl, (cnt.get(tl) || 0) + 1);
      const line = [...cnt.entries()].sort((p, q) => q[1] - p[1] || q[0] - p[0])[0]?.[0];
      for (const [u, tr, tl] of lines) {
        if (Math.abs(tl - line) > 12 || tr >= line) continue;
        for (let t = tr + 1; t < line; t++) grid[idx(u, t)] = r.id;
        grid[idx(u, line)] = face;
        for (let t = line + 1; t <= tl; t++) grid[idx(u, t)] = 0;
      }
    };
    for (const r of rooms) if (r.front) glassLine(r, 'x', r === K && M ? FX1 + 0.06 : r.bb[0]);   // the logistics front takes in the strip
    const ENTH = rooms.find(r => r.name === 'Kirish holli');
    if (ENTH) {
      // the entrance glass stands in the line of the wing: what the sheet draws in front of it is only the long roof
      const jl = cj(FZF + 0.7);
      for (let j = jl + 1; j < h; j++) for (let i = 0; i <= ci(FXW + 0.2); i++) grid[j * w + i] = 0;
      for (let i = ci(ENTH.bb[0]); i <= ci(FXW + 0.1); i++) grid[jl * w + i] = WIN;
      ENTH.bb = [ENTH.bb[0], ENTH.bb[1], ENTH.bb[2], z0 + jl * cell];
      ENTH.z = (ENTH.bb[1] + ENTH.bb[3]) / 2; ENTH.c = [ENTH.x, ENTH.z];
    }
    if (K) glassLine(K, 'z');                                           // the glazed east end of the logistics hall
    // no doors from shop to shop, nor between the shops and the east stair hall: each opens to the street only
    const street = new Set(rooms.filter(r => r.front).map(r => r.id));
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const k = j * w + i, a = grid[k];
      if (street.has(a) && [grid[k + 1], grid[k - 1], grid[k + w], grid[k - w]].some(b => b !== a && street.has(b))) grid[k] = WALL;
    }
    streetOnly[key] = street;
  }
  // the small space in the south-east corner is no room of its own: it is the end of the office beside it, no wall between
  {
    const end = rooms.find(r => r.type === 'room' && r.c[0] > 21.5 && r.c[1] < -5 && r.area < 10);
    const main = end && rooms.find(r => r.type === 'room' && r !== end && r.bb[2] > end.bb[0] - 0.5 && r.bb[2] <= end.bb[0] + 0.1 && r.c[1] < -2);
    if (main) {
      for (let k = 0; k < w * h; k++) if (grid[k] === end.id) grid[k] = main.id;
      for (let j = cj(end.bb[1]); j <= cj(end.bb[3] + 0.5); j++) {
        const row = j * w; let b = -1;
        for (let i = ci(end.bb[0]) - 8; i < ci(end.bb[0]) + 8; i++) { if (grid[row + i] === main.id) { if (b >= 0 && i - b > 1) { let solid = true; for (let q = b + 1; q < i; q++) if (grid[row + q] !== WALL) solid = false; if (solid) for (let q = b + 1; q < i; q++) grid[row + q] = main.id; } b = i; } }
      }
      main.area += end.area; main.bb = [main.bb[0], Math.min(main.bb[1], end.bb[1]), end.bb[2], main.bb[3]];
      rooms.splice(rooms.indexOf(end), 1);
    }
  }
  if (BACK_BAYS.has(key)) pushBackBays({ grid, w, ci, cj, rooms, cell });
  if (BACK_BAYS.has(key)) clearWindowPiers({ key, grid, w, h, ci, cj });
  if (BACK_BAYS.has(key)) { dropColumns({ grid, w, h, x0, z0, cell }); squareCorners({ grid, w, h, ci, cj }); straightenWingBack({ grid, w, h, ci, cj }); }
  // 9th floor, the east wall of the tower: the door to the terrace in a plain wall, no slivers of glass beside it
  if (key === '9') {
    const T = rooms.find(r => r.type === 'terrace');
    for (let j = cj(-6.6); j < cj(-5.9); j++) if (grid[j * w + ci(-2.75)] === WIN) grid[j * w + ci(-2.75)] = T.id;
    for (let j = cj(-7.45); j < cj(-7.1); j++) grid[j * w + ci(-2.95)] = WALL;
    for (let j = cj(-5.9); j <= cj(-5.45); j++) for (const x of [-2.95, -2.85, -2.75]) grid[j * w + ci(x)] = WALL;
    // the front corner of the terrace: the room's floor ran past the glass where the column stood; the glass goes on to the
    // front wall, the terrace and its parapet go on to the glass
    for (let j = cj(6.9); j <= cj(7.3); j++) grid[j * w + ci(-2.75)] = WIN;
    for (let j = cj(7.0); j <= cj(7.3); j++) for (const x of [-2.65, -2.55, -2.45]) grid[j * w + ci(x)] = j < cj(7.1) ? T.id : PARAPET;
    for (let j = cj(7.4); j <= cj(7.6); j++) grid[j * w + ci(-2.45)] = WALL;
  }
  // 10th floor: off the stair landing one door to the chillers and one to the corridor (see openDoors); none other opens
  // onto the chiller yard
  if (key === '10') {
    // the east wall of the yard runs straight: the sheet steps it 0.3 m east, with a slanting piece, in front of the corridor
    const yard = rooms.find(r => r.type === 'roof').id, hall = grid[cj(0.2) * w + ci(-16.5)];
    for (let j = cj(-0.95); j <= cj(1.35); j++) for (let i = ci(-19.2); i <= ci(-17); i++) {
      const k = j * w + i;
      if (i < ci(-17.75)) { if (grid[k] === WALL) grid[k] = yard; } else grid[k] = i === ci(-17.75) ? WALL : hall;
    }
    grid[cj(1.4) * w + ci(-17.75)] = WALL;
  }
  // a thin wall piece standing free in a lobby or corridor (touching no other wall) is a stray line of the drawing,
  // not a partition: it would only block the way, e.g. in front of the 1st-floor stair. Square columns stay.
  {
    const typeOf = new Map(rooms.map(r => [r.id, r.type])), seen = new Uint8Array(w * h);
    for (let s = 0; s < w * h; s++) if (grid[s] === WALL && !seen[s]) {
      const comp = [s], nb = new Map(); seen[s] = 1; let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1, free = true;
      for (let q = 0; q < comp.length; q++) {
        const c = comp[q], i = c % w, j = (c / w) | 0;
        i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
        for (const d of [1, -1, w, -w]) {
          const n = c + d, v = grid[n];
          if (v === WALL) { if (!seen[n]) { seen[n] = 1; comp.push(n); } }
          else if (isRoom(v) && typeOf.get(v) === 'hall') nb.set(v, (nb.get(v) || 0) + 1);
          else free = false;
        }
      }
      const thin = Math.min(i1 - i0, j1 - j0) + 1, long = Math.max(i1 - i0, j1 - j0) + 1;
      if (!free || comp.length > 60 || thin > 2 || long < 5) continue;
      const to = [...nb.entries()].sort((p, q) => q[1] - p[1])[0][0];
      for (const c of comp) grid[c] = to;
    }
  }
  // a room opens onto the terrace (or the chiller roof) through one door: the widest gap the sheet leaves in its glass
  // wall; the other gaps are glazed, so no two doors crowd or swing into each other
  for (const T of rooms.filter(r => r.type === 'terrace' || r.type === 'roof')) {
    const touch = new Map();                                            // room id -> its cells next to the terrace
    for (let k = w; k < w * h - w; k++) {
      const v = grid[k]; if (!isRoom(v) || v === T.id) continue;
      if ([grid[k + 1], grid[k - 1], grid[k + w], grid[k - w]].includes(T.id)) { if (!touch.has(v)) touch.set(v, []); touch.get(v).push(k); }
    }
    for (const cells of touch.values()) {
      const set = new Set(cells), lab = new Map(), groups = [];
      for (const c of cells) {
        if (lab.has(c)) continue;
        const g = [c]; lab.set(c, groups.length);
        for (let q = 0; q < g.length; q++) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const n = g[q] + dj * w + di; if (set.has(n) && !lab.has(n)) { lab.set(n, groups.length); g.push(n); } }
        groups.push(g);
      }
      // the door: the gap of door width (0.7–1.6 m) that is widest, else the middle 1.2 m of the longest contact
      const fit = g => g.length >= 7 && g.length <= 16;
      groups.sort((p, q) => (fit(q) - fit(p)) || q.length - p.length);
      const keep = groups[0].slice().sort((p, q) => (p % w) - (q % w) || p - q);
      const mid = keep.length >> 1, open = new Set(keep.slice(Math.max(0, mid - 6), mid + 6));
      for (const g of groups) for (const c of g) if (!open.has(c)) grid[c] = WIN;
    }
  }
  // numbers run round the floor anticlockwise seen from above: along the street left to right, back along the rear side
  let next = 0;
  const onFront = r => r.bb[3] > 4;
  rooms.filter(r => TYPES[r.type].pick)
    .sort((a, b) => (onFront(b) - onFront(a)) || (onFront(a) ? a.x - b.x : b.x - a.x))
    .forEach(r => r.idx = ++next);
  const byId = new Map(rooms.map(r => [r.id, r]));
  const plan = { key, P, w, h, cell, x0, z0, grid, at, ci, cj, rooms, byId };
  plan.cores = planCores(plan);
  ensureDoors(plan);
  if (key === '10') for (let j = cj(-5.75); j <= cj(-4.35); j++) grid[j * w + ci(-17.75)] = WALL;   // the store opens to the office, not the chillers
  openDoors(plan);
  fitDoorsToWalls(plan);
  plan.band = facadeBand(plan);
  layout(plan);
  keepReachable(plan);
  cache[key] = plan;
  return plan;
}

// safety net: if furniture or a door leaf still cuts a room off, clear the walking grid through its doorways
function keepReachable(plan) {
  const { w, h, grid, blocked, rooms, doors, cell } = plan, N = w * h;
  const solid = new Uint8Array(N); for (let k = 0; k < N; k++) solid[k] = isRoom(grid[k]) ? 0 : 1;
  const base = dilate(solid, w, h, 1);
  const start = rooms.filter(r => r.type === 'hall').sort((p, q) => q.area - p.area)[0] || rooms.slice().sort((p, q) => q.area - p.area)[0];
  if (!start) return;
  for (let pass = 0; pass < 6; pass++) {
    const st = nearestFree(plan, plan.ci(start.x), plan.cj(start.z)); if (!st) return;
    const seen = new Uint8Array(N), q = [st[1] * w + st[0]]; seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) { const c = q[i]; for (const d of [1, -1, w, -w]) { const n = c + d; if (n >= 0 && n < N && !seen[n] && !blocked[n]) { seen[n] = 1; q.push(n); } } }
    const reach = new Set(); for (let k = 0; k < N; k++) if (seen[k]) reach.add(grid[k]);
    const cut = new Set(rooms.filter(r => !reach.has(r.id) && r.area > 1.5 && !streetOnly[plan.key]?.has(r.id)).map(r => r.id));
    if (!cut.size) return;
    let changed = false;
    for (const d of doors) {
      const t0 = Math.round(d.t0 / cell) - 12, t1 = Math.round(d.t1 / cell) + 12, a0 = Math.round(d.a / cell) - 12, a1 = Math.round(d.b / cell) + 12;
      let touches = false;
      for (let t = t0; t < t1 && !touches; t++) for (let u = a0; u < a1; u++) { const k = d.o === 'v' ? t * w + u : u * w + t; if (k >= 0 && k < N && cut.has(grid[k])) { touches = true; break; } }
      if (!touches) continue;
      for (let t = t0; t < t1; t++) for (let u = a0; u < a1; u++) { const k = d.o === 'v' ? t * w + u : u * w + t; if (k >= 0 && k < N && blocked[k] && !base[k]) { blocked[k] = 0; changed = true; } }
    }
    if (!changed) {
      // last resort: open a 0.5 m lane along the shortest wall-free route to each cut-off room
      const prev = new Int32Array(N).fill(-1), q2 = [st[1] * w + st[0]]; prev[q2[0]] = q2[0];
      for (let i = 0; i < q2.length; i++) { const c = q2[i]; for (const d of [1, -1, w, -w]) { const n = c + d; if (n >= 0 && n < N && prev[n] < 0 && !base[n]) { prev[n] = c; q2.push(n); } } }
      let any = false;
      for (const id of cut) {
        let tgt = -1; for (let k = 0; k < N; k++) if (grid[k] === id && prev[k] >= 0) { tgt = k; break; }
        if (tgt < 0) continue;
        for (let c = tgt; c !== prev[c]; c = prev[c]) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const k = c + dj * w + di; if (k >= 0 && k < N && !base[k] && blocked[k]) { blocked[k] = 0; any = true; } }
      }
      if (!any) return;
    }
  }
}

// free-standing wall stubs (door-swing strokes, text, odd marks) become floor; doorway gaps join a room
function cleanGrid(grid, w, h) {
  const N = w * h, seen = new Uint8Array(N), D4 = [1, -1, w, -w];
  // gaps of 1–4 cells between two wall cells on a line are tracing cracks, not doorways
  for (const [n1, n2, step, line] of [[h, w, 1, w], [w, h, w, 1]]) {
    for (let a = 0; a < n1; a++) {
      let last = -1;
      for (let b = 0; b < n2; b++) {
        const k = a * line + b * step, v = grid[k];
        if (v === WALL) {
          if (last >= 0 && b - last > 1 && b - last <= 5) {
            let ok = true;
            for (let q = last + 1; q < b; q++) { const u = grid[a * line + q * step]; if (u === WIN || u === STAIR) ok = false; }
            if (ok) for (let q = last + 1; q < b; q++) grid[a * line + q * step] = WALL;
          }
          last = b;
        } else if (v === WIN || v === STAIR) last = -1;
      }
    }
  }
  for (let s = 0; s < N; s++) if (grid[s] === WALL && !seen[s]) {
    const st = [s], comp = []; seen[s] = 1; let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1;
    while (st.length) {
      const c = st.pop(); comp.push(c); const i = c % w, j = (c / w) | 0;
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
      for (const d of D4) { const q = c + d; if (q >= 0 && q < N && !seen[q] && grid[q] === WALL) { seen[q] = 1; st.push(q); } }
    }
    if (Math.max(i1 - i0, j1 - j0) >= 9 || comp.length >= 70) continue;
    const cnt = new Map();
    for (const c of comp) for (const d of D4) { const v = grid[c + d]; if (isRoom(v)) cnt.set(v, (cnt.get(v) || 0) + 1); }
    let best = 0, bn = 0; for (const [v, n] of cnt) if (n > bn) { best = v; bn = n; }
    if (best) for (const c of comp) grid[c] = best;
  }
  // only gaps that sit between rooms (doorways) get filled — never the open margin outside the building
  for (let it = 0; it < 4; it++) {
    const add = [];
    for (let k = w; k < N - w; k++) {
      if (grid[k] !== 0) continue;
      for (const d of [1, w]) {
        let a = 0, b = 0;
        for (let q = 1; q <= 4 && !a; q++) { const v = grid[k - d * q]; if (isRoom(v)) a = v; else if (v !== 0) break; }
        for (let q = 1; q <= 4 && !b; q++) { const v = grid[k + d * q]; if (isRoom(v)) b = v; else if (v !== 0) break; }
        if (a && b) { add.push(k, grid[k - d] && isRoom(grid[k - d]) ? grid[k - d] : a); break; }
      }
    }
    if (!add.length) break;
    for (let q = 0; q < add.length; q += 2) grid[add[q]] = add[q + 1];
  }
}

// rooms cut off in tracing (closed doorway, sealed crack): open a 0.9 m doorway towards a reachable room,
// corridor side first, until every room can be reached from the main corridor
function ensureDoors(plan) {
  const { w, h, grid, rooms, byId } = plan, D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const contacts = () => {
    const m = new Map();
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const a = grid[j * w + i]; if (!isRoom(a)) continue;
      for (const b of [grid[j * w + i + 1], grid[(j + 1) * w + i]]) if (isRoom(b) && b !== a) { const k = a < b ? `${a}|${b}` : `${b}|${a}`; m.set(k, (m.get(k) || 0) + 1); }
    }
    return m;
  };
  const start = rooms.filter(r => r.type === 'hall').sort((p, q) => q.area - p.area)[0] || rooms.slice().sort((p, q) => q.area - p.area)[0];
  if (!start) return;
  const isHallId = v => byId.get(v)?.type === 'hall';
  for (let pass = 0; pass < 24; pass++) {
    const hallsOnly = pass < 12;
    // walkable = room cells at least 0.25 m from anything solid; flood from the main corridor
    const solid = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) solid[k] = isRoom(grid[k]) ? 0 : 1;
    const blk = dilate(solid, w, h, 2), seen = new Uint8Array(w * h);
    let s0 = -1, bestD = 1e18;
    for (let k = 0; k < w * h; k++) if (grid[k] === start.id && !blk[k]) { const dd = (k % w - (start.x - plan.x0) / plan.cell) ** 2 + (((k / w) | 0) - (start.z - plan.z0) / plan.cell) ** 2; if (dd < bestD) { bestD = dd; s0 = k; } }
    if (s0 < 0) return;
    const q = [s0]; seen[s0] = 1;
    for (let qi = 0; qi < q.length; qi++) { const c = q[qi]; for (const d of [1, -1, w, -w]) { const n = c + d; if (n >= 0 && n < w * h && !seen[n] && !blk[n] && (!hallsOnly || isHallId(grid[n]))) { seen[n] = 1; q.push(n); } } }
    const reach = new Set(); for (let k = 0; k < w * h; k++) if (seen[k]) reach.add(grid[k]);
    const cut = rooms.filter(r => !reach.has(r.id) && r.area > 1.5 && (!hallsOnly || r.type === 'hall') && !streetOnly[plan.key]?.has(r.id));
    if (!cut.length) { if (hallsOnly) { pass = 11; continue; } break; }
    let progress = false;
    for (const r of cut) {
      const cands = new Map();
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        if (grid[j * w + i] !== r.id) continue;
        for (let d = 0; d < 4; d++) {
          const [di, dj] = D[d]; let k = 1, ii = i + di, jj = j + dj;
          while (k <= 8 && ii > 0 && jj > 0 && ii < w - 1 && jj < h - 1 && grid[jj * w + ii] === WALL) { k++; ii += di; jj += dj; }
          if (k === 1 || k > 8) continue;
          const v = grid[jj * w + ii], t = byId.get(v);
          if (!isRoom(v) || v === r.id || !t || !reach.has(v) || (hallsOnly && t.type !== 'hall')) continue;
          const along = di ? j : i, key = `${d}|${v}`;
          if (!cands.has(key)) cands.set(key, { d, v, t, list: [], center: dj !== 0 && Math.sign(dj) === -Math.sign(r.z) });
          cands.get(key).list.push({ along, i, j, k });
        }
      }
      let best = null;
      for (const c of cands.values()) {
        const byAlong = new Map(); for (const q3 of c.list) { const o = byAlong.get(q3.along); if (!o || q3.k < o.k) byAlong.set(q3.along, q3); }
        c.list = [...byAlong.values()].sort((a, b) => a.along - b.along);
        for (let s0 = 0; s0 < c.list.length;) {
          let e = s0; while (e + 1 < c.list.length && c.list[e + 1].along === c.list[e].along + 1) e++;
          const len = e - s0 + 1, score = len + (c.t.type === 'hall' ? 100 : 0) + (c.center ? 60 : 0) - (c.t.type === 'wc' ? 200 : 0);
          if (len >= 10 && (!best || score > best.score)) best = { c, run: c.list.slice(s0, e + 1), score };
          s0 = e + 1;
        }
      }
      if (!best) continue;
      const { c, run } = best, mid = run.length >> 1, [di, dj] = D[c.d], half = r.type === 'hall' && c.t.type === 'hall' ? 6 : 5;
      for (const q2 of run.slice(Math.max(0, mid - half + 1), mid + half)) for (let k = 1; k < q2.k; k++) grid[(q2.j + dj * k) * w + q2.i + di * k] = k <= q2.k / 2 ? r.id : c.v;
      progress = true;
      break;            // recompute reachability after each opening
    }
    if (!progress) { if (hallsOnly) { pass = 11; continue; } break; }
  }
}

// a doorway can be cut a cell deeper than the wall it sits in: frame, head and leaf go in the plane of the wall either
// side of it, so the leaf closes flush with the wall instead of standing out into the corridor
function fitDoorsToWalls(plan) {
  const { cell, at } = plan;
  for (const d of plan.doors) {
    const u0 = Math.round(d.a / cell), u1 = Math.round(d.b / cell), side = [Math.round(d.t0 / cell) - 1, Math.round(d.t1 / cell)];
    // the wall the door sits in is the thinner side: the other may be a column or a crossing wall at the corner
    let best = null;
    for (const t of side) {
      let ua = 1e9, ub = -1;
      for (let u = u0; u < u1; u++) { const v = d.o === 'v' ? at(u, t) : at(t, u); if (v === WALL || v === WIN) { ua = Math.min(ua, u); ub = Math.max(ub, u + 1); } }   // glass partitions too
      if (ub > ua && (!best || ub - ua < best[1] - best[0])) best = [ua, ub];
    }
    if (best) { d.a = best[0] * cell; d.b = best[1] * cell; }
    // a door never stands out of its wall: where it came out deeper, it sits on the line between the two rooms
    if (d.b - d.a > 0.32) {
      const t = Math.round((d.t0 + d.t1) / 2 / cell), cellAt = u => d.o === 'v' ? at(u, t) : at(t, u);
      let ua = Math.round(d.a / cell), ub = Math.round(d.b / cell) - 1;
      while (ua < ub && cellAt(ua + 1) === d.low) ua++;
      while (ub > ua && cellAt(ub - 1) === d.high) ub--;
      const c = (ua + 1 + ub) / 2;
      d.a = (Math.round(c) - 1) * cell; d.b = (Math.round(c) + 1) * cell;
    }
  }
}

// openings between two rooms: clusters of touching cells, oriented by the wall jambs at their ends,
// widened to at least 1 m by cutting into the wall
function openDoors(plan) {
  const { w, h, grid, at, cell, byId } = plan, doors = [];
  plan.doors = doors;
  const pairs = new Map();
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = grid[j * w + i]; if (!isRoom(a)) continue;
    for (const [b, px, pz] of [[grid[j * w + i + 1], i + 1, j + 0.5], [grid[(j + 1) * w + i], i + 0.5, j + 1]]) {
      if (!isRoom(b) || b === a) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push([px, pz]);
    }
  }
  for (const [key, pts] of pairs) {
    const [a, b] = key.split('|').map(Number), ra = byId.get(a), rb = byId.get(b);
    if (!ra || !rb || (ra.type === 'hall' && rb.type === 'hall' && plan.key !== '10')) continue;
    const lab = new Int32Array(pts.length).fill(-1); let nl = 0;
    for (let s0 = 0; s0 < pts.length; s0++) {
      if (lab[s0] >= 0) continue;
      const st = [s0]; lab[s0] = nl;
      while (st.length) { const c = st.pop(); for (let q = 0; q < pts.length; q++) if (lab[q] < 0 && Math.abs(pts[q][0] - pts[c][0]) <= 1.6 && Math.abs(pts[q][1] - pts[c][1]) <= 1.6) { lab[q] = nl; st.push(q); } }
      nl++;
    }
    for (let l = 0; l < nl; l++) {
      const cp = pts.filter((_, q) => lab[q] === l), xs = cp.map(p => p[0]), zs = cp.map(p => p[1]);
      const hyp = o => {
        const along = o === 'v' ? zs : xs, across = (o === 'v' ? xs : zs).slice().sort((p, q) => p - q);
        const t0 = Math.floor(Math.min(...along)), t1 = Math.ceil(Math.max(...along)), L = Math.round(across[across.length >> 1]) - 1;
        const wa = (u, t) => (o === 'v' ? at(u, t) : at(t, u)) === WALL;
        let hits = 0; for (const u of [L - 1, L, L + 1, L + 2]) { if (wa(u, t0 - 1)) hits++; if (wa(u, t1)) hits++; }
        return { o, t0, t1, L, hits };
      };
      const A = hyp('v'), B = hyp('h');
      let { o, t0, t1, L } = A.hits !== B.hits ? (A.hits > B.hits ? A : B) : ((A.t1 - A.t0) >= (B.t1 - B.t0) ? A : B);
      if ((t1 - t0) * cell < 0.45 || (t1 - t0) * cell > 2.0) continue;
      const cellIdx = (u, t) => o === 'v' ? t * w + u : u * w + t;
      const wallAt = (u, t) => (o === 'v' ? at(u, t) : at(t, u)) === WALL;
      let lo = L, hi = L + 1;
      for (const t of [t0 - 1, t1]) { let u = L; while (u > L - 6 && wallAt(u, t)) u--; let v = L + 1; while (v < L + 7 && wallAt(v, t)) v++; lo = Math.min(lo, u + 1); hi = Math.max(hi, v); }
      if (hi - lo < 2) { lo = L - 1; hi = L + 2; }
      const mid = (t0 + t1) >> 1;
      let lowId = o === 'v' ? at(lo - 1, mid) : at(mid, lo - 1), highId = o === 'v' ? at(hi, mid) : at(mid, hi);
      if (lowId !== a && lowId !== b) lowId = highId === a ? b : a;
      if (highId !== a && highId !== b) highId = lowId === a ? b : a;
      // widen to >= 1 m where the wall continues
      const cellAt2 = (u, t) => o === 'v' ? at(u, t) : at(t, u);
      const solid = t => {
        if (!isRoom(cellAt2(lo - 1, t)) || !isRoom(cellAt2(hi, t))) return false;   // never cut into a crossing wall
        for (let u = lo; u < hi; u++) { const v = cellAt2(u, t); if (v !== WALL && !isRoom(v)) return false; }
        return true;
      };
      const take = t => { for (let u = lo; u < hi; u++) grid[cellIdx(u, t)] = u <= L ? lowId : highId; };
      for (let k = 0; t1 - t0 < 13 && k < 16; k++) {       // doorways at least 1.3 m where the wall allows
        if (k % 2 === 0 && solid(t0 - 1)) { take(t0 - 1); t0--; }
        else if (solid(t1)) { take(t1); t1++; }
        else if (solid(t0 - 1)) { take(t0 - 1); t0--; }
        else break;
      }
      for (let t = t0; t < t1; t++) for (let u = lo; u < hi; u++) if (grid[cellIdx(u, t)] === WALL) grid[cellIdx(u, t)] = u <= L ? lowId : highId;
      // swing to the side with room for the leaf: into the room rather than the corridor when it is deep enough,
      // and between two rooms into the roomier side (a small bathroom door opens outwards, not against the basin)
      const depthOn = (id, dir) => { let n = 0; for (let u = dir < 0 ? lo - 1 : hi; n < 16 && cellAt2(u, mid) === id; u += dir) n++; return n; };
      const dA = depthOn(a, lowId === a ? -1 : 1), dB = depthOn(b, lowId === b ? -1 : 1);
      const rooms2 = [[ra, dA], [rb, dB]], inner = rooms2.filter(([r]) => r.type !== 'hall');
      const target = inner.length === 1 ? (inner[0][1] >= 12 ? inner[0][0] : rooms2.find(([r]) => r.type === 'hall')[0])
        : (dA >= dB ? ra : rb);
      doors.push({ o, a: lo * cell, b: hi * cell, t0: t0 * cell, t1: t1 * cell, into: highId === target.id ? 1 : -1, wc: ra.type === 'wc' || rb.type === 'wc', low: lowId, high: highId });
    }
  }
}

/* ---------- Poly Haven models used as props (real-world size, front faces +z) ---------- */
export const MODELS = {
  plant: { file: 'calathea_orbifolia_01', w: 0.6, d: 0.6, variants: true },   // five bushes side by side in the file
  armchair: { file: 'modern_arm_chair_01', w: 0.82, d: 0.97 },
  sofa: { file: 'sofa_03', w: 2.74, d: 0.92 },
  coffee: { file: 'modern_coffee_table_01', w: 1.2, d: 0.6, rotate: true },   // long side lies along z in the file
  side: { file: 'side_table_01', w: 0.56, d: 0.46 },
  // project models from the 3ds Max scenes, simplified by tools/models_build.py (Draco GLB, no textures)
  bed: { file: 'bed', glb: true, w: 2.0, d: 2.02 },                         // upholstered bed, 1.8 × 2.0 m mattress
  fridge: { file: 'fridge', glb: true, w: 0.9, d: 0.76 },                   // SMEG side-by-side
  door: { file: 'door', glb: true, w: 0.805, h: 2.0 },                      // Vogue door leaf, swaps the box leaves
};
const SIDE_ROT = { '-z': 0, '+z': Math.PI, '-x': Math.PI / 2, '+x': -Math.PI / 2 };

/* ---------- furniture solver ---------- */
function layout(plan) {
  const { w, h, grid, at, cell, x0, z0, rooms } = plan;
  const N = w * h;
  // cells next to a doorway (a room cell touching another room) stay clear of furniture
  const door = new Uint8Array(N);
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const v = grid[j * w + i]; if (!isRoom(v)) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = grid[(j + dj) * w + i + di]; if (isRoom(u) && u !== v) { door[j * w + i] = 1; break; } }
  }
  const noFurn = dilate(door, w, h, 8), noFurnHall = dilate(door, w, h, 16);   // 0.8 m clear at every doorway (the leaf swing is kept clear apart), more in corridors
  const occ = new Uint8Array(N);
  for (const k of plan.liftCells || []) occ[k] = 1;      // nothing gets furnished inside a lift cabin
  // walking: walls / windows / stairs / outside, grown by the body radius; furniture added below
  const solid = new Uint8Array(N);
  for (let k = 0; k < N; k++) solid[k] = isRoom(grid[k]) ? 0 : 1;
  const blocked = dilate(solid, w, h, 1);
  plan.blocked = blocked;
  const furn = new Boxes(), props = [];
  plan.occ = occ;                                        // furniture, the room round it and door swings: spawnPoint keeps clear
  plan.furn = furn; plan.props = props;
  const toX = i => x0 + i * cell, toZ = j => z0 + j * cell;

  function fits(i0, j0, i1, j1, rid) {
    if (i0 < 0 || j0 < 0 || i1 > w || j1 > h) return false;
    const rt = plan.byId.get(rid)?.type, nf = rt === 'hall' || rt === 'tech' ? noFurnHall : noFurn;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const k = j * w + i; if (grid[k] !== rid || nf[k] || occ[k]) return false; }
    return true;
  }
  // share of cells behind the item that are wall (or window for low items)
  function backed(i0, j0, i1, j1, side, low, inner) {
    let ok = 0, n = 0, fac = 0;
    const test = (i, j) => { n++; const v = at(i, j); if (v === WALL || v === STAIR || (low && v === WIN)) ok++; if (plan.band[j * w + i]) fac++; };
    if (side === '-z') for (let i = i0; i < i1; i++) test(i, j0 - 1);
    if (side === '+z') for (let i = i0; i < i1; i++) test(i, j1);
    if (side === '-x') for (let j = j0; j < j1; j++) test(i0 - 1, j);
    if (side === '+x') for (let j = j0; j < j1; j++) test(i1, j);
    return n && ok / n > 0.8 && (!inner || fac / n < 0.2);
  }
  function claim(i0, j0, i1, j1) {
    for (let j = Math.max(0, j0 - 4); j < Math.min(h, j1 + 4); j++) for (let i = Math.max(0, i0 - 4); i < Math.min(w, i1 + 4); i++) {   // 0.4 m walkway round items
      occ[j * w + i] = 1;            // furniture never blocks walking
    }
  }

  // door leaves (open 90° into the room) for every opening found by openDoors()
  function drawDoorLeaves() {
    // hinge point, closed direction (a) and swing direction (n) of every leaf; doors over 1.25 m get two leaves
    plan.doorLeaves = [];
    plan.doors.forEach((d, pair) => {
      const o = d.o, off = o === 'v' ? x0 : z0, offT = o === 'v' ? z0 : x0;
      const lineW = off + (d.into > 0 ? d.b : d.a) + d.into * 0.025, Ts = offT + d.t0 + 0.06, Te = offT + d.t1 - 0.06, cw = Te - Ts;
      const otherW = off + (d.into > 0 ? d.a : d.b) - d.into * 0.025;          // hinge line if the leaf swings the other way
      const [nx, nz] = o === 'v' ? [d.into, 0] : [0, d.into], [ax, az] = o === 'v' ? [0, 1] : [1, 0];
      const leaf = (t, s, lw) => {
        const [x, z] = o === 'v' ? [lineW, t] : [t, lineW], shift = otherW - lineW;
        plan.doorLeaves.push({ x, z, ax: ax * s, az: az * s, nx, nz, w: lw, h: 2.03, kind: d.wc ? 'wc' : 'wood', pair, flipN: o === 'v' ? [shift, 0] : [0, shift], double: cw > 1.25, base: [ax, az], t0: Ts, t1: Te });
      };
      if (cw <= 1.25) {
        // a leaf of at most 1.05 m; the rest of a wide opening is a fixed side panel, so the swing stays modest
        const lw = Math.min(cw - 0.01, 1.05);
        leaf(Ts + 0.005, 1, lw);
        if (cw - lw > 0.12) { leaf(Ts + lw + 0.015, 1, cw - lw - 0.02); plan.doorLeaves[plan.doorLeaves.length - 1].fixed = true; }
      } else { leaf(Ts + 0.005, 1, cw / 2 - 0.01); leaf(Te - 0.005, -1, cw / 2 - 0.01); }
    });
    // two doors close together must not swing into each other: hinge on the other jamb, or swing to the other side
    const swingPts = L => { const out = []; for (let a = 0; a <= 1.0001; a += 0.125) for (const t of [0.35, 0.7, L.w]) { const g = a * Math.PI / 2; out.push([L.x + (L.ax * Math.cos(g) + L.nx * Math.sin(g)) * t, L.z + (L.az * Math.cos(g) + L.nz * Math.sin(g)) * t]); } return out; };
    const inSwing = (L, [x, z]) => { if (L.fixed) return false; const dx = x - L.x, dz = z - L.z, r = Math.hypot(dx, dz); return r < L.w + 0.1 && dx * L.ax + dz * L.az > -0.05 && dx * L.nx + dz * L.nz > -0.05; };
    const clash = (A, B) => A.pair !== B.pair && (swingPts(B).some(p => inSwing(A, p)) || swingPts(A).some(p => inSwing(B, p)));
    const hingeFlip = L => ({ ...L, x: L.x + L.ax * L.w, z: L.z + L.az * L.w, ax: -L.ax, az: -L.az });
    const swingFlip = L => ({ ...L, x: L.x + L.flipN[0], z: L.z + L.flipN[1], nx: -L.nx, nz: -L.nz, flipN: [-L.flipN[0], -L.flipN[1]] });
    const Ls = plan.doorLeaves;
    for (let i = 0; i < Ls.length; i++) {
      if (Ls[i].double || Ls[i].fixed || !Ls.some((M, k) => k !== i && clash(M, Ls[i]))) continue;
      for (const alt of [hingeFlip(Ls[i]), swingFlip(Ls[i]), swingFlip(hingeFlip(Ls[i]))]) {
        if (!Ls.some((M, k) => k !== i && clash(M, alt))) { Ls[i] = alt; break; }
      }
    }
    // a fixed side panel fills whatever part of its opening the swinging leaf does not, on the same face of the wall
    for (const fp of Ls) {
      if (!fp.fixed) continue;
      const m = Ls.find(M => M.pair === fp.pair && !M.fixed); if (!m) continue;
      const [bx, bz] = m.base, ht = m.x * bx + m.z * bz, dir = Math.sign(m.ax * bx + m.az * bz) || 1;
      const r0 = dir > 0 ? ht : ht - m.w, r1 = dir > 0 ? ht + m.w : ht;
      const [s0, s1] = r0 - m.t0 < 0.05 ? [r1 + 0.01, m.t1] : [m.t0, r0 - 0.01];
      Object.assign(fp, { x: m.x + bx * (s0 - ht), z: m.z + bz * (s0 - ht), ax: bx, az: bz, nx: m.nx, nz: m.nz, w: Math.max(0.05, s1 - s0) });
    }
  }
  const SIDES = ['-z', '+z', '-x', '+x'];
  // find a spot for an item len (along the wall) × dep (out from the wall), in metres
  function place(r, len, dep, { low = false, center = false, inner = false } = {}) {
    const L = Math.round(len / cell), D = Math.round(dep / cell);
    const bi0 = Math.floor((r.bb[0] - x0) / cell), bj0 = Math.floor((r.bb[1] - z0) / cell);
    const bi1 = Math.ceil((r.bb[2] - x0) / cell), bj1 = Math.ceil((r.bb[3] - z0) / cell);
    if (center) {
      const ci = Math.round((r.x - x0) / cell), cj = Math.round((r.z - z0) / cell);
      const along = (bi1 - bi0) >= (bj1 - bj0);
      const wi = along ? L : D, wj = along ? D : L;
      for (let s = 0; s < 14; s++) for (const [di, dj] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
        const i0 = ci - (wi >> 1) + di, j0 = cj - (wj >> 1) + dj;
        if (fits(i0, j0, i0 + wi, j0 + wj, r.id)) { claim(i0, j0, i0 + wi, j0 + wj); return { i0, j0, i1: i0 + wi, j1: j0 + wj, side: along ? '-z' : '-x' }; }
      }
      return null;
    }
    for (const side of SIDES) {
      const horiz = side === '-z' || side === '+z';
      const wi = horiz ? L : D, wj = horiz ? D : L;
      for (let j0 = bj0; j0 + wj <= bj1; j0++) for (let i0 = bi0; i0 + wi <= bi1; i0++) {
        const i1 = i0 + wi, j1 = j0 + wj;
        if (!backed(i0, j0, i1, j1, side, low, inner)) continue;
        if (!fits(i0, j0, i1, j1, r.id)) continue;
        claim(i0, j0, i1, j1);
        return { i0, j0, i1, j1, side };
      }
    }
    return null;
  }
  // local frame: a runs along the wall, b goes out from it, y up
  function frame(s) {
    const X0 = toX(s.i0), X1 = toX(s.i1), Z0 = toZ(s.j0), Z1 = toZ(s.j1);
    const map = {
      '-z': (a, b) => [X0 + a, Z0 + b], '+z': (a, b) => [X1 - a, Z1 - b],
      '-x': (a, b) => [X0 + b, Z1 - a], '+x': (a, b) => [X1 - b, Z0 + a],
    }[s.side];
    const len = (s.side === '-z' || s.side === '+z') ? X1 - X0 : Z1 - Z0;
    const dep = (s.side === '-z' || s.side === '+z') ? Z1 - Z0 : X1 - X0;
    const B = (a0, a1, b0, b1, y0, y1, c, mat = 'plain') => { const [xa, za] = map(a0, b0), [xb, zb] = map(a1, b1); furn.add(xa, xb, y0, y1, za, zb, c, mat); };
    // drop a model with its back to the wall, centred at (a, b) in the local frame
    const prop = (m, a, b, extra = 0, y = 0, sc = 1) => { const [x, z] = map(a, b); props.push({ m, x, z, rot: SIDE_ROT[s.side] + extra, y, s: sc, v: props.length }); };
    return { B, prop, len, dep };
  }

  const D = {
    bed(s, accent) {
      const { B, prop, len } = frame(s);
      B(0.03, len - 0.03, 0, 0.03, 0, 2.7, accent, 'fabric');                     // upholstered accent wall
      for (let a = 0.03 + (len - 0.06) / 4; a < len - 0.2; a += (len - 0.06) / 4) B(a - 0.008, a + 0.008, 0.03, 0.04, 1.25, 2.7, COL.gold, 'metal');
      for (const a of [0, len - 0.03]) B(a, a + 0.03, 0, 0.05, 0, 2.74, COL.gold, 'metal');
      B(0, len, 0, 0.05, 2.7, 2.74, COL.gold, 'metal');
      // bed model: 1.8 m wide in the big slot, a little narrower in small rooms
      const sc = Math.min(0.9, (len - 0.1) / MODELS.bed.w), bw = MODELS.bed.w * sc, m = (len - bw) / 2;
      prop('bed', len / 2, 0.04 + MODELS.bed.d * sc / 2, 0, 0, sc);
      if (m > 0.52) for (const a of [0.02, len - 0.5]) { prop('side', a + 0.24, 0.25); B(a + 0.17, a + 0.31, 0.18, 0.32, 0.55, 0.85, COL.gold, 'metal'); }
    },
    wardrobe(s) {
      const { B, len } = frame(s);
      B(0, len, 0, 0.6, 0, 2.35, COL.oakL, 'oak');
      for (let a = len / 3; a < len - 0.1; a += len / 3) B(a - 0.008, a + 0.008, 0.6, 0.61, 0.05, 2.3, COL.dark);
      for (let a = len / 3; a < len - 0.1; a += len / 3) B(a - 0.06, a - 0.04, 0.6, 0.64, 0.9, 1.4, COL.gold, 'metal');
    },
    desk(s) {
      const { B, prop, len } = frame(s);
      B(0, len, 0, 0.55, 0.72, 0.77, COL.oak, 'oak');
      B(0.02, 0.06, 0.03, 0.52, 0, 0.72, COL.black, 'metal'); B(len - 0.06, len - 0.02, 0.03, 0.52, 0, 0.72, COL.black, 'metal');
      B(len / 2 - 0.62, len / 2 + 0.62, 0, 0.04, 1.15, 1.85, COL.black, 'gloss');  // TV
      prop('armchair', len / 2, 1.05, Math.PI, 0, 0.7);                         // chair facing the desk
    },
    kitchen(s) {
      const { B, len } = frame(s);
      B(0, len, 0, 0.6, 0.08, 0.86, COL.white, 'gloss'); B(0, len, 0.02, 0.56, 0, 0.08, COL.dark);
      B(0, len, 0, 0.63, 0.86, 0.9, COL.white, 'marble');
      B(0, len, 0, 0.35, 1.45, 2.2, COL.white, 'gloss');
      B(len * 0.55, len * 0.55 + 0.5, 0.1, 0.5, 0.9, 0.915, COL.steel, 'metal');
      B(0, len, 0.36, 0.37, 1.45, 1.47, COL.gold, 'metal');
    },
    shower(s) {
      const { B, len, dep } = frame(s);
      B(0, len, 0, dep, 0, 0.05, COL.white, 'gloss');
      B(0, len, dep - 0.015, dep, 0.05, 2.05, COL.glass, 'glass'); B(len - 0.015, len, 0, dep, 0.05, 2.05, COL.glass, 'glass');
      B(len / 2 - 0.12, len / 2 + 0.12, 0, 0.06, 1.95, 2.0, COL.gold, 'metal');
    },
    toilet(s) {
      const { B, len } = frame(s), c = len / 2;
      B(c - 0.2, c + 0.2, 0, 0.16, 0.3, 0.85, COL.white, 'gloss'); B(c - 0.19, c + 0.19, 0.12, 0.66, 0.05, 0.42, COL.white, 'gloss');
    },
    vanity(s) {
      const { B, len } = frame(s);
      B(0, len, 0, 0.48, 0.25, 0.82, COL.oak, 'oak'); B(0, len, 0, 0.5, 0.82, 0.86, COL.white, 'marble');
      B(0.08, len - 0.08, 0, 0.02, 1.1, 1.95, COL.mirror, 'mirror');
    },
    rack(s) {
      const { B, len } = frame(s);
      B(0, len, 0, 0.04, 0, 2.2, COL.dark, 'metal');
      for (const y of [0.1, 0.6, 1.1, 1.6]) B(0, len, 0, 0.45, y, y + 0.035, COL.oakL, 'oak');
      for (let a = 0.15; a < len - 0.3; a += 0.42) B(a, a + 0.3, 0.08, 0.38, 0.64, 0.95, ACCENTS[(a * 7 | 0) % ACCENTS.length], 'fabric');
    },
    counter(s) {
      const { B, len } = frame(s);
      B(0, len, 0, 0.6, 0, 1.0, COL.white, 'gloss'); B(-0.02, len + 0.02, -0.02, 0.62, 1.0, 1.05, COL.white, 'marble');
      B(0, len, 0.6, 0.61, 0.1, 0.95, COL.gold, 'metal');
    },
    display(s) {
      const { B, len, dep } = frame(s);
      B(0, len, 0, dep, 0.76, 0.8, COL.white, 'marble'); B(0.1, len - 0.1, 0.1, dep - 0.1, 0, 0.76, COL.oak, 'oak');
      B(len * 0.2, len * 0.4, dep * 0.3, dep * 0.7, 0.8, 0.98, COL.gold, 'metal'); B(len * 0.6, len * 0.8, dep * 0.3, dep * 0.7, 0.8, 1.02, '#2A3C5F', 'leather');
    },
    confTable(s) {
      const { B, prop, len, dep } = frame(s);
      B(1.0, len - 1.0, 0.75, dep - 0.75, 0.72, 0.77, COL.oakD, 'oak'); B(1.4, len - 1.4, dep / 2 - 0.15, dep / 2 + 0.15, 0, 0.72, COL.black, 'metal');
      for (let a = 1.25; a < len - 1.4; a += 0.75) for (const near of [true, false]) {
        const b = near ? 0.15 : dep - 0.6;
        prop('armchair', a + 0.23, b + 0.23, near ? 0 : Math.PI, 0, 0.6);
      }
    },
    deskOffice(s) {
      const { B, prop, len } = frame(s);
      B(0, len, 0, 0.7, 0.72, 0.76, COL.white, 'gloss'); B(0.05, 0.09, 0.05, 0.65, 0, 0.72, COL.dark, 'metal'); B(len - 0.09, len - 0.05, 0.05, 0.65, 0, 0.72, COL.dark, 'metal');
      B(len / 2 - 0.3, len / 2 + 0.3, 0.1, 0.13, 0.78, 1.15, COL.black, 'gloss');
      prop('armchair', len / 2, 1.15, Math.PI, 0, 0.7);
    },
    cabinet(s) {
      const { B, len } = frame(s);
      B(0, len, 0, 0.6, 0, 1.9, '#B3BAC0', 'metal'); B(0.05, len - 0.05, 0.6, 0.61, 1.2, 1.7, COL.dark);
    },
    tank(s) {
      const { B, len, dep } = frame(s);
      B(0.1, len - 0.1, 0.1, dep - 0.1, 0, 1.6, '#C9CED2', 'metal'); B(0.3, len - 0.3, 0.3, dep - 0.3, 1.6, 1.75, COL.steel, 'metal');
    },
    // white planter + Poly Haven calathea bush on top
    planter(s) {
      const { B, prop } = frame(s);
      B(0.07, 0.48, 0.07, 0.48, 0, 0.44, COL.white, 'gloss'); B(0.1, 0.45, 0.1, 0.45, 0.44, 0.46, '#4A3A2C');
      prop('plant', 0.275, 0.275, Math.random() * 6.28, 0.42, 1.25);
    },
    plantBox(s) {
      const { B } = frame(s);
      B(0.08, 0.47, 0.08, 0.47, 0, 0.42, COL.white, 'gloss'); B(0.02, 0.53, 0.02, 0.53, 0.42, 1.05, COL.leaf); B(0.12, 0.43, 0.12, 0.43, 1.05, 1.4, COL.leaf2);
    },
    model(s, m, extra = 0) { const { prop, len, dep } = frame(s); prop(m, len / 2, dep / 2, extra); },
  };

  drawDoorLeaves();
  // nothing stands where a door leaf swings open, nor just past it, so every doorway can be walked through
  for (const d of plan.doorLeaves) {
    if (d.fixed) continue;                                 // a fixed side panel never swings
    for (let a = 0; a <= 1.0001; a += 0.05) for (let t = 0; t <= d.w + 0.15; t += 0.05) {
      const ang = a * Math.PI / 2, ux = d.ax * Math.cos(ang) + d.nx * Math.sin(ang), uz = d.az * Math.cos(ang) + d.nz * Math.sin(ang);
      const i = Math.floor((d.x + ux * t - x0) / cell), j = Math.floor((d.z + uz * t - z0) / cell);
      if (i >= 0 && j >= 0 && i < w && j < h) occ[j * w + i] = 1;
    }
  }
  // and no lobby furniture within 1.5 m of a stair, so the way onto it stays open
  {
    const st = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) if (grid[k] === STAIR) st[k] = 1;
    const near = dilate(st, w, h, 15);
    for (let k = 0; k < w * h; k++) if (near[k] && plan.byId.get(grid[k])?.type === 'hall') occ[k] = 1;
  }
  rooms.forEach((r, ri) => {
    const accent = ACCENTS[ri % ACCENTS.length];
    const put = (fn, len, dep, opt, ...args) => { const s = place(r, len, dep, opt); if (s) D[fn](s, ...args); return s; };
    const putIn = (fn, len, dep, opt = {}, ...args) => put(fn, len, dep, { ...opt, inner: true }, ...args);
    const plant = () => { const s = place(r, 0.55, 0.55, { low: true }); if (s) D.planter(s); };
    const sofa = () => {
      const s = place(r, 2.8, 0.95, { low: true }); if (!s) return null;
      D.model(s, 'sofa');
      return s;
    };
    switch (r.type) {
      case 'room': {                                       // office: desks along the walls, a cabinet, a guest chair
        const n = Math.max(1, Math.min(8, Math.floor(r.area / 6)));
        for (let k = 0; k < n; k++) put('deskOffice', 1.4, 1.3, { low: true });
        put('cabinet', 1.2, 0.6, { inner: true }) || put('wardrobe', 1.0, 0.6, { inner: true });
        if (r.area > 18) sofa();
        put('model', 0.9, 1.0, { low: true }, 'armchair');
        plant();
        break;
      }
      case 'wc':
        put('shower', 0.9, 0.9); put('toilet', 0.5, 0.7); put('vanity', 0.8, 0.5);
        break;
      case 'store':
        put('wardrobe', 1.2, 0.6, { inner: true });
        break;
      case 'hall':
        if (r.area > 40 && r.fill > 0.5) sofa();      // a lounge sofa in big lobbies only; corridors stay clear
        break;
      case 'conf': {
        const long = Math.max(r.bb[2] - r.bb[0], r.bb[3] - r.bb[1]);
        put('confTable', Math.min(long - 1.6, 6.8), 2.6, { center: true });
        sofa(); plant(); plant();
        break;
      }
      case 'shop':
        for (let k = 0; k < 4; k++) put('rack', 2.4, 0.5);
        put('counter', 1.8, 0.62);
        put('display', 1.4, 0.8, { center: true }); put('display', 1.4, 0.8, { center: true });
        put('model', 0.9, 1.0, { low: true }, 'armchair');
        plant();
        break;
      case 'terrace':                                      // open terrace: planters along the parapet, a lounge sofa
        for (let k = 0; k < 6; k++) plant();
        sofa(); sofa();
        break;
      case 'office':
        for (let k = 0; k < 3; k++) put('deskOffice', 1.4, 1.3, { low: true });
        put('wardrobe', 1.2, 0.6, { inner: true }); plant();
        break;
      case 'logistics':                                    // one open hall: shelving along the walls, the stair free
        for (let k = 0; k < 5; k++) put('rack', 2.4, 0.5);
        put('cabinet', 1.2, 0.6, { inner: true });
        break;
      case 'tech':
        for (let k = 0; k < 3; k++) put('cabinet', 1.2, 0.6, { inner: true });
        if (r.area > 15) put('tank', 1.4, 1.4);
        break;
    }
  });
  // 10th floor chiller roof: the chillers, same places as on the outside (the parapet is in the plan)
  if (plan.key === '10') {
    for (const [x, z, a, b, alongZ] of ROOF10.chillers) {
      const [wd, l] = alongZ ? [b, a] : [a, b];
      furn.add(x - wd / 2 - 0.2, x + wd / 2 + 0.2, 0, 0.3, z - l / 2 - 0.2, z + l / 2 + 0.2, COL.steel, 'metal');
      furn.add(x - wd / 2, x + wd / 2, 0.3, 2.6, z - l / 2, z + l / 2, '#C4C8CC');
      furn.add(x - wd / 2 + 0.1, x + wd / 2 - 0.1, 2.6, 2.72, z - l / 2 + 0.1, z + l / 2 - 0.1, '#2C3136');
    }
  }
}

function dilate(src, w, h, r) {
  // square dilation via two 1-D passes
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) { let last = -1e9; for (let i = 0; i < w; i++) { if (src[j * w + i]) last = i; if (i - last <= r) tmp[j * w + i] = 1; } last = 1e9; for (let i = w - 1; i >= 0; i--) { if (src[j * w + i]) last = i; if (last - i <= r) tmp[j * w + i] = 1; } }
  for (let i = 0; i < w; i++) { let last = -1e9; for (let j = 0; j < h; j++) { if (tmp[j * w + i]) last = j; if (j - last <= r) out[j * w + i] = 1; } last = 1e9; for (let j = h - 1; j >= 0; j--) { if (tmp[j * w + i]) last = j; if (last - j <= r) out[j * w + i] = 1; } }
  return out;
}

/* ---------- geometry per plan (shared by floors with the same layout) ---------- */
const geoCache = {};
// returns { meshes: {matKey: geometry}, ceiling: {matKey: geometry} }
export function interiorGeometry(key, wallH, storeyH = 3.4) {
  const id = key + '@' + wallH + '@' + storeyH;
  if (geoCache[id]) return geoCache[id];
  const plan = getPlan(key), { P, w, h, grid, cell, x0, z0, byId } = plan;
  const shell = new Boxes(), ceil = new Boxes();
  const band = plan.band;
  // interior walls
  for (const [a, b, c, d] of maskRects(plan, k => grid[k] === WALL && !band[k])) { shell.add(a, c, 0, wallH, b, d, COL.wall, 'plaster', true); shell.add(a, c, wallH, wallH + 0.03, b, d, COL.cap); }
  for (const [a, b, c, d] of maskRects(plan, k => grid[k] === WIN && !band[k])) {
    shell.add(a, c, 0, 0.1, b, d, COL.dark, 'metal'); shell.add(a, c, wallH - 0.1, wallH, b, d, COL.dark, 'metal');
    shell.add(a, c, 0.1, wallH - 0.1, b, d, COL.glass, 'glass');
  }
  // facade walls with the windows of the elevation
  const entrance = [];
  for (const { a, b, c, d, face, horiz } of facadeRuns(plan)) {
    const lo = horiz ? a : b, hi = horiz ? c : d, other = horiz ? (b + d) / 2 : (a + c) / 2;
    const spans = hi - lo > 0.6 ? windowSpans(key, face, lo, hi, other) : [];
    const seg = (s0, s1, y0, y1, col, mat, ao) => horiz ? shell.add(s0, s1, y0, y1, b, d, col, mat, ao) : shell.add(a, c, y0, y1, s0, s1, col, mat, ao);
    // the glazing plane, 4–10 cm inside the outer face; the reveal behind it is the wall's own depth
    const outer = { front: d, back: b, right: c, left: a }[face], sgn = face === 'front' || face === 'right' ? -1 : 1;
    const pA = Math.min(outer + sgn * 0.04, outer + sgn * 0.1), pB = Math.max(outer + sgn * 0.04, outer + sgn * 0.1), pC = (pA + pB) / 2;
    const pane = (s0, s1, y0, y1, col, mat, t0 = pA, t1 = pB) => horiz ? shell.add(s0, s1, y0, y1, t0, t1, col, mat) : shell.add(t0, t1, y0, y1, s0, s1, col, mat);
    let cur = lo;
    for (const [s0, s1, sill, top0] of spans.sort((p, q) => p[0] - q[0])) {
      const top = Math.min(top0, wallH - 0.1);
      if (s0 > cur) seg(cur, s0, 0, wallH, COL.wall, 'plaster', true);
      if (sill > 0.06) { seg(s0, s1, 0, sill, COL.wall, 'plaster', true); seg(s0, s1, sill - 0.03, sill, COL.white, 'marble'); }
      seg(s0, s1, top, wallH, COL.wall, 'plaster');
      pane(s0, s1, Math.max(0.03, sill), top, COL.glass, 'glass');
      if (key !== '1' && face === 'front' && s0 <= lo + 0.01 && lo < FX0 + 1) {   // the corner: the front glass turns into the west glass
        const west = Math.min(...PLANS[key].outline.map(p => p[0]));
        pane(west, s0, Math.max(0.03, sill), top, COL.glass, 'glass'); pane(west, west + 0.06, Math.max(0.03, sill), top, COL.dark, 'metal');
      }
      pane(s0, s0 + 0.05, Math.max(0.03, sill), top, COL.dark, 'metal'); pane(s1 - 0.05, s1, Math.max(0.03, sill), top, COL.dark, 'metal');
      // mullions; a shop front is four panes across the shop, the middle two its doors (same as outside)
      // a street front is four panes across its room, the middle two its doors (the shops, the stair hall, the main
      // entrance)
      const fronts = key !== '1' ? [] : face === 'front' ? plan.rooms.filter(r => (r.front || r.name === 'Kirish holli') && r.bb[2] > s0 && r.bb[0] < s1 && Math.abs((b + d) / 2 - r.bb[3]) < 1.2).map(r => [r.bb[0], r.bb[2], 'mid'])
        : face === 'right' && other > FX1 + 1 ? plan.rooms.filter(r => r.name === 'Logistika').map(r => [r.bb[1], r.bb[3], null]) : [];   // east end: four fixed panes
      const mulls = [];
      if (fronts.length) for (const [p0, p1, kind] of fronts) {
        const q = (p1 - p0) / 4;
        for (let k = 0; k <= 4; k++) { const m = p0 + k * q; if (m > s0 + 0.1 && m < s1 - 0.1) mulls.push(m); }
        if (!kind) continue;
        const cdoor = p0 + 2 * q;
        if (cdoor < s0 + 0.5 || cdoor > s1 - 0.5) continue;
        pane(cdoor - q, cdoor + q, 2.55, 2.6, COL.dark, 'metal');                                                // door heads
        for (const hx of [cdoor - 0.18, cdoor + 0.18]) pane(hx - 0.02, hx + 0.02, 0.9, 1.9, COL.gold, 'metal', pC - 0.1, pC + 0.1);   // pull bars
      } else if (s1 - s0 < 2) mulls.push((s0 + s1) / 2);
      else for (let m = s0 + 1.2; m < s1 - 0.3; m += 1.2) mulls.push(m);
      for (const m of mulls) pane(m - 0.03, m + 0.03, Math.max(0.03, sill), top, COL.dark, 'metal');
      cur = Math.max(cur, s1);
    }
    if (cur < hi) seg(cur, hi, 0, wallH, COL.wall, 'plaster', true);
    seg(lo, hi, wallH, wallH + 0.03, COL.cap);
  }
  // parapet round the terrace and the chiller roof
  // (the chillers stand behind a full screen wall, open to the sky)
  const parH = key === '10' ? wallH : 1.1;
  for (const [a, b, c, d] of maskRects(plan, k => grid[k] === PARAPET)) { shell.add(a, c, 0, parH, b, d, COL.wall, 'plaster', true); shell.add(a, c, parH, parH + 0.04, b, d, COL.white, 'marble'); }
  for (const d of plan.doors) {
    const off = d.o === 'v' ? x0 : z0, offT = d.o === 'v' ? z0 : x0;
    const A = off + d.a, Bv = off + d.b, T0 = offT + d.t0, T1 = offT + d.t1;
    const add = (u0, u1, y0, y1, t0, t1, c, m, ao) => d.o === 'v' ? shell.add(u0, u1, y0, y1, t0, t1, c, m, ao) : shell.add(t0, t1, y0, y1, u0, u1, c, m, ao);
    // above a door in a glass wall the glass carries on; in a plain wall, the wall
    const m = (A + Bv) / 2, cellAt = t => d.o === 'v' ? grid[plan.cj(t) * w + plan.ci(m)] : grid[plan.cj(m) * w + plan.ci(t)];
    const inGlass = cellAt(T0 - 0.05) === WIN || cellAt(T1 + 0.05) === WIN;
    if (inGlass) { add(A, Bv, 2.1, wallH - 0.1, T0, T1, COL.glass, 'glass'); add(A, Bv, wallH - 0.1, wallH, T0, T1, COL.dark, 'metal'); }
    else add(A, Bv, 2.1, wallH, T0, T1, COL.wall, 'plaster');
    add(A, Bv, wallH, wallH + 0.03, T0, T1, COL.cap);
    // the finish of the wall round it carries on over the door (corridor stone, conference oak, bathroom marble)
    if (!inGlass) for (const [id, u0, u1] of [[d.low, A - 0.025, A], [d.high, Bv, Bv + 0.025]]) {
      const t = byId.get(id)?.type, top = wallH - 0.02;
      if (key === 'b') { if (t === 'hall' || t === 'tech') add(u0, u1, 2.12, top, T0, T1, '#D4D6D3', 'plaster'); }
      else if (t === 'hall') add(u0, u1, 2.12, top, T0, T1, STONEP, 'concrete');
      else if (t === 'conf') add(u0, u1, 2.12, Math.min(2.75, wallH - 0.12), T0, T1, OAKP, 'veneer');
      else if (t === 'wc') add(u0, u1, 2.12, Math.min(2.4, wallH - 0.2), T0, T1, COL.white, 'marble');
    }
    const fc = d.wc ? COL.white : '#2B2F33', fm = d.wc ? 'gloss' : 'metal';            // dark graphite frame: the door reads apart from the oak walls
    add(A - 0.02, Bv + 0.02, 2.04, 2.12, T0, T1, fc, fm);                      // frame head
    add(A - 0.02, Bv + 0.02, 0, 2.12, T0, T0 + 0.06, fc, fm);                  // jambs
    add(A - 0.02, Bv + 0.02, 0, 2.12, T1 - 0.06, T1, fc, fm);
  }
  const { holes, ceilHoles, lifts } = buildStairs(plan, shell, ceil, storeyH, wallH);
  // open sky over the terrace and the chiller roof
  const openAir = r => r.type === 'roof' || r.type === 'terrace';
  for (const r of plan.rooms) if (openAir(r)) ceilHoles.push(...maskRects(plan, k => grid[k] === r.id));
  if (key === '9') {
    // the roof over the terrace, on its slender columns (as outside)
    const RX = FX1 - 0.9, RF = FZF - 0.6, RB = FZB + 0.6;
    ceil.add(FXT - 0.1, RX, wallH + 0.01, wallH + 0.3, RB, RF, COL.white, 'plaster');
    const cols = [[RX - 0.3, RF - 0.3], [RX - 0.3, RB + 0.3]];
    for (let x = FXT + 4.5; x < RX; x += 9) cols.push([x, RF - 0.3], [x, RB + 0.3]);
    for (const [x, z] of cols) {
      ceil.add(x - 0.11, x + 0.11, 0, wallH, z - 0.11, z + 0.11, COL.white, 'plaster');
      for (let j = plan.cj(z - 0.2); j <= plan.cj(z + 0.2); j++) for (let i = plan.ci(x - 0.2); i <= plan.ci(x + 0.2); i++) plan.blocked[j * w + i] = 1;
    }
  }
  // room floors (greedy rectangles over each room's cells) and LED ceiling panels
  const used = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = grid[j * w + i]; if (!isRoom(v) || used[j * w + i]) continue;
    let i1 = i; while (i1 < w && grid[j * w + i1] === v && !used[j * w + i1]) i1++;
    let j1 = j + 1;
    outer: for (; j1 < h; j1++) { for (let q = i; q < i1; q++) if (grid[j1 * w + q] !== v || used[j1 * w + q]) break outer; }
    for (let jj = j; jj < j1; jj++) used.fill(1, jj * w + i, jj * w + i1);
    const r = byId.get(v);
    const fl = key === 'b' ? 'concrete' : r ? TYPES[r.type].floor : 'marble';           // basement: plain concrete throughout
    shell.add(x0 + i * cell, x0 + i1 * cell, 0, 0.04, z0 + j * cell, z0 + j1 * cell, key === 'b' ? '#B9B7B1' : COL.white, fl);
  }
  for (const r of plan.rooms) {
    if (openAir(r)) continue;
    const step = r.type === 'hall' ? 2.0 : 2.4, ly = r.type === 'hall' ? wallH - 0.045 : wallH - 0.025;
    for (let x = r.bb[0] + step / 2; x < r.bb[2]; x += step) for (let z = r.bb[1] + step / 2; z < r.bb[3]; z += step) {
      let ok = true;
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6]]) if (plan.at(plan.ci(x + dx), plan.cj(z + dz)) !== r.id) ok = false;
      if (ok) ceil.add(x - 0.3, x + 0.3, ly, ly + 0.02, z - 0.3, z + 0.3, '#ffffff', 'led');
    }
    if (r.type === 'hall' && key !== 'b') for (const [a, b, c, d] of maskRects(plan, k => grid[k] === r.id)) ceil.add(a, c, wallH - 0.025, wallH - 0.005, b, d, '#ffffff', 'cgrid');
    if (key === 'b' && (r.type === 'hall' || r.type === 'tech')) {
      const alongX = r.bb[2] - r.bb[0] >= r.bb[3] - r.bb[1], m = alongX ? (r.bb[1] + r.bb[3]) / 2 : (r.bb[0] + r.bb[2]) / 2;
      const run = (off, y0, y1, half, col, mat) => alongX ? ceil.add(r.bb[0] + 0.2, r.bb[2] - 0.2, y0, y1, m + off - half, m + off + half, col, mat) : ceil.add(m + off - half, m + off + half, y0, y1, r.bb[1] + 0.2, r.bb[3] - 0.2, col, mat);
      run(-0.35, wallH - 0.45, wallH - 0.1, 0.3, '#A9B0B5', 'metal');          // air duct
      run(0.25, wallH - 0.3, wallH - 0.18, 0.06, '#B23A32', 'gloss');         // fire main (red)
      run(0.45, wallH - 0.3, wallH - 0.2, 0.05, '#3E78B0', 'gloss');          // water (blue)
      run(0.62, wallH - 0.26, wallH - 0.2, 0.03, '#2E3134', 'plain');         // cable tray
    }
  }
  const features = decorate(plan, shell, wallH);
  const meshes = { ...shell.geometries() };
  for (const [k, g] of Object.entries(plan.furn.geometries())) meshes['f:' + k] = g;
  const res = { meshes, ceiling: ceil.geometries(), props: plan.props, holes, ceilHoles, lifts, features, doors: [...(plan.doorLeaves || []), ...entrance] };
  geoCache[id] = res;
  return res;
}


// outside of the building, for maket.js: the facade band of a plan as white wall, glazing with mullions, and the
// parapets; the same cells the cut view shows from inside, so the outside and the plans agree
export function facadeGeometry(key, wallH) {
  const P = PLANS[key], { w, h, cell, x0, z0 } = P, grid = new Uint8Array(w * h);
  for (let i = 0, o = 0; i < P.rle.length; i += 2) { grid.fill(P.rle[i], o, o + P.rle[i + 1]); o += P.rle[i + 1]; }
  cleanGrid(grid, w, h);
  const plan = { w, h, grid, cell, x0, z0 }, band = facadeBand(plan), B = new Boxes();
  const W = '#F3F2EE', GL = '#33424F', MU = '#56636F';
  for (const [a, b, c, d] of maskRects(plan, k => band[k] === 1)) B.add(a, c, 0, wallH, b, d, W, 'wall');
  const sill = key === '1' ? 0.05 : 0.85, top = key === '1' ? wallH - 0.15 : Math.min(2.7, wallH - 0.15);
  for (const [a, b, c, d] of maskRects(plan, k => band[k] === 2)) {
    const horiz = (c - a) >= (d - b), lo = horiz ? a : b, hi = horiz ? c : d;
    const seg = (s0, s1, y0, y1, col, mat) => horiz ? B.add(s0, s1, y0, y1, b, d, col, mat) : B.add(a, c, y0, y1, s0, s1, col, mat);
    if (sill > 0.06) seg(lo, hi, 0, sill, W, 'wall');
    seg(lo, hi, top, wallH, W, 'wall');
    seg(lo, hi, sill, top, GL, 'glass');
    seg(lo, lo + 0.06, sill, top, MU, 'wall'); seg(hi - 0.06, hi, sill, top, MU, 'wall');
    for (let m = lo + 1.2; m < hi - 0.3; m += 1.2) seg(m - 0.03, m + 0.03, sill, top, MU, 'wall');
  }
  for (const [a, b, c, d] of maskRects(plan, k => grid[k] === PARAPET)) B.add(a, c, 0, 1.1, b, d, W, 'wall');
  return B.geometries();
}
export function planOutline(key) {
  const o = PLANS[key].outline;
  if (!BACK_BAYS.has(key)) return o;
  const zb = Math.min(...o.map(p => p[1])), k = o.findIndex((p, n) => p[1] === zb && o[(n + 1) % o.length][1] === zb), xa = Math.max(o[k][0], FXW - 0.05);
  return [...o.slice(0, k + 1), [xa, zb], [xa, FBZ1], [FCX - FHW, FBZ1], [FCX - FHW, FBZ2], [FCX + FHW, FBZ2], [FCX + FHW, FBZ1], [FXT + 0.05, FBZ1], [FXT + 0.05, zb], ...o.slice(k + 1)];
}
export function planFloorOutline(key) {
  const { w, h, grid, x0, z0, cell } = getPlan(key);
  const inside = (i, j) => i >= 0 && j >= 0 && i < w && j < h && grid[j * w + i] !== 0;
  const out = new Map(), add = (a, b, c, d) => out.set(a + ',' + b, [c, d]);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!inside(i, j)) continue;
    if (!inside(i, j - 1)) add(i, j, i + 1, j);
    if (!inside(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!inside(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!inside(i - 1, j)) add(i, j + 1, i, j);
  }
  let best = [];
  const used = new Set();
  for (const k0 of out.keys()) {
    if (used.has(k0)) continue;
    const loop = []; let k = k0;
    while (k && !used.has(k)) { used.add(k); const [a, b] = k.split(',').map(Number); loop.push([a, b]); const n = out.get(k); k = n && n.join(','); }
    if (loop.length > best.length) best = loop;
  }
  const pts = best.filter((p, i) => { const a = best[(i + best.length - 1) % best.length], c = best[(i + 1) % best.length]; return (p[0] - a[0]) * (c[1] - p[1]) !== (p[1] - a[1]) * (c[0] - p[0]); });
  return pts.map(([i, j]) => [+(x0 + i * cell).toFixed(2), +(z0 + j * cell).toFixed(2)]);
}
export const planCover = key => PLANS[key].cover || PLANS[key].outline;
export const planRooms = key => PLANS[key].rooms;

// outside = empty cells connected to the edge of the plan; walls/windows next to it form the facade band
function facadeBand(plan) {
  const { w, h, grid } = plan, outside = new Uint8Array(w * h);
  { const q = []; for (let i = 0; i < w; i++) q.push(i, (h - 1) * w + i); for (let j = 0; j < h; j++) q.push(j * w, j * w + w - 1);
    for (const k of q) if (grid[k] === 0) outside[k] = 1;
    for (let qi = 0; qi < q.length; qi++) { const c = q[qi]; if (!outside[c]) continue; for (const d of [1, -1, w, -w]) { const n = c + d; if (n >= 0 && n < w * h && !outside[n] && grid[n] === 0) { outside[n] = 1; q.push(n); } } } }
  const band = new Uint8Array(w * h), dir = new Uint8Array(w * h);
  plan.bandDir = dir;                                              // 1 +x, 2 -x, 3 +z, 4 -z: the side the outside is on
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, v = grid[k]; if (v !== WALL && v !== WIN) continue;
    // the side where the outside is nearest (a corner belongs to both faces: each takes its own half, not the first one all)
    let best = 8;
    for (const [di, dj, code] of [[1, 0, 1], [-1, 0, 2], [0, 1, 3], [0, -1, 4]]) {
      // up to 7 cells: the DWG facade walls are as much as 0.7 m thick
      for (let q = 1; q <= 7 && q < best; q++) {
        const ii = i + di * q, jj = j + dj * q, off = ii < 0 || jj < 0 || ii >= w || jj >= h;
        if (off || outside[jj * w + ii]) { best = q; band[k] = v === WIN ? 2 : 1; dir[k] = code; break; }   // 2: glazing
        const u = grid[jj * w + ii]; if (u !== WALL && u !== WIN) break;
      }
    }
  }
  return band;
}
// the facade as walls through their whole thickness: per column (or row), the run of facade cells facing one way,
// equal runs side by side merged. The sheets draw a facade in layers (wall line, glazing lines); taken as rectangles
// of cells those layers came out as two walls one behind the other, each with its own windows.
function facadeRuns(plan) {
  const { w, h, band, bandDir: dir, x0, z0, cell } = plan, out = [];
  for (const [code, face, horiz] of [[3, 'front', true], [4, 'back', true], [1, 'right', false], [2, 'left', false]]) {
    const N = horiz ? w : h, M = horiz ? h : w, at = (u, t) => horiz ? t * w + u : u * w + t, open = new Map();
    const push = (key, u0, u1) => {
      const [t0, t1] = key.split('|').map(Number);
      out.push(horiz ? { a: x0 + u0 * cell, b: z0 + t0 * cell, c: x0 + u1 * cell, d: z0 + (t1 + 1) * cell, face, horiz }
        : { a: x0 + t0 * cell, b: z0 + u0 * cell, c: x0 + (t1 + 1) * cell, d: z0 + u1 * cell, face, horiz });
    };
    for (let u = 0; u <= N; u++) {
      const runs = new Set();
      if (u < N) for (let t = 0; t < M; t++) {
        if (!band[at(u, t)] || dir[at(u, t)] !== code) continue;
        let t1 = t; while (t1 + 1 < M && band[at(u, t1 + 1)] && dir[at(u, t1 + 1)] === code) t1++;
        runs.add(t + '|' + t1); t = t1;
      }
      for (const [key, u0] of open) if (!runs.has(key)) { push(key, u0, u); open.delete(key); }
      for (const key of runs) if (!open.has(key)) open.set(key, u);
    }
  }
  return out;
}
function maskRects(plan, test) {
  const { w, h, cell, x0, z0 } = plan, used = new Uint8Array(w * h), out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!test(j * w + i) || used[j * w + i]) continue;
    let i1 = i; while (i1 < w && test(j * w + i1) && !used[j * w + i1]) i1++;
    let j1 = j + 1;
    outer: for (; j1 < h; j1++) for (let q = i; q < i1; q++) if (!test(j1 * w + q) || used[j1 * w + q]) break outer;
    for (let jj = j; jj < j1; jj++) used.fill(1, jj * w + i, jj * w + i1);
    out.push([x0 + i * cell, z0 + j * cell, x0 + i1 * cell, z0 + j1 * cell]);
  }
  return out;
}
function gridRects(plan, value) {
  const { w, h, grid, cell, x0, z0 } = plan, used = new Uint8Array(w * h), out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (grid[j * w + i] !== value || used[j * w + i]) continue;
    let i1 = i; while (i1 < w && grid[j * w + i1] === value && !used[j * w + i1]) i1++;
    let j1 = j + 1;
    outer: for (; j1 < h; j1++) for (let q = i; q < i1; q++) if (grid[j1 * w + q] !== value || used[j1 * w + q]) break outer;
    for (let jj = j; jj < j1; jj++) used.fill(1, jj * w + i, jj * w + i1);
    out.push([x0 + i * cell, z0 + j * cell, x0 + i1 * cell, z0 + j1 * cell]);
  }
  return out;
}

/* ---------- stairs and lifts, as the cadastral plans draw them ----------
   A stair is a U: two flights side by side with a thin wall between, the floor landing at the end you arrive
   at and the half-landing at the far end. You go up one flight to the half-landing, turn, and the other flight
   takes you on into the floor above; the same flight's twin below takes you down. The lifts are separate
   shafts beside the stair, doors to the lobby. */
const ORDER = ['b', '1', '2', '3', '6', '7', '9', '10'];      // plan keys bottom to top (a key may serve several floors)
const REPEATS = new Set(['3', '7']);                          // keys that stand on top of themselves
const stairOverlap = (key, r) => (PLANS[key]?.cores || []).some(({ r: q }) => q[0] < r[2] && r[0] < q[2] && q[1] < r[3] && r[1] < q[3]);
function planCores(plan) {
  const { at, grid, w, byId, P, key } = plan, cores = [], H = plan.h;
  const isHall = v => ['hall', 'logistics'].includes(byId.get(v)?.type);   // open floor a stair may land on
  const ki = ORDER.indexOf(key);
  const cellsIn = (ax0, az0, ax1, az1, fn) => { for (let j = plan.cj(az0 + 1e-3); j <= plan.cj(az1 - 1e-3); j++) for (let i = plan.ci(ax0 + 1e-3); i <= plan.ci(ax1 - 1e-3); i++) if (i >= 0 && j >= 0 && i < w && j < H) fn(j * w + i); };
  // how open the floor is in a strip: cells of a room count, hall cells twice
  const openness = (ax0, az0, ax1, az1) => { let s = 0, n = 0; cellsIn(ax0, az0, ax1, az1, k => { n++; const v = grid[k]; if (isRoom(v)) s += isHall(v) ? 2 : 1; }); return s / Math.max(1, n); };
  const majority = (ax0, az0, ax1, az1) => { const cnt = new Map(); cellsIn(ax0, az0, ax1, az1, k => { const v = grid[k]; if (isRoom(v)) cnt.set(v, (cnt.get(v) || 0) + (isHall(v) ? 2 : 1)); }); let b = 0, bn = 0; for (const [v, n] of cnt) if (n > bn) { b = v; bn = n; } return b; };
  for (const { r, ax } of P.cores || []) {
    const [rx0, rz0, rx1, rz1] = r, len = ax === 'z' ? rz1 - rz0 : rx1 - rx0, LAND = 1.1;
    // arrive at the end with open floor beyond it (a corridor or lobby rather than the closed half-landing)
    const ends = ax === 'z'
      ? { '+z': openness(rx0, rz1 + 0.2, rx1, rz1 + 1.2) - Math.abs(rz1) * 0.01, '-z': openness(rx0, rz0 - 1.2, rx1, rz0 - 0.2) - Math.abs(rz0) * 0.01 }
      : { '+x': openness(rx1 + 0.2, rz0, rx1 + 1.2, rz1), '-x': openness(rx0 - 1.2, rz0, rx0 - 0.2, rz1) };
    const side = Object.entries(ends).sort((p, q) => q[1] - p[1])[0][0], hor = side === '-x' || side === '+x';
    let X0 = rx0, X1 = rx1, Z0 = rz0, Z1 = rz1;
    if (side === '+z') Z0 -= LAND; else if (side === '-z') Z1 += LAND; else if (side === '+x') X0 -= LAND; else X1 += LAND;
    const Ld = hor ? X1 - X0 : Z1 - Z0, Wd = hor ? Z1 - Z0 : X1 - X0;
    const LW = 0.12, lv0 = key === '1' && rx0 < FXW ? Wd * 0.62 : (Wd - LW) / 2, lv1 = lv0 + LW;   // 1st floor: wide flight up, narrow one down
    const n = Math.max(6, Math.min(12, Math.round(len / 0.28))), tread = len / n, run = len;
    const core = { side, X0, X1, Z0, Z1, oX0: X0, oX1: X1, oZ0: Z0, oZ1: Z1, ext: [], Ld, Wd, LW, lv0, lv1, n, tread, run };
    core.W2 = (u, v) => side === '-x' ? [X0 + u, Z0 + v] : side === '+x' ? [X1 - u, Z0 + v] : side === '-z' ? [X0 + v, Z0 + u] : [X0 + v, Z1 - u];
    core.toLocal = (x, z) => side === '-x' ? [x - X0, z - Z0] : side === '+x' ? [X1 - x, z - Z0] : side === '-z' ? [z - Z0, x - X0] : [Z1 - z, x - X0];
    core.up = ki >= 0 && ki < ORDER.length - 1 && (stairOverlap(ORDER[ki + 1], [X0, Z0, X1, Z1]) || REPEATS.has(key));
    core.down = ki > 0 && (stairOverlap(ORDER[ki - 1], [X0, Z0, X1, Z1]) || REPEATS.has(key));
    // the room you arrive from, and an open strip in front of the flights
    const fa = core.W2(-1.0, 0), fb = core.W2(-0.02, Wd);
    core.room = majority(Math.min(fa[0], fb[0]), Math.min(fa[1], fb[1]), Math.max(fa[0], fb[0]), Math.max(fa[1], fb[1]));
    cellsIn(X0, Z0, X1, Z1, k => { if (grid[k] !== WIN) grid[k] = STAIR; });
    if (core.room) { const ga = core.W2(-0.4, 0.1), gb = core.W2(-0.02, Wd - 0.1); cellsIn(Math.min(ga[0], gb[0]), Math.min(ga[1], gb[1]), Math.max(ga[0], gb[0]), Math.max(ga[1], gb[1]), k => { if (grid[k] === WALL || grid[k] === STAIR) grid[k] = core.room; }); }
    const edgeOpen = vv => {          // open = corridor/hall beyond this long edge
      const [ax_, az_] = core.W2(Ld * 0.3, vv), [bx_, bz_] = core.W2(Ld * 0.7, vv);
      const dir = vv < Wd / 2 ? -1 : 1, nrm = hor ? [0, dir] : [dir, 0];
      let open = 0;
      for (const [x, z] of [[ax_, az_], [bx_, bz_], [(ax_ + bx_) / 2, (az_ + bz_) / 2]]) if (isHall(at(plan.ci(x + nrm[0] * 0.35), plan.cj(z + nrm[1] * 0.35)))) open++;
      return open >= 2;
    };
    core.open0 = edgeOpen(0); core.openW = edgeOpen(Wd);
    core.farExt = false; core.side0Ext = false; core.sideWExt = false;
    cores.push(core);
  }
  // lifts: shaft walls round each cabin, the door on the side facing the lobby
  plan.liftData = [];
  for (const r of P.lifts || []) {
    const [lx0, lz0, lx1, lz1, kind] = r;
    const probe = { '+x': [lx1 + 0.2, lz0, lx1 + 0.9, lz1], '-x': [lx0 - 0.9, lz0, lx0 - 0.2, lz1], '+z': [lx0, lz1 + 0.2, lx1, lz1 + 0.9], '-z': [lx0, lz0 - 0.9, lx1, lz0 - 0.2] };
    const side = Object.entries(probe).map(([sd, q]) => [sd, openness(...q)]).sort((p, q) => q[1] - p[1])[0][0];
    const room = majority(...probe[side]);
    const hor = side === '-x' || side === '+x', Ld = hor ? lx1 - lx0 : lz1 - lz0, Wd = hor ? lz1 - lz0 : lx1 - lx0;
    const W2 = (u, v) => side === '-x' ? [lx0 + u, lz0 + v] : side === '+x' ? [lx1 - u, lz0 + v] : side === '-z' ? [lx0 + v, lz0 + u] : [lx0 + v, lz1 - u];
    cellsIn(lx0, lz0, lx1, lz1, k => grid[k] = WALL);
    if (room) {
      const box = (u0, u1, v0, v1, fn) => { const [a1, b1] = W2(u0, v0), [a2, b2] = W2(u1, v1); cellsIn(Math.min(a1, a2), Math.min(b1, b2), Math.max(a1, a2), Math.max(b1, b2), fn); };
      box(0.12, Ld - 0.12, 0.12, Wd - 0.12, k => { grid[k] = room; (plan.liftCells ||= []).push(k); });      // cabin
      box(-0.4, 0.15, Wd / 2 - 0.45, Wd / 2 + 0.45, k => { grid[k] = room; });                            // door, through the whole wall
      // in front of the doors: no stray wall bits (short pieces go entirely), and nothing gets furnished there
      const zone = []; box(-1.6, -0.4, Wd / 2 - 0.9, Wd / 2 + 0.9, k => { if (grid[k] === WALL) zone.push(k); });
      if (zone.length) {
        const comp = new Set(zone), q = [...zone];
        for (let i = 0; i < q.length && comp.size <= 60; i++) for (const d of [1, -1, w, -w]) { const n = q[i] + d; if (grid[n] === WALL && !comp.has(n)) { comp.add(n); q.push(n); } }
        if (comp.size <= 60) for (const k of comp) grid[k] = room;
      }
      box(-1.6, 0, Wd / 2 - 0.9, Wd / 2 + 0.9, k => { if (isRoom(grid[k])) (plan.liftCells ||= []).push(k); });   // keep clear in front
    }
    plan.liftData.push({ W2, Ld, Wd, room, stops: kind === 'freight' ? ['b', '1'] : null });
  }
  return cores;
}
function buildStairs(plan, shell, ceil, H, wallH) {
  const holes = [], ceilHoles = [], lifts = [];
  for (const c of plan.cores) {
    if (c.small) { shell.add(c.X0, c.X1, 0, 0.9, c.Z0, c.Z1, COL.step, 'marble'); continue; }
    const { side, Ld, Wd, lv0, lv1, n, tread, run, W2 } = c, hor = side === '-x' || side === '+x', rise = H / 2 / n, low = -H / 2 - 0.25;
    const T = 0.3;
    for (const sd of c.ext) {                      // outer walls (with a window) the drawing merged into the stair blob
      const along = sd === '-x' || sd === '+x';
      const [a0, a1] = along ? [c.oZ0, c.oZ1] : [c.oX0, c.oX1], m = (a1 - a0) * 0.2;
      const wall = (b0, b1, y0, y1, col, mat) => along
        ? shell.add(sd === '-x' ? c.oX0 : c.oX1 - T, sd === '-x' ? c.oX0 + T : c.oX1, y0, y1, b0, b1, col, mat, y0 === 0)
        : shell.add(b0, b1, y0, y1, sd === '-z' ? c.oZ0 : c.oZ1 - T, sd === '-z' ? c.oZ0 + T : c.oZ1, col, mat, y0 === 0);
      wall(a0, a1, low, 0.9, COL.wall, 'plaster'); wall(a0, a1, 2.6, wallH, COL.wall, 'plaster');
      wall(a0, a0 + m, 0.9, 2.6, COL.wall, 'plaster'); wall(a1 - m, a1, 0.9, 2.6, COL.wall, 'plaster');
      wall(a0 + m, a1 - m, 0.9, 2.6, COL.glass, 'glass');
    }
    const box = into => (u0, u1, v0, v1, y0, y1, col, mat) => { const [xa, za] = W2(u0, v0), [xb, zb] = W2(u1, v1); into.add(xa, xb, y0, y1, za, zb, col, mat); };
    const B = box(shell), Bc = box(ceil);
    const S = (u0, u1, v0, v1, b0, t0, b1, t1, col, mat) => {
      const [xa, za] = W2(u0, v0), [xb, zb] = W2(u1, v1), rev = side === '+x' || side === '+z';
      shell.addPrism(Math.min(xa, xb), Math.max(xa, xb), Math.min(za, zb), Math.max(za, zb), hor ? 'x' : 'z', rev ? b1 : b0, rev ? t1 : t0, rev ? b0 : b1, rev ? t0 : t1, col, mat);
    };
    const guardFlat = (u0, u1, vv, y) => { B(u0, u1, vv - 0.01, vv + 0.01, y, y + 0.95, COL.glass, 'glass'); B(u0, u1, vv - 0.03, vv + 0.03, y + 0.95, y + 1.0, COL.gold, 'metal'); };
    const guardSlope = (vv, ya, yb) => { S(0, run, vv - 0.01, vv + 0.01, ya, ya + 0.95, yb, yb + 0.95, COL.glass, 'glass'); S(0, run, vv - 0.03, vv + 0.03, ya + 0.95, ya + 1.0, yb + 0.95, yb + 1.0, COL.gold, 'metal'); };
    // closed stairwell above the room walls (walk mode only), so the landings never look over the walls
    Bc(-0.12, Ld + 0.12, -0.12, 0.0, wallH, H + 0.6, COL.wall, 'plaster'); Bc(-0.12, Ld + 0.12, Wd, Wd + 0.12, wallH, H + 0.6, COL.wall, 'plaster');
    Bc(Ld, Ld + 0.12, -0.12, Wd + 0.12, wallH, H + 0.6, COL.wall, 'plaster'); Bc(-0.12, 0, -0.12, Wd + 0.12, wallH, H + 0.6, COL.wall, 'plaster');
    Bc(-0.12, Ld + 0.12, -0.12, Wd + 0.12, H + 0.6, H + 0.65, COL.wall, 'plaster');
    for (let x = 0.6; x < Ld - 0.3; x += 1.2) Bc(x - 0.3, x + 0.3, Wd / 2 - 0.3, Wd / 2 + 0.3, H + 0.57, H + 0.6, '#ffffff', 'led');
    // walls around the core where it borders rooms (the corridor side stays open)
    if (!c.open0 && !c.side0Ext) B(0, Ld, -0.12, 0.02, c.down ? low : 0, wallH, COL.wall, 'plaster');
    if (!c.openW && !c.sideWExt) B(0, Ld, Wd - 0.02, Wd + 0.12, c.down ? low : 0, wallH, COL.wall, 'plaster');
    if (!c.farExt) B(Ld - 0.02, Ld + 0.12, -0.12, Wd + 0.12, c.down ? low - H / 2 : 0, wallH, COL.wall, 'plaster');
    if (!c.up) {           // top floor: level marble floor where the up flight would start
      B(0, Ld - 0.02, 0.02, lv0, 0, 0.04, COL.white, 'marble'); B(run, Ld - 0.02, lv0, lv1, 0, 0.04, COL.white, 'marble');
      if (c.open0) guardFlat(0, Ld, 0.03, 0);
    }
    if (!c.down) {         // basement: level floor where the down flight would start, solid under the landing
      B(0, run, lv1, Wd - 0.02, 0, 0.04, COL.white, 'marble');
      if (c.up) B(run, Ld - 0.02, lv1, Wd - 0.02, 0, H / 2 - 0.25, COL.wall, 'plaster');
    }
    // UP: flight 1 beside the lift (v 0..lv0) to the upper half-landing behind it
    if (c.up) for (let k = 0; k < n; k++) B(k * tread, (k + 1) * tread + 0.02, 0.02, lv0, 0, (k + 1) * rise, COL.white, 'marble');
    if (c.up) {
      if (c.open0) { guardSlope(0.03, rise, H / 2); guardFlat(run, Ld, 0.03, H / 2); }
      else S(0, run, 0.03, 0.08, rise + 0.86, rise + 0.91, H / 2 + 0.86, H / 2 + 0.91, COL.gold, 'metal');
      B(run, Ld - 0.02, 0.02, lv1, 0, H / 2 - 0.25, COL.wall, 'plaster');                   // solid under the landing (flight-1 side + behind lift)
      B(run, Ld - 0.02, 0.02, Wd - 0.02, H / 2 - 0.25, H / 2, COL.white, 'marble');        // upper half-landing
      // ... and the next flight up runs back over the down flight, into a closed shaft above the ceiling
      for (let k = 0; k < n; k++) {
        const u1 = run - k * tread, u0 = u1 - tread - 0.02, top = H / 2 + (k + 1) * rise;
        (top > wallH ? Bc : B)(u0, u1, lv1, Wd - 0.02, top - 0.3, top, COL.white, 'marble');
      }
      S(0, run, lv1, Wd - 0.02, H - rise - 0.32, H - rise - 0.3, H / 2 - 0.3, H / 2 - 0.28, COL.white, 'plaster');
      { const [xa, za] = W2(0, 0), [xb, zb] = W2(Ld, Wd); ceilHoles.push([Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)]); }
      Bc(-0.05, 0, lv1, Wd, wallH, H + 0.6, COL.wall, 'plaster'); Bc(0, run, lv1 - 0.05, lv1, wallH, H + 0.6, COL.wall, 'plaster');
      Bc(0, run, lv1, Wd, H + 0.55, H + 0.6, COL.wall, 'plaster');
    }
    if (c.down) {
      // DOWN: flight 2 (v lv1..Wd) from the floor to the lower half-landing, and on below flight 1 (closed well)
      for (let k = 0; k < n; k++) B(k * tread - 0.02, (k + 1) * tread, lv1, Wd - 0.02, low, -k * rise - rise, COL.white, 'marble');
      B(run, Ld - 0.02, 0.02, Wd - 0.02, low, -H / 2, COL.white, 'marble');
      for (let k = 0; k < n; k++) { const u1 = run - k * tread, top = -H / 2 - (k + 1) * rise; B(u1 - tread - 0.02, u1, 0.02, lv0, top - 0.3, top, COL.white, 'marble'); }
      B(Ld - 0.02, Ld + 0.08, 0.02, Wd, low - H / 2, H / 2, COL.wall, 'plaster');
      if (!c.ext.length || c.openW) B(0, Ld, Wd - 0.02, Wd + 0.08, low, 0, COL.wall, 'plaster');
      if (c.openW) guardFlat(0, Ld, Wd - 0.04, 0);
      { const [xa, za] = W2(0, lv1), [xb, zb] = W2(Ld, Wd); holes.push([Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)]); }
    }
    // closed service wall between the flights
    B(0, run, lv0, lv1, c.down ? low : 0, wallH, COL.wall, 'plaster');
    B(0, run, lv0, lv1, wallH, wallH + 0.05, COL.cap);
  }
  for (const L of plan.liftData || []) {
    const { W2, Ld: run, Wd } = L, lv0 = 0, lv1 = Wd;
    const B = (u0, u1, v0, v1, y0, y1, col, mat) => { const [xa, za] = W2(u0, v0), [xb, zb] = W2(u1, v1); shell.add(xa, xb, y0, y1, za, zb, col, mat); };
    const DW = Math.min(0.9, Wd - 0.5), dv0 = Wd / 2 - DW / 2, dv1 = Wd / 2 + DW / 2;
    B(0, run, lv0, lv0 + 0.12, 0, wallH, COL.wall, 'plaster'); B(0, run, lv1 - 0.12, lv1, 0, wallH, COL.wall, 'plaster');
    B(run - 0.12, run, lv0, lv1, 0, wallH, COL.wall, 'plaster');
    B(0, 0.12, lv0, dv0, 0, wallH, COL.wall, 'plaster'); B(0, 0.12, dv1, lv1, 0, wallH, COL.wall, 'plaster');
    B(0, 0.12, dv0, dv1, 2.15, wallH, COL.wall, 'plaster');
    B(-0.04, 0.0, dv0 - 0.06, dv0, 0, 2.2, COL.gold, 'metal'); B(-0.04, 0.0, dv1, dv1 + 0.06, 0, 2.2, COL.gold, 'metal');
    B(-0.04, 0.0, dv0 - 0.06, dv1 + 0.06, 2.15, 2.22, COL.gold, 'metal');
    B(-0.03, 0.0, dv1 + 0.1, dv1 + 0.18, 1.0, 1.22, COL.black, 'gloss');                     // call button
    B(0, run, lv0, lv1, wallH, wallH + 0.05, COL.cap);
    B(0.12, run - 0.12, lv0 + 0.12, lv0 + 0.14, 0, wallH - 0.4, COL.steel, 'metal');
    B(0.12, run - 0.12, lv1 - 0.14, lv1 - 0.12, 0, wallH - 0.4, COL.steel, 'metal');
    B(run - 0.14, run - 0.12, lv0 + 0.2, lv1 - 0.2, 0.9, 2.1, COL.mirror, 'mirror');
    B(0.3, 0.52, lv1 - 0.16, lv1 - 0.14, 0.9, 1.5, COL.black, 'gloss');
    B(0.12, run - 0.12, lv0 + 0.12, lv1 - 0.12, wallH - 0.42, wallH - 0.4, '#ffffff', 'led');
    const [fx, fz] = W2(0.05, Wd / 2), [ux, uz] = W2(1, Wd / 2), [vx, vz] = W2(0.05, Wd / 2 + 1);
    const [cx0, cz0] = W2(0.12, lv0 + 0.12), [cx1, cz1] = W2(run - 0.12, lv1 - 0.12);
    lifts.push({ x: fx, z: fz, nx: ux - fx, nz: uz - fz, sx: vx - fx, sz: vz - fz, width: DW, stops: L.stops,
      cabin: [Math.min(cx0, cx1), Math.min(cz0, cz1), Math.max(cx0, cx1), Math.max(cz0, cz1)] });
  }
  return { holes, ceilHoles, lifts };
}

/* ---------- interior finishes, after the renders ----------
   corridors: walnut panels with grooves alternating with grey stone, gold skirting line
   conference: walnut all round · bathrooms: marble walls · ground-floor lobby: reception + logo wall */
function decorate(plan, shell, wallH) {
  const { w, h, grid, cell, x0, z0, byId, rooms, band } = plan, features = [];
  const runs = new Map();     // per room: wall faces as runs of cells
  const D = [[1, 0, '+x'], [-1, 0, '-x'], [0, 1, '+z'], [0, -1, '-z']];
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const v = grid[j * w + i]; if (!isRoom(v)) continue;
    const r = byId.get(v); if (!r || !['hall', 'conf', 'wc', ...(plan.key === 'b' ? ['tech'] : [])].includes(r.type)) continue;
    for (const [di, dj, sd] of D) {
      const k = (j + dj) * w + i + di;
      if (grid[k] !== WALL || band[k]) continue;
      const line = di ? i : j, along = di ? j : i, key = `${v}|${sd}|${line}`;
      if (!runs.has(key)) runs.set(key, { v, r, sd, line, list: [] });
      runs.get(key).list.push(along);
    }
  }
  let feature = null; const cands = [];
  for (const R of runs.values()) {
    R.list.sort((a, b) => a - b);
    for (let s0 = 0; s0 < R.list.length;) {
      let e = s0; while (e + 1 < R.list.length && R.list[e + 1] === R.list[e] + 1) e++;
      const a0 = R.list[s0], a1 = R.list[e] + 1, len = (a1 - a0) * cell; s0 = e + 1;
      if (len < 0.5) continue;
      // face plane position and thin cladding box pointing into the room
      const vert = R.sd === '+x' || R.sd === '-x';
      const face = vert ? x0 + (R.sd === '+x' ? R.line + 1 : R.line) * cell : z0 + (R.sd === '+z' ? R.line + 1 : R.line) * cell;
      const inward = R.sd[0] === '+' ? -1 : 1, t0 = face, t1 = face + inward * 0.025;
      const A0 = (vert ? z0 : x0) + a0 * cell, A1 = (vert ? z0 : x0) + a1 * cell;
      const add = (s, e2, y0, y1, col, mat, dt = 0) => vert ? shell.add(Math.min(t0, t1 + inward * dt), Math.max(t0, t1 + inward * dt), y0, y1, s, e2, col, mat) : shell.add(s, e2, y0, y1, Math.min(t0, t1 + inward * dt), Math.max(t0, t1 + inward * dt), col, mat);
      const top = Math.min(2.75, wallH - 0.12);
      if (plan.key === 'b') {                                    // basement: technical paint, not the hotel finishes
        add(A0, A1, 0, 1.2, '#55626E', 'plain');
        add(A0, A1, 1.2, 1.25, '#E2B735', 'plain', 0.003);
        add(A0, A1, 1.25, wallH - 0.02, '#D4D6D3', 'plaster');
        continue;
      }
      if (R.r.type === 'wc') { add(A0, A1, 0, Math.min(2.4, wallH - 0.2), COL.white, 'marble'); continue; }
      if (R.r.type === 'conf') { add(A0, A1, 0, top, OAKP, 'veneer'); continue; }
      // corridor: dark stone strips beside doors and corners, light oak between with black geometric inlay
      const full = wallH - 0.02, ends = len >= 2.2 ? 0.45 : 0;
      if (ends) { add(A0, A0 + ends, 0.08, full, STONEP, 'concrete'); add(A1 - ends, A1, 0.08, full, STONEP, 'concrete'); }
      const P0 = A0 + ends, P1 = A1 - ends;
      if (P1 - P0 > 0.1) {
        add(P0, P1, 0.08, full, OAKP, 'veneer');
        for (let p = P0 + 1.2; p < P1 - 0.3; p += 1.2) add(p - 0.005, p + 0.005, 0.08, full, '#15171A', 'plain', 0.003);
        const tA = t1, tB = t1 + inward * 0.004, line = (sa, ya, sb, yb) => {
          const m = (yb - ya) / (sb - sa), th = 0.009 * Math.sqrt(1 + m * m);
          if (th > 0.12) { add(sa - 0.005, sa + 0.005, Math.min(ya, yb), Math.max(ya, yb), '#15171A', 'plain', 0.004); return; }
          if (vert) shell.addPrism(Math.min(tA, tB), Math.max(tA, tB), sa, sb, 'z', ya - th / 2, ya + th / 2, yb - th / 2, yb + th / 2, '#15171A', 'plain');
          else shell.addPrism(sa, sb, Math.min(tA, tB), Math.max(tA, tB), 'x', ya - th / 2, ya + th / 2, yb - th / 2, yb + th / 2, '#15171A', 'plain');
        };
        let seed = Math.abs(Math.round(A0 * 977 + face * 131)) % 2147483647 || 7;
        const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
        for (const [lo, hi] of [[1.5, 2.7], [0.35, 1.2]]) {          // two mountain-ridge lines, upper and lower
          let sa = P0, ya = lo + rnd() * (hi - lo);
          while (sa < P1 - 0.05) {
            const sb = Math.min(P1, sa + 0.45 + rnd() * 1.2), yb = Math.min(full - 0.1, lo + rnd() * (hi - lo));
            line(sa, ya, sb, yb); sa = sb; ya = yb;
          }
        }
      }
      add(A0, A1, 0, 0.08, '#9A9C9E', 'stone', 0.01);            // granite skirting
      if (R.r.type === 'hall' && len >= 4) {
        const f = { area: R.r.area, len, vert, face: t1, inward, A0, A1, top, id: R.v };
        cands.push(f);
        if (!feature || f.area > feature.area || (f.area === feature.area && len > feature.len)) feature = f;
      }
    }
  }
  // ground-floor lobby: the logo on the longest wall of the biggest hall
  // ground floor: the reception counter goes on the first lobby wall with clear floor in front, the logo above it
  const deskSpot = f => {
    const { vert, face, inward, A0, A1, id } = f, mid = (A0 + A1) / 2;
    const cellAt = (sA, dA) => { const [x, z] = vert ? [face + inward * dA, sA] : [sA, face + inward * dA], i = plan.ci(x), j = plan.cj(z); return i >= 0 && j >= 0 && i < w && j < h ? grid[j * w + i] : 0; };
    const clear = c => {
      for (let sA = c - 1.6; sA <= c + 1.6; sA += 0.1) for (let dA = 0.3; dA <= 2.8; dA += 0.1) if (cellAt(sA, dA) !== id) return false;
      for (let sA = c - 2.4; sA <= c + 2.4; sA += 0.1) for (let dA = 0; dA <= 3.0; dA += 0.1) if (cellAt(sA, dA) === STAIR) return false;   // keep stair and lift fronts free
      return true;
    };
    for (let k = 0; k < 60; k++) for (const c of [mid + k * 0.2, mid - k * 0.2]) if (c - 1.6 >= A0 && c + 1.6 <= A1 && clear(c)) return c;
    return null;
  };
  let desk = null;
  const rightWall = f => byId.get(f.id)?.name === 'Kirish holli' && f.vert && f.inward < 0 ? 0 : 1;      // east wall, facing into the hall
  if (plan.key === '1') for (const f of cands.sort((p, q) => rightWall(p) - rightWall(q) || q.area - p.area || q.len - p.len)) { const c = deskSpot(f); if (c != null) { feature = f; desk = c; break; } }
  // the hall stops at the glass in the wing's line, too shallow for the full counter: a slim one on the east wall, between the two lift doors
  let slim = false;
  if (plan.key === '1' && desk == null) { const f = cands.find(q => rightWall(q) === 0); if (f) { feature = f; desk = 4.9; slim = true; } }
  if (feature && plan.key === '1') {                    // logo wall: only in the ground-floor lobby
    const { vert, face, inward, A0, A1, top } = feature;
    let mid = (A0 + A1) / 2;
    const add = (s, e2, y0, y1, col, mat, d0, d1) => vert ? shell.add(Math.min(face + inward * d0, face + inward * d1), Math.max(face + inward * d0, face + inward * d1), y0, y1, s, e2, col, mat) : shell.add(s, e2, y0, y1, Math.min(face + inward * d0, face + inward * d1), Math.max(face + inward * d0, face + inward * d1), col, mat);
    if (desk != null) {
      mid = desk;
      const o = slim ? 0.9 : 0, L = slim ? 0.9 : 1.5;                                  // closer to the wall and shorter when slim
      add(mid - L, mid + L, 0, 0.1, '#2F3338', 'gloss', 1.42 - o, 1.88 - o);            // recessed plinth
      add(mid - L, mid + L, 0.1, 1.05, OAKP, 'veneer', 1.35 - o, 1.95 - o);              // oak counter
      add(mid - L - 0.02, mid + L + 0.02, 1.05, 1.1, COL.white, 'marble', 1.28 - o, 2.02 - o);   // marble top
      add(mid - L, mid + L, 0.84, 0.87, COL.gold, 'metal', 1.95 - o, 1.965 - o);        // gold line on the front
      for (const e of [mid - L, mid + L - 0.03]) add(e, e + 0.03, 0.1, 1.05, COL.gold, 'metal', 1.35 - o, 1.97 - o);
      add(mid - L + 0.05, mid + L - 0.05, 0.72, 0.76, COL.white, 'marble', slim ? 0.03 : 0.85, 1.36 - o);   // work surface behind
      add(mid - 0.75, mid - 0.15, 0.8, 1.15, COL.black, 'gloss', 1.0 - o, 1.02 - o);    // monitors
      add(mid + 0.2, mid + 0.8, 0.8, 1.15, COL.black, 'gloss', 1.0 - o, 1.02 - o);
      add(mid - 0.47, mid - 0.43, 0.76, 0.8, COL.dark, 'metal', 1.0 - o, 1.08 - o); add(mid + 0.48, mid + 0.52, 0.76, 0.8, COL.dark, 'metal', 1.0 - o, 1.08 - o);
      if (!slim) for (const c of [mid - 0.45, mid + 0.5]) {                              // two task chairs
        add(c - 0.22, c + 0.22, 0.42, 0.5, COL.dark, 'leather', 0.45, 0.85); add(c - 0.22, c + 0.22, 0.5, 1.0, COL.dark, 'leather', 0.4, 0.46);
        add(c - 0.03, c + 0.03, 0, 0.42, COL.steel, 'metal', 0.62, 0.68); add(c - 0.25, c + 0.25, 0, 0.04, COL.steel, 'metal', 0.62, 0.68);
      }
      if (plan.blocked) for (let sA = mid - L; sA <= mid + L; sA += cell) for (let dA = 0; dA <= 2.05 - o; dA += cell) {   // nobody walks through the counter
        const [x, z] = vert ? [face + inward * dA, sA] : [sA, face + inward * dA]; plan.blocked[plan.cj(z) * w + plan.ci(x)] = 1;
      }
      features.push({ type: 'reception', x: vert ? face + inward * (1.9 - o) : mid, z: vert ? mid : face + inward * (1.9 - o) });
    }
    add(mid - 1.9, mid + 1.9, 0.1, top, STONEP, 'concrete', 0, 0.03);               // dark stone backdrop
    const [fx, fz] = vert ? [face + inward * 0.04, mid] : [mid, face + inward * 0.04];
    features.push({ type: 'logo', x: fx, z: fz, nx: vert ? inward : 0, nz: vert ? 0 : inward, w: 3.2, h: 1.0, y: 1.55 });
  }
  return features;
}

/* ---------- walking helpers ---------- */
// where a walk starts: the most open spot of the room (away from walls, furniture and door swings), preferring
// the side you come in by, looking into the room
export function spawnPoint(plan, r) {
  const { w, h, grid, cell, x0, z0 } = plan;
  const i0 = Math.max(1, plan.ci(r.bb[0]) - 1), i1 = Math.min(w - 2, plan.ci(r.bb[2]) + 1);
  const j0 = Math.max(1, plan.cj(r.bb[1]) - 1), j1 = Math.min(h - 2, plan.cj(r.bb[3]) + 1);
  let sx = 0, sz = 0, n = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (grid[j * w + i] !== r.id) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = grid[(j + dj) * w + i + di]; if (isRoom(u) && u !== r.id) { sx += i; sz += j; n++; break; } }
  }
  const cx = (r.x - x0) / cell, cz = (r.z - z0) / cell, ex = n ? sx / n : cx, ez = n ? sz / n : cz;
  // clearance: steps to the nearest wall, furniture or door swing (breadth-first over the room's box)
  const W = i1 - i0 + 1, H = j1 - j0 + 1, dist = new Int16Array(W * H).fill(-1), q = [];
  const blockedAt = (i, j) => grid[j * w + i] !== r.id || plan.blocked?.[j * w + i] || plan.occ?.[j * w + i];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (blockedAt(i, j)) { dist[(j - j0) * W + i - i0] = 0; q.push((j - j0) * W + i - i0); }
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], ci = c % W, cj = (c / W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const k = jj * W + ii; if (dist[k] < 0) { dist[k] = dist[c] + 1; q.push(k); }
    }
  }
  let best = null, bestS = -1e9;
  for (let k = 0; k < W * H; k++) {
    if (dist[k] <= 0) continue;
    const i = i0 + k % W, j = j0 + ((k / W) | 0), s = Math.min(dist[k], 10) * 1.0 - Math.hypot(i - ex, j - ez) * 0.08;
    if (s > bestS) { bestS = s; best = [i, j]; }
  }
  const s = best || nearestFree(plan, Math.round(cx), Math.round(cz));
  if (!s) return null;
  const x = x0 + (s[0] + 0.5) * cell, z = z0 + (s[1] + 0.5) * cell;
  // look across the room: towards its centre, or away from the door when standing on the centre already
  let lx = r.x, lz = r.z;
  if (Math.hypot(lx - x, lz - z) < 1) { lx = x + (x - (x0 + ex * cell)); lz = z + (z - (z0 + ez * cell)); }
  return { x, z, yaw: Math.atan2(-(lx - x), -(lz - z)) };
}
export function nearestFree(plan, i, j) {
  const { w, h, blocked } = plan;
  if (i >= 0 && j >= 0 && i < w && j < h && !blocked[j * w + i]) return [i, j];
  const seen = new Uint8Array(w * h), q = [[i, j]]; seen[Math.max(0, Math.min(h - 1, j)) * w + Math.max(0, Math.min(w - 1, i))] = 1;
  for (let k = 0; k < q.length && k < 40000; k++) {
    const [a, b] = q[k];
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = a + da, y = b + db; if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) continue;
      seen[y * w + x] = 1; if (!blocked[y * w + x] && isRoom(plan.grid[y * w + x])) return [x, y]; q.push([x, y]);
    }
  }
  return null;
}
export function findPath(plan, from, to) {
  const { w, h, blocked } = plan, N = w * h;
  const prev = new Int32Array(N).fill(-1), s = from[1] * w + from[0], t = to[1] * w + to[0];
  const q = new Int32Array(N); let qh = 0, qt = 0; q[qt++] = s; prev[s] = s;
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const ti = to[0], tj = to[1]; let best = s, bestD = 1e9;
  while (qh < qt) {
    const c = q[qh++]; if (c === t) break;
    const ci = c % w, cj = (c / w) | 0;
    const dd = (ci - ti) ** 2 + (cj - tj) ** 2; if (dd < bestD) { bestD = dd; best = c; }
    for (const [dx, dy] of D8) {
      const ni = ci + dx, nj = cj + dy, n = nj * w + ni;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h || prev[n] !== -1 || blocked[n]) continue;
      if (dx && dy && (blocked[cj * w + ni] || blocked[nj * w + ci])) continue;   // no corner cutting
      prev[n] = c; q[qt++] = n;
    }
  }
  // unreachable target (e.g. a pocket behind the stairs): stop at the closest reachable cell
  const end = prev[t] !== -1 ? t : best;
  if (end === s) return null;
  const path = []; for (let c = end; c !== s; c = prev[c]) path.push([c % w, (c / w) | 0]); path.push(from); path.reverse();
  // string-pull: keep only the points needed for clear straight lines
  const out = [path[0]]; let a = 0;
  while (a < path.length - 1) {
    let b = path.length - 1;
    while (b > a + 1 && !clear(plan, path[a], path[b])) b--;
    out.push(path[b]); a = b;
  }
  return out;
}
function clear(plan, p, q) {
  const { w, blocked } = plan, n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 2);
  for (let k = 0; k <= n; k++) { const i = Math.round(p[0] + (q[0] - p[0]) * k / n), j = Math.round(p[1] + (q[1] - p[1]) * k / n); if (blocked[j * w + i]) return false; }
  return true;
}

/* ---------- 2D map (minimap, room preview) ---------- */
export function drawMap(canvas, plan, { roomId = null, pos = null, yaw = 0 } = {}) {
  const { w, h, grid, byId } = plan;
  if (!plan.mapImg) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h);
    for (let k = 0; k < w * h; k++) {
      const v = grid[k]; let col = null;
      if (v === WALL) col = [52, 60, 68]; else if (v === STAIR) col = [150, 146, 138]; else if (v === WIN) col = [120, 180, 215];
      else if (isRoom(v)) { const t = byId.get(v)?.type; col = t === 'hall' ? [236, 232, 225] : t === 'wc' ? [215, 224, 229] : [226, 214, 196]; }
      if (col) { img.data.set(col, k * 4); img.data[k * 4 + 3] = 255; }
    }
    g.putImageData(img, 0, 0); plan.mapImg = c;
  }
  const g = canvas.getContext('2d'), cw = canvas.width, chh = canvas.height;
  const s = Math.min(cw / w, chh / h), ox = (cw - w * s) / 2, oy = (chh - h * s) / 2;
  g.clearRect(0, 0, cw, chh);
  g.imageSmoothingEnabled = false;
  g.drawImage(plan.mapImg, ox, oy, w * s, h * s);
  if (roomId != null) {
    const r = byId.get(roomId);
    if (r) {
      g.fillStyle = 'rgba(201,160,74,.55)';
      for (let j = Math.floor((r.bb[1] - plan.z0) / plan.cell); j < Math.ceil((r.bb[3] - plan.z0) / plan.cell); j++)
        for (let i = Math.floor((r.bb[0] - plan.x0) / plan.cell); i < Math.ceil((r.bb[2] - plan.x0) / plan.cell); i++)
          if (grid[j * w + i] === roomId) g.fillRect(ox + i * s, oy + j * s, s + 0.5, s + 0.5);
    }
  }
  if (pos) {
    const px = ox + (pos[0] - plan.x0) / plan.cell * s, py = oy + (pos[1] - plan.z0) / plan.cell * s;
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw), R = 26;
    g.fillStyle = 'rgba(201,160,74,.35)'; g.beginPath(); g.moveTo(px, py);
    g.arc(px, py, R, Math.atan2(dz, dx) - 0.6, Math.atan2(dz, dx) + 0.6); g.closePath(); g.fill();
    g.fillStyle = '#C9A04A'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  return { s, ox, oy };
}
