/*
  РОЗСТАВ — 2D Plan Editor: перевірка й виправлення розпізнаного плану на canvas.
  ------------------------------------------------------------
  Кольори накладок: стіни — синій, двері — помаранчевий, вікна — блакитний, контури кімнат — зелений, невизначене — червоний.
  Інструменти: select (вибір, перетягування кінців стін, стін, прорізів і вершин намальованих приміщень), wall (побудова стін за точками),
  divider (межа приміщень без стіни), room (приміщення за вершинами), merge (два кліки — об'єднати приміщення), door, window
  (клік по стіні), stairs (прямокутник), measure (вимірювання), calibrate (дві точки для масштабу).
  Прив'язки: до кінців стін, до осей інших стін, ортогональна (±6°), до сітки (крок grid мм, якщо увімкнено).
  Колесо — масштаб, права/середня кнопка або Пробіл — панорама. Del — видалити вибране, Ctrl+Z / Ctrl+Y — історія редактора.
  Модель — та сама, що в geom.js (мм). Після змін викликається onChange(reason): «walls» — потрібна перебудова кімнат.
*/
(function (root) {
  "use strict";
  const G = root.RozstavPlanGeom;
  const COL = { wall: "#2F6FE4", door: "#F08A24", window: "#2BB7D9", room: "#2E9E5B", bad: "#E0413A", sel: "#7B68EE", stair: "#9B59B6", meas: "#111827" };
  class PlanEditor {
    constructor(canvas, o) {
      this.cv = canvas; this.ctx = canvas.getContext("2d"); this.o = o || {};
      this.plan = null; this.img = null; this.imgK = 1; this.alpha = 0.55; this.tool = "select"; this.sel = null; this.grid = 0; this.dims = true; this.angleStep = 90; this.showAngles = false; this.angM = null;
      this.view = { s: 0.1, x: 0, y: 0 }; this.hist = []; this.hi = -1; this.tmp = null; this.drag = null; this.hover = null;
      const c = canvas;
      c.tabIndex = 0;
      c.style.touchAction = "none";
      const isT = e => { this._touch = e.pointerType === "touch"; return this._touch; };
      c.addEventListener("pointerdown", e => isT(e) ? this._tDown(e) : this._down(e)); c.addEventListener("pointermove", e => isT(e) ? this._tMove(e) : this._move(e)); c.addEventListener("pointerup", e => isT(e) ? this._tUp(e) : this._up(e));
      c.addEventListener("pointercancel", e => { if (isT(e)) this._tCancel(e); });
      c.addEventListener("wheel", e => { e.preventDefault(); const p = this._pt(e, true), k = Math.exp(-e.deltaY * 0.0015); this.view.s = Math.max(0.005, Math.min(3, this.view.s * k)); const q = this._pt(e, true); this.view.x += (q[0] - p[0]) * this.view.s; this.view.y += (q[1] - p[1]) * this.view.s; this.draw(); }, { passive: false });
      c.addEventListener("contextmenu", e => e.preventDefault());
      c.addEventListener("keydown", e => this._key(e));
      this._ro = new ResizeObserver(() => this.draw()); this._ro.observe(c);
    }
    // ---------- дані ----------
    load(plan, img, imgMM) { this.plan = plan; this.img = img || null; this.imgK = imgMM || 1; this.sel = null; this.hist = []; this.hi = -1; this.commit("load"); this.fit(); }
    commit(reason) { this.hist.splice(this.hi + 1); this.hist.push(JSON.stringify(this.plan)); if (this.hist.length > 100) this.hist.shift(); this.hi = this.hist.length - 1; if (reason !== "load" && this.o.onChange) this.o.onChange(reason); this.draw(); }
    undo() { if (this.hi > 0) { this.hi--; this._restore(); } }
    redo() { if (this.hi < this.hist.length - 1) { this.hi++; this._restore(); } }
    _restore() { const p = JSON.parse(this.hist[this.hi]); Object.keys(this.plan).forEach(k => delete this.plan[k]); Object.assign(this.plan, p); this.sel = null; if (this.o.onChange) this.o.onChange("history"); if (this.o.onSelect) this.o.onSelect(null); this.draw(); }
    setTool(t) { this.tool = t; this.tmp = null; this.typed = ""; this.hover = null; this.angM = null; this.cv.style.cursor = t === "select" ? "default" : t === "hand" ? "grab" : t === "erase" ? "pointer" : "crosshair"; this.draw(); }
    // масштаб кнопками: відносно середини полотна
    zoomBy(k) { const r = this.cv.getBoundingClientRect(), v = this.view, s = Math.max(0.005, Math.min(3, v.s * k)), cx = r.width / 2, cy = r.height / 2; this.view = { s, x: cx - (cx - v.x) / v.s * s, y: cy - (cy - v.y) / v.s * s }; this.draw(); }
    // очистити план одним кроком: скасовується через «Скасувати»
    clearAll() { const P = this.plan; if (!P) return; P.walls = []; P.openings = []; P.rooms = []; P.stairs = []; P.voids = []; this.tmp = null; this.measure = null; this.sel = null; this.commit("walls"); if (this.o.onSelect) this.o.onSelect(null); }
    select(s) { this.sel = s; if (this.o.onSelect) this.o.onSelect(s); this.draw(); }
    fit() {
      const P = this.plan, pts = P ? P.walls.flatMap(w => [w.a, w.b]) : [];
      let x0, y0, x1, y1;
      if (this.img) { x0 = 0; y0 = 0; x1 = this.img.width * this.imgK; y1 = this.img.height * this.imgK; }
      if (pts.length) { x0 = Math.min(x0 ?? Infinity, ...pts.map(p => p[0])); y0 = Math.min(y0 ?? Infinity, ...pts.map(p => p[1])); x1 = Math.max(x1 ?? -Infinity, ...pts.map(p => p[0])); y1 = Math.max(y1 ?? -Infinity, ...pts.map(p => p[1])); }
      if (x0 == null) { x0 = 0; y0 = 0; x1 = 12000; y1 = 9000; }   // порожній план без підкладки: робоче поле 12 × 9 м
      const r = this.cv.getBoundingClientRect(); if (!r.width) return; const s = Math.min((r.width - 40) / (x1 - x0 || 1), (r.height - 40) / (y1 - y0 || 1));
      this.view = { s, x: (r.width - (x1 - x0) * s) / 2 - x0 * s, y: (r.height - (y1 - y0) * s) / 2 - y0 * s }; this.draw();
    }
    // ---------- координати ----------
    _pt(e, raw) { const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left - this.view.x) / this.view.s, y = (e.clientY - r.top - this.view.y) / this.view.s; return raw ? [x, y] : this._snap([x, y], e); }
    _scr(p) { return [p[0] * this.view.s + this.view.x, p[1] * this.view.s + this.view.y]; }
    // прив'язки: кінці стін → осі стін → ортогональ від початкової точки → сітка
    _snap(p, e, from) {
      if (e && e.altKey) return p;
      const tol = (this._touch ? 18 : 12) / this.view.s, P = this.plan; let best = null;
      for (const w of P.walls) for (const q of [w.a, w.b]) { if (this.drag && this.drag.end && this.drag.w === w && q === w[this.drag.end]) continue; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < tol && (!best || d < best.d)) best = { d, p: [q[0], q[1]], kind: "end" }; }
      if (!best) for (const w of P.walls) { if (this.drag && this.drag.w === w) continue; const d = G.distToSeg(p, w); if (d < tol * 0.7) { const L = G.len(w) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, t0 = (p[0] - w.a[0]) * ux + (p[1] - w.a[1]) * uy, t = this.grid > 0 ? Math.round(t0 / this.grid) * this.grid : t0; best = { d, p: [w.a[0] + ux * t, w.a[1] + uy * t], kind: "wall" }; break; } }
      let q = best ? best.p : p.slice();
      const o = from || (this.tmp && this.tmp.a) || (this.drag && this.drag.end ? this.drag.w[this.drag.end === "a" ? "b" : "a"] : null);
      // кут до попередньої стіни: за замовчуванням 90°, можна задати інший; напрямок поза допуском 6° лишається вільним
      let rel = false;
      if (!best && o && this.tmp && this.tmp.dir != null && this.angleStep > 0) {
        const dx = q[0] - o[0], dy = q[1] - o[1], L = Math.hypot(dx, dy), cur = Math.atan2(dy, dx), turn = (180 - this.angleStep) * Math.PI / 180;
        if (L > 1) for (const c of [this.tmp.dir + turn, this.tmp.dir - turn, this.tmp.dir]) { let d = (cur - c) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(d) < 6 * Math.PI / 180) { const LL = this.grid > 0 ? Math.round(L / this.grid) * this.grid : L; q = [+(o[0] + LL * Math.cos(c)).toFixed(2), +(o[1] + LL * Math.sin(c)).toFixed(2)]; rel = true; break; } }
      }
      if (rel) { this.snapKind = null; return q; }
      if (!best && o) { const dx = q[0] - o[0], dy = q[1] - o[1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 90; if (ang < 6 || ang > 84) { if (Math.abs(dx) > Math.abs(dy)) q[1] = o[1]; else q[0] = o[0]; } }
      if (!best && this.grid > 0) q = q.map(v => Math.round(v / this.grid) * this.grid);
      this.snapKind = best ? best.kind : null; return q;
    }
    // ---------- пошук під курсором ----------
    _hit(p) {
      const P = this.plan, tol = (this._touch ? 18 : 8) / this.view.s;
      if (this.sel && this.sel.type === "wall") { const w = P.walls.find(v => v.id === this.sel.id); if (w && !w.g) for (const end of ["a", "b"]) if (Math.hypot(w[end][0] - p[0], w[end][1] - p[1]) < tol * 1.4) return { type: "end", w, end }; }
      if (this.sel && this.sel.type === "room") { const r = P.rooms.find(v => v.id === this.sel.id); if (r && r.manual) for (let i = 0; i < r.poly.length; i++) if (Math.hypot(r.poly[i][0] - p[0], r.poly[i][1] - p[1]) < tol * 1.4) return { type: "rvert", r, i }; }
      for (const o of P.openings) { const w = P.walls.find(v => v.id === o.wall); if (!w) continue; const c = this._opPts(o, w); if (G.distToSeg(p, { a: c[0], b: c[1] }) < Math.max(tol, w.t / 2)) return { type: "opening", id: o.id }; }
      for (const s of P.stairs || []) if (p[0] >= s.x && p[0] <= s.x + s.w && p[1] >= s.y && p[1] <= s.y + s.l) return { type: "stair", id: s.id };
      let bw = null; for (const w of P.walls) { const d = G.distToSeg(p, w); if (d < Math.max(tol, w.t / 2 + 2) && (!bw || d < bw.d)) bw = { d, w }; } if (bw) return { type: "wall", id: bw.w.id };
      for (const r of P.rooms) if (G.inside(p, r.poly)) return { type: "room", id: r.id };
      return null;
    }
    _opPts(o, w) { const L = G.len(w) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, s = o.at - o.width / 2, e = o.at + o.width / 2; return [[w.a[0] + ux * s, w.a[1] + uy * s], [w.a[0] + ux * e, w.a[1] + uy * e], ux, uy]; }
    // ---------- миша ----------
    _down(e) {
      this.cv.focus(); const P = this.plan; if (!P) return;
      if (e.button === 1 || e.button === 2 || this._space) { this.drag = { pan: true, x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; this.cv.setPointerCapture(e.pointerId); return; }
      if (this.tool === "hand") { this.drag = { pan: true, x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; this.cv.setPointerCapture(e.pointerId); return; }
      if (this.tool === "erase") { if (this.sel) this.select(null); this.drag = { erase: true, first: true, moved: false, kinds: new Set() }; this.cv.setPointerCapture(e.pointerId); this._eraseAt(e); this.drag.first = false; return; }
      const p = this._pt(e);
      // прямокутна кімната: протягнути або клацнути два протилежні кути
      if (this.tool === "rect") { if (!this.tmp) { this.tmp = { a: p, b: p, rect: true }; this.cv.setPointerCapture(e.pointerId); return; } this._placeRect(this.tmp.a, p); return; }
      // дуга: початок, кінець, потім точка, через яку вона проходить
      if (this.tool === "arc") {
        if (!this.tmp) { this.tmp = { arc: [p], b: p }; return; }
        if (this.tmp.arc.length === 1) { if (Math.hypot(p[0] - this.tmp.arc[0][0], p[1] - this.tmp.arc[0][1]) < 200) { if (this.o.onHint) this.o.onHint("Кінець дуги — щонайменше за 200 мм від початку"); return; } this.tmp.arc.push(p); this.tmp.b = p; this.draw(); return; }
        this._placeArc(this.tmp.arc[0], this.tmp.arc[1], this._pt(e, true)); return;
      }
      // стіна від руки: ведіть затиснувши, лінія згладжується після відпускання
      if (this.tool === "free") { this.tmp = { free: [p], b: p }; this.cv.setPointerCapture(e.pointerId); return; }
      // кут: клацання біля стику стін вибирає цей кут (його можна виставити), інакше — вимір за трьома точками: промінь, вершина, промінь
      if (this.tool === "angle") {
        if (!this.tmp) { const c = this._cornerAt(this._pt(e, true)); if (c) { this.angM = null; this.select({ type: "corner", p: c.p.slice() }); return; } if (this.sel) this.select(null); this.angM = null; this.tmp = { ang: [p], b: p }; this.draw(); return; }
        const A = this.tmp.ang; A.push(p); this.tmp.b = p;
        if (A.length === 3) { this.angM = { a: A[0], v: A[1], b: A[2], deg: G.angleAt(A[0], A[1], A[2]) }; this.tmp = null; if (this.o.onHint) this.o.onHint(`Кут: ${this.angM.deg.toFixed(1).replace(".", ",")}°`); }
        this.draw(); return;
      }
      if (this.tool === "wall" || this.tool === "divider") {
        if (!this.tmp) { this.tmp = { a: p, b: p, dir: this._dirAt(p) }; return; }
        this._placeWall(this.tmp.a, this._snap(this._pt(e, true), e, this.tmp.a)); return;
      }
      // приміщення за вершинами: клік — вершина; клік біля першої вершини, подвійний клік або Enter — замкнути
      if (this.tool === "room") {
        if (!this.tmp || !this.tmp.poly) { this.tmp = { poly: [p], b: p }; return; }
        const q = this.tmp.poly, f = q[0], close = q.length >= 3 && (Math.hypot(p[0] - f[0], p[1] - f[1]) * this.view.s < (this._touch ? 24 : 12) || e.detail >= 2);
        if (!close) { if (Math.hypot(p[0] - q[q.length - 1][0], p[1] - q[q.length - 1][1]) * this.view.s > 4) q.push(p); this.draw(); return; }
        this.tmp = null; this._addRoom(q); return;
      }
      if (this.tool === "merge") {
        const h = this._hit(this._pt(e, true)), r = h && h.type === "room" ? h.id : null;
        if (!r) { if (this.o.onHint) this.o.onHint("Клацніть усередині приміщення"); return; }
        if (!this.mergeA) { this.mergeA = r; this.select({ type: "room", id: r }); if (this.o.onHint) this.o.onHint("Тепер клацніть сусіднє приміщення, з яким об'єднати"); return; }
        const a = this.mergeA; this.mergeA = null; this.setTool("select"); if (this.o.onMerge) this.o.onMerge(a, r); return;
      }
      if (this.tool === "door" || this.tool === "window") {
        const h = this._hit(this._pt(e, true)); const w = h && h.type === "wall" ? P.walls.find(v => v.id === h.id) : null;
        if (!w || w.virtual) { if (this.o.onHint) this.o.onHint(w ? "Межа приміщень — не стіна: двері чи вікно в ній неможливі" : "Клацніть по стіні, щоб додати " + (this.tool === "door" ? "двері" : "вікно")); return; }
        if (w.g) { if (this.o.onHint) this.o.onHint("У кривій стіні прорізів поки немає: поставте двері чи вікно на прямій стіні"); return; }
        const L = G.len(w), q = this._pt(e, true), ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, at = Math.max(0, Math.min(L, (q[0] - w.a[0]) * ux + (q[1] - w.a[1]) * uy)), win = this.tool === "window", width = Math.min(win ? 1400 : 850, L - 100);
        const o = { id: G.uid("o"), wall: w.id, kind: this.tool, at: Math.max(width / 2, Math.min(L - width / 2, at)), width, height: win ? 1500 : 2050, sill: win ? 850 : 0, conf: 1, check: false, hinge: "a", swing: 1 };
        P.openings.push(o); this.commit("walls"); this.select({ type: "opening", id: o.id }); return;
      }
      if (this.tool === "measure" || this.tool === "calibrate") {
        if (!this.tmp) { this.tmp = { a: p, b: p }; return; }
        const r = { a: this.tmp.a, b: p, mm: Math.hypot(p[0] - this.tmp.a[0], p[1] - this.tmp.a[1]) }; this.measure = r; this.tmp = null;
        if (this.tool === "calibrate" && this.o.onCalibrate) this.o.onCalibrate(r); else if (this.o.onMeasure) this.o.onMeasure(r);
        this.draw(); return;
      }
      if (this.tool === "stairs") { this.tmp = { a: p, b: p, stairs: true }; this.cv.setPointerCapture(e.pointerId); return; }
      const h = this._hit(this._pt(e, true));
      if (h && h.type === "end") { this.drag = { end: h.end, w: h.w, moved: false }; this.cv.setPointerCapture(e.pointerId); return; }
      if (h && h.type === "rvert") { this.drag = { rv: h.r, i: h.i, moved: false }; this.cv.setPointerCapture(e.pointerId); return; }
      this.select(h && h.type !== "end" ? { type: h.type, id: h.id } : null);
      if (h && (h.type === "wall" || h.type === "opening" || h.type === "stair")) { this.drag = { type: h.type, id: h.id, from: this._pt(e, true), snap0: JSON.stringify(P), moved: false }; this.cv.setPointerCapture(e.pointerId); }
    }
    _placeWall(a, b) {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 50) return;
      const t = this.tool === "divider" ? 0 : this.o.defaultT ? this.o.defaultT() : 120;
      this.plan.walls.push(Object.assign({ id: G.uid("p"), a, b, t, ext: false, conf: 1, check: false }, this.tool === "divider" ? { virtual: true } : {})); this.tmp = { a: b, b, dir: Math.atan2(b[1] - a[1], b[0] - a[0]) }; this.typed = ""; this.commit("walls");   // ланцюжок: наступна стіна починається з кінця попередньої
    }
    // напрямок руху вздовж стіни, що закінчується в точці p (щоб нова стіна будувалась під кутом до неї)
    _dirAt(p) { for (const w of this.plan.walls) { if (w.virtual) continue; if (Math.hypot(w.b[0] - p[0], w.b[1] - p[1]) < 2) return Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]); if (Math.hypot(w.a[0] - p[0], w.a[1] - p[1]) < 2) return Math.atan2(w.a[1] - w.b[1], w.a[0] - w.b[0]); } return null; }
    _cornerAt(p) { const tol = (this._touch ? 24 : 14) / this.view.s; let best = null; for (const c of G.corners(this.plan)) { const d = Math.hypot(c.p[0] - p[0], c.p[1] - p[1]); if (d < tol && (!best || d < best.d)) best = { d, c }; } return best && best.c; }
    // ланцюжок сегментів зі спільним g: виділяється, рухається й стирається цілком
    _placeCurve(pts, prefix) {
      const g = G.uid(prefix), t = this.o.defaultT ? this.o.defaultT() : 120;
      for (let i = 1; i < pts.length; i++) this.plan.walls.push({ id: G.uid("p"), a: pts[i - 1], b: pts[i], t, ext: false, conf: 1, check: false, g });
      this.tmp = null; this.commit("walls");
    }
    _placeArc(a, b, m) {
      const pts = G.arcPoints(a, m, b);
      if (!pts) { this.tmp = null; if (this.o.onHint) this.o.onHint("Дуга не вийшла: третя точка майже на прямій між двома іншими"); this.draw(); return; }
      this._placeCurve(pts, "arc");
    }
    _placeFree(raw) {
      this.tmp = null;
      const L = raw.reduce((s, p, i) => i ? s + Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) : 0, 0);
      if (L < 200) { this.draw(); return; }
      const pts = G.smoothPath(raw, Math.max(20, 4 / this.view.s));
      if (pts.length < 2) { this.draw(); return; }
      if (pts.length === 2) { this.plan.walls.push({ id: G.uid("p"), a: pts[0], b: pts[1], t: this.o.defaultT ? this.o.defaultT() : 120, ext: false, conf: 1, check: false }); this.commit("walls"); return; }
      this._placeCurve(pts, "fr");
    }
    _placeRect(a, b) {
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); this.tmp = null;
      if (x1 - x0 < 300 || y1 - y0 < 300) { if (this.o.onHint) this.o.onHint("Прямокутник: кожна сторона щонайменше 300 мм"); this.draw(); return; }
      const t = this.o.defaultT ? this.o.defaultT() : 120, c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      for (let i = 0; i < 4; i++) this.plan.walls.push({ id: G.uid("p"), a: c[i].slice(), b: c[(i + 1) % 4].slice(), t, ext: false, conf: 1, check: false });
      this.commit("walls");
    }
    // ластик: стирає те, що під курсором. Весь рух до відпускання — один крок скасування.
    // Знайдене за стінами приміщення не стирається: воно зникає разом зі своїми стінами.
    _eraseAt(e) {
      const h = this._hit(this._pt(e, true)), d = this.drag, P = this.plan; if (!h) return;
      if (h.type === "wall") { const ids = new Set(G.groupWalls(P, P.walls.find(w => w.id === h.id)).map(w => w.id)); P.walls = P.walls.filter(w => !ids.has(w.id)); P.openings = P.openings.filter(o => !ids.has(o.wall)); d.kinds.add("walls"); }
      else if (h.type === "opening") { P.openings = P.openings.filter(o => o.id !== h.id); d.kinds.add("openings"); }
      else if (h.type === "stair") { P.stairs = P.stairs.filter(s => s.id !== h.id); d.kinds.add("stairs"); }
      else if (h.type === "room") {
        if (!d.first) return;
        const r = P.rooms.find(v => v.id === h.id);
        if (!r || !r.manual) { if (this.o.onHint) this.o.onHint("Щоб прибрати кімнату, зітріть її стіни"); return; }
        P.rooms = P.rooms.filter(v => v !== r); d.kinds.add("walls");
      } else return;
      d.moved = true; this.hover = null; this.draw();
    }
    // точна довжина під час побудови: цифри + Enter ставлять кінець стіни на цій відстані в напрямку курсора
    _typeLen(e) {
      if (!(this.tool === "wall" || this.tool === "divider") || !this.tmp || !this.tmp.a) return false;
      if (/^[0-9]$/.test(e.key)) { if ((this.typed || "").length < 6) this.typed = (this.typed || "") + e.key; }
      else if (e.key === "Backspace" && this.typed) this.typed = this.typed.slice(0, -1);
      else if (e.key === "Enter" && this.typed) {
        const a = this.tmp.a, b = this.tmp.b, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d < 1) { if (this.o.onHint) this.o.onHint("Поведіть мишею в напрямку стіни, тоді натисніть Enter"); return true; }
        const L = +this.typed; if (L < 50) { if (this.o.onHint) this.o.onHint("Довжина стіни — щонайменше 50 мм"); return true; }
        this._placeWall(a, [a[0] + (b[0] - a[0]) / d * L, a[1] + (b[1] - a[1]) / d * L]); return true;
      }
      else return false;
      this.draw(); return true;
    }
    _move(e) {
      const P = this.plan; if (!P) return;
      if (this.drag && this.drag.pan) { this.view.x = this.drag.vx + e.clientX - this.drag.x; this.view.y = this.drag.vy + e.clientY - this.drag.y; this.draw(); return; }
      if (this.drag && this.drag.erase) { this._eraseAt(e); return; }
      if (this.tmp && this.tmp.free) { const q = this._pt(e, true), l = this.tmp.free[this.tmp.free.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) * this.view.s >= 3) { this.tmp.free.push(q); this.draw(); } return; }
      if (this.tmp && this.tmp.arc && this.tmp.arc.length === 2) { this.tmp.b = this._pt(e, true); this.draw(); return; }
      if (this.tmp) { this.tmp.b = this.tool === "wall" || this.tool === "divider" ? this._snap(this._pt(e, true), e, this.tmp.a) : this._pt(e); this.draw(); return; }
      if (this.drag && this.drag.end) { const p = this._snap(this._pt(e, true), e); this.drag.w[this.drag.end] = p; this.drag.moved = true; this.draw(); return; }
      if (this.drag && this.drag.rv) { this.drag.rv.poly[this.drag.i] = this._snap(this._pt(e, true), e); this.drag.moved = true; this.draw(); return; }
      if (this.drag && this.drag.type) {
        const q = this._pt(e, true), dx = q[0] - this.drag.from[0], dy = q[1] - this.drag.from[1]; if (Math.hypot(dx, dy) * this.view.s < 3 && !this.drag.moved) return;
        const base = JSON.parse(this.drag.snap0); this.drag.moved = true;
        if (this.drag.type === "wall") for (const w of G.groupWalls(P, P.walls.find(v => v.id === this.drag.id))) { const b0 = base.walls.find(v => v.id === w.id); w.a = [b0.a[0] + dx, b0.a[1] + dy]; w.b = [b0.b[0] + dx, b0.b[1] + dy]; }
        if (this.drag.type === "opening") { const o = P.openings.find(v => v.id === this.drag.id), w = P.walls.find(v => v.id === o.wall), o0 = base.openings.find(v => v.id === o.id), L = G.len(w), ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L; o.at = Math.max(o.width / 2, Math.min(L - o.width / 2, o0.at + dx * ux + dy * uy)); }
        if (this.drag.type === "stair") { const s = P.stairs.find(v => v.id === this.drag.id), s0 = base.stairs.find(v => v.id === s.id); s.x = s0.x + dx; s.y = s0.y + dy; }
        this.draw(); return;
      }
      const h = this._hit(this._pt(e, true)); if ((h && h.id) !== (this.hover && this.hover.id)) { this.hover = h; this.draw(); }
    }
    _up(e) {
      const P = this.plan;
      if (this.tmp && this.tmp.stairs) { const a = this.tmp.a, b = this.tmp.b; this.tmp = null; const w = Math.abs(b[0] - a[0]), l = Math.abs(b[1] - a[1]); if (w > 300 && l > 600) { const s = { id: G.uid("s"), x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w, l, dir: l >= w ? "y" : "x", steps: Math.max(3, Math.round((l >= w ? l : w) / 280)) }; P.stairs = P.stairs || []; P.stairs.push(s); this.commit("stairs"); this.select({ type: "stair", id: s.id }); } this.draw(); return; }
      if (this.tmp && this.tmp.free) { const raw = this.tmp.free; if (raw.length > 1) { raw[0] = this._snap(raw[0], null, raw[0]); raw[raw.length - 1] = this._snap(raw[raw.length - 1], null, raw[raw.length - 1]); } this._placeFree(raw); return; }
      if (this.tmp && this.tmp.rect) { const a = this.tmp.a, b = this.tmp.b; if (Math.abs(b[0] - a[0]) >= 300 && Math.abs(b[1] - a[1]) >= 300) this._placeRect(a, b); return; }
      if (!this.drag) return; const d = this.drag; this.drag = null;
      if (d.pan) return;
      if (d.erase) { if (d.kinds.size) this.commit(d.kinds.has("walls") ? "walls" : d.kinds.has("openings") ? "openings" : "stairs"); return; }
      if (d.rv) { if (d.moved) { d.rv.area = +(G.area(d.rv.poly) / 1e6).toFixed(2); d.rv.lp = this._lp(d.rv.poly); this.commit("rooms"); } return; }
      if (d.moved) this.commit(d.type === "opening" || d.type === "stair" ? "openings" : "walls");
    }
    // ---------- дотик ----------
    // Дія пальця відкладається до першого руху або відпускання: другий палець за цей час означає щипок, а не нову точку на плані.
    _tDown(e) {
      if (!this.plan) return;
      const T = this._t || (this._t = { pts: new Map() });
      T.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { this.cv.setPointerCapture(e.pointerId); } catch (x) {}
      if (T.pts.size === 1) { Object.assign(T, { pend: e, click: false, band: false, dead: false, pinch: null }); return; }
      if (T.pts.size !== 2) return;
      this._tAbort(T);
      const [a, b] = [...T.pts.values()], r = this.cv.getBoundingClientRect();
      T.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, s: this.view.s, x: this.view.x, y: this.view.y };
    }
    _tMove(e) {
      const T = this._t; if (!T || !T.pts.has(e.pointerId)) return;
      T.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (T.pinch) {
        if (T.pts.size < 2) return;
        const [a, b] = [...T.pts.values()], r = this.cv.getBoundingClientRect(), p = T.pinch, s = Math.max(0.005, Math.min(3, p.s * Math.hypot(a.x - b.x, a.y - b.y) / p.d)), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        this.view = { s, x: mx - (p.mx - p.x) / p.s * s, y: my - (p.my - p.y) / p.s * s }; this.draw(); return;
      }
      if (T.dead) return;
      if (T.pend) {
        const d = T.pend; if (Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) < 8) return;
        T.pend = null;
        const t = this.tool;
        if (t === "wall" || t === "divider" || t === "measure" || t === "calibrate") { if (!this.tmp) { this._down(d); T.band = true; } T.click = true; }
        else if (t === "room" || t === "door" || t === "window" || t === "merge" || t === "arc" || t === "angle") { T.click = true; if (!this.tmp) return; }
        else if (t === "rect") { if (this.tmp) T.click = true; else { this._down(d); T.band = true; } }
        else if (t === "stairs" || t === "erase" || t === "hand" || t === "free") this._down(d);
        else { const h = this._hit(this._pt(d, true)); if (!h || h.type === "room") this.drag = { pan: true, x: d.clientX, y: d.clientY, vx: this.view.x, vy: this.view.y }; else this._down(d); }
      }
      if (!T.click || this.tmp) this._move(e);
    }
    _tUp(e) {
      const T = this._t; if (!T || !T.pts.has(e.pointerId)) return;
      T.pts.delete(e.pointerId);
      if (T.pinch || T.dead) { T.pinch = null; T.dead = T.pts.size > 0; return; }
      if (T.pend) {
        const d = T.pend, t = this.tool; T.pend = null;
        if (t === "select" || t === "stairs" || t === "erase" || t === "hand" || t === "free") { this._down(d); this._up(e); } else this._down(e);
        return;
      }
      if (T.click) { T.click = false; T.band = false; this._down(e); return; }
      this._up(e);
    }
    _tCancel(e) {
      const T = this._t; if (!T) return;
      T.pts.delete(e.pointerId); this._tAbort(T); T.pinch = null; T.dead = T.pts.size > 0;
    }
    // скасовує незавершену дію першого пальця: план лишається таким, яким був до дотику
    _tAbort(T) {
      T.pend = null; T.click = false;
      if (T.band || (this.tmp && (this.tmp.stairs || this.tmp.free))) this.tmp = null; else if (this.tmp && this.tmp.a) this.tmp.b = this.tmp.a;
      T.band = false;
      const d = this.drag; this.drag = null;
      if (d && d.moved) { const s = this.sel; this._restore(); this.sel = s; this.draw(); }
    }
    _key(e) {
      if (e.key === " ") { this._space = e.type === "keydown"; }
      if (e.type !== "keydown") return;
      if (!e.ctrlKey && !e.metaKey && this._typeLen(e)) { e.preventDefault(); e.stopPropagation(); return; }
      const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z", y = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"));
      if (y) { e.preventDefault(); e.stopPropagation(); this.redo(); return; }
      if (z) { e.preventDefault(); e.stopPropagation(); this.undo(); return; }
      if (e.key === "Enter" && this.tmp && this.tmp.poly && this.tmp.poly.length >= 3) { const q = this.tmp.poly; this.tmp = null; this._addRoom(q); return; }
      if (e.key === "Escape") { this.tmp = null; this.typed = ""; this.measure = null; this.angM = null; this.mergeA = null; if (this.tool !== "select") this.setTool("select"); else this.select(null); e.stopPropagation(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && this.sel) { e.preventDefault(); this.remove(this.sel); }
    }
    remove(s) {
      const P = this.plan;
      if (s.type === "wall") { const ids = new Set(G.groupWalls(P, P.walls.find(w => w.id === s.id)).map(w => w.id)); P.walls = P.walls.filter(w => !ids.has(w.id)); P.openings = P.openings.filter(o => !ids.has(o.wall)); this.select(null); this.commit("walls"); }
      if (s.type === "opening") { P.openings = P.openings.filter(o => o.id !== s.id); this.select(null); this.commit("openings"); }
      if (s.type === "stair") { P.stairs = P.stairs.filter(o => o.id !== s.id); this.select(null); this.commit("stairs"); }
      // приміщення: намальоване вручну — видаляємо; знайдене за стінами — позначаємо область «не приміщення» (стіни не чіпаємо)
      if (s.type === "room") { const r = P.rooms.find(v => v.id === s.id); if (!r) return; if (!r.manual) { P.voids = P.voids || []; P.voids.push(r.lp || this._lp(r.poly)); } P.rooms = P.rooms.filter(v => v !== r); this.select(null); this.commit("walls"); }
    }
    _addRoom(q) { const P = this.plan, n = P.rooms.length, r = { id: G.uid("r"), name: G.defaultName ? G.defaultName("unknown", n) : `Приміщення ${n + 1}`, type: "unknown", poly: q.map(p => p.slice()), manual: true, ok: true, conf: 1, check: false };
      r.area = +(G.area(r.poly) / 1e6).toFixed(2); r.lp = this._lp(r.poly);
      // позначка пропущеного приміщення (від AI) всередині нового контуру — беремо її тип і назву, позначку знімаємо
      const mk = (this.marks || []).find(m => G.inside(m.p, r.poly)); if (mk) { r.type = mk.type || "unknown"; if (mk.name) r.name = mk.name; this.marks = this.marks.filter(m => m !== mk); } P.rooms.push(r); this.setTool("select"); this.commit("rooms"); this.select({ type: "room", id: r.id }); }
    // точка підпису всередині багатокутника: центроїд, а якщо він зовні (Г-подібна форма) — найближча до нього внутрішня точка сітки
    _lp(poly) { const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]); if (G.inside(c, poly)) return c;
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); let best = null;
      for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) { const q = [x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * j / 20]; if (!G.inside(q, poly)) continue; const d = Math.hypot(q[0] - c[0], q[1] - c[1]); if (!best || d < best.d) best = { d, q }; }
      return best ? best.q : c; }
    // ---------- малювання ----------
    draw() {
      const c = this.cv, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; if (!r.width) return;
      if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
      const x = this.ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height); x.fillStyle = "#F7F7F5"; x.fillRect(0, 0, r.width, r.height);
      x.save(); x.translate(this.view.x, this.view.y); x.scale(this.view.s, this.view.s);
      if (this.img && this.alpha > 0 && !(this.overlay && this.overlay.show && this.overlay.show.img === false)) { x.globalAlpha = this.alpha; x.drawImage(this.img, 0, 0, this.img.width * this.imgK, this.img.height * this.imgK); x.globalAlpha = 1; }
      const P = this.plan; if (!P) { x.restore(); return; }
      const px = 1 / this.view.s;
      if (this.grid > 0) { x.strokeStyle = "rgba(0,0,0,.06)"; x.lineWidth = px; const g = this.grid * Math.max(1, Math.ceil(8 * px / this.grid)), X0 = -this.view.x / this.view.s, Y0 = -this.view.y / this.view.s, X1 = X0 + r.width * px, Y1 = Y0 + r.height * px; x.beginPath(); for (let v = Math.floor(X0 / g) * g; v < X1; v += g) { x.moveTo(v, Y0); x.lineTo(v, Y1); } for (let v = Math.floor(Y0 / g) * g; v < Y1; v += g) { x.moveTo(X0, v); x.lineTo(X1, v); } x.stroke(); }
      const isSel = (t, id) => this.sel && this.sel.type === t && this.sel.id === id;
      const selW = this.sel && this.sel.type === "wall" ? P.walls.find(v => v.id === this.sel.id) : null, selG = selW && selW.g, isSelW = w => isSel("wall", w.id) || (selG && w.g === selG);
      // кімнати: зелений контур, назва й площа
      const sh = (this.overlay && this.overlay.show) || {}, showW = sh.walls !== false, showO = sh.ops !== false, showR = sh.rooms !== false;
      for (const rm of showR ? P.rooms : []) { x.beginPath(); rm.poly.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fillStyle = isSel("room", rm.id) ? "rgba(46,158,91,.28)" : rm.check ? "rgba(224,65,58,.10)" : "rgba(46,158,91,.12)"; x.fill(); x.strokeStyle = rm.check ? COL.bad : COL.room; x.lineWidth = 2 * px; if (rm.suspect || rm.manual) x.setLineDash([6 * px, 4 * px]); x.stroke(); x.setLineDash([]);
        if (rm.manual && isSel("room", rm.id)) for (const q of rm.poly) { x.fillStyle = "#fff"; x.strokeStyle = COL.sel; x.lineWidth = 2 * px; x.beginPath(); x.arc(q[0], q[1], 5 * px, 0, Math.PI * 2); x.fill(); x.stroke(); } }
      // стіни: синій (невизначені — червоні), товщина в масштабі
      for (const w of showW ? P.walls : []) {
        // межа без стіни — зелений пунктир
        if (w.virtual) { x.strokeStyle = isSel("wall", w.id) ? COL.sel : COL.room; x.lineWidth = 3 * px; x.setLineDash([8 * px, 5 * px]); x.beginPath(); x.moveTo(w.a[0], w.a[1]); x.lineTo(w.b[0], w.b[1]); x.stroke(); x.setLineDash([]); continue; }
        const L = G.len(w) || 1, nx = -(w.b[1] - w.a[1]) / L * w.t / 2, ny = (w.b[0] - w.a[0]) / L * w.t / 2;
        x.beginPath(); x.moveTo(w.a[0] + nx, w.a[1] + ny); x.lineTo(w.b[0] + nx, w.b[1] + ny); x.lineTo(w.b[0] - nx, w.b[1] - ny); x.lineTo(w.a[0] - nx, w.a[1] - ny); x.closePath();
        x.fillStyle = w.check ? "rgba(224,65,58,.45)" : isSelW(w) ? "rgba(123,104,238,.65)" : w.ext ? "rgba(47,111,228,.6)" : "rgba(47,111,228,.4)"; x.fill();
        x.strokeStyle = isSelW(w) ? COL.sel : w.check ? COL.bad : COL.wall; x.lineWidth = (isSelW(w) ? 2.5 : 1.2) * px; x.stroke();
      }
      // прорізи: двері — помаранчеві з дугою відкривання, вікна — блакитні, невизначене — червоне
      for (const o of showO ? P.openings : []) {
        const w = P.walls.find(v => v.id === o.wall); if (!w) continue; const [a, b, ux, uy] = this._opPts(o, w);
        const col = o.check ? COL.bad : o.kind === "door" ? COL.door : o.kind === "window" ? COL.window : COL.bad;
        x.strokeStyle = isSel("opening", o.id) ? COL.sel : col; x.lineWidth = Math.max(4 * px, w.t * 0.9); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
        if (o.kind === "door") { const hp = o.hinge === "b" ? b : a, s = (o.swing || 1) * (o.hinge === "b" ? -1 : 1), nx = -uy * s, ny = ux * s, rr = o.width, a0 = Math.atan2(o.hinge === "b" ? -uy : uy, o.hinge === "b" ? -ux : ux); x.lineWidth = 1.5 * px; x.beginPath(); x.moveTo(hp[0], hp[1]); x.lineTo(hp[0] + nx * rr, hp[1] + ny * rr); x.stroke(); x.beginPath(); const a1 = Math.atan2(ny, nx); x.arc(hp[0], hp[1], rr, Math.min(a0, a1), Math.max(a0, a1)); x.stroke(); }
      }
      // сходи
      for (const s of P.stairs || []) { x.strokeStyle = isSel("stair", s.id) ? COL.sel : COL.stair; x.lineWidth = 2 * px; x.strokeRect(s.x, s.y, s.w, s.l); x.lineWidth = px; x.beginPath(); for (let k = 1; k < s.steps; k++) { if (s.dir === "y") { const y = s.y + s.l * k / s.steps; x.moveTo(s.x, y); x.lineTo(s.x + s.w, y); } else { const xx = s.x + s.w * k / s.steps; x.moveTo(xx, s.y); x.lineTo(xx, s.y + s.l); } } x.stroke(); }
      // кінці вибраної стіни — ручки
      if (this.sel && this.sel.type === "wall") { const w = P.walls.find(v => v.id === this.sel.id); if (w && !w.g) for (const q of [w.a, w.b]) { x.fillStyle = "#fff"; x.strokeStyle = COL.sel; x.lineWidth = 2 * px; x.beginPath(); x.arc(q[0], q[1], 6 * px, 0, Math.PI * 2); x.fill(); x.stroke(); } }
      // тимчасова стіна / вимірювання / сходи
      const line = (q, col) => { x.strokeStyle = col; x.lineWidth = 2 * px; x.setLineDash([6 * px, 4 * px]); x.beginPath(); q.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.stroke(); x.setLineDash([]); };
      if (this.tmp && this.tmp.poly) line([...this.tmp.poly, this.tmp.b], COL.room);
      else if (this.tmp && this.tmp.free) line(this.tmp.free, COL.wall);
      else if (this.tmp && this.tmp.arc) { const A = this.tmp.arc, q = A.length === 1 ? [A[0], this.tmp.b] : G.arcPoints(A[0], this.tmp.b, A[1]) || [A[0], A[1]]; line(q, COL.wall); }
      else if (this.tmp && this.tmp.ang) line([...this.tmp.ang, this.tmp.b], COL.meas);
      else if (this.tmp) { x.strokeStyle = this.tmp.stairs ? COL.stair : this.tool === "wall" || this.tmp.rect ? COL.wall : COL.meas; x.setLineDash([6 * px, 4 * px]); x.lineWidth = 2 * px; if (this.tmp.stairs || this.tmp.rect) x.strokeRect(Math.min(this.tmp.a[0], this.tmp.b[0]), Math.min(this.tmp.a[1], this.tmp.b[1]), Math.abs(this.tmp.b[0] - this.tmp.a[0]), Math.abs(this.tmp.b[1] - this.tmp.a[1])); else { x.beginPath(); x.moveTo(this.tmp.a[0], this.tmp.a[1]); x.lineTo(this.tmp.b[0], this.tmp.b[1]); x.stroke(); } x.setLineDash([]); }
      // ластик: те, що зітреться, підсвічується червоним
      if (this.tool === "erase" && this.hover) {
        const h = this.hover; x.strokeStyle = COL.bad; x.fillStyle = "rgba(224,65,58,.25)"; x.lineWidth = 3 * px;
        if (h.type === "wall") for (const w of G.groupWalls(P, P.walls.find(v => v.id === h.id))) { x.lineWidth = Math.max(4 * px, w.t || 0); x.beginPath(); x.moveTo(w.a[0], w.a[1]); x.lineTo(w.b[0], w.b[1]); x.stroke(); }
        if (h.type === "opening") { const o = P.openings.find(v => v.id === h.id), w = o && P.walls.find(v => v.id === o.wall); if (w) { const q = this._opPts(o, w); x.lineWidth = Math.max(4 * px, w.t); x.beginPath(); x.moveTo(q[0][0], q[0][1]); x.lineTo(q[1][0], q[1][1]); x.stroke(); } }
        if (h.type === "stair") { const s = (P.stairs || []).find(v => v.id === h.id); if (s) { x.fillRect(s.x, s.y, s.w, s.l); x.strokeRect(s.x, s.y, s.w, s.l); } }
        if (h.type === "room") { const r = P.rooms.find(v => v.id === h.id); if (r && r.manual) { x.beginPath(); r.poly.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); x.stroke(); } }
      }
      if (this.measure) { x.strokeStyle = COL.meas; x.lineWidth = 1.5 * px; x.beginPath(); x.moveTo(this.measure.a[0], this.measure.a[1]); x.lineTo(this.measure.b[0], this.measure.b[1]); x.stroke(); }
      x.restore();
      // підписи поверх (сталий розмір шрифту): площі кімнат, розміри стін, виміри
      x.font = "600 12px Inter, system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      const label = (p, t, col, bg) => { const [sx, sy] = this._scr(p), wdt = x.measureText(t).width + 8; x.fillStyle = bg || "rgba(255,255,255,.85)"; x.fillRect(sx - wdt / 2, sy - 9, wdt, 18); x.fillStyle = col; x.fillText(t, sx, sy); };
      // площа — лише з підтвердженим масштабом: до калібрування «0,02 м²» означало б пікселі, а не метри
      for (const rm of P.rooms) { const c = rm.lp || this._lp(rm.poly); label(c, P.scaleOk ? `${rm.name} · ${String(rm.area).replace(".", ",")} м²` : rm.name, rm.check ? "#9b1c17" : "#1d5c37"); }
      // розмір стіни — збоку від осі (на 14 px за межею стіни), щоб не перекривати назви й площі кімнат
      // крива стіна підписується однією загальною довжиною, а не кожним сегментом
      const grpL = new Map(), grpMid = new Set(); for (const w of P.walls) if (w.g) grpL.set(w.g, (grpL.get(w.g) || 0) + G.len(w));
      for (const g of grpL.keys()) { const q = P.walls.filter(w => w.g === g); grpMid.add(q[Math.floor(q.length / 2)].id); }
      if (this.dims && this.view.s * 1000 > 25) for (const w of P.walls) { if (w.virtual) continue; if (w.g) { if (grpMid.has(w.id)) { const Q = G.len(w) || 1, n = [-(w.b[1] - w.a[1]) / Q, (w.b[0] - w.a[0]) / Q], off = w.t / 2 + 14 / this.view.s; label([(w.a[0] + w.b[0]) / 2 + n[0] * off, (w.a[1] + w.b[1]) / 2 + n[1] * off], `⌒ ${Math.round(grpL.get(w.g))}`, "#1f3b7a", "rgba(232,240,255,.9)"); } continue; } const L = G.len(w); if (L * this.view.s < 50) continue; const nx = -(w.b[1] - w.a[1]) / L, ny = (w.b[0] - w.a[0]) / L, off = w.t / 2 + 14 / this.view.s, m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], c = P.rooms.length ? P.rooms.reduce((s, r) => [s[0] + r.poly.reduce((a, p) => a + p[0], 0) / r.poly.length / P.rooms.length, s[1] + r.poly.reduce((a, p) => a + p[1], 0) / r.poly.length / P.rooms.length], [0, 0]) : m, sg = (m[0] + nx - c[0]) * nx + (m[1] + ny - c[1]) * ny >= 0 ? 1 : -1; label([m[0] + nx * off * sg, m[1] + ny * off * sg], `${Math.round(L)}`, "#1f3b7a", "rgba(232,240,255,.9)"); }
      // режим «Перевірити відповідність плану»: контури побудованої 3D-моделі (проєкція зверху) і місця розбіжностей
      const ov = this.overlay;
      if (ov && ov.show) {
        x.save(); x.translate(this.view.x, this.view.y); x.scale(this.view.s, this.view.s);
        if (ov.show.d3) for (const poly of ov.walls3d || []) { x.beginPath(); poly.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.strokeStyle = "#D4148C"; x.lineWidth = 1.6 / this.view.s; x.setLineDash([5 / this.view.s, 3 / this.view.s]); x.stroke(); x.setLineDash([]); }
        if (ov.show.diff) for (const m of ov.marks || []) { x.strokeStyle = m.level === "bad" ? "#E0413A" : "#F08A24"; x.lineWidth = 3 / this.view.s; if (m.box) x.strokeRect(m.box[0], m.box[1], m.box[2] - m.box[0], m.box[3] - m.box[1]); else { x.beginPath(); x.arc(m.p[0], m.p[1], 12 / this.view.s, 0, Math.PI * 2); x.stroke(); } }
        x.restore();
        if (ov.show.diff) for (const m of ov.marks || []) if (m.text) { const c = m.box ? [(m.box[0] + m.box[2]) / 2, m.box[1]] : m.p; label([c[0], c[1] - 16 / this.view.s], m.text, m.level === "bad" ? "#9b1c17" : "#7a3e00", "rgba(255,240,230,.95)"); }
      }
      // позначки пропущених приміщень (пропозиція AI): обвести інструментом «Приміщення»
      for (const mk of this.marks || []) { const [sx, sy] = this._scr(mk.p); x.fillStyle = "#F08A24"; x.beginPath(); x.arc(sx, sy, 7, 0, Math.PI * 2); x.fill(); label([mk.p[0], mk.p[1] - 18 / this.view.s], `? ${mk.name || "приміщення"}`, "#7a3e00", "rgba(255,240,220,.95)"); }
      // кути на стиках стін: не прямий — помаранчевий; вибраний кут — фіолетовий
      const arcMark = (v, a, b, col, deg) => { const [sx, sy] = this._scr(v), t1 = Math.atan2(a[1] - v[1], a[0] - v[0]), t2 = Math.atan2(b[1] - v[1], b[0] - v[0]); let d = t2 - t1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath(); x.arc(sx, sy, 18, t1, t1 + d, d < 0); x.stroke(); const m = t1 + d / 2; x.save(); const t = `${String(Math.round(deg * 10) / 10).replace(".", ",")}°`, wd = x.measureText(t).width + 6, lx = sx + Math.cos(m) * 34, ly = sy + Math.sin(m) * 34; x.fillStyle = "rgba(255,255,255,.9)"; x.fillRect(lx - wd / 2, ly - 8, wd, 16); x.fillStyle = col; x.fillText(t, lx, ly); x.restore(); };
      const cs = this.sel && this.sel.type === "corner" ? this.sel : null;
      if ((this.showAngles && this.view.s * 1000 > 25) || cs) for (const c of G.corners(P)) { const on = cs && Math.hypot(c.p[0] - cs.p[0], c.p[1] - cs.p[1]) < 6; if (!this.showAngles && !on) continue; if (!on && (c.w1.g || c.w2.g) && c.deg > 170) continue; arcMark(c.p, c.a, c.b, on ? COL.sel : Math.abs(c.deg - 90) < 0.05 ? "#1d5c37" : "#B45F06", c.deg); }
      if (this.angM) { x.save(); x.translate(this.view.x, this.view.y); x.scale(this.view.s, this.view.s); line([this.angM.a, this.angM.v, this.angM.b], COL.meas); x.restore(); arcMark(this.angM.v, this.angM.a, this.angM.b, "#111827", this.angM.deg); }
      if (this.tmp && this.tmp.ang && this.tmp.ang.length === 2) arcMark(this.tmp.ang[1], this.tmp.ang[0], this.tmp.b, "#111827", G.angleAt(this.tmp.ang[0], this.tmp.ang[1], this.tmp.b));
      if (this.tmp && this.tmp.arc && this.tmp.arc.length === 2) { const C = G.circleThrough(this.tmp.arc[0], this.tmp.b, this.tmp.arc[1]); if (C) label(this.tmp.b, `R ${Math.round(C.r)} мм`, "#fff", "rgba(17,24,39,.85)"); }
      if (this.tmp && this.tmp.rect) { const q = this.tmp; label([(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2], `${Math.round(Math.abs(q.b[0] - q.a[0]))} × ${Math.round(Math.abs(q.b[1] - q.a[1]))} мм`, "#fff", "rgba(17,24,39,.85)"); }
      const m = this.tmp && this.tmp.a && !this.tmp.stairs && !this.tmp.poly && !this.tmp.rect ? this.tmp : this.measure;
      // під час побудови стіни поруч із довжиною видно кут до попередньої
      const liveDeg = m && m === this.tmp && m.dir != null && Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) > 1 ? ` · ${String(Math.round(G.angleAt([m.a[0] - Math.cos(m.dir), m.a[1] - Math.sin(m.dir)], m.a, m.b) * 10) / 10).replace(".", ",")}°` : "";
      if (m) label([(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2 - 14 / this.view.s], this.typed && m === this.tmp ? `${this.typed} мм ⏎` : `${Math.round(Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]))}${P.scaleOk ? " мм" : ""}${liveDeg}`, "#fff", "rgba(17,24,39,.85)");
    }
    destroy() { this._ro.disconnect(); }
  }
  root.RozstavPlanEditor = PlanEditor;
})(typeof window !== "undefined" ? window : this);
