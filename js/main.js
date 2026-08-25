/* ===== ZIGOUIGOUI — interface, entrées, progression ===== */

(() => {
  Save.load();

  const $ = id => document.getElementById(id);
  const screens = {
    menu: $('screen-menu'), levels: $('screen-levels'), skins: $('screen-skins'),
    boss: $('screen-boss'), shop: $('screen-shop'), unlock: $('screen-unlock'),
    pause: $('screen-pause'), gameover: $('screen-gameover'),
    victory: $('screen-victory'),
  };
  const hud = $('hud');

  let currentLevel = 0;
  let uiState = 'menu';
  let phase = 'level'; // 'boss' | 'level'
  let carriedScore = 0;
  let bossCarry = null;
  let shopAfterLevel = false;

  /* ================= NAVIGATION ÉCRANS ================= */

  function show(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (name && screens[name]) screens[name].classList.remove('hidden');
    hud.classList.toggle('hidden', !(name === null || name === 'pause' || name === 'unlock'));
    uiState = name || 'playing';
    if (name) {
      $('btn-shoot').classList.add('hidden');
      $('btn-puchita').classList.add('hidden');
    }
  }

  function toMenu() {
    Game.stop();
    AudioMan.stopMusic();
    $('menu-best').textContent = `🏆 Meilleur score : ${Save.data.best}`;
    $('menu-credits').textContent = `💎 ${Save.data.credits} crédits`;
    show('menu');
  }

  /* ================= HUD ================= */

  const EFFECT_LABELS = { speed: '⚡ TURBO', invincible: '🌟 STAR', multi: '💰 ×2' };

  function refreshHud() {
    const S = Game.state;
    $('hud-score').textContent = `SCORE ${S.score}`;
    $('hud-best').textContent = `🏆 ${Save.data.best}`;
    $('hud-length').textContent = `📏 ${snakeCm(S.snake)} cm`;
    if (S.mode === 'boss' && S.bossDef) {
      $('hud-level').textContent = `⚔️ ${S.bossDef.name}`;
      $('hud-goal').textContent = `❤️ ${S.bossHp}/${S.bossMax}`;
    } else {
      $('hud-level').textContent = `${S.level.emoji} ${S.level.name}`;
      $('hud-goal').textContent = `🎯 ${S.score}/${S.level.goal}`;
    }
  }

  function refreshEffects() {
    const S = Game.state;
    const box = $('hud-bonuses');
    const t = performance.now();
    const active = Object.entries(S.effects).filter(([, until]) => until > t);
    // reconstruit seulement si nécessaire
    box.innerHTML = '';
    if (S.capote) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = '<span>🛡️ CAPOTE AU SOL</span>';
      box.appendChild(chip);
    }
    if (S.shield) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = '<span>🛡️ PROTÉGÉ</span><span class="bar"><i style="width:100%"></i></span>';
      box.appendChild(chip);
    }
    if (S.antigrav) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = '<span>🌀 ANTI-G</span>';
      box.appendChild(chip);
    }
    if ((S.spermShots || 0) > 0) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = `<span>💦 ×${S.spermShots}</span>`;
      box.appendChild(chip);
    }
    if (S.puchitaReady && !S.puchita) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = '<span>💕 HELLO BOYS</span>';
      box.appendChild(chip);
    }
    if (S.puchita) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = S.puchita.phase === 'hello'
        ? '<span>💕 hello boys…</span>'
        : '<span>💕 PUCHITA</span>';
      box.appendChild(chip);
    }
    $('btn-shoot').classList.toggle('hidden', uiState !== 'playing' || (S.spermShots || 0) <= 0);
    $('btn-puchita').classList.toggle('hidden', uiState !== 'playing' || !S.puchitaReady || !!S.puchita);
    for (const [id, until] of active) {
      const type = Game.BONUS_TYPES.find(b => b.id === id);
      if (!type) continue;
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      const pct = Math.max(0, (until - t) / type.dur) * 100;
      chip.innerHTML = `<span>${EFFECT_LABELS[id]}</span><span class="bar"><i style="width:${pct}%"></i></span>`;
      box.appendChild(chip);
    }
  }

  /* ================= PARTIE ================= */

  function gameCallbacks() {
    return {
      onscore: refreshHud,
      onlength: refreshHud,
      ongoal: refreshHud,
      oneffects: refreshEffects,
      onGameOver: handleGameOver,
      onLevelClear: handleLevelClear,
      onBossWin: handleBossWin,
      onBossReady: handleBossReady,
      onCapoteSpawn: () => showToast('🛡️ Une capote est apparue — ramasse-la !'),
      onCapoteOn: () => showToast('🛡️ Capote enfilée. Virus, rivaux, et le boss.'),
      onSaved: () => showToast('🛡️ La capote t\u2019a sauvé la vie ! (il fallait la changer)'),
      onSavedBoss: () => showToast('🛡️ La capote a encaissé le coup du boss !'),
      onRivalKill: ({ name, pts }) => showToast(`💥 ${name} à terre. +${pts} pts`),
      onPuchitaHello: () => showToast('💕 hello boys'),
      onPuchitaKill: ({ name, pts }) => showToast(`💕 Puchita a descendu ${name} ! +${pts} pts`),
      onPuchitaBye: () => showToast('💕 Puchita a pris le coup. Quelle héroïne.'),
      onGrow: ({ grow, name, emoji }) => {
        if (grow >= 2) showToast(`${emoji || '✨'} ${name} ! +${grow} cm`);
      },
      onShopUnlock: items => showShopUnlock(items),
    };
  }

  function startLevel(index) {
    currentLevel = index;
    carriedScore = 0;
    bossCarry = null;
    phase = 'level';
    beginLevelPlay(0);
  }

  function beginBossFight() {
    phase = 'boss';
    show(null);
    AudioMan.startMusic(LEVELS[currentLevel].music);
    Game.startBoss(currentLevel, gameCallbacks(), bossCarry);
    refreshHud();
  }

  function beginLevelPlay(carry) {
    phase = 'level';
    show(null);
    AudioMan.startMusic(LEVELS[currentLevel].music);
    Game.start(currentLevel, gameCallbacks(), carry || 0);
    refreshHud();
  }

  function handleBossReady(carry) {
    bossCarry = carry;
    phase = 'boss';
    const L = LEVELS[currentLevel];
    const B = BOSSES[currentLevel];
    $('boss-title').textContent = `${B.emoji} ${B.name}`;
    $('boss-sub').textContent = `Après ${L.emoji} ${L.name} · ${carry.score} pts · ${snakeCm(carry.snake)} cm`;
    $('boss-taunt').textContent = `« ${B.taunt} »`;
    showToast('⚔️ Le boss est là. Tu gardes tout ce que tu as gagné.');
    AudioMan.stopMusic();
    show('boss');
  }

  function handleBossWin({ score, name }) {
    carriedScore = score;
    showToast(`⚔️ ${name} est à terre !`);
    handleLevelClear({ score });
  }

  function handleGameOver({ score, reason, detail }) {
    const unlocked = Save.addScore(score);
    const isRecord = score >= Save.data.best && score > 0;
    const reasons = {
      mur: 'Tu t\u2019es écrasé contre le mur. Classe.',
      corps: 'Tu t\u2019es mangé toi-même. On ne juge pas.',
      obstacle: detail
        ? `Bousculé par ${detail}. Elle était pas commode.`
        : 'Percuté par un obstacle ridicule. Bravo.',
      rival: detail
        ? `${detail} t’a mordu les boules. Aïe.`
        : 'On t’a mordu les boules. C’était prévisible.',
    };
    $('gameover-reason').textContent = reasons[reason] || 'Fin tragique et inexpliquée.';
    $('gameover-score').textContent = `Score : ${score}`;
    $('gameover-record').textContent = isRecord ? '🎉 NOUVEAU RECORD !' : `Record : ${Save.data.best}`;
    show('gameover');
    notifyUnlocks(unlocked);
  }

  function handleLevelClear({ score }) {
    AudioMan.sfx.levelClear();
    const isLast = currentLevel >= LEVELS.length - 1;
    Save.unlockLevel(Math.min(LEVELS.length, currentLevel + 2));
    const unlocked = Save.addScore(score);
    const gain = 8 + currentLevel * 2 + Math.floor(score / 80);
    Save.addCredits(gain);
    notifyUnlocks(unlocked);
    if (isLast) {
      AudioMan.sfx.victory();
      $('victory-score').textContent = `Score : ${score}  ·  💎 ${Save.data.credits} crédits`;
      show('victory');
    } else {
      openShop({ afterLevel: true, gain, nextName: LEVELS[currentLevel + 1] });
    }
  }

  function openShop({ afterLevel, gain, nextName }) {
    shopAfterLevel = !!afterLevel;
    $('shop-title').textContent = afterLevel ? '🎉 NIVEAU TERMINÉ' : '💎 BOUTIQUE';
    $('shop-sub').textContent = afterLevel && nextName
      ? `Prochaine étape : ${nextName.emoji} ${nextName.name}. Achète un bonus pour le prochain niveau.`
      : 'Dépense tes crédits. Chaque bonus est consommé au lancement d’un niveau.';
    $('shop-credits').textContent = `💎 ${Save.data.credits} crédits`;
    $('shop-eaten').textContent = `🍏 ${Save.data.eatenTotal || 0} objets ramassés`;
    if (afterLevel && gain) {
      $('shop-gain').textContent = `+${gain} crédits gagnés`;
      $('shop-gain').classList.remove('hidden');
    } else {
      $('shop-gain').classList.add('hidden');
    }
    $('btn-shop-next').classList.toggle('hidden', !afterLevel);
    $('btn-shop-back').textContent = afterLevel ? '🏠 Menu' : '← Retour';
    buildShopGrid();
    show('shop');
  }

  function buildShopGrid() {
    const grid = $('shop-grid');
    grid.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
      const owned = Save.kitCount(item.id);
      const locked = !Save.isShopUnlocked(item.id);
      const card = document.createElement('div');
      card.className = 'shop-card' + (locked ? ' locked' : '');
      if (locked) {
        card.innerHTML = `<h3>🔒 ???</h3><p>Ramasse ${item.unlockEaten} objets en jeu pour débloquer cet article.</p>`;
        const meta = document.createElement('div');
        meta.className = 'shop-meta';
        meta.innerHTML = `<span>${Save.data.eatenTotal || 0} / ${item.unlockEaten}</span>`;
        const btn = document.createElement('button');
        btn.textContent = 'Verrouillé';
        btn.disabled = true;
        meta.appendChild(btn);
        card.appendChild(meta);
        grid.appendChild(card);
        return;
      }
      const btn = document.createElement('button');
      btn.textContent = `Acheter · ${item.cost}💎`;
      btn.disabled = Save.data.credits < item.cost;
      btn.addEventListener('click', () => {
        if (!Save.buy(item.id)) return;
        AudioMan.sfx.bonus();
        $('shop-credits').textContent = `💎 ${Save.data.credits} crédits`;
        if ($('menu-credits')) $('menu-credits').textContent = `💎 ${Save.data.credits} crédits`;
        buildShopGrid();
        showToast(`${item.emoji} ${item.name} dans le kit !`);
      });
      card.innerHTML = `<h3>${item.emoji} ${item.name}</h3><p>${item.desc}</p>`;
      const meta = document.createElement('div');
      meta.className = 'shop-meta';
      meta.innerHTML = `<span>en stock : ${owned}</span>`;
      meta.appendChild(btn);
      card.appendChild(meta);
      grid.appendChild(card);
    });
  }

  function showShopUnlock(items) {
    if (!items || !items.length) return;
    Game.pause();
    const many = items.length > 1;
    $('unlock-title').textContent = many ? 'Objets débloqués' : `${items[0].emoji} ${items[0].name}`;
    const list = $('unlock-list');
    list.innerHTML = items.map(it =>
      `<p class="unlock-item">${it.emoji} <strong>${it.name}</strong><br><span>${it.desc}</span></p>`
    ).join('');
    AudioMan.sfx.bonus();
    show('unlock');
  }

  function dismissShopUnlock() {
    if (uiState !== 'unlock') return;
    AudioMan.sfx.click();
    Game.resume();
    show(null);
    refreshEffects();
  }

  let toastTimer = null;
  function showToast(text) {
    const toast = $('toast');
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  function notifyUnlocks(skins) {
    if (!skins || !skins.length) return;
    showToast(`🎭 Skin débloqué : ${skins.map(s => s.name).join(', ')} !`);
    AudioMan.sfx.bonus();
  }

  /* ================= MENUS : NIVEAUX & SKINS ================= */

  function buildLevelGrid() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const locked = L.id > Save.data.unlockedLevel;
      const card = document.createElement('button');
      card.className = 'level-card' + (locked ? ' locked' : '');
      card.innerHTML = `<span class="lv-emoji">${locked ? '🔒' : L.emoji}</span><span class="lv-name">${L.name}</span>`;
      if (!locked) card.addEventListener('click', () => { AudioMan.sfx.click(); startLevel(i); });
      grid.appendChild(card);
    });
  }

  function buildSkinGrid() {
    const grid = $('skin-grid');
    grid.innerHTML = '';
    SKINS.forEach(skin => {
      const locked = !Save.isSkinUnlocked(skin);
      const card = document.createElement('button');
      card.className = 'skin-card' + (locked ? ' locked' : '') + (Save.data.skin === skin.id ? ' selected' : '');
      const cv = document.createElement('canvas');
      cv.width = 120; cv.height = 60;
      Game.drawSkinPreview(cv, skin);
      card.appendChild(cv);
      const name = document.createElement('span');
      name.className = 'sk-name';
      name.textContent = locked ? '❓ ???' : skin.name;
      card.appendChild(name);
      const sub = document.createElement('span');
      sub.className = 'sk-unlock';
      sub.textContent = locked ? `🔒 ${skin.unlock} pts cumulés` : (Save.data.skin === skin.id ? '✅ équipé' : 'clique pour équiper');
      card.appendChild(sub);
      if (!locked) card.addEventListener('click', () => {
        Save.data.skin = skin.id;
        Save.write();
        AudioMan.sfx.click();
        buildSkinGrid();
      });
      grid.appendChild(card);
    });
  }

  /* ================= BOUTONS ================= */

  const click = (id, fn) => $(id).addEventListener('click', () => { AudioMan.sfx.click(); fn(); });

  click('btn-play', () => startLevel(0));
  click('btn-levels', () => { buildLevelGrid(); show('levels'); });
  click('btn-shop', () => openShop({ afterLevel: false }));
  click('btn-skins', () => { buildSkinGrid(); show('skins'); });
  click('btn-fight', beginBossFight);
  click('btn-resume', resumeGame);
  click('btn-quit', toMenu);
  click('btn-shop-next', () => startLevel(currentLevel + 1));
  click('btn-shop-back', toMenu);
  click('btn-replay', () => startLevel(0));
  click('btn-gameover-menu', toMenu);
  click('btn-victory-menu', toMenu);
  click('btn-unlock-ok', dismissShopUnlock);
  $('btn-shoot').addEventListener('click', e => {
    e.stopPropagation();
    Game.tryShoot();
  });
  $('btn-puchita').addEventListener('click', e => {
    e.stopPropagation();
    Game.callPuchita();
  });
  document.querySelectorAll('[data-back]').forEach(b =>
    b.addEventListener('click', () => { AudioMan.sfx.click(); toMenu(); }));

  function pauseGame() {
    if (uiState !== 'playing') return;
    Game.pause();
    AudioMan.stopMusic();
    show('pause');
  }
  function resumeGame() {
    if (uiState !== 'pause') return;
    AudioMan.startMusic(LEVELS[currentLevel].music);
    Game.resume();
    show(null);
  }

  /* ================= CLAVIER ================= */

  const KEYMAP = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    // ZQSD (azerty) + WASD (qwerty)
    KeyW: [0, -1], KeyZ: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyQ: [-1, 0], KeyD: [1, 0],
  };

  document.addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (uiState === 'playing') pauseGame();
      else if (uiState === 'pause') resumeGame();
      else if (uiState === 'unlock') dismissShopUnlock();
      e.preventDefault();
      return;
    }
    if (uiState === 'playing' && KEYMAP[e.code]) {
      Game.setDirection(...KEYMAP[e.code]);
      e.preventDefault();
    } else if (uiState === 'playing' && (e.code === 'Space' || e.code === 'KeyE')) {
      Game.tryShoot();
      e.preventDefault();
    } else if (uiState === 'playing' && e.code === 'KeyH') {
      Game.callPuchita();
      e.preventDefault();
    } else if ((e.code === 'Enter' || e.code === 'Space') && uiState === 'unlock') {
      dismissShopUnlock();
      e.preventDefault();
    } else if ((e.code === 'Enter' || e.code === 'Space') && uiState === 'gameover') {
      AudioMan.sfx.click();
      startLevel(0);
    } else if ((e.code === 'Enter' || e.code === 'Space') && uiState === 'boss') {
      AudioMan.sfx.click();
      beginBossFight();
    } else if ((e.code === 'Enter') && uiState === 'shop' && shopAfterLevel) {
      AudioMan.sfx.click();
      startLevel(currentLevel + 1);
    }
  });

  /* ================= MANETTE ================= */

  let padPrev = {};
  function pollGamepad() {
    requestAnimationFrame(pollGamepad);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(p => p && p.connected);
    if (!pad) return;

    const pressed = i => pad.buttons[i] && pad.buttons[i].pressed;
    const justPressed = i => pressed(i) && !padPrev[i];

    if (uiState === 'playing') {
      // croix directionnelle
      if (pressed(12)) Game.setDirection(0, -1);
      else if (pressed(13)) Game.setDirection(0, 1);
      else if (pressed(14)) Game.setDirection(-1, 0);
      else if (pressed(15)) Game.setDirection(1, 0);
      // stick gauche
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.abs(ax) > 0.55 || Math.abs(ay) > 0.55) {
        if (Math.abs(ax) > Math.abs(ay)) Game.setDirection(Math.sign(ax), 0);
        else Game.setDirection(0, Math.sign(ay));
      }
      if (justPressed(9)) pauseGame(); // Start
      if (justPressed(0) || justPressed(1)) Game.tryShoot();
      if (justPressed(3) || justPressed(2)) Game.callPuchita();
    } else if (uiState === 'pause') {
      if (justPressed(9) || justPressed(0)) resumeGame();
    } else if (uiState === 'unlock') {
      if (justPressed(0) || justPressed(9)) dismissShopUnlock();
    } else if (uiState === 'gameover') {
      if (justPressed(0)) {
        AudioMan.sfx.click();
        startLevel(0);
      }
    } else if (uiState === 'boss') {
      if (justPressed(0)) { AudioMan.sfx.click(); beginBossFight(); }
    } else if (uiState === 'shop') {
      if (justPressed(0) && shopAfterLevel) { AudioMan.sfx.click(); startLevel(currentLevel + 1); }
      else if (justPressed(1)) { AudioMan.sfx.click(); toMenu(); }
    } else if (uiState === 'menu') {
      if (justPressed(0)) { AudioMan.sfx.click(); startLevel(0); } // A = jouer
    } else if (uiState === 'victory') {
      if (justPressed(0)) { AudioMan.sfx.click(); toMenu(); }
    }

    padPrev = {};
    pad.buttons.forEach((b, i) => { padPrev[i] = b.pressed; });
  }
  requestAnimationFrame(pollGamepad);

  /* ================= TACTILE (swipe) ================= */

  let touchStart = null;
  const wrap = $('game-wrap');
  wrap.addEventListener('touchstart', e => {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  wrap.addEventListener('touchmove', e => {
    if (!touchStart || uiState !== 'playing') return;
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.hypot(dx, dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) Game.setDirection(Math.sign(dx), 0);
    else Game.setDirection(0, Math.sign(dy));
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  /* ================= DÉMARRAGE ================= */

  // débloque l'audio au premier geste (politique navigateur)
  document.addEventListener('pointerdown', () => AudioMan.ensureCtx(), { once: true });

  toMenu();
})();
