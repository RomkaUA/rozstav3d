/*
  РОЗСТАВ — AI Floor Plan Detector (локальний комп'ютерний зір, без мережі й без генеративного AI).
  ------------------------------------------------------------
  Вхід: напівтонове зображення плану { w, h, gray: Uint8Array } (0 — чорне, 255 — біле).
  Вихід (у пікселях зображення; масштаб застосовує Scale Calibrator):
    walls    — осьові лінії стін a→b, товщина t, зовнішня/внутрішня, впевненість conf, check (потребує перевірки)
    openings — прорізи на стіні: kind door|window|opening, at (центр від a), width, conf, check, hinge/swing для дверей
    rooms    — контури кімнат (замкнені області між стінами), площа в px², центр
  Алгоритм:
    1. Бінаризація (Отсу) → маска темного.
    2. Товщина стін: для кожного темного пікселя — min(довжина горизонтальної, вертикальної серії); тонкі лінії (текст,
       розміри, меблі) мають малу товщину й відкидаються; товщина стіни — мода серед «товстих».
    3. Стіни: прямокутники з довгих серій (горизонтальні — з рядків, вертикальні — зі стовпців) → осьові лінії;
       колінеарні шматки зливаються, кінці прив'язуються до перпендикулярних стін (кути й Т-з'єднання).
    4. Прорізи: розриви між колінеарними шматками стіни. Тип — за символом у розриві: 2+ тонкі паралельні лінії → вікно;
       дуга чверть кола поряд → двері (з петлями й боком відкривання); інакше — прохід, позначений для перевірки.
    5. Кімнати: вільний простір, у якому прорізи «закриті» лініями; заливка ззовні → зовнішній простір;
       решта зв'язних областей достатньої площі — кімнати; контур спрощується (Рамер — Дуглас — Пекер).
  Похилі (не горизонтальні й не вертикальні) стіни детектор не розпізнає — їх додають у 2D-редакторі вручну.
*/
(function (root) {
  "use strict";
  // ---------- 1. бінаризація ----------
  function otsu(gray) {
    const hist = new Float64Array(256); for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, thr = 127;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = t; } }
    return thr;
  }
  function binarize(img, thr) { const { w, h, gray } = img, m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = gray[i] <= thr ? 1 : 0; return m; }
  // морфологія (квадратне вікно k): розширення/звуження окремо по рядках і стовпцях — O(n) на прохід
  function dilate(m, w, h, k, erode) {
    if (k < 2) return m;
    const r = k >> 1, tmp = new Uint8Array(m.length), out = new Uint8Array(m.length), want = erode ? 0 : 1;
    for (let y = 0; y < h; y++) { let cnt = 0; const row = y * w; for (let x = -r; x < w; x++) { const add = x + r, rem = x - r - 1; if (add < w && m[row + add] === want) cnt++; if (rem >= 0 && m[row + rem] === want) cnt--; if (x >= 0) tmp[row + x] = cnt > 0 ? want : 1 - want; } }
    for (let x = 0; x < w; x++) { let cnt = 0; for (let y = -r; y < h; y++) { const add = y + r, rem = y - r - 1; if (add < h && tmp[add * w + x] === want) cnt++; if (rem >= 0 && tmp[rem * w + x] === want) cnt--; if (y >= 0) out[y * w + x] = cnt > 0 ? want : 1 - want; } }
    return out;
  }
  const close = (m, w, h, k) => dilate(dilate(m, w, h, k, false), w, h, k, true);
  const open = (m, w, h, k) => dilate(dilate(m, w, h, k, true), w, h, k, false);

  // ---------- 2. товщина: довжини серій ----------
  function runs(m, w, h) {
    const hr = new Uint16Array(m.length), vr = new Uint16Array(m.length);
    for (let y = 0; y < h; y++) { let x = 0; while (x < w) { if (!m[y * w + x]) { x++; continue; } let e = x; while (e < w && m[y * w + e]) e++; const L = Math.min(65535, e - x); for (let k = x; k < e; k++) hr[y * w + k] = L; x = e; } }
    for (let x = 0; x < w; x++) { let y = 0; while (y < h) { if (!m[y * w + x]) { y++; continue; } let e = y; while (e < h && m[e * w + x]) e++; const L = Math.min(65535, e - y); for (let k = y; k < e; k++) vr[k * w + x] = L; y = e; } }
    return { hr, vr };
  }
  function thickness(m, hr, vr, minT) {
    const hist = new Float64Array(400);
    for (let i = 0; i < m.length; i++) if (m[i]) { const t = Math.min(hr[i], vr[i]); if (t >= minT && t < 400) hist[t]++; }
    // мода серед «товстих» серій; згладжування ±1, щоб шум не зсунув моду
    let best = 0, T = 0; for (let t = minT; t < 399; t++) { const v = hist[t - 1] + 2 * hist[t] + hist[t + 1]; if (v > best) { best = v; T = t; } }
    return T;
  }
  // реальні плани мають кілька товщин: зовнішні стіни й тонкі перегородки (у 2–4 рази тонші).
  // Рахуємо лише «бруски» — серії, довші за 5 товщин (текст і значки відпадають), і шукаємо найтоншу помітну моду
  function thicknessModes(m, hr, vr, minT) {
    const hist = new Float64Array(400);
    for (let i = 0; i < m.length; i++) if (m[i]) { const t = Math.min(hr[i], vr[i]), L = Math.max(hr[i], vr[i]); if (t >= minT && t < 399 && L >= Math.max(24, t * 5)) hist[t]++; }
    const sm = t => hist[t - 1] + 2 * hist[t] + hist[t + 1];
    let best = 0, T = 0; for (let t = minT; t < 398; t++) { const v = sm(t) * Math.sqrt(t); if (v > best) { best = v; T = t; } }
    if (!T) return { T: 0, Tmin: 0 };
    // найтонша мода: локальний максимум з масою ≥ 10% від маси основної моди (за довжиною стін, тобто маса/товщина)
    const len = t => sm(t) / t, ref = len(T); let Tmin = T;
    for (let t = minT; t < T * 0.8; t++) if (sm(t) >= sm(t - 1) && sm(t) >= sm(t + 1) && len(t) >= ref * 0.1 && sm(t) > 0) { Tmin = t; break; }
    return { T, Tmin };
  }

  // ---------- 3. стіни ----------
  // прямокутники з довгих серій: horizontal=true — серії в рядках, зливаються по вертикалі
  function rects(wm, w, h, minLen, horizontal) {
    const out = [], open = [];
    const N = horizontal ? h : w, M = horizontal ? w : h, at = horizontal ? (i, j) => wm[i * w + j] : (i, j) => wm[j * w + i];
    for (let i = 0; i <= N; i++) {
      const cur = [];
      if (i < N) { let j = 0; while (j < M) { if (!at(i, j)) { j++; continue; } let e = j; while (e < M && at(i, e)) e++; if (e - j >= minLen) cur.push([j, e]); j = e; } }
      const next = [];
      for (const r of open) {
        // продовження — за перекриттям (≥70% коротшої серії): у кутах межі серій зсуваються на товщину перпендикулярної стіни
        // і за схожою довжиною: інакше в Г-подібному куті коротка серія сусідньої стіни «приклеює» до довгої весь її торець
        const k = cur.findIndex(c => { const lc = c[1] - c[0], lr = r.a1 - r.a0; return Math.min(c[1], r.a1) - Math.max(c[0], r.a0) >= 0.7 * Math.min(lc, lr) && Math.min(lc, lr) >= 0.2 * Math.max(lc, lr); });
        if (k >= 0) { const c = cur.splice(k, 1)[0]; r.b1 = i + 1; r.a0 = Math.min(r.a0, c[0]); r.a1 = Math.max(r.a1, c[1]); next.push(r); } else out.push(r);
      }
      for (const c of cur) next.push({ a0: c[0], a1: c[1], b0: i, b1: i + 1 });
      open.length = 0; open.push(...next);
    }
    // a — уздовж стіни, b — поперек (товщина)
    return out.map(r => horizontal ? { x0: r.a0, x1: r.a1, y0: r.b0, y1: r.b1 } : { x0: r.b0, x1: r.b1, y0: r.a0, y1: r.a1 });
  }
  function wallsFrom(wm, w, h, T, lim, hr, vr) {
    // короткі простінки біля дверей (≈ товщини стіни) теж потрібні: без них проріз «зливається» з кутом і кімната не замикається.
    // Поперечні перерізи перпендикулярних стін (довжина = товщина) відсікає межа товщини нижче й фінальний фільтр довжини
    const minLen = Math.max(6, Math.round(T * 1.1)), tMin = Math.min(T * 0.4, lim || T);
    // горизонтальна серія, що вся лежить у тілі вертикальної стіни (поперечний переріз товстої стіни), — не горизонтальна стіна, і навпаки.
    // Інакше переріз товстої стіни (довший за minLen) зливається в куті з сусідньою стіною в один брусок і обидві губляться
    let mh = wm, mv = wm;
    if (hr) {
      mh = new Uint8Array(wm); mv = new Uint8Array(wm);
      for (let y = 0; y < h; y++) { let x = 0; while (x < w) { const i0 = y * w + x; if (!wm[i0]) { x++; continue; } let e = x, any = false; while (e < w && wm[y * w + e]) { const i = y * w + e; if (!(vr[i] > hr[i] * 2)) any = true; e++; } if (!any) for (let k = x; k < e; k++) mh[y * w + k] = 0; x = e; } }
      for (let x = 0; x < w; x++) { let y = 0; while (y < h) { if (!wm[y * w + x]) { y++; continue; } let e = y, any = false; while (e < h && wm[e * w + x]) { const i = e * w + x; if (!(hr[i] > vr[i] * 2)) any = true; e++; } if (!any) for (let k = y; k < e; k++) mv[k * w + x] = 0; y = e; } }
    }
    const H = rects(mh, w, h, minLen, true).filter(r => r.y1 - r.y0 >= tMin && r.y1 - r.y0 <= T * 3.5)
      .map(r => ({ o: "h", c: (r.y0 + r.y1) / 2, s0: r.x0, s1: r.x1, t: r.y1 - r.y0 }));
    const V = rects(mv, w, h, minLen, false).filter(r => r.x1 - r.x0 >= tMin && r.x1 - r.x0 <= T * 3.5)
      .map(r => ({ o: "v", c: (r.x0 + r.x1) / 2, s0: r.y0, s1: r.y1, t: r.x1 - r.x0 }));
    return { H, V };
  }
  // злиття шматків на одній лінії; розриви між ними — кандидати в прорізи
  function lines(segs, T) {
    segs = segs.slice().sort((a, b) => a.c - b.c || a.s0 - b.s0);
    const groups = [];
    // одна лінія: осі близько, або тонший шматок лежить у смузі товщого (товстий шматок біля пілона чи шафи має зміщену вісь)
    const ov = (g, s) => { const lo = Math.max(g.c - g.t / 2, s.c - s.t / 2), hi = Math.min(g.c + g.t / 2, s.c + s.t / 2); return hi - lo >= Math.min(g.t, s.t) * 0.6; };
    for (const s of segs) { let g = groups.find(g => (Math.abs(g.c - s.c) <= Math.max(2, T * 0.45) && Math.abs(g.t - s.t) <= Math.max(3, T * 0.8)) || (g.t !== s.t && ov(g, s) && Math.abs(g.c - s.c) <= T * 1.2)); if (!g) { g = { c: s.c, t: s.t, o: s.o, parts: [] }; groups.push(g); } g.parts.push(s); g.c = g.parts.reduce((a, p) => a + p.c * (p.s1 - p.s0), 0) / g.parts.reduce((a, p) => a + p.s1 - p.s0, 0); }
    for (const g of groups) { g.parts.sort((a, b) => a.s0 - b.s0); const m = []; for (const p of g.parts) { const l = m[m.length - 1]; if (l && p.s0 - l.s1 <= Math.max(2, T * 0.6)) { l.s1 = Math.max(l.s1, p.s1); l.t = Math.max(l.t, p.t); } else m.push({ s0: p.s0, s1: p.s1, t: p.t }); } g.parts = m; g.t = m.reduce((a, p) => a + p.t * (p.s1 - p.s0), 0) / m.reduce((a, p) => a + p.s1 - p.s0, 0); }
    return groups;
  }

  // ---------- 4. прорізи: символ у розриві ----------
  // двері ширші за ~5 товщин зовнішньої стіни (≈ 1,3–2 м) не бувають: такий «проріз із дугою» — збіг ліній меблів, розмірів чи огорожі
  function classifyGap(img, w, h, g, a, b, T, thr) { const r = classifyGap0(img, w, h, g, a, b, T, thr); return r.kind === "door" && b - a > T * 5 ? { kind: "opening", conf: 0.3, check: true } : r; }
  function classifyGap0(img, w, h, g, a, b, T, thr) {
    // смуга розриву: уздовж [a, b], поперек ±(t/2 + T/2). Тонкі лінії позначень у сканах бліді (світліші за поріг Отсу),
    // тому «темне» тут — локально: темніше за папір навколо на чверть різниці між папером і стіною
    const half = g.t / 2 + Math.max(2, T * 0.3), len = b - a, G = img.gray;
    // система координат розриву: u — уздовж стіни, v — поперек (центр стіни при v = g.c); для косих стін — довільний напрямок g.f
    const XY = g.f ? (u, v) => [g.f.ox + u * g.f.dx + (v - g.c) * g.f.nx, g.f.oy + u * g.f.dy + (v - g.c) * g.f.ny] : g.o === "h" ? (u, v) => [u, v] : (u, v) => [v, u];
    // середнє 3×3: зерно скану не складається в «лінії», а справжні штрихи (навіть розмиті) лишаються
    const px = (u, v) => { const q = XY(u, v), x = Math.round(q[0]), y = Math.round(q[1]); if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return 255; let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += G[(y + dy) * w + x + dx]; return s / 9; };
    const sample = []; for (let v = Math.round(g.c - half - T); v <= Math.round(g.c + half + T); v += 2) for (let u = Math.round(a); u <= Math.round(b); u += 3) sample.push(px(u, v));
    sample.sort((p, q) => p - q); const paper = sample[Math.floor(sample.length * 0.8)] || 255, cut = paper - Math.max(14, (paper - thr) * 0.3);
    // темне: середнє 3×3 темніше за поріг (розмиті штрихи скану) або сам піксель темний разом хоча б з одним сусідом (чіткий тонкий штрих)
    const raw = (x, y) => x >= 0 && y >= 0 && x < w && y < h ? G[y * w + x] : 255;
    const at = (u, v) => { if (px(u, v) < cut) return 1; const q = XY(u, v), x = Math.round(q[0]), y = Math.round(q[1]); if (raw(x, y) >= cut) return 0; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && raw(x + dx, y + dy) < cut) n++; return n >= 1 ? 1 : 0; };
    // розрив, майже весь залитий (штриховка монолітної ділянки, яку маска стін не взяла), — це продовження стіни, а не проріз
    { let n = 0, k = 0; for (let v = Math.round(g.c - g.t / 2 + 1); v <= Math.round(g.c + g.t / 2 - 1); v += 2) for (let u = Math.round(a); u <= Math.round(b); u += 2) { const q = XY(u, v); k++; n += raw(Math.round(q[0]), Math.round(q[1])) <= thr ? 1 : 0; } if (k && n / k >= 0.5) return { kind: "solid", conf: 0.7, check: false }; }
    // вікно: тонкі лінії вздовж стіни, що перетинають ≥70% розриву
    let lines = 0, prev = false;
    for (let v = Math.round(g.c - half); v <= Math.round(g.c + half); v++) {
      let n = 0; for (let u = Math.round(a + len * 0.1); u <= Math.round(b - len * 0.1); u++) if (at(u, v)) n++;
      const full = n >= len * 0.8 * 0.55; if (full && !prev) lines++; prev = full;
    }
    if (lines >= 2) return { kind: "window", conf: Math.min(0.95, 0.6 + 0.1 * lines), check: false };
    // двері: дуга радіуса ≈ ширини розриву з центром у кінці розриву, з одного боку стіни
    let best = { cov: 0 };
    for (const [hx, hinge] of [[a, "a"], [b, "b"]]) for (const side of [1, -1]) {
      let hit = 0, tot = 0;
      for (let k = 2; k <= 28; k++) { const ang = (k / 30) * Math.PI / 2, r = len; const du = Math.cos(ang) * r * (hinge === "a" ? 1 : -1), dv = Math.sin(ang) * r * side; tot++; let found = 0; for (let d = -2; d <= 2 && !found; d++) for (let e = -2; e <= 2 && !found; e++) found = at(hx + du + d, g.c + side * (g.t / 2) + dv + e); hit += found; }
      const cov = hit / tot; if (cov > best.cov) best = { cov, hinge, side };
    }
    if (best.cov >= 0.4) return { kind: "door", conf: Math.min(0.95, 0.4 + best.cov * 0.55), check: best.cov < 0.6, hinge: best.hinge, swing: best.side };
    // двері без дуги: лише полотно — пряма лінія від кінця прорізу під кутом 20…80° (так позначають двері в багатьох планах ЖК)
    let leaf = { cov: 0 };
    for (const [hx, hinge] of [[a, "a"], [b, "b"]]) for (const side of [1, -1]) for (let deg = 20; deg <= 80; deg += 5) {
      const ang = deg * Math.PI / 180; let hit = 0, tot = 0;
      for (let s = 0.15; s <= 0.9; s += 0.05) { const r = len * s, du = Math.cos(ang) * r * (hinge === "a" ? 1 : -1), dv = Math.sin(ang) * r * side; tot++; let found = 0; for (let d = -1; d <= 1 && !found; d++) for (let e = -1; e <= 1 && !found; e++) found = at(hx + du + d, g.c + side * (g.t / 2) + dv + e); hit += found; }
      if (hit / tot > leaf.cov) leaf = { cov: hit / tot, hinge, side };
    }
    if (leaf.cov >= 0.75) return { kind: "door", conf: Math.min(0.85, 0.35 + leaf.cov * 0.5), check: leaf.cov < 0.9, hinge: leaf.hinge, swing: leaf.side };
    if (lines === 1) return { kind: "window", conf: 0.45, check: true };
    return { kind: "opening", conf: 0.3, check: true };
  }

  // ---------- 5. кімнати ----------
  function label(free, w, h) {
    const lab = new Int32Array(w * h).fill(-1), comps = [], st = new Int32Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (!free[s] || lab[s] >= 0) continue;
      const id = comps.length; let top = 0, n = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, border = false; st[top++] = s; lab[s] = id;
      while (top) { const p = st[--top], x = p % w, y = (p / w) | 0; n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        for (const q of [p - 1, p + 1, p - w, p + w]) { if (q < 0 || q >= w * h || (q % w === 0 && p % w === w - 1) || (p % w === 0 && q % w === w - 1)) continue; if (free[q] && lab[q] < 0) { lab[q] = id; st[top++] = q; } } }
      comps.push({ id, n, c: [sx / n, sy / n], box: [x0, y0, x1, y1], border });
    }
    return { lab, comps };
  }
  // контур компоненти (обхід межі за сусідством Мура) і спрощення
  function contour(lab, w, h, id, box) {
    let s = -1; for (let y = box[1]; y <= box[3] && s < 0; y++) for (let x = box[0]; x <= box[2]; x++) if (lab[y * w + x] === id) { s = y * w + x; break; }
    if (s < 0) return [];
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === id;
    const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const pts = []; let x = s % w, y = (s / w) | 0, dir = 7, guard = 0; const sx = x, sy = y;
    do { pts.push([x, y]); let found = false; for (let k = 0; k < 8; k++) { const d = (dir + 6 + k) % 8, nx = x + D[d][0], ny = y + D[d][1]; if (inside(nx, ny)) { x = nx; y = ny; dir = d; found = true; break; } } if (!found) break; } while ((x !== sx || y !== sy) && ++guard < 200000);
    return pts;
  }
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
    while (st.length) { const [i, j] = st.pop(); const [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay) || 1; let dm = 0, k = -1; for (let q = i + 1; q < j; q++) { const d = Math.abs((bx - ax) * (ay - pts[q][1]) - (ax - pts[q][0]) * (by - ay)) / L; if (d > dm) { dm = d; k = q; } } if (dm > eps && k > 0) { keep[k] = 1; st.push([i, k], [k, j]); } }
    return pts.filter((_, i) => keep[i]);
  }
  // замкнений контур: розбиваємо на дві половини, щоб RDP мав початок і кінець; майже осьові ребра вирівнюємо
  function simplifyRing(pts, eps) {
    if (pts.length < 8) return pts;
    const far = pts.reduce((b, p, i) => (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > b.d ? { d: Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]), i } : b), { d: 0, i: 0 }).i;
    const ring = [...rdp(pts.slice(0, far + 1), eps).slice(0, -1), ...rdp([...pts.slice(far), pts[0]], eps).slice(0, -1)];
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if (Math.abs(a[0] - b[0]) <= eps) b[0] = a[0]; else if (Math.abs(a[1] - b[1]) <= eps) b[1] = a[1]; }
    return ring.filter((p, i) => { const q = ring[(i + 1) % ring.length]; return p[0] !== q[0] || p[1] !== q[1]; });
  }
  const polyArea = p => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
  // лінія в масці (для «закриття» прорізів перед пошуком кімнат)
  function line(mask, w, h, x0, y0, x1, y1, r) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) mask[Y * w + X] = 1; } } }

  // ---------- косі стіни: залишок маски стін, не покритий осьовими, → головні компоненти ----------
  function diagonals(rest, w, h, T, cut) {
    const lab = new Uint8Array(w * h), st = new Int32Array(w * h), out = [];
    for (let s = 0; s < w * h; s++) {
      if (!rest[s] || lab[s]) continue; let top = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0; const pts = []; st[top++] = s; lab[s] = 1;
      while (top) { const p = st[--top], x = p % w, y = (p / w) | 0; n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; if (pts.length < 200000) pts.push(p);
        for (const q of [p - 1, p + 1, p - w, p + w, p - w - 1, p - w + 1, p + w - 1, p + w + 1]) { if (q < 0 || q >= w * h || Math.abs((q % w) - x) > 1) continue; if (rest[q] && !lab[q]) { lab[q] = 1; st[top++] = q; } } }
      if (n < T * T * 3) continue;
      const mx = sx / n, my = sy / n, cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my, ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy), dx = Math.cos(ang), dy = Math.sin(ang);
      const deg = Math.abs(ang * 180 / Math.PI) % 90; if (deg < 10 || deg > 80) continue;   // майже осьові — це шматки звичайних стін
      let u0 = Infinity, u1 = -Infinity; for (const p of pts) { const u = (p % w - mx) * dx + (((p / w) | 0) - my) * dy; if (u < u0) u0 = u; if (u > u1) u1 = u; }
      const L = u1 - u0, t = n / Math.max(1, L);
      if (L < T * 2.5 || t < T * 0.45 || t > T * 3 || L / t < 2.5) continue;
      out.push({ o: "d", a: [mx + dx * u0, my + dy * u0], b: [mx + dx * u1, my + dy * u1], t, dx, dy });
      for (const p of pts) cut[p] = 1;
    }
    return out;
  }
  // ---------- смуги з двох тонких паралельних ліній ----------
  // засклення фасадів і еркерів (між лініями — папір і тонкі рами) та контурні перегородки (між лініями — штриховка).
  // Маска стін їх не бере: лінії тонкі. Шукаємо прямі перетворенням Гафа на тонких лініях, групуємо пари паралельних
  // на відстані ¼…1,6 товщини стіни й беремо лише ті смуги, що обома кінцями сходяться зі стінами (або з іншими такими смугами)
  // wmo тут — маска стін разом із косими стінами (їхні краї не мають ставати «тонкими лініями»)
  function bands(gray, thr, wmo, w, h, T, segs, dbg) {
    // тонкі лінії засклення після зменшення зображення бліднуть: «темне» тут — помітно темніше за папір, а не лише за поріг Отсу
    const hist = new Uint32Array(256); for (let i = 0; i < gray.length; i += 7) hist[gray[i]]++; let acc0 = 0, tot = 0; for (let v = 0; v < 256; v++) tot += hist[v]; let paper = 255; for (let v = 0; v < 256; v++) { acc0 += hist[v]; if (acc0 >= tot * 0.6) { paper = v; break; } }
    const lt = Math.max(thr, Math.min(paper - 30, 228)), m0 = new Uint8Array(gray.length); for (let i = 0; i < gray.length; i++) m0[i] = gray[i] <= lt ? 1 : 0;
    const excl = dilate(wmo, w, h, 2 * Math.max(2, Math.round(T * 0.25)) + 1, false), xs = [], ys = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (m0[i] && !excl[i]) { xs.push(x); ys.push(y); } }
    if (!xs.length || xs.length > 700000) return [];
    const A = 360, CS = new Float64Array(A), SN = new Float64Array(A); for (let a = 0; a < A; a++) { CS[a] = Math.cos(a * Math.PI / A); SN[a] = Math.sin(a * Math.PI / A); }
    const D = Math.ceil(Math.hypot(w, h)), R = 2 * D + 1, acc = new Int32Array(A * R);
    for (let k = 0; k < xs.length; k++) { const x = xs[k], y = ys[k]; for (let a = 0; a < A; a++) acc[a * R + Math.round(x * CS[a] + y * SN[a]) + D]++; }
    const minLen = T * 3, peaks = [];
    for (let a = 0; a < A; a++) for (let r = 0; r < R; r++) { const v = acc[a * R + r]; if (v < minLen) continue; let mx = true;
      for (let da = -2; da <= 2 && mx; da++) for (let dr = -2; dr <= 2; dr++) { if (!da && !dr) continue; const aa = a + da, rr = r + dr; if (aa < 0 || aa >= A || rr < 0 || rr >= R) continue; const q = acc[aa * R + rr]; if (q > v || (q === v && (da < 0 || (da === 0 && dr < 0)))) { mx = false; break; } }
      if (mx) peaks.push([v, a, r - D]); }
    peaks.sort((p, q) => q[0] - p[0]); peaks.length = Math.min(peaks.length, 700);
    // лінія — тонка: хоча б з одного боку 2…4 px паперу підряд (у штриховці чи заливці світлих проміжків такої ширини немає)
    const dark = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < w && y < h && !!m0[y * w + x]; };
    const clear = (px, py, o, sg, nx, ny) => { for (let k = 2; k <= 4; k++) if (dark(px + (o + sg * k) * nx, py + (o + sg * k) * ny)) return false; return true; };
    const thin = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < w && y < h && m0[y * w + x] && !excl[y * w + x]; };
    // відрізки вздовж прямої (за уточненим кутом)
    const segsOn = (nx, ny, rho, tol, uA = -D, uB = D) => { const dx = -ny, dy = nx, out = []; let st = null, last = -1e9, hits = 0;
      for (let u = Math.floor(uA); u <= uB; u++) { const px = rho * nx + u * dx, py = rho * ny + u * dy; if (px < -1 || py < -1 || px > w || py > h) continue; let hit = false; for (let o = -tol; o <= tol && !hit; o += 0.5) hit = thin(px + o * nx, py + o * ny) && (clear(px, py, o, 1, nx, ny) || clear(px, py, o, -1, nx, ny));
        if (hit) { if (st === null || u - last > Math.max(4, T * 0.25)) { if (st !== null && last - st >= minLen && hits >= (last - st) * 0.75) out.push([st, last, hits / (last - st + 1)]); st = u; hits = 0; } last = u; hits++; } }
      if (st !== null && last - st >= minLen && hits >= (last - st) * 0.75) out.push([st, last, hits / (last - st + 1)]); return out; };
    let lines = [];
    for (const [, a, r] of peaks) {
      const nx0 = CS[a], ny0 = SN[a];
      // кожен відрізок уточнюємо окремо: головна компонента найближчих точок (±2 px) лише в межах цього відрізка
      for (const [ua, ub] of segsOn(nx0, ny0, r, 2)) {
        let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0; const dx0 = -ny0, dy0 = nx0;
        for (let u = ua; u <= ub; u++) { const px = r * nx0 + u * dx0, py = r * ny0 + u * dy0; for (const o of [0, -1, 1, -2, 2]) { const X = px + o * nx0, Y = py + o * ny0; if (thin(X, Y)) { n++; sx += X; sy += Y; sxx += X * X; syy += Y * Y; sxy += X * Y; break; } } }
        if (n < minLen) continue;
        const mx = sx / n, my = sy / n, cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my, ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
        let nx = -Math.sin(ang), ny = Math.cos(ang); if (nx * nx0 + ny * ny0 < 0) { nx = -nx; ny = -ny; }
        if (nx * nx0 + ny * ny0 < 0.9995) { nx = nx0; ny = ny0; }
        const rho = mx * nx + my * ny, um = -mx * ny + my * nx, half = (ub - ua) / 2 + 12;
        // напрям: точно осьовий (±1,5°) або явно косий (10…80°); ледь похилі «лінії» — це рядки тексту й розмірів
        const dg0 = Math.abs(Math.atan2(ny, nx) * 180 / Math.PI) % 90; if (!(dg0 <= 1.5 || dg0 >= 88.5 || (dg0 >= 10 && dg0 <= 80))) continue;
        for (const [u0, u1, fill] of segsOn(nx, ny, rho, 1.5, um - half, um + half)) lines.push({ nx, ny, rho, u0, u1, fill });
      }
    }
    // однакові відрізки з сусідніх піків
    const same = (p, q) => p.nx * q.nx + p.ny * q.ny > 0.9997 && Math.abs(p.rho - q.rho) <= 2 && Math.min(p.u1, q.u1) - Math.max(p.u0, q.u0) > 0;
    const uniq = []; for (const l of lines.sort((p, q) => (q.u1 - q.u0) - (p.u1 - p.u0))) if (!uniq.some(q => same(q, l))) uniq.push(l); lines = uniq;
    // родина з ≥ 8 паралельних ліній поруч — штриховка або сітка, а не засклення (у засклення з рамами — до 5–6 ліній)
    const fam = l => lines.filter(q => { const d = l.nx * q.nx + l.ny * q.ny; return Math.abs(d) > 0.9997 && Math.abs((d > 0 ? q.rho : -q.rho) - l.rho) <= T * 1.6 && Math.min(l.u1, d > 0 ? q.u1 : -q.u0) - Math.max(l.u0, d > 0 ? q.u0 : -q.u1) > 0; }).length;
    lines = lines.filter(l => fam(l) < 8);
    // пари паралельних ліній → смуги
    const cand = [];
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const p = lines[i], q = lines[j]; let dot = p.nx * q.nx + p.ny * q.ny; if (Math.abs(dot) < 0.9997 || Math.min(p.fill, q.fill) < 0.9) continue;
      const qr = dot > 0 ? q.rho : -q.rho, qu0 = dot > 0 ? q.u0 : -q.u1, qu1 = dot > 0 ? q.u1 : -q.u0, d = qr - p.rho, ad = Math.abs(d);
      if (ad < Math.max(3, T * 0.25) || ad > T * 1.6) continue;
      const u0 = Math.max(p.u0, qu0), u1 = Math.min(p.u1, qu1); if (u1 - u0 < minLen || u1 - u0 < 0.6 * Math.min(p.u1 - p.u0, qu1 - qu0)) continue;
      // протяжність смуги — об'єднання обох ліній: біля кутів одна з ліній рами часто коротша
      cand.push({ nx: p.nx, ny: p.ny, rho: p.rho + d / 2, t: ad + 2, u0: Math.min(p.u0, qu0), u1: Math.max(p.u1, qu1) });
    }
    cand.sort((p, q) => q.t - p.t);
    // смуга не виходить за габарит будівлі (за довгими стінами) більш ніж на 3 товщини: легенда, штамп і розміри поза планом відпадають
    const big = segs.filter(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) >= T * 6); let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const s of big) for (const p of [s.a, s.b]) { bx0 = Math.min(bx0, p[0]); by0 = Math.min(by0, p[1]); bx1 = Math.max(bx1, p[0]); by1 = Math.max(by1, p[1]); }
    const inBox = p => !big.length || (p[0] >= bx0 - T * 3 && p[0] <= bx1 + T * 3 && p[1] >= by0 - T * 3 && p[1] <= by1 + T * 3);
    const pts = c => { const dx = -c.ny, dy = c.nx; return [[c.rho * c.nx + c.u0 * dx, c.rho * c.ny + c.u0 * dy], [c.rho * c.nx + c.u1 * dx, c.rho * c.ny + c.u1 * dy]]; };
    const pick = [];
    for (const c of cand) {
      if (pick.some(p => Math.abs(p.nx * c.nx + p.ny * c.ny) > 0.999 && Math.abs((p.nx * c.nx + p.ny * c.ny > 0 ? 1 : -1) * c.rho - p.rho) < p.t / 2 + 2 && Math.min(p.u1, c.u1) - Math.max(p.u0, c.u0) > 0.3 * (c.u1 - c.u0))) continue;
      // що між лініями: папір (засклення) чи штриховка (контурна перегородка); на осі — не тіло стіни
      const dx = -c.ny, dy = c.nx; let ink = 0, k = 0, inWall = 0, kw = 0;
      for (let u = c.u0; u <= c.u1; u += 2) { for (let o = -c.t / 2 + 2.5; o <= c.t / 2 - 2.5; o += 1.5) { const x = Math.round(c.rho * c.nx + u * dx + o * c.nx), y = Math.round(c.rho * c.ny + u * dy + o * c.ny); if (x < 0 || y < 0 || x >= w || y >= h) continue; k++; ink += m0[y * w + x]; }
        const x = Math.round(c.rho * c.nx + u * dx), y = Math.round(c.rho * c.ny + u * dy); if (x >= 0 && y >= 0 && x < w && y < h) { kw++; inWall += wmo[y * w + x]; } }
      if (!k || inWall > kw * 0.3 || !pts(c).every(inBox)) continue;
      const f = ink / k; if ((f > 0.18 && f < 0.25) || f > 0.85) continue;
      // засклення — на фасаді: з одного боку аж до краю аркуша немає стін (зовні). Подвійні лінії меблів і розмірів усередині квартири цю перевірку не проходять
      if (f <= 0.18) { let out = false; for (const side of [1, -1]) { let empty = 0; for (let k2 = 1; k2 <= 5; k2++) { const u = c.u0 + (c.u1 - c.u0) * k2 / 6; let hit = false; for (let o = c.t / 2 + 3; !hit; o += 2) { const x = Math.round(c.rho * c.nx + u * dx + side * o * c.nx), y = Math.round(c.rho * c.ny + u * dy + side * o * c.ny); if (x < 0 || y < 0 || x >= w || y >= h) break; hit = !!wmo[y * w + x]; } if (!hit) empty++; } if (empty >= 4) out = true; } if (!out) continue; }
      pick.push(Object.assign(c, { win: f <= 0.18, ends: pts(c) }));
    }
    // приймаємо смуги, обидва кінці яких сходяться зі стінами чи вже прийнятими смугами (ланцюжок засклення з кількох граней)
    const distSeg = (p, s) => { const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy || 1, q = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2)); return Math.hypot(p[0] - s.a[0] - q * dx, p[1] - s.a[1] - q * dy); };
    const ok = [], near = (e, c) => segs.some(s => distSeg(e, s) <= s.t / 2 + c.t / 2 + T * 0.8) || ok.some(o => o !== c && o.ends.some(f => Math.hypot(f[0] - e[0], f[1] - e[1]) <= Math.max(o.t, c.t) + T * 0.5));
    if (dbg) dbg.push({ px: xs.length, peaks: peaks.length, lines: lines.length, cand: cand.length, pick: pick.length, linesL: lines.map(l => [Math.round(l.rho), +(Math.atan2(l.ny, l.nx) * 180 / Math.PI).toFixed(1), Math.round(l.u0), Math.round(l.u1)]), pickL: pick.map(c => [c.ends.map(e => e.map(Math.round)), +c.t.toFixed(1), c.win]) });
    // ланцюжок засклення (фасад → кут → еркер) приймається цілим: починаємо з усіх кандидатів і відкидаємо ті, чий кінець ні до чого не прилягає, доки нічого не зміниться
    ok.push(...pick);
    for (let changed = true; changed;) { changed = false; for (let i = ok.length - 1; i >= 0; i--) { const c = ok[i]; if (!near(c.ends[0], c) || !near(c.ends[1], c)) { ok.splice(i, 1); changed = true; } } }
    return ok;
  }
  // групи стін, з'єднані кінцями; легенда, штамп і логотип аркуша — окремі дрібні групи, їх відкидаємо
  function mainCluster(list, T) {
    const n = list.length, par = list.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i]));
    const dist = (p, s) => { const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy || 1, q = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2)); return Math.hypot(p[0] - s.a[0] - q * dx, p[1] - s.a[1] - q * dy); };
    // з'єднані — кінець біля іншої стіни або стіни перетинаються (перегородка, що проходить крізь стіну, — теж частина плану)
    const cross = (A, B) => { const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const d1 = d(A.a, A.b, B.a), d2 = d(A.a, A.b, B.b), d3 = d(B.a, B.b, A.a), d4 = d(B.a, B.b, A.b); return d1 * d2 < 0 && d3 * d4 < 0; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const A = list[i], B = list[j], tol = (A.t + B.t) / 2 + T * 1.5; if (cross(A, B) || Math.min(dist(A.a, B), dist(A.b, B), dist(B.a, A), dist(B.b, A)) <= tol) par[f(i)] = f(j); }
    const tot = {}; list.forEach((w, i) => { const r = f(i); tot[r] = (tot[r] || 0) + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); });
    const best = Math.max(0, ...Object.values(tot));
    return list.filter((w, i) => tot[f(i)] >= best * 0.25);
  }
  // ---------- головна функція ----------
  // штриховані (монолітні) стіни розпадаються на смужки: робимо другий прохід із заповненням дрібної штриховки й беремо кращий
  function detect(img, opts = {}) {
    if (opts.fill || opts.single) return detect1(img, opts);
    const a = detect1(img, opts); if (!a.ok) { const b = detect1(img, Object.assign({}, opts, { fill: 5 })); return b.ok ? Object.assign(b, { filled: true }) : a; }
    // товщини беремо з першого проходу: заповнення зливає подвійні тонкі лінії (меблі, розміри) у фальшиві «тонкі стіни»
    // виняток: якщо тонких перегородок у першому проході не знайшлося зовсім (Tmin = T), вони, ймовірно, намальовані контуром — тоді найтоншу товщину шукаємо вже після заповнення
    const b = detect1(img, Object.assign({}, opts, { fill: Math.max(3, Math.round(a.T * 0.35)), modes: a.Tmin < a.T ? { T: a.T, Tmin: a.Tmin } : { T: a.T, Tmin: 0 } }));
    // суцільна довжина стін (без прорізів — фальшиві «стіни» з меблів складаються переважно з «прорізів»), зважена на «чорнило»: суцільна й штрихована стіна (≥ 0,6) рахуються повністю, бліді злиті смуги — частково
    const score = r => r.ok ? r.walls.reduce((s, w, i) => s + Math.max(0, Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) - r.openings.filter(o => o.wall === i).reduce((q, o) => q + o.width, 0)) * Math.pow(Math.min(1, w.ink / 0.6), 2), 0) * (1 + Math.min(4, r.rooms.length) * 0.1) * (1 - Math.min(0.5, r.walls.filter(w => w.check).length / Math.max(1, r.walls.length))) : 0;
    return score(b) > score(a) * 1.15 ? Object.assign(b, { filled: true }) : a;
  }
  function detect1(img, opts = {}) {
    const { w, h } = img, t0 = Date.now();
    const thr = opts.threshold != null ? opts.threshold : Math.min(200, otsu(img.gray));
    let m = binarize(img, thr); const m0 = m;
    // контурні стіни (дві тонкі лінії замість заливки) заповнюємо закриттям на ширину стіни, якщо вказано
    if (opts.fill > 1) m = close(m, w, h, opts.fill);
    const { hr, vr } = runs(m, w, h);
    const minT = Math.max(3, opts.minT || 4), md = opts.wallPx ? { T: opts.wallPx, Tmin: opts.wallPx } : opts.modes && opts.modes.Tmin ? opts.modes : opts.modes ? { T: opts.modes.T, Tmin: Math.max(minT, thicknessModes(m, hr, vr, minT).Tmin) } : thicknessModes(m, hr, vr, minT);
    const T = md.T || thickness(m, hr, vr, minT), Tmin = md.T ? md.Tmin : T;
    if (!T) return { ok: false, error: "Не знайдено стін: на зображенні немає товстих ліній. Спробуйте інший поріг або режим «контурні стіни».", walls: [], openings: [], rooms: [], T: 0, thr };
    // маска стін: товщина ≥ 40% від типової (або 60% від найтоншої перегородки); легке «відкриття» прибирає зачіпки тексту
    const wm = new Uint8Array(w * h); const lim = Math.max(3, Math.min(Math.round(T * 0.4), Math.round(Tmin * 0.6)));
    for (let i = 0; i < m.length; i++) wm[i] = m[i] && Math.min(hr[i], vr[i]) >= lim ? 1 : 0;
    const wmo = open(wm, w, h, Math.max(2, Math.min(Math.round(T * 0.3), lim - 1)));
    // косі стіни: обидві серії (горизонтальна й вертикальна) схожої довжини 0,5…3 товщини — так виглядає похила смуга;
    // знайдені косі стіни вирізаємо з маски, інакше їхні «сходинки» склеїлися б у фальшиві осьові стіни
    const dmask = new Uint8Array(w * h); for (let i = 0; i < dmask.length; i++) if (wmo[i]) { const a = hr[i], b = vr[i], mx = Math.max(a, b), mn = Math.min(a, b); if (mn >= T * 0.5 && mx < T * 3 && mx < mn * 2.2) dmask[i] = 1; }
    const cut = new Uint8Array(w * h), dg = diagonals(dmask, w, h, T, cut);
    if (dg.length) { const r = Math.max(1, Math.round(T * 0.3)); const grow = dilate(cut, w, h, r * 2 + 1, false); for (let i = 0; i < wmo.length; i++) if (grow[i] && !(Math.max(hr[i], vr[i]) >= T * 3)) wmo[i] = 0; }
    const { H, V } = wallsFrom(wmo, w, h, T, lim, hr, vr);
    const LH = lines(H, T), LV = lines(V, T);
    // стіни з прорізами: колінеарні шматки, розрив між якими схожий на проріз (2…40 товщин), — одна стіна з отвором
    const walls = [], openings = [];
    // розрив перетинає перпендикулярна стіна або в ньому закінчується (Т-з'єднання) — це дві різні стіни, а не стіна з прорізом:
    // у дверях чи вікні інша стіна не стикується
    const crossed = (g, a, b) => { const half = Math.max(1, g.t / 2 - 1); for (let s = Math.round(a) + 1; s < b - 1; s++) { let n = 0, k = 0; for (let v = Math.round(g.c - half); v <= Math.round(g.c + half); v++, k++) { const x = g.o === "h" ? s : v, y = g.o === "h" ? v : s; if (x >= 0 && y >= 0 && x < w && y < h && wmo[y * w + x]) n++; } if (k && n >= k * 0.45) return true; } return false; };
    for (const g of [...LH, ...LV]) {
      let cur = null;
      const flush = () => { if (cur) { walls.push(cur); cur = null; } };
      for (const p of g.parts) {
        if (cur) {
          const gap = p.s0 - cur.s1;
          if (gap >= T * 1.6 && gap <= T * 45 && !crossed(g, cur.s1, p.s0)) {
            const cls = classifyGap(img, w, h, g, cur.s1, p.s0, T, thr);
            // проріз без позначення — лише вузький (прохід); довгий «розрив» між випадковими колінеарними шматками — не стіна
            if (cls.kind === "solid") { cur.s1 = p.s1; continue; }
            if (cls.kind === "opening" ? gap <= T * 6 : gap <= T * 16) { cur.ops.push(Object.assign({ s0: cur.s1, s1: p.s0 }, cls)); cur.s1 = p.s1; continue; }
          }
          flush();
        }
        cur = { o: g.o, c: g.c, t: g.t, s0: p.s0, s1: p.s1, ops: [] };
      }
      flush();
    }
    // прохід із заповненням зливає і тонкі лінії вікон у «суцільну стіну»: ділянки, де у вихідному зображенні майже немає чорнила, знову стають прорізами
    if (opts.fill > 1) for (const a of walls) {
      const half = Math.max(1, a.t / 2 - 1), col = s => { let n = 0, k = 0; for (let v = Math.round(a.c - half); v <= Math.round(a.c + half); v++, k++) { const x = a.o === "h" ? s : v, y = a.o === "h" ? v : s; if (x >= 0 && y >= 0 && x < w && y < h) n += m0[y * w + x]; } return k ? n / k : 0; };
      let st = -1; const add = [];
      for (let s = Math.round(a.s0); s <= Math.round(a.s1) + 1; s++) { const low = s <= a.s1 && col(s) < 0.35 && !a.ops.some(o => s >= o.s0 && s <= o.s1); if (low && st < 0) st = s; if (!low && st >= 0) { if (s - st >= T * 1.6 && st > a.s0 + 2 && s < a.s1 - 2) add.push([st, s]); st = -1; } }
      for (const [s0, s1] of add) { const cls = classifyGap(img, w, h, { o: a.o, c: a.c, t: a.t }, s0, s1, T, thr); if (cls.kind !== "opening" && cls.kind !== "solid") a.ops.push(Object.assign({ s0, s1 }, cls)); }
    }
    // засклення й контурні перегородки з тонких ліній (лише основний прохід: заповнення злило б ці лінії)
    if (!(opts.fill > 1) && opts.bands !== false) {
      const segs = [...walls.map(a => ({ a: a.o === "h" ? [a.s0, a.c] : [a.c, a.s0], b: a.o === "h" ? [a.s1, a.c] : [a.c, a.s1], t: a.t })), ...dg];
      const wmd = new Uint8Array(wmo); for (let i = 0; i < wmd.length; i++) if (cut[i]) wmd[i] = 1;
      for (const c of bands(img.gray, thr, wmd, w, h, T, segs, opts.dbgBands)) {
        const [p, q] = c.ends, dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), win = c.win ? [{ kind: "window", conf: 0.5, check: true }] : [];
        if (Math.abs(dy) <= L * 0.026 || Math.abs(dx) <= L * 0.026) {
          const o = Math.abs(dy) <= L * 0.026 ? "h" : "v", cc = o === "h" ? (p[1] + q[1]) / 2 : (p[0] + q[0]) / 2, s0 = o === "h" ? Math.min(p[0], q[0]) : Math.min(p[1], q[1]), s1 = o === "h" ? Math.max(p[0], q[0]) : Math.max(p[1], q[1]);
          walls.push({ o, c: cc, t: c.t, s0, s1, ops: win.map(x => Object.assign({ s0: s0 + 1, s1: s1 - 1 }, x)), band: true });
        } else dg.push({ o: "d", a: p, b: q, t: c.t, dx: dx / L, dy: dy / L, win: c.win, band: true });
      }
    }
    // прив'язка кінців до перпендикулярних стін: кути й Т-з'єднання сходяться в осьових лініях
    const snap = T * 1.2;
    for (const a of walls) for (const end of ["s0", "s1"]) {
      let best = null;
      for (const b of walls) { if (b.o === a.o) continue; const d = Math.abs(a[end] - b.c); if (d <= b.t / 2 + snap && a.c >= b.s0 - snap && a.c <= b.s1 + snap && (!best || d < best.d)) best = { d, b }; }
      if (best) { a[end] = best.b.c; a.joined = (a.joined || 0) + 1; (a.jn = a.jn || {})[end] = 1; if (best.b.s0 > a.c) best.b.s0 = Math.min(best.b.s0, a.c); if (best.b.s1 < a.c) best.b.s1 = Math.max(best.b.s1, a.c); }
    }
    // вікно чи двері між вільним кінцем стіни й перпендикулярною стіною (простінка з іншого боку немає — проріз упирається в кут)
    for (const a of walls) for (const end of ["s0", "s1"]) {
      if (a.jn && a.jn[end]) continue;
      const dir = end === "s1" ? 1 : -1; let best = null;
      // перпендикулярна стіна має проходити через лінію цієї стіни (кут), а не лише торкатися її торцем
      // (або закінчується біля неї — кут простінка — лише для короткого прорізу до ~1 м)
      for (const b of walls) { if (b.o === a.o) continue; const strict = a.c - a.t * 0.4 >= b.s0 && a.c + a.t * 0.4 <= b.s1, near = a.c >= b.s0 - b.t && a.c <= b.s1 + b.t; if (!strict && !near) continue;
        const face = b.c - dir * b.t / 2, gap = (face - a[end]) * dir; if (gap >= T * 1.6 && gap <= (strict ? T * 16 : T * 4) && (!best || gap < best.gap)) best = { gap, b, face }; }
      if (!best) continue;
      const g = { o: a.o, c: a.c, t: a.t }, s0 = Math.min(a[end], best.face), s1 = Math.max(a[end], best.face);
      { const mg = Math.max(2, T * 0.5); if (crossed(g, s0 + mg, s1 - mg)) continue; }   // відступ від граней: крайні рядки — ще тіло стін (згладжування, нерівна товщина)
      const cls = classifyGap(img, w, h, g, s0, s1, T, thr);
      // проріз без позначення біля кута (перпендикулярна стіна тут же закінчується, проріз до ~1 м) — типовий дверний проріз
      // між простінком і кутом: закриваємо його як прохід «на перевірку», інакше два приміщення зливаються
      const bEnd = [best.b.s0, best.b.s1].some(e => Math.abs(e - a.c) <= T * 1.5);
      if (cls.kind === "opening" && !(best.gap <= T * 4 && bEnd)) continue;
      if (cls.kind !== "solid") a.ops.push(Object.assign({ s0, s1 }, cls)); a[end] = best.b.c; a.joined = (a.joined || 0) + 1; (a.jn = a.jn || {})[end] = 1;
    }
    // дублікати: паралельна «стіна», що лежить упритул до іншої або накладається на неї на ≥ 50% довжини, — лінія стільниці,
    // шафи чи рами біля справжньої стіни. Одна фізична стіна має бути в даних один раз: лишаємо довшу (за рівності — товщу)
    for (let i = walls.length - 1; i >= 0; i--) {
      const a = walls[i]; if (!a) continue;
      for (let j = 0; j < walls.length; j++) { const b = walls[j]; if (i === j || !b || b.o !== a.o || b.band || a.band) continue;
        const gap = Math.abs(a.c - b.c) - (a.t + b.t) / 2, ov = Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0), la = a.s1 - a.s0, lb = b.s1 - b.s0;
        if (gap <= T * 0.25 && ov >= 0.5 * Math.min(la, lb) && (la < lb || (la === lb && a.t < b.t))) { walls.splice(i, 1); break; } }
    }
    // косі стіни: шматки на одній прямій зливаються; розриви між ними — прорізи (класифікатор у системі координат стіни)
    const dlines = [];
    for (const d of dg) { const nx = -d.dy, ny = d.dx, off = d.a[0] * nx + d.a[1] * ny; let g = dlines.find(L => Math.abs(L.dx * d.dx + L.dy * d.dy) > 0.995 && Math.abs(L.off - off) <= T * 0.6); if (!g) { g = { dx: d.dx, dy: d.dy, nx, ny, off, parts: [] }; dlines.push(g); } const ua = d.a[0] * g.dx + d.a[1] * g.dy, ub = d.b[0] * g.dx + d.b[1] * g.dy; g.parts.push({ s0: Math.min(ua, ub), s1: Math.max(ua, ub), t: d.t, win: d.win }); }
    const diag = [];
    for (const g of dlines) {
      g.parts.sort((p, q) => p.s0 - q.s0); const t = g.parts.reduce((s, p) => s + p.t * (p.s1 - p.s0), 0) / g.parts.reduce((s, p) => s + p.s1 - p.s0, 0);
      const fr = { ox: g.nx * g.off, oy: g.ny * g.off, dx: g.dx, dy: g.dy, nx: g.nx, ny: g.ny };
      let cur = null;
      // смуга засклення — вікно на всю свою довжину
      const winOp = p => p.win ? [{ s0: p.s0 + 1, s1: p.s1 - 1, kind: "window", conf: 0.5, check: true }] : [];
      for (const p of g.parts) {
        if (cur && p.win && p.s0 - cur.s1 < T * 45) { cur.ops.push(...winOp(p)); cur.s1 = Math.max(cur.s1, p.s1); continue; }
        if (cur && p.s0 - cur.s1 >= T * 1.6 && p.s0 - cur.s1 <= T * 45) { const cls = classifyGap(img, w, h, { f: fr, c: 0, t }, cur.s1, p.s0, T, thr); if (cls.kind !== "solid") cur.ops.push(Object.assign({ s0: cur.s1, s1: p.s0 }, cls)); cur.s1 = p.s1; continue; }
        if (cur && p.s0 - cur.s1 < T * 1.6) { cur.s1 = Math.max(cur.s1, p.s1); continue; }
        if (cur) diag.push(cur); cur = { fr, s0: p.s0, s1: p.s1, t, ops: winOp(p) };
      }
      if (cur) diag.push(cur);
    }
    const W0 = walls.filter(a => a.s1 - a.s0 >= T * 1.5);
    const asSeg = a => a.fr ? { a: [a.fr.ox + a.fr.dx * a.s0, a.fr.oy + a.fr.dy * a.s0], b: [a.fr.ox + a.fr.dx * a.s1, a.fr.oy + a.fr.dy * a.s1], t: a.t } : { a: a.o === "h" ? [a.s0, a.c] : [a.c, a.s0], b: a.o === "h" ? [a.s1, a.c] : [a.c, a.s1], t: a.t };
    // частка «чорнила» вихідного зображення (до заповнення) у тілі стіни без прорізів: суцільна стіна ≈ 1, штрихована ≈ 0,3…0,6,
    // «стіна», злита заповненням із тексту чи подвійних ліній, — мало
    const inkOf = (s, t, ops) => { const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1, ux = (s.b[0] - s.a[0]) / L, uy = (s.b[1] - s.a[1]) / L, u0 = s.a[0] * ux + s.a[1] * uy; let n = 0, k = 0;
      for (let q = 0; q <= L; q += 2) { if (ops.some(o => q + u0 >= o.s0 && q + u0 <= o.s1)) continue; for (let v = -t / 2 + 1; v <= t / 2 - 1; v += 2) { const x = Math.round(s.a[0] + ux * q - uy * v), y = Math.round(s.a[1] + uy * q + ux * v); if (x < 0 || y < 0 || x >= w || y >= h) continue; k++; n += m0[y * w + x]; } }
      return k ? n / k : 0; };
    // кінці косих стін прив'язуємо до найближчих кінців інших стін (кути еркерів)
    for (const d of diag) for (const end of ["s0", "s1"]) {
      const s = asSeg(d), p = end === "s0" ? s.a : s.b; let best = null;
      for (const o of [...W0, ...diag]) { if (o === d) continue; const q = asSeg(o); for (const e of [q.a, q.b]) { const dd = Math.hypot(e[0] - p[0], e[1] - p[1]); if (dd <= T * 2.2 && (!best || dd < best.d)) best = { d: dd, e }; } }
      if (best) { d[end] = best.e[0] * d.fr.dx + best.e[1] * d.fr.dy; d.joined = (d.joined || 0) + 1; (d.to = d.to || {})[end] = best.e; }
    }
    const keep = new Set(mainCluster([...W0, ...diag].map(a => Object.assign(asSeg(a), { ref: a })), T).map(s => s.ref));
    let W = W0.filter(a => keep.has(a)), D = diag.filter(a => keep.has(a));
    // прохід із заповненням: «стіна» з малою часткою чорнила, не з'єднана з іншими обома кінцями, — злиті підписи, меблі, розмірні лінії
    if (opts.fill > 1) { W = W.filter(a => (a.joined || 0) >= 2 || inkOf(asSeg(a), a.t, a.ops) >= 0.55); D = D.filter(a => (a.joined || 0) >= 2 || inkOf(asSeg(a), a.t, a.ops) >= 0.55); }
    // ---- кімнати: вільний простір із «закритими» прорізами ----
    const barrier = new Uint8Array(wmo); if (opts.barrier) for (let i = 0; i < barrier.length; i++) if (opts.barrier[i]) barrier[i] = 1;
    for (const a of [...W, ...D]) {
      const r = Math.max(1, Math.round(a.t / 2)), s = asSeg(a);
      // сама стіна (включно з частиною в прорізах) — бар'єр
      line(barrier, w, h, s.a[0], s.a[1], s.b[0], s.b[1], r);
      // кінець косої стіни, прив'язаний до кінця іншої, лежить на своїй прямій, а не в точці стику: домальовуємо перемичку
      if (a.to) for (const end of ["s0", "s1"]) if (a.to[end]) { const p = end === "s0" ? s.a : s.b; line(barrier, w, h, p[0], p[1], a.to[end][0], a.to[end][1], r); }
    }
    const free = new Uint8Array(w * h); for (let i = 0; i < free.length; i++) free[i] = barrier[i] ? 0 : 1;
    const { lab, comps } = label(free, w, h);
    const outsideIds = new Set(comps.filter(c => c.border).map(c => c.id));
    // санвузли й комори бувають лише в кілька товщин зовнішньої стіни
    const minArea = Math.max(400, T * T * 6);
    // ширина області — подвоєна найбільша відстань до межі (фаска 3–4). Фізичне приміщення не вужче за ~1,5 товщини стіни (≈ 0,4 м):
    // такі «кімнати» — проміжки між подвійними лініями, у товщі стіни, між рамами засклення, вентканали
    const dist = new Uint16Array(w * h); for (let i = 0; i < free.length; i++) dist[i] = free[i] ? 65000 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!dist[i]) continue; let d = dist[i]; if (x > 0) d = Math.min(d, dist[i - 1] + 3); if (y > 0) { d = Math.min(d, dist[i - w] + 3); if (x > 0) d = Math.min(d, dist[i - w - 1] + 4); if (x < w - 1) d = Math.min(d, dist[i - w + 1] + 4); } dist[i] = d; }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!dist[i]) continue; let d = dist[i]; if (x < w - 1) d = Math.min(d, dist[i + 1] + 3); if (y < h - 1) { d = Math.min(d, dist[i + w] + 3); if (x < w - 1) d = Math.min(d, dist[i + w + 1] + 4); if (x > 0) d = Math.min(d, dist[i + w - 1] + 4); } dist[i] = d; }
    // і найглибша точка області — завжди всередині навіть Г-подібної кімнати: туди ставимо підпис
    const maxD = new Float64Array(comps.length), pole = new Int32Array(comps.length); for (let i = 0; i < lab.length; i++) { const id = lab[i]; if (id >= 0 && dist[i] > maxD[id]) { maxD[id] = dist[i]; pole[id] = i; } }
    const cand = comps.filter(c => !c.border && c.n >= minArea), artifacts = [];
    const total = cand.reduce((s, c) => s + c.n, 0) || 1;
    const rooms = cand.map(c => {
      const width = 2 * maxD[c.id] / 3;
      if (width < T * 1.6) { artifacts.push({ c: c.c, area: c.n, width, why: "narrow" }); return null; }
      const ring = simplifyRing(contour(lab, w, h, c.id, c.box), Math.max(1.5, T * 0.35));
      const fill = c.n / Math.max(1, (c.box[2] - c.box[0] + 1) * (c.box[3] - c.box[1] + 1));
      // підозріла область: вузька (до ~2,5 товщини стіни), дуже мала відносно квартири або з дуже нерівним контуром — на перевірку, не видаляємо
      const why = width < T * 2.6 ? "narrow" : c.n < total * 0.012 ? "tiny" : fill < 0.35 ? "shape" : null;
      return { poly: ring, area: c.n, c: c.c, lp: [pole[c.id] % w, (pole[c.id] / w) | 0], box: c.box, width, conf: ring.length >= 4 ? Math.min(0.95, 0.55 + fill * 0.4) * (why ? 0.6 : 1) : 0.3, check: ring.length < 4 || !!why, suspect: why };
    }).filter(r => r && r.poly.length >= 3);
    // зовнішні стіни: з одного боку — зовнішній простір
    const sideOut = (a, side) => { let o = 0, n = 0; for (let s = a.s0 + (a.s1 - a.s0) * 0.15; s <= a.s1 - (a.s1 - a.s0) * 0.15; s += Math.max(2, (a.s1 - a.s0) / 12)) { const off = side * (a.t / 2 + Math.max(3, T * 0.6)), x = Math.round(a.o === "h" ? s : a.c + off), y = Math.round(a.o === "h" ? a.c + off : s); if (x < 0 || y < 0 || x >= w || y >= h) { o++; n++; continue; } const id = lab[y * w + x]; n++; if (id < 0 ? false : outsideIds.has(id)) o++; } return n ? o / n : 0; };
    const sideOutD = (s, t) => { const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1, nx = -(s.b[1] - s.a[1]) / L, ny = (s.b[0] - s.a[0]) / L; let best = 0; for (const side of [1, -1]) { let o = 0, n = 0; for (let k = 0.2; k <= 0.81; k += 0.1) { const off = side * (t / 2 + Math.max(3, T * 0.6)), x = Math.round(s.a[0] + (s.b[0] - s.a[0]) * k + nx * off), y = Math.round(s.a[1] + (s.b[1] - s.a[1]) * k + ny * off); n++; if (x < 0 || y < 0 || x >= w || y >= h) { o++; continue; } const id = lab[y * w + x]; if (id >= 0 && outsideIds.has(id)) o++; } best = Math.max(best, o / n); } return best > 0.5; };
    const out = [...W, ...D].map(a => {
      const s = asSeg(a);
      // кінці косої стіни — точно в точках стику (а не їхні проєкції на пряму), щоб план без перемичок теж був замкнений
      if (a.to) { if (a.to.s0) s.a = a.to.s0.slice(); if (a.to.s1) s.b = a.to.s1.slice(); }
      const ext = a.fr ? sideOutD(s, a.t) : Math.max(sideOut(a, 1), sideOut(a, -1)) > 0.5;
      // косі стіни — менша впевненість: їх варто переглянути
      return { a: s.a, b: s.b, t: a.t, ext, ink: inkOf(s, a.t, a.ops), conf: Math.min(0.95, (a.fr ? 0.5 : 0.6) + 0.15 * (a.joined || 0)), check: !a.joined || (!!a.fr && (a.joined || 0) < 2), ops: a.ops, diag: !!a.fr };
    });
    out.forEach((wl, i) => { for (const o of wl.ops) {
      const L = Math.hypot(wl.b[0] - wl.a[0], wl.b[1] - wl.a[1]) || 1, ux = (wl.b[0] - wl.a[0]) / L, uy = (wl.b[1] - wl.a[1]) / L, at = (o.s0 + o.s1) / 2 - (wl.a[0] * ux + wl.a[1] * uy);
      // вікна майже завжди в зовнішніх стінах: у внутрішній — менша впевненість
      const conf = o.kind === "window" && !wl.ext ? o.conf * 0.6 : o.conf;
      openings.push({ wall: i, kind: o.kind, at, width: o.s1 - o.s0, conf, check: o.check || conf < 0.5, hinge: o.hinge || null, swing: o.swing || null });
    } delete wl.ops; });
    return { ok: true, T, Tmin, thr, walls: out, openings, rooms, artifacts, ms: Date.now() - t0 };
  }
  const api = Object.freeze({ _internal: { rects, wallsFrom, lines }, detect, otsu, binarize, dilate, close, open, runs, thickness, rdp, simplifyRing, polyArea });
  if (typeof module === "object" && module.exports) module.exports = api; else root.RozstavPlanDetect = api;
})(typeof window !== "undefined" ? window : this);
