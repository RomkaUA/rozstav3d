/*
  РОЗСТАВ — експорт сцени у FBX 7.4 Binary (Autodesk FBX) для 3ds Max, без сторонніх програм.
  ------------------------------------------------------------
  Формат: двійковий FBX 7400 (вузли з 32-бітними зміщеннями, масиви без стиснення), заголовок і завершення — як у
  перевірених експортерів (Blender), щоб файл читали FBX SDK (3ds Max, Maya, Unity), Assimp і three.js FBXLoader.
  Одиниці та осі: 1 одиниця файлу = 1 мм (UnitScaleFactor = 0.1, як у моделях 3DDD / 3DSky; за замовчуванням) або 1 см (= 1), вісь Z — вгору, Y — «від глядача»
  (UpAxis = 2, FrontAxis = 1/−1, CoordAxis = 0) — як у самому 3ds Max, тож імпорт не повертає й не масштабує сцену.
  Перетворення сцени Розстав (Three.js: метри, Y — вгору, z — «до глядача») → FBX: X = x·100, Y = −z·100, Z = y·100.
  Ієрархія: кожен вузол — Model (Null для груп, Mesh для геометрії, Light, Camera) з власною точкою опори;
  геометрія — у локальних координатах свого вузла (полігони: суміжні трикутники однієї площини зливаються в чотирикутники,
  однакові вершини зварюються), нормалі на кут полігона, UV з перетворенням текстури, матеріал на полігон.
  Матеріали — Phong (DiffuseColor, Opacity, Specular, Shininess, ReflectionFactor) з дифузною й нормальною текстурами:
  текстури вбудовуються у файл (Video.Content) і додатково записуються поруч (RelativeFilename) — 3ds Max бере будь-яку.
*/
(function (root) {
  "use strict";
  const enc = new TextEncoder();
  // ---------- двійковий запис ----------
  function Buf() {
    let cap = 1 << 20, b = new Uint8Array(cap), dv = new DataView(b.buffer), n = 0;
    const ensure = k => { if (n + k <= cap) return; while (n + k > cap) cap *= 2; const nb = new Uint8Array(cap); nb.set(b.subarray(0, n)); b = nb; dv = new DataView(b.buffer); };
    return {
      get n() { return n; },
      u8(v) { ensure(1); b[n++] = v; }, u32(v) { ensure(4); dv.setUint32(n, v, true); n += 4; }, i32(v) { ensure(4); dv.setInt32(n, v, true); n += 4; },
      i64(v) { ensure(8); dv.setBigInt64(n, BigInt(v), true); n += 8; }, f64(v) { ensure(8); dv.setFloat64(n, v, true); n += 8; }, f32(v) { ensure(4); dv.setFloat32(n, v, true); n += 4; },
      bytes(a) { ensure(a.length); b.set(a, n); n += a.length; }, patch(at, v) { dv.setUint32(at, v, true); },
      arr(type, a) { // масив: кількість, кодування 0 (без стиснення), довжина в байтах, дані
        const sz = { d: 8, f: 4, i: 4, l: 8, b: 1 }[type]; ensure(13 + a.length * sz); b[n++] = type.charCodeAt(0); this.u32(a.length); this.u32(0); this.u32(a.length * sz);
        for (let i = 0; i < a.length; i++) { if (type === "d") { dv.setFloat64(n, a[i], true); n += 8; } else if (type === "f") { dv.setFloat32(n, a[i], true); n += 4; } else if (type === "i") { dv.setInt32(n, a[i], true); n += 4; } else if (type === "l") { dv.setBigInt64(n, BigInt(a[i]), true); n += 8; } else b[n++] = a[i] ? 1 : 0; }
      },
      out() { return b.slice(0, n); }
    };
  }
  // вузол: [ім'я, [властивості], [діти]]; властивість: число з типом через обгортку або рядок
  const I = v => ({ t: "I", v }), L = v => ({ t: "L", v }), D = v => ({ t: "D", v }), C = v => ({ t: "C", v }), S = v => ({ t: "S", v }), R = v => ({ t: "R", v }), A = (t, v) => ({ t: "a" + t, v });
  const N = (name, props = [], children = []) => ({ name, props, children });
  function writeProp(B, p) {
    if (typeof p === "string") p = S(p);
    if (p.t === "I") { B.u8(73); B.i32(p.v); } else if (p.t === "L") { B.u8(76); B.i64(p.v); } else if (p.t === "D") { B.u8(68); B.f64(p.v); } else if (p.t === "C") { B.u8(67); B.u8(p.v ? 1 : 0); }
    else if (p.t === "S") { const s = enc.encode(p.v); B.u8(83); B.u32(s.length); B.bytes(s); } else if (p.t === "R") { B.u8(82); B.u32(p.v.length); B.bytes(p.v); }
    else if (p.t[0] === "a") B.arr(p.t[1], p.v);
  }
  const SENTINEL = new Uint8Array(13);
  function writeNode(B, nd) {
    const start = B.n; B.u32(0); B.u32(nd.props.length); B.u32(0); const nm = enc.encode(nd.name); B.u8(nm.length); B.bytes(nm);
    const ps = B.n; for (const p of nd.props) writeProp(B, p); const plen = B.n - ps;
    // вкладений список закінчується нульовим записом; так само — вузол без властивостей і дітей (як у FBX SDK)
    if (nd.children.length) { for (const c of nd.children) writeNode(B, c); B.bytes(SENTINEL); } else if (!nd.props.length) B.bytes(SENTINEL);
    B.patch(start, B.n); B.patch(start + 8, plen);
  }
  // Properties70: P "ім'я", "тип", "мітка", "прапорці", значення…
  const P = (name, type, label, flags, ...vals) => N("P", [S(name), S(type), S(label), S(flags), ...vals]);
  const P70 = list => N("Properties70", [], list);
  const vec = (name, v, flags = "A") => P(name, name.startsWith("Lcl") ? name : "Vector3D", name.startsWith("Lcl") ? "" : "Vector", flags, D(v[0]), D(v[1]), D(v[2]));
  const col = (name, c) => P(name, "Color", "", "A", D(c[0]), D(c[1]), D(c[2]));
  const num = (name, v) => P(name, "Number", "", "A", D(v));
  // сталі ідентифікатори файлу й часу, які вимагає завершення FBX (узгоджені з FBX SDK)
  const FILE_ID = new Uint8Array([0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1]);
  const TIME_ID = "1970-01-01 10:00:00:000";
  const FOOT_ID = new Uint8Array([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e]);
  const FOOT_MAGIC = new Uint8Array([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b]);
  const nm = (name, cls) => name + "\x00\x01" + cls;
  // ---------- сцена → FBX ----------
  // scene: { name, root: вузол }, де вузол = { name, kind: "null"|"mesh"|"light"|"camera", T:[x,y,z] (см), R:[rx,ry,rz] (°),
  //   mesh: { pos:[x,y,z,…], polys:[[i,i,i(,i)]…], nor:[[x,y,z]… на кожен кут], uv:[[u,v]… на кожен кут] | null, mat:[індекс…], mats:[матеріал…] },
  //   light: { color:[r,g,b], intensity }, camera: { fov, aspect, target:[x,y,z] }, children: [] }
  // матеріал = { name, diffuse:[r,g,b], opacity, specular, shininess, reflection, map:{ name, png:Uint8Array }|null, normal:{…}|null }
  function writeFBX(scene, opts = {}) {
    let nextId = 1000000; const id = () => ++nextId, objects = [], conns = [], counts = { Model: 0, Geometry: 0, Material: 0, Texture: 0, Video: 0, NodeAttribute: 0 };
    const matIds = new Map(), texIds = new Map(), texFiles = [], matInfo = [];
    // одиниці файлу: "mm" — 1 одиниця = 1 мм (як у моделях 3DDD / 3DSky, UnitScaleFactor = 0.1), інакше 1 одиниця = 1 см
    const k = opts.unit === "mm" ? 10 : 1, sc = a => k === 1 ? a : a.map(v => v * k);
    const texDir = opts.textureDir || "textures";
    const textureOf = (t, slot, matId) => {
      let tid = texIds.get(t.name);
      if (!tid) {
        tid = id(); const vid = id(), file = `${texDir}/${t.name}`;
        objects.push(N("Video", [L(vid), S(nm(t.name, "Video")), S("Clip")], [N("Type", [S("Clip")]), P70([P("Path", "KString", "XRefUrl", "", S(file))]), N("UseMipMap", [I(0)]), N("Filename", [S(file)]), N("RelativeFilename", [S(file)]), N("Content", [R(t.png)])]));
        objects.push(N("Texture", [L(tid), S(nm(t.name, "Texture")), S("")], [N("Type", [S("TextureVideoClip")]), N("Version", [I(202)]), N("TextureName", [S(nm(t.name, "Texture"))]),
          P70([P("UseMaterial", "bool", "", "", I(1))]), N("Media", [S(nm(t.name, "Video"))]), N("FileName", [S(file)]), N("RelativeFilename", [S(file)]),
          N("ModelUVTranslation", [D(0), D(0)]), N("ModelUVScaling", [D(1), D(1)]), N("Texture_Alpha_Source", [S("None")]), N("Cropping", [I(0), I(0), I(0), I(0)])]));
        conns.push(["OO", vid, tid]); counts.Texture++; counts.Video++; texIds.set(t.name, tid); texFiles.push({ name: t.name, file, bytes: t.png });
      }
      conns.push(["OP", tid, matId, slot]);
    };
    const materialOf = m => {
      if (matIds.has(m)) return matIds.get(m);
      const mid = id(), sh = Math.max(2, (m.shininess != null ? m.shininess : 20));
      objects.push(N("Material", [L(mid), S(nm(m.name, "Material")), S("")], [N("Version", [I(102)]), N("ShadingModel", [S("phong")]), N("MultiLayer", [I(0)]), P70([
        P("ShadingModel", "KString", "", "", S("phong")), col("DiffuseColor", m.diffuse), num("DiffuseFactor", 1), col("AmbientColor", [0, 0, 0]), num("AmbientFactor", 0),
        col("EmissiveColor", m.emissive || [0, 0, 0]), num("EmissiveFactor", m.emissive ? (m.emitLevel || 1) : 0), col("SpecularColor", [m.specular, m.specular, m.specular]), num("SpecularFactor", 1), num("Shininess", sh), num("ShininessExponent", sh),
        num("ReflectionFactor", m.reflection || 0), col("TransparentColor", [1, 1, 1]), num("TransparencyFactor", 1 - m.opacity), num("Opacity", m.opacity)])]));
      counts.Material++; matIds.set(m, mid);
      if (m.map) textureOf(m.map, "DiffuseColor", mid);
      if (m.normal) textureOf(m.normal, "NormalMap", mid);
      // точні параметри для MAXScript (Corona / V-Ray / Physical): імпортер FBX передає лише Phong, решта губиться
      matInfo.push({ name: m.name, diffuse: m.diffuse, roughness: m.roughness != null ? m.roughness : 0.8, metalness: m.metalness || 0, opacity: m.opacity, glass: !!m.glass, emissive: m.emissive || null, emitLevel: m.emitLevel || 1,
        map: m.map ? `${texDir}/${m.map.name}` : "", normal: m.normal ? `${texDir}/${m.normal.name}` : "" });
      return mid;
    };
    const geometryOf = (g, name) => {
      const gid = id(), pvi = [], nor = [], uv = [], uvi = [], uvKey = new Map();
      g.polys.forEach((p, k) => p.forEach((v, j) => { pvi.push(j === p.length - 1 ? -v - 1 : v); }));
      let c = 0; for (const p of g.polys) for (let j = 0; j < p.length; j++, c++) { const n = g.nor[c]; nor.push(n[0], n[1], n[2]); if (g.uv) { const u = g.uv[c], key = Math.round(u[0] * 1e5) + "," + Math.round(u[1] * 1e5); let ix = uvKey.get(key); if (ix == null) { ix = uv.length / 2; uv.push(u[0], u[1]); uvKey.set(key, ix); } uvi.push(ix); } }
      const allSame = g.mat.every(v => v === g.mat[0]);
      const ch = [P70([]), N("GeometryVersion", [I(124)]), N("Vertices", [A("d", sc(g.pos))]), N("PolygonVertexIndex", [A("i", pvi)]),
        N("LayerElementNormal", [I(0)], [N("Version", [I(101)]), N("Name", [S("")]), N("MappingInformationType", [S("ByPolygonVertex")]), N("ReferenceInformationType", [S("Direct")]), N("Normals", [A("d", nor)])])];
      if (g.uv) ch.push(N("LayerElementUV", [I(0)], [N("Version", [I(101)]), N("Name", [S("UVMap")]), N("MappingInformationType", [S("ByPolygonVertex")]), N("ReferenceInformationType", [S("IndexToDirect")]), N("UV", [A("d", uv)]), N("UVIndex", [A("i", uvi)])]));
      ch.push(N("LayerElementMaterial", [I(0)], [N("Version", [I(101)]), N("Name", [S("")]), N("MappingInformationType", [S(allSame ? "AllSame" : "ByPolygon")]), N("ReferenceInformationType", [S("IndexToDirect")]), N("Materials", [A("i", allSame ? [g.mat[0] || 0] : g.mat)])]));
      const le = [N("Version", [I(100)]), N("LayerElement", [], [N("Type", [S("LayerElementNormal")]), N("TypedIndex", [I(0)])]), N("LayerElement", [], [N("Type", [S("LayerElementMaterial")]), N("TypedIndex", [I(0)])])];
      if (g.uv) le.push(N("LayerElement", [], [N("Type", [S("LayerElementUV")]), N("TypedIndex", [I(0)])]));
      ch.push(N("Layer", [I(0)], le));
      objects.push(N("Geometry", [L(gid), S(nm(name, "Geometry")), S("Mesh")], ch)); counts.Geometry++; return gid;
    };
    const stats = { models: 0, meshes: 0, polygons: 0, vertices: 0, lights: 0, cameras: 0 };
    const usedNames = new Map(); const uniq = s => { const n = (usedNames.get(s) || 0) + 1; usedNames.set(s, n); return n === 1 ? s : `${s}_${String(n).padStart(2, "0")}`; };
    const modelOf = (node, parent) => {
      const mid = id(), name = uniq(node.name), type = node.kind === "mesh" ? "Mesh" : node.kind === "light" ? "Light" : node.kind === "camera" ? "Camera" : "Null";
      const props = [vec("Lcl Translation", sc(node.T || [0, 0, 0])), vec("Lcl Rotation", node.R || [0, 0, 0]), vec("Lcl Scaling", [1, 1, 1]), P("DefaultAttributeIndex", "int", "Integer", "", I(0)), P("InheritType", "enum", "", "", I(1))];
      objects.push(N("Model", [L(mid), S(nm(name, "Model")), S(type)], [N("Version", [I(232)]), P70(props), N("MultiLayer", [I(0)]), N("MultiTake", [I(0)]), N("Shading", [C(true)]), N("Culling", [S("CullingOff")])]));
      counts.Model++; stats.models++; conns.push(["OO", mid, parent]);
      if (node.kind === "mesh" && node.mesh && node.mesh.polys.length) {
        const gid = geometryOf(node.mesh, name); conns.push(["OO", gid, mid]);
        for (const m of node.mesh.mats) conns.push(["OO", materialOf(m), mid]);   // порядок підключення = індекси матеріалів полігонів
        stats.meshes++; stats.polygons += node.mesh.polys.length; stats.vertices += node.mesh.pos.length / 3;
      } else if (node.kind === "light") {
        const aid = id(), l = node.light; objects.push(N("NodeAttribute", [L(aid), S(nm(name, "NodeAttribute")), S("Light")], [P70([P("LightType", "enum", "", "", I(0)), col("Color", l.color), num("Intensity", l.intensity), P("CastShadows", "bool", "", "", I(1))]), N("TypeFlags", [S("Light")]), N("GeometryVersion", [I(124)])]));
        conns.push(["OO", aid, mid]); counts.NodeAttribute++; stats.lights++;
      } else if (node.kind === "camera") {
        const aid = id(), c = node.camera; objects.push(N("NodeAttribute", [L(aid), S(nm(name, "NodeAttribute")), S("Camera")], [P70([P("FieldOfView", "FieldOfView", "", "A", D(c.fov)), P("AspectWidth", "double", "Number", "", D(c.aspect * 1000)), P("AspectHeight", "double", "Number", "", D(1000)), P("NearPlane", "double", "Number", "", D(k)), P("FarPlane", "double", "Number", "", D(1e6 * k))]),
          N("TypeFlags", [S("Camera")]), N("GeometryVersion", [I(124)]), N("Position", sc(node.T).map(D)), N("Up", [D(0), D(0), D(1)]), N("LookAt", sc(c.target).map(D)), N("ShowInfoOnMoving", [I(1)]), N("ShowAudio", [I(0)]), N("AudioColor", [D(0), D(1), D(0)]), N("CameraOrthoZoom", [D(1)])]));
        conns.push(["OO", aid, mid]); counts.NodeAttribute++; stats.cameras++;
        // ціль камери — окремий вузол, на який вказує LookAtProperty: так імпортер 3ds Max створює Target Camera
        const tid = id(), tname = uniq(name + ".Target"); objects.push(N("Model", [L(tid), S(nm(tname, "Model")), S("Null")], [N("Version", [I(232)]), P70([vec("Lcl Translation", sc(c.target)), vec("Lcl Rotation", [0, 0, 0]), vec("Lcl Scaling", [1, 1, 1])]), N("MultiLayer", [I(0)]), N("MultiTake", [I(0)]), N("Shading", [C(true)]), N("Culling", [S("CullingOff")])]));
        counts.Model++; stats.models++; conns.push(["OO", tid, 0]); conns.push(["OP", tid, mid, "LookAtProperty"]);
      }
      if (node.kind === "null") { const aid = id(); objects.push(N("NodeAttribute", [L(aid), S(nm(name, "NodeAttribute")), S("Null")], [N("TypeFlags", [S("Null")])])); conns.push(["OO", aid, mid]); counts.NodeAttribute++; }
      for (const ch of node.children || []) modelOf(ch, mid);
    };
    modelOf(scene.root, 0);
    const now = new Date();
    const top = [
      N("FBXHeaderExtension", [], [N("FBXHeaderVersion", [I(1003)]), N("FBXVersion", [I(7400)]), N("EncryptionType", [I(0)]),
        N("CreationTimeStamp", [], [N("Version", [I(1000)]), N("Year", [I(now.getFullYear())]), N("Month", [I(now.getMonth() + 1)]), N("Day", [I(now.getDate())]), N("Hour", [I(now.getHours())]), N("Minute", [I(now.getMinutes())]), N("Second", [I(now.getSeconds())]), N("Millisecond", [I(0)])]),
        N("Creator", [S("Rozstav 3D FBX exporter")]),
        N("SceneInfo", [S(nm("GlobalInfo", "SceneInfo")), S("UserData")], [N("Type", [S("UserData")]), N("Version", [I(100)]), N("MetaData", [], [N("Version", [I(100)]), N("Title", [S(scene.name || "")]), N("Subject", [S("")]), N("Author", [S("")]), N("Keywords", [S("")]), N("Revision", [S("")]), N("Comment", [S("")])]),
          P70([P("DocumentUrl", "KString", "Url", "", S("rozstav.fbx")), P("SrcDocumentUrl", "KString", "Url", "", S("rozstav.fbx")), P("Original", "Compound", "", ""), P("Original|ApplicationVendor", "KString", "", "", S("Rozstav")), P("Original|ApplicationName", "KString", "", "", S("Rozstav 3D")), P("Original|ApplicationVersion", "KString", "", "", S(opts.version || "1")), P("Original|DateTime_GMT", "DateTime", "", "", S(TIME_ID)), P("Original|FileName", "KString", "", "", S("rozstav.fbx"))])])]),
      N("FileId", [R(FILE_ID)]), N("CreationTime", [S(TIME_ID)]), N("Creator", [S("Rozstav 3D FBX exporter")]),
      N("GlobalSettings", [], [N("Version", [I(1000)]), P70([P("UpAxis", "int", "Integer", "", I(2)), P("UpAxisSign", "int", "Integer", "", I(1)), P("FrontAxis", "int", "Integer", "", I(1)), P("FrontAxisSign", "int", "Integer", "", I(-1)), P("CoordAxis", "int", "Integer", "", I(0)), P("CoordAxisSign", "int", "Integer", "", I(1)),
        P("OriginalUpAxis", "int", "Integer", "", I(2)), P("OriginalUpAxisSign", "int", "Integer", "", I(1)), P("UnitScaleFactor", "double", "Number", "", D(1 / k)), P("OriginalUnitScaleFactor", "double", "Number", "", D(1 / k)),
        P("AmbientColor", "ColorRGB", "Color", "", D(0), D(0), D(0)), P("DefaultCamera", "KString", "", "", S("Producer Perspective")), P("TimeMode", "enum", "", "", I(11)), P("TimeProtocol", "enum", "", "", I(2)), P("SnapOnFrameMode", "enum", "", "", I(0)),
        P("TimeSpanStart", "KTime", "Time", "", L(0)), P("TimeSpanStop", "KTime", "Time", "", L(46186158000)), P("CustomFrameRate", "double", "Number", "", D(-1)), P("CurrentTimeMarker", "int", "Integer", "", I(-1))])]),
      N("Documents", [], [N("Count", [I(1)]), N("Document", [L(999), S("Scene"), S("Scene")], [P70([P("SourceObject", "object", "", ""), P("ActiveAnimStackName", "KString", "", "", S(""))]), N("RootNode", [L(0)])])]),
      N("References", []),
      N("Definitions", [], [N("Version", [I(100)]), N("Count", [I(1 + Object.values(counts).reduce((a, b) => a + b, 0))]), N("ObjectType", [S("GlobalSettings")], [N("Count", [I(1)])]),
        ...Object.entries(counts).filter(([, v]) => v).map(([k, v]) => N("ObjectType", [S(k)], [N("Count", [I(v)])]))]),
      N("Objects", [], objects),
      N("Connections", [], conns.map(c => N("C", c[0] === "OP" ? [S("OP"), L(c[1]), L(c[2]), S(c[3])] : [S("OO"), L(c[1]), L(c[2])]))),
      N("Takes", [], [N("Current", [S("")])])
    ];
    const B = Buf(); B.bytes(enc.encode("Kaydara FBX Binary  ")); B.u8(0); B.u8(0x1a); B.u8(0); B.u32(7400);
    for (const nd of top) writeNode(B, nd);
    B.bytes(SENTINEL); B.bytes(FOOT_ID); B.bytes(new Uint8Array(4));
    let pad = ((B.n + 15) & ~15) - B.n; if (pad === 0) pad = 16; B.bytes(new Uint8Array(pad)); B.u32(7400); B.bytes(new Uint8Array(120)); B.bytes(FOOT_MAGIC);
    return { bytes: B.out(), textures: texFiles, materials: matInfo, unit: k === 10 ? "mm" : "cm", stats: Object.assign(stats, { materials: counts.Material, textures: counts.Texture }) };
  }

  // ---------- Three.js → вузли FBX ----------
  // перетворення світу Розстав (м, Y вгору) у FBX 3ds Max (см, Z вгору): X = 100x, Y = −100z, Z = 100y
  const toMax = (x, y, z) => [x * 100, -z * 100, y * 100];
  const toMaxN = (x, y, z) => [x, -z, y];
  // меш Three.js → геометрія вузла: вершини в системі вузла-опори (pivotInv · world), зварювання, злиття трикутників у чотирикутники
  function meshData(THREE, meshes, pivotInv, matOf) {
    const pos = [], polys = [], nor = [], uv = [], mat = [], mats = [], key = new Map(), v = new THREE.Vector3(), n3 = new THREE.Vector3(), nm3 = new THREE.Matrix3(), M = new THREE.Matrix4(), uvm = new THREE.Matrix3(), uvv = new THREE.Vector3();
    let anyUV = false;
    for (const o of meshes) {
      const g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv, idx = g.index, list = [].concat(o.userData && o.userData.mat ? o.userData.mat : o.material);
      o.updateWorldMatrix(true, false); M.multiplyMatrices(pivotInv, o.matrixWorld); nm3.getNormalMatrix(M); const flip = M.determinant() < 0;
      const groups = g.groups && g.groups.length && list.length > 1 ? g.groups : [{ start: 0, count: idx ? idx.count : P.count, materialIndex: 0 }];
      for (const gr of groups) {
        const m = list[gr.materialIndex] || list[0]; if (!m || m.visible === false || m.colorWrite === false) continue;
        const fm = matOf(m); let mi = mats.indexOf(fm); if (mi < 0) { mats.push(fm); mi = mats.length - 1; }
        const map = m.map; if (map) { map.updateMatrix(); uvm.copy(map.matrix); }
        const corner = vi => { v.fromBufferAttribute(P, vi).applyMatrix4(M); const p = toMax(v.x, v.y, v.z), k = p.map(c => Math.round(c * 1000)).join(","); let ix = key.get(k); if (ix == null) { ix = pos.length / 3; pos.push(p[0], p[1], p[2]); key.set(k, ix); }
          let nn = [0, 0, 1]; if (Nn) { n3.fromBufferAttribute(Nn, vi).applyMatrix3(nm3).normalize(); nn = toMaxN(n3.x, n3.y, n3.z); }
          let u = null; if (U) { anyUV = true; uvv.set(U.getX(vi), U.getY(vi), 1); if (map) uvv.applyMatrix3(uvm); u = [uvv.x, uvv.y]; } return { ix, nn, u }; };
        const tris = []; for (let k = 0; k + 2 < gr.count; k += 3) { const a = idx ? idx.getX(gr.start + k) : gr.start + k, b = idx ? idx.getX(gr.start + k + 1) : gr.start + k + 1, c = idx ? idx.getX(gr.start + k + 2) : gr.start + k + 2; const t = flip ? [corner(a), corner(c), corner(b)] : [corner(a), corner(b), corner(c)]; if (t[0].ix === t[1].ix || t[1].ix === t[2].ix || t[0].ix === t[2].ix) continue; tris.push(t); }
        // сусідні трикутники однієї площини зі спільним ребром → чотирикутник (стіни й меблі в 3ds Max — без діагоналей)
        for (let k = 0; k < tris.length; k++) {
          const t = tris[k], s = tris[k + 1];
          if (s) { const ta = t.map(c => c.ix), sa = s.map(c => c.ix), shared = ta.filter(x => sa.includes(x));
            if (shared.length === 2 && t.every((c, j) => Math.abs(c.nn[0] - t[0].nn[0]) + Math.abs(c.nn[1] - t[0].nn[1]) + Math.abs(c.nn[2] - t[0].nn[2]) < 1e-4) && s.every(c => Math.abs(c.nn[0] - t[0].nn[0]) + Math.abs(c.nn[1] - t[0].nn[1]) + Math.abs(c.nn[2] - t[0].nn[2]) < 1e-4)) {
              const odd = s.find(c => !ta.includes(c.ix)), j = [0, 1, 2].find(j => !sa.includes(ta[j])), q = [t[j], t[(j + 1) % 3], odd, t[(j + 2) % 3]];
              // опуклість чотирикутника (інакше лишаємо трикутники)
              const P3 = i => [pos[q[i].ix * 3], pos[q[i].ix * 3 + 1], pos[q[i].ix * 3 + 2]], cr = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]; return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };
              const z = [0, 1, 2, 3].map(i => cr(P3(i), P3((i + 1) % 4), P3((i + 2) % 4))), ok = z.every(a => a[0] * z[0][0] + a[1] * z[0][1] + a[2] * z[0][2] > 1e-9);
              if (ok) { polys.push(q.map(c => c.ix)); q.forEach(c => { nor.push(c.nn); uv.push(c.u || [0, 0]); }); mat.push(mi); k++; continue; } } }
          polys.push(t.map(c => c.ix)); t.forEach(c => { nor.push(c.nn); uv.push(c.u || [0, 0]); }); mat.push(mi);
        }
      }
    }
    return { pos, polys, nor, uv: anyUV ? uv : null, mat, mats };
  }
  // матеріал Three.js → Phong FBX (колір — у sRGB, як його показує 3ds Max; шорсткість → блиск; метал → відбиття; скло → непрозорість;
  // світіння — EmissiveColor, з нього скрипт робить CoronaLightMtl / VRayLightMtl)
  const srgb = (THREE, c) => { if (c.getRGB && THREE.SRGBColorSpace) { const t = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace); return [t.r, t.g, t.b]; } return [c.r, c.g, c.b]; };
  function materialFrom(THREE, m, texName) {
    const c = m.color || new THREE.Color(1, 1, 1), op = m.transparent ? (m.opacity != null ? m.opacity : 1) : 1, glass = m.userData && m.userData.glass;
    const rough = m.roughness != null ? m.roughness : 0.8, metal = m.metalness || 0;
    const e = m.emissive, eI = m.emissiveIntensity != null ? m.emissiveIntensity : 1, lit = !!(e && (e.r + e.g + e.b) * eI > 0.03);
    const out = { name: (m.name || (glass ? "Glass" : "Material")).replace(/[^\w\-]+/g, "_").slice(0, 60), diffuse: srgb(THREE, c), emissive: lit ? srgb(THREE, e) : null, emitLevel: lit ? eI : 0, opacity: glass ? Math.min(op, 0.25) : op, specular: Math.max(0.04, (1 - rough) * 0.5 + metal * 0.5), shininess: Math.round(2 + (1 - rough) * 98), reflection: glass ? 0.1 : metal * 0.8, map: null, normal: null, glass: !!glass, roughness: rough, metalness: metal };
    const tex = t => { const img = t && t.image; if (!img) return null; const n = texName(img); return n; };
    out.map = tex(m.map); out.normal = tex(m.normalMap);
    return out;
  }
  const api = Object.freeze({ writeFBX, meshData, materialFrom, toMax, toMaxN });
  if (typeof module === "object" && module.exports) module.exports = api; else root.RozstavFBX = api;
})(typeof window !== "undefined" ? window : this);
