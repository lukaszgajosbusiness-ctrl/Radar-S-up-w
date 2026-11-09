// Scalanie linii z BDOT10k (scripts/bdot.json) z sieciami z OSM dla jednego obszaru.
// nets: [{id,k,kind,t,g(lon,lat),m(metry)}]; M: [lon,lat]->[x,y] w metrach; bb: {s,n,w,e}.
const FAM = k => (k === 'gaz' ? 'gaz' : k === 'woda' ? 'woda' : 'prad');
function dSeg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1); t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
export function mergeBdot(nets, lines, M, bb, TOL = 20) {
  const inBB = ([x, y]) => x > bb.w && x < bb.e && y > bb.s && y < bb.n;
  const bbN = nets.map(n => { const xs = n.m.map(p => p[0]), ys = n.m.map(p => p[1]); return { n, x0: Math.min(...xs) - TOL, x1: Math.max(...xs) + TOL, y0: Math.min(...ys) - TOL, y1: Math.max(...ys) + TOL, f: FAM(n.k) } });
  const near = (p, fam) => { let best = null, bd = TOL; for (const b of bbN) { if (b.f !== fam || p[0] < b.x0 || p[0] > b.x1 || p[1] < b.y0 || p[1] > b.y1) continue; const m = b.n.m; for (let i = 0; i < m.length - 1; i++) { const d = dSeg(p, m[i], m[i + 1]); if (d < bd) { bd = d; best = b.n } } } return best };
  const st = { lines: 0, pts: 0, covered: 0, newNets: 0, newLen: 0, relabel: 0, confirm: 0, mismatch: 0, byK: {} };
  const add = []; let seq = 0;
  for (const L of lines) {
    if (!L.g.some(inBB)) continue; st.lines++;
    const fam = FAM(L.k), mm = L.g.map(M), pts = [];
    for (let i = 0; i < mm.length - 1; i++) { const S = Math.hypot(mm[i + 1][0] - mm[i][0], mm[i + 1][1] - mm[i][1]); const s = Math.max(1, Math.ceil(S / 10)); for (let k = 0; k < s; k++) { const t = k / s; pts.push({ m: [mm[i][0] + (mm[i + 1][0] - mm[i][0]) * t, mm[i][1] + (mm[i + 1][1] - mm[i][1]) * t], g: [L.g[i][0] + (L.g[i + 1][0] - L.g[i][0]) * t, L.g[i][1] + (L.g[i + 1][1] - L.g[i][1]) * t] }) } }
    pts.push({ m: mm[mm.length - 1], g: L.g[L.g.length - 1] });
    const votes = new Map(); let run = [];
    const flush = () => { if (run.length >= 3) { const id = 'b' + (++seq); const g = run.map(p => p.g); const m = run.map(p => p.m); let len = 0; for (let i = 0; i < m.length - 1; i++) len += Math.hypot(m[i + 1][0] - m[i][0], m[i + 1][1] - m[i][1]); add.push({ id, k: L.k, kind: L.src === 'SUPR' ? 'podziemna' : 'napowietrzna', t: { operator: 'BDOT10k', voltage: '' }, bd: true, g, m }); st.newNets++; st.newLen += len; st.byK[L.k] = (st.byK[L.k] || 0) + len } run = [] };
    for (const p of pts) {
      if (!inBB(p.g)) { flush(); continue } st.pts++;
      const n = near(p.m, fam);
      if (n) { st.covered++; votes.set(n, (votes.get(n) || 0) + 1); n._v = n._v || {}; n._v[L.k] = (n._v[L.k] || 0) + 1; flush() } else run.push(p);
    }
    flush();
  }
  for (const n of nets) {
    if (!n._v) continue; const e = Object.entries(n._v).sort((a, b) => b[1] - a[1])[0]; delete n._v; const cls = e[0];
    if (FAM(n.k) !== 'prad') { n.bd = true; st.confirm++; continue }
    if (n.t.voltage) { if (n.k === cls) { n.bd = true; st.confirm++ } else st.mismatch++; continue }
    n.bd = true; if (n.k !== cls) { n.k = cls; st.relabel++ } else st.confirm++;
  }
  nets.push(...add);
  return st;
}
