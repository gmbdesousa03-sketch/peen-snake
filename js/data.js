/* ===== ZIGOUIGOUI — données : niveaux, skins, sauvegarde ===== */

const GRID = { COLS: 28, ROWS: 20, CELL: 32 };

function snakeCm(snake) {
  const n = (snake && snake.length) || 0;
  if (n <= 2) return 0.5;
  return 0.5 + (n - 2);
}

/* ---- POINTS ----
   On passe le niveau au score, pas en mangeant un quota d’objets.
   Mini-boss = les pénis rivaux (pas le gros boss de fin). */
const PTS = {
  food: 20,
  bonus: 40,
  virus: 35,
  capote: 15,
  rival: 150,
};

/* ---- petits assistants de placement d'obstacles ---- */
function hline(x1, x2, y, e) {
  const out = [];
  for (let x = x1; x <= x2; x++) out.push({ x, y, e });
  return out;
}
function vline(x, y1, y2, e) {
  const out = [];
  for (let y = y1; y <= y2; y++) out.push({ x, y, e });
  return out;
}
function wallH(x1, x2, y, wall) {
  const out = [];
  for (let x = x1; x <= x2; x++) out.push({ x, y, wall });
  return out;
}
function wallV(x, y1, y2, wall) {
  const out = [];
  for (let y = y1; y <= y2; y++) out.push({ x, y, wall });
  return out;
}

/* ---- MÉCHANTES PUCHITAS ----
   Même personnage que l’alliée, mais grognon. Ce sont les obstacles
   qui tuent (statiques ou en patrouille). variant 0/1/2 = teinte. */
const VIRUS_NAMES = ['Puchita Furax', 'Puchita Jalouse', 'Puchita Toxique'];
const virus = (x, y, variant, move) => ({ x, y, virus: variant % 3, move });

/* ---- NIVEAUX ----
   Les premiers sont plus « Snake classique » (couloirs, murs, plus d’ennemis).
   goal = points pour le boss. */
const LEVELS = [
  {
    id: 1, name: 'Salle de Bain', emoji: '🛁', food: '🧼',
    music: 'bathroom', speed: 5.5, goal: 150,
    bg: ['#d7f1f8', '#c5e6f0'], deco: 'bathroom',
    obstacles: [
      ...wallH(8, 12, 6, 'tile'),
      ...wallH(16, 20, 6, 'tile'),
      ...wallV(14, 10, 13, 'tile'),
      { x: 20, y: 15, e: '🦆' }, { x: 21, y: 15, e: '🦆' },
      virus(7, 3, 0), virus(20, 3, 1), virus(9, 10, 2), virus(18, 12, 0),
    ],
    rivals: 1, rivalSpeed: 1.48,
  },
  {
    id: 2, name: 'Plage', emoji: '🏖️', food: '🍹',
    music: 'beach', speed: 6.4, goal: 280,
    bg: ['#ffe7b0', '#ffd789'], deco: 'beach',
    obstacles: [
      ...wallV(5, 2, 5, 'wood'),
      ...wallV(22, 13, 16, 'wood'),
      ...wallH(10, 13, 9, 'rock'),
      { x: 8, y: 16, e: '⛱️' },
      virus(11, 4, 0), virus(16, 14, 2), virus(7, 11, 1),
      virus(18, 3, 1, { axis: 'x', min: 14, max: 21, dir: 1, every: 5 }),
    ],
    rivals: 2, rivalSpeed: 1.32,
  },
  {
    id: 3, name: 'Boîte de Nuit', emoji: '🪩', food: '🍸',
    music: 'club', speed: 7.4, goal: 400,
    bg: ['#1c1438', '#120c28'], deco: 'club',
    obstacles: [
      ...wallH(11, 16, 7, 'neon'),
      ...wallH(11, 16, 12, 'neon'),
      ...wallV(8, 8, 11, 'neon'),
      ...wallV(19, 8, 11, 'neon'),
      virus(4, 4, 0), virus(23, 15, 1), virus(14, 3, 2),
      virus(23, 3, 2, { axis: 'y', min: 2, max: 7, dir: 1, every: 4 }),
      virus(4, 15, 0, { axis: 'y', min: 12, max: 17, dir: -1, every: 4 }),
    ],
    rivals: 3, rivalSpeed: 1.18,
  },
  {
    id: 4, name: 'Donjon Absurde', emoji: '🏰', food: '🍗',
    music: 'dungeon', speed: 8.3, goal: 420,
    bg: ['#3f3a4c', '#2e2a38'], deco: 'dungeon',
    obstacles: [
      ...wallH(3, 10, 6, 'brick'), ...wallH(17, 24, 6, 'brick'),
      ...wallH(3, 10, 13, 'brick'), ...wallH(17, 24, 13, 'brick'),
      { x: 13, y: 3, e: '🦴' }, { x: 14, y: 16, e: '🦴' },
      virus(6, 9, 1, { axis: 'x', min: 3, max: 11, dir: 1, every: 4 }),
      virus(21, 9, 2, { axis: 'x', min: 16, max: 24, dir: -1, every: 4 }),
      virus(13, 9, 0, { axis: 'y', min: 8, max: 12, dir: 1, every: 5 }),
      virus(3, 16, 1), virus(24, 3, 0),
    ],
    rivals: 4, rivalSpeed: 1.08,
  },
  {
    id: 5, name: 'Espace', emoji: '🚀', food: '⭐',
    music: 'space', speed: 9.3, goal: 550,
    bg: ['#0b0824', '#050314'], deco: 'space',
    obstacles: [
      ...wallH(9, 11, 8, 'asteroid'), ...wallH(16, 18, 8, 'asteroid'),
      { x: 6, y: 4, e: '🪐' }, { x: 21, y: 15, e: '🪐' },
      { x: 13, y: 5, e: '🛸' },
      virus(14, 13, 0, { axis: 'x', min: 8, max: 20, dir: 1, every: 3 }),
      virus(8, 12, 1, { axis: 'y', min: 11, max: 17, dir: 1, every: 4 }),
      virus(20, 12, 2, { axis: 'y', min: 11, max: 17, dir: -1, every: 4 }),
      virus(5, 8, 1), virus(22, 6, 0),
    ],
    rivals: 5, rivalSpeed: 1.00,
  },
  {
    id: 6, name: 'CHAOS FINAL', emoji: '🌪️', food: '🎁',
    music: 'chaos', speed: 10.4, goal: 680,
    bg: ['#3d0a3d', '#1f051f'], deco: 'chaos',
    obstacles: [
      ...wallH(12, 15, 4, 'glitch'),
      ...wallH(12, 15, 15, 'glitch'),
      virus(5, 4, 0), virus(22, 15, 1), virus(14, 17, 2),
      virus(9, 8, 2, { axis: 'x', min: 6, max: 21, dir: 1, every: 3 }),
      virus(18, 12, 0, { axis: 'x', min: 6, max: 21, dir: -1, every: 3 }),
      virus(14, 10, 1, { axis: 'y', min: 5, max: 14, dir: 1, every: 4 }),
      virus(5, 15, 2, { axis: 'y', min: 6, max: 17, dir: -1, every: 3 }),
      virus(22, 4, 0, { axis: 'y', min: 2, max: 13, dir: 1, every: 3 }),
    ],
    rivals: 6, rivalSpeed: 0.88,
  },
];

/* ---- BOSS : un zigouigoui rival avant chaque niveau ---- */
const BOSSES = [
  { name: 'Toto la Douche', taunt: 'Cette cabine est à MOI. Dégage, minus.',
    hp: 1, length: 8, speedMul: 1.28, smart: 0.12, emoji: '🚿',
    skin: { body: '#7ad0de', head: '#5bb8c8', tip: '#3a8a9a', detail: null } },
  { name: 'Le Bronzé Infidèle', taunt: 'La plage, c’est mon territoire. Bronzage obligatoire.',
    hp: 3, length: 9, speedMul: 1.16, smart: 0.30, emoji: '🌴',
    skin: { body: '#d08a4a', head: '#c07438', tip: '#a04e2a', detail: null } },
  { name: 'King du Vestiaire', taunt: 'VIP only. Toi, tu restes à la porte.',
    hp: 4, length: 10, speedMul: 1.06, smart: 0.48, emoji: '🕶️',
    skin: { body: '#5a3d7a', head: '#7b52a8', tip: '#c94b9a', detail: null } },
  { name: 'Sire Queue-en-Fer', taunt: 'Nul ne passe le donjon sans se mesurer à moi.',
    hp: 4, length: 11, speedMul: 0.98, smart: 0.64, emoji: '⚔️',
    skin: { body: '#8a9098', head: '#6e747c', tip: '#c45c3a', detail: null } },
  { name: 'Xéno-Zizi', taunt: 'Personne ne t’entend crier. Surtout pas moi.',
    hp: 5, length: 12, speedMul: 0.90, smart: 0.82, emoji: '👽',
    skin: { body: '#7cff6b', head: '#4ad89a', tip: '#d4ff4a', detail: null } },
  { name: 'LE GRAND CHAOS', taunt: 'Je suis tous les autres. D’un coup. Désolé.',
    hp: 5, length: 14, speedMul: 0.80, smart: 1.0, emoji: '👹',
    skin: { body: '#4a1020', head: '#7a1830', tip: '#ff3a5a', detail: null } },
];

const RIVAL_NAMES = ['Jean-Miche', 'Patoune', 'Le Relou', 'Kevin du Tinder', 'Tonio', 'Stef'];
const RIVAL_SKINS = [
  { body: '#c45c4a', head: '#a84838', tip: '#7a2818', detail: null },
  { body: '#6b4c9a', head: '#553888', tip: '#3a2060', detail: null },
  { body: '#3d6b4a', head: '#2d5538', tip: '#1a3824', detail: null },
];

/* ---- SKINS (déblocage au score cumulé) ---- */
const SKINS = [
  { id: 'naturel', name: 'Le Naturel', unlock: 0,
    body: '#e2b08c', head: '#d9987a', tip: '#c45c68', detail: 'realistic' },
  { id: 'classic', name: 'Le Classique', unlock: 0,
    body: '#f7a8c0', head: '#f791b4', tip: '#e26a97', detail: null },
  { id: 'banana',  name: 'Banane Royale', unlock: 150,
    body: '#ffe135', head: '#ffd21f', tip: '#c99e00', detail: null },
  { id: 'cactus',  name: 'Cactus Câlin', unlock: 400,
    body: '#7bc86c', head: '#67b859', tip: '#4e9a42', detail: 'spikes' },
  { id: 'robot',   name: 'Robo-Zizi 3000', unlock: 800,
    body: '#b8c4cc', head: '#a5b3bd', tip: '#7f8f9a', detail: 'antenna' },
  { id: 'rainbow', name: 'Arc-en-ciel Fabuleux', unlock: 1500,
    body: null, head: null, tip: null, detail: 'rainbow' },
];

/* ---- BOUTIQUE : crédits gagnés après chaque niveau ---- */
const SHOP_ITEMS = [
  { id: 'capote', name: 'Capote de protection', emoji: '🛡️', cost: 5,
    desc: 'Tu commences capoté, et au duel elle encaisse un coup du boss.' },
  { id: 'sperm', name: 'Tir de sperme', emoji: '💦', cost: 7,
    desc: '3 tirs (Espace, clic ou bouton). Ça perce les virus et les gros rivaux.' },
  { id: 'antigrav', name: 'Bouclier anti-gravité', emoji: '🌀', cost: 6,
    desc: 'Les murs, tu les traverses : tu réapparais de l’autre côté.' },
  { id: 'puchita', name: 'Invitation de Puchita', emoji: '💕', cost: 9,
    desc: 'Un bouton 💕 pour l’appeler. Elle fait hello boys, puis elle descend un pénis méchant.' },
];

/* ---- SAUVEGARDE (localStorage) ---- */
const SAVE_KEY = 'zigouigoui-save-v1';

const Save = {
  data: {
    best: 0, totalScore: 0, unlockedLevel: 1, skin: 'naturel',
    credits: 0, kit: { capote: 0, sperm: 0, antigrav: 0, puchita: 0 },
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* sauvegarde corrompue : on repart de zéro */ }
    if (this.data.credits == null) this.data.credits = 0;
    this.data.kit = Object.assign({ capote: 0, sperm: 0, antigrav: 0, puchita: 0 }, this.data.kit || {});
  },
  write() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
  },
  addCredits(n) {
    this.data.credits = Math.max(0, (this.data.credits || 0) + n);
    this.write();
  },
  kitCount(id) { return this.data.kit[id] || 0; },
  buy(id) {
    const item = SHOP_ITEMS.find(x => x.id === id);
    if (!item || this.data.credits < item.cost) return false;
    this.data.credits -= item.cost;
    this.data.kit[id] = (this.data.kit[id] || 0) + 1;
    this.write();
    return true;
  },
  consumeKit() {
    const used = {};
    for (const item of SHOP_ITEMS) {
      if ((this.data.kit[item.id] || 0) > 0) {
        this.data.kit[item.id]--;
        used[item.id] = true;
      }
    }
    this.write();
    return used;
  },
  addScore(score) {
    const newlyUnlocked = [];
    const before = this.data.totalScore;
    this.data.totalScore += score;
    if (score > this.data.best) this.data.best = score;
    for (const s of SKINS) {
      if (s.unlock > 0 && before < s.unlock && this.data.totalScore >= s.unlock) newlyUnlocked.push(s);
    }
    this.write();
    return newlyUnlocked;
  },
  unlockLevel(id) {
    if (id > this.data.unlockedLevel) { this.data.unlockedLevel = id; this.write(); }
  },
  isSkinUnlocked(skin) { return this.data.totalScore >= skin.unlock; },
};
