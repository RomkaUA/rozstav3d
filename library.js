/*
  РОЗСТАВ — галерея меблів (бібліотека)
  ------------------------------------------------------------
  Як додати новий предмет:
    1. Скопіюйте будь-який рядок у масиві items.
    2. Дайте унікальний id, назву, категорію (cat) і реальні розміри в сантиметрах:
         w — ширина (вздовж фасаду), d — глибина, h — висота.
    3. type — яким «конструктором» малювати модель (див. список TYPES нижче).
    4. premium: true — предмет доступний лише в Преміум.
    5. clear — ергономічні зони (см), які перевіряє застосунок:
         front     — вільне місце перед фасадом (сторона, куди «дивиться» предмет);
         side      — вільне місце з лівого та правого боку;
         sideSkip  — скільки см від задньої стінки не перевіряти збоку
                     (наприклад, біля узголів'я ліжка стоять тумби);
         frontLabel — як назвати передню зону в підказці.
    6. tuck: true — предмет можна засувати під стіл (стільці), він не вважається перешкодою.
    7. surface — висота поверхні (см), на яку можна ставити декор (сидіння дивана, стільниця).
       Якщо не вказано, береться h.
    8. mount — як кріпиться предмет:
         "top"     — ставиться на меблі під ним (подушки, книжки, лампа);
         "wall"    — вішається на найближчу стіну, elev — висота низу від підлоги (см);
         "ceiling" — підвішується до стелі, h — довжина підвісу разом з плафоном.
       Такі предмети не вважаються перешкодою на підлозі.

  TYPES: sofa, sofa_corner, armchair, table_low, table, desk, chair, office_chair,
         tv_stand, shelf, rug, floor_lamp, plant, bed, nightstand, wardrobe, dresser,
         base_cabinet, sink_cabinet, stove, tall_cabinet, fridge, island,
         bathtub, shower, toilet, vanity, washer, bench, console,
         pillows, throw, books, vase, ceramics, table_lamp, art, sconce, mirror_wall,
         wall_shelf, curtains, pendant, pouf, basket, floor_mirror,
         upper_cabinet, hood, tv_wall, ac_unit, radiator, microwave, bar_stool,
         table_round, desk_plain, coat_rack, towel_dryer, crib, bunk_bed

  Пізніше сюди можна додати поле model: "url.glb" для справжніх 3D-моделей виробників.
*/
window.ROZSTAV_LIBRARY = {
  categories: [
    { id: "living",  name: "Вітальня" },
    { id: "bedroom", name: "Спальня" },
    { id: "kitchen", name: "Кухня" },
    { id: "bath",    name: "Ванна" },
    { id: "office",  name: "Кабінет" },
    { id: "kids",    name: "Дитяча" },
    { id: "tech",    name: "Техніка" },
    { id: "hall",    name: "Передпокій" },
    { id: "decor",   name: "Декор" },
    { id: "light",   name: "Світло" },
    { id: "textile", name: "Текстиль" }
  ],
  items: [
    // Вітальня
    { id: "sofa3",       name: "Диван 3-місний",      cat: "living",  type: "sofa",        w: 220, d: 95,  h: 85,  surface: 44, premium: false, clear: { front: 35, frontLabel: "до столика / проходу" } },
    { id: "sofa2",       name: "Диван 2-місний",      cat: "living",  type: "sofa",        w: 170, d: 90,  h: 85,  surface: 44, premium: false, clear: { front: 35, frontLabel: "до столика / проходу" } },
    { id: "sofa_corner", name: "Кутовий диван",       cat: "living",  type: "sofa_corner", w: 270, d: 165, h: 85,  surface: 44, premium: true,  clear: { front: 35, frontLabel: "до столика / проходу" } },
    { id: "armchair",    name: "Крісло",              cat: "living",  type: "armchair",    w: 80,  d: 82,  h: 85,  surface: 44, premium: false, clear: { front: 40 } },
    { id: "pouf",        name: "Пуф",                 cat: "living",  type: "pouf",        w: 45,  d: 45,  h: 42,  premium: false },
    { id: "coffee",      name: "Журнальний столик",   cat: "living",  type: "table_low",   w: 110, d: 60,  h: 42,  premium: false },
    { id: "tvstand",     name: "ТВ-тумба з ТВ 55″",   cat: "living",  type: "tv_stand",    w: 180, d: 42,  h: 130, surface: 48, premium: false, clear: { front: 60 } },
    { id: "shelf",       name: "Стелаж",              cat: "living",  type: "shelf",       w: 100, d: 35,  h: 200, premium: false, clear: { front: 60 } },
    { id: "shelf_wide",  name: "Стелаж широкий",      cat: "living",  type: "shelf",       w: 160, d: 38,  h: 220, premium: true,  clear: { front: 60 } },

    // Спальня
    { id: "bed160",      name: "Ліжко 160×200",       cat: "bedroom", type: "bed",         w: 160, d: 210, h: 100, surface: 52, premium: false, clear: { front: 60, side: 60, sideSkip: 55, frontLabel: "у ногах" } },
    { id: "bed140",      name: "Ліжко 140×200",       cat: "bedroom", type: "bed",         w: 140, d: 210, h: 100, surface: 52, premium: false, clear: { front: 60, side: 60, sideSkip: 55, frontLabel: "у ногах" } },
    { id: "bed180",      name: "Ліжко 180×200",       cat: "bedroom", type: "bed",         w: 180, d: 212, h: 110, surface: 52, premium: true,  clear: { front: 60, side: 70, sideSkip: 55, frontLabel: "у ногах" } },
    { id: "bed90",       name: "Ліжко 90×200",        cat: "bedroom", type: "bed",         w: 90,  d: 205, h: 90,  surface: 52, premium: false, clear: { side: 60, sideSkip: 50 } },
    { id: "nightstand",  name: "Приліжкова тумба",    cat: "bedroom", type: "nightstand",  w: 50,  d: 40,  h: 55,  premium: false },
    { id: "wardrobe",    name: "Шафа-купе 200",       cat: "bedroom", type: "wardrobe",    w: 200, d: 60,  h: 240, premium: false, clear: { front: 60 } },
    { id: "wardrobe_l",  name: "Шафа-купе 280",       cat: "bedroom", type: "wardrobe",    w: 280, d: 62,  h: 260, premium: true,  clear: { front: 60 } },
    { id: "dresser",     name: "Комод",               cat: "bedroom", type: "dresser",     w: 120, d: 50,  h: 85,  premium: false, clear: { front: 90, frontLabel: "для шухляд" } },
    { id: "fmirror",     name: "Підлогове дзеркало",  cat: "bedroom", type: "floor_mirror", w: 60, d: 6,   h: 170, premium: false },

    // Кухня
    { id: "k_base",      name: "Нижній модуль 60",    cat: "kitchen", type: "base_cabinet", w: 60,  d: 60, h: 90,  premium: false, clear: { front: 100, frontLabel: "робочий прохід" } },
    { id: "k_base80",    name: "Нижній модуль 80",    cat: "kitchen", type: "base_cabinet", w: 80,  d: 60, h: 90,  premium: false, clear: { front: 100, frontLabel: "робочий прохід" } },
    { id: "k_sink",      name: "Модуль з мийкою",     cat: "kitchen", type: "sink_cabinet", w: 80,  d: 60, h: 90,  premium: false, clear: { front: 100, frontLabel: "робочий прохід" } },
    { id: "k_stove",     name: "Модуль з плитою",     cat: "kitchen", type: "stove",        w: 60,  d: 60, h: 90,  premium: false, clear: { front: 100, frontLabel: "робочий прохід" } },
    { id: "k_tall",      name: "Пенал",               cat: "kitchen", type: "tall_cabinet", w: 60,  d: 60, h: 220, premium: false, clear: { front: 90 } },
    { id: "fridge",      name: "Холодильник",         cat: "kitchen", type: "fridge",       w: 60,  d: 65, h: 200, premium: false, clear: { front: 100, frontLabel: "для дверцят" } },
    { id: "island",      name: "Острів",              cat: "kitchen", type: "island",       w: 180, d: 95, h: 90,  premium: true,  clear: { front: 60, frontLabel: "для стільців" } },
    { id: "dining4",     name: "Обідній стіл 140",    cat: "kitchen", type: "table",        w: 140, d: 80, h: 75,  premium: false },
    { id: "dining6",     name: "Обідній стіл 180",    cat: "kitchen", type: "table",        w: 180, d: 90, h: 75,  premium: true },
    { id: "chair",       name: "Стілець",             cat: "kitchen", type: "chair",        w: 45,  d: 50, h: 88,  surface: 45, premium: false, tuck: true },

    // Ванна
    { id: "bathtub",     name: "Ванна 170",           cat: "bath",    type: "bathtub",     w: 170, d: 75,  h: 58,  premium: false, clear: { front: 70 } },
    { id: "shower",      name: "Душова 90×90",        cat: "bath",    type: "shower",      w: 90,  d: 90,  h: 200, surface: 5, premium: false, clear: { front: 60 } },
    { id: "shower_wi",   name: "Душ walk-in 90×140",  cat: "bath",    type: "shower",      w: 140, d: 90,  h: 200, surface: 5, premium: true,  clear: { front: 60 } },
    { id: "toilet",      name: "Унітаз",              cat: "bath",    type: "toilet",      w: 38,  d: 65,  h: 80,  premium: false, clear: { front: 55, side: 20 } },
    { id: "vanity",      name: "Раковина з тумбою",   cat: "bath",    type: "vanity",      w: 80,  d: 48,  h: 85,  premium: false, clear: { front: 70 } },
    { id: "washer",      name: "Пральна машина",      cat: "bath",    type: "washer",      w: 60,  d: 55,  h: 85,  premium: false, clear: { front: 60 } },

    // Кабінет
    { id: "desk",        name: "Робочий стіл",        cat: "office",  type: "desk",        w: 120, d: 60,  h: 75,  premium: false, clear: { front: 90, frontLabel: "для стільця" } },
    { id: "desk_l",      name: "Стіл 160",            cat: "office",  type: "desk",        w: 160, d: 70,  h: 75,  premium: true,  clear: { front: 90, frontLabel: "для стільця" } },
    { id: "ochair",      name: "Офісне крісло",       cat: "office",  type: "office_chair", w: 62, d: 62,  h: 110, surface: 48, premium: false, tuck: true },

    // Передпокій
    { id: "shoe",        name: "Взуттєва шафа",       cat: "hall",    type: "dresser",     w: 100, d: 32,  h: 100, premium: false, clear: { front: 80, frontLabel: "прохід" } },
    { id: "bench",       name: "Лава",                cat: "hall",    type: "bench",       w: 100, d: 36,  h: 45,  premium: false, clear: { front: 60 } },
    { id: "console",     name: "Консоль",             cat: "hall",    type: "console",     w: 110, d: 35,  h: 80,  premium: false, clear: { front: 60 } },
    { id: "hall_wr",     name: "Шафа для одягу",      cat: "hall",    type: "wardrobe",    w: 120, d: 60,  h: 240, premium: false, clear: { front: 80, frontLabel: "прохід" } },

    // Декор
    { id: "rug",         name: "Килим 240×170",       cat: "decor",   type: "rug",         w: 240, d: 170, h: 1,   premium: false },
    { id: "rug_l",       name: "Килим 300×200",       cat: "decor",   type: "rug",         w: 300, d: 200, h: 1,   premium: true },
    { id: "plant",       name: "Рослина в горщику",   cat: "decor",   type: "plant",       w: 45,  d: 45,  h: 120, premium: false },
    { id: "plant_big",   name: "Велика рослина",      cat: "decor",   type: "plant",       w: 70,  d: 70,  h: 180, premium: true },
    { id: "basket",      name: "Кошик з пледом",      cat: "decor",   type: "basket",      w: 40,  d: 40,  h: 45,  premium: false },
    { id: "books",       name: "Стос книжок",         cat: "decor",   type: "books",       w: 28,  d: 20,  h: 12,  premium: false, mount: "top" },
    { id: "vase",        name: "Ваза з гілками",      cat: "decor",   type: "vase",        w: 22,  d: 22,  h: 70,  premium: false, mount: "top" },
    { id: "ceramics",    name: "Кераміка, набір",     cat: "decor",   type: "ceramics",    w: 40,  d: 18,  h: 24,  premium: false, mount: "top" },
    { id: "art",         name: "Картина 90×60",       cat: "decor",   type: "art",         w: 90,  d: 4,   h: 60,  premium: false, mount: "wall", elev: 130 },
    { id: "art_v",       name: "Картина 50×70",       cat: "decor",   type: "art",         w: 50,  d: 3,   h: 70,  premium: false, mount: "wall", elev: 120 },
    { id: "mirror",      name: "Кругле дзеркало",     cat: "decor",   type: "mirror_wall", w: 70,  d: 4,   h: 70,  premium: false, mount: "wall", elev: 110 },
    { id: "wshelf",      name: "Настінна полиця",     cat: "decor",   type: "wall_shelf",  w: 120, d: 22,  h: 22,  premium: false, mount: "wall", elev: 150 },

    // Світло
    { id: "lamp",        name: "Торшер",              cat: "light",   type: "floor_lamp",  w: 40,  d: 40,  h: 160, premium: false },
    { id: "tlamp",       name: "Настільна лампа",     cat: "light",   type: "table_lamp",  w: 32,  d: 32,  h: 52,  premium: false, mount: "top" },
    { id: "sconce",      name: "Бра",                 cat: "light",   type: "sconce",      w: 18,  d: 20,  h: 30,  premium: false, mount: "wall", elev: 150 },
    { id: "pendant",     name: "Підвісний світильник", cat: "light",  type: "pendant",     w: 60,  d: 60,  h: 70,  premium: false, mount: "ceiling" },

    // Текстиль
    { id: "pillows",     name: "Декоративні подушки", cat: "textile", type: "pillows",     w: 110, d: 18,  h: 45,  premium: false, mount: "top" },
    { id: "throw",       name: "Плед",                cat: "textile", type: "throw",       w: 70,  d: 50,  h: 4,   premium: false, mount: "top" },
    { id: "curtains",    name: "Штори",               cat: "textile", type: "curtains",    w: 220, d: 12,  h: 255, premium: false, mount: "wall", elev: 0 },

    // ---- поповнення галереї ----
    // Вітальня
    { id: "sofa_bed",    name: "Диван-ліжко",         cat: "living",  type: "sofa",        w: 200, d: 95,  h: 90,  surface: 44, premium: false, clear: { front: 35, frontLabel: "до столика / проходу" } },
    { id: "sofa4",       name: "Диван 4-місний",      cat: "living",  type: "sofa",        w: 260, d: 100, h: 85,  surface: 44, premium: false, clear: { front: 35, frontLabel: "до столика / проходу" } },
    { id: "armchair_r",  name: "Крісло для читання",  cat: "living",  type: "armchair",    w: 75,  d: 85,  h: 100, surface: 44, premium: false, clear: { front: 40 } },
    { id: "coffee_r",    name: "Столик круглий",      cat: "living",  type: "table_round", w: 80,  d: 80,  h: 42,  premium: false },
    { id: "side_t",      name: "Приставний столик",   cat: "living",  type: "table_round", w: 45,  d: 45,  h: 55,  premium: false },
    { id: "sideboard",   name: "Буфет",               cat: "living",  type: "dresser",     w: 160, d: 45,  h: 80,  premium: false, clear: { front: 70, frontLabel: "для дверцят" } },
    { id: "shelf_low",   name: "Низький стелаж",      cat: "living",  type: "shelf",       w: 120, d: 35,  h: 80,  premium: false, clear: { front: 60 } },
    { id: "ottoman",     name: "Пуф великий",         cat: "living",  type: "pouf",        w: 70,  d: 70,  h: 42,  premium: false },

    // Спальня
    { id: "bed200",      name: "Ліжко 200×200",       cat: "bedroom", type: "bed",         w: 200, d: 212, h: 110, surface: 52, premium: true,  clear: { front: 60, side: 70, sideSkip: 55, frontLabel: "у ногах" } },
    { id: "bed120",      name: "Ліжко 120×200",       cat: "bedroom", type: "bed",         w: 120, d: 208, h: 95,  surface: 52, premium: false, clear: { side: 60, sideSkip: 55 } },
    { id: "wardrobe_h",  name: "Шафа розпашна 150",   cat: "bedroom", type: "wardrobe",    w: 150, d: 60,  h: 220, premium: false, clear: { front: 75, frontLabel: "для дверцят" } },
    { id: "wardrobe_c",  name: "Шафа-купе 160",       cat: "bedroom", type: "wardrobe",    w: 160, d: 45,  h: 240, premium: false, clear: { front: 60 } },
    { id: "nightstand_s", name: "Тумба вузька",       cat: "bedroom", type: "nightstand",  w: 40,  d: 35,  h: 50,  premium: false },
    { id: "vanity_t",    name: "Туалетний столик",    cat: "bedroom", type: "console",     w: 100, d: 45,  h: 75,  premium: false, clear: { front: 80, frontLabel: "для стільця" } },
    { id: "dresser_h",   name: "Комод високий",       cat: "bedroom", type: "dresser",     w: 80,  d: 45,  h: 120, premium: false, clear: { front: 90, frontLabel: "для шухляд" } },

    // Дитяча
    { id: "crib",        name: "Дитяче ліжечко",      cat: "kids",    type: "crib",        w: 66,  d: 126, h: 95,  premium: false, clear: { side: 50 } },
    { id: "bunk",        name: "Двоярусне ліжко",     cat: "kids",    type: "bunk_bed",    w: 100, d: 208, h: 165, premium: false, clear: { front: 70, side: 60, frontLabel: "біля драбини" } },
    { id: "kid_bed",     name: "Ліжко дитяче 80×160", cat: "kids",    type: "bed",         w: 80,  d: 165, h: 80,  surface: 45, premium: false, clear: { side: 50, sideSkip: 40 } },
    { id: "kid_desk",    name: "Дитячий стіл",        cat: "kids",    type: "desk_plain",  w: 100, d: 55,  h: 65,  premium: false, clear: { front: 70, frontLabel: "для стільця" } },
    { id: "kid_chair",   name: "Дитячий стілець",     cat: "kids",    type: "chair",       w: 35,  d: 35,  h: 65,  surface: 35, premium: false, tuck: true },
    { id: "changer",     name: "Комод-пеленальник",   cat: "kids",    type: "dresser",     w: 80,  d: 50,  h: 90,  premium: false, clear: { front: 80 } },
    { id: "kid_shelf",   name: "Стелаж для іграшок",  cat: "kids",    type: "shelf",       w: 100, d: 30,  h: 100, premium: false, clear: { front: 60 } },
    { id: "play_rug",    name: "Ігровий килимок",     cat: "kids",    type: "rug",         w: 150, d: 150, h: 1,   premium: false },
    { id: "toy_basket",  name: "Кошик для іграшок",   cat: "kids",    type: "basket",      w: 45,  d: 45,  h: 40,  premium: false },

    // Кухня
    { id: "k_up60",      name: "Верхній модуль 60",   cat: "kitchen", type: "upper_cabinet", w: 60, d: 33, h: 72,  premium: false, mount: "wall", elev: 145 },
    { id: "k_up80",      name: "Верхній модуль 80",   cat: "kitchen", type: "upper_cabinet", w: 80, d: 33, h: 72,  premium: false, mount: "wall", elev: 145 },
    { id: "k_up40",      name: "Верхній модуль 40",   cat: "kitchen", type: "upper_cabinet", w: 40, d: 33, h: 72,  premium: false, mount: "wall", elev: 145 },
    { id: "hood",        name: "Витяжка 60",          cat: "kitchen", type: "hood",        w: 60,  d: 50,  h: 90,  premium: false, mount: "wall", elev: 155 },
    { id: "k_base40",    name: "Нижній модуль 40",    cat: "kitchen", type: "base_cabinet", w: 40, d: 60,  h: 90,  premium: false, clear: { front: 100, frontLabel: "робочий прохід" } },
    { id: "dishwasher",  name: "Посудомийна машина",  cat: "kitchen", type: "base_cabinet", w: 60, d: 60,  h: 90,  premium: false, clear: { front: 100, frontLabel: "для дверцят" } },
    { id: "fridge_w",    name: "Холодильник широкий", cat: "kitchen", type: "fridge",      w: 70,  d: 70,  h: 200, premium: false, clear: { front: 100, frontLabel: "для дверцят" } },
    { id: "island_s",    name: "Острів компактний",   cat: "kitchen", type: "island",      w: 120, d: 70,  h: 90,  premium: false, clear: { front: 60, frontLabel: "для стільців" } },
    { id: "dining_r",    name: "Стіл круглий 100",    cat: "kitchen", type: "table_round", w: 100, d: 100, h: 75,  premium: false },
    { id: "dining_s",    name: "Обідній стіл 120",    cat: "kitchen", type: "table",       w: 120, d: 75,  h: 75,  premium: false },
    { id: "bar_stool",   name: "Барний стілець",      cat: "kitchen", type: "bar_stool",   w: 40,  d: 40,  h: 75,  surface: 75, premium: false, tuck: true },
    { id: "microwave",   name: "Мікрохвильовка",      cat: "kitchen", type: "microwave",   w: 45,  d: 35,  h: 27,  premium: false, mount: "top" },

    // Ванна
    { id: "bathtub150",  name: "Ванна 150",           cat: "bath",    type: "bathtub",     w: 150, d: 70,  h: 58,  premium: false, clear: { front: 70 } },
    { id: "vanity60",    name: "Раковина 60",         cat: "bath",    type: "vanity",      w: 60,  d: 45,  h: 85,  premium: false, clear: { front: 70 } },
    { id: "vanity140",   name: "Подвійна раковина",   cat: "bath",    type: "vanity",      w: 140, d: 50,  h: 85,  premium: true,  clear: { front: 70 } },
    { id: "towel",       name: "Рушникосушка",        cat: "bath",    type: "towel_dryer", w: 50,  d: 10,  h: 80,  premium: false, mount: "wall", elev: 90 },
    { id: "mirror_cab",  name: "Дзеркальна шафка",    cat: "bath",    type: "upper_cabinet", w: 60, d: 15, h: 70,  premium: false, mount: "wall", elev: 120 },
    { id: "bath_tall",   name: "Пенал для ванної",    cat: "bath",    type: "tall_cabinet", w: 35, d: 30,  h: 170, premium: false, clear: { front: 60 } },
    { id: "dryer",       name: "Сушильна машина",     cat: "bath",    type: "washer",      w: 60,  d: 60,  h: 85,  premium: false, clear: { front: 60 } },

    // Кабінет
    { id: "bookcase",    name: "Книжкова шафа",       cat: "office",  type: "shelf",       w: 80,  d: 30,  h: 180, premium: false, clear: { front: 60 } },
    { id: "desk_s",      name: "Стіл компактний 100", cat: "office",  type: "desk_plain",  w: 100, d: 55,  h: 75,  premium: false, clear: { front: 90, frontLabel: "для стільця" } },
    { id: "drawer_unit", name: "Тумба під стіл",      cat: "office",  type: "nightstand",  w: 40,  d: 50,  h: 60,  premium: false },
    { id: "guest_chair", name: "Крісло для гостей",   cat: "office",  type: "armchair",    w: 70,  d: 70,  h: 80,  surface: 44, premium: false, clear: { front: 40 } },

    // Передпокій
    { id: "coat_rack",   name: "Вішак підлоговий",    cat: "hall",    type: "coat_rack",   w: 45,  d: 45,  h: 180, premium: false },
    { id: "shoe_slim",   name: "Взуттєва шафа вузька", cat: "hall",   type: "dresser",     w: 60,  d: 24,  h: 110, premium: false, clear: { front: 70, frontLabel: "прохід" } },
    { id: "hall_wr160",  name: "Шафа-купе в коридор", cat: "hall",    type: "wardrobe",    w: 160, d: 45,  h: 240, premium: false, clear: { front: 70, frontLabel: "прохід" } },
    { id: "runner",      name: "Килим-доріжка",       cat: "hall",    type: "rug",         w: 80,  d: 200, h: 1,   premium: false },

    // Техніка
    { id: "tv_wall55",   name: "ТВ на стіну 55″",     cat: "tech",    type: "tv_wall",     w: 123, d: 5,   h: 71,  premium: false, mount: "wall", elev: 100 },
    { id: "tv_wall65",   name: "ТВ на стіну 65″",     cat: "tech",    type: "tv_wall",     w: 145, d: 5,   h: 84,  premium: false, mount: "wall", elev: 95 },
    { id: "ac",          name: "Кондиціонер",         cat: "tech",    type: "ac_unit",     w: 85,  d: 25,  h: 30,  premium: false, mount: "wall", elev: 215 },
    { id: "radiator",    name: "Радіатор",            cat: "tech",    type: "radiator",    w: 80,  d: 10,  h: 60,  premium: false, mount: "wall", elev: 10 },

    // Декор, світло, текстиль
    { id: "floor_vase",  name: "Підлогова ваза",      cat: "decor",   type: "vase",        w: 30,  d: 30,  h: 90,  premium: false },
    { id: "plant_s",     name: "Рослина мала",        cat: "decor",   type: "plant",       w: 30,  d: 30,  h: 60,  premium: false },
    { id: "art_wide",    name: "Картина 120×50",      cat: "decor",   type: "art",         w: 120, d: 4,   h: 50,  premium: false, mount: "wall", elev: 140 },
    { id: "candles",     name: "Свічки й кераміка",   cat: "decor",   type: "ceramics",    w: 30,  d: 15,  h: 18,  premium: false, mount: "top" },
    { id: "lamp_tall",   name: "Торшер високий",      cat: "light",   type: "floor_lamp",  w: 40,  d: 40,  h: 180, premium: false },
    { id: "pendant_s",   name: "Підвіс малий",        cat: "light",   type: "pendant",     w: 30,  d: 30,  h: 80,  premium: false, mount: "ceiling" },
    { id: "chandelier",  name: "Люстра велика",       cat: "light",   type: "pendant",     w: 80,  d: 80,  h: 70,  premium: true,  mount: "ceiling" },
    { id: "curtains_l",  name: "Штори 300",           cat: "textile", type: "curtains",    w: 300, d: 12,  h: 255, premium: false, mount: "wall", elev: 0 },
    { id: "pillows_bed", name: "Подушки на ліжко",    cat: "textile", type: "pillows",     w: 150, d: 20,  h: 50,  premium: false, mount: "top" },
    { id: "throw_l",     name: "Плед великий",        cat: "textile", type: "throw",       w: 130, d: 70,  h: 4,   premium: false, mount: "top" }
  ]
};
