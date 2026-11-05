/*
  РОЗСТАВ — типи предметів бібліотеки (вкладки й підкатегорії).
  ------------------------------------------------------------
  Один файл для інтерфейсу (window.RozstavTypes) і головного процесу програми (require), щоб
  преміум-каталог із сервера фільтрувався за тими самими правилами, що й локальна бібліотека.

  Як визначається тип предмета (перше спрацювання перемагає):
    1. ручний вибір користувача (зберігає інтерфейс і передає в classify як override);
    2. поле typeId у каталозі чи описі власної моделі, якщо воно є в TYPES;
    3. правила RULES за назвою: спершу українська назва, потім англійська (nameEn), потім id;
    4. «конструктор» простої моделі (type з library.js) — таблиця PROC;
    5. «Інше · Різне».
  Кімната (cat: living, kitchen…) лишається окремим полем: на ній тримаються AI-розстановка і фільтр «Кімната».

  Як додати правило: допишіть рядок у RULES перед загальнішими правилами. Регулярний вираз перевіряється
  на назві в нижньому регістрі; значення — "вкладка/підкатегорія" з TYPES.
*/
(function (root) {
  "use strict";
  const TYPES = [
    { id: "seating", name: "Дивани та крісла", subs: [["sofa", "Дивани"], ["armchair", "Крісла"], ["pouf", "Пуфи"], ["bench", "Банкетки"]] },
    { id: "tables", name: "Столи", subs: [["dining", "Обідні"], ["coffee", "Журнальні"], ["desk", "Письмові"], ["side", "Приставні"]] },
    { id: "chairs", name: "Стільці", subs: [["dining", "Обідні"], ["bar", "Барні"], ["office", "Офісні"], ["stool", "Табурети"]] },
    { id: "storage", name: "Шафи та зберігання", subs: [["wardrobe", "Шафи"], ["dresser", "Комоди"], ["rack", "Стелажі"], ["cabinet", "Тумби"], ["shelf", "Полиці"], ["hanger", "Вішаки"]] },
    { id: "beds", name: "Ліжка", subs: [["bed", "Ліжка"], ["headboard", "Узголів'я"], ["nightstand", "Приліжкові тумби"]] },
    { id: "lighting", name: "Освітлення", subs: [["chandelier", "Люстри"], ["sconce", "Бра"], ["floor", "Торшери"], ["table", "Настільні світильники"]] },
    { id: "decor", name: "Декор", subs: [["vase", "Вази"], ["sculpture", "Скульптури"], ["figurine", "Статуетки"], ["candle", "Свічники"], ["accessory", "Аксесуари"]] },
    { id: "textile", name: "Текстиль", subs: [["rug", "Килими"], ["curtain", "Штори"], ["pillow", "Подушки"], ["throw", "Пледи"]] },
    { id: "plants", name: "Рослини", subs: [["plant", "Кімнатні рослини"], ["tree", "Дерева"], ["pot", "Кашпо"]] },
    { id: "wall", name: "Дзеркала та картини", subs: [["mirror", "Дзеркала"], ["picture", "Картини"], ["poster", "Постери"], ["walldecor", "Настінний декор"]] },
    { id: "other", name: "Інше", subs: [["kitchen", "Кухонні модулі"], ["bath", "Сантехніка"], ["tech", "Техніка"], ["misc", "Різне"]] }
  ];
  const BY = {}; for (const t of TYPES) { BY[t.id] = t; t.subNames = Object.fromEntries(t.subs); }
  const valid = v => { if (typeof v !== "string") return false; const [t, s] = v.split("/"); return !!(BY[t] && BY[t].subNames[s]); };

  // порядок важливий: вужчі правила — вище за загальні («барний стілець» раніше за «стілець»)
  const RULES = [
    [/ігров\S* консол|gaming|вентилятор|\bfan\b|телевіз|\btv\b|television|ноутбук|laptop|магнітол|boombox|холодильн|fridge|пральн|сушильн|washer|dryer|посудомийн|dishwasher|мікрохвил|microwave|кондиціонер|радіатор|\bradiator|чайник|kettle|radio/, "other/tech"],
    [/пенал для ванн|дзеркальна шафк|mirror cabinet/, "storage/wardrobe"],
    [/туалетний столик|dressing table/, "tables/side"],
    [/модуль|пенал|острів|\bisland|витяжк|\bhood\b|kitchen cabinet|мийк/, "other/kitchen"],
    [/(^|\s)ванна($|\s)|bathtub|\bbath\b|(^|\s)душ|shower|унітаз|toilet|раковин|\bsink|рушникосуш|towel/, "other/bath"],
    [/подуш|pillow|cushion/, "textile/pillow"],
    [/диван|sofa|софа|couch|кушетк|day ?bed|loveseat/, "seating/sofa"],
    [/офісн\S* крісл|office chair|учнівськ|school chair|desk chair/, "chairs/office"],
    [/барн\S* стіл|bar chair|bar stool|барний/, "chairs/bar"],
    [/крісл|armchair|arm chair|lounge chair|rocking ?chair|recliner|green ?chair/, "seating/armchair"],
    [/пуф|ottoman|pouf/, "seating/pouf"],
    [/банкетк|(^|\s)лава($|\s)|bench/, "seating/bench"],
    [/табурет|stool/, "chairs/stool"],
    [/стіл[еь]ц|стільц|\bchair/, "chairs/dining"],
    [/приліжков|nightstand|bedside/, "beds/nightstand"],
    [/узголів|headboard/, "beds/headboard"],
    [/ліжк|ліжечк|\bbed\b|bed frame|\bcrib|bunk/, "beds/bed"],
    [/тумб|tv stand|drawer cabinet/, "storage/cabinet"],
    [/журнальн|чайний столик|coffee table|tea table/, "tables/coffee"],
    [/письмов|робоч\S* стіл|\bdesk|парта|дитячий стіл|стіл компактний/, "tables/desk"],
    [/ігрова консол/, "other/tech"],
    [/приставн|side table|консоль|console|столик малий|small .*table|end table/, "tables/side"],
    [/обідн|dining|стіл круглий|kitchen table/, "tables/dining"],
    // загальне «стіл»/table — слабке правило: якщо відомий «конструктор» простої моделі (робочий стіл тощо), перемагає він
    [/(^|\s)стіл($|\s)|table/, "tables/dining", true],
    [/вішак|coat rack|hanger/, "storage/hanger"],
    [/настінн\S* полиц|wall shelf/, "storage/shelf"],
    [/стелаж|полиці|shelves|bookcase|bookshelf|книжков\S* шаф|етажерк|\brack\b/, "storage/rack"],
    [/комод|commode|dresser|drawer|шухляд|буфет|sideboard|пеленальн|modern wooden cabinet/, "storage/dresser"],
    [/шаф|wardrobe|сервант|вітрин|cabinet|closet|armoire/, "storage/wardrobe"],
    [/полиц|shelf/, "storage/shelf"],
    [/стельов\S* вентил/, "other/tech"],
    [/люстр|chandelier|підвіс|pendant|стельов|ceiling (lamp|light)|hanging .*lamp/, "lighting/chandelier"],
    [/(^|\s)бра($|\s)|sconce|wall lamp|wall light/, "lighting/sconce"],
    [/торшер|floor lamp/, "lighting/floor"],
    [/ламп|lamp|ліхтар|lantern|світильник|light/, "lighting/table"],
    [/дзеркал|mirror/, "wall/mirror"],
    [/фоторамк|standing picture|photo frame/, "decor/accessory"],
    [/постер|poster/, "wall/poster"],
    [/картин|painting|picture|artwork|\bart\b|canvas/, "wall/picture"],
    [/годинник|clock|панно|wall decor|настінн/, "wall/walldecor"],
    [/кашпо|вазон|planter|plant pot|pot clay/, "plants/pot"],
    [/велика рослин|big plant|дерев(о|це)($|\s)|tree|фікус|ficus|пальм|palm|монстер|monstera/, "plants/tree"],
    [/рослин|plant|квіт|flower|кактус|cactus|succulent/, "plants/plant"],
    [/свіч|candle/, "decor/candle"],
    [/скульптур|sculpture|бюст|\bbust\b|statue/, "decor/sculpture"],
    [/статуетк|figurine|фігурк|слон|elephant|качечк|\bduck|іграшк|\btoy/, "decor/figurine"],
    [/кошик|basket|книж|\bbook|енциклопед|валіз|suitcase|сервіз|tea set|миск|\bbowl|глечик|\bjug|скриньк|\bbox\b|tray|піднос/, "decor/accessory"],
    [/ваз|vase|кераміка|ceramic/, "decor/vase"],
    [/килим|\brug|carpet|mat\b/, "textile/rug"],
    [/штор|curtain|drape/, "textile/curtain"],
    [/плед|throw|blanket/, "textile/throw"],
    [/дошка|chalkboard|board/, "other/misc"]
  ];
  // простий предмет без вдалої назви: за «конструктором» з library.js
  const PROC = {
    sofa: "seating/sofa", sofa_corner: "seating/sofa", armchair: "seating/armchair", pouf: "seating/pouf", bench: "seating/bench",
    table_low: "tables/coffee", table: "tables/dining", table_round: "tables/coffee", desk: "tables/desk", desk_plain: "tables/desk", console: "tables/side",
    chair: "chairs/dining", bar_stool: "chairs/bar", office_chair: "chairs/office",
    wardrobe: "storage/wardrobe", dresser: "storage/dresser", shelf: "storage/rack", wall_shelf: "storage/shelf", tv_stand: "storage/cabinet", coat_rack: "storage/hanger",
    bed: "beds/bed", crib: "beds/bed", bunk_bed: "beds/bed", nightstand: "beds/nightstand",
    floor_lamp: "lighting/floor", table_lamp: "lighting/table", sconce: "lighting/sconce", pendant: "lighting/chandelier",
    vase: "decor/vase", ceramics: "decor/vase", books: "decor/accessory", basket: "decor/accessory",
    rug: "textile/rug", curtains: "textile/curtain", pillows: "textile/pillow", throw: "textile/throw",
    plant: "plants/plant", art: "wall/picture", mirror_wall: "wall/mirror", floor_mirror: "wall/mirror",
    base_cabinet: "other/kitchen", sink_cabinet: "other/kitchen", stove: "other/kitchen", tall_cabinet: "other/kitchen", upper_cabinet: "other/kitchen", island: "other/kitchen", hood: "other/kitchen",
    fridge: "other/tech", washer: "other/tech", microwave: "other/tech", tv_wall: "other/tech", ac_unit: "other/tech", radiator: "other/tech",
    bathtub: "other/bath", shower: "other/bath", toilet: "other/bath", vanity: "other/bath", towel_dryer: "other/bath"
  };

  // def: { name, nameEn, id, type, typeId }; повертає { ty, sub, key, how } — how: override | catalog | name | kind | none
  function classify(def, override) {
    const pack = (key, how) => { const [ty, sub] = key.split("/"); return { ty, sub, key, how }; };
    if (valid(override)) return pack(override, "override");
    if (def && valid(def.typeId)) return pack(def.typeId, "catalog");
    for (const f of [def && def.name, def && def.nameEn, def && def.id]) {
      const s = String(f || "").toLowerCase().replace(/[_\-]+/g, " ");
      if (!s) continue;
      for (const [re, key, weak] of RULES) if (re.test(s)) return weak && def.type && PROC[def.type] ? pack(PROC[def.type], "kind") : pack(key, "name");
    }
    if (def && PROC[def.type]) return pack(PROC[def.type], "kind");
    return pack("other/misc", "none");
  }
  const label = key => { const [t, s] = String(key).split("/"); return BY[t] ? (BY[t].subNames[s] || BY[t].name) : "Інше"; };
  const api = Object.freeze({ TYPES, classify, valid, label, typeName: id => (BY[id] ? BY[id].name : "Інше") });
  if (typeof module === "object" && module.exports) module.exports = api; else root.RozstavTypes = api;
})(typeof window !== "undefined" ? window : this);
