/* ===== ZIGOUIGOUI — données : niveaux, skins, sauvegarde ===== */

const GRID = { COLS: 28, ROWS: 20, CELL: 32 };

function snakeCm(snake) {
  const n = (snake && snake.length) || 0;
  if (n <= 1) return 0;
  return Math.round((n - 1) * 5) / 10;
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
const HEART_EVERY = 7;

/* ---- OBJETS DE CROISSANCE ----
   Le snack du niveau (savon, cocktail…) reste le plus courant.
   D’autres objets font plus gonfler, ou donnent un mini-bonus. */
const GROW_ITEMS = [
  { id: 'snack', emoji: null, name: 'En-cas', grow: 1, pts: 20, weight: 54, minLevel: 0 },
  { id: 'banana', emoji: '🍌', name: 'Banane', grow: 1, pts: 25, weight: 14, minLevel: 0 },
  { id: 'honey', emoji: '🍯', name: 'Miel', grow: 2, pts: 30, weight: 10, minLevel: 0 },
  { id: 'pill', emoji: '💊', name: 'Pilule bleue', grow: 2, pts: 32, weight: 9, minLevel: 0 },
  { id: 'chili', emoji: '🌶️', name: 'Piment', grow: 1, pts: 22, weight: 9, minLevel: 1,
    effect: 'speed', dur: 3500 },
  { id: 'protein', emoji: '💪', name: 'Protéine', grow: 2, pts: 36, weight: 7, minLevel: 2 },
  { id: 'gem', emoji: '💎', name: 'Super croissance', grow: 3, pts: 55, weight: 3, minLevel: 3 },
];

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
function blob(cx, cy, r, wall) {
  const out = [];
  for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++) {
    for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++) {
      if (x < 0 || y < 0 || x >= GRID.COLS || y >= GRID.ROWS) continue;
      if (y === 16 && x >= 4) continue;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r + 0.2) out.push({ x, y, wall });
    }
  }
  return out;
}

/* ---- MÉCHANTES PUCHITAS ----
   Toutes retirent 0.5 cm. À 0 cm, le joueur meurt.
   variant 0/1/2 = teinte (Furax / Jalouse / Toxique). */
const VIRUS_NAMES = ['Puchita Furax', 'Puchita Jalouse', 'Puchita Toxique'];
const virus = (x, y, variant, move) => ({ x, y, virus: variant % 3, move });
const COMBAT_PACKS = {
  ammo: { emoji: '💦', name: 'Tir de sperme', short: 'Tirs', shots: 2 },
  shield: { emoji: '🛡️', name: 'Capote de protection', short: 'Capote' },
  star: { emoji: '🌟', name: 'Invincible', short: 'Star', dur: 5500 },
  antigrav: { emoji: '🌀', name: 'Bouclier anti-gravité', short: 'Anti-G' },
  puchita: { emoji: '💕', name: 'Invitation de Puchita', short: 'Puchita' },
  pump: { emoji: '💪', name: 'Pompe de départ', short: 'Pompe', grow: 3 },
};
const KIT_TO_PACK = {
  sperm: 'ammo', capote: 'shield', antigrav: 'antigrav', puchita: 'puchita', pump: 'pump',
};

/* ---- NIVEAUX ----
   Les premiers sont plus « Snake classique » (couloirs, murs, plus d’ennemis).
   goal = points pour le boss. */
const LEVELS = [
  {
    id: 1, name: 'Salle de Bain', emoji: '🛁', food: '🧼',
    music: 'bathroom', speed: 4.5, goal: 150,
    bg: ['#d7f1f8', '#c5e6f0'], deco: 'bathroom',
    soul: 'Vapeur furtive',
    mood: 'Carrelage froid, rideau ouvert, quelqu’un chante faux.',
    aura: '#7ecad8', vig: 'rgba(28, 92, 112, .44)',
    obstacles: [
      ...wallH(8, 12, 6, 'tile'),
      ...wallH(16, 20, 6, 'tile'),
      ...wallV(14, 10, 13, 'tile'),
      ...wallH(2, 5, 8, 'tile'),
      ...wallV(23, 7, 11, 'tile'),
      ...wallH(22, 25, 4, 'tile'),
      ...wallV(6, 2, 4, 'tile'),
      { x: 20, y: 15, e: '🦆' }, { x: 21, y: 15, e: '🦆' },
      { x: 3, y: 3, e: '🚿' }, { x: 12, y: 3, e: '🧴' },
      { x: 25, y: 17, e: '🪥' },
      { x: 6, y: 2, e: '🧼' }, { x: 1, y: 12, e: '🧻' },
      virus(7, 3, 0), virus(20, 3, 1), virus(9, 10, 2),
      virus(3, 11, 1), virus(21, 14, 1),
      virus(25, 8, 0, { axis: 'y', min: 3, max: 12, dir: 1, every: 6 }),
    ],
    rivals: 1, rivalSpeed: 1.48,
  },
  {
    id: 2, name: 'Plage', emoji: '🏖️', food: '🍹',
    music: 'beach', speed: 5.2, goal: 280,
    bg: ['#ffe7b0', '#ffd789'], deco: 'beach',
    soul: 'Marée voyeuse',
    mood: 'Sel, crème solaire, regards trop bronzés.',
    aura: '#f0c45a', vig: 'rgba(180, 90, 20, .32)',
    obstacles: [
      ...wallV(5, 2, 5, 'wood'),
      ...wallV(22, 13, 15, 'wood'),
      ...wallH(10, 13, 9, 'rock'),
      ...wallH(2, 4, 12, 'rock'),
      ...wallH(24, 26, 7, 'rock'),
      ...wallH(15, 18, 12, 'rock'),
      { x: 8, y: 17, e: '⛱️' }, { x: 17, y: 4, e: '🌴' },
      { x: 3, y: 17, e: '🐚' },
      { x: 25, y: 17, e: '🦀' }, { x: 1, y: 8, e: '🩴' },
      { x: 26, y: 3, e: '🕶️' },
      virus(11, 4, 0), virus(16, 14, 2), virus(7, 11, 1), virus(3, 6, 0),
      virus(21, 8, 1), virus(9, 7, 2),
      virus(18, 3, 1, { axis: 'x', min: 14, max: 21, dir: 1, every: 5 }),
      virus(24, 10, 2, { axis: 'y', min: 4, max: 12, dir: -1, every: 4 }),
      virus(13, 15, 0, { axis: 'x', min: 9, max: 18, dir: 1, every: 5 }),
    ],
    rivals: 2, rivalSpeed: 1.32,
  },
  {
    id: 3, name: 'Boîte de Nuit', emoji: '🪩', food: '🍸',
    music: 'club', speed: 6.1, goal: 400,
    bg: ['#1c1438', '#120c28'], deco: 'club',
    soul: 'Nuit électrique',
    mood: 'Basses trop fort. Personne n’écoute. Tout le monde juge.',
    aura: '#ff6fa5', vig: 'rgba(40, 8, 70, .55)',
    obstacles: [
      ...wallH(11, 16, 7, 'neon'),
      ...wallH(11, 16, 12, 'neon'),
      ...wallV(8, 8, 11, 'neon'),
      ...wallV(19, 8, 11, 'neon'),
      ...wallH(2, 4, 5, 'neon'),
      ...wallH(23, 25, 14, 'neon'),
      ...wallV(2, 10, 13, 'neon'),
      { x: 2, y: 2, e: '🔊' }, { x: 25, y: 2, e: '🔊' },
      { x: 14, y: 17, e: '🕶️' },
      { x: 26, y: 8, e: '🎤' }, { x: 1, y: 17, e: '🍸' },
      virus(4, 4, 0), virus(23, 15, 1), virus(14, 3, 2), virus(9, 15, 1),
      virus(6, 8, 2), virus(21, 13, 0),
      virus(23, 3, 2, { axis: 'y', min: 2, max: 7, dir: 1, every: 4 }),
      virus(2, 14, 0, { axis: 'y', min: 10, max: 15, dir: -1, every: 4 }),
      virus(16, 9, 0, { axis: 'x', min: 10, max: 18, dir: 1, every: 4 }),
    ],
    rivals: 3, rivalSpeed: 1.18,
  },
  {
    id: 4, name: 'Donjon Absurde', emoji: '🏰', food: '🍗',
    music: 'dungeon', speed: 6.8, goal: 420,
    bg: ['#3f3a4c', '#2e2a38'], deco: 'dungeon',
    soul: 'Pierre honteuse',
    mood: 'Humide, ancien, un peu honteux. Les torches te regardent.',
    aura: '#d07a4a', vig: 'rgba(12, 6, 18, .58)',
    obstacles: [
      ...wallH(3, 10, 6, 'brick'), ...wallH(17, 24, 6, 'brick'),
      ...wallH(3, 10, 13, 'brick'), ...wallH(17, 24, 13, 'brick'),
      ...wallV(14, 2, 4, 'brick'),
      ...wallV(13, 17, 18, 'brick'),
      ...wallV(2, 2, 4, 'brick'),
      ...wallH(13, 14, 9, 'brick'),
      { x: 13, y: 3, e: '🦴' }, { x: 14, y: 17, e: '🦴' },
      { x: 2, y: 9, e: '🕯️' }, { x: 25, y: 9, e: '🐀' },
      { x: 26, y: 2, e: '🛡️' },
      virus(6, 9, 1, { axis: 'x', min: 3, max: 11, dir: 1, every: 4 }),
      virus(21, 9, 2, { axis: 'x', min: 16, max: 24, dir: -1, every: 4 }),
      virus(12, 10, 0, { axis: 'y', min: 8, max: 12, dir: 1, every: 5 }),
      virus(2, 17, 1), virus(24, 3, 0), virus(8, 3, 2), virus(11, 11, 0),
      virus(19, 17, 0, { axis: 'x', min: 16, max: 24, dir: 1, every: 5 }),
      virus(25, 14, 2, { axis: 'y', min: 10, max: 15, dir: 1, every: 5 }),
    ],
    rivals: 4, rivalSpeed: 1.08,
  },
  {
    id: 5, name: 'Espace', emoji: '🚀', food: '⭐',
    music: 'space', speed: 7.6, goal: 550,
    bg: ['#0b0824', '#050314'], deco: 'space',
    soul: 'Silence sidéral',
    mood: 'Vide. Personne ne t’entend crier. Personne ne t’entend rire.',
    aura: '#8a6cff', vig: 'rgba(4, 2, 24, .62)',
    obstacles: [
      ...wallH(8, 10, 4, 'asteroid'), ...wallH(9, 10, 5, 'asteroid'),
      ...wallH(16, 19, 7, 'asteroid'),
      ...wallV(4, 6, 9, 'asteroid'),
      ...wallH(22, 25, 11, 'asteroid'),
      ...wallH(1, 3, 12, 'asteroid'),
      ...wallV(13, 13, 15, 'asteroid'),
      { x: 6, y: 3, e: '🪐' }, { x: 21, y: 15, e: '🪐' },
      { x: 13, y: 5, e: '🛸' }, { x: 25, y: 3, e: '⭐' },
      { x: 2, y: 2, e: '🌙' },
      virus(14, 11, 0, { axis: 'x', min: 8, max: 20, dir: 1, every: 3 }),
      virus(8, 12, 1, { axis: 'y', min: 11, max: 15, dir: 1, every: 4 }),
      virus(20, 12, 2, { axis: 'y', min: 11, max: 15, dir: -1, every: 4 }),
      virus(5, 8, 1), virus(22, 6, 0), virus(3, 14, 2), virus(11, 3, 0),
      virus(17, 3, 1, { axis: 'x', min: 12, max: 22, dir: -1, every: 4 }),
      virus(26, 9, 2, { axis: 'y', min: 5, max: 14, dir: 1, every: 4 }),
    ],
    rivals: 5, rivalSpeed: 1.00,
  },
  {
    id: 6, name: 'Cuisine', emoji: '🍳', food: '🥐',
    music: 'kitchen', speed: 6.4, goal: 500,
    bg: ['#f3d9a4', '#e8c078'], deco: 'kitchen',
    soul: 'Fournaise grasse',
    mood: 'Huile chaude, couteaux, chef en furie. Ça sent le beurre et la vengeance.',
    aura: '#e8a040', vig: 'rgba(90, 40, 8, .40)',
    obstacles: [
      ...wallH(6, 11, 3, 'wood'),
      ...wallH(17, 22, 3, 'wood'),
      ...wallH(11, 12, 8, 'wood'),
      ...wallH(15, 16, 8, 'wood'),
      ...wallV(25, 5, 8, 'wood'),
      ...wallH(2, 5, 13, 'wood'),
      { x: 8, y: 2, e: '🍳' }, { x: 19, y: 2, e: '🥘' },
      { x: 13, y: 9, e: '🥖' },
      { x: 24, y: 6, e: '🔪' }, { x: 15, y: 17, e: '🧄' },
      { x: 1, y: 3, e: '🧂' }, { x: 22, y: 13, e: '🍅' },
      virus(10, 5, 0), virus(20, 5, 1), virus(7, 14, 2),
      virus(4, 7, 1),
      virus(16, 7, 1, { axis: 'x', min: 13, max: 21, dir: 1, every: 6 }),
      virus(22, 10, 2, { axis: 'y', min: 6, max: 14, dir: -1, every: 6 }),
    ],
    rivals: 3, rivalSpeed: 1.22, rivalSmart: 0.48,
  },
  {
    id: 7, name: 'Sauna', emoji: '🧖', food: '🧴',
    music: 'sauna', speed: 7.8, goal: 720,
    bg: ['#c98a58', '#8a4e2a'], deco: 'sauna',
    soul: 'Chaleur collante',
    mood: 'Trop chaud. La serviette glisse. Personne ne parle.',
    aura: '#e07038', vig: 'rgba(80, 20, 4, .48)',
    obstacles: [
      ...wallH(2, 10, 3, 'wood'),
      ...wallH(2, 10, 6, 'wood'),
      ...wallV(13, 8, 11, 'wood'),
      { x: 13, y: 7, wall: 'wood' }, { x: 14, y: 7, wall: 'wood' },
      ...wallH(17, 25, 12, 'wood'),
      ...wallH(17, 25, 15, 'wood'),
      { x: 4, y: 2, e: '🪨' }, { x: 14, y: 6, e: '🔥' },
      { x: 23, y: 3, e: '💧' },
      { x: 16, y: 17, e: '🧴' }, { x: 1, y: 8, e: '🧖' },
      virus(8, 9, 1), virus(20, 6, 2), virus(11, 14, 0), virus(3, 10, 1),
      virus(25, 9, 0), virus(15, 5, 2),
      virus(6, 12, 0, { axis: 'x', min: 3, max: 11, dir: 1, every: 4 }),
      virus(21, 9, 2, { axis: 'y', min: 4, max: 11, dir: -1, every: 4 }),
      virus(16, 8, 1, { axis: 'x', min: 15, max: 22, dir: 1, every: 5 }),
    ],
    rivals: 6, rivalSpeed: 0.96, rivalSmart: 0.88,
  },
  {
    id: 8, name: 'CHAOS FINAL', emoji: '🌪️', food: '🎁',
    music: 'chaos', speed: 8.5, goal: 800,
    bg: ['#3d0a3d', '#1f051f'], deco: 'chaos',
    soul: 'Glitch lubrique',
    mood: 'Rien n’est vrai. Tout pique. Le sol ment.',
    aura: '#c44cff', vig: 'rgba(40, 0, 40, .55)',
    obstacles: [
      ...wallH(3, 6, 3, 'glitch'),
      ...wallH(21, 24, 3, 'glitch'),
      ...wallH(11, 16, 5, 'glitch'),
      ...wallV(8, 7, 11, 'glitch'),
      ...wallV(19, 7, 11, 'glitch'),
      ...wallH(11, 16, 14, 'glitch'),
      ...wallH(1, 3, 11, 'glitch'),
      ...wallH(24, 26, 8, 'glitch'),
      { x: 4, y: 8, wall: 'glitch' }, { x: 23, y: 12, wall: 'glitch' },
      { x: 2, y: 2, e: '👾' }, { x: 25, y: 17, e: '💣' }, { x: 14, y: 2, e: '🌀' },
      virus(5, 4, 0), virus(22, 15, 1), virus(14, 17, 2), virus(3, 12, 1),
      virus(26, 6, 0), virus(8, 14, 2),
      virus(9, 8, 2, { axis: 'x', min: 9, max: 18, dir: 1, every: 3 }),
      virus(18, 12, 0, { axis: 'x', min: 9, max: 18, dir: -1, every: 3 }),
      virus(14, 10, 1, { axis: 'y', min: 6, max: 13, dir: 1, every: 4 }),
      virus(2, 14, 2, { axis: 'y', min: 8, max: 15, dir: -1, every: 3 }),
      virus(22, 4, 0, { axis: 'y', min: 2, max: 13, dir: 1, every: 3 }),
      virus(10, 3, 1, { axis: 'x', min: 3, max: 11, dir: 1, every: 4 }),
    ],
    rivals: 6, rivalSpeed: 0.88, rivalSmart: 1.0,
  },
  {
    id: 9, name: 'Le Grand Corps', emoji: '💋', food: '💋',
    music: 'body', speed: 8.2, goal: 920,
    bg: ['#f3c4b0', '#e8a090'], deco: 'body',
    soul: 'Battement intime',
    mood: 'Peau chaude. Elle respire encore. Tu es trop petit.',
    aura: '#ff7aa8', vig: 'rgba(90, 20, 40, .42)',
    obstacles: [
      ...wallH(5, 9, 2, 'flesh'),
      ...wallH(18, 22, 2, 'flesh'),
      ...blob(9, 5.2, 2.15, 'flesh'),
      ...blob(18, 5.2, 2.15, 'flesh'),
      ...wallV(2, 7, 11, 'flesh'),
      ...wallV(25, 7, 11, 'flesh'),
      ...wallH(1, 4, 12, 'flesh'),
      ...wallH(23, 26, 12, 'flesh'),
      { x: 13, y: 10, wall: 'flesh' }, { x: 14, y: 10, wall: 'flesh' },
      { x: 12, y: 11, wall: 'flesh' }, { x: 15, y: 11, wall: 'flesh' },
      { x: 13, y: 12, wall: 'flesh' }, { x: 14, y: 12, wall: 'flesh' },
      ...wallV(1, 14, 15, 'flesh'),
      ...wallV(26, 14, 15, 'flesh'),
      ...wallH(1, 4, 17, 'flesh'),
      ...wallH(23, 26, 17, 'flesh'),
      { x: 14, y: 9, e: '❤️' }, { x: 3, y: 4, e: '🌹' },
      { x: 24, y: 4, e: '🎀' },
      { x: 1, y: 13, e: '💕' }, { x: 26, y: 8, e: '💋' },
      virus(9, 8, 0), virus(18, 8, 1), virus(3, 9, 2),
      virus(13, 8, 1, { axis: 'x', min: 11, max: 16, dir: 1, every: 8 }),
      virus(23, 10, 0, { axis: 'x', min: 20, max: 26, dir: -1, every: 8 }),
    ],
    rivals: 2, rivalSpeed: 1.52, rivalSmart: 1.2,
  },
];

/* ---- BOSS : un zigouigoui rival avant chaque niveau ---- */
function bossHitsForLevel(levelIndex) {
  return Math.max(1, (levelIndex || 0) + 1);
}

const BOSSES = [
  { name: 'Toto la Douche', taunt: 'Cette cabine est à MOI. Dégage, minus.',
    hp: 1, length: 8, speedMul: 1.28, smart: 0.12, emoji: '🚿',
    skin: { body: '#7ad0de', head: '#5bb8c8', tip: '#3a8a9a', detail: null } },
  { name: 'Le Bronzé Infidèle', taunt: 'La plage, c’est mon territoire. Bronzage obligatoire.',
    hp: 2, length: 9, speedMul: 1.16, smart: 0.30, emoji: '🌴',
    skin: { body: '#d08a4a', head: '#c07438', tip: '#a04e2a', detail: null } },
  { name: 'King du Vestiaire', taunt: 'VIP only. Toi, tu restes à la porte.',
    hp: 3, length: 10, speedMul: 1.06, smart: 0.48, emoji: '🕶️',
    skin: { body: '#5a3d7a', head: '#7b52a8', tip: '#c94b9a', detail: null } },
  { name: 'Sire Queue-en-Fer', taunt: 'Nul ne passe le donjon sans se mesurer à moi.',
    hp: 4, length: 11, speedMul: 0.98, smart: 0.64, emoji: '⚔️',
    skin: { body: '#8a9098', head: '#6e747c', tip: '#c45c3a', detail: null } },
  { name: 'Xéno-Zizi', taunt: 'Personne ne t’entend crier. Surtout pas moi.',
    hp: 5, length: 12, speedMul: 0.90, smart: 0.82, emoji: '👽',
    skin: { body: '#7cff6b', head: '#4ad89a', tip: '#d4ff4a', detail: null } },
  { name: 'Chef Gros-Bras', taunt: 'Hors de MA cuisine, saucisse crue.',
    hp: 6, length: 10, speedMul: 1.10, smart: 0.52, emoji: '👨‍🍳',
    skin: { body: '#e8d8c0', head: '#d4c4a8', tip: '#c45c3a', detail: null } },
  { name: 'Sven la Serviette', taunt: 'Trop habillé pour le sauna. Honte à toi.',
    hp: 7, length: 13, speedMul: 0.88, smart: 0.86, emoji: '🧖‍♂️',
    skin: { body: '#d4a078', head: '#c48860', tip: '#a06040', detail: null } },
  { name: 'LE GRAND CHAOS', taunt: 'Je suis tous les autres. D’un coup. Désolé.',
    hp: 8, length: 14, speedMul: 0.80, smart: 1.0, emoji: '👹',
    skin: { body: '#4a1020', head: '#7a1830', tip: '#ff3a5a', detail: null } },
  { name: 'Cupidon Jaloux', taunt: 'Ce corps, c’est MON temple. Dégage, vers.',
    hp: 9, length: 15, speedMul: 0.76, smart: 1.05, emoji: '💘',
    skin: { body: '#ff8ab8', head: '#ff6fa5', tip: '#e04888', detail: null } },
];

const RIVAL_NAMES = ['Jean-Miche', 'Patoune', 'Le Relou', 'Kevin du Tinder', 'Tonio', 'Stef', 'Marco', 'Dédé'];
const RIVAL_SKINS = [
  { body: '#c45c4a', head: '#a84838', tip: '#7a2818', detail: null },
  { body: '#6b4c9a', head: '#553888', tip: '#3a2060', detail: null },
  { body: '#3d6b4a', head: '#2d5538', tip: '#1a3824', detail: null },
];

/* ---- SKINS (déblocage au score cumulé + drapeaux) ---- */
const SKIN_GOLD_AT = 1000;
const SKIN_PLAT_AT = 1250;
const SKIN_DIAMOND_AT = 3000;

/* opts : { head, tip, orient ('v' = bandes verticales, 'h' = horizontales), bg, emblem: [type, ...couleurs] } */
function flagSkin(id, name, emoji, stripes, opts = {}) {
  return {
    id: 'flag-' + id, name: `${emoji} ${name}`, emoji, unlock: 0, requiresGold: true,
    body: stripes[Math.min(1, stripes.length - 1)],
    head: opts.head || stripes[0],
    tip: opts.tip || stripes[stripes.length - 1],
    detail: 'flag', stripes,
    orient: opts.orient || 'h',
    bg: opts.bg || null,
    emblem: opts.emblem || null,
  };
}

const SKINS = [
  { id: 'naturel', name: 'Le Naturel', unlock: 0,
    body: '#e8b896', head: '#e09a7a', tip: '#d46a78', detail: 'realistic' },
  { id: 'naturel-caramel', name: 'Naturel Caramel', unlock: 0,
    body: '#c98f5f', head: '#b97c4c', tip: '#b06050', sack: '#ab7a50', detail: 'realistic' },
  { id: 'naturel-dore', name: 'Naturel Doré', unlock: 0,
    body: '#f0d2a0', head: '#e6bd7e', tip: '#d98a72', sack: '#d4b184', detail: 'realistic' },
  { id: 'naturel-ebene', name: 'Naturel Ébène', unlock: 0,
    body: '#6b4632', head: '#59392a', tip: '#7d4a3e', sack: '#5a3a2a', detail: 'realistic' },
  { id: 'classic', name: 'Le Classique', unlock: 0,
    body: '#f7a8c0', head: '#f791b4', tip: '#e26a97', detail: null },
  { id: 'bubu', name: 'BuBu', unlock: 0,
    body: '#ff4f9a', head: '#ff8ab8', tip: '#e31c79', sack: '#e45a96',
    detail: 'metal', sheen: 'rgba(255, 200, 225, .92)', glow: '#ff7eb3' },
  { id: 'banana',  name: 'Banane Royale', unlock: 150, requiresGold: true,
    body: '#ffe135', head: '#ffd21f', tip: '#c99e00', detail: null },
  { id: 'cactus',  name: 'Cactus Câlin', unlock: 400, requiresGold: true,
    body: '#7bc86c', head: '#67b859', tip: '#4e9a42', detail: 'spikes' },
  { id: 'robot',   name: 'Robo-Zizi 3000', unlock: 800, requiresGold: true,
    body: '#b8c4cc', head: '#a5b3bd', tip: '#7f8f9a', detail: 'antenna' },
  { id: 'or', name: 'Skin Or', unlock: SKIN_GOLD_AT, prestige: 'or',
    body: '#ffd24a', head: '#ffe98a', tip: '#fff8d4', sack: '#e0b020',
    detail: 'metal', sheen: 'rgba(255, 248, 190, .85)', glow: '#ffe066' },
  { id: 'platine', name: 'Skin Platine', unlock: SKIN_PLAT_AT, prestige: 'platine',
    body: '#e8eef6', head: '#ffffff', tip: '#c5d4e8', sack: '#b4c0d0',
    detail: 'metal', sheen: 'rgba(255, 255, 255, .9)', glow: '#e8f4ff' },
  { id: 'rainbow', name: 'Arc-en-ciel Fabuleux', unlock: 1500, requiresGold: true,
    body: null, head: null, tip: null, detail: 'rainbow' },
  { id: 'diamant', name: 'Skin Diamant', unlock: SKIN_DIAMOND_AT, prestige: 'diamant',
    body: '#b8f6ff', head: '#ffffff', tip: '#7aecff', sack: '#8fd4ea',
    detail: 'diamond', sheen: 'rgba(255,255,255,.95)', glow: '#9af4ff' },

  /* Europe */
  flagSkin('fr', 'France', '🇫🇷', ['#002395', '#ffffff', '#ed2939'], { orient: 'v' }),
  flagSkin('de', 'Allemagne', '🇩🇪', ['#000000', '#dd0000', '#ffce00']),
  flagSkin('it', 'Italie', '🇮🇹', ['#009246', '#ffffff', '#ce2b37'], { orient: 'v' }),
  flagSkin('es', 'Espagne', '🇪🇸', ['#aa151b', '#f1bf00', '#f1bf00', '#aa151b'], { head: '#f1bf00', tip: '#aa151b' }),
  flagSkin('pt', 'Portugal', '🇵🇹', ['#006600', '#006600', '#ff0000', '#ff0000', '#ff0000'], { orient: 'v', head: '#ff0000', tip: '#006600', emblem: ['ring', '#ffe600', 50] }),
  flagSkin('gb', 'Royaume-Uni', '🇬🇧', ['#012169', '#ffffff', '#c8102e'], { head: '#012169', tip: '#c8102e', bg: '#012169', emblem: ['unionjack'] }),
  flagSkin('ie', 'Irlande', '🇮🇪', ['#169b62', '#ffffff', '#ff883e'], { orient: 'v' }),
  flagSkin('nl', 'Pays-Bas', '🇳🇱', ['#ae1c28', '#ffffff', '#21468b']),
  flagSkin('be', 'Belgique', '🇧🇪', ['#000000', '#fae042', '#ed2939'], { orient: 'v' }),
  flagSkin('lu', 'Luxembourg', '🇱🇺', ['#ea141d', '#ffffff', '#51adda']),
  flagSkin('ch', 'Suisse', '🇨🇭', ['#ff0000', '#ffffff'], { head: '#ffffff', tip: '#ff0000', bg: '#ff0000', emblem: ['cross', '#ffffff'] }),
  flagSkin('at', 'Autriche', '🇦🇹', ['#ed2939', '#ffffff', '#ed2939']),
  flagSkin('pl', 'Pologne', '🇵🇱', ['#ffffff', '#dc143c'], { head: '#dc143c', tip: '#ffffff' }),
  flagSkin('cz', 'Tchéquie', '🇨🇿', ['#ffffff', '#d7141c'], { head: '#11457e', tip: '#d7141c', emblem: ['wedge', '#11457e'] }),
  flagSkin('sk', 'Slovaquie', '🇸🇰', ['#ffffff', '#0b4ea2', '#ee1c25']),
  flagSkin('hu', 'Hongrie', '🇭🇺', ['#ce2939', '#ffffff', '#477050']),
  flagSkin('ro', 'Roumanie', '🇷🇴', ['#002b7f', '#fcd116', '#ce1126'], { orient: 'v' }),
  flagSkin('bg', 'Bulgarie', '🇧🇬', ['#ffffff', '#00966e', '#d62612']),
  flagSkin('gr', 'Grèce', '🇬🇷', ['#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf'], { head: '#0d5eaf', tip: '#ffffff', emblem: ['cantoncross', '#0d5eaf', '#ffffff'] }),
  flagSkin('hr', 'Croatie', '🇭🇷', ['#ff0000', '#ffffff', '#171796'], { emblem: ['checker', '#ff0000', '#ffffff'] }),
  flagSkin('si', 'Slovénie', '🇸🇮', ['#ffffff', '#005da4', '#e30a17']),
  flagSkin('se', 'Suède', '🇸🇪', ['#006aa7', '#fecc00'], { head: '#fecc00', tip: '#006aa7', bg: '#006aa7', emblem: ['nordic', '#fecc00'] }),
  flagSkin('no', 'Norvège', '🇳🇴', ['#ba0c2f', '#ffffff', '#00205b'], { bg: '#ba0c2f', emblem: ['nordic', '#ffffff', '#00205b'] }),
  flagSkin('dk', 'Danemark', '🇩🇰', ['#c8102e', '#ffffff'], { head: '#ffffff', tip: '#c8102e', bg: '#c8102e', emblem: ['nordic', '#ffffff'] }),
  flagSkin('fi', 'Finlande', '🇫🇮', ['#ffffff', '#003580'], { head: '#003580', tip: '#ffffff', bg: '#ffffff', emblem: ['nordic', '#003580'] }),
  flagSkin('is', 'Islande', '🇮🇸', ['#02529c', '#ffffff', '#dc1e35'], { bg: '#02529c', emblem: ['nordic', '#ffffff', '#dc1e35'] }),
  flagSkin('ee', 'Estonie', '🇪🇪', ['#0072ce', '#000000', '#ffffff']),
  flagSkin('lv', 'Lettonie', '🇱🇻', ['#9e3039', '#9e3039', '#ffffff', '#9e3039', '#9e3039']),
  flagSkin('lt', 'Lituanie', '🇱🇹', ['#fdb913', '#006a44', '#c1272d']),
  flagSkin('ua', 'Ukraine', '🇺🇦', ['#005bbb', '#ffd500'], { head: '#ffd500', tip: '#005bbb' }),
  flagSkin('md', 'Moldavie', '🇲🇩', ['#003da5', '#ffd200', '#cc092f'], { orient: 'v' }),
  flagSkin('rs', 'Serbie', '🇷🇸', ['#c6363c', '#0c4076', '#ffffff']),
  flagSkin('ba', 'Bosnie', '🇧🇦', ['#002395', '#fecb00'], { head: '#fecb00', tip: '#002395', bg: '#002395', emblem: ['bosnie'] }),
  flagSkin('me', 'Monténégro', '🇲🇪', ['#d4a017', '#c40308', '#c40308', '#c40308', '#d4a017'], { head: '#d4a017', tip: '#c40308' }),
  flagSkin('al', 'Albanie', '🇦🇱', ['#e41e20', '#000000'], { head: '#000000', tip: '#e41e20', bg: '#e41e20', emblem: ['aigle', '#1a1a1a'] }),
  flagSkin('mk', 'Macédoine du Nord', '🇲🇰', ['#d20000', '#ffe600'], { head: '#ffe600', tip: '#d20000', bg: '#d20000', emblem: ['soleil', '#ffe600'] }),
  flagSkin('mt', 'Malte', '🇲🇹', ['#ffffff', '#cf142b'], { orient: 'v', head: '#cf142b', tip: '#ffffff' }),
  flagSkin('cy', 'Chypre', '🇨🇾', ['#ffffff', '#d57800', '#4e5b31'], { head: '#d57800', tip: '#ffffff', bg: '#ffffff', emblem: ['chypre'] }),
  flagSkin('ad', 'Andorre', '🇦🇩', ['#10069f', '#fedf00', '#d0103a'], { orient: 'v' }),
  flagSkin('mc', 'Monaco', '🇲🇨', ['#ce1126', '#ffffff'], { head: '#ffffff', tip: '#ce1126' }),
  flagSkin('sm', 'Saint-Marin', '🇸🇲', ['#ffffff', '#5eb6e4'], { head: '#ffffff', tip: '#5eb6e4' }),
  flagSkin('va', 'Vatican', '🇻🇦', ['#ffe000', '#ffffff'], { orient: 'v', head: '#ffe000', tip: '#cccccc' }),
  flagSkin('li', 'Liechtenstein', '🇱🇮', ['#002b7f', '#ce1126'], { head: '#ce1126', tip: '#002b7f', emblem: ['couronne', '#d4a017'] }),

  /* Monde */
  flagSkin('us', 'États-Unis', '🇺🇸', ['#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234'], { head: '#3c3b6e', tip: '#b22234', emblem: ['canton', '#3c3b6e', '#ffffff'] }),
  flagSkin('ca', 'Canada', '🇨🇦', ['#ff0000', '#ffffff', '#ffffff', '#ff0000'], { orient: 'v', head: '#ffffff', tip: '#ff0000', emblem: ['feuille'] }),
  flagSkin('mx', 'Mexique', '🇲🇽', ['#006847', '#ffffff', '#ce1126'], { orient: 'v', emblem: ['aigle', '#8a5a2a'] }),
  flagSkin('br', 'Brésil', '🇧🇷', ['#009c3b', '#ffdf00', '#002776'], { head: '#ffdf00', tip: '#009c3b', bg: '#009c3b', emblem: ['bresil'] }),
  flagSkin('ar', 'Argentine', '🇦🇷', ['#74acdf', '#ffffff', '#74acdf'], { head: '#f6b40e', tip: '#74acdf', emblem: ['soleil', '#f6b40e'] }),
  flagSkin('cl', 'Chili', '🇨🇱', ['#ffffff', '#d52b1e'], { head: '#d52b1e', tip: '#0039a6', emblem: ['chili', '#0039a6', '#ffffff'] }),
  flagSkin('co', 'Colombie', '🇨🇴', ['#fcd116', '#fcd116', '#003893', '#ce1126']),
  flagSkin('cn', 'Chine', '🇨🇳', ['#de2910', '#de2910', '#ffde00'], { head: '#ffde00', tip: '#de2910', bg: '#de2910', emblem: ['chine', '#ffde00'] }),
  flagSkin('jp', 'Japon', '🇯🇵', ['#ffffff', '#ffffff', '#bc002d'], { head: '#bc002d', tip: '#ffffff', bg: '#ffffff', emblem: ['disque', '#bc002d'] }),
  flagSkin('kr', 'Corée du Sud', '🇰🇷', ['#ffffff', '#cd2e3a', '#0047a0'], { head: '#cd2e3a', tip: '#0047a0', bg: '#ffffff', emblem: ['taegeuk'] }),
  flagSkin('in', 'Inde', '🇮🇳', ['#ff9933', '#ffffff', '#138808'], { head: '#000080', tip: '#ff9933', emblem: ['chakra', '#000080'] }),
  flagSkin('pk', 'Pakistan', '🇵🇰', ['#ffffff', '#01411c', '#01411c', '#01411c'], { orient: 'v', head: '#01411c', tip: '#ffffff', emblem: ['croissant', '#ffffff'] }),
  flagSkin('id', 'Indonésie', '🇮🇩', ['#ff0000', '#ffffff'], { head: '#ffffff', tip: '#ff0000' }),
  flagSkin('th', 'Thaïlande', '🇹🇭', ['#a51931', '#f4f5f8', '#2d2a4a', '#2d2a4a', '#f4f5f8', '#a51931']),
  flagSkin('vn', 'Viêt Nam', '🇻🇳', ['#da251d', '#ffcd00'], { head: '#ffcd00', tip: '#da251d', bg: '#da251d', emblem: ['etoile', '#ffcd00'] }),
  flagSkin('ph', 'Philippines', '🇵🇭', ['#0038a8', '#ce1126'], { head: '#fcd116', tip: '#0038a8', emblem: ['philippines'] }),
  flagSkin('au', 'Australie', '🇦🇺', ['#012169', '#e4002b', '#ffffff'], { head: '#012169', tip: '#e4002b', bg: '#012169', emblem: ['austral', '#ffffff'] }),
  flagSkin('nz', 'Nouvelle-Zélande', '🇳🇿', ['#00247d', '#cc142b', '#ffffff'], { head: '#00247d', tip: '#cc142b', bg: '#00247d', emblem: ['austral', '#cc142b'] }),
  flagSkin('za', 'Afrique du Sud', '🇿🇦', ['#de3831', '#ffffff', '#007749', '#ffffff', '#002395'], { head: '#ffb915', tip: '#007749' }),
  flagSkin('eg', 'Égypte', '🇪🇬', ['#ce1126', '#ffffff', '#000000'], { emblem: ['aigle', '#c09300'] }),
  flagSkin('ma', 'Maroc', '🇲🇦', ['#c1272d', '#006233'], { head: '#006233', tip: '#c1272d', bg: '#c1272d', emblem: ['etoile', '#006233'] }),
  flagSkin('dz', 'Algérie', '🇩🇿', ['#006233', '#ffffff'], { orient: 'v', head: '#d21034', tip: '#006233', emblem: ['croissant', '#d21034'] }),
  flagSkin('tn', 'Tunisie', '🇹🇳', ['#e70013', '#ffffff'], { head: '#ffffff', tip: '#e70013', bg: '#e70013', emblem: ['tunisie'] }),
  flagSkin('tr', 'Turquie', '🇹🇷', ['#e30a17', '#ffffff'], { head: '#ffffff', tip: '#e30a17', bg: '#e30a17', emblem: ['croissant', '#ffffff'] }),
  flagSkin('sa', 'Arabie saoudite', '🇸🇦', ['#006c35', '#ffffff'], { head: '#ffffff', tip: '#006c35', bg: '#006c35', emblem: ['calligraphie', '#ffffff'] }),
  flagSkin('il', 'Israël', '🇮🇱', ['#ffffff', '#0038b8', '#ffffff', '#ffffff', '#0038b8', '#ffffff'], { head: '#0038b8', tip: '#ffffff', emblem: ['david', '#0038b8'] }),
  flagSkin('ae', 'Émirats', '🇦🇪', ['#00732f', '#ffffff', '#000000'], { emblem: ['hampe', '#ff0000'] }),
  flagSkin('ng', 'Nigeria', '🇳🇬', ['#008751', '#ffffff', '#008751'], { orient: 'v' }),
  flagSkin('ke', 'Kenya', '🇰🇪', ['#000000', '#ffffff', '#bb0000', '#ffffff', '#006600'], { head: '#bb0000', tip: '#000000', emblem: ['bouclier'] }),
  flagSkin('gh', 'Ghana', '🇬🇭', ['#ce1126', '#fcd116', '#006b3f'], { emblem: ['etoile', '#000000'] }),
];

/* ---- BOUTIQUE : se débloque en ramassant des objets en jeu ---- */
const SHOP_ITEMS = [
  { id: 'capote', name: 'Capote de protection', emoji: '🛡️', cost: 5, unlockEaten: 4,
    desc: 'Pop sur la map. Ramasse-la. Si tu ne te fais pas toucher, tu la gardes au niveau suivant.' },
  { id: 'sperm', name: 'Tir de sperme', emoji: '💦', cost: 7, unlockEaten: 9,
    desc: 'Pop sur la map. 3 tirs (Espace). Les tirs non utilisés suivent d’un niveau à l’autre.' },
  { id: 'antigrav', name: 'Bouclier anti-gravité', emoji: '🌀', cost: 6, unlockEaten: 15,
    desc: 'Pop sur la map. Une fois ramassé, tu le gardes tant que tu vis.' },
  { id: 'pump', name: 'Pompe de départ', emoji: '💪', cost: 8, unlockEaten: 22,
    desc: 'Pop sur la map. +1,5 cm quand tu la ramasses.' },
  { id: 'puchita', name: 'Invitation de Puchita', emoji: '💕', cost: 9, unlockEaten: 30,
    desc: 'Pop sur la map. Le bouton 💕 reste tant que tu ne l’appelles pas.' },
];

/* ---- SAUVEGARDE (localStorage) ---- */
const SAVE_KEY = 'zigouigoui-save-v1';

const Save = {
  data: {
    best: 0, totalScore: 0, unlockedLevel: 9, skin: 'naturel',
    credits: 0, eatenTotal: 0, unlockedShop: [], muted: false,
    kit: { capote: 0, sperm: 0, antigrav: 0, pump: 0, puchita: 0 },
    ads: {
      consent: null, impressions: 0, rewards: 0, estimatedCents: 0,
      lastCreditAt: 0, creditsToday: 0, creditsDay: '',
    },
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* sauvegarde corrompue : on repart de zéro */ }
    if (this.data.credits == null) this.data.credits = 0;
    this.data.ads = Object.assign({
      consent: null, impressions: 0, rewards: 0, estimatedCents: 0,
      lastCreditAt: 0, creditsToday: 0, creditsDay: '',
    }, this.data.ads || {});
    if (this.data.eatenTotal == null) this.data.eatenTotal = 0;
    if (this.data.muted == null) this.data.muted = false;
    this.data.kit = Object.assign(
      { capote: 0, sperm: 0, antigrav: 0, pump: 0, puchita: 0 },
      this.data.kit || {},
    );
    if (!Array.isArray(this.data.unlockedShop)) this.data.unlockedShop = [];
    if ((this.data.unlockedLevel || 1) < LEVELS.length) {
      this.data.unlockedLevel = LEVELS.length;
      this.write();
    }
    /* anciennes sauvegardes : la boutique était déjà ouverte */
    if ((this.data.totalScore || 0) > 0 || (this.data.credits || 0) > 0) {
      for (const id of ['capote', 'sperm', 'antigrav', 'puchita']) {
        if (!this.data.unlockedShop.includes(id)) this.data.unlockedShop.push(id);
      }
    }
    const cur = SKINS.find(s => s.id === this.data.skin);
    if (cur && !this.isSkinUnlocked(cur)) this.data.skin = 'naturel';
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
    if (!item || !this.isShopUnlocked(id) || this.data.credits < item.cost) return false;
    this.data.credits -= item.cost;
    this.data.kit[id] = (this.data.kit[id] || 0) + 1;
    this.write();
    return true;
  },
  consumeOne(id) {
    if ((this.data.kit[id] || 0) <= 0) return false;
    this.data.kit[id]--;
    this.write();
    return true;
  },
  addScore(score) {
    const newlyUnlocked = [];
    const before = this.data.totalScore;
    this.data.totalScore += score;
    if (score > this.data.best) this.data.best = score;
    for (const s of SKINS) {
      if (!this.isSkinUnlocked(s, before) && this.isSkinUnlocked(s)) newlyUnlocked.push(s);
    }
    this.write();
    return newlyUnlocked;
  },
  unlockLevel(id) {
    if (id > this.data.unlockedLevel) { this.data.unlockedLevel = id; this.write(); }
  },
  hasGoldSkin(score) {
    return (score != null ? score : this.data.totalScore) >= SKIN_GOLD_AT;
  },
  isSkinUnlocked(skin, score) {
    const pts = score != null ? score : this.data.totalScore;
    if ((skin.unlock || 0) > pts) return false;
    if (skin.requiresGold && pts < SKIN_GOLD_AT) return false;
    return true;
  },
  isShopUnlocked(id) { return (this.data.unlockedShop || []).includes(id); },
  addEaten(n) {
    this.data.eatenTotal = (this.data.eatenTotal || 0) + (n || 1);
    if (!Array.isArray(this.data.unlockedShop)) this.data.unlockedShop = [];
    const newly = [];
    for (const item of SHOP_ITEMS) {
      if (this.data.eatenTotal >= (item.unlockEaten || 0) && !this.data.unlockedShop.includes(item.id)) {
        this.data.unlockedShop.push(item.id);
        newly.push(item);
      }
    }
    this.write();
    return newly;
  },
};
