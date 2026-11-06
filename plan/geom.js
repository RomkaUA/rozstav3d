/*
  РОЗСТАВ — геометрія плану: Scale Calibrator, Geometry Validator, перебудова кімнат, площі, імпорт DXF.
  ------------------------------------------------------------
  Модель плану (усі довжини — у міліметрах, координати — у системі зображення: x праворуч, y вниз):
    { mmPerPx, scaleOk, H (висота стелі), walls: [{ id, a:[x,y], b:[x,y], t, ext, conf, check }],
      openings: [{ id, wall, kind: door|window|opening, at (від a до центру), width, height, sill, conf, check, hinge, swing }],
      rooms: [{ id, name, type (ROOM_TYPES), poly:[[x,y]…], lp (точка підпису всередині), area (м²), conf, check, suspect, manual }],
      stairs: [{ id, x, y, w, l, rot, steps }], voids: [[x,y]] (області, позначені «не приміщення»), aptType }
    Стіна з virtual: true — межа приміщень без стіни (кухня-вітальня, коридор): ділить кімнати, у 3D не будується.
  Масштаб невідомий (scaleOk = false) — модель існує в пікселях-як-мм лише для перегляду; генерація 3D заблокована.
*/
(function (root) {
  "use strict";
  const D = root.RozstavPlanDetect || (typeof require === "function" ? require("./detect.js") : null);
  const K = root.RozstavDrawingKnowledge || (typeof require === "function" ? require("./drawing-knowledge.js") : null);
  const len = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const area = p => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
  let seq = 0; const uid = p => p + (++seq).toString(36) + Date.now().toString(36).slice(-3);

  // ---------- Scale Calibrator ----------
  // дві точки на плані (px) і реальна відстань (мм) → мм на піксель
  function calibrate(p1, p2, mm) { const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); if (!(d > 3) || !(mm > 0)) throw new Error("Оберіть дві різні точки й введіть відстань більше нуля"); return mm / d; }
  // підказка масштабу за типовою шириною міжкімнатних дверей (800–900 мм) — лише ПРОПОЗИЦІЯ, користувач підтверджує
  function suggestFromDoors(det) {
    const d = det.openings.filter(o => o.kind === "door" && o.conf >= 0.5).map(o => o.width).sort((a, b) => a - b);
    if (d.length < 1) return null; const med = d[Math.floor(d.length / 2)];
    return { mmPerPx: 850 / med, basis: `медіана ширини ${d.length} дверей = ${Math.round(med)} px ≈ 850 мм` };
  }
  // ---------- типи приміщень ----------
  const ROOM_TYPES = [["living", "Житлова кімната"], ["bedroom", "Спальня"], ["livingroom", "Вітальня"], ["kitchen", "Кухня"], ["kitchen_living", "Кухня-вітальня"],
    ["bath_combined", "Санвузол"], ["bathroom", "Ванна кімната"], ["wc", "Туалет"], ["corridor", "Коридор"], ["hall", "Передпокій"], ["wardrobe", "Гардеробна"],
    ["storage", "Комора"], ["balcony", "Балкон"], ["loggia", "Лоджія"], ["technical", "Технічне приміщення"], ["other", "Інше приміщення"], ["unknown", "Невизначене приміщення"]];
  const TYPE_NAME = Object.fromEntries(ROOM_TYPES), HABITABLE = new Set(["living", "bedroom", "livingroom"]);
  const APT_TYPES = [["studio", "Студія"], ["one_bedroom", "Однокімнатна квартира"], ["two_bedroom", "Двокімнатна квартира"], ["three_bedroom", "Трикімнатна квартира"], ["other", "Інший тип"], ["unknown", "Неможливо визначити"]];
  // тип квартири — за кількістю ОКРЕМИХ житлових кімнат, а не всіх приміщень; кухня-вітальня без інших житлових — студія
  function apartmentType(plan) {
    const typed = plan.rooms.filter(r => r.type && r.type !== "unknown"); if (!typed.length) return "unknown";
    const n = typed.filter(r => HABITABLE.has(r.type)).length, kl = typed.some(r => r.type === "kitchen_living");
    if (!n) return kl ? "studio" : "unknown";
    return n === 1 ? "one_bedroom" : n === 2 ? "two_bedroom" : n === 3 ? "three_bedroom" : "other";
  }
  // назва за замовчуванням: «Приміщення N», поки тип не визначено; інакше — назва типу
  const defaultName = (type, i) => type && type !== "unknown" ? TYPE_NAME[type] : `Приміщення ${i + 1}`;
  // результат детектора (px) → модель плану (мм)
  function fromDetection(det, mmPerPx, H, opts = {}) {
    const k = mmPerPx || 1, plan = { mmPerPx: mmPerPx || null, scaleOk: !!opts.scaleOk, H: H || 2700, walls: [], openings: [], rooms: [], stairs: [] };
    const minT = opts.defaultT || 120;
    // межі в мм (мін. товщина 40 мм) — лише коли масштаб відомий: до калібрування одиниці — пікселі, і така межа спотворила б товщину
    det.walls.forEach((w, i) => plan.walls.push({ id: "p" + (i + 1), a: w.a.map(v => v * k), b: w.b.map(v => v * k), t: (opts.scaleOk ? Math.max(40, Math.round(w.t * k)) : Math.round(w.t * k * 10) / 10) || minT, ext: !!w.ext, conf: +w.conf.toFixed(2), check: !!w.check }));
    det.openings.forEach(o => { const w = plan.walls[o.wall]; if (!w) return; const win = o.kind === "window";
      plan.openings.push({ id: uid("o"), wall: w.id, kind: o.kind, at: o.at * k, width: o.width * k, height: win ? 1500 : 2050, sill: win ? 850 : 0, conf: +o.conf.toFixed(2), check: !!o.check, hinge: o.hinge, swing: o.swing }); });
    det.rooms.forEach((r, i) => plan.rooms.push({ id: uid("r"), name: defaultName("unknown", i), type: "unknown", poly: offsetPoly(r.poly, 0.5).map(p => [p[0] * k, p[1] * k]), lp: r.lp ? [r.lp[0] * k, r.lp[1] * k] : null, area: +(r.area * k * k / 1e6).toFixed(2), conf: +r.conf.toFixed(2), check: !!r.check, suspect: r.suspect || null }));
    plan.walls.forEach(w => { w.ext = w.ext && plan.rooms.length > 0 ? w.ext : w.ext; });
    return plan;
  }

  // ---------- перебудова кімнат зі стін (після редагування) ----------
  // стіни растеризуються в маску з кроком step мм; прорізи «закриті»; заливка ззовні → кімнати; назви переносяться з найближчих старих кімнат
  // контур кімнати проходить через центри крайніх пікселів — зсуваємо його назовні на половину пікселя (зсув ребер із «митрою»)
  function offsetPoly(poly, d) {
    const n = poly.length, s = Math.sign(poly.reduce((a, p, i) => { const q = poly[(i + 1) % n]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) || 1;
    return poly.map((p, i) => { const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n], n1 = norm([p[1] - a[1], a[0] - p[0]]), n2 = norm([b[1] - p[1], p[0] - b[0]]), m = norm([n1[0] + n2[0], n1[1] + n2[1]]), k = d / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]); return [p[0] - s * m[0] * k, p[1] - s * m[1] * k]; });
  }
  const norm = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  // межі приміщення з растра не доходять до стіни на кілька клітинок: горизонтальні й вертикальні сторони ставимо точно на грань найближчої паралельної стіни
  // (межа без стіни — на її вісь). Повертає контур і чи всі сторони вдалося прив'язати
  function snapToFaces(poly, walls, step) {
    const n = poly.length, out = poly.map(p => p.slice()), tol = 6 * step, axisOf = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], ax = Math.abs(a[0] - b[0]) <= Math.abs(a[1] - b[1]) ? 0 : 1, o = 1 - ax;   // ax — вісь, поперек якої лежить сторона
      if (Math.abs(a[ax] - b[ax]) > step * 1.5) continue;
      const c = (a[ax] + b[ax]) / 2, lo = Math.min(a[o], b[o]), hi = Math.max(a[o], b[o]); let best = null;
      for (const w of walls) {
        if (Math.abs(w.a[ax] - w.b[ax]) > 1 || Math.min(hi, Math.max(w.a[o], w.b[o])) - Math.max(lo, Math.min(w.a[o], w.b[o])) <= 0) continue;
        for (const f of w.virtual ? [w.a[ax]] : [w.a[ax] - w.t / 2, w.a[ax] + w.t / 2]) { const d = Math.abs(f - c); if (d <= tol && (best == null || d < Math.abs(best - c))) best = f; }
      }
      if (best == null) continue;
      out[i][ax] = best; out[(i + 1) % n][ax] = best; axisOf[i] = ax;
    }
    // між двома перпендикулярними прив'язаними сторонами растр лишає вигин (внутрішній кут): якщо там немає косої стіни, замінюємо його точкою перетину сторін
    const S = []; for (let i = 0; i < n; i++) if (axisOf[i] >= 0) S.push(i); if (S.length < 2) return { poly: out, all: false };
    const diag = walls.filter(w => Math.abs(w.a[0] - w.b[0]) > 1 && Math.abs(w.a[1] - w.b[1]) > 1), res = []; let all = true;
    S.forEach((e, k) => {
      const f = S[(k + 1) % S.length], gap = (f - e - 1 + n) % n;
      if (!gap) { res.push(out[f]); return; }
      const chain = []; for (let j = 0; j <= gap + 1; j++) chain.push(out[(e + 1 + j) % n]);   // від кінця сторони e до початку сторони f
      let L = 0; for (let j = 1; j < chain.length - 1; j++) L += Math.hypot(chain[j][0] - chain[j - 1][0], chain[j][1] - chain[j - 1][1]);
      const nearDiag = chain.some(p => diag.some(w => distToSeg(p, w) < (w.t || 0) / 2 + tol));
      if (axisOf[e] !== axisOf[f] && L <= 1000 && !nearDiag) { const q = [0, 0]; q[axisOf[e]] = out[e][axisOf[e]]; q[axisOf[f]] = out[f][axisOf[f]]; res.push(q); return; }
      all = false; for (let j = 0; j < chain.length - 1; j++) res.push(chain[j]);
    });
    return { poly: res, all };
  }
  // Контур із растра спрощує криву до хорд. Ділянку контуру біля кривої стіни замінюємо точною внутрішньою гранню цієї стіни.
  function spliceCurves(plan, poly, step) {
    const groups = new Map(); for (const w of plan.walls) if (w.g && !w.virtual) { if (!groups.has(w.g)) groups.set(w.g, []); groups.get(w.g).push(w); }
    let out = poly, changed = false;
    const toLine = (p, f) => { let d = Infinity; for (let i = 1; i < f.length; i++) d = Math.min(d, distToSeg(p, { a: f[i - 1], b: f[i] })); return d; };
    for (const q of groups.values()) {
      if (q.some((w, i) => i && Math.hypot(w.a[0] - q[i - 1].b[0], w.a[1] - q[i - 1].b[1]) > 1)) continue;
      const pts = [q[0].a, ...q.map(w => w.b)], n = pts.length, ht = q[0].t / 2;
      const nor = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; return norm([a[1] - b[1], b[0] - a[0]]); });
      const m = Math.floor(n / 2);
      for (const sg of [1, -1]) {
        if (![3 * step, 100, 300, 800].some(d => inside([pts[m][0] + sg * nor[m][0] * (ht + d), pts[m][1] + sg * nor[m][1] * (ht + d)], out))) continue;
        const face = pts.map((p, i) => [+(p[0] + sg * nor[i][0] * ht).toFixed(2), +(p[1] + sg * nor[i][1] * ht).toFixed(2)]), lim = 2 * ht + 6 * step + 150;
        // кінці грані проєктуємо на контур: там з'являються нові вершини, від яких іде заміна
        const insert = (arr, t) => { let b = null; arr.forEach((a, k) => { const c = arr[(k + 1) % arr.length], dx = c[0] - a[0], dy = c[1] - a[1], l2 = dx * dx + dy * dy, u = l2 ? Math.max(0, Math.min(1, ((t[0] - a[0]) * dx + (t[1] - a[1]) * dy) / l2)) : 0, q = [a[0] + u * dx, a[1] + u * dy], d = Math.hypot(q[0] - t[0], q[1] - t[1]); if (!b || d < b.d) b = { d, k, q }; }); if (!b || b.d > lim) return null; const r = arr.slice(); r.splice(b.k + 1, 0, b.q); return { arr: r, q: b.q }; };
        const A = insert(out, face[0]), B = A && insert(A.arr, face[n - 1]); if (!B) continue;
        const cur = B.arr, L = cur.length, i = cur.indexOf(A.q), j = cur.indexOf(B.q); if (i < 0 || j < 0 || i === j) continue;
        // дві дороги від i до j: прибираємо ту, що йде вздовж кривої
        const fw = [], bw = []; for (let k = (i + 1) % L; k !== j; k = (k + 1) % L) fw.push(k); for (let k = (i - 1 + L) % L; k !== j; k = (k - 1 + L) % L) bw.push(k);
        const dev = idx => idx.reduce((s, k) => Math.max(s, toLine(cur[k], face)), 0), df = dev(fw), db = dev(bw), useFw = df <= db; if (Math.min(df, db) > 800) continue;
        const keep = useFw ? bw.slice().reverse() : fw.slice().reverse(); // від j до i, не зачіпаючи кривої
        out = [...face, ...keep.map(k => cur[k])]; changed = true; break;
      }
    }
    return { poly: out, changed };
  }
  function rebuildRooms(plan, step = 10) {
    const pts = plan.walls.flatMap(w => [w.a, w.b]); if (!pts.length) { plan.rooms = []; return plan; }
    const pad = 400, x0 = Math.min(...pts.map(p => p[0])) - pad, y0 = Math.min(...pts.map(p => p[1])) - pad, x1 = Math.max(...pts.map(p => p[0])) + pad, y1 = Math.max(...pts.map(p => p[1])) + pad;
    const W = Math.ceil((x1 - x0) / step) + 1, H = Math.ceil((y1 - y0) / step) + 1; if (W * H > 9e6) throw new Error("План завеликий для перебудови кімнат");
    const g = new Uint8Array(W * H).fill(250), vb = new Uint8Array(W * H);
    // точна растеризація: клітинка — стіна, якщо її центр не далі t/2 від осі стіни (з подовженням кінців на t/2 для кутів)
    for (const w of plan.walls) {
      const L = len(w) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, e = w.virtual ? Math.max(step * 1.5, 10) : w.t / 2, A = [w.a[0] - ux * e, w.a[1] - uy * e], B = [w.b[0] + ux * e, w.b[1] + uy * e], ww = { a: A, b: B };
      const bx0 = Math.max(0, Math.floor((Math.min(A[0], B[0]) - e - x0) / step)), bx1 = Math.min(W - 1, Math.ceil((Math.max(A[0], B[0]) + e - x0) / step)), by0 = Math.max(0, Math.floor((Math.min(A[1], B[1]) - e - y0) / step)), by1 = Math.min(H - 1, Math.ceil((Math.max(A[1], B[1]) + e - y0) / step));
      // межа без стіни — окремий бар'єр для пошуку приміщень (у масці стін вона була б «надто тонкою» й зникла б)
      for (let Y = by0; Y <= by1; Y++) for (let X = bx0; X <= bx1; X++) if (distToSeg([X * step + x0, Y * step + y0], ww) <= e) { vb[Y * W + X] = 1; if (!w.virtual) g[Y * W + X] = 10; }   // стіни тут відомі точно, тож вони й бар'єр: розпізнавання з растра губить короткі сегменти кривих, і заливка «витікала» назовні
    }
    const det = D.detect({ w: W, h: H, gray: g }, { threshold: 128, wallPx: Math.max(2, Math.round(Math.min(...plan.walls.filter(w => !w.virtual).map(w => w.t).concat([1e9])) / step)), single: true, bands: false, barrier: vb });
    const old = plan.rooms || [], manual = old.filter(r => r.manual), voids = plan.voids || [];
    let n = 0; const auto = [], used = new Set();
    for (const r of det.rooms) {
      const sn = snapToFaces(offsetPoly(r.poly, 0.5).map(p => [p[0] * step + x0, p[1] * step + y0]), plan.walls, step), sc = plan.walls.some(w => w.g) ? spliceCurves(plan, sn.poly, step) : { poly: sn.poly, changed: false }, poly = sc.poly; if (sc.changed) sn.all = true; const lp = r.lp ? [r.lp[0] * step + x0, r.lp[1] * step + y0] : [r.c[0] * step + x0, r.c[1] * step + y0];
      // «не приміщення» (вилучене користувачем) і область, яку перекриває намальоване вручну приміщення, — пропускаємо
      if (voids.some(v => inside(v, poly)) || manual.some(m => inside(lp, m.poly))) continue;
      // кімнату, поділену новою стіною, успадковує лише одна частина: id і назва мають лишатися унікальними
      const prev = old.find(o => !o.manual && !used.has(o.id) && (inside(lp, o.poly) || (o.lp && inside(o.lp, poly)))); if (prev) used.add(prev.id);
      auto.push({ id: prev ? prev.id : uid("r"), name: prev ? prev.name : defaultName("unknown", n), type: prev ? prev.type || "unknown" : "unknown", mat: prev ? prev.mat || null : null, poly, lp, area: +((sn.all ? area(poly) / 1e6 : r.area * step * step / 1e6)).toFixed(2), conf: 1,
        // підозрілість переходить від детектора; підтверджену користувачем область не позначаємо знову
        check: prev && prev.ok ? false : !!r.suspect, suspect: prev && prev.ok ? null : r.suspect || null, ok: prev ? !!prev.ok : false }); n++;
    }
    for (const m of manual) m.area = +(area(m.poly) / 1e6).toFixed(2);
    plan.rooms = [...auto, ...manual];
    return plan;
  }
  function inside(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }

  // ---------- кути між стінами й криві стіни ----------
  // кут при вершині v, 0…180°
  function angleAt(a, v, b) { const x1 = a[0] - v[0], y1 = a[1] - v[1], x2 = b[0] - v[0], y2 = b[1] - v[1], l = Math.hypot(x1, y1) * Math.hypot(x2, y2); if (!l) return 0; return Math.acos(Math.max(-1, Math.min(1, (x1 * x2 + y1 * y2) / l))) * 180 / Math.PI; }
  function circleThrough(a, m, b) {
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1])); if (Math.abs(d) < 1e-6) return null;
    const A = a[0] * a[0] + a[1] * a[1], M = m[0] * m[0] + m[1] * m[1], B = b[0] * b[0] + b[1] * b[1], cx = (A * (m[1] - b[1]) + M * (b[1] - a[1]) + B * (a[1] - m[1])) / d, cy = (A * (b[0] - m[0]) + M * (a[0] - b[0]) + B * (m[0] - a[0])) / d;
    return { c: [cx, cy], r: Math.hypot(a[0] - cx, a[1] - cy) };
  }
  // Дуга через три точки як ланцюжок прямих сегментів: кімнати, 3D, FBX і DWG працюють із нею як зі звичайними стінами.
  // Сегмент не коротший за 120 мм (коротші стіни перевірка плану не приймає) і не довший за chord або 12° дуги.
  function arcPoints(a, m, b, chord = 350) {
    const C = circleThrough(a, m, b); if (!C || C.r > 2e5) return null;
    const T = 2 * Math.PI, A0 = Math.atan2(a[1] - C.c[1], a[0] - C.c[0]), Am = Math.atan2(m[1] - C.c[1], m[0] - C.c[0]), A1 = Math.atan2(b[1] - C.c[1], b[0] - C.c[0]), ccw = v => ((v - A0) % T + T) % T;
    const sweep = ccw(Am) <= ccw(A1) ? ccw(A1) : ccw(A1) - T, L = Math.abs(sweep) * C.r; if (L < 240) return null;
    const n = Math.max(2, Math.min(Math.floor(L / 120), Math.ceil(Math.max(L / chord, Math.abs(sweep) / (12 * Math.PI / 180))))), pts = [a.slice()];
    for (let i = 1; i < n; i++) { const t = A0 + sweep * i / n; pts.push([+(C.c[0] + C.r * Math.cos(t)).toFixed(2), +(C.c[1] + C.r * Math.sin(t)).toFixed(2)]); }
    pts.push(b.slice()); return pts;
  }
  // лінія від руки → спрощення (тремтіння прибрано) → згладжування → сегменти не коротші за minSeg; кінці лишаються на місці
  function smoothPath(pts, tol = 30, minSeg = 150) {
    const rdp = (p, i, j, out) => { let best = -1, dm = tol; for (let k = i + 1; k < j; k++) { const d = distToSeg(p[k], { a: p[i], b: p[j] }); if (d > dm) { dm = d; best = k; } } if (best >= 0) { rdp(p, i, best, out); out.push(p[best]); rdp(p, best, j, out); } };
    if (pts.length < 2) return pts.slice(); const mid = []; rdp(pts, 0, pts.length - 1, mid);
    let q = [pts[0], ...mid, pts[pts.length - 1]];
    for (let r = 0; r < 2 && q.length > 2; r++) { const s = [q[0]]; for (let i = 0; i < q.length - 1; i++) { if (i > 0) s.push([q[i][0] * .75 + q[i + 1][0] * .25, q[i][1] * .75 + q[i + 1][1] * .25]); if (i < q.length - 2) s.push([q[i][0] * .25 + q[i + 1][0] * .75, q[i][1] * .25 + q[i + 1][1] * .75]); } s.push(q[q.length - 1]); q = s; }
    const out = [q[0]]; for (let i = 1; i < q.length - 1; i++) if (Math.hypot(q[i][0] - out[out.length - 1][0], q[i][1] - out[out.length - 1][1]) >= minSeg) out.push(q[i]);
    const e = q[q.length - 1]; while (out.length > 1 && Math.hypot(e[0] - out[out.length - 1][0], e[1] - out[out.length - 1][1]) < minSeg) out.pop();
    out.push(e); return out.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
  }
  // стіни однієї кривої (або сама стіна, якщо вона пряма)
  function groupWalls(plan, w) { return w && w.g ? plan.walls.filter(v => v.g === w.g) : w ? [w] : []; }
  // Кути на стиках стін: { p, a, b, w1, e1, w2, e2, deg }. a і b — дальні точки променів, e — кінець стіни на стику.
  // Стик усередині однієї кривої — не кут. e2 = null: стіна w1 впирається в середину стіни w2 (Т-з'єднання).
  function corners(plan) {
    const W = plan.walls.filter(w => !w.virtual && len(w) > 0), cl = [], out = [];
    for (const w of W) for (const e of ["a", "b"]) { const p = w[e]; let c = cl.find(k => Math.hypot(k.p[0] - p[0], k.p[1] - p[1]) <= 5); if (!c) cl.push(c = { p, rays: [] }); c.rays.push({ w, e, far: e === "a" ? w.b : w.a }); }
    const add = (p, r1, r2) => { if (r1.w.g && r1.w.g === r2.w.g) return; out.push({ p, a: r1.far, b: r2.far, w1: r1.w, e1: r1.e, w2: r2.w, e2: r2.e, deg: angleAt(r1.far, p, r2.far) }); };
    for (const c of cl) {
      if (c.rays.length === 1) {
        const r = c.rays[0], v = W.find(q => q !== r.w && !q.g && distToSeg(c.p, q) <= q.t / 2 + 5); if (!v) continue;
        const d1 = angleAt(r.far, c.p, v.a), d2 = angleAt(r.far, c.p, v.b); add(c.p, r, { w: v, e: null, far: d1 <= d2 ? v.a : v.b }); continue;
      }
      const s = c.rays.slice().sort((x, y) => Math.atan2(x.far[1] - c.p[1], x.far[0] - c.p[0]) - Math.atan2(y.far[1] - c.p[1], y.far[0] - c.p[0]));
      if (s.length === 2) { add(c.p, s[0], s[1]); continue; }
      for (let i = 0; i < s.length; i++) { const r1 = s[i], r2 = s[(i + 1) % s.length]; let d = Math.atan2(r2.far[1] - c.p[1], r2.far[0] - c.p[0]) - Math.atan2(r1.far[1] - c.p[1], r1.far[0] - c.p[0]); if (d < 0) d += 2 * Math.PI; if (d < Math.PI - 1e-6) add(c.p, r1, r2); }
    }
    return out;
  }
  // Виставити кут: стіна wallId повертається навколо стику, довжина лишається, сусідні стіни на її дальньому кінці йдуть за нею.
  function setCorner(plan, c, wallId, deg) {
    if (!(deg >= 1 && deg <= 179)) return { ok: false, why: "Кут має бути від 1 до 179°" };
    const isOne = c.w1.id === wallId, w = isOne ? c.w1 : c.w2, e = isOne ? c.e1 : c.e2, q = isOne ? c.b : c.a; if (!w || !e) return { ok: false, why: "Ця стіна не закінчується в цьому куті" }; if (w.g) return { ok: false, why: "Криву стіну так не повернути: виберіть сусідню пряму" };
    const f = e === "a" ? "b" : "a", old = w[f], L = len(w), ox = q[0] - c.p[0], oy = q[1] - c.p[1], cur = (ox * (old[1] - c.p[1]) - oy * (old[0] - c.p[0])) >= 0 ? 1 : -1, t = Math.atan2(oy, ox) + cur * deg * Math.PI / 180, nf = [+(w[e][0] + L * Math.cos(t)).toFixed(2), +(w[e][1] + L * Math.sin(t)).toFixed(2)];
    const fol = []; for (const v of plan.walls) if (v !== w) for (const k of ["a", "b"]) if (Math.hypot(v[k][0] - old[0], v[k][1] - old[1]) <= 5) { if (v.g) return { ok: false, why: "До цієї стіни примикає крива: поверніть іншу стіну" }; fol.push([v, k]); }
    w[f] = nf; for (const [v, k] of fol) { v[k] = nf.slice(); const n = len(v); for (const o of plan.openings) if (o.wall === v.id) { o.width = Math.min(o.width, Math.max(200, n - 20)); o.at = Math.max(o.width / 2, Math.min(n - o.width / 2, o.at)); } }
    return { ok: true };
  }

  // ---------- Geometry Validator ----------
  // повертає [{ level: error|warn, code, text, ref }]: error блокує генерацію 3D
  function validate(plan) {
    const out = [], add = (level, code, text, ref) => out.push({ level, code, text, ref });
    if (!plan.scaleOk) add("error", "scale", "Масштаб не підтверджено: без нього розміри були б умовними. Відкалібруйте за двома точками або підтвердьте запропонований масштаб.");
    if (!plan.walls.length) add("error", "walls", "На плані немає стін.");
    if (!(plan.H >= 2000 && plan.H <= 6000)) add("error", "height", `Висота стелі ${plan.H} мм поза межами 2000–6000 мм.`);
    for (const w of plan.walls) {
      const L = len(w);
      if (w.virtual) { if (L < 100) add("warn", "short", `Межа ${w.id} коротша за 100 мм.`, w.id); continue; }
      if (L < 100) add("error", "short", `Стіна ${w.id} коротша за 100 мм (${Math.round(L)} мм).`, w.id);
      if (w.t < 40 || w.t > 800) add("warn", "thick", `Стіна ${w.id}: товщина ${Math.round(w.t)} мм незвична (очікується 40–800).`, w.id);
      if (L > 60000) add("error", "long", `Стіна ${w.id} довша за 60 м — схоже, масштаб помилковий.`, w.id);
      // незамкнений кінець: поряд немає іншої стіни
      for (const e of [w.a, w.b]) { const ok = plan.walls.some(v => v !== w && distToSeg(e, v) <= Math.max(w.t, v.t) * 0.75 + 20); if (!ok) add("warn", "open", `Стіна ${w.id}: кінець не з'єднаний з іншою стіною — контур може бути незамкнений.`, w.id); }
      if (w.check) add("warn", "unsure", `Стіна ${w.id} розпізнана невпевнено (${Math.round((w.conf || 0) * 100)} %) — перевірте.`, w.id);
    }
    for (const o of plan.openings) {
      const w = plan.walls.find(v => v.id === o.wall); if (!w) { add("error", "orphan", `Проріз ${o.id} не прив'язаний до стіни.`, o.id); continue; }
      const L = len(w); if (o.at - o.width / 2 < -5 || o.at + o.width / 2 > L + 5) add("error", "outside", `${kindName(o)} виходить за межі стіни ${w.id}.`, o.id);
      if (o.kind === "door" && (o.width < 500 || o.width > 2600)) add("warn", "doorw", `Двері шириною ${Math.round(o.width)} мм — перевірте масштаб або тип.`, o.id);
      if (o.kind === "window" && (o.width < 300 || o.width > 6000)) add("warn", "winw", `Вікно шириною ${Math.round(o.width)} мм — перевірте.`, o.id);
      if (o.height + o.sill > plan.H) add("error", "tall", `${kindName(o)} вище за стелю.`, o.id);
      if (o.check) add("warn", "unsure", `${kindName(o)} на стіні ${w.id} розпізнано невпевнено (${Math.round((o.conf || 0) * 100)} %) — перевірте тип і розмір.`, o.id);
      for (const p of plan.openings) if (p !== o && p.wall === o.wall && p.id > o.id && Math.abs(p.at - o.at) < (p.width + o.width) / 2) add("error", "overlap", `Прорізи на стіні ${w.id} перетинаються.`, o.id);
    }
    if (!plan.rooms.length && plan.walls.length) add("error", "rooms", "Не знайдено жодної замкненої кімнати: контур стін незамкнений. Додайте або з'єднайте стіни.");
    const why = { narrow: "дуже вузька (близько товщини стіни)", tiny: "дуже мала відносно квартири", shape: "має дуже нерівний контур" };
    for (const r of plan.rooms) {
      if (r.suspect && !r.ok) add("warn", "suspect", `«${r.name}» ${why[r.suspect] || "підозріла"} — можливо, це не приміщення, а проміжок між лініями креслення. Об'єднайте з сусіднім, вилучіть або підтвердьте.`, r.id);
      if (plan.scaleOk && r.area < 1 && !r.suspect) add("warn", "small", `«${r.name}» дуже мала (${r.area} м²).`, r.id);
      if (plan.scaleOk && r.area > 400) add("warn", "big", `«${r.name}» понад 400 м² — перевірте масштаб.`, r.id);
    }
    out.push(...semanticChecks(plan));
    return out;
  }
  // ---------- об'єднання приміщень ----------
  // стіни (і межі), що з одного боку мають приміщення A, а з другого — B, щонайменше на 60% своєї довжини
  function wallsBetween(plan, A, B) {
    // відступ від осі — у частках товщини стін плану, а не в мм: до підтвердження масштабу план у пікселях
    const ts = plan.walls.filter(w => !w.virtual).map(w => w.t).sort((a, b) => a - b), T0 = ts.length ? ts[Math.floor(ts.length / 2)] : 100, out = [];
    for (const w of plan.walls) {
      const L = len(w) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, off = (w.virtual ? 0 : w.t / 2) + Math.max(T0 * 0.6, w.t * 0.3, 1e-3); let hit = 0, n = 0;
      for (let k = 0.1; k <= 0.91; k += 0.1) { const p = [w.a[0] + ux * L * k, w.a[1] + uy * L * k], p1 = [p[0] - uy * off, p[1] + ux * off], p2 = [p[0] + uy * off, p[1] - ux * off]; n++; if ((inside(p1, A.poly) && inside(p2, B.poly)) || (inside(p1, B.poly) && inside(p2, A.poly))) hit++; }
      if (hit >= n * 0.6) out.push(w);
    }
    return out;
  }
  // об'єднати: прибрати стіни між A і B (разом із їхніми прорізами); назву й тип бере більше приміщення. Кімнати перебудовує викликач
  function mergeRooms(plan, idA, idB) {
    const A = plan.rooms.find(r => r.id === idA), B = plan.rooms.find(r => r.id === idB);
    if (!A || !B || A === B) return { ok: false, reason: "Оберіть два різні приміщення" };
    if (A.manual || B.manual) return { ok: false, reason: "Намальоване вручну приміщення змініть, перетягуючи його вершини" };
    const ws = wallsBetween(plan, A, B); if (!ws.length) return { ok: false, reason: "Між цими приміщеннями немає спільної стіни: вони не сусідні або їх розділяє стіна, спільна ще з іншими приміщеннями (видаліть чи вкоротіть її вручну)" };
    const big = A.area >= B.area ? A : B, ids = new Set(ws.map(w => w.id));
    plan.walls = plan.walls.filter(w => !ids.has(w.id)); plan.openings = plan.openings.filter(o => !ids.has(o.wall));
    // підпис більшого приміщення залишаємо, щоб після перебудови об'єднана область успадкувала його назву й тип
    plan.rooms = plan.rooms.filter(r => r !== (big === A ? B : A)); big.ok = true;
    return { ok: true, removed: ws.length, keep: big.id };
  }
  // ---------- семантика: приміщення в контексті стін і прорізів ----------
  // вікна/двері приміщення — прорізи, центр яких лежить на межі його контуру (у межах товщини стіни);
  // форма — через периметр: «ширина» ≈ 2S/P (для смуги — її ширина), видовженість P²/16S (квадрат = 1)
  function polyPerim(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; }
  function distPoly(p, poly) { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSeg(p, { a: poly[i], b: poly[(i + 1) % poly.length] })); return d; }
  function roomContext(plan, r) {
    const ts = plan.walls.filter(w => !w.virtual).map(w => w.t).sort((a, b) => a - b), T0 = ts.length ? ts[Math.floor(ts.length / 2)] : 150;
    const ops = { window: 0, door: 0, opening: 0, glazing: 0, extDoor: 0 }, near = (p, w) => distPoly(p, r.poly) <= w.t / 2 + T0 * 0.8;
    for (const o of plan.openings) { const w = plan.walls.find(v => v.id === o.wall); if (!w) continue; const L = len(w) || 1, c = [w.a[0] + (w.b[0] - w.a[0]) * o.at / L, w.a[1] + (w.b[1] - w.a[1]) * o.at / L];
      if (!near(c, w)) continue; ops[o.kind] = (ops[o.kind] || 0) + 1; if (o.kind === "window" && o.width >= L * 0.6) ops.glazing++; if (o.kind === "door" && w.ext) ops.extDoor++; }
    let ext = 0; for (const w of plan.walls) { if (w.virtual || !w.ext) continue; const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]; if (near(m, w)) ext++; }
    const A = area(r.poly), P = polyPerim(r.poly), total = plan.rooms.reduce((s, q) => s + area(q.poly), 0) || A;
    return { windows: ops.window, doors: ops.door + ops.opening, extDoors: ops.extDoor, glazing: ops.glazing, ext, share: A / total, elong: P * P / (16 * A || 1), widthRel: (2 * A / (P || 1)) / T0 };
  }
  // підказка призначення за правилами креслення — ЛИШЕ пропозиція з поясненням (не застосовується без користувача)
  function semanticHint(plan, r) {
    const c = roomContext(plan, r), out = [];
    if (c.glazing >= 1 && c.share < 0.2 && c.ext >= 1) out.push({ type: "balcony", conf: 0.5, why: `засклення на всю довжину стіни (${c.glazing}), мале (${Math.round(c.share * 100)} % площі)` });
    if (c.elong >= 3 && c.doors >= 2 && !c.windows) out.push({ type: "corridor", conf: 0.5, why: `видовжене (×${c.elong.toFixed(1)}), ${c.doors} прорізи, без вікон` });
    if (c.extDoors >= 1 && !c.windows) out.push({ type: "hall", conf: 0.45, why: "двері в зовнішній стіні (вхід), без вікон" });
    if (!c.windows && !c.glazing && c.share < 0.08 && c.elong < 3) out.push({ type: "bath_combined", conf: 0.3, why: `мале приміщення (${Math.round(c.share * 100)} % площі) без вікна — санвузол, туалет або комора` });
    if (c.windows && c.share >= 0.12 && !c.glazing) out.push({ type: "living", conf: 0.25, why: `має вікно (${c.windows}), велике (${Math.round(c.share * 100)} % площі) — житлова кімната або кухня` });
    return out.sort((a, b) => b.conf - a.conf)[0] || null;
  }
  // семантичні суперечності за типами (попередження, не помилки): житлова/кухня без вікна, дві кухні, немає санвузла тощо
  function semanticChecks(plan) {
    const out = [], R = plan.rooms.filter(r => r.type && r.type !== "unknown"); if (!R.length) return out;
    const info = K ? K.ROOMS : {}, chk = id => (K ? K.CHECKS.find(c => c.id === id) : { text: id }).text;
    for (const r of R) { const k = info[r.type]; if (!k) continue; const c = roomContext(plan, r);
      if ((k.habitable || r.type === "kitchen" || r.type === "kitchen_living") && !c.windows && !c.glazing) out.push({ level: "warn", code: "habitable_light", text: `«${r.name}»: ${chk("habitable_light")}`, ref: r.id });
      if (k.outdoor && !c.ext) out.push({ level: "warn", code: "outdoor_inside", text: `«${r.name}»: ${chk("outdoor_inside")}`, ref: r.id });
      if (plan.scaleOk && k.area && (r.area < k.area[0] * 0.7 || r.area > k.area[1] * 1.3)) out.push({ level: "warn", code: "area_range", text: `«${r.name}» ${String(r.area).replace(".", ",")} м²: ${chk("area_range")} (типово ${k.area[0]}–${k.area[1]} м²)`, ref: r.id }); }
    if (R.filter(r => r.type === "kitchen" || r.type === "kitchen_living").length > 1) out.push({ level: "warn", code: "kitchen_count", text: chk("kitchen_count") });
    if (R.length >= 3 && !R.some(r => ["bath_combined", "bathroom", "wc"].includes(r.type))) out.push({ level: "warn", code: "no_sanitary", text: chk("no_sanitary") });
    return out;
  }
  // ---------- AI-пропозиція: перевірка структури відповіді ----------
  // AI отримує план із пронумерованими областями 1…n і повертає JSON. Тут — сувора перевірка: невідомі поля відкидаються,
  // типи — лише з переліку, номери — лише існуючих областей, координати — частки зображення 0…1. Нічого не застосовується автоматично
  function checkAI(j, n) {
    const errs = [], num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
    if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, errs: ["відповідь не є JSON-об'єктом"] };
    const types = new Set(ROOM_TYPES.map(t => t[0])), apt = new Set(APT_TYPES.map(t => t[0]));
    const out = { apartmentType: apt.has(j.apartmentType) ? j.apartmentType : "unknown", apartmentTypeConfidence: num(j.apartmentTypeConfidence, 0, 1) ? j.apartmentTypeConfidence : 0, rooms: [], missing: [], warnings: [] };
    if (j.apartmentType && !apt.has(j.apartmentType)) errs.push(`невідомий тип квартири «${String(j.apartmentType).slice(0, 30)}»`);
    const seen = new Set();
    for (const r of Array.isArray(j.rooms) ? j.rooms.slice(0, 80) : []) {
      if (!r || typeof r !== "object") continue;
      const type = types.has(r.type) ? r.type : "unknown"; if (r.type && !types.has(r.type)) errs.push(`невідомий тип приміщення «${String(r.type).slice(0, 30)}»`);
      // пояснення й докази (обладнання з переліку бази знань) — щоб припущення AI не видавалось за факт
      const fx = K ? new Set(Object.keys(K.FIXTURES)) : new Set();
      const base = { name: typeof r.name === "string" ? r.name.trim().slice(0, 60) : "", type, confidence: num(r.confidence, 0, 1) ? r.confidence : 0.5, labelArea: num(r.labelArea, 0.3, 500) ? r.labelArea : null,
        reason: typeof r.reason === "string" ? r.reason.trim().slice(0, 240) : "", evidence: (Array.isArray(r.evidence) ? r.evidence : []).filter(v => fx.has(v)).slice(0, 8), windows: Number.isInteger(r.windows) && r.windows >= 0 && r.windows < 20 ? r.windows : null, doors: Number.isInteger(r.doors) && r.doors >= 0 && r.doors < 20 ? r.doors : null };
      if (Number.isInteger(r.areaId)) {
        if (r.areaId < 1 || r.areaId > n || seen.has(r.areaId)) { errs.push(`область ${r.areaId} не існує або повторюється`); continue; }
        seen.add(r.areaId);
        const merge = (Array.isArray(r.mergeWith) ? r.mergeWith : []).filter(v => Number.isInteger(v) && v >= 1 && v <= n && v !== r.areaId).slice(0, 6);
        out.rooms.push(Object.assign(base, { areaId: r.areaId, notRoom: r.notRoom === true, mergeWith: merge }));
      } else if (num(r.x, 0, 1) && num(r.y, 0, 1)) out.missing.push(Object.assign(base, { x: r.x, y: r.y }));
    }
    for (const w of Array.isArray(j.warnings) ? j.warnings.slice(0, 10) : []) if (typeof w === "string") out.warnings.push(w.slice(0, 200));
    return { ok: true, errs, p: out };
  }
  // масштаб за площами з підписів: кожна підписана кімната дає коефіцієнт √(S_підпис / S_план); приймаємо, лише якщо
  // щонайменше дві кімнати погоджуються в межах 8% (геометрична перевірка, а не віра AI на слово)
  function scaleFromLabels(pairs) {
    const r = pairs.filter(p => p.label > 0 && p.area > 0).map(p => Object.assign({ f: Math.sqrt(p.label / p.area) }, p)); if (r.length < 2) return null;
    let best = []; for (const a of r) { const g = r.filter(b => Math.abs(b.f / a.f - 1) <= 0.08); if (g.length > best.length) best = g; }
    if (best.length < 2) return { ok: false, n: r.length };
    const f = best.map(b => b.f).sort((a, b) => a - b)[Math.floor(best.length / 2)], spread = Math.max(...best.map(b => Math.abs(b.f / f - 1)));
    return { ok: true, f, inliers: best, outliers: r.filter(x => !best.includes(x)), spread };
  }
  const kindName = o => o.kind === "door" ? "Двері" : o.kind === "window" ? "Вікно" : "Проріз";
  function distToSeg(p, w) { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / L2)); return Math.hypot(p[0] - w.a[0] - t * dx, p[1] - w.a[1] - t * dy); }

  // ---------- площі ----------
  function stats(plan) {
    const floor = plan.rooms.reduce((s, r) => s + r.area, 0);
    // площа стін: довжина × висота мінус прорізи (одна сторона)
    let walls = 0; for (const w of plan.walls) { const ops = plan.openings.filter(o => o.wall === w.id).reduce((s, o) => s + o.width * (o.kind === "window" ? o.height : Math.min(o.height, plan.H)), 0); walls += (len(w) * plan.H - ops) / 1e6; }
    return { floor: +floor.toFixed(2), walls: +walls.toFixed(2), rooms: plan.rooms.length, wallsN: plan.walls.length, doors: plan.openings.filter(o => o.kind === "door").length, windows: plan.openings.filter(o => o.kind === "window").length };
  }

  // ---------- DXF (ASCII): LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, CIRCLE, ELLIPSE, SPLINE, INSERT (блоки, вкладені блоки) ----------
  // одиниці — з $INSUNITS (4 = мм, 5 = см, 6 = м, 1 = дюйми). Paper Space і невидимі елементи пропускаються; TEXT, MTEXT, DIMENSION, HATCH не є геометрією стін.
  // Шари: елемент блока на шарі 0 успадковує шар вставки; вставка на замороженому шарі ховає весь блок. Вимкнені й заморожені шари за замовчуванням пропускаються
  // (opts.includeHidden лишає їх геометрію з міткою шару — для вибору шарів у майстрі). Повертає відрізки й дуги в одиницях креслення, segL/arcL — індекси в layers.
  const UNIT = { 0: null, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };
  const DXF_MAX_SEGS = 2000000, DXF_MAX_DEPTH = 16, DXF_TYPES = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "VERTEX", "ARC", "CIRCLE", "ELLIPSE", "SPLINE", "INSERT"]);
  const mMul = (A, B) => !A ? B : !B ? A : [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const mPt = (M, x, y) => M ? [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]] : [x, y];
  const OCS_FLIP = [-1, 0, 0, 1, 0, 0];   // нормаль (0,0,−1): у світових координатах x дзеркальний
  const dxfDecode = s => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  // точки дуги опуклості (bulge) між двома вершинами, без першої вершини
  function bulgePts(x0, y0, x1, y1, b) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy); if (!d || Math.abs(b) < 1e-9) return [[x1, y1]];
    const h = d / 2 * (1 - b * b) / (2 * b), cx = (x0 + x1) / 2 - h * dy / d, cy = (y0 + y1) / 2 + h * dx / d, r = Math.hypot(x0 - cx, y0 - cy), a0 = Math.atan2(y0 - cy, x0 - cx), sw = 4 * Math.atan(b), n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 18))), out = [];
    for (let k = 1; k < n; k++) { const t = a0 + sw * k / n; out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    out.push([x1, y1]); return out;
  }
  // B-сплайн за контрольними точками (де Бур, раціональний за наявності ваг); без коректних вузлів — ламана через точки
  function splinePts(e) {
    const P = e.x.map((x, i) => [x, e.y[i]]), F = e.x2.map((x, i) => [x, e.y2[i]]), deg = +e.g[71] || 3, K = e.k, W = e.w, n = P.length;
    if (n < 2 || K.length !== n + deg + 1) return F.length >= 2 ? F : P;
    const t0 = K[deg], t1 = K[n], N = Math.min(2000, Math.max(16, n * 8)), out = [];
    for (let s = 0; s <= N; s++) {
      const t = s === N ? t1 : t0 + (t1 - t0) * s / N; let sp = deg; while (sp < n - 1 && t >= K[sp + 1]) sp++;
      const d = []; for (let j = 0; j <= deg; j++) { const p = P[sp - deg + j], w = W.length === n ? W[sp - deg + j] : 1; d.push([p[0] * w, p[1] * w, w]); }
      for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) { const i = sp - deg + j, den = K[i + deg - r + 1] - K[i], a = den ? (t - K[i]) / den : 0; for (let c = 0; c < 3; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c]; }
      const q = d[deg]; if (q[2]) out.push([q[0] / q[2], q[1] / q[2]]);
    }
    return out;
  }
  function parseDXF(text, opts = {}) {
    const L = text.split(/\r?\n/), segs = [], arcs = [], segL = [], arcL = [], layers = [], layerIx = new Map(), blocks = new Map();
    const res = { paperSkipped: 0, hiddenSkipped: 0, invisibleSkipped: 0, missingBlocks: 0, truncated: false, depthLimited: false };
    let units = null, sawSection = false;
    const layerOf = name => { const key = name.toUpperCase(); let i = layerIx.get(key); if (i == null) { i = layers.length; layers.push({ name, off: false, frozen: false, hidden: false, count: 0 }); layerIx.set(key, i); } return i; };
    // послідовність елементів до стоп-слова; POLYLINE збирає свої VERTEX
    const readEnts = (start, stop) => {
      const out = []; let e = null, poly = null, i = start;
      const finish = () => { if (e && e.type === "VERTEX") { if (poly) { poly.x.push(+e.g[10]); poly.y.push(+e.g[20]); poly.b.push(+e.g[42] || 0); } e = null; } };
      for (; i + 1 < L.length; i += 2) {
        const c = +L[i], v = L[i + 1].trim();
        if (c === 0) {
          finish();
          if (stop.has(v)) return { list: out, i };
          if (v === "SEQEND") { poly = null; e = null; continue; }
          if (!DXF_TYPES.has(v)) { e = null; if (v !== "ATTRIB") poly = null; continue; }
          e = { type: v, g: {}, layer: "0", paper: false, inv: false, x: [], y: [], b: [], x2: [], y2: [], k: [], w: [] };
          if (v === "VERTEX") continue;
          poly = v === "POLYLINE" ? e : null; out.push(e); continue;
        }
        if (!e) continue;
        if (c === 8) e.layer = dxfDecode(v);
        else if (c === 67) e.paper = +v === 1;
        else if (c === 60) e.inv = +v === 1;
        else if (e.type === "LWPOLYLINE" && c === 10) e.x.push(+v);
        else if (e.type === "LWPOLYLINE" && c === 20) e.y.push(+v);
        else if (e.type === "LWPOLYLINE" && c === 42) e.b[e.x.length - 1] = +v;
        else if (e.type === "SPLINE" && c === 10) e.x.push(+v);
        else if (e.type === "SPLINE" && c === 20) e.y.push(+v);
        else if (e.type === "SPLINE" && c === 11) e.x2.push(+v);
        else if (e.type === "SPLINE" && c === 21) e.y2.push(+v);
        else if (e.type === "SPLINE" && c === 40) e.k.push(+v);
        else if (e.type === "SPLINE" && c === 41) e.w.push(+v);
        else e.g[c] = v;
      }
      finish(); return { list: out, i };
    };
    // розбір за секціями
    let top = [];
    for (let i = 0; i + 1 < L.length; i += 2) {
      if (+L[i] !== 0 || L[i + 1].trim() !== "SECTION") continue;
      sawSection = true; i += 2; if (i + 1 >= L.length) break; const sec = L[i + 1].trim();
      if (sec === "ENTITIES") { const r = readEnts(i + 2, new Set(["ENDSEC", "EOF"])); top = top.concat(r.list); i = r.i; continue; }
      if (sec === "HEADER") { for (i += 2; i + 1 < L.length; i += 2) { const v = L[i + 1].trim(); if (+L[i] === 0 && v === "ENDSEC") break; if (+L[i] === 9 && v === "$INSUNITS" && +L[i + 2] === 70) units = UNIT[+L[i + 3]] || null; } continue; }
      if (sec === "TABLES") {
        for (i += 2; i + 1 < L.length; i += 2) {
          const v = L[i + 1].trim(); if (+L[i] !== 0) continue; if (v === "ENDSEC") break; if (v !== "LAYER") continue;
          let name = null, flags = 0, color = 1; for (let j = i + 2; j + 1 < L.length && +L[j] !== 0; j += 2) { const c = +L[j], w = L[j + 1].trim(); if (c === 2) name = dxfDecode(w); else if (c === 70) flags = +w; else if (c === 62) color = +w; }
          if (name != null) { const l = layers[layerOf(name)]; l.frozen = !!(flags & 1); l.off = color < 0; l.hidden = l.frozen || l.off; }
        }
        continue;
      }
      if (sec === "BLOCKS") {
        for (i += 2; i + 1 < L.length; i += 2) {
          const v = L[i + 1].trim(); if (+L[i] !== 0) continue; if (v === "ENDSEC") break; if (v !== "BLOCK") continue;
          let name = "", bx = 0, by = 0, j = i + 2; for (; j + 1 < L.length && +L[j] !== 0; j += 2) { const c = +L[j], w = L[j + 1].trim(); if (c === 2) name = w; else if (c === 10) bx = +w; else if (c === 20) by = +w; }
          const r = readEnts(j, new Set(["ENDBLK", "ENDSEC"])); if (name) blocks.set(name.toUpperCase(), { x: bx, y: by, list: r.list }); i = r.i - 2;
        }
        continue;
      }
    }
    if (!sawSection) top = readEnts(0, new Set(["ENDSEC", "EOF"])).list;   // фрагмент без секцій
    // перетворення елементів у відрізки й дуги
    const addSeg = (a, b, li) => { if (!isFinite(a[0] + a[1] + b[0] + b[1])) return; if (segs.length >= DXF_MAX_SEGS) { res.truncated = true; return; } segs.push([a[0], a[1], b[0], b[1]]); segL.push(li); layers[li].count++; };
    const addPath = (pts, M, li, closed) => { let prev = null, first = null; for (const p of pts) { const q = mPt(M, p[0], p[1]); if (prev) addSeg(prev, q, li); else first = q; prev = q; } if (closed && first && pts.length > 2) addSeg(prev, first, li); };
    const arcPath = (cx, cy, r, s0, s1) => { if (s1 < s0) s1 += 360; const n = Math.max(8, Math.ceil((s1 - s0) / 5)), out = []; for (let k = 0; k <= n; k++) { const t = (s0 + (s1 - s0) * k / n) * Math.PI / 180; out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return out; };
    const bulgePath = (x, y, b, closed) => { const n = x.length, out = []; if (!n) return out; out.push([x[0], y[0]]); for (let i = 1; i < n; i++) out.push(...bulgePts(x[i - 1], y[i - 1], x[i], y[i], b[i - 1] || 0)); if (closed && n >= 2 && Math.abs(b[n - 1] || 0) > 1e-9) { const end = bulgePts(x[n - 1], y[n - 1], x[0], y[0], b[n - 1]); end.pop(); out.push(...end); } return out; };
    const stack = new Set();
    const emit = (e, M, parentLi, forced, depth) => {
      if (res.truncated) return;
      if (e.paper) { res.paperSkipped++; return; }
      if (e.inv) { res.invisibleSkipped++; return; }
      const li = parentLi != null && (forced || e.layer === "0") ? parentLi : layerOf(e.layer), g = e.g, ext = +g[230] < 0 ? OCS_FLIP : null, MO = mMul(M, ext);
      // вставка на вимкненому (не замороженому) шарі: елементи блока на власних шарах лишаються видимими
      if (layers[li].hidden && !opts.includeHidden && !(e.type === "INSERT" && !layers[li].frozen)) { res.hiddenSkipped++; return; }
      if (e.type === "LINE") addSeg(mPt(M, +g[10], +g[20]), mPt(M, +g[11], +g[21]), li);
      else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
        if (e.type === "POLYLINE" && (+g[70] & 80)) return;   // сітки й багатогранники (3D) — не план
        const closed = !!(+g[70] & 1); addPath(bulgePath(e.x, e.y, e.b, closed), MO, li, closed);
      }
      else if (e.type === "ARC" || e.type === "CIRCLE") {
        const s0 = e.type === "ARC" ? +g[50] : 0, s1 = e.type === "ARC" ? +g[51] : 360;
        if (!MO) { if (isFinite(+g[10] + +g[20] + +g[40] + s0 + s1)) { arcs.push([+g[10], +g[20], +g[40], s0, s1]); arcL.push(li); layers[li].count++; } }
        else addPath(arcPath(+g[10], +g[20], +g[40], s0, s1), MO, li, false);
      }
      else if (e.type === "ELLIPSE") {
        const mx = +g[11], my = +g[21], ratio = +g[40] || 1, sgn = ext ? -1 : 1, a0 = g[41] != null ? +g[41] : 0; let a1 = g[42] != null ? +g[42] : 2 * Math.PI; if (a1 < a0) a1 += 2 * Math.PI;
        const n = Math.max(8, Math.ceil((a1 - a0) / (Math.PI / 32))), pts = []; for (let k = 0; k <= n; k++) { const t = a0 + (a1 - a0) * k / n, c = Math.cos(t), s = Math.sin(t) * ratio * sgn; pts.push([+g[10] + mx * c - my * s, +g[20] + my * c + mx * s]); }
        addPath(pts, M, li, false);
      }
      else if (e.type === "SPLINE") addPath(splinePts(e), M, li, !!(+g[70] & 1) && !e.k.length);
      else if (e.type === "INSERT") {
        const name = (g[2] || "").toUpperCase(), B = blocks.get(name); if (!B) { res.missingBlocks++; return; }
        if (depth >= DXF_MAX_DEPTH || stack.has(name)) { res.depthLimited = true; return; }
        const sx = g[41] != null ? +g[41] : 1, sy = g[42] != null ? +g[42] : 1, rot = (+g[50] || 0) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
        const cols = Math.max(1, +g[70] || 1), rows = Math.max(1, +g[71] || 1), dc = +g[44] || 0, dr = +g[45] || 0, frz = forced || layers[li].frozen;
        stack.add(name);
        for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
          // світ ← (батько · OCS) · зсув · поворот · зсув масиву · масштаб · (−базова точка блока)
          const ox = k * dc, oy = r * dr, T = [c * sx, s * sx, -s * sy, c * sy, +g[10] + c * ox - s * oy - (c * sx * B.x - s * sy * B.y), +g[20] + s * ox + c * oy - (s * sx * B.x + c * sy * B.y)], Mi = mMul(MO, T);
          for (const ch of B.list) emit(ch, Mi, li, frz, depth + 1);
        }
        stack.delete(name);
      }
    };
    for (const e of top) emit(e, null, null, false, 0);
    if (!segs.length && !arcs.length) {
      const why = res.paperSkipped && !res.hiddenSkipped ? " у Model Space: вони є лише в Paper Space" : res.hiddenSkipped ? ": усі елементи — на вимкнених або заморожених шарах" : "";
      throw new Error(`У DXF не знайдено ліній${why || " (LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE, ELLIPSE, SPLINE, INSERT)"}`);
    }
    return Object.assign(res, { segs, arcs, units, segL, arcL, layers });
  }
  // шари, що схожі на стіни, двері й вікна: лише пропозиція; informative = false, якщо жодна назва не вказує на стіни (тоді — усі видимі шари)
  const WALL_LAYER = /wall|стін|стен|перегор|partition|несуч|несущ|colum|колон/i, OPEN_LAYER = /door|двер|window|вікн|окн|окон|glaz|склін|остекл|opening|проріз|проем|проём/i;
  function suggestLayers(dxf) {
    const vis = dxf.layers.filter(l => !l.hidden && l.count > 0 && !/^RZ_/i.test(l.name)), walls = vis.filter(l => WALL_LAYER.test(l.name));
    if (!walls.length) return { names: vis.map(l => l.name), informative: false };
    return { names: vis.filter(l => WALL_LAYER.test(l.name) || OPEN_LAYER.test(l.name)).map(l => l.name), informative: true };
  }
  // растеризація DXF: Y догори → вниз; лише обрані шари (layers — список назв; без нього — усі видимі); довга сторона ≈ target пікселів
  function rasterDXF(dxf, target = 2000, unitMM, layers) {
    const u = unitMM || dxf.units || 1, known = !!(unitMM || dxf.units), info = dxf.layers || [], want = layers ? new Set(Array.from(layers, n => n.toUpperCase())) : null;
    const keep = li => { if (li == null || !info[li]) return !want; return want ? want.has(info[li].name.toUpperCase()) : !info[li].hidden; };
    const segL = dxf.segL || [], arcL = dxf.arcL || []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, used = 0;
    const box = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    dxf.segs.forEach((s, i) => { if (keep(segL[i])) { box(s[0], s[1]); box(s[2], s[3]); used++; } });
    dxf.arcs.forEach((a, i) => { if (keep(arcL[i])) { box(a[0] - a[2], a[1] - a[2]); box(a[0] + a[2], a[1] + a[2]); used++; } });
    if (!used) throw new Error("В обраних шарах немає ліній: оберіть інші шари");
    const span = Math.max(x1 - x0, y1 - y0) * u; if (!(span > 0) || !isFinite(span)) throw new Error("Лінії креслення мають нульовий розмір: оберіть інші шари");
    // одиниці відомі — не дрібніше 2 мм/px; невідомі — масштаб умовний, зображення завжди ≈ target пікселів
    const mmPerPx = known ? Math.max(2, span / target) : span / target, pad = 30;
    const W = Math.ceil((x1 - x0) * u / mmPerPx) + 2 * pad, H = Math.ceil((y1 - y0) * u / mmPerPx) + 2 * pad, g = new Uint8Array(W * H).fill(255);
    const P = (x, y) => [Math.round((x - x0) * u / mmPerPx) + pad, Math.round((y1 - y) * u / mmPerPx) + pad];
    const dot = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = 0; };
    const seg = (a, b) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))); for (let k = 0; k <= n; k++) dot(Math.round(a[0] + (b[0] - a[0]) * k / n), Math.round(a[1] + (b[1] - a[1]) * k / n)); };
    dxf.segs.forEach((s, i) => { if (keep(segL[i])) seg(P(s[0], s[1]), P(s[2], s[3])); });
    dxf.arcs.forEach((a, i) => { if (!keep(arcL[i])) return; let s0 = a[3], s1 = a[4]; if (s1 < s0) s1 += 360; const n = Math.max(8, Math.ceil(a[2] * u / mmPerPx * (s1 - s0) / 57)); let prev = null; for (let k = 0; k <= n; k++) { const t = (s0 + (s1 - s0) * k / n) * Math.PI / 180, p = P(a[0] + Math.cos(t) * a[2], a[1] + Math.sin(t) * a[2]); if (prev) seg(prev, p); prev = p; } });
    return { w: W, h: H, gray: g, mmPerPx, unitsKnown: known, x0, y1, pad, u };
  }
  // ---------- план ↔ DXF/DWG: шари RZ_* ----------
  // Стіна — полілінія з двох точок завтовшки як стіна; двері й вікна — смуга поверх стіни; службові поля — у XDATA (ROZSTAV). Геометрія читається назад саме з ліній,
  // тож правки в AutoCAD на цих шарах зберігаються. xf: X = ox + x·s, Y = oy − y·s (мм плану → одиниці креслення).
  const RZ = { walls: "RZ_WALLS", div: "RZ_DIVIDERS", door: "RZ_DOORS", win: "RZ_WINDOWS", swing: "RZ_DOOR_SWING", stairs: "RZ_STAIRS", rooms: "RZ_ROOMS", labels: "RZ_LABELS", areas: "RZ_AREAS", meta: "RZ_META" };
  const RZ_COLOR = { RZ_WALLS: 5, RZ_DIVIDERS: 3, RZ_DOORS: 30, RZ_WINDOWS: 4, RZ_DOOR_SWING: 30, RZ_STAIRS: 6, RZ_ROOMS: 3, RZ_LABELS: 7, RZ_AREAS: 8, RZ_META: -8 };
  const cadEsc = s => String(s).replace(/[\x00-\x1f]+/g, " ").replace(/[^\x20-\x7e]/g, c => "\\U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
  const cadNum = v => String(+(+v).toFixed(4));
  function planEntities(plan, xf) {
    const { s, ox, oy } = xf, X = p => [ox + p[0] * s, oy - p[1] * s], E = [], poly = (layer, pts, o = {}) => E.push(Object.assign({ kind: "poly", layer, pts: pts.map(X) }, o)), text = (layer, p, t, h, xd) => { const q = X(p); E.push({ kind: "text", layer, at: q, h: h * s, text: t, xd }); };
    text(RZ.meta, [0, 0], JSON.stringify({ v: 1, H: plan.H || 2700, apt: plan.aptType || null, u: +(1 / s).toFixed(6) }), 100);
    for (const v of plan.voids || []) text(RZ.meta, v, "void", 100);
    for (const w of plan.walls) {
      if (w.virtual) poly(RZ.div, [w.a, w.b], { xd: JSON.stringify({ id: w.id }) });
      else poly(RZ.walls, [w.a, w.b], { w: w.t * s, xd: JSON.stringify(Object.assign({ id: w.id, ext: w.ext ? 1 : 0 }, w.g ? { g: w.g } : {})) });
    }
    for (const o of plan.openings) {
      const w = plan.walls.find(v => v.id === o.wall); if (!w || w.virtual) continue;
      const L = len(w) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, a = [w.a[0] + ux * (o.at - o.width / 2), w.a[1] + uy * (o.at - o.width / 2)], b = [w.a[0] + ux * (o.at + o.width / 2), w.a[1] + uy * (o.at + o.width / 2)];
      poly(o.kind === "window" ? RZ.win : RZ.door, [a, b], { w: w.t * s, xd: JSON.stringify({ wall: w.id, k: o.kind, h: o.height, s: o.sill || 0, hi: o.hinge || "a", sw: o.swing || 1 }) });
      if (o.kind === "door") {   // полотно й дуга відкривання — лише для вигляду в CAD; назад не читаються
        const b1 = o.hinge === "b", hp = b1 ? b : a, sg = (o.swing || 1) * (b1 ? -1 : 1), nx = -uy * sg, ny = ux * sg, ex = b1 ? -ux : ux, ey = b1 ? -uy : uy, arc = [hp];
        for (let k = 8; k >= 0; k--) { const t = k / 8 * Math.PI / 2; arc.push([hp[0] + o.width * (Math.cos(t) * ex + Math.sin(t) * nx), hp[1] + o.width * (Math.cos(t) * ey + Math.sin(t) * ny)]); }
        poly(RZ.swing, arc);
      }
    }
    for (const q of plan.stairs || []) poly(RZ.stairs, [[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.l], [q.x, q.y + q.l]], { closed: true, xd: JSON.stringify({ d: q.dir, n: q.steps }) });
    for (const r of plan.rooms) {
      if (r.manual) poly(RZ.rooms, r.poly, { closed: true });
      const c = r.lp || r.poly.reduce((m, p) => [m[0] + p[0] / r.poly.length, m[1] + p[1] / r.poly.length], [0, 0]);
      text(RZ.labels, c, r.name, 180, JSON.stringify({ t: r.type || "unknown", u: r.user ? 1 : 0, m: r.mat || null }));
      if (plan.scaleOk) text(RZ.areas, [c[0], c[1] + 260], `${String(r.area).replace(".", ",")} м²`, 130);
    }
    return E;
  }
  const xdPairs = xd => xd ? [["1001", "ROZSTAV"], ["1000", xd]] : [];
  function entR12(e) {
    if (e.kind === "text") return [["0", "TEXT"], ["8", e.layer], ["10", cadNum(e.at[0])], ["20", cadNum(e.at[1])], ["30", "0"], ["40", cadNum(e.h)], ["1", cadEsc(e.text)], ...xdPairs(e.xd)];
    const out = [["0", "POLYLINE"], ["8", e.layer], ["66", "1"], ["10", "0"], ["20", "0"], ["30", "0"], ["70", e.closed ? "1" : "0"], ...(e.w ? [["40", cadNum(e.w)], ["41", cadNum(e.w)]] : []), ...xdPairs(e.xd)];
    for (const p of e.pts) out.push(["0", "VERTEX"], ["8", e.layer], ["10", cadNum(p[0])], ["20", cadNum(p[1])], ["30", "0"]);
    out.push(["0", "SEQEND"], ["8", e.layer]); return out;
  }
  const pairsText = P => P.map(p => p[0] + "\r\n" + p[1]).join("\r\n") + "\r\n";
  // новий файл у форматі R12: його надійно читає конвертер, а DWG отримує повну структуру сучасного формату. flat — вихідне креслення лініями, якщо вставити в оригінал неможливо
  function newCad(ents, insunits, flat) {
    const layers = new Map([["0", 7]]); for (const n of Object.values(RZ)) layers.set(n, RZ_COLOR[n]);
    const body = []; if (flat) { const nm = i => cadEsc(flat.layers[i] ? flat.layers[i].name : "0"); for (const l of flat.layers) if (l.count && !/^RZ_/i.test(l.name) && !layers.has(cadEsc(l.name))) layers.set(cadEsc(l.name), l.off ? -7 : 7);
      flat.segs.forEach((q, i) => { if (/^RZ_/i.test(nm(flat.segL[i]))) return; body.push(["0", "LINE"], ["8", nm(flat.segL[i])], ["10", cadNum(q[0])], ["20", cadNum(q[1])], ["30", "0"], ["11", cadNum(q[2])], ["21", cadNum(q[3])], ["31", "0"]); });
      flat.arcs.forEach((a, i) => { body.push(["0", "ARC"], ["8", nm(flat.arcL[i])], ["10", cadNum(a[0])], ["20", cadNum(a[1])], ["30", "0"], ["40", cadNum(a[2])], ["50", cadNum(a[3])], ["51", cadNum(a[4])]); }); }
    return pairsText([["0", "SECTION"], ["2", "HEADER"], ["9", "$ACADVER"], ["1", "AC1009"], ["9", "$INSUNITS"], ["70", String(insunits)], ["0", "ENDSEC"], ["0", "SECTION"], ["2", "TABLES"],
      ["0", "TABLE"], ["2", "LTYPE"], ["70", "1"], ["0", "LTYPE"], ["2", "CONTINUOUS"], ["70", "0"], ["3", "Solid"], ["72", "65"], ["73", "0"], ["40", "0.0"], ["0", "ENDTAB"],
      ["0", "TABLE"], ["2", "LAYER"], ["70", String(layers.size)], ...[...layers].flatMap(([n, c]) => [["0", "LAYER"], ["2", n], ["70", "0"], ["62", String(c)], ["6", "CONTINUOUS"]]), ["0", "ENDTAB"],
      ["0", "TABLE"], ["2", "APPID"], ["70", "1"], ["0", "APPID"], ["2", "ROZSTAV"], ["70", "0"], ["0", "ENDTAB"], ["0", "ENDSEC"], ["0", "SECTION"], ["2", "ENTITIES"], ...body, ...ents.flatMap(entR12), ["0", "ENDSEC"], ["0", "EOF"]]);
  }
  // вставка в наявний DXF сучасного формату: усе креслення лишається як є; попередні елементи RZ_* замінюються. null — якщо структура не дозволяє (старий або неповний файл)
  function insertCad(base, ents) {
    const L = base.split(/\r?\n/), P = []; for (let i = 0; i + 1 < L.length; i += 2) P.push([L[i], L[i + 1]]);
    const code = i => +P[i][0], val = i => P[i][1].trim(), find = (from, c, v) => { for (let i = from; i < P.length; i++) if (code(i) === c && val(i) === v) return i; return -1; };
    const table = name => { let i = 0; for (;;) { i = find(i, 0, "TABLE"); if (i < 0) return -1; if (val(i + 1) === name) return i; i++; } };
    const recs = (t, type) => { const out = []; for (let i = t + 1; i < P.length; i++) { if (code(i) !== 0) continue; if (val(i) === "ENDTAB") return { out, end: i }; if (val(i) === type) { let j = i + 1; while (j < P.length && code(j) !== 0) j++; out.push([i, j]); i = j - 1; } } return null; };
    const seed = P.findIndex(p => p[1].trim() === "$HANDSEED"), tL = table("LAYER"), tA = table("APPID"), tB = table("BLOCK_RECORD"), eI = find(0, 2, "ENTITIES"); if (seed < 0 || tL < 0 || tA < 0 || tB < 0 || eI < 0) return null;
    const rL = recs(tL, "LAYER"), rA = recs(tA, "APPID"), rB = recs(tB, "BLOCK_RECORD"), eEnd = find(eI, 0, "ENDSEC"); if (!rL || !rA || !rB || !rL.out.length || !rA.out.length || eEnd < 0) return null;
    let ms = null; for (const [a, b] of rB.out) { const seg = P.slice(a, b); if (seg.some(p => +p[0] === 2 && /^\*Model_Space$/i.test(p[1].trim()))) { const h = seg.find(p => +p[0] === 5); ms = h && h[1].trim(); } } if (!ms) return null;
    let h = parseInt(P[seed + 1][1].trim(), 16); if (!(h > 0)) return null; const H = () => (h++).toString(16).toUpperCase();
    const named = (r) => new Set(r.out.map(([a, b]) => { const n = P.slice(a, b).find(p => +p[0] === 2); return n ? n[1].trim().toUpperCase() : ""; }));
    const hasL = named(rL), hasA = named(rA), strip = seg => { const o = []; let inG = false; for (const p of seg) { const c = +p[0], v = p[1].trim(); if (c === 102 && v.startsWith("{")) { inG = true; continue; } if (c === 102 && v === "}") { inG = false; continue; } if (!inG) o.push(p); } return o; };
    const tplL = strip(P.slice(rL.out[0][0], rL.out[0][1])), tplA = strip(P.slice(rA.out[0][0], rA.out[0][1]));
    const newL = [], newA = []; let nL = 0, nA = 0;
    for (const n of Object.values(RZ)) if (!hasL.has(n)) { nL++; newL.push(...tplL.map(p => { const c = +p[0]; return c === 5 ? [p[0], H()] : c === 2 ? [p[0], n] : c === 62 ? [p[0], String(RZ_COLOR[n])] : c === 70 ? [p[0], "0"] : p; })); }
    if (!hasA.has("ROZSTAV")) { nA++; newA.push(...tplA.map(p => { const c = +p[0]; return c === 5 ? [p[0], H()] : c === 2 ? [p[0], "ROZSTAV"] : c === 70 ? [p[0], "0"] : p; })); }
    // елементи креслення, крім попередньої версії плану
    const kept = []; for (let i = eI + 1; i < eEnd;) { let j = i + 1; while (j < eEnd && code(j) !== 0) j++; const seg = P.slice(i, j); if (!seg.some(p => +p[0] === 8 && /^RZ_/i.test(p[1].trim()))) kept.push(...seg); i = j; }
    const mod = (e) => e.kind === "text" ? [["0", "TEXT"], ["5", H()], ["330", ms], ["100", "AcDbEntity"], ["8", e.layer], ["100", "AcDbText"], ["10", cadNum(e.at[0])], ["20", cadNum(e.at[1])], ["30", "0"], ["40", cadNum(e.h)], ["1", cadEsc(e.text)], ["100", "AcDbText"], ...xdPairs(e.xd)]
      : [["0", "LWPOLYLINE"], ["5", H()], ["330", ms], ["100", "AcDbEntity"], ["8", e.layer], ["100", "AcDbPolyline"], ["90", String(e.pts.length)], ["70", e.closed ? "1" : "0"], ...(e.w ? [["43", cadNum(e.w)]] : []), ...e.pts.flatMap(p => [["10", cadNum(p[0])], ["20", cadNum(p[1])]]), ...xdPairs(e.xd)];
    const add = ents.flatMap(mod), out = [...P.slice(0, rL.end), ...newL, ...P.slice(rL.end, rA.end), ...newA, ...P.slice(rA.end, eI + 1), ...kept, ...add, ...P.slice(eEnd)];
    const si = out.findIndex(p => p[1].trim() === "$HANDSEED"); out[si + 1] = [out[si + 1][0], h.toString(16).toUpperCase()];
    const bump = (name, n) => { if (!n) return; for (let i = 0; i < out.length - 6; i++) if (+out[i][0] === 0 && out[i][1].trim() === "TABLE" && out[i + 1][1].trim() === name) { for (let j = i + 2; j < i + 14; j++) if (+out[j][0] === 70) { out[j] = [out[j][0], String(+out[j][1] + n)]; return; } } };
    bump("LAYER", nL); bump("APPID", nA);
    return pairsText(out);
  }
  // план → текст DXF. opts: xf (типово мм), base — текст вихідного DXF, flat — розібране креслення як запасний варіант, insunits для нового файлу
  function planToDXF(plan, opts = {}) {
    const xf = opts.xf || { s: 1, ox: 0, oy: 0 }, ents = planEntities(plan, xf);
    if (opts.base) { const t = insertCad(opts.base, ents); if (t) return { text: t, mode: "base" }; }
    return { text: newCad(ents, opts.insunits != null ? opts.insunits : 4, opts.base ? opts.flat : null), mode: opts.base && opts.flat ? "flat" : "new" };
  }
  function readRz(text) {
    const L = text.split(/\r?\n/), out = []; let i = 0; for (; i + 1 < L.length; i += 2) if (+L[i] === 2 && L[i + 1].trim() === "ENTITIES") break; if (i + 1 >= L.length) return out;
    let e = null, poly = null;
    const done = () => { if (e && e.type === "VERTEX" && poly) { poly.x.push(+e.g[10]); poly.y.push(+e.g[20]); } };
    for (i += 2; i + 1 < L.length; i += 2) {
      const c = +L[i], v = L[i + 1].trim();
      if (c === 0) { done(); if (v === "ENDSEC") break; if (v === "SEQEND") { poly = null; e = null; continue; } e = { type: v, layer: "", x: [], y: [], g: {}, xd: "" }; if (v === "VERTEX") continue; poly = v === "POLYLINE" ? e : null; out.push(e); continue; }
      if (!e) continue;
      if (c === 8) e.layer = dxfDecode(v).toUpperCase(); else if (c === 1000) e.xd += v; else if (e.type === "LWPOLYLINE" && c === 10) e.x.push(+v); else if (e.type === "LWPOLYLINE" && c === 20) e.y.push(+v); else if (!(c in e.g)) e.g[c] = v;
    }
    return out.filter(q => q.layer.startsWith("RZ_"));
  }
  const rzJson = s => { try { return JSON.parse(s) || {}; } catch (e) { return {}; } };
  function planMeta(text) { for (const e of readRz(text)) if (e.layer === RZ.meta && e.type === "TEXT" && /^\{/.test(e.g[1] || "")) return rzJson(e.g[1]); return null; }
  // текст DXF → план. xf — те саме перетворення, що й під час побудови зображення; лише шари RZ_*, без розпізнавання
  function planFromDXF(text, xf) {
    const { s, ox, oy } = xf, M = (X, Y) => [+((X - ox) / s).toFixed(2), +((oy - Y) / s).toFixed(2)], list = readRz(text), meta = planMeta(text) || {};
    const ptsOf = e => { const p = []; if (e.type === "LINE") p.push(M(+e.g[10], +e.g[20]), M(+e.g[11], +e.g[21])); else for (let k = 0; k < e.x.length; k++) p.push(M(e.x[k], e.y[k])); return p; };
    const wOf = e => { const w = e.g[43] != null ? +e.g[43] : e.g[40] != null ? +e.g[40] : 0; return w > 0 ? w / s : 0; };
    const P = { mmPerPx: 1, scaleOk: true, H: +meta.H || 2700, aptType: meta.apt || null, walls: [], openings: [], rooms: [], stairs: [], voids: [] }, used = new Set(), labels = []; let lost = 0;
    const pid = x => { const id = x && !used.has(x) ? x : uid("p"); used.add(id); return id; };
    for (const e of list) if (e.layer === RZ.walls || e.layer === RZ.div) {
      const p = ptsOf(e), x = rzJson(e.xd), virt = e.layer === RZ.div;
      for (let k = 1; k < p.length; k++) P.walls.push(Object.assign({ id: pid(k === 1 ? x.id : null), a: p[k - 1], b: p[k], t: virt ? 0 : wOf(e) || 150, ext: !!x.ext, conf: 1, check: false }, virt ? { virtual: true } : {}, x.g ? { g: String(x.g) } : {}));
    }
    for (const e of list) {
      const x = rzJson(e.xd);
      if (e.layer === RZ.door || e.layer === RZ.win) {
        const p = ptsOf(e); if (p.length < 2) { lost++; continue; }
        const a = p[0], b = p[p.length - 1], c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], width = Math.hypot(b[0] - a[0], b[1] - a[1]), real = P.walls.filter(w => !w.virtual); let w = real.find(q => q.id === x.wall && distToSeg(c, q) < q.t + 200);
        if (!w) { let d = 400; for (const q of real) { const m = distToSeg(c, q); if (m < d) { d = m; w = q; } } } if (!w || !(width > 0)) { lost++; continue; }
        const L = len(w), ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, win = e.layer === RZ.win, at = (c[0] - w.a[0]) * ux + (c[1] - w.a[1]) * uy;
        P.openings.push({ id: uid("o"), wall: w.id, kind: x.k || (win ? "window" : "door"), at: +at.toFixed(2), width: +width.toFixed(2), height: +x.h || (win ? 1500 : 2050), sill: x.s != null ? +x.s : win ? 850 : 0, conf: 1, check: false, hinge: x.hi === "b" ? "b" : "a", swing: +x.sw || 1 });
      } else if (e.layer === RZ.stairs) {
        const p = ptsOf(e); if (p.length < 3) continue; const xs = p.map(q => q[0]), ys = p.map(q => q[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, l = Math.max(...ys) - y0;
        P.stairs.push({ id: uid("s"), x: x0, y: y0, w, l, dir: x.d === "x" ? "x" : l >= w ? "y" : "x", steps: +x.n || Math.max(3, Math.round(Math.max(w, l) / 280)) });
      } else if (e.layer === RZ.rooms) {
        const p = ptsOf(e); if (p.length >= 3) P.rooms.push({ id: uid("r"), name: "", type: "unknown", poly: p, manual: true, ok: true, conf: 1, check: false, area: +(area(p) / 1e6).toFixed(2) });
      } else if (e.layer === RZ.labels && e.type === "TEXT") labels.push({ p: M(+e.g[10], +e.g[20]), name: dxfDecode(e.g[1] || ""), x });
      else if (e.layer === RZ.meta && e.type === "TEXT" && e.g[1] === "void") P.voids.push(M(+e.g[10], +e.g[20]));
    }
    if (P.walls.length) { const B = P.walls.flatMap(w => [w.a, w.b]), real = P.walls.filter(w => !w.virtual), minT = real.length ? Math.min(...real.map(w => w.t)) : 150; let span = 0; { const xs = B.map(p => p[0]), ys = B.map(p => p[1]); span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); } rebuildRooms(P, Math.max(span / 2800, Math.min(10, minT / 10))); }
    for (const l of labels) { const r = P.rooms.find(q => inside(l.p, q.poly)); if (!r) continue; r.name = l.name || r.name; r.type = l.x.t || r.type; r.user = !!l.x.u; if (l.x.m) r.mat = l.x.m; r.ok = true; r.check = false; r.suspect = null; }
    // назви унікальні: кімната без підпису (наприклад, нова стіна в CAD поділила кімнату) отримує вільний номер
    const taken = new Set(labels.map(l => l.name)); let free = 0;
    for (const r of P.rooms) if (!r.user && !labels.some(l => inside(l.p, r.poly))) { let n; do { n = defaultName(r.type || "unknown", free++); } while (taken.has(n)); r.name = n; taken.add(n); }
    return { plan: P, lost, meta };
  }
  const api = Object.freeze({ ROOM_TYPES, APT_TYPES, TYPE_NAME, apartmentType, roomContext, semanticHint, semanticChecks, defaultName, wallsBetween, mergeRooms, checkAI, scaleFromLabels, offsetPoly, calibrate, suggestFromDoors, fromDetection, rebuildRooms, validate, stats, parseDXF, suggestLayers, rasterDXF, planToDXF, planFromDXF, planMeta, len, area, inside, distToSeg, uid, angleAt, circleThrough, arcPoints, smoothPath, corners, setCorner, groupWalls });
  if (typeof module === "object" && module.exports) module.exports = api; else root.RozstavPlanGeom = api;
})(typeof window !== "undefined" ? window : this);
