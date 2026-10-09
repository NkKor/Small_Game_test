/* =========================================================================
 * PixelCraft — воксельная песочница на ГЕКСАГОНАЛЬНЫХ ПРИЗМАХ
 * Релиз 3.4:
 *   - тело игрока смещено ниже: при взгляде вниз видны грудь и ноги,
 *     торс наклонён вперёд (forward offset), чтобы не заслонять обзор
 *   - деревья рандомизированы по высоте: от ~3 ростов игрока (6 блоков)
 *     до 50; у высоких деревьев толстый ствол (гекс-кластер) и крупная крона
 *   - окно инвентаря: рядом с гексагоном инвентаря — гексагон предпросмотра
 *     персонажа (соприкасаются гранью) + 7 слотов экипировки по свободным
 *     граням: шлем, нагрудник, штаны, сапоги, перчатки, оружие (2 руки)
 * Релиз 3.3:
 *   - частицы «рассыпания» при разрушении блока (фрагменты текстуры блока)
 *   - инвентарь-соты: грань 6 ячеек (91 ячейка), логика «как в Minecraft»:
 *     ломаем — подбираем в стак (до 64), ставим — тратим из слота
 *   - базовое тело игрока из гекс-призм (видно при взгляде вниз)
 *   - рука (viewmodel from гекс-призм) промахивается при нажатиях мыши
 * Релиз 3.2:
 *   - приложение-обёртка Electron (main.js, npm start); надёжный pointer lock
 *   - экран паузы: ESC освобождает мышь и ставит игру на паузу,
 *     клик по оверлею возвращает захват и продолжает игру
 *   - интерфейс переведён на гексагоны: слоты хотбара, образцы блоков,
 *     прицел, табличка названия блока и оформление меню
 * Релиз 3.1:
 *   - ИСПРАВЛЕНО отсечение боковых граней: индексация рёбер nbCell() приведена
 *     в соответствие с геометрией HEX_VERTS. Раньше 4 из 6 рёбер проверяли
 *     «не того» соседа (отражение по оси Z), из-за чего грани, соприкасающиеся
 *     с другими блоками, рисовались на неверной стороне, а на их месте
 *     появлялись «дыры» (сквозь них виден фон/туман).
 * Релиз 3:
 *   - мир: гексагональная решётка 200 x 200 колонок, высота 100
 *   - блок = шестиугольная призма (pointy-top), соседей 6 + верх/низ
 *   - сохранены: размер, слои земли (дёрн/почва/песок/глина/камень/бедрок),
 *     процедурные текстуры, всё поведение (копание, установка, осыпание листвы)
 *   - сохранено управление и хотбар
 * ========================================================================= */
(function () {
  'use strict';

  const VERSION = '3.4';
  const THREE = window.THREE;

  /* ----------------------------- Константы мира ----------------------------- */
  const HEX_COLS = 200;      // столбцов гекс-решётки
  const HEX_ROWS = 200;      // рядов
  const WORLD_Y = 130;       // высота (поднято для высоких деревьев до 50 блоков)
  const R = 1.0;             // радиус описанной окружности гекса (размер)
  const HEX_W = Math.sqrt(3) * R;   // ширина гекса (по X)
  const HEX_V = 1.5 * R;            // вертикальный шаг рядов (по Z)
  const CHUNK = 16;
  const CHUNKS_C = Math.ceil(HEX_COLS / CHUNK);
  const CHUNKS_R = Math.ceil(HEX_ROWS / CHUNK);

  const SEED = 20240607;
  const REACH = 6;
  const GRAVITY = -26;
  const JUMP_SPEED = 8.6;
  const WALK_SPEED = 4.7;
  const RUN_SPEED = 7.6;
  const PLAYER_R = 0.3;
  const PLAYER_H = 1.8;
  const EYE_H = 1.62;

  /* ----------------------------- Типы блоков ----------------------------- */
  const AIR = 0, TURF = 1, SOIL = 2, SAND = 3, CLAY = 4, STONE = 5,
        BEDROCK = 6, LOG = 7, LEAVES = 8, PLANK = 9;

  const BLOCK_DEFS = {
    [TURF]:    { name: 'Дёрн',   ui: [95, 155, 60] },
    [SOIL]:    { name: 'Почва',  ui: [120, 88, 55] },
    [SAND]:    { name: 'Песок',  ui: [214, 203, 150] },
    [CLAY]:    { name: 'Глина',  ui: [150, 120, 115] },
    [STONE]:   { name: 'Камень', ui: [128, 128, 132] },
    [BEDROCK]: { name: 'Бедрок', ui: [58, 58, 62] },
    [LOG]:     { name: 'Бревно', ui: [108, 80, 45] },
    [LEAVES]:  { name: 'Листва', ui: [62, 132, 48] },
    [PLANK]:   { name: 'Доски',  ui: [168, 126, 74] },
  };

  const LAYERS = [
    { type: TURF,  t: 1 },
    { type: SOIL,  t: 4 },
    { type: SAND,  t: 8 },
    { type: CLAY,  t: 12 },
    { type: STONE, t: 25 },
  ];
  const GROUND_DEPTH = LAYERS.reduce((s, l) => s + l.t, 0); // 50

  const HOTBAR = [TURF, SOIL, SAND, CLAY, STONE, LOG, LEAVES, PLANK];

  /* ----------------------------- Инвентарь ----------------------------- */
  // Соты: грань = 6 ячеек -> радиус 5 -> 3*5*6+1 = 91 ячейка.
  // Логика «как в Minecraft»: стаки до 64; ломаем — кладём в инвентарь,
  // ставим — тратим из выбранного слота.
  const MAX_STACK = 64;
  const INV_RADIUS = 5;
  const INV_SIZE = 3 * INV_RADIUS * (INV_RADIUS + 1) + 1; // 91
  const HOTBAR_SIZE = HOTBAR.length;
  const inventory = new Array(INV_SIZE).fill(null);       // null | { type, count }
  HOTBAR.forEach((t, i) => { inventory[i] = { type: t, count: MAX_STACK }; }); // старт. набор

  function invAdd(type, n) {
    if (type === AIR || !n) return false;
    for (let i = 0; i < INV_SIZE && n > 0; i++) {
      const s = inventory[i];
      if (s && s.type === type && s.count < MAX_STACK) {
        const add = Math.min(n, MAX_STACK - s.count); s.count += add; n -= add;
      }
    }
    for (let i = 0; i < INV_SIZE && n > 0; i++) {
      if (!inventory[i]) { const add = Math.min(n, MAX_STACK); inventory[i] = { type, count: add }; n -= add; }
    }
    return true;
  }

  /* ----------------------------- Экипировка (7 слотов) ----------------------------- */
  // Слоты вокруг гекса предпросмотра: шлем, нагрудник, штаны, сапоги,
  // перчатки, оружие (правая/левая рука). Надеть можно любой предмет из
  // инвентаря — кукла в UI раскрашивается его цветом.
  const equipment = {
    head: null, chest: null, legs: null, feet: null, gloves: null,
    mainhand: null, offhand: null,
  };
  // Углы (в градусах, 0 = вправо, против часовой): 60..300 шаг 40° — свободные
  // грани гекса (правая грань занята «сотой» инвентаря).
  const EQ_DEFS = [
    { key: 'mainhand', label: 'Оружие',      ang: 60 },
    { key: 'head',     label: 'Шлем',        ang: 100 },
    { key: 'chest',    label: 'Нагрудник',   ang: 140 },
    { key: 'legs',     label: 'Штаны',       ang: 180 },
    { key: 'feet',     label: 'Сапоги',      ang: 220 },
    { key: 'gloves',   label: 'Перчатки',    ang: 260 },
    { key: 'offhand',  label: 'Вторая рука', ang: 300 },
  ];
  // Части куклы: слот, который их красит, и цвет по умолчанию.
  // Цвета — литеральные rgb (совпадают с телом в 3D: SKIN/SHIRT/PANTS/SHOE).
  const APART_DEF = {
    head:  { slot: 'head',   c: 'rgb(216,160,106)' },   // SKIN
    torso: { slot: 'chest',  c: 'rgb(63,127,191)' },    // SHIRT
    larm:  { slot: 'gloves', c: 'rgb(63,127,191)' },
    rarm:  { slot: 'gloves', c: 'rgb(63,127,191)' },
    lleg:  { slot: 'legs',   c: 'rgb(59,74,99)' },      // PANTS
    rleg:  { slot: 'legs',   c: 'rgb(59,74,99)' },
    lboot: { slot: 'feet',   c: 'rgb(38,38,43)' },      // SHOE
    rboot: { slot: 'feet',   c: 'rgb(38,38,43)' },
  };
  function itemColor(item) {
    if (!item) return null;
    const def = BLOCK_DEFS[item.type];
    return def ? `rgb(${def.ui[0]},${def.ui[1]},${def.ui[2]})` : null;
  }

  /* ----------------------------- Геометрия гекса ----------------------------- */
  // pointy-top: вершины под углами 30,90,...,330 градусов
  const HEX_VERTS = [];
  for (let i = 0; i < 6; i++) {
    const a = (30 + 60 * i) * Math.PI / 180;
    HEX_VERTS.push({ x: R * Math.cos(a), z: R * Math.sin(a) });
  }
  // Затенение боковин по нормали ребра (ребро i -> нормаль 60+60*i градусов)
  const LIGHT = { x: -0.6, z: -0.8 };
  const EDGE_SHADE = [];
  for (let i = 0; i < 6; i++) {
    const a = (60 + 60 * i) * Math.PI / 180;
    const dot = Math.cos(a) * LIGHT.x + Math.sin(a) * LIGHT.z;
    EDGE_SHADE.push(0.62 + 0.24 * Math.max(0, dot));
  }
  const TOP_SHADE = 1.0, BOTTOM_SHADE = 0.5;
  const MIN_VX = -Math.sqrt(3) / 2 * R, MAX_VX = Math.sqrt(3) / 2 * R, MIN_VZ = -R, MAX_VZ = R;

  // сосед по ребру edge (0..5). Индексация СОГЛАСОВАНА с геометрией HEX_VERTS:
  // ребро e идёт от вершины e к вершине e+1, его внешняя нормаль — угол (60 + 60*e)°.
  // Поэтому: 0=SE(60°), 1=SW(120°), 2=W(180°), 3=NW(240°), 4=NE(300°), 5=E(0°) (odd-r).
  function nbCell(col, row, edge) {
    const even = (row & 1) === 0;
    let c = col, r = row;
    switch (edge) {
      case 0: r = row + 1; c = even ? col : col + 1; break;   // SE
      case 1: r = row + 1; c = even ? col - 1 : col; break;   // SW
      case 2: c = col - 1; r = row; break;                    // W
      case 3: r = row - 1; c = even ? col - 1 : col; break;   // NW
      case 4: r = row - 1; c = even ? col : col + 1; break;   // NE
      case 5: c = col + 1; r = row; break;                    // E
    }
    if (c < 0 || c >= HEX_COLS || r < 0 || r >= HEX_ROWS) return null;
    return [c, r];
  }

  function hexToWorld(col, row) {
    return { x: HEX_W * (col + 0.5 * (row & 1)), z: HEX_V * row };
  }
  function worldToHex(x, z) {
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * z) / R;
    const r = (2 / 3 * z) / R;
    const y = -q - r;
    let rx = Math.round(q), ry = Math.round(y), rz = Math.round(r);
    const dq = Math.abs(rx - q), dy = Math.abs(ry - y), dr = Math.abs(rz - r);
    if (dq > dy && dq > dr) rx = -ry - rz; else if (dy > dr) ry = -rx - rz; else rz = -rx - ry;
    const col = rx + (rz - (rz & 1)) / 2;
    return { col: Math.round(col), row: rz };
  }
  function offsetToAxial(col, row) { return { q: col - (row - (row & 1)) / 2, r: row }; }
  function axialDist(aq, ar, bq, br) {
    const dq = aq - bq, dr = ar - br;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }
  function hexDist(c1, r1, c2, r2) {
    const a = offsetToAxial(c1, r1), b = offsetToAxial(c2, r2);
    return axialDist(a.q, a.r, b.q, b.r);
  }

  /* ----------------------------- Атлас текстур ----------------------------- */
  const TS = 16, ATLAS_COLS = 4, ATLAS_ROWS = 4;
  const TILE_INDEX = {
    turf_top: 0, turf_side: 1, soil: 2, sand: 3,
    clay: 4, stone: 5, bedrock: 6, log_side: 7,
    log_top: 8, leaves: 9, plank: 10, unused: 11,
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let atlasCanvas = null, atlasCtx = null;
  function makeAtlas() {
    const W = ATLAS_COLS * TS, H = ATLAS_ROWS * TS;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    atlasCanvas = canvas; atlasCtx = ctx;
    const rng = mulberry32(0xBADC0DE);
    const cl = (v) => Math.max(0, Math.min(255, v | 0));
    const rgb = (r, g, b) => 'rgb(' + cl(r) + ',' + cl(g) + ',' + cl(b) + ')';
    const origin = (i) => [(i % ATLAS_COLS) * TS, Math.floor(i / ATLAS_COLS) * TS];
    function noise(i, base, amt) {
      const [ox, oy] = origin(i);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const n = (rng() - 0.5) * amt;
        ctx.fillStyle = rgb(base[0] + n, base[1] + n, base[2] + n);
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    function dot(i, x, y, col) { const [ox, oy] = origin(i); ctx.fillStyle = col; ctx.fillRect(ox + x, oy + y, 1, 1); }

    noise(TILE_INDEX.turf_top, [95, 155, 60], 40);
    for (let k = 0; k < 46; k++) dot(TILE_INDEX.turf_top, (rng() * TS) | 0, (rng() * TS) | 0, rng() < 0.5 ? rgb(126, 190, 84) : rgb(72, 122, 46));

    noise(TILE_INDEX.turf_side, [122, 90, 56], 30);
    for (let x = 0; x < TS; x++) { const gh = 3 + ((rng() * 3) | 0); for (let y = 0; y < gh; y++) dot(TILE_INDEX.turf_side, x, y, rgb(95 + rng() * 20, 155 + rng() * 20, 60)); }

    noise(TILE_INDEX.soil, [122, 90, 56], 34);
    for (let k = 0; k < 20; k++) dot(TILE_INDEX.soil, (rng() * TS) | 0, (rng() * TS) | 0, rgb(96, 70, 42));

    noise(TILE_INDEX.sand, [214, 203, 150], 24);
    for (let k = 0; k < 24; k++) dot(TILE_INDEX.sand, (rng() * TS) | 0, (rng() * TS) | 0, rgb(232, 224, 178));

    noise(TILE_INDEX.clay, [152, 121, 117], 22);
    for (let k = 0; k < 18; k++) dot(TILE_INDEX.clay, (rng() * TS) | 0, (rng() * TS) | 0, rgb(176, 146, 142));

    noise(TILE_INDEX.stone, [128, 128, 132], 26);
    for (let k = 0; k < 22; k++) dot(TILE_INDEX.stone, (rng() * TS) | 0, (rng() * TS) | 0, rgb(92, 92, 96));

    noise(TILE_INDEX.bedrock, [58, 58, 62], 44);
    for (let k = 0; k < 30; k++) dot(TILE_INDEX.bedrock, (rng() * TS) | 0, (rng() * TS) | 0, rgb(24, 24, 26));

    const [lox, loy] = origin(TILE_INDEX.log_side);
    for (let x = 0; x < TS; x++) {
      const shade = (rng() - 0.5) * 46;
      for (let y = 0; y < TS; y++) { const n = (rng() - 0.5) * 16; ctx.fillStyle = rgb(108 + shade + n, 80 + shade * 0.6 + n, 45 + shade * 0.4 + n); ctx.fillRect(lox + x, loy + y, 1, 1); }
    }
    for (let k = 0; k < 6; k++) { const x = (rng() * TS) | 0; for (let y = 0; y < TS; y++) if (rng() < 0.7) dot(TILE_INDEX.log_side, x, y, rgb(74, 52, 28)); }

    noise(TILE_INDEX.log_top, [162, 122, 68], 18);
    { const [ox, oy] = origin(TILE_INDEX.log_top); ctx.strokeStyle = rgb(122, 88, 46); ctx.lineWidth = 1; for (let r = 2; r <= 7; r += 2) { ctx.beginPath(); ctx.arc(ox + 7.5, oy + 7.5, r, 0, Math.PI * 2); ctx.stroke(); } }

    noise(TILE_INDEX.leaves, [62, 132, 48], 52);
    for (let k = 0; k < 34; k++) dot(TILE_INDEX.leaves, (rng() * TS) | 0, (rng() * TS) | 0, rgb(30, 82, 30));

    noise(TILE_INDEX.plank, [168, 126, 74], 16);
    for (let y = 3; y < TS; y += 4) for (let x = 0; x < TS; x++) dot(TILE_INDEX.plank, x, y, rgb(120, 88, 50));
    for (let i = 11; i < ATLAS_COLS * ATLAS_ROWS; i++) noise(i, [70, 70, 70], 10);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  }

  const uvRect = {};
  for (const name in TILE_INDEX) {
    const i = TILE_INDEX[name];
    const c = i % ATLAS_COLS, r = Math.floor(i / ATLAS_COLS);
    uvRect[name] = { u0: c / ATLAS_COLS, u1: (c + 1) / ATLAS_COLS, vT: r / ATLAS_ROWS, vB: (r + 1) / ATLAS_ROWS };
  }

  function faceTile(type, kind) { // kind: 'top' | 'bottom' | 'side'
    switch (type) {
      case TURF: return kind === 'top' ? 'turf_top' : (kind === 'bottom' ? 'soil' : 'turf_side');
      case SOIL: return 'soil';
      case SAND: return 'sand';
      case CLAY: return 'clay';
      case STONE: return 'stone';
      case BEDROCK: return 'bedrock';
      case LOG: return kind === 'side' ? 'log_side' : 'log_top';
      case LEAVES: return 'leaves';
      case PLANK: return 'plank';
    }
    return 'stone';
  }

  /* ----------------------------- Хранилище мира ----------------------------- */
  const data = new Uint8Array(HEX_COLS * WORLD_Y * HEX_ROWS);
  let maxSolidY = 0;
  const idx = (col, y, row) => col + HEX_COLS * (y + WORLD_Y * row);
  const inGrid = (col, row) => col >= 0 && col < HEX_COLS && row >= 0 && row < HEX_ROWS;
  function getBlock(col, y, row) {
    if (col < 0 || col >= HEX_COLS || row < 0 || row >= HEX_ROWS || y < 0 || y >= WORLD_Y) return AIR;
    return data[idx(col, y, row)];
  }
  function setBlockRaw(col, y, row, t) { if (inGrid(col, row) && y >= 0 && y < WORLD_Y) data[idx(col, y, row)] = t; }

  /* ----------------------------- Генерация мира ----------------------------- */
  function hash2(x, z) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(SEED, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  function valueNoise(x, z) {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = smooth(x - x0), fz = smooth(z - z0);
    const v00 = hash2(x0, z0), v10 = hash2(x0 + 1, z0);
    const v01 = hash2(x0, z0 + 1), v11 = hash2(x0 + 1, z0 + 1);
    const a = v00 + (v10 - v00) * fx, b = v01 + (v11 - v01) * fx;
    return a + (b - a) * fz;
  }
  function fbm(x, z) { let v = 0, amp = 0.5, freq = 1; for (let i = 0; i < 4; i++) { v += amp * valueNoise(x * freq, z * freq); freq *= 2; amp *= 0.5; } return v; }
  function terrainHeight(col, row) {
    const w = hexToWorld(col, row);
    const h = fbm(w.x / 26, w.z / 26);
    return Math.max(52, Math.min(72, Math.round(58 + (h - 0.5) * 30)));
  }
  function layerAtDepth(depth) { let acc = 0; for (const l of LAYERS) { acc += l.t; if (depth < acc) return l.type; } return STONE; }

  // Статистика дерева по одному случайному числу [0..1) (rnd вызывается один раз).
  // trunk — высота ствола: min = 3 ростов игрока (6 блоков), max = 50 (или меньше,
  // если упрёмся в верх мира). Чем выше дерево — тем толще ствол и крупнее крона.
  function treeStats(groundH, rnd) {
    const maxT = Math.min(50, WORLD_Y - groundH - 12);
    const trunk = 6 + Math.floor(Math.pow(rnd(), 1.3) * (maxT - 5));
    const trunkR = trunk < 24 ? 1 : (trunk < 42 ? 2 : 3);
    const crownR = 2 + Math.floor(trunk / 8);
    const crownLayers = 3 + Math.floor((trunk - 6) / 8);
    return { trunk, trunkR, crownR, crownLayers, reserve: crownR + 2 };
  }

  function plantTree(col, groundH, row, st) {
    // ствол — гекс-кластер радиуса trunkR (толстые деревья из нескольких призм)
    for (let i = 0; i < st.trunk; i++) {
      for (let dc = -st.trunkR; dc <= st.trunkR; dc++) {
        for (let dr = -st.trunkR; dr <= st.trunkR; dr++) {
          if (hexDist(col, row, col + dc, row + dr) > st.trunkR) continue;
          setBlockRaw(col + dc, groundH + i, row + dr, LOG);
        }
      }
    }
    const top = groundH + st.trunk;
    if (top + st.crownLayers > maxSolidY) maxSolidY = top + st.crownLayers;
    // крона — сглаженный «конус» из дисков листвы: нижний ярус шире crownR,
    // к вершине радиус плавно сужается до толщины ствола
    for (let ly = 0; ly < st.crownLayers; ly++) {
      const y = top + ly;
      const frac = ly / (st.crownLayers - 1);
      const rad = Math.max(st.trunkR, Math.round(st.crownR * (1.2 - frac * 1.2)));
      for (let dc = -rad; dc <= rad; dc++) {
        for (let dr = -rad; dr <= rad; dr++) {
          if (hexDist(col, row, col + dc, row + dr) > rad) continue;
          const lc = col + dc, lr = row + dr;
          if (inGrid(lc, lr) && y >= 0 && y < WORLD_Y && data[idx(lc, y, lr)] === AIR) data[idx(lc, y, lr)] = LEAVES;
        }
      }
    }
  }

  function generateWorld() {
    for (let col = 0; col < HEX_COLS; col++) {
      for (let row = 0; row < HEX_ROWS; row++) {
        const h = terrainHeight(col, row);
        for (let y = 0; y <= h; y++) {
          const depth = h - y;
          data[idx(col, y, row)] = (y === 0 || depth >= GROUND_DEPTH) ? BEDROCK : layerAtDepth(depth);
        }
        if (h > maxSolidY) maxSolidY = h;
      }
    }
    const taken = new Set();
    for (let col = 3; col < HEX_COLS - 3; col++) {
      for (let row = 3; row < HEX_ROWS - 3; row++) {
        if (hash2(col * 3 + 1, row * 3 + 7) > 0.015) continue;
        const h = terrainHeight(col, row);
        if (getBlock(col, h, row) !== TURF) continue;
        const st = treeStats(h + 1, () => hash2(col * 13 + 5, row * 17 + 3));
        let free = true;
        for (let dc = -st.reserve; dc <= st.reserve && free; dc++) {
          for (let dr = -st.reserve; dr <= st.reserve; dr++) {
            if (taken.has((col + dc) + ',' + (row + dr))) { free = false; break; }
          }
        }
        if (!free) continue;
        plantTree(col, h + 1, row, st);
        for (let dc = -st.reserve; dc <= st.reserve; dc++) {
          for (let dr = -st.reserve; dr <= st.reserve; dr++) taken.add((col + dc) + ',' + (row + dr));
        }
      }
    }
  }

  /* ----------------------------- Сцена Three.js ----------------------------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x9fd0e8, 60, 170);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 800);
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('app').appendChild(renderer.domElement);

  const atlas = makeAtlas();
  const material = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true });

  /* ----------------------------- Частицы (рассыпание блоков) ----------------------------- */
  const fragmentTexCache = {};
  function fragmentTexture(type) {
    if (fragmentTexCache[type]) return fragmentTexCache[type];
    const tile = faceTile(type, 'side');
    const ti = TILE_INDEX[tile] || 0;
    const ox = (ti % ATLAS_COLS) * TS, oy = Math.floor(ti / ATLAS_COLS) * TS;
    const FS = 6;
    const cv = document.createElement('canvas'); cv.width = FS; cv.height = FS;
    const cx = cv.getContext('2d');
    const rng = mulberry32((type * 2654435761) >>> 0);
    for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
      const d = atlasCtx.getImageData(ox + ((rng() * TS) | 0), oy + ((rng() * TS) | 0), 1, 1).data;
      cx.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`;
      cx.fillRect(x, y, 1, 1);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    fragmentTexCache[type] = tex;
    return tex;
  }

  const PARTICLE_MAX = 260;
  const particleGroup = new THREE.Group(); particleGroup.renderOrder = 5; scene.add(particleGroup);
  const particles = [];
  for (let i = 0; i < PARTICLE_MAX; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    spr.visible = false;
    particleGroup.add(spr);
    particles.push({ spr, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
  }
  let pCursor = 0;
  function spawnParticles(type, wx, wy, wz, n) {
    const tex = fragmentTexture(type);
    for (let k = 0; k < n; k++) {
      let p = null;
      for (let i = 0; i < PARTICLE_MAX; i++) {
        const cand = particles[(pCursor + i) % PARTICLE_MAX];
        if (!cand.spr.visible) { p = cand; pCursor = (pCursor + i + 1) % PARTICLE_MAX; break; }
      }
      if (!p) return;
      p.spr.visible = true;
      const s = 0.10 + Math.random() * 0.13;
      p.spr.material.map = tex;
      p.spr.material.opacity = 1;
      p.spr.material.needsUpdate = true;
      p.spr.scale.set(s, s, s);
      p.spr.position.set(wx + (Math.random() - 0.5) * 0.5, wy + Math.random() * 0.7, wz + (Math.random() - 0.5) * 0.5);
      const ang = Math.random() * Math.PI * 2, sp = 1.1 + Math.random() * 2.2;
      p.vx = Math.cos(ang) * sp; p.vz = Math.sin(ang) * sp; p.vy = 2.2 + Math.random() * 3.4;
      p.life = p.maxLife = 0.6 + Math.random() * 0.6;
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.spr.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.spr.visible = false; continue; }
      p.vy -= 20 * dt;
      p.spr.position.x += p.vx * dt; p.spr.position.y += p.vy * dt; p.spr.position.z += p.vz * dt;
      p.spr.material.opacity = Math.min(1, (p.life / p.maxLife) * 1.5);
    }
  }

  /* ----------------------------- Тело игрока (гекс-призмы) ----------------------------- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const bodyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  bodyLight.position.set(0.5, 1.2, 0.4);
  scene.add(bodyLight);

  const SKIN = 0xd8a06a, SHIRT = 0x3f7fbf, PANTS = 0x3b4a63, SHOE = 0x26262b;
  const body = new THREE.Group();
  body.rotation.order = 'YXZ';
  scene.add(body);
  function limb(rTop, rBot, h, color, x, y, z) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, 6, 1, false),
      new THREE.MeshLambertMaterial({ color })
    );
    m.position.set(x, y, z);
    body.add(m);
    return m;
  }
  // ноги + ступни
  limb(0.125, 0.105, 0.74, PANTS, -0.135, 0.37, 0);
  limb(0.125, 0.105, 0.74, PANTS,  0.135, 0.37, 0);
  limb(0.105, 0.10, 0.10, SHOE, -0.135, 0.04, 0.03);
  limb(0.105, 0.10, 0.10, SHOE,  0.135, 0.04, 0.03);
  // торс — опущен ниже (0.60..1.20) и слегка вынесен вперёд, чтобы при взгляде
  // вниз видеть грудь и ноги, а не бесконечную грудь перед глазами
  limb(0.23, 0.22, 0.60, SHIRT, 0, 0.90, -0.10);
  // руки прижаты к корпусу (x = ±0.245), плечи ~1.11, кисти ~0.60
  limb(0.095, 0.085, 0.46, SHIRT, -0.245, 0.88, -0.08);
  limb(0.095, 0.085, 0.46, SHIRT,  0.245, 0.88, -0.08);
  limb(0.085, 0.075, 0.18, SKIN, -0.245, 0.60, -0.08);
  limb(0.085, 0.075, 0.18, SKIN,  0.245, 0.60, -0.08);

  /* ----------------------------- Рука (viewmodel, взмах на клик) ----------------------------- */
  const armPivot = new THREE.Group();
  armPivot.position.set(0.30, -0.36, -0.16);
  armPivot.rotation.order = 'YXZ';
  camera.add(armPivot);
  scene.add(camera);
  const ARM_REST_X = 0.95, ARM_REST_Z = 0.32;
  function armPart(rTop, rBot, h, color, y) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, 6, 1, false),
      new THREE.MeshLambertMaterial({ color })
    );
    m.position.y = y;
    m.material.depthTest = false; m.material.depthWrite = false;
    m.renderOrder = 999;
    armPivot.add(m);
    return m;
  }
  armPart(0.085, 0.072, 0.30, SHIRT, -0.15);   // рукав
  armPart(0.072, 0.066, 0.26, SKIN, -0.40);    // предплечье
  armPart(0.085, 0.085, 0.10, SKIN, -0.55);    // кисть
  armPivot.rotation.set(ARM_REST_X, 0, ARM_REST_Z);

  let swingT = -1;
  function swingArm() { swingT = 0; }
  function updateArm(dt) {
    if (swingT < 0) return;
    swingT += dt;
    const period = 0.30;
    if (swingT >= period) { swingT = -1; armPivot.rotation.x = ARM_REST_X; armPivot.rotation.z = ARM_REST_Z; }
    else {
      const a = Math.sin((swingT / period) * Math.PI);   // 0 -> 1 -> 0
      armPivot.rotation.x = ARM_REST_X + a * 0.85;
      armPivot.rotation.z = ARM_REST_Z - a * 0.3;
    }
  }

  /* ----------------------------- Меширование чанков ----------------------------- */
  const chunkMeshes = new Array(CHUNKS_C * CHUNKS_R).fill(null);

  function buildChunkGeometry(cc, cr) {
    const positions = [], colors = [], normals = [], uvs = [], indices = [];
    const c0 = cc * CHUNK, r0 = cr * CHUNK;
    const cEnd = Math.min(c0 + CHUNK, HEX_COLS);
    const rEnd = Math.min(r0 + CHUNK, HEX_ROWS);

    const pushVert = (x, y, z, s, nx, ny, nz, u, v) => {
      positions.push(x, y, z); colors.push(s, s, s); normals.push(nx, ny, nz); uvs.push(u, v);
    };

    for (let col = c0; col < cEnd; col++) {
      for (let row = r0; row < rEnd; row++) {
        const cen = hexToWorld(col, row);
        for (let y = 0; y <= maxSolidY; y++) {
          const t = data[idx(col, y, row)];
          if (t === AIR) continue;

          // верх
          if (getBlock(col, y + 1, row) === AIR) {
            const uv = uvRect[faceTile(t, 'top')];
            const base = positions.length / 3;
            for (let i = 0; i < 6; i++) {
              const vx = HEX_VERTS[i].x, vz = HEX_VERTS[i].z;
              const u = uv.u0 + (vx - MIN_VX) / (MAX_VX - MIN_VX) * (uv.u1 - uv.u0);
              const v = uv.vB + (vz - MIN_VZ) / (MAX_VZ - MIN_VZ) * (uv.vT - uv.vB);
              pushVert(cen.x + vx, y + 1, cen.z + vz, TOP_SHADE, 0, 1, 0, u, v);
            }
            indices.push(base, base + 2, base + 1, base, base + 3, base + 2, base, base + 4, base + 3, base, base + 5, base + 4);
          }
          // низ
          if (y - 1 >= 0 && getBlock(col, y - 1, row) === AIR) {
            const uv = uvRect[faceTile(t, 'bottom')];
            const base = positions.length / 3;
            for (let i = 0; i < 6; i++) {
              const vx = HEX_VERTS[i].x, vz = HEX_VERTS[i].z;
              const u = uv.u0 + (vx - MIN_VX) / (MAX_VX - MIN_VX) * (uv.u1 - uv.u0);
              const v = uv.vB + (vz - MIN_VZ) / (MAX_VZ - MIN_VZ) * (uv.vT - uv.vB);
              pushVert(cen.x + vx, y, cen.z + vz, BOTTOM_SHADE, 0, -1, 0, u, v);
            }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 3, base + 4, base, base + 4, base + 5);
          }
          // боковины (6 рёбер)
          const uv = uvRect[faceTile(t, 'side')];
          for (let e = 0; e < 6; e++) {
            const nb = nbCell(col, row, e);
            if (nb === null) continue;                       // край мира — грань не рисуем
            if (getBlock(nb[0], y, nb[1]) !== AIR) continue; // сосед закрывает грань
            const a = HEX_VERTS[e], b = HEX_VERTS[(e + 1) % 6];
            const na = (60 + 60 * e) * Math.PI / 180;
            const nx = Math.cos(na), nz = Math.sin(na), s = EDGE_SHADE[e];
            const base = positions.length / 3;
            // порядок [b_i, t_i, t_{i+1}, b_{i+1}] — нормаль наружу
            pushVert(cen.x + a.x, y, cen.z + a.z, s, nx, 0, nz, uv.u0, uv.vB);
            pushVert(cen.x + a.x, y + 1, cen.z + a.z, s, nx, 0, nz, uv.u0, uv.vT);
            pushVert(cen.x + b.x, y + 1, cen.z + b.z, s, nx, 0, nz, uv.u1, uv.vT);
            pushVert(cen.x + b.x, y, cen.z + b.z, s, nx, 0, nz, uv.u1, uv.vB);
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  function rebuildChunk(cc, cr) {
    if (cc < 0 || cr < 0 || cc >= CHUNKS_C || cr >= CHUNKS_R) return;
    const i = cr * CHUNKS_C + cc;
    const old = chunkMeshes[i];
    if (old) { scene.remove(old); old.geometry.dispose(); }
    const mesh = new THREE.Mesh(buildChunkGeometry(cc, cr), material);
    chunkMeshes[i] = mesh;
    scene.add(mesh);
  }
  function buildAllChunks() { for (let cr = 0; cr < CHUNKS_R; cr++) for (let cc = 0; cc < CHUNKS_C; cc++) rebuildChunk(cc, cr); }

  function applyEdits(edits) {
    const dirty = new Set();
    for (const e of edits) {
      const [col, y, row, t] = e;
      if (!inGrid(col, row) || y < 0 || y >= WORLD_Y) continue;
      data[idx(col, y, row)] = t;
      if (t !== AIR && y > maxSolidY) maxSolidY = y;
      const cc = Math.floor(col / CHUNK), cr = Math.floor(row / CHUNK);
      dirty.add(cc + ',' + cr);
      if (col % CHUNK === 0) dirty.add((cc - 1) + ',' + cr);
      if (col % CHUNK === CHUNK - 1) dirty.add((cc + 1) + ',' + cr);
      if (row % CHUNK === 0) dirty.add(cc + ',' + (cr - 1));
      if (row % CHUNK === CHUNK - 1) dirty.add(cc + ',' + (cr + 1));
    }
    dirty.forEach((k) => { const [cc, cr] = k.split(',').map(Number); rebuildChunk(cc, cr); });
  }

  /* ----------------------------- Игрок ----------------------------- */
  const player = { pos: new THREE.Vector3(0, 0, 0), velY: 0, yaw: 0, pitch: 0, onGround: false, flying: false };

  function solidAtWorld(wx, wy, wz) {
    if (wy < 0) return true;
    if (wy >= WORLD_Y) return false;
    const h = worldToHex(wx, wz);
    if (!inGrid(h.col, h.row)) return true;         // за пределами — стена
    return data[idx(h.col, wy, h.row)] !== AIR;
  }

  const SAMPLE_FOOT = [[0, 0], [PLAYER_R, 0], [-PLAYER_R, 0], [0, PLAYER_R], [0, -PLAYER_R],
    [PLAYER_R * 0.707, PLAYER_R * 0.707], [PLAYER_R * 0.707, -PLAYER_R * 0.707],
    [-PLAYER_R * 0.707, PLAYER_R * 0.707], [-PLAYER_R * 0.707, -PLAYER_R * 0.707]];

  function collides(px, py, pz) {
    const y0 = Math.floor(py), y1 = Math.floor(py + PLAYER_H - 0.001);
    for (const s of SAMPLE_FOOT) {
      const wx = px + s[0], wz = pz + s[1];
      for (let y = y0; y <= y1; y++) if (solidAtWorld(wx, y, wz)) return true;
    }
    return false;
  }

  function spawnPlayer() {
    const cc = Math.floor(HEX_COLS / 2), cr = Math.floor(HEX_ROWS / 2);
    for (let i = 0; i < 40; i++) {
      const col = cc + i, row = cr;
      const h = terrainHeight(col, row);
      if (getBlock(col, h, row) === TURF && getBlock(col, h + 1, row) === AIR && getBlock(col, h + 2, row) === AIR) {
        const w = hexToWorld(col, row);
        player.pos.set(w.x, h + 1.05, w.z);
        return;
      }
    }
    const w = hexToWorld(cc, cr);
    player.pos.set(w.x, terrainHeight(cc, cr) + 2, w.z);
  }

  /* ----------------------------- Прицел (маршевый рейкаст) ----------------------------- */
  function raycastWorld(origin, dir, maxDist) {
    const step = 0.1;
    let prev = null;
    for (let t = 0; t <= maxDist; t += step) {
      const wx = origin.x + dir.x * t, wy = origin.y + dir.y * t, wz = origin.z + dir.z * t;
      const y = Math.floor(wy);
      const h = worldToHex(wx, wz);
      if (!inGrid(h.col, h.row)) { prev = null; continue; }
      if (y >= 0 && y < WORLD_Y && data[idx(h.col, y, h.row)] !== AIR) {
        return { col: h.col, row: h.row, y, prev };
      }
      prev = { col: h.col, row: h.row, y };
    }
    return null;
  }

  const camDir = new THREE.Vector3();
  function getTargetBlock() { camera.getWorldDirection(camDir); return raycastWorld(camera.position, camDir, REACH); }

  /* ----------------------------- Действия ----------------------------- */
  const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  function breakBlock() {
    const hit = getTargetBlock();
    if (!hit) return;
    const t = getBlock(hit.col, hit.y, hit.row);
    if (t === AIR || t === BEDROCK) return;
    const w = hexToWorld(hit.col, hit.row);
    applyEdits([[hit.col, hit.y, hit.row, AIR]]);
    if (t === LOG) decayLeavesAround(hit.col, hit.y, hit.row);
    invAdd(t, 1);                       // подбираем блок в инвентарь
    refreshHotbar();
    spawnParticles(t, w.x, hit.y + 0.5, w.z, 12);   // «рассыпание»
  }

  // 6 гекс-соседей + вверх/вниз
  function leafNeighbors(col, y, row) {
    const out = [[col, y + 1, row], [col, y - 1, row]];
    for (let e = 0; e < 6; e++) { const nb = nbCell(col, row, e); if (nb) out.push([nb[0], y, nb[1]]); }
    return out;
  }

  function decayLeavesAround(ox, oy, oz) {
    const seen = new Set();
    const drop = [];
    const seeds = [];
    for (const n of leafNeighbors(ox, oy, oz)) if (getBlock(n[0], n[1], n[2]) === LEAVES) seeds.push(n);
    let guard = 0;
    for (const [sc, sy, sr] of seeds) {
      if (seen.has(sc + ',' + sy + ',' + sr)) continue;
      const comp = [];
      const stack = [[sc, sy, sr]];
      let anchored = false;
      while (stack.length && guard++ < 8000) {
        const [col, y, row] = stack.pop();
        const k = col + ',' + y + ',' + row;
        if (seen.has(k)) continue;
        seen.add(k);
        if (getBlock(col, y, row) !== LEAVES) continue;
        comp.push([col, y, row]);
        for (const n of leafNeighbors(col, y, row)) {
          const b = getBlock(n[0], n[1], n[2]);
          if (b === LOG) anchored = true;
          else if (b === LEAVES) stack.push(n);
        }
      }
      if (!anchored) for (const c of comp) drop.push([c[0], c[1], c[2], AIR]);
    }
    if (drop.length) applyEdits(drop);
  }

  function placeBlock() {
    const item = inventory[selectedSlot];
    if (!item) return;
    const hit = getTargetBlock();
    if (!hit || !hit.prev) return;
    const p = hit.prev;
    if (!inGrid(p.col, p.row) || p.y < 0 || p.y >= WORLD_Y) return;
    if (data[idx(p.col, p.y, p.row)] !== AIR) return;
    const w = hexToWorld(p.col, p.row);
    const dx = w.x - player.pos.x, dz = w.z - player.pos.z;
    const overlapY = p.y >= Math.floor(player.pos.y) && p.y <= Math.floor(player.pos.y + PLAYER_H);
    if (dx * dx + dz * dz < 0.7 && overlapY) return;   // не ставим внутрь себя
    applyEdits([[p.col, p.y, p.row, item.type]]);
    item.count -= 1;                     // тратим из стака
    if (item.count <= 0) inventory[selectedSlot] = null;
    refreshHotbar();
  }

  /* ----------------------------- Управление ----------------------------- */
  const keys = Object.create(null);
  let selectedSlot = 0;
  let selectedBlock = AIR;
  let started = false, locked = false, dragging = false, paused = false, invOpen = false;
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('ovTitle');
  const overlaySub = document.getElementById('ovSub');
  const overlayCta = document.getElementById('ovCta');
  const crosshair = document.getElementById('crosshair');
  const hotbarEl = document.getElementById('hotbar');
  const hudEl = document.getElementById('hud');
  const itemNameEl = document.getElementById('itemname');
  const invEl = document.getElementById('inventory');
  const invGridEl = document.getElementById('invGrid');
  const invCells = [];   // DOM ячейки сот по индексу инвентаря
  const invPanelEl = document.querySelector('#inventory .inv-panel');
  const invLayoutEl = document.getElementById('invLayout');
  const charAreaEl = document.getElementById('charArea');
  const eqSlotsEl = document.getElementById('eqSlots');
  const eqSlots = [];

  // Хотбар — слоты 0..7 (первые ячейки инвентаря): номер + образец + счётчик
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === 0 ? ' active' : '');
    const num = document.createElement('span');
    num.className = 'num'; num.textContent = String(i + 1);
    const sw = document.createElement('span');
    sw.className = 'swatch';
    const ct = document.createElement('span');
    ct.className = 'count';
    slot.appendChild(num); slot.appendChild(sw); slot.appendChild(ct);
    slot.dataset.index = i;
    hotbarEl.appendChild(slot);
  }
  function refreshHotbar() {
    [...hotbarEl.children].forEach((el, i) => {
      const item = inventory[i];
      const sw = el.querySelector('.swatch');
      const ct = el.querySelector('.count');
      if (item) {
        const def = BLOCK_DEFS[item.type];
        sw.style.setProperty('--c', `rgb(${def.ui[0]},${def.ui[1]},${def.ui[2]})`);
        sw.style.display = '';
        ct.textContent = item.count > 1 ? String(item.count) : '';
      } else { sw.style.display = 'none'; ct.textContent = ''; }
      el.classList.toggle('active', i === selectedSlot);
    });
    selectedBlock = inventory[selectedSlot] ? inventory[selectedSlot].type : AIR;
    if (itemNameEl) {
      const item = inventory[selectedSlot];
      itemNameEl.textContent = item ? `${BLOCK_DEFS[item.type].name}${item.count > 1 ? ' ×' + item.count : ''}` : '—';
      if (started) itemNameEl.classList.add('show');
    }
    refreshEquipment();
  }
  function selectIndex(i) { if (i < 0 || i >= HOTBAR_SIZE) return; selectedSlot = i; refreshHotbar(); }

  /* ----------------------------- Соты инвентаря (грань 6) ----------------------------- */
  function buildInventoryGrid() {
    const N = INV_RADIUS, s = 24;                     // описанный радиус -> грань = 6 ячеек
    const w = Math.sqrt(3) * s, h = 2 * s, stepY = 1.5 * s;
    const els = [];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let q = -N; q <= N; q++) {
      for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++) {
        const x = w * (q + r / 2), y = stepY * r;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        els.push({ q, r, x, y });
      }
    }
    const pad = s * 0.3;
    const W = maxX - minX + w + pad * 2, H = maxY - minY + h + pad * 2;
    invGridEl.style.width = W + 'px'; invGridEl.style.height = H + 'px';
    invGridEl.innerHTML = '';
    els.forEach((c, idx) => {
      const d = document.createElement('div');
      d.className = 'cell';
      d.style.left = (c.x - minX + w / 2 + pad) + 'px';
      d.style.top = (c.y - minY + h / 2 + pad) + 'px';
      d.innerHTML = '<span class="csw"></span><span class="ccount"></span>';
      d.addEventListener('click', () => invCellClick(idx));
      invGridEl.appendChild(d);
      invCells[idx] = d;
    });
  }
  buildInventoryGrid();

  /* ----------------------------- Панель персонажа + экипировка ----------------------------- */
  function buildCharPanel() {
    // 7 слотов вокруг гекса предпросмотра (позиции выставляет resizeCharPanel)
    eqSlotsEl.innerHTML = '';
    eqSlots.length = 0;
    EQ_DEFS.forEach((def) => {
      const d = document.createElement('div');
      d.className = 'eq-slot';
      d.dataset.eq = def.key;
      d.innerHTML = '<span class="esw"></span><span class="elabel">' + def.label + '</span>';
      d.addEventListener('click', () => equipCellClick(def.key));
      eqSlotsEl.appendChild(d);
      eqSlots.push(d);
    });
    // кукла персонажа (части раскрашивает refreshEquipment)
    const av = document.getElementById('avatar');
    av.innerHTML = '';
    ['head', 'torso', 'larm', 'rarm', 'lleg', 'rleg', 'lboot', 'rboot'].forEach((p) => {
      const el = document.createElement('div');
      el.className = 'apart ' + p;
      el.dataset.part = p;
      av.appendChild(el);
    });
    ['mainhand', 'offhand'].forEach((h) => {
      const el = document.createElement('span');
      el.className = 'aweapon ' + h;
      el.dataset.hand = h;
      av.appendChild(el);
    });
  }
  // Гекс предпросмотра — ТОТ ЖЕ РАЗМЕР, что и гекс инвентаря (меряем панель).
  // Вызывается при каждом открытии: #inventory скрыт (display:none) при загрузке.
  function resizeCharPanel() {
    const W = invPanelEl.offsetWidth, H = invPanelEl.offsetHeight;
    if (W < 20 || H < 20) return;
    charAreaEl.style.width = W + 'px';
    charAreaEl.style.height = H + 'px';
    const scale = Math.min(1,
      (window.innerWidth - 48) / (2 * W),
      (window.innerHeight - 120) / H);
    invLayoutEl.style.transform = 'scale(' + scale + ')';
    // слоты по свободным граням гекса, на равном расстоянии от центра
    const R = W / 2 + 34;
    eqSlots.forEach((el, i) => {
      const a = EQ_DEFS[i].ang * Math.PI / 180;
      el.style.left = (W / 2 + Math.cos(a) * R) + 'px';
      el.style.top = (H / 2 - Math.sin(a) * R) + 'px';
    });
  }
  function refreshEquipment() {
    if (!eqSlots.length) return;
    eqSlots.forEach((el, i) => {
      const def = EQ_DEFS[i];
      const item = equipment[def.key];
      const sw = el.querySelector('.esw');
      const c = itemColor(item);
      if (c) { sw.style.setProperty('--c', c); sw.style.display = 'block'; }
      else { sw.style.display = 'none'; }
      el.classList.toggle('filled', !!item);
      const name = item ? BLOCK_DEFS[item.type].name : '';
      el.title = def.label + (item ? ' — ' + name : ' (пусто)');
    });
    document.querySelectorAll('#avatar .apart').forEach((el) => {
      const def = APART_DEF[el.dataset.part];
      if (!def) return;
      const item = equipment[def.slot];
      el.style.background = itemColor(item) || def.c;
    });
    // оружие: видно только когда надето
    document.querySelectorAll('#avatar .aweapon').forEach((el) => {
      const item = equipment[el.dataset.hand];
      if (item) { el.style.background = itemColor(item); el.style.display = ''; }
      else { el.style.display = 'none'; }
    });
  }
  function equipCellClick(key) {
    const src = inventory[selectedSlot];
    const cur = equipment[key];
    if (src) {
      inventory[selectedSlot] = cur;                 // снятое (или пусто) — в слот хотбара
      equipment[key] = { type: src.type, count: 1 }; // надеть 1 шт. из стака
    } else if (cur) {
      equipment[key] = null;                         // снять в инвентарь
      invAdd(cur.type, 1);
    }
    refreshHotbar(); refreshInventory(); refreshEquipment();
  }
  buildCharPanel();

  function refreshInventory() {
    invCells.forEach((d, i) => {
      const item = inventory[i];
      const sw = d.querySelector('.csw'), ct = d.querySelector('.ccount');
      if (item) {
        const def = BLOCK_DEFS[item.type];
        sw.style.setProperty('--c', `rgb(${def.ui[0]},${def.ui[1]},${def.ui[2]})`);
        sw.style.display = '';
        ct.textContent = item.count > 1 ? String(item.count) : '';
      } else { sw.style.display = 'none'; ct.textContent = ''; }
      d.classList.toggle('sel', i === selectedSlot);
    });
  }
  function invCellClick(i) {
    if (i === selectedSlot) return;                   // не обмениваем слот с самим собой
    const tmp = inventory[selectedSlot]; inventory[selectedSlot] = inventory[i]; inventory[i] = tmp;
    refreshHotbar(); refreshInventory();
  }
  function openInventory() {
    if (!started || invOpen) return;
    invOpen = true; paused = true;
    refreshInventory();
    invEl.classList.remove('hidden'); crosshair.classList.add('hidden');
    resizeCharPanel();                 // размер гекса предпросмотра — после показа панели
    refreshEquipment();
    if (locked && document.exitPointerLock) document.exitPointerLock();
  }
  function closeInventory() {
    if (!invOpen) return;
    invOpen = false; paused = false;
    invEl.classList.add('hidden');
    hideOverlay();
    if (pointerLockAvailable) requestLock();
  }
  function toggleInventory() { if (invOpen) closeInventory(); else openInventory(); }
  invEl.addEventListener('click', (e) => { if (e.target === invEl) closeInventory(); });

  let pointerLockAvailable = true, everLocked = false, dragMoved = false, dragButton = 0;

  function showOverlay(isPause) {
    overlay.classList.remove('hidden');
    crosshair.classList.add('hidden');
    if (overlayTitle) overlayTitle.innerHTML = isPause ? 'Пауза' : 'Pixel<span class="dot">Craft</span>';
    if (overlaySub) overlaySub.textContent = isPause
      ? 'Игра на паузе — мышь свободна'
      : 'Мир из гексагональных призм 200×130×200 (релиз 3.4)';
    if (overlayCta) overlayCta.textContent = isPause ? 'Нажмите, чтобы продолжить' : 'Нажмите, чтобы играть';
  }
  function hideOverlay() { overlay.classList.add('hidden'); crosshair.classList.remove('hidden'); }

  function requestLock() {
    if (!pointerLockAvailable || !renderer.domElement.requestPointerLock) return;
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { pointerLockAvailable = false; });
    } catch (e) { pointerLockAvailable = false; }
  }

  // Старт игры или продолжение после паузы
  function beginPlay() {
    if (!started) { started = true; refreshHotbar(); }
    paused = false;
    hideOverlay();
    if (pointerLockAvailable) requestLock();
  }
  overlay.addEventListener('click', beginPlay);
  renderer.domElement.addEventListener('click', () => { if (started && !paused) requestLock(); });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    if (locked) { everLocked = true; paused = false; hideOverlay(); }
    else if (invOpen) { paused = true; }                              // инвентарь: мышь свободна, оверлей не показываем
    else if (started && pointerLockAvailable) { paused = true; showOverlay(true); }
    else if (started) { paused = false; hideOverlay(); }   // нет Pointer Lock — играем с перетаскиванием
  });
  document.addEventListener('pointerlockerror', () => {
    locked = false;
    if (!everLocked) { pointerLockAvailable = false; paused = false; if (started) hideOverlay(); }
    else { paused = true; showOverlay(true); }   // временный отказ (например, после ESC) — ждём новый клик
  });

  function applyLook(dx, dy) {
    const sens = 0.0022;
    player.yaw -= dx * sens; player.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.01;
    player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
  }
  document.addEventListener('mousemove', (e) => {
    if (!started || paused) return;
    if (locked) applyLook(e.movementX || 0, e.movementY || 0);
    else if (dragging) { const mx = e.movementX || 0, my = e.movementY || 0; if (Math.abs(mx) + Math.abs(my) > 2) dragMoved = true; applyLook(mx, my); }
  });
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!started || paused) return;
    if (e.button === 0 || e.button === 2) swingArm();     // взмах рукой на любое нажатие
    if (locked) { if (e.button === 0) breakBlock(); else if (e.button === 2) placeBlock(); return; }
    dragging = true; dragMoved = false; dragButton = e.button;
  });
  window.addEventListener('mouseup', () => {
    if (dragging && !locked && !dragMoved) { if (dragButton === 0) breakBlock(); else if (dragButton === 2) placeBlock(); }
    dragging = false;
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyI') { if (started) toggleInventory(); return; }
    if (e.code === 'Escape') {
      if (invOpen) { closeInventory(); return; }
      // запасной вариант без Pointer Lock: ESC переключает паузу
      if (started && !pointerLockAvailable) {
        paused = !paused;
        if (paused) showOverlay(true); else hideOverlay();
        return;
      }
    }
    if (!started || paused) return;
    if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5), 10); if (n >= 1 && n <= HOTBAR_SIZE) selectIndex(n - 1); }
    if (e.code === 'KeyF') { player.flying = !player.flying; if (player.flying) player.velY = 0; }
    if (!locked) {
      if (e.code === 'KeyE') { breakBlock(); swingArm(); }
      if (e.code === 'KeyQ') { placeBlock(); swingArm(); }
    }
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('wheel', (e) => {
    if (!started || paused) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    selectIndex((selectedSlot + dir + HOTBAR_SIZE) % HOTBAR_SIZE);
  }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ----------------------------- Подсветка (гекс-призма) ----------------------------- */
  const highlight = (function () {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = HEX_VERTS[i], b = HEX_VERTS[(i + 1) % 6];
      pts.push(a.x, 0, a.z, b.x, 0, b.z);   // нижний контур
      pts.push(a.x, 1, a.z, b.x, 1, b.z);   // верхний контур
      pts.push(a.x, 0, a.z, a.x, 1, a.z);   // вертикаль
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    ls.visible = false; scene.add(ls); return ls;
  })();

  /* ----------------------------- Физика игрока ----------------------------- */
  const tmpForward = new THREE.Vector3(), tmpRight = new THREE.Vector3();
  function moveAxis(dx, dy, dz) {
    const p = player.pos;
    p.x += dx; p.y += dy; p.z += dz;
    if (collides(p.x, p.y, p.z)) { p.x -= dx; p.y -= dy; p.z -= dz; if (dy !== 0) player.velY = 0; if (dy < 0) player.onGround = true; }
  }
  function updatePlayer(dt) {
    const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? RUN_SPEED : WALK_SPEED;
    const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
    tmpForward.set(-sinY, 0, -cosY); tmpRight.set(cosY, 0, -sinY);
    let mx = 0, mz = 0;
    if (keys['KeyW']) { mx += tmpForward.x; mz += tmpForward.z; }
    if (keys['KeyS']) { mx -= tmpForward.x; mz -= tmpForward.z; }
    if (keys['KeyD']) { mx += tmpRight.x; mz += tmpRight.z; }
    if (keys['KeyA']) { mx -= tmpRight.x; mz -= tmpRight.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx = mx / len * speed; mz = mz / len * speed; }
    if (player.flying) {
      let vy = 0; if (keys['Space']) vy += speed; if (keys['ControlLeft']) vy -= speed;
      moveAxis(mx * dt, 0, 0); moveAxis(0, 0, mz * dt); moveAxis(0, vy * dt, 0); return;
    }
    moveAxis(mx * dt, 0, 0); moveAxis(0, 0, mz * dt);
    player.velY += GRAVITY * dt; if (player.velY < -45) player.velY = -45;
    player.onGround = collides(player.pos.x, player.pos.y - 0.05, player.pos.z);
    if (player.onGround && keys['Space']) { player.velY = JUMP_SPEED; player.onGround = false; }
    moveAxis(0, player.velY * dt, 0);
  }

  /* ----------------------------- Игровой цикл ----------------------------- */
  let last = performance.now(), fpsAcc = 0, fpsFrames = 0, fps = 0, frameCount = 0;
  function tick(now) {
    frameCount++;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (started && !paused) updatePlayer(dt);
    camera.position.set(player.pos.x, player.pos.y + EYE_H, player.pos.z);
    camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
    updateParticles(dt);
    updateArm(dt);
    body.position.set(player.pos.x, player.pos.y, player.pos.z);
    body.rotation.y = player.yaw;
    if (started && !paused) {
      const hit = getTargetBlock();
      if (hit) { highlight.visible = true; const w = hexToWorld(hit.col, hit.row); highlight.position.set(w.x, hit.y, w.z); }
      else highlight.visible = false;
    }
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    if (started && !paused) {
      hudEl.textContent = `FPS: ${fps}\n` +
        `XYZ: ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}\n` +
        `Блок: ${inventory[selectedSlot] ? BLOCK_DEFS[inventory[selectedSlot].type].name : '—'}` +
        (player.flying ? '\nРежим: полёт' : '') + `\nВерсия: ${VERSION}`;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  /* ----------------------------- Старт ----------------------------- */
  const t0 = performance.now();
  generateWorld();
  buildAllChunks();
  const buildMs = Math.round(performance.now() - t0);
  spawnPlayer();
  camera.position.set(player.pos.x, player.pos.y + EYE_H, player.pos.z);
  player.yaw = Math.PI * 0.25;
  { const ve = document.getElementById('ver'); if (ve) ve.textContent = 'v' + VERSION; }
  refreshHotbar();

  window.PixelCraft = {
    THREE, scene, camera, renderer, player, material, body, armPivot,
    getBlock, terrainHeight, breakBlock, placeBlock, getTargetBlock, decayLeavesAround, applyEdits,
    hexToWorld, worldToHex, nbCell, HEX_VERTS, VERSION,
    inventory, selectedSlot, selectedBlock, invAdd, selectIndex,
    equipment, EQ_DEFS, refreshEquipment, equipCellClick, resizeCharPanel,
    spawnParticles, swingArm, toggleInventory, openInventory, closeInventory,
    updateParticles, updateArm,
    refreshHotbar, refreshInventory,
    get frames() { return frameCount; },
    get buildMs() { return buildMs; },
    constants: { HEX_COLS, HEX_ROWS, WORLD_Y, R, GROUND_DEPTH, AIR, TURF, SOIL, SAND, CLAY, STONE, BEDROCK, LOG, LEAVES, PLANK },
  };

  requestAnimationFrame(tick);
})();
