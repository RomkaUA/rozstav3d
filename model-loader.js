/*
  РОЗСТАВ — завантаження реальних 3D-моделей (GLB)
  ------------------------------------------------------------
  Два джерела моделей з одним форматом опису (див. model-catalog.json):
    • локальний каталог (source: "local") — файли лежать у assets/models, працюють без інтернету;
    • сервер моделей (source: "remote") — каталог і файли приходять з API /api/models
      (зараз це демонстраційний mock у server.ps1, див. MODEL_SERVER_ARCHITECTURE.md).
  Поля source і tier незалежні: де лежить файл і хто має до нього доступ — різні питання.

  Опис моделі → предмет галереї (той самий формат, що в library.js) з type: "glb".
  Редактор будує предмет як завжди: спершу напівпрозора «коробка» потрібного розміру,
  а коли GLB завантажиться, коробка замінюється моделлю. Тому переміщення, поворот,
  сітка 5 см, ергономіка, undo/redo і збереження працюють так само, як для процедурних меблів.

  Геометрія й текстури однієї моделі спільні для всіх її копій у сцені (кеш за URL).
  Коли копій не лишилося, модель тримається в кеші ще хвилину, потім звільняється з GPU.
*/
(() => {
"use strict";
const MAX_PARALLEL = 3;          // одночасних завантажень, щоб не душити слабкі ПК
const KEEP_UNUSED_MS = 60000;    // скільки тримати модель без копій у сцені
const API = (window.ROZSTAV_MODEL_API || "api").replace(/\/$/, "");

const loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
const cache = new Map();         // url -> { promise, template, size, refs, timer, bytes }
const queue = []; let active = 0;
let pending = 0; const listeners = new Set();
const notify = () => listeners.forEach(f => { try { f(pending); } catch (e) {} });

// ---------- метадані ----------
const MOUNT = { floor: undefined, top: "top", wall: "wall", ceiling: "ceiling" };
const LAMP_OF = { ceiling: "pendant", wall: "sconce", top: "table_lamp", floor: "floor_lamp" };
// типові ергономічні зони за назвою моделі, якщо в каталозі немає своїх
function guessClear(e) {
  const n = (e.nameEn || e.name || "").toLowerCase();
  if (/sofa|couch|day ?bed/.test(n)) return { clear: { front: 35, frontLabel: "до столика / проходу" }, surface: 0.55 };
  if (/bed/.test(n)) return { clear: { side: 60, front: 60, frontLabel: "біля ліжка" } };
  if (/arm ?chair|lounge|rocking|ottoman/.test(n)) return { clear: { front: 40 }, surface: 0.55 };
  if (/chair|stool/.test(n)) return { tuck: true, surface: 0.52 };
  if (/desk/.test(n)) return { clear: { front: 90, frontLabel: "для стільця" } };
  if (/commode|drawer|dresser/.test(n)) return { clear: { front: 90, frontLabel: "для шухляд" } };
  if (/cabinet|wardrobe|bookshelf|shelves|shelf/.test(n)) return { clear: { front: 60 } };
  if (/bench/.test(n)) return { clear: { front: 40 } };
  return {};
}
// єдиний опис моделі -> предмет галереї (сумісний з library.js)
function toItem(e) {
  const dim = e.dimensions || {}, g = guessClear(e), mount = MOUNT[e.mount || "floor"];
  const h = Math.max(1, Math.round(dim.h || 50));
  const it = {
    id: e.id, name: e.name, cat: e.category, type: "glb", glb: true,
    w: Math.max(1, Math.round(dim.w || 50)), d: Math.max(1, Math.round(dim.d || 50)), h,
    premium: e.tier === "premium", tier: e.tier || "free", source: e.source || "local",
    model: e.model, thumb: e.thumbnail, license: e.license || null, version: e.version || 1,
    lod: e.lod || null, bytes: e.bytes || 0, orient: e.orient || 0,
    // для вкладок бібліотеки: англійська назва (класифікація за типом), явний тип із каталогу, дата додавання
    nameEn: e.nameEn || "", typeId: e.typeId || null, added: e.added || e.published || null
  };
  if (mount) it.mount = mount;
  if (e.elev != null) it.elev = e.elev;
  const clear = e.clear || g.clear; if (clear) it.clear = clear;
  if (e.tuck != null ? e.tuck : g.tuck) it.tuck = true;
  if (e.surface != null) it.surface = e.surface; else if (g.surface) it.surface = Math.round(h * g.surface);
  if (e.category === "light" || e.lamp) { it.lamp = true; it.lampType = LAMP_OF[e.mount || "floor"]; }
  return it;
}

// ---------- завантаження GLB ----------
function pump() {
  while (active < MAX_PARALLEL && queue.length) {
    const job = queue.shift(); active++;
    loader.load(job.url, gltf => { active--; job.ok(gltf); pump(); }, undefined, err => { active--; job.fail(err); pump(); });
  }
}
function fetchGltf(url) { return new Promise((ok, fail) => { queue.push({ url, ok, fail }); pump(); }); }

function prepare(gltf) {
  const root = gltf.scene || gltf.scenes[0];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (o.geometry) o.geometry.userData.shared = true;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m) continue;
      m.userData.glb = true;   // фото-рендер знає, що це матеріал із GLB
      // скло й прозорі частини: тінь від них заважає, а трасування світла рахує їх окремо
      if (m.transparent || m.transmission > 0) o.castShadow = false;
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  return { template: root, box, size: box.getSize(new THREE.Vector3()) };
}

function acquire(url) {
  let c = cache.get(url);
  if (!c) {
    if (!loader) return Promise.reject(new Error("GLTFLoader не завантажився"));
    c = { refs: 0, timer: 0, template: null, size: null, box: null };
    pending++; notify();
    c.promise = fetchGltf(url).then(prepare).then(r => { Object.assign(c, r); return c; })
      .catch(err => { cache.delete(url); throw err; })
      .finally(() => { pending--; notify(); });
    cache.set(url, c);
  }
  c.refs++; clearTimeout(c.timer);
  return c.promise;
}
function release(url) {
  const c = cache.get(url); if (!c) return;
  c.refs = Math.max(0, c.refs - 1);
  if (c.refs === 0) { clearTimeout(c.timer); c.timer = setTimeout(() => { if (c.refs === 0) free(url); }, KEEP_UNUSED_MS); }
}
function free(url) {
  const c = cache.get(url); if (!c || !c.template) return;
  const tex = new Set();
  c.template.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) { if (!m) continue; for (const k in m) if (m[k] && m[k].isTexture) tex.add(m[k]); m.dispose(); }
  });
  tex.forEach(t => t.dispose());
  cache.delete(url);
}

// Копія моделі для предмета: центр по X/Z, низ на підлозі, перед дивиться в +Z (як у процедурних меблів),
// розмір підганяється під w×d×h з опису предмета. orient (градуси) повертає модель, якщо в джерелі фасад дивиться вбік.
function boxFor(c, orient) {
  c.boxes = c.boxes || {};
  if (!c.boxes[orient]) {
    const t = new THREE.Group(), was = c.template.rotation.y; t.add(c.template); c.template.rotation.y = was + orient * Math.PI / 180;
    t.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(t);
    c.template.rotation.y = was; t.remove(c.template); c.template.updateMatrixWorld(true);
    c.boxes[orient] = { box, size: box.getSize(new THREE.Vector3()) };
  }
  return c.boxes[orient];
}
function instantiate(c, def) {
  const orient = def.orient || 0, { box, size: s } = boxFor(c, orient);
  const inner = c.template.clone(true); inner.rotation.y += orient * Math.PI / 180;
  const ctr = box.getCenter(new THREE.Vector3());
  const sx = def.w / 100 / (s.x || 1), sy = def.h / 100 / (s.y || 1), sz = def.d / 100 / (s.z || 1);
  const holder = new THREE.Group(), pivot = new THREE.Group();
  pivot.position.set(-ctr.x, -box.min.y, -ctr.z); pivot.add(inner);
  holder.add(pivot); holder.scale.set(sx, sy, sz);
  holder.userData.glbModel = true;
  return holder;
}

// Будує предмет у групі g: одразу ставить «коробку», потім підміняє її моделлю.
function attach(g, def, placeholder, onReady, onError) {
  const url = def.model;
  g.userData.glbUrl = url;
  let gone = false; g.userData.glbDispose = () => { if (!gone) { gone = true; release(url); } };
  acquire(url).then(c => {
    if (gone) return;
    if (placeholder) { g.remove(placeholder); placeholder.geometry && placeholder.geometry.dispose(); }
    g.add(instantiate(c, def));
    onReady && onReady(g);
  }).catch(err => {
    if (gone) return;
    g.userData.glbFailed = true;
    onError && onError(err, g);
  });
}

// ---------- каталоги ----------
async function getJSON(url, opts) {
  const r = await fetch(url, Object.assign({ cache: "no-store" }, opts));
  if (!r.ok) { let msg = ""; try { msg = (await r.json()).error; } catch (e) {} throw Object.assign(new Error(msg || `HTTP ${r.status}`), { status: r.status }); }
  return r.json();
}
async function loadLocalCatalog(url = "model-catalog.json") {
  const doc = await getJSON(url);
  return (doc.models || []).filter(e => e && e.id && e.model).map(toItem);
}
// Серверний каталог: пошук, категорія, сторінки. Повертає предмети галереї без завантаження моделей.
async function remoteCatalog({ q = "", category = "", type = "", sort = "", page = 1, pageSize = 24 } = {}) {
  const p = new URLSearchParams({ page, pageSize }); if (q) p.set("q", q); if (category && category !== "all") p.set("category", category);
  if (type) p.set("type", type); if (sort && sort !== "default") p.set("sort", sort);
  const d = await getJSON(`${API}/models?${p}`);
  return { items: (d.items || []).map(toItem), total: d.total || 0, page: d.page || page, pageSize: d.pageSize || pageSize, demo: !!d.demo, note: d.note || "", typeCounts: d.typeCounts || null, typeFiltered: !!d.typeFiltered };
}
async function remoteModel(id) { return toItem(await getJSON(`${API}/models/${encodeURIComponent(id)}`)); }
async function remoteCategories() { return (await getJSON(`${API}/categories`)).items || []; }

window.RozstavModels = {
  available: !!loader, toItem, attach, release, free,
  loadLocalCatalog, remoteCatalog, remoteModel, remoteCategories,
  pending: () => pending,
  onPending(f) { listeners.add(f); return () => listeners.delete(f); },
  // чекає, поки догрузяться всі моделі (перед фото-рендером)
  idle(timeoutMs = 60000) {
    return new Promise(res => {
      if (!pending) return res(true);
      const t = setTimeout(() => { off(); res(false); }, timeoutMs);
      const off = this.onPending(n => { if (!n) { clearTimeout(t); off(); res(true); } });
    });
  },
  stats: () => ({ cached: cache.size, active, queued: queue.length, pending })
};
})();
