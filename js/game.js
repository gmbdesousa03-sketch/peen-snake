/* ===== ZIGOUIGOUI — moteur de jeu + rendu cartoon ===== */

const Game = (() => {
  const { COLS, ROWS, CELL } = GRID;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, canvas.clientWidth);
    const cssH = Math.max(1, canvas.clientHeight);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(bw / (COLS * CELL), 0, 0, bh / (ROWS * CELL), 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  const BONUS_TYPES = [
    { id: 'speed', emoji: '⚡', dur: 5000, label: 'Turbo', weight: 22 },
    { id: 'invincible', emoji: '🌟', dur: 7000, label: 'Invincible', weight: 40 },
    { id: 'multi', emoji: '💰', dur: 8000, label: 'Score ×2', weight: 22 },
  ];

  const S = {
    running: false, paused: false, dying: false, dieTime: 0,
    level: null, levelIndex: 0,
    snake: [], prevSnake: [], dir: { x: 1, y: 0 }, dirQueue: [],
    acc: 0, stepInterval: 180,
    food: null, bonus: null, bonusLife: 0,
    capote: null, capoteLife: 0, nextCapoteAt: 90, shield: false,
    effects: {}, // id -> expiration (perf.now)
    score: 0, eaten: 0, grewLastStep: false,
    obstacles: [], obstacleSet: new Set(), stepCount: 0,
    particles: [], eatFlash: 0, shake: 0,
    stars: [],
    mode: 'level', // 'level' | 'boss'
    rivals: [],
    bossHp: 0, bossMax: 0, bossDef: null,
    graceUntil: 0,
    classicCleared: false,
    bossReady: false,
    antigrav: false,
    spermShots: 0,
    shots: [],
    nextShotAt: 0,
    puchita: null,
    puchitaReady: false,
    kitCapote: false,
    lives: 0,
    goldHeart: null,
    nextHeartAt: 7,
    cb: {},
  };

  let pendingCarry = null;

  const key = (x, y) => x + ',' + y;
  const lerp = (a, b, t) => a + (b - a) * t;
  const now = () => performance.now();

  function spawnPlayer(len) {
    const n = Math.max(2, len || 2);
    const snake = [];
    for (let i = 0; i < n; i++) snake.push({ x: Math.max(0, 4 - i), y: 16 });
    return snake;
  }

  function keepProgress() {
    pendingCarry = {
      length: Math.max(2, (S.snake && S.snake.length) || 2),
      lives: S.lives || 0,
      shield: !!S.shield,
      antigrav: !!S.antigrav,
      spermShots: S.spermShots || 0,
      puchitaReady: !!S.puchitaReady,
      kitCapote: !!S.kitCapote,
      eaten: S.eaten || 0,
      nextHeartAt: S.nextHeartAt || HEART_EVERY,
      score: S.score || 0,
    };
  }

  function keepLives() { keepProgress(); }
  function clearProgress() { pendingCarry = null; }
  function levelPoints() {
    return Math.max(0, (S.score || 0) - (S.scoreAtLevelStart || 0));
  }

  /* ================= CYCLE DE VIE ================= */

  function start(levelIndex, callbacks, carriedScore) {
    S.cb = callbacks || S.cb;
    S.levelIndex = levelIndex;
    S.level = LEVELS[levelIndex];
    S.running = true; S.paused = false; S.dying = false;
    S.dir = { x: 1, y: 0 }; S.dirQueue = [];
    const progress = pendingCarry;
    pendingCarry = null;
    S.snake = spawnPlayer(progress ? progress.length : 2);
    S.prevSnake = S.snake.map(p => ({ ...p }));
    S.acc = 0;
    S.stepInterval = 1000 / S.level.speed;
    S.score = progress ? (progress.score || 0) : (carriedScore || 0);
    S.scoreAtLevelStart = S.score;
    S.eaten = progress ? (progress.eaten || 0) : 0;
    S.stepCount = 0;
    S.effects = {}; S.bonus = null; S.particles = []; S.shake = 0;
    S.capote = null; S.capoteLife = 0;
    S.nextCapoteAt = progress ? (progress.nextCapoteAt || Math.max(90, S.score + 90)) : 90;
    S.shield = !!(progress && progress.shield);
    S.antigrav = !!(progress && progress.antigrav);
    S.spermShots = progress ? (progress.spermShots || 0) : 0;
    S.shots = []; S.nextShotAt = 0; S.puchita = null;
    S.puchitaReady = !!(progress && progress.puchitaReady);
    S.kitCapote = !!(progress && progress.kitCapote);
    S.lives = progress ? (progress.lives || 0) : 0;
    S.goldHeart = null;
    S.nextHeartAt = progress ? (progress.nextHeartAt || HEART_EVERY) : HEART_EVERY;
    S.mode = 'level'; S.bossDef = null; S.bossHp = 0; S.bossMax = 0;
    S.classicCleared = false; S.bossReady = false;
    S.graceUntil = now() + 1800;
    S.obstacles = S.level.obstacles.map(o => ({ ...o, move: o.move ? { ...o.move } : null }));
    rebuildObstacleSet();
    S.stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * COLS * CELL, y: Math.random() * ROWS * CELL,
      r: Math.random() * 1.6 + 0.5, p: Math.random() * Math.PI * 2,
    }));
    spawnRivalsForLevel();
    spawnFood();
    spawnLevelBonus();
    emit('score'); emit('length'); emit('goal'); emit('effects'); emit('lives');
  }

  function copyCell(p) { return p ? { ...p } : null; }

  function captureRun() {
    return {
      snake: S.snake.map(p => ({ ...p })),
      prevSnake: S.prevSnake.map(p => ({ ...p })),
      dir: { ...S.dir },
      dirQueue: S.dirQueue.map(d => ({ ...d })),
      acc: S.acc,
      score: S.score,
      scoreAtLevelStart: S.scoreAtLevelStart || 0,
      eaten: S.eaten,
      stepInterval: S.stepInterval,
      stepCount: S.stepCount,
      effects: { ...S.effects },
      shield: S.shield,
      capote: copyCell(S.capote),
      capoteLife: S.capoteLife,
      nextCapoteAt: S.nextCapoteAt,
      bonus: S.bonus ? { ...S.bonus } : null,
      bonusLife: S.bonusLife,
      food: copyCell(S.food),
      obstacles: S.obstacles.map(o => ({ ...o, move: o.move ? { ...o.move } : null })),
      antigrav: !!S.antigrav,
      spermShots: S.spermShots || 0,
      shots: (S.shots || []).map(s => ({ x: s.x, y: s.y, dir: { ...s.dir } })),
      puchita: S.puchita ? {
        x: S.puchita.x, y: S.puchita.y,
        prev: { ...(S.puchita.prev || S.puchita) }, hp: S.puchita.hp,
        phase: S.puchita.phase || 'hunt', helloUntil: S.puchita.helloUntil || 0,
      } : null,
      puchitaReady: !!S.puchitaReady,
      kitCapote: !!S.kitCapote,
      lives: S.lives || 0,
      goldHeart: copyCell(S.goldHeart),
      nextHeartAt: S.nextHeartAt || HEART_EVERY,
    };
  }

  function applyRun(carry) {
    S.snake = carry.snake.map(p => ({ ...p }));
    S.prevSnake = (carry.prevSnake || carry.snake).map(p => ({ ...p }));
    S.dir = { ...carry.dir };
    S.dirQueue = (carry.dirQueue || []).map(d => ({ ...d }));
    S.acc = carry.acc || 0;
    S.score = carry.score;
    S.scoreAtLevelStart = carry.scoreAtLevelStart != null ? carry.scoreAtLevelStart : carry.score;
    S.eaten = carry.eaten;
    S.stepInterval = carry.stepInterval;
    S.stepCount = carry.stepCount || 0;
    S.effects = { ...carry.effects };
    S.shield = !!carry.shield;
    S.capote = copyCell(carry.capote);
    S.capoteLife = carry.capoteLife || 0;
    S.nextCapoteAt = carry.nextCapoteAt || 150;
    S.bonus = carry.bonus ? { ...carry.bonus } : null;
    S.bonusLife = carry.bonusLife || 0;
    S.food = copyCell(carry.food);
    S.obstacles = (carry.obstacles || []).map(o => ({ ...o, move: o.move ? { ...o.move } : null }));
    rebuildObstacleSet();
    S.antigrav = !!carry.antigrav;
    S.spermShots = carry.spermShots || 0;
    S.shots = (carry.shots || []).map(s => ({ x: s.x, y: s.y, dir: { ...s.dir } }));
    S.puchita = carry.puchita ? {
      x: carry.puchita.x, y: carry.puchita.y,
      prev: { ...(carry.puchita.prev || carry.puchita) }, hp: carry.puchita.hp,
      phase: carry.puchita.phase || 'hunt', helloUntil: carry.puchita.helloUntil || 0,
    } : null;
    S.puchitaReady = !!carry.puchitaReady;
    S.kitCapote = !!carry.kitCapote;
    S.lives = carry.lives || 0;
    S.goldHeart = copyCell(carry.goldHeart);
    S.nextHeartAt = carry.nextHeartAt || HEART_EVERY;
  }

  function findBossSpawn(len) {
    const candidates = [
      { x: Math.max(2, COLS - len), y: 3, dir: { x: -1, y: 0 } },
      { x: Math.min(COLS - 2, len - 1), y: 3, dir: { x: 1, y: 0 } },
      { x: Math.max(2, COLS - len), y: ROWS - 6, dir: { x: -1, y: 0 } },
      { x: Math.min(COLS - 2, len - 1), y: ROWS - 6, dir: { x: 1, y: 0 } },
    ];
    const occupied = new Set(S.snake.map(p => key(p.x, p.y)));
    for (const c of candidates) {
      let ok = true;
      for (let i = 0; i < len; i++) {
        const px = Math.max(0, Math.min(COLS - 1, c.x - c.dir.x * i));
        const py = Math.max(0, Math.min(ROWS - 1, c.y - c.dir.y * i));
        if (occupied.has(key(px, py)) || S.obstacleSet.has(key(px, py))) { ok = false; break; }
      }
      if (ok) return c;
    }
    return candidates[0];
  }

  function startBoss(levelIndex, callbacks, carry) {
    S.cb = callbacks || S.cb;
    S.levelIndex = levelIndex;
    S.level = LEVELS[levelIndex];
    S.bossDef = BOSSES[levelIndex];
    S.mode = 'boss';
    S.running = true; S.paused = false; S.dying = false;
    S.bossHp = S.bossDef.hp; S.bossMax = S.bossDef.hp;
    S.graceUntil = now() + 2000;
    S.particles = []; S.shake = 0;
    S.classicCleared = true; S.bossReady = true;

    if (carry) {
      applyRun(carry);
    } else {
      S.dir = { x: 1, y: 0 }; S.dirQueue = [];
      S.snake = [{ x: 4, y: 16 }, { x: 3, y: 16 }, { x: 2, y: 16 }, { x: 1, y: 16 }];
      S.prevSnake = S.snake.map(p => ({ ...p }));
      S.acc = 0;
      S.stepInterval = 1000 / Math.max(5, S.level.speed - 0.8);
      S.score = 0; S.eaten = 0; S.stepCount = 0;
      S.effects = {}; S.bonus = null; S.bonusLife = 0;
      S.capote = null; S.capoteLife = 0; S.nextCapoteAt = 90; S.shield = false;
      S.food = null;
      S.antigrav = false; S.spermShots = 0; S.shots = []; S.puchita = null;
      S.puchitaReady = false; S.kitCapote = false;
      S.lives = 0; S.goldHeart = null; S.nextHeartAt = HEART_EVERY;
      S.obstacles = S.level.obstacles.filter(o => !o.move).slice(0, 5)
        .map(o => ({ ...o, move: null }));
      rebuildObstacleSet();
    }

    S.stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * COLS * CELL, y: Math.random() * ROWS * CELL,
      r: Math.random() * 1.6 + 0.5, p: Math.random() * Math.PI * 2,
    }));
    const len = S.bossDef.length;
    const spawn = findBossSpawn(len);
    S.rivals = [makeRival({
      x: spawn.x, y: spawn.y, dir: spawn.dir,
      length: len,
      interval: S.stepInterval * S.bossDef.speedMul,
      skin: S.bossDef.skin, name: S.bossDef.name, isBoss: true,
      smart: S.bossDef.smart,
    })];
    if (!S.food) spawnFood();
    emit('score'); emit('length'); emit('goal'); emit('effects'); emit('lives');
  }

  function addPoints(base) {
    const pts = base * (hasEffect('multi') ? 2 : 1);
    S.score += pts;
    emit('score');
    emit('goal');
    maybeUnlockBoss();
    return pts;
  }

  function maybeUnlockBoss() {
    if (S.mode !== 'level' || S.bossReady || S.dying || !S.running || S.paused || S.holdBoss) return;
    if (levelPoints() < (S.level.goal || 0) || S.holdBoss) return;
    S.bossReady = true;
    S.classicCleared = true;
    S.running = false;
    S.paused = true;
    emit('BossReady', captureRun());
  }

  function makeRival({ x, y, dir, length, interval, skin, name, isBoss, smart }) {
    const body = [];
    for (let i = 0; i < length; i++) {
      const px = Math.max(0, Math.min(COLS - 1, x - dir.x * i));
      const py = Math.max(0, Math.min(ROWS - 1, y - dir.y * i));
      body.push({ x: px, y: py });
    }
    return {
      body, prev: body.map(p => ({ ...p })), dir: { ...dir },
      acc: 0, interval, skin, name, isBoss: !!isBoss,
      smart: smart || 0, iFrames: 0, panicUntil: 0,
    };
  }

  function spawnRivalsForLevel() {
    S.rivals = [];
    const n = S.level.rivals || 0;
    const yMin = 2, yMax = ROWS - 6;
    for (let i = 0; i < n; i++) {
      const length = n <= 2 ? 7 + i : 5 + Math.min(i, 4);
      let x = COLS - length;
      let y = n <= 1 ? 5 : Math.round(yMin + i * (yMax - yMin) / Math.max(1, n - 1));
      if (y >= 15) y = 12;
      for (let tries = 0; tries < 50; tries++) {
        if (y >= 15) y = 12;
        if (!S.obstacleSet.has(key(x, y)) && !S.obstacleSet.has(key(x + 1, y))) break;
        y = yMin + ((y - yMin + 2) % (yMax - yMin + 1));
      }
      const smart = S.level.rivalSmart != null
        ? S.level.rivalSmart
        : 0.15 + S.levelIndex * 0.12;
      S.rivals.push(makeRival({
        x, y, dir: { x: -1, y: 0 },
        length,
        interval: S.stepInterval * (S.level.rivalSpeed || 1.3),
        skin: RIVAL_SKINS[i % RIVAL_SKINS.length],
        name: RIVAL_NAMES[i % RIVAL_NAMES.length],
        isBoss: false,
        smart,
      }));
    }
  }

  function stop() { S.running = false; }
  function pause() { if (S.running && !S.dying) S.paused = true; }
  function resume() { S.paused = false; }
  function emit(name, arg) { if (S.cb['on' + name]) S.cb['on' + name](arg); }

  /* ================= LOGIQUE ================= */

  function rebuildObstacleSet() {
    S.obstacleSet = new Set(S.obstacles.filter(o => o.wall).map(o => key(o.x, o.y)));
  }

  function isWorldProp(o) {
    return o && o.e && o.virus === undefined && !o.wall && !o.pack;
  }

  function isCombatPack(o) {
    return o && o.pack && o.virus === undefined && !o.wall;
  }

  function packAt(x, y) {
    return S.obstacles.find(o => isCombatPack(o) && o.x === x && o.y === y) || null;
  }

  function propAt(x, y) {
    return S.obstacles.find(o => isWorldProp(o) && o.x === x && o.y === y) || null;
  }

  function freeCell() {
    const taken = new Set([...S.obstacleSet]);
    S.snake.forEach(p => taken.add(key(p.x, p.y)));
    for (const r of S.rivals) r.body.forEach(p => taken.add(key(p.x, p.y)));
    if (S.food) taken.add(key(S.food.x, S.food.y));
    if (S.bonus) taken.add(key(S.bonus.x, S.bonus.y));
    if (S.capote) taken.add(key(S.capote.x, S.capote.y));
    if (S.puchita) taken.add(key(S.puchita.x, S.puchita.y));
    if (S.goldHeart) taken.add(key(S.goldHeart.x, S.goldHeart.y));
    for (const o of S.obstacles) {
      if (isWorldProp(o) || isCombatPack(o) || o.virus !== undefined) taken.add(key(o.x, o.y));
    }
    let tries = 0;
    while (tries++ < 500) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (!taken.has(key(x, y))) return { x, y };
    }
    return { x: 2, y: 2 };
  }

  function spawnFood() {
    const cell = freeCell();
    S.food = { x: cell.x, y: cell.y, kind: pickGrowItem() };
  }

  function pickGrowItem() {
    const lvl = S.levelIndex || 0;
    const pool = GROW_ITEMS.filter(g => (g.minLevel || 0) <= lvl);
    let total = 0;
    for (const g of pool) total += g.weight;
    let roll = Math.random() * total;
    for (const g of pool) {
      roll -= g.weight;
      if (roll <= 0) return g;
    }
    return pool[0] || GROW_ITEMS[0];
  }

  function foodEmoji(food) {
    if (!food) return '✨';
    const kind = food.kind || GROW_ITEMS[0];
    return kind.emoji || (S.level && S.level.food) || '✨';
  }

  function playerGirth() {
    const extra = Math.max(0, (S.snake.length || 2) - 2);
    return Math.min(1.85, 1 + extra * 0.072);
  }

  function tryBulkTank(reason) {
    if (reason !== 'mur' && reason !== 'obstacle' && reason !== 'rival') return false;
    const cost = reason === 'rival' ? 3 : 2;
    if (S.snake.length - cost < 2) return false;
    shrinkBy(cost);
    S.effects.invincible = now() + 1000;
    S.graceUntil = Math.max(S.graceUntil || 0, now() + 700);
    S.shake = 0.5;
    if (reason === 'mur') {
      S.dir = { x: -S.dir.x, y: -S.dir.y };
      S.dirQueue = [];
    }
    AudioMan.sfx.hit();
    burst(S.snake[0], ['💪', '💢', '✨']);
    emit('length');
    emit('Tanked', { cm: cost * 0.5, reason });
    return true;
  }

  function growBy(n) {
    if (n <= 0 || !S.snake.length) return;
    const tail = S.snake[S.snake.length - 1];
    for (let i = 0; i < n; i++) {
      S.snake.push({ x: tail.x, y: tail.y });
      S.prevSnake.push({ x: tail.x, y: tail.y });
    }
  }

  function shrinkBy(n) {
    for (let i = 0; i < n && S.snake.length > 1; i++) {
      S.snake.pop();
      if (S.prevSnake.length > 1) S.prevSnake.pop();
    }
  }

  function collectGrowItem(kind, alreadyGrew) {
    kind = kind || GROW_ITEMS[0];
    const grow = kind.grow || 1;
    if (alreadyGrew) growBy(Math.max(0, grow - 1));
    else growBy(grow);
    S.eaten++;
    S.eatFlash = now();
    S.holdBoss = true;
    addPoints(kind.pts != null ? kind.pts : PTS.food);
    S.holdBoss = false;
    S.stepInterval = Math.max(70, S.stepInterval * 0.988);
    if (kind.effect) {
      S.effects[kind.effect] = now() + (kind.dur || 3000);
      emit('effects');
    }
    AudioMan.sfx.eat();
    burst(S.food || S.snake[0], grow >= 3 ? ['💎', '✨', '💖'] : grow >= 2 ? ['💊', '💖', '✨'] : ['✨', '💖', '🌈']);
    emit('length');
    emit('Grow', { grow: grow * 0.5, name: kind.name, emoji: foodEmoji({ kind }) });
    spawnFood();
    maybeSpawnGoldHeart();
    const unlocked = Save.addEaten(1);
    if (unlocked.length) {
      S.paused = true;
      emit('ShopUnlock', unlocked);
    }
  }

  function collectProp(o, alreadyGrew) {
    if (!alreadyGrew) growBy(1);
    S.eaten++;
    S.eatFlash = now();
    S.holdBoss = true;
    addPoints(PTS.food);
    S.holdBoss = false;
    S.stepInterval = Math.max(70, S.stepInterval * 0.988);
    AudioMan.sfx.eat();
    burst({ x: o.x, y: o.y }, [o.e, '✨', '💖']);
    emit('length');
    emit('Grow', { grow: 0.5, name: 'Bonus du lieu', emoji: o.e, toast: true });
    maybeSpawnGoldHeart();
    const unlocked = Save.addEaten(1);
    if (unlocked.length) {
      S.paused = true;
      emit('ShopUnlock', unlocked);
    }
  }

  function collectMeanPuchita(o, alreadyGrew) {
    const name = VIRUS_NAMES[o.virus] || 'Puchita';
    if (alreadyGrew) shrinkBy(1);
    if (!hasEffect('invincible')) {
      shrinkBy(1);
      S.shake = 0.35;
      AudioMan.sfx.hit();
      burst({ x: o.x, y: o.y }, ['☠️', '💚', '💨']);
      emit('length');
      if (S.snake.length < 2 || snakeCm(S.snake) <= 0) {
        die('puchita', name);
        if (!S.dying) ensureMinLength();
        return false;
      }
      emit('Grow', { grow: -0.5, name, emoji: '☠️', toast: true });
    }
    return false;
  }

  function ensureMinLength() {
    const head = S.snake[0] || { x: 4, y: 16 };
    while (S.snake.length < 2) {
      S.snake.push({ x: head.x, y: head.y });
      S.prevSnake.push({ x: head.x, y: head.y });
    }
    emit('length');
  }

  function maybeSpawnGoldHeart() {
    if (S.goldHeart) return;
    const need = S.nextHeartAt || HEART_EVERY;
    if ((S.eaten || 0) < need) return;
    S.goldHeart = freeCell();
    S.nextHeartAt = need + HEART_EVERY;
    emit('GoldHeart');
  }

  function pickupGoldHeart() {
    if (!S.goldHeart) return;
    S.goldHeart = null;
    S.lives = (S.lives || 0) + 1;
    AudioMan.sfx.bonus();
    burst(S.snake[0], ['💛', '✨', '⭐']);
    emit('lives');
    emit('LifeUp');
  }

  function maybeSpawnBonus() {
    if (S.bonus || Math.random() > 0.048) return;
    S.bonus = { ...freeCell(), type: pickBonusType() };
    S.bonusLife = now() + 10000;
  }

  function pickBonusType() {
    const pool = BONUS_TYPES;
    const total = pool.reduce((s, b) => s + (b.weight || 1), 0);
    let roll = Math.random() * total;
    for (const b of pool) {
      roll -= b.weight || 1;
      if (roll <= 0) return b;
    }
    return pool[0];
  }

  function hasEffect(id) { return (S.effects[id] || 0) > now(); }

  function applyBonus(type) {
    if (type.id === 'ammo') {
      const n = type.shots || 2;
      S.spermShots = (S.spermShots || 0) + n;
      addPoints(PTS.bonus);
      AudioMan.sfx.bonus();
      burst(S.snake[0], ['💦', '✨']);
      emit('effects');
      emit('Ammo', { n });
      return;
    }
    S.effects[type.id] = now() + type.dur;
    addPoints(PTS.bonus);
    AudioMan.sfx.bonus();
    emit('effects');
    burst(S.snake[0], ['✨', '💛']);
  }

  function collectCombatPack(o) {
    const def = COMBAT_PACKS[o.pack] || COMBAT_PACKS.ammo;
    if (o.fromKit) Save.consumeOne(o.fromKit);
    if (o.pack === 'ammo') {
      const n = o.shots || def.shots || 2;
      S.spermShots = (S.spermShots || 0) + n;
      emit('Ammo', { n });
    } else if (o.pack === 'shield') {
      S.shield = true;
      if (o.fromKit === 'capote') S.kitCapote = true;
      emit('CombatPack', { name: def.name, emoji: def.emoji });
    } else if (o.pack === 'star') {
      S.effects.invincible = now() + (def.dur || 5500);
      emit('CombatPack', { name: def.name, emoji: def.emoji });
    } else if (o.pack === 'antigrav') {
      S.antigrav = true;
      emit('CombatPack', { name: def.name, emoji: def.emoji });
    } else if (o.pack === 'puchita') {
      S.puchitaReady = true;
      emit('CombatPack', { name: def.name, emoji: def.emoji });
    } else if (o.pack === 'pump') {
      growBy(def.grow || 3);
      emit('length');
      emit('CombatPack', { name: def.name, emoji: def.emoji });
    }
    addPoints(PTS.bonus);
    AudioMan.sfx.bonus();
    burst({ x: o.x, y: o.y }, [def.emoji, '✨', '💥']);
    emit('effects');
  }

  function die(reason, detail) {
    if (hasEffect('invincible')) return;
    if (tryBulkTank(reason)) return;
    if (S.shield && (reason === 'obstacle' || reason === 'rival' || reason === 'puchita')) {
      S.shield = false;
      S.effects.invincible = now() + 1800;
      AudioMan.sfx.boing();
      burst(S.snake[0], ['🛡️', '💢', '✨']);
      emit('effects');
      emit(S.mode === 'boss' ? 'SavedBoss' : 'Saved');
      return;
    }
    if (S.puchita && S.puchita.hp > 0 && (reason === 'obstacle' || reason === 'rival' || reason === 'puchita')) {
      sacrificePuchita();
      S.effects.invincible = now() + 1400;
      emit('effects');
      return;
    }
    if ((S.lives || 0) > 0) {
      S.lives--;
      S.effects.invincible = now() + 2200;
      S.graceUntil = now() + 1600;
      S.shake = 0.55;
      AudioMan.sfx.bonus();
      burst(S.snake[0], ['💛', '✨', '💖']);
      emit('lives');
      emit('effects');
      emit('SavedLife');
      return;
    }
    S.dying = true;
    S.dieTime = now();
    S.shake = 1;
    AudioMan.stopMusic();
    AudioMan.sfx.death();
    burst(S.snake[0], ['💥', '⭐', '💫']);
    setTimeout(() => { S.running = false; emit('GameOver', { score: S.score, reason, detail }); }, 1100);
  }

  function virusAt(x, y) {
    const o = S.obstacles.find(o => o.x === x && o.y === y);
    return o && o.virus !== undefined ? VIRUS_NAMES[o.virus] : null;
  }

  function step() {
    S.stepCount++;
    // obstacles mobiles
    let moved = false;
    for (const o of S.obstacles) {
      if (!o.move) continue;
      if (S.stepCount % o.move.every !== 0) continue;
      const axis = o.move.axis;
      o[axis] += o.move.dir;
      if (o[axis] <= o.move.min || o[axis] >= o.move.max) o.move.dir *= -1;
      moved = true;
    }
    if (moved) {
      rebuildObstacleSet();
      const head = S.snake[0];
      const bumped = S.obstacles.find(o => o.virus !== undefined && o.x === head.x && o.y === head.y);
      if (bumped) {
        S.obstacles = S.obstacles.filter(o => o !== bumped);
        collectMeanPuchita(bumped, false);
        return;
      }
    }

    // direction
    while (S.dirQueue.length) {
      const d = S.dirQueue.shift();
      if (d.x !== -S.dir.x || d.y !== -S.dir.y) { S.dir = d; break; }
    }

    const head = S.snake[0];
    let nx = head.x + S.dir.x;
    let ny = head.y + S.dir.y;

    // murs
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      if (S.antigrav || hasEffect('invincible')) {
        nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS;
      } else { die('mur'); return; }
    }

    const nk = key(nx, ny);
    const willEat = S.food && S.food.x === nx && S.food.y === ny;
    const hitVirus = S.obstacles.find(o => o.virus !== undefined && o.x === nx && o.y === ny);
    const hitProp = !hitVirus ? propAt(nx, ny) : null;
    const hitPack = !hitVirus && !hitProp ? packAt(nx, ny) : null;

    // seuls les murs tuent. Les Puchitas méchantes retirent 0.5 cm.
    if (!hasEffect('invincible') && S.obstacleSet.has(nk)) { die('obstacle', virusAt(nx, ny)); return; }

    // rivaux / boss : seules les boules (dernier segment) sont vulnérables
    if (!hasEffect('invincible')) {
      for (const r of S.rivals) {
        const tail = r.body[r.body.length - 1];
        const hitBalls = tail && tail.x === nx && tail.y === ny;
        if (hitBalls) {
          if (now() < (r.iFrames || 0)) break;
          biteRival(r);
          if (!S.running || S.dying) return;
          break;
        }
        // le corps, on le traverse : seules les boules comptent
      }
    }

    // avance
    S.prevSnake = S.snake.map(p => ({ ...p }));
    S.snake.unshift({ x: nx, y: ny });

    if (willEat) {
      collectGrowItem(S.food.kind, true);
      S.prevSnake.push({ ...S.prevSnake[S.prevSnake.length - 1] });
      if (!S.running) return;
    } else if (hitVirus) {
      S.obstacles = S.obstacles.filter(o => o !== hitVirus);
      const grew = collectMeanPuchita(hitVirus, true);
      if (grew) S.prevSnake.push({ ...S.prevSnake[S.prevSnake.length - 1] });
      if (!S.running) return;
    } else if (hitProp) {
      S.obstacles = S.obstacles.filter(o => o !== hitProp);
      collectProp(hitProp, true);
      S.prevSnake.push({ ...S.prevSnake[S.prevSnake.length - 1] });
      if (!S.running) return;
    } else if (hitPack) {
      S.obstacles = S.obstacles.filter(o => o !== hitPack);
      collectCombatPack(hitPack);
      S.snake.pop();
      if (!S.running) return;
    } else {
      S.snake.pop();
      const p = S.bonus;
      if (p && p.x === nx && p.y === ny) { applyBonus(p.type); S.bonus = null; }
    }

    maybeSpawnBonus();
    if (S.bonus && now() > S.bonusLife) S.bonus = null;

    stepPuchita();
    if (!S.running || S.dying) return;

    // capote protectrice : ramassage, apparition tous les 150 points, péremption
    if (S.capote && S.capote.x === nx && S.capote.y === ny) {
      S.capote = null;
      S.shield = true;
      addPoints(PTS.capote);
      AudioMan.sfx.bonus();
      burst(S.snake[0], ['🛡️', '✨']);
      emit('effects');
      emit('CapoteOn');
    }
    if (S.capote && now() > S.capoteLife) { S.capote = null; emit('effects'); }

    if (S.goldHeart && S.goldHeart.x === nx && S.goldHeart.y === ny) {
      pickupGoldHeart();
    }
  }

  function biteRival(r) {
    const balls = r.body[r.body.length - 1];
    AudioMan.sfx.boing();
    burst(balls, ['💢', '✨', '💥']);
    if (r.isBoss) {
      r.iFrames = now() + 700 + (r.smart || 0) * 500;
      r.panicUntil = now() + 800 + (r.smart || 0) * 900;
      hurtBoss(1, balls);
      return;
    }
    burst(r.body[0], ['💥', '⭐']);
    S.rivals = S.rivals.filter(x => x !== r);
    const pts = addPoints(PTS.rival);
    emit('RivalKill', { name: r.name, pts });
  }

  function hurtBoss(amount, cell) {
    if (S.mode !== 'boss') return;
    S.bossHp = Math.max(0, S.bossHp - amount);
    S.shake = 0.5;
    AudioMan.sfx.hit();
    burst(cell || S.snake[0], ['💢', '💥']);
    emit('goal');
    if (S.bossHp <= 0) {
      S.running = false;
      AudioMan.stopMusic();
      AudioMan.sfx.levelClear();
      emit('BossWin', { score: S.score, name: S.bossDef.name });
    }
  }

  function pickChaseDir(r) {
    const head = r.body[0];
    const player = S.snake[0];
    const tail = r.body[r.body.length - 1];
    const smart = r.smart || 0;
    const panic = now() < (r.panicUntil || 0);
    const tailDist = Math.abs(player.x - tail.x) + Math.abs(player.y - tail.y);
    const protectBalls = (r.isBoss || smart >= 0.85) && (panic || tailDist <= 2 + Math.floor(smart * 3));
    const huntBallsChance = Math.min(0.96, 0.18 + smart * 0.78);
    const theirBalls = S.snake[S.snake.length - 1] || player;
    const hunt = (Math.random() < huntBallsChance) ? theirBalls : player;
    const look = Math.round(1 + smart * 2.2);
    const target = smart >= 0.7 ? {
      x: hunt.x + (S.dir.x || 0) * look,
      y: hunt.y + (S.dir.y || 0) * look,
    } : hunt;

    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    const isFree = (nx, ny, body) => {
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return false;
      if (S.obstacleSet.has(key(nx, ny))) return false;
      if (body.slice(0, -1).some(p => p.x === nx && p.y === ny)) return false;
      return true;
    };
    const options = dirs.filter(d => {
      if (d.x === -r.dir.x && d.y === -r.dir.y) return false;
      return isFree(head.x + d.x, head.y + d.y, r.body);
    });
    if (!options.length) return r.dir;

    const newTail = r.body[r.body.length - 2] || tail;
    const score = d => {
      const nx = head.x + d.x, ny = head.y + d.y;
      if (protectBalls) {
        return -(Math.abs(newTail.x - player.x) + Math.abs(newTail.y - player.y));
      }
      if (panic) return -(Math.abs(nx - player.x) + Math.abs(ny - player.y));
      let s = Math.abs(nx - target.x) + Math.abs(ny - target.y);
      if (smart >= 0.6) {
        const exits = dirs.filter(d2 => {
          if (d2.x === -d.x && d2.y === -d.y) return false;
          return isFree(nx + d2.x, ny + d2.y, r.body);
        }).length;
        if (exits <= 1) s += 10;
      }
      return s;
    };
    options.sort((a, b) => score(a) - score(b));
    const wobble = Math.max(0.02, 0.30 - smart * 0.28);
    if (options.length > 1 && Math.random() < wobble) return options[1];
    return options[0];
  }

  function stepRival(r) {
    const d = pickChaseDir(r);
    r.dir = d;
    const nx = r.body[0].x + d.x;
    const ny = r.body[0].y + d.y;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    if (S.obstacleSet.has(key(nx, ny))) return;

    r.prev = r.body.map(p => ({ ...p }));
    r.body.unshift({ x: nx, y: ny });
    r.body.pop();

    // il ne te tue qu'en te mordant les boules
    const myBalls = S.snake[S.snake.length - 1];
    if (!hasEffect('invincible') && myBalls && myBalls.x === nx && myBalls.y === ny) {
      die('rival', r.name);
      return;
    }
    if (S.food && S.food.x === nx && S.food.y === ny) spawnFood();
    if (S.puchita && S.puchita.x === nx && S.puchita.y === ny) {
      if (S.puchita.phase === 'hello') return;
      if (!r.isBoss) {
        puchitaSlay(r);
        return;
      }
      sacrificePuchita();
      emit('effects');
    }
  }

  function setDirection(x, y) {
    const last = S.dirQueue[S.dirQueue.length - 1] || S.dir;
    if (last.x === x && last.y === y) return;
    if (S.dirQueue.length < 3) S.dirQueue.push({ x, y });
  }

  function skillAlreadyHeld(kitId) {
    if (kitId === 'capote') return !!S.shield;
    if (kitId === 'antigrav') return !!S.antigrav;
    if (kitId === 'puchita') return !!(S.puchitaReady || S.puchita);
    if (kitId === 'sperm') return (S.spermShots || 0) > 0;
    return false;
  }

  function pickLevelBonus() {
    const order = ['capote', 'sperm', 'puchita', 'antigrav', 'pump'];
    for (const id of order) {
      if (Save.kitCount(id) <= 0) continue;
      if (skillAlreadyHeld(id)) continue;
      const kind = KIT_TO_PACK[id];
      if (!kind) continue;
      return { pack: kind, fromKit: id, shots: id === 'sperm' ? 3 : undefined };
    }
    const free = ['ammo', 'shield', 'star'][S.levelIndex % 3];
    if (free === 'shield' && S.shield) return { pack: 'ammo', fromKit: null };
    if (free === 'ammo' && (S.spermShots || 0) > 0) return { pack: 'star', fromKit: null };
    return { pack: free, fromKit: null };
  }

  function freeCellAway() {
    const taken = new Set();
    const mark = (x, y) => taken.add(key(x, y));
    S.snake.forEach(p => mark(p.x, p.y));
    for (const r of S.rivals) r.body.forEach(p => mark(p.x, p.y));
    for (const o of S.obstacles) mark(o.x, o.y);
    if (S.food) mark(S.food.x, S.food.y);
    let tries = 0;
    while (tries++ < 600) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (taken.has(key(x, y))) continue;
      if (S.obstacleSet.has(key(x, y))) continue;
      if (y === 16 && x >= 4 && x <= 14) continue;
      if (Math.abs(x - 4) + Math.abs(y - 16) < 7) continue;
      return { x, y };
    }
    return freeCell();
  }

  function spawnLevelBonus() {
    const pick = pickLevelBonus();
    if (!pick || !pick.pack) return;
    const cell = freeCellAway();
    S.obstacles.push({
      x: cell.x, y: cell.y,
      pack: pick.pack,
      fromKit: pick.fromKit || null,
      shots: pick.shots,
    });
    const def = COMBAT_PACKS[pick.pack] || COMBAT_PACKS.ammo;
    emit('SkillSpawn', { name: def.name, emoji: def.emoji });
    emit('effects');
  }

  function callPuchita() {
    if (!S.running || S.paused || S.dying) return false;
    if (!S.puchitaReady || S.puchita) return false;
    S.puchitaReady = false;
    const h = S.snake[0];
    let x = Math.max(2, Math.min(COLS - 3, h.x + S.dir.x * 5));
    let y = Math.max(2, Math.min(ROWS - 3, h.y + S.dir.y * 5));
    if (S.obstacleSet.has(key(x, y))) {
      const c = freeCell();
      x = c.x; y = c.y;
    }
    S.puchita = {
      x, y, prev: { x, y }, hp: 1,
      phase: 'hello', helloUntil: now() + 3200,
    };
    burst({ x, y }, ['💕', '💋', '✨']);
    AudioMan.sfx.bonus();
    emit('PuchitaHello');
    emit('effects');
    return true;
  }

  function puchitaSlay(r) {
    if (!r || r.isBoss) return;
    const head = r.body[0];
    if (S.puchita) {
      S.puchita.prev = { x: S.puchita.x, y: S.puchita.y };
      S.puchita.x = head.x;
      S.puchita.y = head.y;
    }
    burst(head, ['💕', '💥', '✨']);
    AudioMan.sfx.hit();
    S.rivals = S.rivals.filter(x => x !== r);
    const pts = addPoints(PTS.rival);
    emit('PuchitaKill', { name: r.name, pts });
  }

  function sacrificePuchita() {
    if (!S.puchita) return;
    burst(S.puchita, ['💕', '✨', '💢']);
    AudioMan.sfx.boing();
    S.puchita = null;
    emit('PuchitaBye');
  }

  function stepPuchita() {
    const p = S.puchita;
    if (!p || S.dying) return;
    if (p.phase === 'hello') {
      if (now() >= (p.helloUntil || 0)) {
        p.phase = 'hunt';
        burst(p, ['💕', '✨']);
        emit('effects');
      }
      return;
    }
    p.prev = { x: p.x, y: p.y };
    const food = S.food;
    const tail = S.snake[S.snake.length - 1] || S.snake[0];
    let target = tail;
    let bestD = 1e9;
    for (const r of S.rivals) {
      if (r.isBoss) continue;
      const h = r.body[0];
      const d = Math.abs(h.x - p.x) + Math.abs(h.y - p.y);
      if (d < bestD) { bestD = d; target = h; }
    }
    if (target === tail && food && (Math.abs(food.x - p.x) + Math.abs(food.y - p.y) <= 6)) {
      target = food;
    }
    const dx = Math.sign(target.x - p.x);
    const dy = Math.sign(target.y - p.y);
    if (dx && (!dy || Math.random() < 0.6)) p.x += dx;
    else if (dy) p.y += dy;
    if (S.antigrav) {
      p.x = (p.x + COLS) % COLS;
      p.y = (p.y + ROWS) % ROWS;
    } else {
      p.x = Math.max(0, Math.min(COLS - 1, p.x));
      p.y = Math.max(0, Math.min(ROWS - 1, p.y));
    }
    if (S.food && S.food.x === p.x && S.food.y === p.y) {
      collectGrowItem(S.food.kind, false);
    }
    if (S.goldHeart && S.goldHeart.x === p.x && S.goldHeart.y === p.y) {
      pickupGoldHeart();
    }
    const prey = S.rivals.find(r => !r.isBoss && r.body.some(c => c.x === p.x && c.y === p.y));
    if (prey) {
      puchitaSlay(prey);
      return;
    }
    if (S.obstacleSet.has(key(p.x, p.y))) return;
    const snack = S.obstacles.find(o => o.virus !== undefined && o.x === p.x && o.y === p.y);
    if (snack) {
      S.obstacles = S.obstacles.filter(o => o !== snack);
      burst({ x: snack.x, y: snack.y }, ['💕', '💢', '✨']);
      AudioMan.sfx.hit();
      return;
    }
    const loot = packAt(p.x, p.y);
    if (loot) {
      S.obstacles = S.obstacles.filter(o => o !== loot);
      collectCombatPack(loot);
    }
  }

  function tryShoot() {
    if (!S.running || S.paused || S.dying) return false;
    if ((S.spermShots || 0) <= 0) return false;
    if (now() < (S.nextShotAt || 0)) return false;
    S.nextShotAt = now() + 280;
    S.spermShots--;
    const h = S.snake[0];
    S.shots.push({ x: h.x + S.dir.x, y: h.y + S.dir.y, dir: { ...S.dir } });
    AudioMan.sfx.shoot();
    emit('effects');
    resolveShot(S.shots[S.shots.length - 1]);
    return true;
  }

  function resolveShot(shot) {
    if (!shot) return false;
    if (shot.x < 0 || shot.x >= COLS || shot.y < 0 || shot.y >= ROWS) {
      if (S.antigrav) {
        shot.x = (shot.x + COLS) % COLS;
        shot.y = (shot.y + ROWS) % ROWS;
      } else return true;
    }
    const hitVirus = S.obstacles.find(o => o.x === shot.x && o.y === shot.y && o.virus !== undefined);
    if (hitVirus) {
      S.obstacles = S.obstacles.filter(o => o !== hitVirus);
      rebuildObstacleSet();
      addPoints(PTS.virus);
      burst(shot, ['💦', '💥']);
      AudioMan.sfx.hit();
      return true;
    }
    for (const r of S.rivals) {
      const onBody = r.body.some(p => p.x === shot.x && p.y === shot.y);
      if (!onBody) continue;
      if (r.isBoss) {
        const tail = r.body[r.body.length - 1];
        if (tail && tail.x === shot.x && tail.y === shot.y) {
          biteRival(r);
          return true;
        }
        return false;
      }
      biteRival(r);
      return true;
    }
    return false;
  }

  function stepShots() {
    S.shots = S.shots.filter(shot => {
      shot.x += shot.dir.x;
      shot.y += shot.dir.y;
      return !resolveShot(shot);
    });
  }

  /* ================= PARTICULES ================= */

  function burst(cell, emojis) {
    for (let i = 0; i < 10; i++) {
      S.particles.push({
        x: (cell.x + 0.5) * CELL, y: (cell.y + 0.5) * CELL,
        vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.7) * 5,
        life: 1, e: emojis[i % emojis.length], s: 10 + Math.random() * 12,
      });
    }
    for (let i = 0; i < 6; i++) {
      S.particles.push({
        x: (cell.x + 0.5) * CELL, y: (cell.y + 0.5) * CELL,
        vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.8) * 4,
        life: 0.8, spark: true, s: 4 + Math.random() * 5,
        hue: 40 + Math.random() * 40,
      });
    }
  }

  /* ================= BOUCLE ================= */

  let lastT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(50, t - lastT);
    lastT = t;
    if (S.running && !S.paused && !S.dying) {
      S.acc += dt;
      const interval = hasEffect('speed') ? S.stepInterval / 1.55 : S.stepInterval;
      while (S.acc >= interval) { S.acc -= interval; step(); if (!S.running || S.dying) break; }
      S.shotAcc = (S.shotAcc || 0) + dt;
      while (S.shotAcc >= 55) {
        S.shotAcc -= 55;
        stepShots();
        if (!S.running || S.dying) break;
      }
      for (const r of S.rivals) {
        if (!S.running || S.dying) break;
        if (now() < S.graceUntil) break;
        r.acc += dt;
        while (r.acc >= r.interval) {
          r.acc -= r.interval;
          stepRival(r);
          if (!S.running || S.dying) break;
        }
      }
      emit('effects');
    }
    if (S.running && !S.dying) maybeUnlockBoss();
    for (const p of S.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= dt / 900;
    }
    S.particles = S.particles.filter(p => p.life > 0);
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt / 700);
    if (S.level) render(t);
  }
  requestAnimationFrame(loop);

  /* ================= RENDU ================= */

  function render(t) {
    fitCanvas();
    const L = S.level;
    ctx.save();
    if (S.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 14 * S.shake, (Math.random() - 0.5) * 14 * S.shake);
    }
    drawBackground(L, t);
    drawObstacles(t);
    if (S.food) drawFood(t);
    if (S.bonus) drawBonus(t);
    if (S.capote) drawCapote(t);
    if (S.goldHeart) drawGoldHeart(t);
    for (const r of S.rivals) drawEnemyPenis(r, t);
    drawShots(t);
    if (S.puchita) drawPuchita(t);
    drawSnake(t);
    drawParticles();
    ctx.restore();
  }

  function drawBackground(L, t) {
    const W = COLS * CELL, H = ROWS * CELL;
    let [c1, c2] = L.bg;
    if (L.deco === 'chaos') {
      const hue = (t / 28) % 360;
      c1 = `hsl(${hue}, 50%, 20%)`;
      c2 = `hsl(${(hue + 50) % 360}, 48%, 14%)`;
    }

    if (L.deco === 'bathroom') {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#eef9fc');
      sky.addColorStop(0.22, '#d4eef7');
      sky.addColorStop(1, '#b9dce8');
      ctx.fillStyle = sky;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      fillGroutFloor('#eef9fc', '#cfe8f2', '#9eb8c4');
      // bandeau faïence en haut
      ctx.fillStyle = '#9fd0de';
      ctx.fillRect(0, 0, W, 18);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(0, 0, W, 6);
      // silhouette de baignoire
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.beginPath();
      ctx.ellipse(70, H - 36, 56, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 170, 190, .45)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // vapeur
      for (let i = 0; i < 10; i++) {
        const sx = 40 + i * 86 + Math.sin(t / 700 + i) * 18;
        const sy = 28 + (i % 4) * 14 + Math.sin(t / 500 + i * 0.7) * 8;
        ctx.globalAlpha = 0.12 + (i % 3) * 0.05;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 28 + (i % 4) * 6, 11, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // gouttes
      ctx.fillStyle = 'rgba(140, 190, 210, .55)';
      for (let i = 0; i < 12; i++) {
        const dx = 28 + ((i * 73) % (W - 40));
        const dy = ((t / 7 + i * 95) % (H + 30)) - 16;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.ellipse(dx, dy, 2.2, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // bulles
      for (let i = 0; i < 14; i++) {
        const bx = ((i * 97) % W) + Math.sin(t / 900 + i) * 18;
        const by = H - ((t / 12 + i * 110) % (H + 70));
        const r = 5 + (i % 5) * 3;
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.22;
        ctx.beginPath(); ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.25, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (L.deco === 'beach') {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#7ec8f0');
      sky.addColorStop(0.35, '#c8e9ff');
      sky.addColorStop(0.5, '#ffe7a8');
      sky.addColorStop(1, '#f2c56a');
      ctx.fillStyle = sky;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      fillGroutFloor('#f6d48a', '#e8b85c', '#c49248', 3);
      // soleil
      const sx = W - 70, sy = 48;
      const sun = ctx.createRadialGradient(sx, sy, 4, sx, sy, 70);
      sun.addColorStop(0, 'rgba(255, 230, 120, .95)');
      sun.addColorStop(0.4, 'rgba(255, 180, 60, .35)');
      sun.addColorStop(1, 'transparent');
      ctx.fillStyle = sun;
      ctx.fillRect(sx - 80, sy - 80, 160, 160);
      ctx.fillStyle = '#ffe566';
      ctx.beginPath(); ctx.arc(sx, sy, 22, 0, Math.PI * 2); ctx.fill();
      // mer
      ctx.fillStyle = 'rgba(64, 170, 220, .7)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= W; x += 10)
        ctx.lineTo(x, 42 + Math.sin(x / 36 + t / 380) * 7);
      ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 46);
      for (let x = 0; x <= W; x += 12)
        ctx.lineTo(x, 46 + Math.sin(x / 22 + t / 280) * 3);
      ctx.stroke();
      // écume + mouettes
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 58);
      for (let x = 0; x <= W; x += 14)
        ctx.lineTo(x, 58 + Math.sin(x / 18 + t / 220) * 4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(40, 50, 70, .55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const gx = ((t / 18 + i * 210) % (W + 80)) - 40;
        const gy = 22 + (i % 3) * 10 + Math.sin(t / 400 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(gx - 8, gy);
        ctx.quadraticCurveTo(gx - 3, gy - 6, gx, gy);
        ctx.quadraticCurveTo(gx + 3, gy - 6, gx + 8, gy);
        ctx.stroke();
      }
    } else if (L.deco === 'club') {
      ctx.fillStyle = '#120a24';
      ctx.fillRect(-20, -20, W + 40, H + 40);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const dance = x >= 10 && x <= 17 && y >= 7 && y <= 12;
          const px = x * CELL + 2, py = y * CELL + 2, s = CELL - 4;
          if (dance) {
            const hues = [320, 200, 50, 140];
            const g = ctx.createRadialGradient(px + s * 0.5, py + s * 0.5, 2, px + s * 0.5, py + s * 0.5, s * 0.7);
            g.addColorStop(0, `hsla(${hues[(x + y) % 4]}, 90%, ${58 + Math.sin(t / 200 + x) * 10}%, .95)`);
            g.addColorStop(1, '#1a1233');
            ctx.fillStyle = g;
          } else {
            ctx.fillStyle = (x + y) % 2 ? '#1c1438' : '#120c28';
          }
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(px, py, s, s, 5);
          else ctx.rect(px, py, s, s);
          ctx.fill();
        }
      }
      ctx.strokeStyle = 'rgba(255, 110, 200, .15)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke();
      }
      const colors = ['#ff6fa5', '#6fc3ff', '#ffd93d', '#6ee86e'];
      for (let i = 0; i < 4; i++) {
        const a = t / 1400 + (i * Math.PI) / 2;
        const gx = W / 2 + Math.cos(a) * W * 0.32;
        const gy = H / 2 + Math.sin(a) * H * 0.28;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 170);
        g.addColorStop(0, colors[i] + '66');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      drawWorldIcon('🪩', W / 2, 36, t, 1.2);
      // lasers depuis la boule
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const a = t / 900 + i * Math.PI / 3;
        ctx.strokeStyle = colors[i % colors.length] + '55';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(W / 2, 28);
        ctx.lineTo(W / 2 + Math.cos(a) * W * 0.7, 28 + Math.sin(a) * H * 0.85);
        ctx.stroke();
      }
      ctx.restore();
      // fumée au sol
      for (let i = 0; i < 7; i++) {
        ctx.globalAlpha = 0.08 + (i % 3) * 0.03;
        ctx.fillStyle = '#c8b8ff';
        ctx.beginPath();
        ctx.ellipse(
          60 + i * 120 + Math.sin(t / 600 + i) * 20,
          H - 18 + Math.sin(t / 400 + i) * 6,
          50, 14, 0, 0, Math.PI * 2
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (L.deco === 'dungeon') {
      ctx.fillStyle = '#1c1824';
      ctx.fillRect(-20, -20, W + 40, H + 40);
      fillGroutFloor('#4a4558', '#323044', '#1c1824');
      for (const [tx, ty] of [[1.4, 1.4], [COLS - 1.4, 1.4], [1.4, ROWS - 1.4], [COLS - 1.4, ROWS - 1.4]]) {
        const flick = 34 + Math.sin(t / 90 + tx) * 10;
        const g = ctx.createRadialGradient(tx * CELL, ty * CELL, 0, tx * CELL, ty * CELL, flick * 3.2);
        g.addColorStop(0, 'rgba(255,150,40,.4)');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(tx * CELL - 110, ty * CELL - 110, 220, 220);
        drawWorldIcon('🔥', tx * CELL, ty * CELL, t, 1);
      }
      // slime qui coule
      ctx.fillStyle = 'rgba(80, 180, 90, .28)';
      for (let i = 0; i < 8; i++) {
        const sx = 50 + i * 100;
        const len = 18 + Math.sin(t / 400 + i) * 8;
        ctx.beginPath();
        ctx.ellipse(sx, 8 + len * 0.4, 4, len, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (L.deco === 'space' || L.deco === 'chaos') {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      if (L.deco === 'space') {
        const neb = ctx.createRadialGradient(W * 0.7, H * 0.3, 10, W * 0.7, H * 0.3, 220);
        neb.addColorStop(0, 'rgba(120, 60, 200, .28)');
        neb.addColorStop(1, 'transparent');
        ctx.fillStyle = neb;
        ctx.fillRect(0, 0, W, H);
        const neb2 = ctx.createRadialGradient(W * 0.2, H * 0.75, 8, W * 0.2, H * 0.75, 180);
        neb2.addColorStop(0, 'rgba(40, 90, 200, .22)');
        neb2.addColorStop(1, 'transparent');
        ctx.fillStyle = neb2;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#c9a06a';
        ctx.beginPath(); ctx.arc(80, 70, 28, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(200,180,140,.5)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(80, 70, 44, 10, 0.4, 0, Math.PI * 2); ctx.stroke();
      }
      for (const s of S.stars) {
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 700 + s.p));
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (L.deco === 'space') {
        const sx = (t / 4) % (W + 120) - 40;
        const sy = 40 + ((t / 18) % 8) * 18;
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 28, sy + 10);
        ctx.stroke();
      }
      if (L.deco === 'chaos') {
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++)
            if ((x + y) % 2 === 0) {
              ctx.fillStyle = `hsla(${(t / 20 + x * 12 + y * 8) % 360}, 55%, 18%, .35)`;
              ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
            }
        ctx.globalAlpha = 0.18 + Math.sin(t / 90) * 0.08;
        ctx.fillStyle = '#ff4ad2';
        ctx.fillRect(0, ((t / 8) % H), W, 10);
        ctx.fillStyle = '#4affd2';
        ctx.fillRect(((t / 6) % W), 0, 8, H);
        ctx.globalAlpha = 1;
      }
    } else if (L.deco === 'kitchen') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#fff4dc');
      g.addColorStop(0.35, '#f3d9a4');
      g.addColorStop(1, '#d9a45c');
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      fillGroutFloor('#fff6e0', '#f0d090', '#c9a068');
      ctx.fillStyle = '#7a3e1c';
      ctx.fillRect(0, 0, W, 22);
      ctx.fillStyle = 'rgba(255,220,160,.35)';
      ctx.fillRect(0, 0, W, 8);
      const steamY = 28 + Math.sin(t / 400) * 4;
      for (let i = 0; i < 8; i++) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(70 + i * 95, steamY + (i % 3) * 8, 18, 8 + Math.sin(t / 300 + i) * 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const stove = ctx.createRadialGradient(13.5 * CELL, 3.2 * CELL, 8, 13.5 * CELL, 3.2 * CELL, 110);
      stove.addColorStop(0, 'rgba(255, 90, 20, .32)');
      stove.addColorStop(0.45, 'rgba(255, 140, 40, .12)');
      stove.addColorStop(1, 'transparent');
      ctx.fillStyle = stove;
      ctx.fillRect(0, 0, W, H);
      drawWorldIcon('🍳', W - 48, 40, t, 1.05);
      ctx.fillStyle = 'rgba(80, 40, 16, .18)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(90 + i * 150, 36, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(90 + i * 150 - 2, 8, 4, 28);
      }
    } else if (L.deco === 'sauna') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#e8b888');
      g.addColorStop(0.5, '#c4844a');
      g.addColorStop(1, '#8a4e2a');
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.strokeStyle = 'rgba(90, 42, 16, .35)';
      ctx.lineWidth = 3;
      for (let y = 0; y < ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL + CELL * 0.5);
        ctx.lineTo(W, y * CELL + CELL * 0.5);
        ctx.stroke();
      }
      for (let i = 0; i < 16; i++) {
        const sx = ((i * 73 + t / 40) % (W + 40)) - 20;
        const sy = (H * 0.2 + (i * 47) % (H * 0.7)) + Math.sin(t / 500 + i) * 10;
        ctx.globalAlpha = 0.12 + (i % 4) * 0.04;
        ctx.fillStyle = '#fff8ee';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 22 + (i % 5) * 4, 10, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const stoveGlow = ctx.createRadialGradient(13.5 * CELL, 9.5 * CELL, 6, 13.5 * CELL, 9.5 * CELL, 95);
      stoveGlow.addColorStop(0, 'rgba(255, 110, 30, .42)');
      stoveGlow.addColorStop(0.5, 'rgba(255, 60, 10, .16)');
      stoveGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = stoveGlow;
      ctx.fillRect(0, 0, W, H);
      const heat = ctx.createRadialGradient(W / 2, H, 20, W / 2, H, 280);
      heat.addColorStop(0, 'rgba(255, 80, 20, .22)');
      heat.addColorStop(1, 'transparent');
      ctx.fillStyle = heat;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 10; i++) {
        const ex = W * 0.72 + Math.sin(t / 200 + i) * 30;
        const ey = H - 30 - ((t / 20 + i * 40) % 80);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ffb060';
        ctx.beginPath(); ctx.arc(ex, ey, 3 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (L.deco === 'body') {
      const skin = ctx.createLinearGradient(0, 0, W * 0.2, H);
      skin.addColorStop(0, '#f8d4c4');
      skin.addColorStop(0.45, '#f0b8a4');
      skin.addColorStop(1, '#e09888');
      ctx.fillStyle = skin;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = '#e8a898';
      ctx.beginPath();
      ctx.ellipse(W * 0.18, H * 0.22, 70, 78, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W * 0.22, H * 0.28);
      ctx.bezierCurveTo(W * 0.08, H * 0.42, W * 0.05, H * 0.7, W * 0.22, H * 0.92);
      ctx.bezierCurveTo(W * 0.55, H * 1.05, W * 0.95, H * 0.85, W * 1.02, H * 0.55);
      ctx.bezierCurveTo(W * 0.98, H * 0.22, W * 0.7, H * 0.08, W * 0.42, H * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f4c4b4';
      ctx.beginPath(); ctx.ellipse(W * 0.38, H * 0.34, 86, 70, 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(W * 0.62, H * 0.34, 86, 70, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d88888';
      ctx.beginPath(); ctx.arc(W * 0.38, H * 0.36, 14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W * 0.62, H * 0.36, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c07070';
      ctx.beginPath(); ctx.arc(W * 0.5, H * 0.52, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3028';
      ctx.beginPath();
      ctx.ellipse(W * 0.16, H * 0.12, 88, 52, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c8bc';
      ctx.beginPath(); ctx.ellipse(W * 0.2, H * 0.22, 36, 42, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4a2820';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(W * 0.16, H * 0.2, 5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W * 0.24, H * 0.2, 5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.strokeStyle = '#c06070';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W * 0.2, H * 0.28, 8, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,140,.28)';
      ctx.beginPath(); ctx.ellipse(W * 0.14, H * 0.26, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(W * 0.26, H * 0.26, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if ((x + y) % 3) continue;
          ctx.fillStyle = 'rgba(255,255,255,.06)';
          ctx.fillRect(x * CELL + 8, y * CELL + 8, 6, 3);
        }
      }
      const beat = 0.08 + Math.max(0, Math.sin(t / 280)) * 0.16;
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.4, 40, W * 0.5, H * 0.4, 220 + beat * 180);
      glow.addColorStop(0, `rgba(255, 120, 150, ${0.10 + beat})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(200, 70, 90, ${0.12 + beat * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.42, H * 0.48);
      ctx.bezierCurveTo(W * 0.48, H * 0.62, W * 0.52, H * 0.7, W * 0.58, H * 0.78);
      ctx.stroke();
      ctx.strokeStyle = `rgba(180, 70, 90, ${0.10 + beat * 0.16})`;
      ctx.lineWidth = 1.7;
      for (let i = 0; i < 4; i++) {
        const y0 = H * (0.40 + i * 0.085);
        ctx.beginPath();
        ctx.moveTo(W * 0.26, y0);
        ctx.bezierCurveTo(W * 0.40, y0 + 10, W * 0.60, y0 + 10, W * 0.74, y0);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = c1;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = c2;
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++)
          if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }

    // vignette colorée selon l'âme du monde
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.82);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, L.vig || 'rgba(20, 10, 30, .22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = L.aura || 'rgba(255, 90, 120, .8)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8, 8, W - 16, H - 16);
  }

  function drawEmoji(e, x, y, size) {
    ctx.save();
    ctx.font = `${Math.round(size)}px "Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e, x, y + size * 0.06);
    ctx.restore();
  }

  function drawNameTag(text, x, y) {
    if (!text) return;
    ctx.save();
    ctx.font = '800 13px Fredoka, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(10, 4, 22, .9)';
    ctx.fillStyle = '#fffef4';
    const tx = Math.max(28, Math.min(COLS * CELL - 28, x));
    const ty = Math.max(4, Math.min(ROWS * CELL - 18, y));
    ctx.strokeText(text, tx, ty);
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  function decoAura() {
    const d = S.level && S.level.deco;
    return ({
      bathroom: 'rgba(110, 210, 230, .55)',
      beach: 'rgba(255, 196, 70, .5)',
      club: 'rgba(255, 90, 190, .5)',
      dungeon: 'rgba(255, 140, 50, .48)',
      space: 'rgba(150, 120, 255, .5)',
      kitchen: 'rgba(255, 176, 60, .48)',
      sauna: 'rgba(255, 120, 40, .48)',
      chaos: 'rgba(255, 80, 220, .52)',
      body: 'rgba(255, 120, 160, .5)',
    })[d] || 'rgba(255,255,255,.4)';
  }

  function drawWorldIcon(e, cx, cy, t, scale) {
    const sc = scale || 1;
    const bob = Math.sin(t / 340 + cx * 0.03 + cy * 0.02) * 1.6;
    const y = cy + bob;
    const r = CELL * 0.4 * sc;
    ctx.save();
    drawBlobShadow(cx, cy, r);
    const glow = ctx.createRadialGradient(cx, y, 2, cx, y, r * 1.55);
    glow.addColorStop(0, decoAura());
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, y, r * 1.55, 0, Math.PI * 2);
    ctx.fill();
    drawPropArt(e, cx, y, CELL * 0.82 * sc, t);
    ctx.restore();
  }

  function drawPickupIcon(e, cx, cy, t, glow, scale) {
    const pulse = 1 + Math.sin(t / 160) * 0.1;
    const bob = Math.sin(t / 180) * 3;
    const y = cy + bob;
    const sc = (scale || 1) * pulse;
    const r = CELL * 0.38 * sc;
    ctx.save();
    drawBlobShadow(cx, cy, r);
    const halo = ctx.createRadialGradient(cx, y, 1, cx, y, r * 2.1);
    halo.addColorStop(0, glow);
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, y, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    drawSphere(cx, y + 6, r * 0.72, '#fff6e8', { shadow: false, rim: true });
    drawPropArt(e, cx, y - 4, CELL * 0.78 * sc, t);
    drawSparkle(cx + r * 0.85, y - r * 0.7, t, cx);
    ctx.restore();
  }

  function parseRgb(c) {
    if (!c || c[0] !== '#') return null;
    let h = c.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lift(c, amt) {
    const rgb = parseRgb(c);
    if (!rgb) return amt > 0 ? 'rgba(255,255,255,.55)' : 'rgba(20,8,28,.45)';
    const t = amt > 0 ? 255 : 0;
    const p = Math.min(1, Math.abs(amt));
    return `rgb(${Math.round(rgb[0] + (t - rgb[0]) * p)},${Math.round(rgb[1] + (t - rgb[1]) * p)},${Math.round(rgb[2] + (t - rgb[2]) * p)})`;
  }
  function drawBlobShadow(cx, cy, r) {
    ctx.save();
    ctx.fillStyle = 'rgba(12, 4, 22, .38)';
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + r * 0.86, r * 0.92, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawSphere(cx, cy, r, color, opts) {
    const shadow = !opts || opts.shadow !== false;
    if (shadow) drawBlobShadow(cx, cy, r);
    if (!opts || opts.ink !== false) {
      ctx.fillStyle = '#241428';
      ctx.beginPath();
      ctx.arc(cx, cy + 0.6, r + 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.46, r * 0.04, cx + r * 0.18, cy + r * 0.22, r * 1.12);
    g.addColorStop(0, lift(color, 0.82));
    g.addColorStop(0.28, lift(color, 0.22));
    g.addColorStop(0.62, color);
    g.addColorStop(1, lift(color, -0.58));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.34, r * 0.2, -0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.18, cy + r * 0.22, r * 0.42, r * 0.18, 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (opts && opts.rim) {
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function resamplePath(pts, spacing) {
    if (!pts.length) return [];
    if (pts.length === 1) return [{ x: pts[0].x, y: pts[0].y }];
    const out = [{ x: pts[0].x, y: pts[0].y }];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let x0 = pts[i - 1].x, y0 = pts[i - 1].y;
      const x1 = pts[i].x, y1 = pts[i].y;
      let dx = x1 - x0, dy = y1 - y0;
      let dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;
      const ux = dx / dist, uy = dy / dist;
      while (acc + dist >= spacing) {
        const take = spacing - acc;
        x0 += ux * take;
        y0 += uy * take;
        out.push({ x: x0, y: y0 });
        dist -= take;
        acc = 0;
      }
      acc += dist;
    }
    const last = pts[pts.length - 1];
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(last.x - prev.x, last.y - prev.y) > 1) out.push({ x: last.x, y: last.y });
    return out;
  }
  function drawGummyBody(pts, width, colorOrFn) {
    if (!pts.length) return;
    const r = width * 0.5;
    const beads = resamplePath(pts, Math.max(5.5, r * 0.72));
    ctx.save();
    for (const p of beads) {
      ctx.fillStyle = 'rgba(12, 4, 22, .32)';
      ctx.beginPath();
      ctx.ellipse(p.x + 3, p.y + 8, r * 0.95, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of beads) {
      ctx.fillStyle = '#241428';
      ctx.beginPath();
      ctx.arc(p.x, p.y + 0.8, r + 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = beads.length - 1; i >= 0; i--) {
      const c = typeof colorOrFn === 'function' ? colorOrFn(i, beads.length) : colorOrFn;
      drawSphere(beads[i].x, beads[i].y, r, c, { shadow: false, rim: true, ink: false });
    }
    ctx.restore();
  }
  function drawTube3d(pts, width, color) {
    drawGummyBody(pts, width, color);
  }
  function fillGroutFloor(light, dark, grout, startRow) {
    const W = COLS * CELL, H = ROWS * CELL;
    const y0 = startRow || 0;
    ctx.fillStyle = grout;
    ctx.fillRect(0, y0 * CELL, W, H - y0 * CELL);
    const inset = 2.5;
    for (let y = y0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const even = (x + y) % 2 === 0;
        const col = even ? light : dark;
        const px = x * CELL + inset, py = y * CELL + inset;
        const s = CELL - inset * 2;
        const g = ctx.createLinearGradient(px, py, px + s, py + s);
        g.addColorStop(0, lift(col, 0.32));
        g.addColorStop(0.5, col);
        g.addColorStop(1, lift(col, -0.16));
        ctx.fillStyle = g;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, s, s, 5);
        else ctx.rect(px, py, s, s);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.28)';
        ctx.fillRect(px + 3, py + 3, s * 0.42, 2.6);
      }
    }
  }
  function drawSparkle(cx, cy, t, seed) {
    const spin = t / 180 + seed;
    const s = 3.2 + Math.sin(t / 140 + seed) * 1.4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.moveTo(0, -s * 2);
    ctx.quadraticCurveTo(0.6, -0.6, s * 1.4, 0);
    ctx.quadraticCurveTo(0.6, 0.6, 0, s * 2);
    ctx.quadraticCurveTo(-0.6, 0.6, -s * 1.4, 0);
    ctx.quadraticCurveTo(-0.6, -0.6, 0, -s * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawBlock(x, y, top, mid, dark) {
    const p = 3.2, depth = 5;
    const x0 = x + p, y0 = y + p, s = CELL - p * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 4, 22, .35)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0 + 3, y0 + 6, s, s, 6);
    else ctx.rect(x0 + 3, y0 + 6, s, s);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0 + depth, s, s - 1, 6);
    else ctx.rect(x0, y0 + depth, s, s - 1);
    ctx.fill();
    const g = ctx.createLinearGradient(x0, y0, x0 + s, y0 + s);
    g.addColorStop(0, lift(top, 0.18));
    g.addColorStop(0.45, mid);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, s, s - depth, 7);
    else ctx.rect(x0, y0, s, s - depth);
    ctx.fill();
    ctx.strokeStyle = '#241428';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, s, s, 7);
    else ctx.rect(x0, y0, s, s);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 7, y0 + 6);
    ctx.lineTo(x0 + s - 8, y0 + 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawPropArt(e, cx, cy, size, t) {
    const s = size * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    if (e === '🧼') {
      drawSphere(0, 2, s * 0.78, '#9ad7ff', { shadow: false, rim: true });
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.ellipse(-s * 0.18, -s * 0.12, s * 0.38, s * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (e === '🍌') {
      ctx.rotate(-0.5);
      ctx.fillStyle = '#241428';
      ctx.beginPath(); ctx.ellipse(0, 2, s * 0.42, s * 1.05, 0.35, 0, Math.PI * 2); ctx.fill();
      const ban = ctx.createLinearGradient(-s, -s, s, s);
      ban.addColorStop(0, '#fff38a');
      ban.addColorStop(0.45, '#ffe135');
      ban.addColorStop(1, '#d4a000');
      ctx.fillStyle = ban;
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.36, s * 0.95, 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a12';
      ctx.beginPath(); ctx.arc(0, -s * 0.88, s * 0.16, 0, Math.PI * 2); ctx.fill();
    } else if (e === '🍯') {
      drawSphere(0, 4, s * 0.7, '#f0b020', { shadow: false });
      ctx.fillStyle = '#c47a10';
      ctx.beginPath(); ctx.ellipse(0, -s * 0.15, s * 0.62, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe56a';
      ctx.beginPath(); ctx.ellipse(0, -s * 0.22, s * 0.42, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    } else if (e === '💊') {
      ctx.rotate(-0.4);
      ctx.fillStyle = '#241428';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-s * 0.85, -s * 0.38, s * 1.7, s * 0.76, s * 0.38);
      ctx.fill();
      ctx.fillStyle = '#ff5a7a';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-s * 0.8, -s * 0.32, s * 0.8, s * 0.64, s * 0.32);
      ctx.fill();
      ctx.fillStyle = '#f4f7ff';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, -s * 0.32, s * 0.8, s * 0.64, s * 0.32);
      ctx.fill();
    } else if (e === '🌶️') {
      ctx.fillStyle = '#241428';
      ctx.beginPath(); ctx.ellipse(2, 4, s * 0.48, s * 0.92, 0.4, 0, Math.PI * 2); ctx.fill();
      const chili = ctx.createLinearGradient(-s, -s, s, s);
      chili.addColorStop(0, '#ff8a6a');
      chili.addColorStop(1, '#c01428');
      ctx.fillStyle = chili;
      ctx.beginPath(); ctx.ellipse(0, 2, s * 0.4, s * 0.82, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d8a28';
      ctx.beginPath(); ctx.ellipse(-s * 0.05, -s * 0.7, s * 0.28, s * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
    } else if (e === '💎') {
      ctx.fillStyle = '#241428';
      ctx.beginPath();
      ctx.moveTo(0, s); ctx.lineTo(-s * 0.85, 0); ctx.lineTo(-s * 0.4, -s * 0.7); ctx.lineTo(s * 0.4, -s * 0.7); ctx.lineTo(s * 0.85, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7af0ff';
      ctx.beginPath();
      ctx.moveTo(0, s * 0.86); ctx.lineTo(-s * 0.72, 0); ctx.lineTo(0, -s * 0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d6fbff';
      ctx.beginPath();
      ctx.moveTo(0, s * 0.86); ctx.lineTo(s * 0.72, 0); ctx.lineTo(0, -s * 0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-s * 0.32, -s * 0.58); ctx.lineTo(s * 0.32, -s * 0.58); ctx.lineTo(0, -s * 0.12); ctx.closePath(); ctx.fill();
    } else if (e === '🍹' || e === '🍸') {
      ctx.fillStyle = '#241428';
      ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.35); ctx.lineTo(s * 0.55, -s * 0.35); ctx.lineTo(s * 0.12, s * 0.35); ctx.lineTo(-s * 0.12, s * 0.35); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff6fa5';
      ctx.beginPath(); ctx.moveTo(-s * 0.48, -s * 0.3); ctx.lineTo(s * 0.48, -s * 0.3); ctx.lineTo(s * 0.1, s * 0.22); ctx.lineTo(-s * 0.1, s * 0.22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff8e8';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, s * 0.22); ctx.lineTo(0, s * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, s * 0.78, s * 0.28, s * 0.08, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (e === '🦆') {
      drawSphere(-s * 0.1, s * 0.15, s * 0.55, '#ffd93d', { shadow: false });
      drawSphere(s * 0.35, -s * 0.28, s * 0.32, '#ffe56a', { shadow: false, ink: false });
      ctx.fillStyle = '#ff7a2a';
      ctx.beginPath(); ctx.ellipse(s * 0.62, -s * 0.22, s * 0.22, s * 0.1, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#241428';
      ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.36, s * 0.07, 0, Math.PI * 2); ctx.fill();
    } else {
      drawEmoji(e, 0, 0, size);
    }
    ctx.restore();
  }

  function drawObstacles(t) {
    const walls = [], props = [], viruses = [], packs = [];
    for (const o of S.obstacles) {
      if (o.virus !== undefined) viruses.push(o);
      else if (o.wall) walls.push(o);
      else if (isCombatPack(o)) packs.push(o);
      else props.push(o);
    }
    for (const o of walls) drawWall(o, t);
    for (const o of packs) {
      const def = COMBAT_PACKS[o.pack] || COMBAT_PACKS.ammo;
      const glow = o.pack === 'star' ? 'rgba(255, 230, 80, .95)'
        : o.pack === 'shield' ? 'rgba(120, 210, 255, .92)'
        : o.pack === 'puchita' ? 'rgba(255, 120, 180, .92)'
        : o.pack === 'antigrav' ? 'rgba(140, 200, 255, .92)'
        : o.pack === 'pump' ? 'rgba(255, 180, 80, .92)'
        : 'rgba(160, 240, 255, .92)';
      drawPickupIcon(def.emoji, (o.x + 0.5) * CELL, (o.y + 0.5) * CELL, t, glow, 0.94);
      drawNameTag(def.short || def.name, (o.x + 0.5) * CELL, (o.y + 0.5) * CELL + CELL * 0.46);
    }
    for (const o of props) {
      drawPickupIcon(o.e, (o.x + 0.5) * CELL, (o.y + 0.5) * CELL, t, decoAura(), 0.88);
    }
    for (const o of viruses) {
      const wob = Math.sin(t / 300 + o.x * 1.7 + o.y) * 2;
      drawMeanPuchita((o.x + 0.5) * CELL, (o.y + 0.5) * CELL + wob, o.virus, t, !!o.move);
    }
  }

  function roundCell(x, y, r) {
    const p = CELL * 0.12;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x + p, y + p, CELL - p * 2, CELL - p * 2, r || 6);
    else ctx.rect(x + p, y + p, CELL - p * 2, CELL - p * 2);
  }

  function drawWall(o, t) {
    const x = o.x * CELL, y = o.y * CELL;
    const cx = x + CELL / 2, cy = y + CELL / 2;
    ctx.save();
    if (o.wall === 'tile') {
      drawBlock(x, y, '#ffffff', '#d7eef6', '#8fb4c4');
    } else if (o.wall === 'wood') {
      drawBlock(x, y, '#d49a5c', '#8b5a2b', '#4a280e');
      drawSphere(cx, y + 8, 6.5, '#4c9a3a', { shadow: false });
    } else if (o.wall === 'rock') {
      drawSphere(cx + 1, cy + 1, CELL * 0.42, '#b9a78a');
      drawSphere(cx - 6, cy + 5, CELL * 0.2, '#9a8a72', { shadow: false, ink: false });
    } else if (o.wall === 'neon') {
      const hue = (t / 18 + o.x * 20 + o.y * 15) % 360;
      ctx.shadowColor = `hsl(${hue}, 90%, 60%)`;
      ctx.shadowBlur = 18;
      drawBlock(x, y, `hsl(${hue}, 90%, 72%)`, `hsl(${hue}, 85%, 52%)`, `hsl(${hue}, 80%, 32%)`);
      ctx.shadowBlur = 0;
    } else if (o.wall === 'brick') {
      drawBlock(x, y, '#e09078', '#a45c48', '#5a2c22');
      ctx.strokeStyle = 'rgba(40, 16, 12, .35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + CELL * 0.5);
      ctx.lineTo(x + CELL - 6, y + CELL * 0.5);
      ctx.stroke();
    } else if (o.wall === 'asteroid') {
      drawSphere(cx, cy, CELL * 0.42, '#8a8494');
      ctx.fillStyle = 'rgba(40,36,50,.35)';
      ctx.beginPath(); ctx.arc(cx - 5, cy - 3, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, cy + 4, 3.6, 0, Math.PI * 2); ctx.fill();
    } else if (o.wall === 'glitch') {
      const hue = (t / 8 + o.x * 40) % 360;
      drawBlock(x, y, `hsl(${hue}, 85%, 62%)`, `hsl(${hue}, 80%, 48%)`, '#241428');
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.4 + Math.sin(t / 80 + o.y) * 0.2;
      ctx.fillRect(x + 7, y + 11, CELL - 14, 4);
    } else if (o.wall === 'flesh') {
      const beat = 1 + Math.max(0, Math.sin(t / 280 + o.x * 0.45 + o.y * 0.3)) * 0.14;
      drawSphere(cx + 1, cy + 2, CELL * 0.46 * beat, '#c06078', { shadow: true });
      drawSphere(cx, cy, CELL * 0.43 * beat, '#e87890', { rim: true, shadow: false });
      drawSphere(cx - 6, cy - 5, 6.5 * beat, '#f4b0bc', { shadow: false, ink: false });
      ctx.fillStyle = `rgba(255, 160, 180, ${0.18 + beat * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(cx + 4, cy + 7, 7 * beat, 4 * beat, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const MEAN_PUCHITA = [
    { body: '#e45a86', dark: '#a32e58', blush: 'rgba(255, 80, 80, .45)' },
    { body: '#b44cff', dark: '#6e1ea8', blush: 'rgba(180, 60, 255, .4)' },
    { body: '#6ecb3a', dark: '#2f7a18', blush: 'rgba(160, 255, 80, .45)' },
  ];

  function drawPuchitaFigure(cx, cy, t, opts) {
    const angry = !!opts.angry;
    const pal = opts.pal;
    const sc = opts.scale || 1;
    const pulse = 1 + Math.sin(t / 170 + (opts.phase || 0)) * (angry ? 0.07 : 0.04);
    const rx = CELL * 0.38 * pulse * sc;
    const ry = CELL * 0.42 * pulse * sc;

    ctx.save();
    if (opts.glow) {
      ctx.shadowColor = pal.body;
      ctx.shadowBlur = opts.glow;
    }

    if (angry) {
      ctx.strokeStyle = pal.dark;
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        const drift = ((t / 18 + i * 25) % 40);
        ctx.globalAlpha = 0.55 * (1 - drift / 40);
        ctx.lineWidth = 2.6 * sc;
        ctx.beginPath();
        ctx.moveTo(cx + i * 8 * sc, cy - ry - 2 - drift * 0.25);
        ctx.quadraticCurveTo(cx + i * 8 * sc + 4 * sc, cy - ry - 10 * sc - drift * 0.25, cx + i * 8 * sc, cy - ry - 16 * sc - drift * 0.25);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      for (let i = 0; i < 3; i++) {
        drawSparkle(cx + (i - 1) * rx * 0.85, cy - ry * 1.35 - Math.sin(t / 200 + i) * 3, t, i * 2 + cx);
      }
    }

    drawBlobShadow(cx, cy, rx * 1.25);

    for (const side of [-1, 1]) {
      ctx.fillStyle = '#241428';
      ctx.beginPath();
      ctx.ellipse(cx + side * rx * 1.05, cy + ry * 0.22, rx * 0.28, ry * 0.18, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.body;
      ctx.beginPath();
      ctx.ellipse(cx + side * rx * 1.02, cy + ry * 0.2, rx * 0.22, ry * 0.14, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#241428';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.28, ry * 1.28, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * rx * 0.42, cy - ry * 1.12, rx * (side === 0 ? 0.42 : 0.3), ry * 0.32, side * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    const bodyG = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.42, rx * 0.08, cx, cy + ry * 0.1, rx * 1.5);
    bodyG.addColorStop(0, lift(pal.body, 0.62));
    bodyG.addColorStop(0.45, pal.body);
    bodyG.addColorStop(1, pal.dark);
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.18, ry * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.ellipse(cx, cy - ry * 1.02, rx * 0.36, ry * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.4, cy - ry * 0.95, rx * 0.26, ry * 0.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + rx * 0.4, cy - ry * 0.95, rx * 0.26, ry * 0.2, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.3, cy - ry * 0.42, rx * 0.4, ry * 0.22, -0.45, 0, Math.PI * 2);
    ctx.fill();

    for (const side of [-1, 1]) {
      const ex = cx + side * rx * 0.42;
      const ey = cy - ry * 0.14;
      ctx.fillStyle = '#241428';
      ctx.beginPath(); ctx.ellipse(ex, ey, rx * 0.36, ry * 0.34, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex, ey, rx * 0.30, ry * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a1a2a';
      ctx.beginPath();
      ctx.arc(ex + (angry ? side * 1.4 : 1.2), ey + (angry ? 1.6 : 0.4), rx * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(ex - 2.4, ey - 2.6, rx * 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a1a2a';
      ctx.lineWidth = (angry ? 3 : 2) * sc;
      ctx.beginPath();
      if (angry) {
        ctx.moveTo(ex - side * rx * 0.3, ey - ry * 0.42);
        ctx.lineTo(ex + side * rx * 0.22, ey - ry * 0.12);
      } else {
        ctx.moveTo(ex - rx * 0.2, ey - ry * 0.34);
        ctx.quadraticCurveTo(ex, ey - ry * 0.46, ex + rx * 0.2, ey - ry * 0.34);
      }
      ctx.stroke();
    }

    ctx.fillStyle = pal.blush;
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.62, cy + ry * 0.16, 6.2 * sc, 3.6 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + rx * 0.62, cy + ry * 0.16, 6.2 * sc, 3.6 * sc, 0, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#2a1a2a';
    ctx.lineWidth = 2.4 * sc;
    ctx.beginPath();
    if (angry) {
      ctx.moveTo(cx - rx * 0.3, cy + ry * 0.44);
      ctx.lineTo(cx - rx * 0.08, cy + ry * 0.28);
      ctx.lineTo(cx + rx * 0.08, cy + ry * 0.44);
      ctx.lineTo(cx + rx * 0.3, cy + ry * 0.28);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#2a1a2a';
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.32, rx * 0.32, ry * 0.22, 0, 0, Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff7a9a';
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.4, rx * 0.16, ry * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMeanPuchita(cx, cy, variant, t, mobile) {
    const pal = MEAN_PUCHITA[variant] || MEAN_PUCHITA[0];
    drawPuchitaFigure(cx, cy, t, {
      angry: true,
      pal,
      phase: variant * 2 + (mobile ? t / 400 : 0),
      glow: mobile ? 16 : 10,
      scale: 1.46,
    });
    const short = ['Furax', 'Jalouse', 'Toxique'][variant] || 'Furax';
    drawNameTag(short, cx, cy + CELL * 0.52);
  }

  function drawPuchita(t) {
    const p = S.puchita;
    const hello = p.phase === 'hello';
    const cx = (p.x + 0.5) * CELL;
    const cy = (p.y + 0.5) * CELL + Math.sin(t / 180) * 2;
    const scale = hello ? 1.35 + Math.sin(t / 140) * 0.08 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    drawPuchitaFigure(cx, cy, t, {
      angry: false,
      pal: { body: '#ff9ec4', dark: '#d46a94', blush: 'rgba(255, 90, 140, .4)' },
      glow: hello ? 26 : 16,
    });
    ctx.restore();
    drawEmoji('💕', cx, cy - CELL * (hello ? 1.05 : 0.78), hello ? 18 : 14);
    if (hello) {
      const bx = cx;
      const by = cy - CELL * 1.45;
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#d14a7a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const bw = 78, bh = 28;
      if (ctx.roundRect) ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 10);
      else ctx.rect(bx - bw / 2, by - bh / 2, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 6, by + bh / 2);
      ctx.lineTo(bx, by + bh / 2 + 8);
      ctx.lineTo(bx + 6, by + bh / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d14a7a';
      ctx.font = '800 14px Fredoka, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff';
      ctx.strokeText('hello boys', bx, by);
      ctx.fillText('hello boys', bx, by);
      ctx.restore();
    }
  }

  function drawShots(t) {
    for (const s of S.shots) {
      const ang = Math.atan2(s.dir.y, s.dir.x);
      const x = (s.x + 0.5) * CELL, y = (s.y + 0.5) * CELL;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255, 244, 180, .35)';
      ctx.beginPath();
      ctx.ellipse(-10, 0, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSphere(0, 0, CELL * 0.22, '#fff4c8', { shadow: false, rim: true });
      ctx.restore();
    }
  }

  function drawFood(t) {
    const f = S.food;
    if (!f) return;
    const kind = f.kind || GROW_ITEMS[0];
    const grow = kind.grow || 1;
    const glow = grow >= 3 ? 'rgba(90, 220, 255, .85)' : grow >= 2 ? 'rgba(255, 140, 210, .8)' : 'rgba(255, 217, 61, .85)';
    drawPickupIcon(foodEmoji(f), (f.x + 0.5) * CELL, (f.y + 0.5) * CELL, t, glow, grow >= 3 ? 0.95 : grow >= 2 ? 0.88 : 0.82);
    drawNameTag(`+${grow} cm`, (f.x + 0.5) * CELL, (f.y + 0.5) * CELL + CELL * 0.44);
  }

  function drawBonus(t) {
    const remaining = S.bonusLife - now();
    if (remaining < 2000 && Math.floor(t / 130) % 2 === 0) return;
    const b = S.bonus;
    drawPickupIcon(b.type.emoji, (b.x + 0.5) * CELL, (b.y + 0.5) * CELL, t, 'rgba(255,255,255,.9)', 0.86);
    drawNameTag(b.type.label || 'Bonus', (b.x + 0.5) * CELL, (b.y + 0.5) * CELL + CELL * 0.44);
  }

  function drawGoldHeart(t) {
    const h = S.goldHeart;
    const cx = (h.x + 0.5) * CELL;
    const cy = (h.y + 0.5) * CELL + Math.sin(t / 180) * 3.5;
    const pulse = 1 + Math.sin(t / 140) * 0.12;
    const s = CELL * 0.42 * pulse;
    ctx.save();
    const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, s * 2.4);
    halo.addColorStop(0, 'rgba(255, 214, 70, .85)');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(18, 8, 28, .28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.85, s * 0.7, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
    g.addColorStop(0, '#fff6b0');
    g.addColorStop(0.35, '#ffd24a');
    g.addColorStop(1, '#c48410');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.55);
    ctx.bezierCurveTo(cx - s * 1.05, cy + s * 0.05, cx - s * 0.95, cy - s * 0.7, cx, cy - s * 0.18);
    ctx.bezierCurveTo(cx + s * 0.95, cy - s * 0.7, cx + s * 1.05, cy + s * 0.05, cx, cy + s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.22, cy - s * 0.12, s * 0.18, s * 0.1, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawNameTag('Vie', cx, cy + CELL * 0.46);
  }

  function drawCapote(t) {
    const remaining = S.capoteLife - now();
    if (remaining < 2500 && Math.floor(t / 130) % 2 === 0) return; // clignote avant péremption
    const p = S.capote;
    const cx = (p.x + 0.5) * CELL;
    const cy = (p.y + 0.5) * CELL + Math.sin(t / 220) * 3;
    const w = CELL * 0.28, h = CELL * 0.42;
    ctx.save();
    ctx.shadowColor = '#8fd8ff';
    ctx.shadowBlur = 18;
    // halo pour qu'on la voie de loin
    ctx.fillStyle = 'rgba(140, 220, 255, .22)';
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.55, 0, Math.PI * 2);
    ctx.fill();
    const capG = ctx.createRadialGradient(cx - 5, cy - 8, 2, cx, cy, CELL * 0.5);
    capG.addColorStop(0, 'rgba(255,255,255,.85)');
    capG.addColorStop(0.45, 'rgba(210, 242, 255, .88)');
    capG.addColorStop(1, 'rgba(80, 170, 210, .75)');
    ctx.fillStyle = capG;
    ctx.strokeStyle = '#4bb8e8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - w, cy + h);
    ctx.lineTo(cx - w, cy - h * 0.28);
    ctx.arc(cx, cy - h * 0.28, w, Math.PI, 0);
    ctx.lineTo(cx + w, cy + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // réservoir
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.28 - w - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // anneau roulé à la base
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(cx, cy + h, w * 1.35, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    // reflet
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.45, cy + h * 0.4);
    ctx.lineTo(cx - w * 0.45, cy - h * 0.2);
    ctx.stroke();
    ctx.restore();
    drawNameTag('Capote', cx, cy + CELL * 0.5);
  }

  /* ---- rivaux / boss : zigouigouis menaçants ---- */

  function drawBallHalo(bx, by, r, t) {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(t / 140));
    ctx.fillStyle = `rgba(255, 220, 70, ${0.35 + pulse * 0.35})`;
    ctx.beginPath();
    ctx.arc(bx, by, r * 1.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemyPenis(r, t) {
    const alpha = Math.min(1, r.acc / r.interval);
    const pts = r.body.map((p, i) => {
      const prev = r.prev[i] || p;
      const jump = Math.abs(prev.x - p.x) > 2 || Math.abs(prev.y - p.y) > 2;
      const px = jump ? p.x : lerp(prev.x, p.x, alpha);
      const py = jump ? p.y : lerp(prev.y, p.y, alpha);
      const wig = Math.sin(t / 90 + i * 0.8) * Math.min(i, 5) * 0.4;
      return { x: (px + 0.5) * CELL, y: (py + 0.5) * CELL + wig };
    });
    const head = pts[0];
    const neck = pts[1] || head;
    const dirX = head.x - neck.x || r.dir.x;
    const dirY = head.y - neck.y || r.dir.y;
    const mag = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / mag, uy = dirY / mag;
    const skin = r.skin;
    const g = r.isBoss ? 1.42 : 1.16;
    const nPts = pts.length;
    const headR = CELL * 0.48 * g;

    ctx.save();
    if (r.isBoss) {
      ctx.shadowColor = '#ff3a5a';
      ctx.shadowBlur = 18;
    }

    const tail = pts[nPts - 1];
    const beforeTail = pts[nPts - 2] || tail;
    let tx = tail.x - beforeTail.x, ty = tail.y - beforeTail.y;
    const tmag = Math.hypot(tx, ty) || 1;
    tx /= tmag; ty /= tmag;
    const qx = -ty, qy = tx;
    const sackR = CELL * (r.isBoss ? 0.48 : 0.40) * g;
    const sackColor = now() < (r.iFrames || 0) ? '#fff3a0' : shadeColor(skin.body, 0.58);
    for (const side of [-1, 1]) {
      const bx = tail.x + tx * sackR * 0.55 + qx * side * sackR * 0.82;
      const by = tail.y + ty * sackR * 0.55 + qy * side * sackR * 0.82;
      drawBallHalo(bx, by, sackR * 1.08, t);
      drawSphere(bx, by, sackR * 0.95, sackColor, { rim: true });
    }

    drawTaperedShaft(pts, g, skin.body || '#c45c4a', 'rgba(255, 255, 255, .28)');

    const glans = {
      x: head.x + ux * headR * 0.38,
      y: head.y + uy * headR * 0.38,
    };
    drawSphere(glans.x + ux * 2, glans.y + uy * 2, headR * 0.92, skin.tip, { shadow: false });
    drawSphere(glans.x - ux * 1.5, glans.y - uy * 1.5, headR * 0.86, skin.head, { rim: true, shadow: false });
    ctx.restore();

    if (r.isBoss && S.bossDef) {
      drawEmoji(S.bossDef.emoji, head.x - ux * headR * 1.6, head.y - uy * headR * 1.6 - 10, 22);
    }
    drawFace(glans, ux, uy, headR * 0.9, t, false, true, true);
    drawNameTag(r.name, head.x, head.y - headR - 10);
  }

  /* ---- le zigouigoui lui-même ---- */

  function skinColors(seg, total, t) {
    const skin = SKINS.find(s => s.id === Save.data.skin) || SKINS[0];
    if (skin.detail === 'rainbow') {
      const h = (seg * 24 - t / 6) % 360;
      return { body: `hsl(${h}, 90%, 65%)`, head: `hsl(${(t / 6) % 360}, 90%, 68%)`, tip: `hsl(${(t / 6 + 30) % 360}, 90%, 55%)`, detail: null };
    }
    if (skin.detail === 'flag' && skin.stripes && skin.stripes.length) {
      const c = skin.stripes[seg % skin.stripes.length];
      return { body: c, head: skin.head, tip: skin.tip, detail: 'flag' };
    }
    return skin;
  }

  function drawSnake(t) {
    const alpha = Math.min(1, S.acc / S.stepInterval);
    const invincible = hasEffect('invincible');
    const skin = SKINS.find(s => s.id === Save.data.skin) || SKINS[0];

    // positions interpolées (en pixels)
    const pts = S.snake.map((p, i) => {
      const prev = S.prevSnake[i] || p;
      // pas d'interpolation à travers le wrap (mode invincible)
      const jump = Math.abs(prev.x - p.x) > 2 || Math.abs(prev.y - p.y) > 2;
      const px = jump ? p.x : lerp(prev.x, p.x, alpha);
      const py = jump ? p.y : lerp(prev.y, p.y, alpha);
      // frétillement exagéré (nul à la tête)
      const wig = Math.sin(t / 120 + i * 0.9) * i * 0.35;
      return { x: (px + 0.5) * CELL, y: (py + 0.5) * CELL + Math.min(wig, 4) };
    });

    const head = pts[0];
    const neck = pts[1] || head;
    const dirX = head.x - neck.x || S.dir.x;
    const dirY = head.y - neck.y || S.dir.y;
    const mag = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / mag, uy = dirY / mag;

    if (invincible) {
      ctx.save();
      ctx.shadowColor = '#ffd93d';
      ctx.shadowBlur = 24;
    }

    drawPlayerBody(pts, head, ux, uy, t, skin, invincible);
    if (invincible) ctx.restore();
  }

  function shadeColor(c, f) {
    if (!c) return c;
    if (c.startsWith('hsl')) {
      return c.replace(/(\d+(?:\.\d+)?)%\s*\)/, (_, l) => `${Math.max(8, parseFloat(l) * f)}%)`);
    }
    if (c[0] !== '#') return c;
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const n = parseInt(h, 16);
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return `rgb(${r},${g},${b})`;
  }

  function shaftRadius(u, g) {
    const tip = CELL * 0.30 * g;
    const base = CELL * 0.48 * g;
    const t = u * u;
    return tip + (base - tip) * t;
  }

  function drawTaperedShaft(pts, g, colorOrFn, highlight) {
    const beads = resamplePath(pts, 4);
    const n = beads.length;
    if (n < 2) return { beads, rAt: () => CELL * 0.4 * g, n: 0 };
    const rAt = i => shaftRadius(i / (n - 1), g);
    const col = (i) => (typeof colorOrFn === 'function' ? colorOrFn(i / Math.max(1, n - 1)) : colorOrFn);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const strokePairs = (styleOrFn, extra, ox, oy) => {
      for (let i = 0; i < n - 1; i++) {
        ctx.strokeStyle = typeof styleOrFn === 'function' ? styleOrFn(i) : styleOrFn;
        ctx.lineWidth = rAt(i) * 2 + extra;
        ctx.beginPath();
        ctx.moveTo(beads[i].x + ox, beads[i].y + oy);
        ctx.lineTo(beads[i + 1].x + ox, beads[i + 1].y + oy);
        ctx.stroke();
      }
    };
    strokePairs('rgba(12, 4, 22, .28)', 2, 1.6, 3.2);
    strokePairs('#241428', 4.4, 0, 0);
    strokePairs(col, 0, 0, 0);
    ctx.strokeStyle = highlight || 'rgba(255, 255, 255, .32)';
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = beads[Math.max(0, i - 1)];
      const b = beads[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const m = Math.hypot(dx, dy) || 1;
      const r = rAt(i) * 0.32;
      const x = beads[i].x - (dy / m) * r - 1;
      const y = beads[i].y + (dx / m) * r - 1.8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    return { beads, rAt, n };
  }

  function drawVeinNet(pts, t) {
    if (pts.length < 4) return;
    const tanAt = i => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const m = Math.hypot(dx, dy) || 1;
      return { ux: dx / m, uy: dy / m, px: -dy / m, py: dx / m };
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const dorsal = [];
    for (let i = 1; i < pts.length - 1; i++) {
      const { px, py } = tanAt(i);
      const wob = Math.sin(i * 0.72 + t / 420) * 1.35;
      dorsal.push({ x: pts[i].x + px * wob, y: pts[i].y + py * wob });
    }
    ctx.strokeStyle = 'rgba(150, 48, 78, .55)';
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    dorsal.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(62, 88, 168, .38)';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    for (let i = 2; i < pts.length - 2; i++) {
      const { px, py } = tanAt(i);
      const wob = 2.1 + Math.sin(i * 1.05 + t / 510) * 1.5;
      const x = pts[i].x + px * wob, y = pts[i].y + py * wob;
      if (i === 2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(148, 58, 92, .38)';
    ctx.lineWidth = 0.9;
    for (let i = 5; i < pts.length - 5; i += 5) {
      const { ux, uy, px, py } = tanAt(i);
      const side = (i % 4 === 3) ? 1 : -1;
      const len = 3.8 + (i % 3) * 1.1;
      ctx.beginPath();
      ctx.moveTo(pts[i].x + px * Math.sin(i * 0.7) * 0.8, pts[i].y + py * Math.sin(i * 0.7) * 0.8);
      ctx.quadraticCurveTo(
        pts[i].x + px * side * 2.4 + ux * 1.6,
        pts[i].y + py * side * 2.4 + uy * 1.6,
        pts[i].x + px * side * len + ux * 3.2,
        pts[i].y + py * side * len + uy * 3.2
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerBody(pts, head, ux, uy, t, skin, invincible) {
    const g = Math.max(1.18, playerGirth());
    const nPts = pts.length;
    const hc = skinColors(0, nPts, t);
    const tailCol = skinColors(nPts - 1, nPts, t);
    const highlight = skin.detail === 'realistic'
      ? 'rgba(255, 236, 220, .4)'
      : 'rgba(255, 255, 255, .32)';

    const tail = pts[nPts - 1];
    const beforeTail = pts[nPts - 2] || tail;
    let tx = tail.x - beforeTail.x, ty = tail.y - beforeTail.y;
    const tmag = Math.hypot(tx, ty) || 1;
    tx /= tmag; ty /= tmag;
    const qx = -ty, qy = tx;
    const sackR = CELL * 0.40 * g;
    const sackColor = skin.detail === 'realistic'
      ? '#c99274'
      : shadeColor(tailCol.body || skin.body, 0.82);
    for (const side of [-1, 1]) {
      const bx = tail.x + tx * sackR * 0.42 + qx * side * sackR * 0.62;
      const by = tail.y + ty * sackR * 0.42 + qy * side * sackR * 0.62;
      if (S.rivals.length) drawBallHalo(bx, by, sackR, t);
      drawSphere(bx, by, sackR * 0.95, sackColor, { rim: true });
    }

    const shaft = drawTaperedShaft(pts, g, (u) => {
      const seg = Math.min(nPts - 1, Math.floor(u * nPts));
      return skinColors(seg, nPts, t).body || skin.body || '#e8b896';
    }, highlight);

    if (skin.detail === 'realistic' && S.snake.length >= 6) {
      drawVeinNet(shaft.beads && shaft.beads.length > 4 ? shaft.beads : pts, t);
    }

    if (skin.detail === 'spikes') {
      ctx.strokeStyle = '#2e6b25';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      for (let i = 2; i < nPts; i += 2) {
        const p = pts[i];
        const r = shaftRadius(i / Math.max(1, nPts - 1), g);
        for (const a of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - a * r * 0.55);
          ctx.lineTo(p.x + 4, p.y - a * (r * 0.55 + 8));
          ctx.stroke();
        }
      }
    }

    const headR = CELL * 0.48 * g;
    const glans = {
      x: head.x + ux * headR * 0.38,
      y: head.y + uy * headR * 0.38,
    };
    const ang = Math.atan2(uy, ux);
    const px = -uy, py = ux;

    drawSphere(glans.x + ux * 2, glans.y + uy * 2, headR * 0.92, hc.tip || skin.tip, { shadow: false });
    drawSphere(glans.x - ux * 1.5, glans.y - uy * 1.5, headR * 0.86, hc.head || skin.head, { rim: true, shadow: false });

    if (skin.detail === 'realistic') {
      ctx.strokeStyle = 'rgba(120, 40, 55, .38)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(glans.x - ux * 5, glans.y - uy * 5, headR * 0.88, headR * 0.68, ang, ang + 0.55, ang + Math.PI * 2 - 0.55);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 220, 210, .32)';
      ctx.beginPath();
      ctx.ellipse(glans.x + px * 5 - ux * 2, glans.y + py * 5 - uy * 2, headR * 0.26, headR * 0.16, ang, 0, Math.PI * 2);
      ctx.fill();
    }

    if (S.shield) {
      ctx.fillStyle = 'rgba(190, 233, 255, .5)';
      ctx.strokeStyle = '#5db8e8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(glans.x + ux * 2, glans.y + uy * 2, headR * 1.05, headR * 0.82, ang, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(head.x + ux * headR * 1.85, head.y + uy * headR * 1.85, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.ellipse(head.x - ux * 2, head.y - uy * 2, headR * 0.95, headR * 0.72, ang, ang + 0.4, ang + Math.PI * 2 - 0.4);
      ctx.stroke();
    }

    if (skin.detail === 'antenna') {
      ctx.strokeStyle = '#5d6d78';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(head.x, head.y - headR);
      ctx.lineTo(head.x, head.y - headR - 12);
      ctx.stroke();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(head.x, head.y - headR - 14, 4 + Math.sin(t / 200) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    drawFace(glans, ux, uy, headR * 0.9, t, invincible, false, true);
  }

  function drawFace(head, ux, uy, r, t, invincible, angry, pop) {
    const eating = !angry && now() - S.eatFlash < 350;
    const dead = !angry && S.dying;
    const blink = !angry && !dead && !eating && Math.floor(t / 2600) % 2 === 0 && (t % 2600) < 140;

    const px = -uy, py = ux;
    const eyeR = pop ? Math.max(6.2, r * 0.4) : r * 0.34;
    const eyeOff = pop ? Math.max(r * 0.52, eyeR + 2) : r * 0.42;
    const fx = head.x + ux * r * 0.12, fy = head.y + uy * r * 0.12;

    for (const side of [-1, 1]) {
      const ex = fx + px * side * eyeOff;
      const ey = fy + py * side * eyeOff;
      if (dead) {
        ctx.strokeStyle = '#241428';
        ctx.lineWidth = 3;
        for (const [a, b] of [[-1, -1], [1, -1]]) {
          ctx.beginPath();
          ctx.moveTo(ex - 4 * a, ey - 4 * b);
          ctx.lineTo(ex + 4 * a, ey + 4 * b);
          ctx.stroke();
        }
      } else if (invincible) {
        ctx.fillStyle = '#241428';
        ctx.fillRect(ex - 8, ey - 6, 16, 12);
        ctx.fillStyle = '#ffe56a';
        ctx.fillRect(ex - 6, ey - 4, 12, 8);
      } else if (blink) {
        ctx.strokeStyle = '#241428';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(ex - eyeR, ey);
        ctx.lineTo(ex + eyeR, ey);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#241428';
        ctx.beginPath();
        ctx.arc(ex, ey + 0.4, eyeR + 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a2a3a';
        ctx.beginPath();
        ctx.arc(ex + ux * (pop ? 2.4 : 3), ey + uy * (pop ? 2.4 : 3) + (eating ? 2 : 0), eyeR * (eating ? 0.48 : 0.42), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.arc(ex - eyeR * 0.32, ey - eyeR * 0.38, eyeR * 0.28, 0, Math.PI * 2);
        ctx.fill();
        if (angry) {
          ctx.strokeStyle = '#241428';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ex - side * r * 0.28, ey - r * 0.42);
          ctx.lineTo(ex + side * r * 0.18, ey - r * 0.12);
          ctx.stroke();
        }
      }
    }
    if (invincible) {
      // branche des lunettes
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx + px * -eyeOff - 7, fy + py * -eyeOff);
      ctx.lineTo(fx + px * eyeOff + 7, fy + py * eyeOff);
      ctx.stroke();
    }

    // bouche
    const mx = fx + ux * r * 0.55, my = fy + uy * r * 0.55;
    ctx.strokeStyle = '#3a2a3a';
    ctx.lineWidth = 2.5;
    if (dead) {
      // langue pendue
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#ff6b81';
      ctx.beginPath();
      ctx.ellipse(mx + 3, my + 6, 3, 6, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (eating) {
      // bouche grande ouverte, ravie
      ctx.fillStyle = '#7a3b52';
      ctx.beginPath();
      ctx.arc(mx, my, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8fa5';
      ctx.beginPath();
      ctx.arc(mx, my + r * 0.15, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    } else if (angry) {
      ctx.beginPath();
      ctx.arc(mx + uy * 2, my - ux * 2, r * 0.26, 1.05 * Math.PI, 1.95 * Math.PI);
      ctx.stroke();
    } else {
      // sourire niais
      ctx.beginPath();
      ctx.arc(mx - ux * 2, my - uy * 2, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    // joues roses
    if (!dead) {
      ctx.fillStyle = 'rgba(255, 110, 150, .4)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(fx + px * side * r * 0.75, fy + py * side * r * 0.75 + 3, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawParticles() {
    for (const p of S.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.spark) {
        ctx.fillStyle = `hsla(${p.hue || 50}, 95%, 70%, 1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawEmoji(p.e, p.x, p.y, p.s);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---- aperçu de skin pour le menu ---- */
  function drawSkinPreview(cv, skin) {
    const c = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    const y = h / 2;
    const flag = skin.detail === 'flag' && skin.stripes && skin.stripes.length;
    const rainbow = skin.detail === 'rainbow';
    const realistic = skin.detail === 'realistic';
    const shaftPaint = (() => {
      if (rainbow) {
        const g = c.createLinearGradient(22, y, 92, y);
        [0, 60, 120, 180, 240, 300].forEach((hue, i, a) => {
          g.addColorStop(i / (a.length - 1), `hsl(${hue}, 90%, 65%)`);
        });
        return g;
      }
      if (flag) {
        const g = c.createLinearGradient(22, y, 92, y);
        skin.stripes.forEach((col, i) => {
          g.addColorStop(i / Math.max(1, skin.stripes.length - 1), col);
        });
        return g;
      }
      return skin.body;
    })();
    const sackRaw = realistic ? '#c99274'
      : flag ? skin.stripes[skin.stripes.length - 1]
      : rainbow ? 'hsl(40, 90%, 62%)'
      : skin.body;
    const sack = realistic ? sackRaw : shadeColor(sackRaw, 0.78);
    const tip = rainbow ? 'hsl(320, 90%, 68%)' : (skin.tip || '#e26a97');
    const headCol = rainbow ? 'hsl(300, 90%, 68%)' : skin.head;

    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#241428';
    c.lineWidth = 22;
    c.beginPath();
    c.moveTo(22, y);
    c.quadraticCurveTo(70, y + 4, 92, y);
    c.stroke();
    c.strokeStyle = shaftPaint;
    c.lineWidth = 17;
    c.beginPath();
    c.moveTo(22, y);
    c.quadraticCurveTo(70, y + 4, 92, y);
    c.stroke();
    if (realistic) {
      c.strokeStyle = 'rgba(150, 48, 78, .5)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(32, y - 1);
      c.quadraticCurveTo(62, y + 3, 86, y);
      c.stroke();
    }
    if (skin.detail === 'spikes') {
      c.strokeStyle = '#2e6b25';
      c.lineWidth = 1.8;
      c.lineCap = 'round';
      for (const x of [40, 58, 76]) {
        c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 2, y - 13); c.stroke();
        c.beginPath(); c.moveTo(x, y + 7); c.lineTo(x + 2, y + 13); c.stroke();
      }
    }
    c.fillStyle = sack;
    c.beginPath(); c.ellipse(18, y - 7, 8, 9.5, -0.25, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(18, y + 7, 8, 9.5, 0.25, 0, Math.PI * 2); c.fill();
    c.fillStyle = tip;
    c.beginPath(); c.ellipse(100, y, 10, 8.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = headCol;
    c.beginPath(); c.ellipse(94, y, 9, 7.4, 0, 0, Math.PI * 2); c.fill();
    if (skin.detail === 'antenna') {
      c.strokeStyle = '#5d6d78';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(94, y - 10);
      c.lineTo(94, y - 18);
      c.stroke();
      c.fillStyle = '#ff5252';
      c.beginPath();
      c.arc(94, y - 20, 3, 0, Math.PI * 2);
      c.fill();
    }
    const ey = 5, ex = 94, er = 4.4;
    c.fillStyle = '#241428';
    c.beginPath(); c.arc(ex, y - ey, er + 1.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(ex, y + ey, er + 1.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(ex, y - ey, er, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(ex, y + ey, er, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a2a3a';
    c.beginPath(); c.arc(ex + 1.4, y - ey, er * 0.42, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(ex + 1.4, y + ey, er * 0.42, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.beginPath(); c.arc(ex - 1.2, y - ey - 1.4, er * 0.28, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(ex - 1.2, y + ey - 1.4, er * 0.28, 0, Math.PI * 2); c.fill();
  }

  return {
    start, startBoss, stop, pause, resume, setDirection, tryShoot, callPuchita, drawSkinPreview,
    keepLives, keepProgress, clearProgress,
    get state() { return S; },
    hasEffect,
    BONUS_TYPES,
  };
})();
