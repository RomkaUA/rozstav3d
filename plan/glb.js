/*
  РОЗСТАВ — експорт 3D-сцени у GLB (glTF 2.0 Binary).
  ------------------------------------------------------------
  • видимі меші переносяться в координати світу (трансформації «запікаються» у вершини);
  • меш із кількома матеріалами (стіна: внутрішня/зовнішня грані) — окремі примітиви за groups;
  • перетворення текстури (масштаб, поворот, зсув) запікається в UV, тож glTF не потребує розширень;
  • PBR: baseColor (колір + текстура), metallic, roughness, normalTexture; прозорість — alphaMode BLEND;
  • колір матеріалу переводиться з sRGB у лінійний (glTF вимагає лінійний baseColorFactor), текстури лишаються sRGB.
  Світло, камера й допоміжні об'єкти (сітка, зони, «коробки» незавантажених моделей) не експортуються.
*/
(function (root) {
  "use strict";
  const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  function exportGLB(THREE, roots, opts = {}) {
    const json = { asset: { version: "2.0", generator: "Rozstav 3D" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }] };
    const chunks = []; let byteLen = 0;
    const pushBin = (buf, target) => { const pad = (4 - (byteLen % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); byteLen += pad; } const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength); chunks.push(u8); const v = { buffer: 0, byteOffset: byteLen, byteLength: u8.byteLength }; if (target) v.target = target; json.bufferViews.push(v); byteLen += u8.byteLength; return json.bufferViews.length - 1; };
    const acc = (arr, type, comp, target, minmax) => { const a = { bufferView: pushBin(arr, target), componentType: comp, count: arr.length / ({ VEC3: 3, VEC2: 2, SCALAR: 1 })[type], type }; if (minmax) Object.assign(a, minmax); json.accessors.push(a); return json.accessors.length - 1; };
    const imgIdx = new Map(), matIdx = new Map();
    const imageOf = tex => {
      const img = tex && tex.image; if (!img) return null;
      if (imgIdx.has(img)) return imgIdx.get(img);
      let cv = img; if (!(img instanceof HTMLCanvasElement)) { cv = document.createElement("canvas"); cv.width = img.width || img.videoWidth; cv.height = img.height || img.videoHeight; if (!cv.width || !cv.height) return null; cv.getContext("2d").drawImage(img, 0, 0); }
      // дуже великі текстури зменшуємо до 2048: файл лишається придатним для пересилання
      if (Math.max(cv.width, cv.height) > 2048) { const k = 2048 / Math.max(cv.width, cv.height), c2 = document.createElement("canvas"); c2.width = Math.round(cv.width * k); c2.height = Math.round(cv.height * k); c2.getContext("2d").drawImage(cv, 0, 0, c2.width, c2.height); cv = c2; }
      const b64 = cv.toDataURL("image/png").split(",")[1], bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      json.images.push({ bufferView: pushBin(bin), mimeType: "image/png" }); json.textures.push({ sampler: 0, source: json.images.length - 1 });
      const i = json.textures.length - 1; imgIdx.set(img, i); return i;
    };
    const materialOf = m => {
      if (matIdx.has(m)) return matIdx.get(m);
      const c = m.color || new THREE.Color(1, 1, 1), op = m.transparent ? m.opacity : 1;
      const out = { name: m.name || undefined, pbrMetallicRoughness: { baseColorFactor: [lin(c.r), lin(c.g), lin(c.b), op], metallicFactor: m.metalness != null ? m.metalness : 0, roughnessFactor: m.roughness != null ? m.roughness : 1 }, doubleSided: m.side === THREE.DoubleSide };
      const bt = m.map && imageOf(m.map); if (bt != null) out.pbrMetallicRoughness.baseColorTexture = { index: bt };
      const nt = m.normalMap && imageOf(m.normalMap); if (nt != null) out.normalTexture = { index: nt, scale: m.normalScale ? m.normalScale.x : 1 };
      if (op < 1) out.alphaMode = "BLEND";
      json.materials.push(out); matIdx.set(m, json.materials.length - 1); return json.materials.length - 1;
    };
    const v3 = new THREE.Vector3(), n3 = new THREE.Vector3(), nm = new THREE.Matrix3(), uvm = new THREE.Matrix3(), uv = new THREE.Vector3();
    let meshesN = 0, tris = 0;
    const take = o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      for (let p = o; p; p = p.parent) if (p.visible === false) return;
      if (o.userData && o.userData.ghost) return;
      const mats = [].concat(o.userData && o.userData.mat ? o.userData.mat : o.material);   // стіна, схована в режимі «Зріз», експортується з власним матеріалом
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, tuv = g.attributes.uv, idx = g.index;
      o.updateWorldMatrix(true, false); nm.getNormalMatrix(o.matrixWorld);
      const groups = g.groups && g.groups.length && mats.length > 1 ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
      const prims = [];
      for (const gr of groups) {
        const m = mats[gr.materialIndex] || mats[0]; if (!m || m.visible === false || m.colorWrite === false) continue;
        const n = gr.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = tuv ? new Float32Array(n * 2) : null, I = new Uint32Array(n);
        const map = m.map; if (map) { map.updateMatrix(); uvm.copy(map.matrix); }
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (let k = 0; k < n; k++) {
          const vi = idx ? idx.getX(gr.start + k) : gr.start + k;
          v3.fromBufferAttribute(pos, vi).applyMatrix4(o.matrixWorld); P[k * 3] = v3.x; P[k * 3 + 1] = v3.y; P[k * 3 + 2] = v3.z;
          for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[k * 3 + a]); mx[a] = Math.max(mx[a], P[k * 3 + a]); }
          if (nor) { n3.fromBufferAttribute(nor, vi).applyMatrix3(nm).normalize(); N[k * 3] = n3.x; N[k * 3 + 1] = n3.y; N[k * 3 + 2] = n3.z; }
          if (U) { uv.set(tuv.getX(vi), tuv.getY(vi), 1); if (map) uv.applyMatrix3(uvm); U[k * 2] = uv.x; U[k * 2 + 1] = map && map.flipY !== false ? 1 - uv.y : uv.y; }
          I[k] = k;
        }
        // дзеркальна трансформація змінює порядок обходу трикутників
        if (o.matrixWorld.determinant() < 0) for (let k = 0; k + 2 < n; k += 3) { const s = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = s; }
        const attributes = { POSITION: acc(P, "VEC3", 5126, 34962, { min: mn, max: mx }) };
        if (nor) attributes.NORMAL = acc(N, "VEC3", 5126, 34962); if (U) attributes.TEXCOORD_0 = acc(U, "VEC2", 5126, 34962);
        prims.push({ attributes, indices: acc(I, "SCALAR", 5125, 34963), material: materialOf(m), mode: 4 }); tris += n / 3;
      }
      if (!prims.length) return;
      json.meshes.push({ name: o.name || undefined, primitives: prims }); json.nodes.push({ mesh: json.meshes.length - 1 }); json.scenes[0].nodes.push(json.nodes.length - 1); meshesN++;
    };
    for (const r of roots) r.traverse(take);
    if (!meshesN) throw new Error("У сцені немає видимих об'єктів для експорту");
    json.buffers = [{ byteLength: byteLen }];
    for (const k of ["textures", "images"]) if (!json[k].length) delete json[k];
    const enc = new TextEncoder(); let js = enc.encode(JSON.stringify(json)); const jpad = (4 - js.length % 4) % 4; if (jpad) { const t = new Uint8Array(js.length + jpad); t.set(js); t.fill(0x20, js.length); js = t; }
    const bpad = (4 - byteLen % 4) % 4, total = 12 + 8 + js.length + 8 + byteLen + bpad, out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(js, 20);
    let o2 = 20 + js.length; dv.setUint32(o2, byteLen + bpad, true); dv.setUint32(o2 + 4, 0x004E4942, true); o2 += 8;
    for (const c of chunks) { out.set(c, o2); o2 += c.byteLength; }
    return { bytes: out, meshes: meshesN, triangles: Math.round(tris), materials: json.materials.length, textures: (json.textures || []).length };
  }
  const api = Object.freeze({ exportGLB });
  if (typeof module === "object" && module.exports) module.exports = api; else root.RozstavGLB = api;
})(typeof window !== "undefined" ? window : this);
