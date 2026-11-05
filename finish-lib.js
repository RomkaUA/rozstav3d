/*
  РОЗСТАВ — матеріали оздоблення (підлога, стіни, рами, двері) і генератор їхніх PBR-текстур.
  ------------------------------------------------------------
  Текстури малюються процедурно на canvas і безшовні (тайлінг без стиків):
    map — колір (Albedo), normal — рельєф (Normal, з карти висот), rough — шорсткість (канал G), ao — затінення швів.
  Розмір одного повтору текстури — tile, у метрах реального світу: UV поверхонь у застосунку теж у метрах,
  тож зміна розміру кімнати чи стіни не розтягує малюнок.

  Схеми укладання (LAYS) для паркету, ламінату й плитки: пряма, діагональна (та сама пряма під 45°),
  ялинка, шеврон, шахова, зі зміщенням.

  Як додати матеріал: допишіть рядок у MATS. gen — генератор (див. GEN нижче), base/base2 — кольори,
  tile — метри на повтор, rough/metal — PBR, normal — сила рельєфу, env — відбиття довкілля.
*/
(function (root) {
  "use strict";
  const CATS = {
    floor: [["wood", "Дерево"], ["laminate", "Ламінат"], ["tile", "Плитка"], ["stone", "Камінь"], ["modern", "Сучасні покриття"], ["soft", "М'які покриття"], ["other", "Інші"]],
    wall: [["paint", "Фарба"], ["wallpaper", "Шпалери"], ["plaster", "Декоративна штукатурка"], ["microcement", "Мікроцемент"], ["concrete", "Бетон"], ["brick", "Цегла"], ["wood", "Дерево"], ["stone", "Камінь"], ["tile", "Плитка"], ["panels3d", "3D-панелі"]],
    frame: [["wood", "Дерево"], ["aluminum", "Алюміній"], ["pvc", "ПВХ"], ["metal", "Метал"]],
    leaf: [["wood", "Дерево"], ["paint", "Фарбовані"], ["glass", "Скло"], ["metal", "Метал"]],
    trim: [["paint", "Фарбовані"], ["wood", "Дерево"], ["metal", "Метал"]]
  };
  const LAYS = [["straight", "Пряма"], ["diagonal", "Діагональна"], ["herringbone", "Ялинка"], ["chevron", "Шеврон"], ["checker", "Шахова"], ["offset", "Зі зміщенням"]];
  // p — параметри генератора: n — довжина планки в ширинах, w — ширина планки чи плитки (м), j — шов (частка), v — розкид кольору
  const M = (id, name, kind, cat, gen, base, o) => Object.assign({ id, name, kind, cat, gen, base, base2: null, tile: 1, rough: 0.6, metal: 0, normal: 0.6, env: 0.3, opacity: 1, lay: "straight", p: {} }, o || {});
  const MATS = [
    // ---- підлога ----
    M("f_parquet", "Паркет дубовий", "floor", "wood", "wood", "#B48A5C", { lay: "herringbone", p: { n: 5, w: 0.07, v: 0.13 }, rough: 0.55, env: 0.35 }),
    M("f_parquet_board", "Паркетна дошка", "floor", "wood", "wood", "#A87D52", { p: { n: 10, w: 0.14, v: 0.1, strips: 3 }, rough: 0.5, env: 0.35 }),
    M("f_solid", "Масив дуба", "floor", "wood", "wood", "#9C7046", { p: { n: 9, w: 0.16, v: 0.16 }, rough: 0.6 }),
    M("f_engineered", "Інженерна дошка", "floor", "wood", "wood", "#C29A6B", { p: { n: 11, w: 0.19, v: 0.09 }, rough: 0.55 }),
    M("f_lam_light", "Ламінат світлий", "floor", "laminate", "wood", "#D7C4A2", { p: { n: 7, w: 0.19, v: 0.06, flat: 1 }, rough: 0.45, env: 0.4 }),
    M("f_lam_dark", "Ламінат темний", "floor", "laminate", "wood", "#5E4330", { p: { n: 7, w: 0.19, v: 0.07, flat: 1 }, rough: 0.45, env: 0.4 }),
    M("f_lam_oak", "Ламінат «натуральний дуб»", "floor", "laminate", "wood", "#B8925F", { p: { n: 7, w: 0.19, v: 0.08, flat: 1 }, rough: 0.48, env: 0.4 }),
    M("f_porcelain", "Керамограніт 60×60", "floor", "tile", "tile", "#C9C6C0", { base2: "#9E9A93", p: { w: 0.6, j: 0.006, v: 0.03, stone: 1 }, rough: 0.3, env: 0.6 }),
    M("f_ceramic", "Керамічна плитка 30×30", "floor", "tile", "tile", "#D9CBB5", { base2: "#A89A85", p: { w: 0.3, j: 0.012, v: 0.05 }, rough: 0.35, env: 0.5 }),
    M("f_marble", "Мармур білий", "floor", "stone", "marble", "#ECEAE6", { base2: "#8F8C88", p: { w: 0.8, j: 0.002 }, tile: 1.6, rough: 0.18, env: 0.8, normal: 0.25 }),
    M("f_travertine", "Травертин", "floor", "stone", "travertine", "#D8C7A8", { base2: "#B49F7C", p: { w: 0.6, j: 0.004 }, tile: 1.2, rough: 0.55, normal: 0.7 }),
    M("f_granite", "Граніт", "floor", "stone", "granite", "#6E6B69", { base2: "#2E2C2B", p: { w: 0.6, j: 0.003 }, tile: 1.2, rough: 0.25, env: 0.7, normal: 0.3 }),
    M("f_microcement", "Мікроцемент", "floor", "modern", "microcement", "#B9B3AA", { tile: 2, rough: 0.62, normal: 0.35, env: 0.25 }),
    M("f_concrete", "Полірований бетон", "floor", "modern", "concrete", "#A3A19D", { tile: 2, rough: 0.28, normal: 0.3, env: 0.6 }),
    M("f_carpet", "Ковролін", "floor", "soft", "carpet", "#8C8579", { tile: 0.5, rough: 0.97, normal: 0.9, env: 0 }),
    M("f_vinyl", "Вініл", "floor", "other", "wood", "#C7AE86", { p: { n: 8, w: 0.18, v: 0.05, flat: 1, shallow: 1 }, rough: 0.5, env: 0.35 }),
    M("f_spc", "SPC-покриття", "floor", "other", "wood", "#9A8466", { p: { n: 7, w: 0.18, v: 0.06, flat: 1 }, rough: 0.42, env: 0.4 }),
    M("f_selflevel", "Наливна підлога", "floor", "other", "selflevel", "#E3E1DC", { tile: 3, rough: 0.12, normal: 0.08, env: 0.9 }),
    // ---- стіни ----
    M("w_paint_white", "Фарба біла", "wall", "paint", "paint", "#F1EFEA", { tile: 1.5, rough: 0.92, normal: 0.15, env: 0.05 }),
    M("w_paint_warm", "Фарба теплий сірий", "wall", "paint", "paint", "#D9D3C9", { tile: 1.5, rough: 0.92, normal: 0.15, env: 0.05 }),
    M("w_paint_sage", "Фарба шавлія", "wall", "paint", "paint", "#B6BFA9", { tile: 1.5, rough: 0.92, normal: 0.15, env: 0.05 }),
    M("w_paint_terra", "Фарба теракота", "wall", "paint", "paint", "#C4825F", { tile: 1.5, rough: 0.9, normal: 0.15, env: 0.05 }),
    M("w_wallpaper_stripe", "Шпалери в смужку", "wall", "wallpaper", "wallpaper", "#E6DED0", { base2: "#CFC2AC", p: { kind: "stripe" }, tile: 0.53, rough: 0.85, normal: 0.25 }),
    M("w_wallpaper_dots", "Шпалери з орнаментом", "wall", "wallpaper", "wallpaper", "#DCE1DA", { base2: "#9DAA9A", p: { kind: "diamond" }, tile: 0.53, rough: 0.85, normal: 0.3 }),
    M("w_plaster", "Венеційська штукатурка", "wall", "plaster", "plaster", "#D8D0C2", { tile: 2, rough: 0.45, normal: 0.35, env: 0.35 }),
    M("w_microcement", "Мікроцемент", "wall", "microcement", "microcement", "#BEB8AF", { tile: 2, rough: 0.65, normal: 0.35 }),
    M("w_concrete", "Бетон", "wall", "concrete", "concrete", "#9E9C98", { tile: 2, rough: 0.85, normal: 0.6, env: 0.05 }),
    M("w_brick_red", "Цегла червона", "wall", "brick", "brick", "#9A5236", { base2: "#CFC6B8", tile: 1, rough: 0.9, normal: 1 }),
    M("w_brick_white", "Цегла фарбована біла", "wall", "brick", "brick", "#ECE8E1", { base2: "#D7D2CA", tile: 1, rough: 0.85, normal: 0.8 }),
    M("w_wood_slats", "Дерев'яні рейки", "wall", "wood", "slats", "#9B7350", { base2: "#2B2420", tile: 0.6, rough: 0.6, normal: 1 }),
    M("w_stone", "Натуральний камінь", "wall", "stone", "stonewall", "#A79F92", { base2: "#6B655C", tile: 1.2, rough: 0.85, normal: 1.1 }),
    M("w_tile_metro", "Плитка «кабанчик»", "wall", "tile", "tile", "#F2F0EC", { base2: "#BDB8B0", lay: "offset", p: { w: 0.1, n: 2, j: 0.03, v: 0.03, bevel: 1 }, tile: 0.4, rough: 0.15, env: 0.7 }),
    M("w_panel_wave", "3D-панелі «хвиля»", "wall", "panels3d", "panels3d", "#E7E4DE", { p: { kind: "wave" }, tile: 0.5, rough: 0.7, normal: 1.6 }),
    M("w_panel_hex", "3D-панелі «соти»", "wall", "panels3d", "panels3d", "#D9D6D0", { p: { kind: "hex" }, tile: 0.5, rough: 0.7, normal: 1.6 }),
    // ---- рами вікон, двері, плінтуси ----
    M("fr_wood", "Дерево (рама)", "frame", "wood", "wood", "#8A6343", { p: { n: 12, w: 0.08, v: 0.05 }, tile: 1, rough: 0.6, normal: 0.3 }),
    M("fr_alu", "Алюміній", "frame", "aluminum", "flat", "#A8ADB2", { rough: 0.35, metal: 0.9, env: 0.8, normal: 0 }),
    M("fr_pvc", "ПВХ білий", "frame", "pvc", "flat", "#F4F4F2", { rough: 0.45, env: 0.25, normal: 0 }),
    M("fr_metal", "Метал чорний", "frame", "metal", "flat", "#2B2C2E", { rough: 0.5, metal: 0.8, env: 0.5, normal: 0 }),
    M("l_oak", "Дуб (полотно)", "leaf", "wood", "wood", "#B08A5E", { p: { n: 14, w: 0.2, v: 0.05 }, tile: 2.8, rough: 0.55, normal: 0.3 }),
    M("l_walnut", "Горіх (полотно)", "leaf", "wood", "wood", "#5C4030", { p: { n: 14, w: 0.2, v: 0.05 }, tile: 2.8, rough: 0.5, normal: 0.3 }),
    M("l_white", "Емаль біла", "leaf", "paint", "flat", "#F3F2EF", { rough: 0.35, env: 0.3, normal: 0 }),
    M("l_graphite", "Емаль графіт", "leaf", "paint", "flat", "#3F4246", { rough: 0.35, env: 0.3, normal: 0 }),
    M("l_steel", "Сталь (вхідні)", "leaf", "metal", "flat", "#4A4D52", { rough: 0.4, metal: 0.85, env: 0.6, normal: 0 }),
    M("t_white", "Біла фарба (плінтус, карниз)", "trim", "paint", "flat", "#F5F4F0", { rough: 0.5, env: 0.15, normal: 0 }),
    M("t_oak", "Дуб (плінтус)", "trim", "wood", "wood", "#A47C52", { p: { n: 30, w: 0.1, v: 0.04 }, tile: 3, rough: 0.55, normal: 0.2 }),
    M("t_brass", "Латунь (поріг, ручки)", "trim", "metal", "flat", "#B08D57", { rough: 0.3, metal: 1, env: 0.9, normal: 0 }),
    M("t_alu", "Алюміній (поріг)", "trim", "metal", "flat", "#B4B8BC", { rough: 0.35, metal: 0.9, env: 0.8, normal: 0 })
  ];
  const BY = Object.fromEntries(MATS.map(m => [m.id, m]));

  // ---------- допоміжне: колір, шум ----------
  const hex = h => { const v = parseInt(String(h || "#888888").slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const hash = (a, b = 0, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // безшовний value-noise: решітка з періодом per
  function noise(x, y, per, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (i, j) => hash(((i % per) + per) % per, ((j % per) + per) % per, seed);
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(u, v, base, oct, seed) { let s = 0, a = 0.5, f = base, n = 0; for (let k = 0; k < oct; k++) { s += a * noise(u * f, v * f, f, seed + k * 17); n += a; a *= 0.5; f *= 2; } return s / n; }

  // ---------- схеми укладання ----------
  // Повертає функцію (x, y) → { ox, oy, a, c, e, o }: ox/oy — початок планки (за ним генератор рахує її номер за модулем повтору, тож тон не «рветься» на стику) у «пазових» одиницях: ширина планки/плитки = 1, довжина = n.
  // a — координата вздовж планки (0…n), c — поперек (0…1), e — відстань до краю, o — орієнтація (0/1); і період PX×PY.
  function layout(kind, n) {
    if (kind === "herringbone") {
      // перевірено: пара H=[0,n]×[0,1], V=[0,1]×[1,n+1] з решіткою (1,1), (n,−n) покриває площину без накладань; період 2n×2n
      return { PX: 2 * n, PY: 2 * n, f(x, y) {
        const j0 = Math.round((x - y) / (2 * n));
        for (let j = j0 - 2; j <= j0 + 2; j++) {
          let i = Math.floor(y + j * n), lx = x - i - j * n, ly = y - i + j * n;
          if (lx >= 0 && lx < n && ly >= 0 && ly < 1) return { ox: i + j * n, oy: i - j * n, a: lx, c: ly, e: Math.min(lx, n - lx, ly, 1 - ly), o: 0 };
          i = Math.floor(x - j * n); lx = x - i - j * n; ly = y - i + j * n;
          if (lx >= 0 && lx < 1 && ly >= 1 && ly < n + 1) return { ox: i + j * n, oy: i - j * n + 1, a: ly - 1, c: lx, e: Math.min(lx, 1 - lx, ly - 1, n + 1 - ly), o: 1 };
        }
        return { ox: 0, oy: 0, a: 0, c: 0, e: 0, o: 0 };
      } };
    }
    if (kind === "chevron") {
      const cw = Math.max(2, Math.round(n / 1.6));
      return { PX: 2 * cw, PY: 2 * cw, f(x, y) {
        const col = Math.floor(x / cw), lx = x - col * cw, s = (col & 1) ? cw - lx : lx, yy = y + s, row = Math.floor(yy), c = yy - row;
        return { ox: col * cw, oy: row, a: lx * 1.414, c, e: Math.min(c, 1 - c, lx, cw - lx), o: col & 1 };
      } };
    }
    if (kind === "checker") {
      return { PX: 2 * n, PY: 2 * n, f(x, y) {
        const bx = Math.floor(x / n), by = Math.floor(y / n), o = (bx + by) & 1, lx = x - bx * n, ly = y - by * n;
        const across = o ? lx : ly, along = o ? ly : lx, k = Math.floor(across), c = across - k;
        return { ox: bx * n + (o ? k : 0), oy: by * n + (o ? 0 : k), a: along, c, e: Math.min(c, 1 - c, along, n - along), o, blk: o };
      } };
    }
    // straight / offset / diagonal: ряди висотою 1, планки довжиною n. Пряма — випадкове зміщення рядів, «зі зміщенням» — на половину
    const rows = n % 2 ? 2 * n : Math.max(2, n);   // парна кількість рядів — щоб зміщення не збивалося на стику повторів
    return { PX: n, PY: rows, f(x, y) {
      const r = Math.floor(y), rr = ((r % rows) + rows) % rows, sh = kind === "offset" ? (rr & 1) * n / 2 : kind === "grid" ? 0 : Math.floor(hash(rr, 3) * n * 4) / 4, xx = x + sh, k = Math.floor(xx / n), a = xx - k * n, c = y - r;
      return { ox: k * n - sh, oy: r, a, c, e: Math.min(c, 1 - c, a, n - a), o: 0 };
    } };
  }

  // ---------- генератори ----------
  // кожен заповнює масиви кольору (rgb 0…1), висоти (0…1) і шорсткості (множник 0…1) для пікселя (u, v ∈ [0,1))
  const SIZE = 512;
  function generate(def, lay) {
    const S = SIZE, col = new Float32Array(S * S * 3), hgt = new Float32Array(S * S), rgh = new Float32Array(S * S), ao = new Float32Array(S * S).fill(1);
    const b = hex(def.base).map(v => v / 255), b2 = hex(def.base2 || def.base).map(v => v / 255), p = def.p || {}, seed = (def.seed || 7) | 0;
    const set = (i, r, g, bb, h, ro, oc) => { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = bb; hgt[i] = h; rgh[i] = ro; if (oc != null) ao[i] = oc; };
    const mix = (c1, c2, t) => [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
    const g = def.gen;
    let tile = def.tile || 1;   // метрів на повтор (для планок і плитки рахується з розміру елемента)
    if (g === "wood" || g === "tile") {
      const isWood = g === "wood", n = isWood ? (p.n || 6) : (p.n || 1), kind = lay === "diagonal" ? "straight" : (lay || def.lay || "straight");
      // плитка: пряма — сітка; ялинка/шеврон для плитки — прямокутна плитка 1×2
      const L = layout(!isWood && kind === "straight" ? "grid" : kind, !isWood && (kind === "herringbone" || kind === "chevron") ? Math.max(2, n) : n);
      // квадратний повтор: найменше спільне кратне періодів (інакше плитка розтягнеться); кілька періодів — щоб розкид кольору не повторювався помітно
      const gcd = (a, c) => c ? gcd(c, a % c) : a, lcm = L.PX * L.PY / gcd(L.PX, L.PY), reps = Math.max(1, Math.round(4 / lcm));
      const UX = lcm * reps, UY = UX; tile = (p.w || 0.1) * UX;
      const joint = isWood ? (p.shallow ? 0.015 : 0.03) : (p.j || 0.008) / (p.w || 0.3), grainF = 6 + (p.w || 0.1) * 40;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        const i = yy * S + xx, x = xx / S * UX, y = yy / S * UY, q = L.f(x, y), md = (v, m) => ((Math.round(v * 8) % (m * 8)) + m * 8) % (m * 8);
        q.id = md(q.ox, UX) * 100003 + md(q.oy, UY) * 2 + q.o; const r1 = hash(q.id, 11, seed), r2 = hash(q.id, 23, seed);
        const groove = q.e < joint ? 1 - q.e / joint : 0;
        if (isWood) {
          const strips = p.strips || 1, sc = q.c * strips, sid = Math.floor(sc);   // паркетна дошка: кілька ламелей у дошці
          const ra = hash(q.id * 4 + sid, 31, seed), tone = (r1 - 0.5) * (p.v || 0.1) * 2 + (ra - 0.5) * (strips > 1 ? 0.08 : 0);
          const gn = fbm(q.a * 0.35 + r2 * 9, (sc - sid + r1) * 0.8, 4, 3, seed + 5), grain = Math.sin((q.c * grainF + gn * 7 + r2 * 20) * 3.1) * 0.5 + 0.5;
          const k = 1 + tone + (grain - 0.5) * (p.flat ? 0.05 : 0.1) - groove * 0.35;
          const cc = b.map(v => Math.max(0, Math.min(1, v * k)));
          set(i, cc[0], cc[1], cc[2], 0.85 - groove * 0.85 + grain * 0.06, 0.92 + grain * 0.08 + groove * 0.1, 1 - groove * 0.5);
        } else {
          const alt = (q.o || q.blk) && kind === "checker" ? b2 : b, tone = (r1 - 0.5) * (p.v || 0.04) * 2;
          const vein = p.stone ? (fbm(x / UX * 3 + r2, y / UY * 3, 3, 3, seed) - 0.5) * 0.08 : 0;
          const bev = p.bevel ? Math.min(1, q.e / 0.08) : 1;
          const cc = groove > 0 ? b2 : alt.map(v => v * (1 + tone + vein) * (0.9 + 0.1 * bev));
          set(i, cc[0], cc[1], cc[2], groove > 0 ? 0.1 : 0.6 + 0.4 * bev, groove > 0 ? 1 : 0.9 + vein, groove > 0 ? 0.6 : 1);
        }
      }
    } else {
      const P = 8;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        const i = yy * S + xx, u = xx / S, v = yy / S;
        if (g === "marble") {
          const n1 = fbm(u, v, 3, 5, seed), vein = Math.pow(Math.abs(Math.sin((u * 2 + v + n1 * 3.2) * Math.PI * 2)), 0.12), t = 1 - vein;
          const fine = fbm(u, v, 24, 2, seed + 9) * 0.04, cc = mix(b, b2, Math.min(1, t * 0.9)).map(c => c * (0.98 + fine));
          set(i, cc[0], cc[1], cc[2], 0.5 + fine, 1, null);
        } else if (g === "travertine") {
          const band = fbm(u * 0.3, v * 3, 4, 4, seed), pit = fbm(u, v, 40, 2, seed + 3) > 0.72 ? 1 : 0, t = band * 0.8;
          const cc = mix(b, b2, t).map(c => c * (1 - pit * 0.25));
          set(i, cc[0], cc[1], cc[2], 0.6 - pit * 0.5 + band * 0.2, 1 + pit * 0.05, 1 - pit * 0.3);
        } else if (g === "granite") {
          const n1 = fbm(u, v, 48, 2, seed), n2 = fbm(u, v, 96, 1, seed + 2), t = n1 > 0.58 ? 1 : n2 > 0.75 ? 0.5 : 0;
          const cc = mix(b, b2, t).map(c => c * (0.94 + n2 * 0.12)); if (n2 > 0.88) cc[0] = cc[1] = cc[2] = 0.85;
          set(i, cc[0], cc[1], cc[2], 0.5 + n1 * 0.1, 1, null);
        } else if (g === "microcement" || g === "plaster" || g === "concrete" || g === "selflevel" || g === "paint") {
          const big = fbm(u, v, g === "paint" ? 6 : 3, 5, seed), fine = fbm(u, v, 64, 2, seed + 4);
          const amp = g === "concrete" ? 0.14 : g === "plaster" ? 0.12 : g === "microcement" ? 0.1 : g === "selflevel" ? 0.03 : 0.025;
          const pore = g === "concrete" && fine > 0.8 ? 1 : 0, trowel = g === "plaster" || g === "microcement" ? Math.sin((u * 3 + big * 4) * 6.28) * 0.5 + 0.5 : 0.5;
          const k = 1 + (big - 0.5) * amp * 2 + (fine - 0.5) * amp * 0.5 - pore * 0.2;
          set(i, b[0] * k, b[1] * k, b[2] * k, 0.5 + (fine - 0.5) * (g === "paint" ? 0.3 : 0.6) - pore * 0.4 + (trowel - 0.5) * 0.1, g === "plaster" ? 0.6 + trowel * 0.6 : 0.9 + big * 0.2, 1 - pore * 0.3);
        } else if (g === "carpet") {
          const f1 = noise(u * 256, v * 256, 256, seed), f2 = fbm(u, v, 8, 3, seed + 1), k = 0.88 + f1 * 0.16 + (f2 - 0.5) * 0.08;
          set(i, b[0] * k, b[1] * k, b[2] * k, f1, 1, 0.85 + f1 * 0.15);
        } else if (g === "brick") {
          const bw = 0.25, bh = 0.065, jt = 0.012, rows = Math.round(1 / (bh + jt)), ry = v * rows, r = Math.floor(ry), sh = (r & 1) * 0.5, bx = u * 4 + sh, k = Math.floor(bx);
          const lx = bx - k, ly = ry - r, jx = jt / bw * 1.0, jy = jt / (bh + jt), mortar = lx < jx || ly < jy;
          const rb = hash(k % 4, r % rows, seed), n1 = fbm(u, v, 32, 2, seed + 2);
          const cc = mortar ? b2.map(c => c * (0.95 + n1 * 0.1)) : b.map(c => c * (0.85 + rb * 0.25 + (n1 - 0.5) * 0.15));
          set(i, cc[0], cc[1], cc[2], mortar ? 0.15 : 0.7 + n1 * 0.3, mortar ? 1 : 0.95, mortar ? 0.6 : 1);
        } else if (g === "slats") {
          const k = Math.floor(u * 10), lx = u * 10 - k, gap = lx > 0.78, r1 = hash(k, 5, seed), gr = Math.sin((u * 10 * 18 + fbm(u, v, 8, 3, seed) * 6) * 3) * 0.5 + 0.5;
          const cc = gap ? b2 : b.map(c => c * (0.9 + r1 * 0.2 + (gr - 0.5) * 0.08));
          set(i, cc[0], cc[1], cc[2], gap ? 0 : 0.9 + gr * 0.05, 1, gap ? 0.4 : 1);
        } else if (g === "stonewall") {
          const rows = 6, r = Math.floor(v * rows), ly = v * rows - r, cells = 3 + (hash(r, 1, seed) * 2 | 0), sh = hash(r, 2, seed), bx = (u + sh) * cells, k = Math.floor(bx), lx = bx - k;
          const e = Math.min(lx, 1 - lx, ly * 1.6, (1 - ly) * 1.6), mortar = e < 0.06, rb = hash(k % cells, r, seed), n1 = fbm(u, v, 16, 3, seed);
          const cc = mortar ? b2 : mix(b, b2, rb * 0.5).map(c => c * (0.9 + n1 * 0.2));
          set(i, cc[0], cc[1], cc[2], mortar ? 0.05 : 0.5 + Math.min(1, e * 4) * 0.4 + n1 * 0.1, 1, mortar ? 0.5 : 1);
        } else if (g === "wallpaper") {
          let t;
          if (p.kind === "stripe") t = (u * 8) % 1 < 0.5 ? 0 : 1;
          else { const a = Math.abs(((u * 4) % 1) - 0.5) + Math.abs(((v * 4) % 1) - 0.5); t = a < 0.22 ? 1 : 0; }
          const f = fbm(u, v, 64, 2, seed) * 0.04, cc = mix(b, b2, t * 0.85).map(c => c * (0.98 + f));
          set(i, cc[0], cc[1], cc[2], 0.5 + t * 0.15 + f, 1, null);
        } else if (g === "panels3d") {
          let h;
          if (p.kind === "hex") { const a = u * 4, bb = v * 4 * 1.1547, c = Math.abs(Math.sin(a * Math.PI)) * Math.abs(Math.sin((bb + (Math.floor(a) & 1) * 0.5) * Math.PI)); h = Math.pow(c, 0.5); }
          else h = Math.sin(u * Math.PI * 4 + Math.sin(v * Math.PI * 2) * 1.5) * 0.5 + 0.5;
          const k = 0.85 + h * 0.15; set(i, b[0] * k, b[1] * k, b[2] * k, h, 1, 0.75 + h * 0.25);
        } else {
          const f = fbm(u, v, 16, 2, seed) * 0.03; set(i, b[0] * (0.985 + f), b[1] * (0.985 + f), b[2] * (0.985 + f), 0.5, 1, null);
        }
      }
    }
    return { S, col, hgt, rgh, ao, tile };
  }

  // карти → canvas: колір (sRGB), нормалі з висоти (Собель із загортанням країв), шорсткість у G, AO
  function toCanvases(gen, mk) {
    const { S, col, hgt, rgh, ao } = gen, cv = () => { const c = mk(S); return [c, c.getContext("2d")]; };
    const [cc, cx] = cv(), [nc, nx] = cv(), [rc, rx] = cv(), [ac, ax] = cv();
    const ci = cx.createImageData(S, S), ni = nx.createImageData(S, S), ri = rx.createImageData(S, S), ai = ax.createImageData(S, S);
    const H = (x, y) => hgt[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, o = i * 4;
      ci.data[o] = Math.min(255, col[i * 3] * 255); ci.data[o + 1] = Math.min(255, col[i * 3 + 1] * 255); ci.data[o + 2] = Math.min(255, col[i * 3 + 2] * 255); ci.data[o + 3] = 255;
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      const k = 2.2, l = Math.hypot(dx * k, dy * k, 1);
      ni.data[o] = (-dx * k / l * 0.5 + 0.5) * 255; ni.data[o + 1] = (dy * k / l * 0.5 + 0.5) * 255; ni.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[o + 3] = 255;
      const r = Math.max(0, Math.min(1, rgh[i])) * 255; ri.data[o] = r; ri.data[o + 1] = r; ri.data[o + 2] = r; ri.data[o + 3] = 255;
      const a = Math.max(0, Math.min(1, ao[i])) * 255; ai.data[o] = a; ai.data[o + 1] = a; ai.data[o + 2] = a; ai.data[o + 3] = 255;
    }
    cx.putImageData(ci, 0, 0); nx.putImageData(ni, 0, 0); rx.putImageData(ri, 0, 0); ax.putImageData(ai, 0, 0);
    return { map: cc, normal: nc, rough: rc, ao: ac };
  }
  // ключ зображення: лише те, що змінює картинку (колір, генератор, схема); PBR-повзунки й масштаб текстуру не перегенеровують
  const imageKey = (def, lay) => [def.gen, def.base, def.base2, JSON.stringify(def.p || {}), def.seed || 7, def.gen === "wood" || def.gen === "tile" ? (lay === "diagonal" ? "straight" : lay || def.lay) : ""].join("|");
  const api = Object.freeze({ CATS, LAYS, MATS, BY, layout, generate, toCanvases, imageKey, patterned: def => def.gen === "wood" || def.gen === "tile" });
  if (typeof module === "object" && module.exports) module.exports = api; else root.RozstavFinish = api;
})(typeof window !== "undefined" ? window : this);
