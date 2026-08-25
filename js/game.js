/* ===== ZIGOUIGOUI — moteur de jeu + rendu cartoon ===== */

const Game = (() => {
  const { COLS, ROWS, CELL } = GRID;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const BONUS_TYPES = [
    { id: 'speed', emoji: '⚡', dur: 5000, label: 'TURBO' },
    { id: 'invincible', emoji: '🌟', dur: 6000, label: 'INVINCIBLE' },
    { id: 'multi', emoji: '💰', dur: 8000, label: 'SCORE ×2' },
  ];

  const S = {
    running: false, paused: false, dying: false, dieTime: 0,
    level: null, levelIndex: 0,
    snake: [], prevSnake: [], dir: { x: 1, y: 0 }, dirQueue: [],
    acc: 0, stepInterval: 180,
    food: null, bonus: null, bonusLife: 0,
    capote: null, capoteLife: 0, nextCapoteAt: 150, shield: false,
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
    cb: {},
  };

  const key = (x, y) => x + ',' + y;
  const lerp = (a, b, t) => a + (b - a) * t;
  const now = () => performance.now();

  /* ================= CYCLE DE VIE ================= */

  function start(levelIndex, callbacks, carriedScore) {
    S.cb = callbacks || S.cb;
    S.levelIndex = levelIndex;
    S.level = LEVELS[levelIndex];
    S.running = true; S.paused = false; S.dying = false;
    S.dir = { x: 1, y: 0 }; S.dirQueue = [];
    S.snake = [{ x: 4, y: 16 }, { x: 3, y: 16 }];
    S.prevSnake = S.snake.map(p => ({ ...p }));
    S.acc = 0;
    S.stepInterval = 1000 / S.level.speed;
    S.score = carriedScore || 0; S.eaten = 0; S.stepCount = 0;
    S.effects = {}; S.bonus = null; S.particles = []; S.shake = 0;
    S.capote = null; S.capoteLife = 0; S.nextCapoteAt = 150; S.shield = false;
    S.antigrav = false; S.spermShots = 0; S.shots = []; S.nextShotAt = 0; S.puchita = null;
    S.puchitaReady = false; S.kitCapote = false;
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
    applyLoadout();
    emit('score'); emit('length'); emit('goal'); emit('effects');
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
    };
  }

  function applyRun(carry) {
    S.snake = carry.snake.map(p => ({ ...p }));
    S.prevSnake = (carry.prevSnake || carry.snake).map(p => ({ ...p }));
    S.dir = { ...carry.dir };
    S.dirQueue = (carry.dirQueue || []).map(d => ({ ...d }));
    S.acc = carry.acc || 0;
    S.score = carry.score;
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
  }

  function findBossSpawn(len) {
    const candidates = [
      { x: Math.max(2, COLS - len), y: 3, dir: { x: -1, y: 0 } },
      { x: Math.min(COLS - 2, len - 1), y: 3, dir: { x: 1, y: 0 } },
      { x: Math.max(2, COLS - len), y: ROWS - 4, dir: { x: -1, y: 0 } },
      { x: Math.min(COLS - 2, len - 1), y: ROWS - 4, dir: { x: 1, y: 0 } },
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
      S.capote = null; S.capoteLife = 0; S.nextCapoteAt = 150; S.shield = false;
      S.food = null;
      S.antigrav = false; S.spermShots = 0; S.shots = []; S.puchita = null;
      S.puchitaReady = false; S.kitCapote = false;
      S.obstacles = S.level.obstacles.filter(o => !o.move).slice(0, 5)
        .map(o => ({ ...o, move: null }));
      rebuildObstacleSet();
    }

    // la capote du kit te protège du duel, même si tu l’as déjà usée dans le niveau
    if (S.kitCapote) {
      S.shield = true;
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
    emit('score'); emit('length'); emit('goal'); emit('effects');
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
    if (S.mode !== 'level' || S.bossReady || S.dying || !S.running) return;
    if (S.score < (S.level.goal || 0)) return;
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
    const yMin = 2, yMax = ROWS - 4;
    for (let i = 0; i < n; i++) {
      const length = 5 + Math.min(i, 4);
      let x = COLS - length;
      let y = n <= 1 ? 5 : Math.round(yMin + i * (yMax - yMin) / (n - 1));
      for (let tries = 0; tries < 50; tries++) {
        if (!S.obstacleSet.has(key(x, y)) && !S.obstacleSet.has(key(x + 1, y))) break;
        y = yMin + ((y - yMin + 2) % (yMax - yMin + 1));
      }
      S.rivals.push(makeRival({
        x, y, dir: { x: -1, y: 0 },
        length,
        interval: S.stepInterval * (S.level.rivalSpeed || 1.3),
        skin: RIVAL_SKINS[i % RIVAL_SKINS.length],
        name: RIVAL_NAMES[i % RIVAL_NAMES.length],
        isBoss: false,
        smart: 0.15 + S.levelIndex * 0.12,
      }));
    }
  }

  function stop() { S.running = false; }
  function pause() { if (S.running && !S.dying) S.paused = true; }
  function resume() { S.paused = false; }
  function emit(name, arg) { if (S.cb['on' + name]) S.cb['on' + name](arg); }

  /* ================= LOGIQUE ================= */

  function rebuildObstacleSet() {
    S.obstacleSet = new Set(S.obstacles.map(o => key(o.x, o.y)));
  }

  function freeCell() {
    const taken = new Set([...S.obstacleSet]);
    S.snake.forEach(p => taken.add(key(p.x, p.y)));
    for (const r of S.rivals) r.body.forEach(p => taken.add(key(p.x, p.y)));
    if (S.food) taken.add(key(S.food.x, S.food.y));
    if (S.bonus) taken.add(key(S.bonus.x, S.bonus.y));
    if (S.capote) taken.add(key(S.capote.x, S.capote.y));
    if (S.puchita) taken.add(key(S.puchita.x, S.puchita.y));
    let tries = 0;
    while (tries++ < 500) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (!taken.has(key(x, y))) return { x, y };
    }
    return { x: 2, y: 2 };
  }

  function spawnFood() { S.food = freeCell(); }

  function maybeSpawnBonus() {
    if (S.bonus || Math.random() > 0.025) return;
    const type = BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
    S.bonus = { ...freeCell(), type };
    S.bonusLife = now() + 8000;
  }

  function hasEffect(id) { return (S.effects[id] || 0) > now(); }

  function applyBonus(type) {
    S.effects[type.id] = now() + type.dur;
    addPoints(PTS.bonus);
    AudioMan.sfx.bonus();
    emit('effects');
    burst(S.snake[0], ['✨', '💛']);
  }

  function die(reason, detail) {
    if (hasEffect('invincible')) return;
    if (S.shield && (reason === 'obstacle' || reason === 'rival')) {
      S.shield = false;
      S.effects.invincible = now() + 1800;
      AudioMan.sfx.boing();
      burst(S.snake[0], ['🛡️', '💢', '✨']);
      emit('effects');
      emit(S.mode === 'boss' ? 'SavedBoss' : 'Saved');
      return;
    }
    if (S.puchita && S.puchita.hp > 0 && (reason === 'obstacle' || reason === 'rival')) {
      sacrificePuchita();
      S.effects.invincible = now() + 1400;
      emit('effects');
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
      // un virus qui patrouille peut te rentrer dedans
      const head = S.snake[0];
      if (!hasEffect('invincible') && S.obstacleSet.has(key(head.x, head.y))) {
        die('obstacle', virusAt(head.x, head.y));
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

    // on peut se recroiser : se toucher soi-même ne tue pas
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
      S.eaten++;
      S.eatFlash = now();
      addPoints(PTS.food);
      S.stepInterval = Math.max(60, S.stepInterval * 0.982);
      AudioMan.sfx.eat();
      burst(S.food, ['✨', '💖', '🌈']);
      emit('length');
      spawnFood();
      S.prevSnake.push({ ...S.prevSnake[S.prevSnake.length - 1] });
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
    if (S.mode !== 'boss' && !S.capote && !S.shield && S.score >= S.nextCapoteAt) {
      S.capote = freeCell();
      S.capoteLife = now() + 14000;
      S.nextCapoteAt += 150;
      emit('CapoteSpawn');
      emit('effects');
    }
    if (S.capote && now() > S.capoteLife) { S.capote = null; emit('effects'); }
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
    const protectBalls = r.isBoss && (panic || tailDist <= 2 + Math.floor(smart * 3));
    const huntBallsChance = 0.18 + smart * 0.78;
    const theirBalls = S.snake[S.snake.length - 1] || player;
    const hunt = (Math.random() < huntBallsChance) ? theirBalls : player;

    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    const options = dirs.filter(d => {
      if (d.x === -r.dir.x && d.y === -r.dir.y) return false;
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return false;
      if (S.obstacleSet.has(key(nx, ny))) return false;
      if (r.body.slice(0, -1).some(p => p.x === nx && p.y === ny)) return false;
      return true;
    });
    if (!options.length) return r.dir;

    const newTail = r.body[r.body.length - 2] || tail;
    const score = d => {
      const nx = head.x + d.x, ny = head.y + d.y;
      if (protectBalls) {
        // éloigne les boules du joueur — plus malin = plus obstiné à les cacher
        return -(Math.abs(newTail.x - player.x) + Math.abs(newTail.y - player.y));
      }
      if (panic) return -(Math.abs(nx - player.x) + Math.abs(ny - player.y));
      return Math.abs(nx - hunt.x) + Math.abs(ny - hunt.y);
    };
    options.sort((a, b) => score(a) - score(b));
    const wobble = Math.max(0.03, 0.30 - smart * 0.27);
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

  function applyLoadout() {
    const used = Save.consumeKit();
    if (used.capote) {
      S.shield = true;
      S.kitCapote = true;
      emit('CapoteOn');
    }
    if (used.antigrav) S.antigrav = true;
    if (used.sperm) S.spermShots = 3;
    if (used.puchita) S.puchitaReady = true;
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
      S.eaten++;
      S.eatFlash = now();
      addPoints(PTS.food);
      AudioMan.sfx.eat();
      burst(S.food, ['💕', '✨']);
      spawnFood();
    }
    const prey = S.rivals.find(r => !r.isBoss && r.body.some(c => c.x === p.x && c.y === p.y));
    if (prey) {
      puchitaSlay(prey);
      return;
    }
    if (S.obstacleSet.has(key(p.x, p.y)) && virusAt(p.x, p.y)) {
      S.obstacles = S.obstacles.filter(o => !(o.x === p.x && o.y === p.y && o.virus !== undefined));
      rebuildObstacleSet();
      sacrificePuchita();
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
      // carrelage
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const even = (x + y) % 2 === 0;
          ctx.fillStyle = even ? '#e8f7fb' : '#d2ebf3';
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = 'rgba(160, 196, 210, .55)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
          if (even) {
            ctx.fillStyle = 'rgba(255,255,255,.35)';
            ctx.fillRect(x * CELL + 4, y * CELL + 4, 8, 3);
          }
        }
      }
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
      // damier sable
      for (let y = 4; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if ((x + y) % 2) continue;
          ctx.fillStyle = 'rgba(232, 176, 80, .18)';
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    } else if (L.deco === 'club') {
      ctx.fillStyle = '#120a24';
      ctx.fillRect(-20, -20, W + 40, H + 40);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const dance = x >= 10 && x <= 17 && y >= 7 && y <= 12;
          if (dance) {
            const hues = [320, 200, 50, 140];
            ctx.fillStyle = `hsla(${hues[(x + y) % 4]}, 80%, ${38 + Math.sin(t / 200 + x) * 8}%, .85)`;
          } else {
            ctx.fillStyle = (x + y) % 2 ? '#1a1233' : '#140e2c';
          }
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
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
      drawEmoji('🪩', W / 2, 28, 26 + Math.sin(t / 200) * 2);
    } else if (L.deco === 'dungeon') {
      ctx.fillStyle = '#2a2633';
      ctx.fillRect(-20, -20, W + 40, H + 40);
      for (let y = 0; y < ROWS; y++) {
        const ox = (y % 2) * (CELL / 2);
        for (let x = -1; x < COLS + 1; x++) {
          ctx.fillStyle = (x + y) % 2 ? '#3a3546' : '#323044';
          ctx.fillRect(x * CELL + ox, y * CELL, CELL - 1, CELL - 1);
          ctx.strokeStyle = 'rgba(0,0,0,.28)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x * CELL + ox + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
        }
      }
      for (const [tx, ty] of [[1.4, 1.4], [COLS - 1.4, 1.4], [1.4, ROWS - 1.4], [COLS - 1.4, ROWS - 1.4]]) {
        const flick = 34 + Math.sin(t / 90 + tx) * 10;
        const g = ctx.createRadialGradient(tx * CELL, ty * CELL, 0, tx * CELL, ty * CELL, flick * 3.2);
        g.addColorStop(0, 'rgba(255,150,40,.4)');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(tx * CELL - 110, ty * CELL - 110, 220, 220);
        drawEmoji('🔥', tx * CELL, ty * CELL, 22 + Math.sin(t / 120 + ty) * 2);
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
      if (L.deco === 'chaos') {
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++)
            if ((x + y) % 2 === 0) {
              ctx.fillStyle = `hsla(${(t / 20 + x * 12 + y * 8) % 360}, 55%, 18%, .35)`;
              ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
            }
      }
    } else {
      ctx.fillStyle = c1;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = c2;
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++)
          if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }

    // vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(20, 10, 30, .22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255, 90, 120, .8)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }

  function drawEmoji(e, x, y, size) {
    ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e, x, y);
  }

  function drawObstacles(t) {
    for (const o of S.obstacles) {
      const wob = Math.sin(t / 300 + o.x * 1.7 + o.y) * 2;
      if (o.virus !== undefined) {
        drawMeanPuchita((o.x + 0.5) * CELL, (o.y + 0.5) * CELL + wob, o.virus, t, !!o.move);
      } else if (o.wall) {
        drawWall(o, t);
      } else {
        drawEmoji(o.e, (o.x + 0.5) * CELL, (o.y + 0.5) * CELL + wob, CELL * 0.95);
      }
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
      ctx.fillStyle = '#f4fcff';
      roundCell(x, y, 5); ctx.fill();
      ctx.strokeStyle = '#7eb8c8';
      ctx.lineWidth = 2;
      roundCell(x, y, 5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.fillRect(x + 7, y + 7, 9, 3);
    } else if (o.wall === 'wood') {
      ctx.fillStyle = '#8b5a2b';
      roundCell(x, y, 4); ctx.fill();
      ctx.strokeStyle = '#5c3514';
      ctx.lineWidth = 2;
      roundCell(x, y, 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(40, 20, 8, .35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 6); ctx.lineTo(x + 8, y + CELL - 6);
      ctx.moveTo(x + CELL - 8, y + 6); ctx.lineTo(x + CELL - 8, y + CELL - 6);
      ctx.stroke();
      ctx.fillStyle = '#3d7a32';
      ctx.beginPath(); ctx.ellipse(cx, y + 6, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (o.wall === 'rock') {
      ctx.fillStyle = '#c4b49a';
      ctx.beginPath();
      ctx.moveTo(cx, y + 5);
      ctx.lineTo(x + CELL - 5, cy);
      ctx.lineTo(cx + 4, y + CELL - 5);
      ctx.lineTo(x + 6, cy + 3);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a7a62';
      ctx.lineWidth = 2; ctx.stroke();
    } else if (o.wall === 'neon') {
      const hue = (t / 18 + o.x * 20 + o.y * 15) % 360;
      ctx.shadowColor = `hsl(${hue}, 90%, 60%)`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `hsl(${hue}, 80%, 42%)`;
      roundCell(x, y, 5); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      roundCell(x, y, 5); ctx.stroke();
    } else if (o.wall === 'brick') {
      ctx.fillStyle = '#a45c48';
      ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      ctx.strokeStyle = '#6e382c';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.moveTo(x + 2, cy); ctx.lineTo(x + CELL - 2, cy);
      ctx.stroke();
    } else if (o.wall === 'asteroid') {
      ctx.fillStyle = '#8a8494';
      ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a5464';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(40,36,50,.35)';
      ctx.beginPath(); ctx.arc(cx - 4, cy - 3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, cy + 4, 3, 0, Math.PI * 2); ctx.fill();
    } else if (o.wall === 'glitch') {
      ctx.fillStyle = `hsl(${(t / 8 + o.x * 40) % 360}, 80%, 50%)`;
      ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.35 + Math.sin(t / 80 + o.y) * 0.2;
      ctx.fillRect(x + 6, y + 10, CELL - 12, 4);
    }
    ctx.restore();
  }

  const MEAN_PUCHITA = [
    { body: '#e45a86', dark: '#a32e58', blush: 'rgba(255, 80, 80, .45)' },
    { body: '#b44cff', dark: '#6e1ea8', blush: 'rgba(180, 60, 255, .4)' },
    { body: '#d46a9a', dark: '#7a3058', blush: 'rgba(120, 200, 80, .35)' },
  ];

  function drawPuchitaFigure(cx, cy, t, opts) {
    const angry = !!opts.angry;
    const pal = opts.pal;
    const pulse = 1 + Math.sin(t / 170 + (opts.phase || 0)) * (angry ? 0.07 : 0.04);
    const rx = CELL * 0.36 * pulse;
    const ry = CELL * 0.40 * pulse;

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
        ctx.beginPath();
        ctx.moveTo(cx + i * 6, cy - ry - 2 - drift * 0.25);
        ctx.quadraticCurveTo(cx + i * 6 + 3, cy - ry - 8 - drift * 0.25, cx + i * 6, cy - ry - 12 - drift * 0.25);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.18, ry * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 2.6;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.28, cy - ry * 0.38, rx * 0.38, ry * 0.22, -0.45, 0, Math.PI * 2);
    ctx.fill();

    for (const side of [-1, 1]) {
      const ex = cx + side * rx * 0.42;
      const ey = cy - ry * 0.16;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex, ey, rx * 0.30, ry * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a1a2a';
      ctx.beginPath();
      ctx.arc(ex + (angry ? side * 1.2 : 1), ey + (angry ? 1.4 : 0), rx * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a1a2a';
      ctx.lineWidth = angry ? 2.6 : 1.7;
      ctx.beginPath();
      if (angry) {
        ctx.moveTo(ex - side * rx * 0.28, ey - ry * 0.40);
        ctx.lineTo(ex + side * rx * 0.20, ey - ry * 0.14);
      } else {
        ctx.moveTo(ex - rx * 0.18, ey - ry * 0.32);
        ctx.quadraticCurveTo(ex, ey - ry * 0.42, ex + rx * 0.18, ey - ry * 0.32);
      }
      ctx.stroke();
    }

    ctx.fillStyle = pal.blush;
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.58, cy + ry * 0.14, 5.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + rx * 0.58, cy + ry * 0.14, 5.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#2a1a2a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    if (angry) {
      ctx.moveTo(cx - rx * 0.28, cy + ry * 0.42);
      ctx.lineTo(cx - rx * 0.08, cy + ry * 0.28);
      ctx.lineTo(cx + rx * 0.08, cy + ry * 0.42);
      ctx.lineTo(cx + rx * 0.28, cy + ry * 0.28);
    } else {
      ctx.arc(cx, cy + ry * 0.18, rx * 0.34, 0.12 * Math.PI, 0.88 * Math.PI);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawMeanPuchita(cx, cy, variant, t, mobile) {
    const pal = MEAN_PUCHITA[variant] || MEAN_PUCHITA[0];
    drawPuchitaFigure(cx, cy, t, {
      angry: true,
      pal,
      phase: variant * 2 + (mobile ? t / 400 : 0),
      glow: mobile ? 14 : 8,
    });
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
      ctx.font = 'bold 13px "Comic Sans MS", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
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
      ctx.fillStyle = '#fff6d8';
      ctx.strokeStyle = '#e8c96a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(CELL * 0.28, 0);
      ctx.quadraticCurveTo(0, CELL * 0.16, -CELL * 0.22, 0);
      ctx.quadraticCurveTo(0, -CELL * 0.16, CELL * 0.28, 0);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFood(t) {
    const s = CELL * (0.8 + Math.sin(t / 200) * 0.12);
    const f = S.food;
    ctx.save();
    ctx.shadowColor = '#ffd93d';
    ctx.shadowBlur = 14;
    drawEmoji(S.level.food, (f.x + 0.5) * CELL, (f.y + 0.5) * CELL, s);
    ctx.restore();
  }

  function drawBonus(t) {
    const remaining = S.bonusLife - now();
    if (remaining < 2000 && Math.floor(t / 130) % 2 === 0) return; // clignote avant de disparaître
    const b = S.bonus;
    const s = CELL * (0.85 + Math.sin(t / 150) * 0.1);
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 16;
    drawEmoji(b.type.emoji, (b.x + 0.5) * CELL, (b.y + 0.5) * CELL, s);
    ctx.restore();
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
    // corps translucide arrondi en haut
    ctx.fillStyle = 'rgba(210, 242, 255, .92)';
    ctx.strokeStyle = '#3aa7e0';
    ctx.lineWidth = 2.8;
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
    const bodyW = CELL * (r.isBoss ? 0.88 : 0.62);
    const headR = CELL * (r.isBoss ? 0.58 : 0.44);

    // aura menaçante
    ctx.save();
    ctx.shadowColor = r.isBoss ? '#ff3a5a' : '#ff6a4a';
    ctx.shadowBlur = r.isBoss ? 22 : 12;

    ctx.strokeStyle = skin.body;
    ctx.lineWidth = bodyW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();

    // base
    const tail = pts[pts.length - 1];
    const beforeTail = pts[pts.length - 2] || tail;
    let tx = tail.x - beforeTail.x, ty = tail.y - beforeTail.y;
    const tmag = Math.hypot(tx, ty) || 1;
    tx /= tmag; ty /= tmag;
    const ballR = CELL * (r.isBoss ? 0.48 : 0.36);
    const perpX = -ty, perpY = tx;
    for (const side of [-1, 1]) {
      const bx = tail.x + tx * ballR * 0.8 + perpX * side * ballR * 0.75;
      const by = tail.y + ty * ballR * 0.8 + perpY * side * ballR * 0.75;
      drawBallHalo(bx, by, ballR, t);
      ctx.fillStyle = now() < (r.iFrames || 0) ? '#fff3a0' : skin.body;
      ctx.beginPath();
      ctx.arc(bx, by, ballR, 0, Math.PI * 2);
      ctx.fill();
    }

    // tête
    ctx.fillStyle = skin.tip;
    ctx.beginPath();
    ctx.arc(head.x + ux * headR * 0.55, head.y + uy * headR * 0.55, headR * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.head;
    ctx.beginPath();
    ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
    ctx.fill();

    if (r.isBoss) {
      drawEmoji(S.bossDef.emoji, head.x - ux * headR * 1.6, head.y - uy * headR * 1.6 - 10, 22);
    }

    drawFace(head, ux, uy, headR, t, false, true);
  }

  /* ---- le zigouigoui lui-même ---- */

  function skinColors(seg, total, t) {
    const skin = SKINS.find(s => s.id === Save.data.skin) || SKINS[0];
    if (skin.detail === 'rainbow') {
      const h = (seg * 24 - t / 6) % 360;
      return { body: `hsl(${h}, 90%, 65%)`, head: `hsl(${(t / 6) % 360}, 90%, 68%)`, tip: `hsl(${(t / 6 + 30) % 360}, 90%, 55%)`, detail: null };
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

    if (skin.detail === 'realistic') {
      drawRealisticSnake(pts, head, ux, uy, t, skin, invincible);
      if (invincible) ctx.restore();
      return;
    }

    // --- corps : gros trait rose arrondi ---
    const bodyW = CELL * 0.66;
    if (skin.detail === 'rainbow') {
      for (let i = pts.length - 1; i > 0; i--) {
        ctx.strokeStyle = skinColors(i, pts.length, t).body;
        ctx.lineWidth = bodyW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = skin.body;
      ctx.lineWidth = bodyW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // reflet cartoon sur le corps
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = bodyW * 0.25;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (i === 1) ctx.moveTo(p.x - bodyW * 0.18, p.y - bodyW * 0.22);
      else ctx.lineTo(p.x - bodyW * 0.18, p.y - bodyW * 0.22);
    }
    ctx.stroke();

    // piquants du cactus
    if (skin.detail === 'spikes') {
      ctx.strokeStyle = '#2e6b25';
      ctx.lineWidth = 2;
      for (let i = 2; i < pts.length; i += 2) {
        const p = pts[i];
        for (const a of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - a * bodyW * 0.4);
          ctx.lineTo(p.x + 4, p.y - a * (bodyW * 0.4 + 7));
          ctx.stroke();
        }
      }
    }

    // --- la base : deux boules cartoon à la queue ---
    const tail = pts[pts.length - 1];
    const beforeTail = pts[pts.length - 2] || tail;
    let tx = tail.x - beforeTail.x, ty = tail.y - beforeTail.y;
    const tmag = Math.hypot(tx, ty) || 1;
    tx /= tmag; ty /= tmag;
    const ballR = CELL * 0.38;
    const perpX = -ty, perpY = tx;
    const tipColor = skinColors(pts.length, pts.length, t).tip || skin.tip;
    for (const side of [-1, 1]) {
      const bx = tail.x + tx * ballR * 0.8 + perpX * side * ballR * 0.75;
      const by = tail.y + ty * ballR * 0.8 + perpY * side * ballR * 0.75;
      if (S.rivals.length) drawBallHalo(bx, by, ballR, t);
      ctx.fillStyle = skinColors(pts.length - 1, pts.length, t).body || skin.body;
      ctx.beginPath();
      ctx.arc(bx, by, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // --- tête : capsule avec collerette ---
    const headR = CELL * 0.46;
    const hc = skinColors(0, pts.length, t);
    // bout arrondi qui dépasse dans la direction du mouvement
    ctx.fillStyle = hc.tip || skin.tip;
    ctx.beginPath();
    ctx.arc(head.x + ux * headR * 0.55, head.y + uy * headR * 0.55, headR * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hc.head || skin.head;
    ctx.beginPath();
    ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
    ctx.fill();
    // collerette (l'arête cartoon entre tête et corps)
    ctx.strokeStyle = hc.tip || skin.tip;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(head.x - ux * headR * 0.35, head.y - uy * headR * 0.35, headR * 0.85, Math.atan2(uy, ux) - 2.1, Math.atan2(uy, ux) + 2.1);
    ctx.stroke();

    // capote protectrice portée sur la tête
    if (S.shield) {
      const capX = head.x + ux * headR * 0.55, capY = head.y + uy * headR * 0.55;
      ctx.fillStyle = 'rgba(190, 233, 255, .55)';
      ctx.strokeStyle = '#5db8e8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(capX, capY, headR * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // réservoir qui dépasse au bout
      ctx.beginPath();
      ctx.arc(head.x + ux * headR * 1.7, head.y + uy * headR * 1.7, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // anneau roulé à la base du bout
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(head.x - ux * headR * 0.15, head.y - uy * headR * 0.15, headR * 0.9, Math.atan2(uy, ux) - 1.4, Math.atan2(uy, ux) + 1.4);
      ctx.stroke();
    }

    // antenne du robot
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

    drawFace(head, ux, uy, headR, t, invincible);
    if (invincible) ctx.restore();
  }

  function drawRealisticSnake(pts, head, ux, uy, t, skin, invincible) {
    const px = -uy, py = ux;
    const n = pts.length;

    // --- base : deux bourses ovales qui se chevauchent, un peu tombantes ---
    const tail = pts[n - 1];
    const beforeTail = pts[n - 2] || tail;
    let tx = tail.x - beforeTail.x, ty = tail.y - beforeTail.y;
    const tmag = Math.hypot(tx, ty) || 1;
    tx /= tmag; ty /= tmag;
    const qx = -ty, qy = tx;
    const sackR = CELL * 0.42;
    const sackColor = '#c99274';
    const sackDark = '#b0785c';
    for (const side of [-1, 1]) {
      const bx = tail.x + tx * sackR * 0.55 + qx * side * sackR * 0.62;
      const by = tail.y + ty * sackR * 0.55 + qy * side * sackR * 0.62;
      if (S.rivals.length) drawBallHalo(bx, by, sackR, t);
      ctx.fillStyle = sackColor;
      ctx.beginPath();
      ctx.ellipse(bx, by, sackR * 0.95, sackR * 1.12, Math.atan2(ty, tx) + side * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90, 50, 40, .28)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // ombre interne
      ctx.fillStyle = 'rgba(90, 50, 40, .18)';
      ctx.beginPath();
      ctx.ellipse(bx + qx * side * 3, by + ty * 4, sackR * 0.45, sackR * 0.55, Math.atan2(ty, tx), 0, Math.PI * 2);
      ctx.fill();
    }

    // --- hampe : largeur qui s'affine vers le gland ---
    for (let i = n - 1; i > 0; i--) {
      const taper = 0.78 + 0.22 * (i / Math.max(1, n - 1));
      ctx.strokeStyle = skin.body;
      ctx.lineWidth = CELL * (0.5 + 0.22 * taper);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
      ctx.stroke();
    }

    // reflet chaud
    ctx.strokeStyle = 'rgba(255, 230, 210, .38)';
    ctx.lineWidth = CELL * 0.14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const p = pts[i];
      const nx = p.x + px * CELL * 0.16 - uy * 0;
      const ny = p.y + py * CELL * 0.16;
      if (i === 1) ctx.moveTo(nx, ny);
      else ctx.lineTo(nx, ny);
    }
    ctx.stroke();

    // veine dorsale cartoon
    ctx.strokeStyle = 'rgba(176, 86, 92, .45)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i];
      const wob = Math.sin(i * 0.9 + t / 400) * 2.4;
      const vx = p.x + px * wob;
      const vy = p.y + py * wob;
      if (i === 1) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.stroke();

    // --- gland en champignon ---
    const headR = CELL * 0.48;
    const glans = {
      x: head.x + ux * headR * 0.62,
      y: head.y + uy * headR * 0.62,
    };
    const ang = Math.atan2(uy, ux);

    // collerette / corona (plus large que la hampe)
    ctx.fillStyle = skin.tip;
    ctx.beginPath();
    ctx.ellipse(glans.x - ux * 4, glans.y - uy * 4, headR * 1.05, headR * 0.82, ang, 0, Math.PI * 2);
    ctx.fill();

    // dôme du gland
    ctx.fillStyle = skin.head;
    ctx.beginPath();
    ctx.ellipse(glans.x + ux * 3, glans.y + uy * 3, headR * 0.92, headR * 0.72, ang, 0, Math.PI * 2);
    ctx.fill();

    // sillon du corona
    ctx.strokeStyle = 'rgba(120, 40, 55, .4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(glans.x - ux * 6, glans.y - uy * 6, headR * 0.92, headR * 0.7, ang, ang + 0.7, ang + Math.PI * 2 - 0.7);
    ctx.stroke();

    // reflet sur le gland
    ctx.fillStyle = 'rgba(255, 210, 200, .35)';
    ctx.beginPath();
    ctx.ellipse(glans.x + px * 6 - ux * 2, glans.y + py * 6 - uy * 2, headR * 0.28, headR * 0.18, ang, 0, Math.PI * 2);
    ctx.fill();

    // capote par-dessus le gland
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

    drawFace(glans, ux, uy, headR * 0.92, t, invincible);
  }

  function drawFace(head, ux, uy, r, t, invincible, angry) {
    const eating = !angry && now() - S.eatFlash < 350;
    const dead = !angry && S.dying;
    const blink = !angry && !dead && !eating && Math.floor(t / 2600) % 2 === 0 && (t % 2600) < 140;

    // yeux écartés perpendiculairement à la direction
    const px = -uy, py = ux;
    const eyeOff = r * 0.42;
    const fx = head.x + ux * r * 0.15, fy = head.y + uy * r * 0.15;

    for (const side of [-1, 1]) {
      const ex = fx + px * side * eyeOff;
      const ey = fy + py * side * eyeOff;
      if (dead) {
        // yeux en croix
        ctx.strokeStyle = '#3a2a3a';
        ctx.lineWidth = 3;
        for (const [a, b] of [[-1, -1], [1, -1]]) {
          ctx.beginPath();
          ctx.moveTo(ex - 4 * a, ey - 4 * b);
          ctx.lineTo(ex + 4 * a, ey + 4 * b);
          ctx.stroke();
        }
      } else if (invincible) {
        // lunettes de star
        ctx.fillStyle = '#222';
        ctx.fillRect(ex - 7, ey - 5, 14, 10);
      } else if (blink) {
        ctx.strokeStyle = '#3a2a3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ex - 5, ey);
        ctx.lineTo(ex + 5, ey);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex, ey, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a2a3a';
        ctx.beginPath();
        // pupilles globuleuses qui regardent où on va
        ctx.arc(ex + ux * 3, ey + uy * 3 + (eating ? 2 : 0), r * (eating ? 0.18 : 0.14), 0, Math.PI * 2);
        ctx.fill();
        if (angry) {
          ctx.strokeStyle = '#2a1a2a';
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
      drawEmoji(p.e, p.x, p.y, p.s);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- aperçu de skin pour le menu ---- */
  function drawSkinPreview(cv, skin) {
    const c = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    const y = h / 2;
    const body = skin.detail === 'rainbow' ? null : skin.body;
    const realistic = skin.detail === 'realistic';
    // corps
    for (let i = 0; i < 5; i++) {
      c.strokeStyle = skin.detail === 'rainbow' ? `hsl(${i * 40}, 90%, 65%)` : body;
      c.lineWidth = realistic ? 16 + i * 1.2 : 20;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(20 + i * 14, y + Math.sin(i) * 3);
      c.lineTo(20 + (i + 1) * 14, y + Math.sin(i + 1) * 3);
      c.stroke();
    }
    // boules
    c.fillStyle = realistic ? '#c99274' : (skin.detail === 'rainbow' ? 'hsl(200, 90%, 65%)' : skin.body);
    if (realistic) {
      c.beginPath(); c.ellipse(16, y - 8, 9, 11, -0.2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(16, y + 8, 9, 11, 0.2, 0, Math.PI * 2); c.fill();
    } else {
      c.beginPath(); c.arc(16, y - 7, 9, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(16, y + 7, 9, 0, Math.PI * 2); c.fill();
    }
    // tête
    c.fillStyle = skin.detail === 'rainbow' ? 'hsl(320, 90%, 68%)' : (skin.tip || '#e26a97');
    if (realistic) {
      c.beginPath(); c.ellipse(98, y, 13, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = skin.head;
      c.beginPath(); c.ellipse(94, y, 12, 9, 0, 0, Math.PI * 2); c.fill();
    } else {
      c.beginPath(); c.arc(96, y, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = skin.detail === 'rainbow' ? 'hsl(300, 90%, 68%)' : skin.head;
      c.beginPath(); c.arc(90, y, 13, 0, Math.PI * 2); c.fill();
    }
    // yeux
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(92, y - 5, 4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(92, y + 5, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#333';
    c.beginPath(); c.arc(93.5, y - 5, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(93.5, y + 5, 2, 0, Math.PI * 2); c.fill();
  }

  return {
    start, startBoss, stop, pause, resume, setDirection, tryShoot, callPuchita, drawSkinPreview,
    get state() { return S; },
    hasEffect,
    BONUS_TYPES,
  };
})();
