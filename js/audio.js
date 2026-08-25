/* ===== ZIGOUIGOUI — audio procédural (WebAudio) =====
   Musique générative différente par niveau + effets sonores comiques. */

const AudioMan = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let schedulerId = null;
  let currentTrack = null;
  let nextNoteTime = 0;
  let stepIndex = 0;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.55;
      masterGain.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.32;
      musicGain.connect(masterGain);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---- petit synthé utilitaire ----
  function blip(freq, dur, type, vol, when, dest, slideTo) {
    const t = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(dest || masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noiseHit(dur, vol, when, hp) {
    const t = when ?? ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp || 4000;
    src.connect(filt).connect(g).connect(musicGain);
    src.start(t);
  }

  // ---- pistes par niveau (gammes en demi-tons depuis la fondamentale) ----
  const midi = (root, semi) => 440 * Math.pow(2, (root + semi - 69) / 12);

  const TRACKS = {
    bathroom: { bpm: 105, root: 60, scale: [0, 2, 4, 7, 9], lead: 'sine',     bass: 'triangle', hat: false },
    beach:    { bpm: 118, root: 62, scale: [0, 2, 4, 7, 9], lead: 'triangle', bass: 'sine',     hat: true  },
    club:     { bpm: 128, root: 57, scale: [0, 3, 5, 7, 10], lead: 'square',  bass: 'sawtooth', hat: true  },
    dungeon:  { bpm: 92,  root: 52, scale: [0, 1, 4, 5, 7, 8], lead: 'square', bass: 'square',  hat: false },
    space:    { bpm: 84,  root: 64, scale: [0, 2, 4, 6, 8, 10], lead: 'sine', bass: 'triangle', hat: false },
    chaos:    { bpm: 150, root: 60, scale: [0, 1, 3, 4, 6, 8, 10], lead: 'sawtooth', bass: 'square', hat: true },
  };

  let leadNote = 0;

  function scheduleStep(track, when, step) {
    const beat = step % 8;
    // basse sur les temps forts
    if (beat % 2 === 0) {
      const bassSemi = track.scale[(step >> 2) % track.scale.length];
      blip(midi(track.root - 24, bassSemi), 0.22, track.bass, 0.5, when, musicGain);
    }
    // charley
    if (track.hat && beat % 2 === 1) noiseHit(0.04, 0.12, when);
    // mélodie : marche aléatoire sur la gamme
    if (Math.random() < 0.72) {
      leadNote += Math.floor(Math.random() * 3) - 1;
      leadNote = Math.max(0, Math.min(track.scale.length * 2 - 1, leadNote));
      const octave = leadNote >= track.scale.length ? 12 : 0;
      const semi = track.scale[leadNote % track.scale.length] + octave;
      blip(midi(track.root, semi), 0.18, track.lead, 0.3, when, musicGain);
    }
  }

  function startMusic(trackName) {
    ensureCtx();
    stopMusic();
    const track = TRACKS[trackName] || TRACKS.bathroom;
    currentTrack = track;
    nextNoteTime = ctx.currentTime + 0.1;
    stepIndex = 0;
    leadNote = Math.floor(track.scale.length / 2);
    const stepDur = 60 / track.bpm / 2; // croches
    schedulerId = setInterval(() => {
      while (nextNoteTime < ctx.currentTime + 0.25) {
        scheduleStep(track, nextNoteTime, stepIndex);
        nextNoteTime += stepDur;
        stepIndex++;
      }
    }, 90);
  }

  function stopMusic() {
    if (schedulerId) { clearInterval(schedulerId); schedulerId = null; }
    currentTrack = null;
  }

  // ---- effets sonores ----
  const SFX = {
    eat()   { ensureCtx(); blip(520, 0.12, 'sine', 0.5, null, masterGain, 880); blip(660, 0.1, 'square', 0.15, ctx.currentTime + 0.05, masterGain, 990); },
    bonus() { ensureCtx(); [0, 4, 7, 12].forEach((s, i) => blip(midi(72, s), 0.12, 'square', 0.3, ctx.currentTime + i * 0.07, masterGain)); },
    click() { ensureCtx(); blip(700, 0.06, 'sine', 0.3, null, masterGain, 500); },
    death() { // trombone triste
      ensureCtx();
      [0, -2, -4, -7].forEach((s, i) =>
        blip(midi(58, s), 0.4, 'sawtooth', 0.35, ctx.currentTime + i * 0.32, masterGain, midi(58, s - 1)));
    },
    levelClear() {
      ensureCtx();
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) =>
        blip(midi(60, s), 0.18, 'triangle', 0.35, ctx.currentTime + i * 0.09, masterGain));
    },
    victory() {
      ensureCtx();
      [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) =>
        blip(midi(60, s), 0.25, 'triangle', 0.4, ctx.currentTime + i * 0.13, masterGain));
    },
    boing() { ensureCtx(); blip(200, 0.25, 'sine', 0.4, null, masterGain, 600); },
    shoot() { ensureCtx(); blip(280, 0.16, 'sine', 0.4, null, masterGain, 720); blip(520, 0.1, 'triangle', 0.2, ctx.currentTime + 0.04, masterGain, 180); },
    hit() { ensureCtx(); blip(180, 0.18, 'sawtooth', 0.4, null, masterGain, 90); blip(420, 0.08, 'square', 0.25, ctx.currentTime + 0.04, masterGain); },
  };

  return { startMusic, stopMusic, sfx: SFX, ensureCtx };
})();
