// Розстав 3D · мови інтерфейсу: українська (основна), English, 中文.
// Шар поверх готового інтерфейсу: перекладає текст на екрані за словником i18n-data.js, тож решті коду про мови знати не треба.
// Для української не робить нічого. Дані проєкту (назви кімнат, збережені файли) не змінюються: перекладається лише показ.
(function () {
  "use strict";
  const LANGS = { uk: "Українська", en: "English", zh: "中文" }, KEY = "rozstav.lang";
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  // Перший запуск: сайт бере мову браузера; програма для Windows лишається українською, доки людина не вибере іншу.
  function detect() { if (window.rozstavDesktop || location.protocol === "app:") return "uk"; const n = String(navigator.language || "").toLowerCase(); return n.startsWith("zh") ? "zh" : n.startsWith("en") ? "en" : n.startsWith("uk") ? "uk" : "en"; }
  const saved = read(), lang = LANGS[saved] ? saved : detect(), idx = lang === "en" ? 0 : 1;
  const CY = /[А-Яа-яЇїІіЄєҐґ]/, NUM = /\d+(?:[.,]\d+)*/g;
  const num = s => s.replace(/(\d),(\d)/g, "$1.$2");
  const UNITS = { uk: null, en: { "мм": "mm", "см": "cm", "м²": "m²", "м": "m", "МБ": "MB", "КБ": "KB", "ГБ": "GB", "с": "s", "хв": "min", "мс": "ms" }, zh: { "мм": "毫米", "см": "厘米", "м²": "平方米", "м": "米", "МБ": "MB", "КБ": "KB", "ГБ": "GB", "с": "秒", "хв": "分钟", "мс": "毫秒" } }[lang];
  const D = lang === "uk" ? null : window.ROZSTAV_I18N || {};
  const cache = new Map();
  let pats = null;
  const esc = s => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/[{}]/g, m => "\\" + m);
  function patterns() {
    if (pats) return pats; pats = [];
    for (const k of Object.keys(D)) { if (!k.includes("{}") || !CY.test(k)) continue; const lit = k.split("{}").map(s => s.trim()).filter(Boolean).sort((a, b) => b.length - a.length)[0] || ""; if (!CY.test(lit)) continue; pats.push({ k, lit, n: k.replace(/\{\}/g, "").length, re: new RegExp("^" + k.split("{}").map(esc).join("(.*?)") + "$") }); }
    pats.sort((a, b) => b.n - a.n); return pats;
  }
  const fill = (tpl, args) => { let i = 0; return tpl.replace(/\{\}/g, () => { const a = args[i++]; return a == null ? "" : a; }); };
  function units(s) { return s.replace(/(^|[\d\s(·×])(мм|см|м²|мс|м|МБ|КБ|ГБ|хв|с)(?=$|[\s),.;:·])/g, (m, a, u) => a + UNITS[u]); }
  function lookup(s, depth) {
    if (Object.prototype.hasOwnProperty.call(D, s)) return D[s][idx];
    // назви предметів у реченнях пишуться з малої літери: шукаємо й такий варіант
    { const u = s.charAt(0).toUpperCase() + s.slice(1); if (u !== s && Object.prototype.hasOwnProperty.call(D, u)) { const r = D[u][idx]; return lang === "en" ? r.charAt(0).toLowerCase() + r.slice(1) : r; } }
    const nums = []; const masked = s.replace(NUM, m => { nums.push(m); return "{}"; });
    if (nums.length && Object.prototype.hasOwnProperty.call(D, masked)) return fill(D[masked][idx], nums.map(num));
    if (depth > 3) return null;
    for (const p of patterns()) { if (p.lit && !masked.includes(p.lit) && !s.includes(p.lit)) continue; const m = p.re.exec(s); if (m && p.lit.length <= 4 && m.slice(1).some(a => !/^[\d\s.,:×-]*$/.test(a))) continue; if (m) return fill(D[p.k][idx], m.slice(1).map(a => CY.test(a) ? tr(a, depth + 1) : num(a))); }
    // складені написи: перекладаємо частини між роздільниками
    let best = null, bestCy = Infinity; const cyr = x => (x.match(/[А-Яа-яЇїІіЄєҐґ]/g) || []).length;
    for (const sep of [". ", " · ", " — ", ": ", ", "]) { if (!s.includes(sep)) continue; const parts = s.split(sep), out = parts.map(p => { if (sep === ". " && !p.endsWith(".")) { const a = tr(p + ".", depth + 1); if (a !== p + ".") return a.replace(/[.。]$/, ""); } return tr(p, depth + 1); }); if (!out.some((p, i) => p !== parts[i])) continue; const j = out.join(sep), c = cyr(j); if (c < bestCy) { best = j; bestCy = c; } if (!c) break; }
    return best;
  }
  function tr(raw, depth = 0) {
    if (!D || raw == null || typeof raw !== "string" || !CY.test(raw)) return raw;
    if (cache.has(raw)) return cache.get(raw);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw), core = m[2].replace(/\s+/g, " ");
    let r = lookup(core, depth);
    if (r == null) { r = UNITS ? units(core) : core; }
    else if (CY.test(r) && UNITS) r = units(r);
    const out = m[1] + r + m[3];
    if (cache.size > 20000) cache.clear();
    cache.set(raw, out);
    return out;
  }

  if (lang !== "uk") {
    const ATTRS = ["data-tip", "aria-label", "placeholder", "title", "alt", "label"];
    const skip = el => { if (!el) return true; const t = el.tagName; return t === "SCRIPT" || t === "STYLE" || t === "TEXTAREA" || (el.closest && el.closest(".no-i18n,[contenteditable]")); };
    const node = n => {
      if (n.nodeType === 3) { if (CY.test(n.nodeValue) && !skip(n.parentElement)) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } return; }
      if (n.nodeType !== 1 || skip(n)) return;
      elem(n);
      const w = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); let c;
      while ((c = w.nextNode())) { if (c.nodeType === 3) { if (CY.test(c.nodeValue) && !skip(c.parentElement)) { const v = tr(c.nodeValue); if (v !== c.nodeValue) c.nodeValue = v; } } else elem(c); }
    };
    function elem(e) {
      if (e.closest && e.closest(".no-i18n")) return;
      for (const a of ATTRS) { const v = e.getAttribute && e.getAttribute(a); if (v && CY.test(v)) { const t = tr(v); if (t !== v) e.setAttribute(a, t); } }
      // типові назви в полях («Приміщення 1»): показ перекладено, власний текст людини словника не має й лишається як є
      if (e.tagName === "INPUT" && (e.type === "text" || e.type === "") && CY.test(e.value)) { const core = e.value.trim(), t = tr(core); if (t !== core && !CY.test(t)) e.value = t; }
    }
    const mo = new MutationObserver(list => { for (const m of list) { try { if (m.type === "characterData") node(m.target); else if (m.type === "attributes") elem(m.target); else m.addedNodes.forEach(node); } catch (e) { console.warn("i18n", e); } } });
    mo.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    // підписи на полотні (план, мініатюри) і системні вікна
    const P = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (P) { const ft = P.fillText, mt = P.measureText; P.fillText = function (s, ...a) { return ft.call(this, tr(s), ...a); }; P.measureText = function (s) { return mt.call(this, tr(s)); }; }
    for (const f of ["alert", "confirm", "prompt"]) { const o = window[f]; if (o) window[f] = function (s, ...a) { return o.call(window, tr(String(s)), ...a); }; }
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    if (lang === "zh") addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = ':root{--f-body:"Manrope","Microsoft YaHei","PingFang SC","Noto Sans SC",system-ui,sans-serif;--f-display:"Microsoft YaHei","PingFang SC","Noto Sans SC",system-ui,sans-serif}'; document.head.appendChild(st); });
  }

  window.I18N = {
    lang, LANGS, t: tr,
    // Зміна мови: зберігаємо проєкт і перезавантажуємо вікно, тож весь інтерфейс будується вже новою мовою.
    async set(l) {
      if (!LANGS[l] || l === lang) return;
      try { localStorage.setItem(KEY, l); } catch (e) {}
      try { if (typeof window.flushSave === "function") await window.flushSave(); } catch (e) {}
      try { if (window.rozstavDesktop && window.rozstavDesktop.setLang) await window.rozstavDesktop.setLang(l); } catch (e) {}
      location.reload();
    }
  };
})();
