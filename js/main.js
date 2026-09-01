/* ===== ZIGOUIGOUI — interface, entrées, progression ===== */

(() => {
  Save.load();

  const $ = id => document.getElementById(id);
  const screens = {
    menu: $('screen-menu'), levels: $('screen-levels'), skins: $('screen-skins'),
    boss: $('screen-boss'), shop: $('screen-shop'), unlock: $('screen-unlock'),
    pause: $('screen-pause'), gameover: $('screen-gameover'),
    cine: $('screen-cine'), victory: $('screen-victory'),
  };
  const hud = $('hud');

  let currentLevel = 0;
  let uiState = 'menu';
  let phase = 'level'; // 'boss' | 'level'
  let carriedScore = 0;
  let bossCarry = null;
  let shopAfterLevel = false;
  let cineRaf = 0;
  let cineDone = true;
  let cineVictoryScore = 0;

  /* ================= NAVIGATION ÉCRANS ================= */

  function isTouchPlay() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
      window.matchMedia('(pointer: coarse)').matches;
  }

  function syncPlayControls() {
    const playing = uiState === 'playing';
    const pad = $('touch-pad');
    const pauseBtn = $('btn-pause-hud');
    const showPad = playing && isTouchPlay();
    if (pad) {
      pad.classList.toggle('hidden', !showPad);
      pad.setAttribute('aria-hidden', showPad ? 'false' : 'true');
    }
    if (pauseBtn) pauseBtn.classList.toggle('hidden', !playing);
  }

  function syncAdButtons() {
    const cont = $('btn-ad-continue');
    const cred = $('btn-ad-credits');
    if (cont) cont.classList.toggle('hidden', uiState !== 'gameover' || !AdsMan.canContinue());
    if (cred) {
      cred.classList.toggle('hidden', uiState !== 'shop' || !AdsMan.canCredits());
      cred.textContent = `📺 +${AdsMan.CONFIG.creditsPerAd} crédits (pub)`;
    }
  }

  function show(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (name && screens[name]) screens[name].classList.remove('hidden');
    hud.classList.toggle('hidden', !(name === null || name === 'pause' || name === 'unlock'));
    uiState = name || 'playing';
    if (name) {
      $('btn-shoot').classList.add('hidden');
      $('btn-puchita').classList.add('hidden');
    }
    syncPlayControls();
    syncAdButtons();
  }

  function toMenu() {
    abortCinematic();
    Game.stop();
    Game.clearProgress();
    AudioMan.stopMusic();
    $('menu-best').textContent = `🏆 Meilleur score : ${Save.data.best}`;
    $('menu-credits').textContent = `💎 ${Save.data.credits} crédits`;
    const hero = $('menu-hero');
    if (hero) {
      const skin = SKINS.find(s => s.id === Save.data.skin) || SKINS[0];
      Game.drawSkinPreview(hero, skin);
    }
    AudioMan.duckMusic(false);
    AudioMan.startMusic('menu');
    show('menu');
  }

  /* ================= HUD ================= */

  const EFFECT_LABELS = { speed: '⚡ Turbo', invincible: '🌟 Invincible', multi: '💰 Score ×2' };

  function refreshHud() {
    const S = Game.state;
    $('hud-score').textContent = `${S.score}`;
    $('hud-length').textContent = `${snakeCm(S.snake).toFixed(1)} cm`;
    const lives = S.lives || 0;
    const livesEl = $('hud-lives');
    livesEl.textContent = `💛 ${lives}`;
    livesEl.classList.toggle('hidden', lives <= 0);
    if (S.mode === 'boss' && S.bossDef) {
      $('hud-level').textContent = `⚔️ ${S.bossDef.name}`;
      $('hud-goal').textContent = `Hits ${S.bossHp}/${S.bossMax}`;
    } else if (S.rivalKillsNeeded) {
      $('hud-level').textContent = `${S.level.emoji} ${S.level.name}`;
      $('hud-goal').textContent = `Rivaux ${S.rivalKills || 0}/${S.rivalKillsNeeded}`;
    } else {
      $('hud-level').textContent = `${S.level.emoji} ${S.level.name}`;
      $('hud-goal').textContent = `${Math.max(0, S.score - (S.scoreAtLevelStart || 0))}/${S.level.goal}`;
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
      chip.innerHTML = '<span>🛡️ Capote au sol</span>';
      box.appendChild(chip);
    }
    if (S.shield) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = '<span>🛡️ Protégé</span><span class="bar"><i style="width:100%"></i></span>';
      box.appendChild(chip);
    }
    if (S.antigrav) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = '<span>🌀 Anti-G</span>';
      box.appendChild(chip);
    }
    if ((S.spermShots || 0) > 0) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = `<span>💦 Tirs ×${S.spermShots}</span>`;
      box.appendChild(chip);
    }
    if (S.puchitaReady && !S.puchita) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = '<span>💕 Puchita prête</span>';
      box.appendChild(chip);
    }
    if (S.puchita) {
      const chip = document.createElement('div');
      chip.className = 'bonus-chip';
      chip.innerHTML = S.puchita.phase === 'hello'
        ? '<span>💕 hello boys…</span>'
        : '<span>💕 Puchita</span>';
      box.appendChild(chip);
    }
    $('btn-shoot').classList.toggle('hidden', uiState !== 'playing' || (S.spermShots || 0) <= 0);
    $('btn-puchita').classList.toggle('hidden', uiState !== 'playing' || !S.puchitaReady || !!S.puchita);
    for (const [id, until] of active) {
      const type = Game.BONUS_TYPES.find(b => b.id === id);
      if (!type || !type.dur) continue;
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
      onlives: refreshHud,
      oneffects: refreshEffects,
      onGameOver: handleGameOver,
      onLevelClear: handleLevelClear,
      onBossWin: handleBossWin,
      onBossReady: handleBossReady,
      onCapoteSpawn: () => showToast('🛡️ Une capote est apparue — ramasse-la !'),
      onCapoteOn: () => showToast('🛡️ Capote enfilée. Rivaux, et le boss.'),
      onAmmo: ({ n }) => showToast(`💦 +${n} tirs ! Espace pour shooter. Inutilisés, tu les gardes.`),
      onCombatPack: ({ name, emoji }) => showToast(`${emoji} ${name} !`),
      onSkillSpawn: ({ name, emoji }) => showToast(`${emoji} ${name} est apparu — va le chercher !`),
      onSaved: () => showToast('🛡️ La capote t\u2019a sauvé la vie ! (il fallait la changer)'),
      onSavedLife: () => showToast('💛 Le cœur d’or t’a sauvé !'),
      onGoldHeart: () => showToast('💛 Un cœur d’or ! Ramasse-le pour une vie.'),
      onLifeUp: () => showToast('💛 +1 vie !'),
      onSavedBoss: () => showToast('🛡️ La capote a encaissé le coup du boss !'),
      onRivalKill: ({ name, pts }) => {
        const S = Game.state;
        const left = Math.max(0, (S.rivalKillsNeeded || 0) - (S.rivalKills || 0));
        showToast(left > 0
          ? `💥 ${name} à terre. +${pts} pts · encore ${left}`
          : `💥 ${name} à terre. +${pts} pts`);
      },
      onPuchitaHello: () => showToast('💕 hello boys'),
      onPuchitaKill: ({ name, pts }) => showToast(`💕 Puchita a descendu ${name} ! +${pts} pts`),
      onPuchitaBye: () => showToast('💕 Puchita a pris le coup. Quelle héroïne.'),
      onTanked: ({ cm }) => showToast(`💪 Trop costaud. T’encaisses, -${cm} cm`),
      onGrow: ({ grow, name, emoji, toast }) => {
        if (grow < 0) showToast(`${emoji || '☠️'} ${name} ! ${grow} cm`);
        else if (toast || grow >= 1) showToast(`${emoji || '✨'} ${name} ! +${grow} cm`);
      },
      onShopUnlock: items => showShopUnlock(items),
    };
  }

  function startLevel(index, opts) {
    const cont = !!(opts && opts.continueRun);
    currentLevel = index;
    bossCarry = null;
    phase = 'level';
    if (!cont) {
      carriedScore = 0;
      Game.clearProgress();
      AdsMan.newRun();
    }
    beginLevelPlay(0);
  }

  function applyWorldAura(L) {
    const wrap = $('game-wrap');
    wrap.dataset.deco = (L && L.deco) || '';
    wrap.style.setProperty('--aura', (L && L.aura) || '#ff6fa5');
  }

  function beginBossFight() {
    phase = 'boss';
    show(null);
    applyWorldAura(LEVELS[currentLevel]);
    AudioMan.duckMusic(false);
    AudioMan.startMusic(LEVELS[currentLevel].music);
    Game.startBoss(currentLevel, gameCallbacks(), bossCarry);
    refreshHud();
  }

  function beginLevelPlay(carry) {
    phase = 'level';
    show(null);
    const L = LEVELS[currentLevel];
    applyWorldAura(L);
    AudioMan.startMusic(L.music);
    showPlayHint();
    Game.start(currentLevel, gameCallbacks(), carry || 0);
    refreshHud();
  }

  function handleBossReady(carry) {
    bossCarry = carry;
    phase = 'boss';
    const L = LEVELS[currentLevel];
    const B = BOSSES[currentLevel];
    $('boss-title').textContent = `${B.emoji} ${B.name}`;
    $('boss-sub').textContent = `Après ${L.emoji} ${L.name} · ${carry.score} pts · ${snakeCm(carry.snake).toFixed(1)} cm`;
    $('boss-taunt').textContent = `« ${B.taunt} »`;
    const hits = bossHitsForLevel(currentLevel);
    $('boss-rule').textContent = `Règle : mords-lui les boules (halo jaune). Niveau ${currentLevel + 1} → ${hits} hit${hits > 1 ? 's' : ''}. Le reste du corps ne compte pas.`;
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
      puchita: detail
        ? `${detail} t’a réduit à néant. Plus rien à montrer.`
        : 'Réduit à 0 cm. Game over.',
    };
    $('gameover-reason').textContent = reasons[reason] || 'Fin tragique et inexpliquée.';
    $('gameover-score').textContent = `Score : ${score}`;
    $('gameover-record').textContent = isRecord ? '🎉 NOUVEAU RECORD !' : `Record : ${Save.data.best}`;
    show('gameover');
    notifyUnlocks(unlocked);
  }

  function handleLevelClear({ score }) {
    Game.keepProgress();
    AudioMan.sfx.levelClear();
    const isLast = currentLevel >= LEVELS.length - 1;
    Save.unlockLevel(Math.min(LEVELS.length, currentLevel + 2));
    const unlocked = Save.addScore(score);
    const gain = 8 + currentLevel * 2 + Math.floor(score / 80);
    Save.addCredits(gain);
    notifyUnlocks(unlocked);
    if (isLast) {
      playEndingCinematic(score);
    } else {
      openShop({ afterLevel: true, gain, nextName: LEVELS[currentLevel + 1] });
    }
  }

  function abortCinematic() {
    cineDone = true;
    if (cineRaf) cancelAnimationFrame(cineRaf);
    cineRaf = 0;
    const cap = $('cine-caption');
    if (cap) cap.textContent = '';
  }

  function finishCinematic() {
    if (cineDone && uiState !== 'cine') return;
    abortCinematic();
    AudioMan.sfx.victory();
    $('victory-score').textContent = `Score : ${cineVictoryScore}  ·  💎 ${Save.data.credits} crédits`;
    show('victory');
  }

  function playEndingCinematic(score, forceDude) {
    cineVictoryScore = score;
    cineDone = false;
    Game.stop();
    AudioMan.stopMusic();
    AudioMan.startMusic('menu');
    const dude = forceDude === true || (forceDude !== false && Math.random() < 0.22);
    const cap = $('cine-caption');
    const lines = dude
      ? [
        [0.00, 'Au bout du Grand Corps…'],
        [0.14, 'Ta promise t’attend.'],
        [0.32, 'Il sourit. Bizarre.'],
        [0.50, 'Jean-Miche s’approche…'],
        [0.70, 'Attends. C’est pas elle.'],
      ]
      : [
        [0.00, 'Au bout du Grand Corps…'],
        [0.14, 'Ta Puchita t’attend.'],
        [0.32, 'Elle sourit.'],
        [0.50, 'Elle s’approche…'],
        [0.70, 'Bouche ouverte. On y va ?'],
      ];
    show('cine');
    const cv = $('cine-canvas');
    const t0 = performance.now();
    const DUR = 8600;
    let kissed = false;
    function tick(now) {
      if (cineDone) return;
      const u = Math.min(1, (now - t0) / DUR);
      Game.drawEndingCine(cv, u, dude);
      let text = lines[0][1];
      for (const [at, line] of lines) if (u >= at) text = line;
      if (cap) cap.textContent = text;
      if (u > 0.56 && !kissed) {
        kissed = true;
        AudioMan.sfx.kiss();
      }
      if (u >= 1) finishCinematic();
      else cineRaf = requestAnimationFrame(tick);
    }
    cineRaf = requestAnimationFrame(tick);
  }

  function openShop({ afterLevel, gain, nextName }) {
    shopAfterLevel = !!afterLevel;
    $('shop-title').textContent = afterLevel ? '🎉 NIVEAU TERMINÉ' : '💎 BOUTIQUE';
    $('shop-sub').textContent = afterLevel && nextName
      ? `Tu gardes taille, vies et compétences non utilisées. Un bonus popera sur la prochaine map. Suite : ${nextName.emoji} ${nextName.name}.`
      : 'Un bonus par niveau, sur la map. Ce que tu n’utilises pas, tu le gardes.';
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
        showToast(`${item.emoji} ${item.name} : il popera sur la map.`);
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
  let toastQueue = [];
  let toastBusy = false;
  function showToast(text) {
    if (!text) return;
    toastQueue.push(text);
    pumpToast();
  }
  function pumpToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    const toast = $('toast');
    toast.textContent = toastQueue.shift();
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
      toastBusy = false;
      pumpToast();
    }, 2600);
  }

  let hintTimer = null;
  function showPlayHint() {
    showToast(isTouchPlay()
      ? '📱 Croix ou swipe pour diriger · ramasse le bonus qui brille'
      : '➡️ Flèches pour bouger · ramasse le bonus qui brille');
  }

  function syncMuteBtn() {
    const btn = $('btn-mute');
    if (!btn) return;
    const off = AudioMan.isMuted();
    btn.textContent = off ? '🔇' : '🔊';
    btn.title = off ? 'Remettre le son (M)' : 'Couper le son (M)';
  }
  function toggleMute() {
    const off = AudioMan.setMuted(!AudioMan.isMuted());
    Save.data.muted = off;
    Save.write();
    syncMuteBtn();
  }

  function notifyUnlocks(skins) {
    if (!skins || !skins.length) return;
    const openedGold = skins.some(s => s.id === 'or');
    const prestige = skins.filter(s => s.prestige);
    const other = skins.filter(s => !s.prestige && !s.id.startsWith('flag-') && !s.requiresGold);
    const names = [];
    if (openedGold) names.push('Skin Or + toute la garde-robe');
    for (const s of prestige) {
      if (s.id !== 'or') names.push(s.name);
    }
    for (const s of other) names.push(s.name);
    if (!names.length) {
      const first = skins.find(s => !s.id.startsWith('flag-')) || skins[0];
      names.push(first.name);
    }
    showToast(`🎭 ${names.join(', ')} débloqué${names.length > 1 ? 's' : ''} !`);
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
      if (L.aura) card.style.setProperty('--aura', L.aura);
      card.innerHTML = `<span class="lv-emoji">${locked ? '🔒' : L.emoji}</span><span class="lv-name">${L.name}</span>${L.soul ? `<span class="lv-soul">${L.soul}</span>` : ''}${L.mood ? `<span class="lv-mood">${L.mood}</span>` : ''}`;
      if (!locked) card.addEventListener('click', () => { AudioMan.sfx.click(); startLevel(i); });
      grid.appendChild(card);
    });
  }

  let skinIndex = 0;

  function renderSkinCarousel() {
    const skin = SKINS[skinIndex];
    const locked = !Save.isSkinUnlocked(skin);
    const equipped = Save.data.skin === skin.id;
    const cv = $('skin-preview');
    Game.drawSkinPreview(cv, skin);
    if (locked) {
      const c = cv.getContext('2d');
      c.save();
      c.fillStyle = 'rgba(16, 6, 28, .78)';
      c.fillRect(0, 0, cv.width, cv.height);
      c.font = '52px "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🔒', cv.width / 2, cv.height / 2);
      c.restore();
    }
    $('skin-count').textContent = `${skinIndex + 1} / ${SKINS.length}`;
    const gated = !!(skin.requiresGold && !Save.hasGoldSkin());
    const showName = !locked || !!skin.prestige;
    $('skin-name').textContent = showName ? skin.name : '❓ ???';
    if (locked) {
      $('skin-status').textContent = gated
        ? `🔒 D’abord le Skin Or (${SKIN_GOLD_AT} pts)`
        : `🔒 ${skin.unlock} pts cumulés pour le débloquer`;
    } else {
      $('skin-status').textContent = equipped ? '✅ Équipé' : ' ';
    }
    $('skin-equip').classList.toggle('hidden', locked || equipped);
  }

  function moveSkin(dir) {
    skinIndex = (skinIndex + dir + SKINS.length) % SKINS.length;
    renderSkinCarousel();
  }

  function equipCurrentSkin() {
    const skin = SKINS[skinIndex];
    if (!Save.isSkinUnlocked(skin) || Save.data.skin === skin.id) return;
    Save.data.skin = skin.id;
    Save.write();
    AudioMan.sfx.bonus();
    renderSkinCarousel();
  }

  function buildSkinGrid() {
    const found = SKINS.findIndex(s => s.id === Save.data.skin);
    skinIndex = found >= 0 ? found : 0;
    renderSkinCarousel();
  }

  /* ================= BOUTONS ================= */

  const click = (id, fn) => $(id).addEventListener('click', () => { AudioMan.sfx.click(); fn(); });

  click('btn-play', () => startLevel(0));
  click('btn-levels', () => { buildLevelGrid(); show('levels'); });
  click('btn-shop', () => openShop({ afterLevel: false }));
  click('btn-skins', () => { buildSkinGrid(); show('skins'); });
  click('skin-prev', () => moveSkin(-1));
  click('skin-next', () => moveSkin(1));
  click('skin-equip', equipCurrentSkin);
  click('btn-fight', beginBossFight);
  click('btn-resume', resumeGame);
  click('btn-quit', toMenu);
  click('btn-shop-next', () => { startLevel(currentLevel + 1, { continueRun: true }); });
  click('btn-shop-back', toMenu);
  click('btn-replay', () => startLevel(0));
  click('btn-gameover-menu', toMenu);
  $('btn-ad-continue').addEventListener('click', async () => {
    if (uiState !== 'gameover') return;
    AudioMan.sfx.click();
    const ok = await AdsMan.watchContinue();
    if (!ok) {
      showToast('Termine la pub pour continuer.');
      syncAdButtons();
      return;
    }
    const L = LEVELS[currentLevel];
    applyWorldAura(L);
    AudioMan.startMusic(L.music);
    if (!Game.reviveFromAd()) {
      startLevel(currentLevel);
      return;
    }
    show(null);
    refreshHud();
    showToast('💛 Pub vue. T’es invincible quelques secondes.');
  });
  $('btn-ad-credits').addEventListener('click', async () => {
    AudioMan.sfx.click();
    const n = await AdsMan.watchCredits();
    if (!n) {
      showToast('Pas de crédits pour cette fois. Réessaie un peu plus tard.');
      syncAdButtons();
      return;
    }
    $('shop-credits').textContent = `💎 ${Save.data.credits} crédits`;
    if ($('menu-credits')) $('menu-credits').textContent = `💎 ${Save.data.credits} crédits`;
    buildShopGrid();
    syncAdButtons();
    showToast(`💎 +${n} crédits grâce à la pub !`);
  });
  click('btn-victory-menu', toMenu);
  click('btn-cine-skip', finishCinematic);
  click('btn-unlock-ok', dismissShopUnlock);
  $('btn-mute').addEventListener('click', e => {
    e.stopPropagation();
    AudioMan.ensureCtx();
    toggleMute();
  });
  $('btn-shoot').addEventListener('click', e => {
    e.stopPropagation();
    Game.tryShoot();
  });
  $('btn-puchita').addEventListener('click', e => {
    e.stopPropagation();
    Game.callPuchita();
  });
  $('btn-pause-hud').addEventListener('click', e => {
    e.stopPropagation();
    pauseGame();
  });
  document.querySelectorAll('#touch-pad .pad-btn').forEach(btn => {
    const steer = e => {
      e.preventDefault();
      e.stopPropagation();
      if (uiState !== 'playing') return;
      const [x, y] = (btn.dataset.dir || '0,0').split(',').map(Number);
      Game.setDirection(x, y);
    };
    btn.addEventListener('pointerdown', steer);
    btn.addEventListener('click', steer);
  });
  document.querySelectorAll('[data-back]').forEach(b =>
    b.addEventListener('click', () => { AudioMan.sfx.click(); toMenu(); }));

  function pauseGame() {
    if (uiState !== 'playing') return;
    Game.pause();
    AudioMan.duckMusic(true);
    show('pause');
  }
  function resumeGame() {
    if (uiState !== 'pause') return;
    AudioMan.duckMusic(false);
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
    if (e.code === 'KeyM') {
      toggleMute();
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (uiState === 'cine') { finishCinematic(); e.preventDefault(); return; }
      if (uiState === 'playing') pauseGame();
      else if (uiState === 'pause') resumeGame();
      else if (uiState === 'unlock') dismissShopUnlock();
      e.preventDefault();
      return;
    }
    if (uiState === 'skins') {
      if (e.code === 'ArrowLeft') { AudioMan.sfx.click(); moveSkin(-1); e.preventDefault(); return; }
      if (e.code === 'ArrowRight') { AudioMan.sfx.click(); moveSkin(1); e.preventDefault(); return; }
      if (e.code === 'Enter' || e.code === 'Space') { equipCurrentSkin(); e.preventDefault(); return; }
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
      startLevel(currentLevel + 1, { continueRun: true });
    } else if ((e.code === 'Enter' || e.code === 'Space') && uiState === 'cine') {
      finishCinematic();
      e.preventDefault();
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
      if (justPressed(0) && shopAfterLevel) { AudioMan.sfx.click(); startLevel(currentLevel + 1, { continueRun: true }); }
      else if (justPressed(1)) { AudioMan.sfx.click(); toMenu(); }
    } else if (uiState === 'menu') {
      if (justPressed(0)) { AudioMan.sfx.click(); startLevel(0); } // A = jouer
    } else if (uiState === 'cine') {
      if (justPressed(0) || justPressed(1) || justPressed(9)) finishCinematic();
    } else if (uiState === 'victory') {
      if (justPressed(0)) { AudioMan.sfx.click(); toMenu(); }
    }

    padPrev = {};
    pad.buttons.forEach((b, i) => { padPrev[i] = b.pressed; });
  }
  requestAnimationFrame(pollGamepad);

  /* ================= TACTILE (swipe) ================= */

  let touchStart = null;
  document.addEventListener('touchstart', e => {
    if (uiState !== 'playing' || !e.touches[0]) return;
    if (e.target.closest('.pad-btn, .pause-hud-btn, .mute-btn, .action-btn')) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!touchStart || uiState !== 'playing') return;
    if (e.cancelable) e.preventDefault();
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.hypot(dx, dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) Game.setDirection(Math.sign(dx), 0);
    else Game.setDirection(0, Math.sign(dy));
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });
  document.addEventListener('touchend', () => { touchStart = null; }, { passive: true });

  /* ================= DÉMARRAGE ================= */

  // débloque l'audio au premier geste (politique navigateur)
  document.addEventListener('pointerdown', () => {
    AudioMan.ensureCtx();
    if (uiState === 'menu') AudioMan.startMusic('menu');
  }, { once: true });

  AdsMan.onConsent = () => syncAdButtons();
  AdsMan.init();
  AudioMan.setMuted(!!Save.data.muted);
  syncMuteBtn();
  toMenu();
  const cineQ = new URLSearchParams(location.search).get('cine');
  if (cineQ === '1' || cineQ === 'dude' || cineQ === 'puchita') {
    const force = cineQ === 'dude' ? true : cineQ === 'puchita' ? false : undefined;
    setTimeout(() => playEndingCinematic(Save.data.best || 0, force), 250);
  }
})();
