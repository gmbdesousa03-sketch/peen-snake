/* ===== ZIGOUIGOUI — audio procédural (WebAudio) =====
   Une vraie scène sonore par niveau : ambiances + groove, sans samples copyright. */

const AudioMan = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let schedulerId = null;
  let currentTrack = null;
  let nextNoteTime = 0;
  let stepIndex = 0;
  let leadNote = 0;
  let ambients = [];
  let scene = {};
  const bufs = {};

  let muted = false;
  let ducked = false;

  function applyGains(fade) {
    if (!ctx || !masterGain || !musicGain) return;
    const t = ctx.currentTime;
    const master = muted ? 0.0001 : 0.58;
    const music = muted ? 0.0001 : (ducked ? 0.07 : 0.30);
    if (fade === false) {
      masterGain.gain.setValueAtTime(master, t);
      musicGain.gain.setValueAtTime(music, t);
      return;
    }
    masterGain.gain.setTargetAtTime(master, t, 0.06);
    musicGain.gain.setTargetAtTime(music, t, 0.08);
  }

  function setMuted(on) {
    muted = !!on;
    if (ctx) applyGains();
    return muted;
  }

  function isMuted() { return muted; }

  function duckMusic(on) {
    ducked = !!on;
    if (ctx) applyGains();
  }

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0.0001 : 0.58;
      masterGain.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = muted ? 0.0001 : 0.30;
      musicGain.connect(masterGain);
    }
    if (ctx.state === 'suspended') ctx.resume();
    applyGains(false);
    return ctx;
  }

  const midi = (root, semi) => 440 * Math.pow(2, (root + semi - 69) / 12);

  function blip(freq, dur, type, vol, when, dest, slideTo) {
    const t = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(dest || masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noiseBuf(color) {
    if (bufs[color]) return bufs[color];
    const len = Math.floor(ctx.sampleRate * 1.8);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        d[i] = (b0 + b1 + b2 + w * 0.5362) * 0.11;
      } else if (color === 'brown') {
        b0 = (b0 + 0.02 * w) / 1.02;
        d[i] = b0 * 3.5;
      } else {
        d[i] = w;
      }
    }
    bufs[color] = buf;
    return buf;
  }

  function noiseBurst(dur, vol, when, freq, type, dest) {
    const t = when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf('white');
    const filt = ctx.createBiquadFilter();
    filt.type = type || 'highpass';
    filt.frequency.value = freq || 4000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(dest || musicGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function loopNoise(color, vol, filterType, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(color);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    if (q) filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filt).connect(g).connect(musicGain);
    src.start();
    ambients.push(src);
    return { src, filt, g };
  }

  function kick(when, vol) {
    blip(150, 0.18, 'sine', vol || 0.55, when, musicGain, 38);
    noiseBurst(0.04, (vol || 0.55) * 0.18, when, 200, 'lowpass');
  }

  function hat(when, vol, open) {
    noiseBurst(open ? 0.14 : 0.035, vol || 0.1, when, open ? 7000 : 9000, 'highpass');
  }

  function drip(when, vol) {
    const f = 700 + Math.random() * 900;
    blip(f, 0.12, 'sine', vol || 0.18, when, musicGain, f * 0.35);
    noiseBurst(0.06, 0.05, when, 5000, 'highpass');
  }

  function brass(freq, dur, vol, when) {
    blip(freq, dur, 'sawtooth', vol * 0.55, when, musicGain);
    blip(freq * 1.007, dur, 'square', vol * 0.28, when, musicGain);
    blip(freq * 0.5, dur * 0.9, 'triangle', vol * 0.22, when, musicGain);
  }

  function accordion(freq, dur, vol, when) {
    blip(freq, dur, 'sawtooth', vol * 0.42, when, musicGain);
    blip(freq * 1.0048, dur, 'sawtooth', vol * 0.38, when, musicGain);
    blip(freq * 2, dur * 0.7, 'triangle', vol * 0.12, when, musicGain);
  }

  function piano(freq, dur, vol, when) {
    blip(freq, dur, 'triangle', vol, when, musicGain, freq * 0.985);
    blip(freq * 2, dur * 0.22, 'sine', vol * 0.22, when, musicGain);
  }

  function celesta(freq, dur, vol, when) {
    blip(freq, dur, 'sine', vol, when, musicGain);
    blip(freq * 2.01, dur * 0.5, 'sine', vol * 0.35, when, musicGain);
    blip(freq * 4, dur * 0.18, 'triangle', vol * 0.12, when, musicGain);
  }

  function slap(when, vol) {
    blip(85, 0.09, 'sine', vol || 0.38, when, musicGain, 36);
    noiseBurst(0.07, (vol || 0.38) * 0.55, when, 900, 'bandpass');
    noiseBurst(0.04, (vol || 0.38) * 0.25, when, 2800, 'highpass');
  }

  function braam(when) {
    [48, 52, 58, 72].forEach(f => blip(f * 2.2, 1.35, 'sawtooth', 0.09, when, musicGain, f));
    blip(36, 1.5, 'sine', 0.22, when, musicGain, 28);
  }

  function heartbeat(when, vol) {
    blip(62, 0.11, 'sine', vol || 0.4, when, musicGain, 32);
    blip(62, 0.16, 'sine', (vol || 0.4) * 0.7, when + 0.16, musicGain, 28);
  }

  /* ---- pistes ---- */
  const TRACKS = {
    bathroom: { bpm: 96,  root: 62, scale: [0, 2, 4, 7, 9],       flavor: 'drip' },
    beach:    { bpm: 100, root: 64, scale: [0, 2, 4, 7, 9, 11],   flavor: 'wave' },
    club:     { bpm: 128, root: 57, scale: [0, 3, 5, 7, 10],      flavor: 'kick' },
    dungeon:  { bpm: 88,  root: 53, scale: [0, 2, 4, 7, 9],       flavor: 'brass' },
    space:    { bpm: 72,  root: 57, scale: [0, 2, 3, 7, 8, 12],   flavor: 'zimmer' },
    kitchen:  { bpm: 168, root: 67, scale: [0, 2, 4, 5, 7, 9, 11], flavor: 'ratatouille' },
    sauna:    { bpm: 78,  root: 60, scale: [0, 3, 5, 7, 10],      flavor: 'chill' },
    chaos:    { bpm: 112, root: 71, scale: [0, 2, 4, 7, 9, 11],   flavor: 'fantasy' },
    body:     { bpm: 98,  root: 57, scale: [0, 3, 5, 7, 10, 12],  flavor: 'fesse' },
    menu:     { bpm: 84,  root: 62, scale: [0, 3, 5, 7, 10],      flavor: 'chill' },
  };

  function startScene(track) {
    scene = {};
    const f = track.flavor;
    if (f === 'drip') {
      scene.shower = loopNoise('pink', 0.16, 'bandpass', 3200, 0.55);
    } else if (f === 'wave') {
      scene.sea = loopNoise('brown', 0.14, 'lowpass', 700, 0.4);
    } else if (f === 'kick') {
      scene.rumble = loopNoise('brown', 0.05, 'lowpass', 120);
    } else if (f === 'chill') {
      scene.steam = loopNoise('pink', 0.07, 'lowpass', 1800);
      scene.crackle = loopNoise('white', 0.018, 'highpass', 8000);
    } else if (f === 'fesse') {
      scene.breath = loopNoise('pink', 0.05, 'lowpass', 500);
    } else if (f === 'zimmer') {
      scene.air = loopNoise('brown', 0.04, 'lowpass', 220);
    } else if (f === 'fantasy') {
      scene.shimmer = loopNoise('pink', 0.035, 'highpass', 5000);
    }
  }

  function scheduleBathroom(track, when, step, beat) {
    if (scene.shower) {
      const wob = 2600 + Math.sin(step * 0.17) * 700;
      scene.shower.filt.frequency.setTargetAtTime(wob, when, 0.15);
    }
    if (beat === 0 || beat === 3 || (beat === 6 && Math.random() < 0.6)) drip(when, 0.16);
    if (beat === 5 && Math.random() < 0.45) {
      blip(420 + Math.random() * 80, 0.35, 'sine', 0.08, when, musicGain, 280);
    }
    if (step % 16 === 8) {
      const semi = track.scale[leadNote % track.scale.length];
      blip(midi(track.root + 12, semi), 0.28, 'sine', 0.12, when, musicGain);
      leadNote = (leadNote + 1) % track.scale.length;
    }
  }

  function scheduleBeach(track, when, step, beat) {
    if (scene.sea) {
      const swell = 0.08 + 0.09 * (0.5 + 0.5 * Math.sin(step * 0.09));
      scene.sea.g.gain.setTargetAtTime(swell, when, 0.25);
      scene.sea.filt.frequency.setTargetAtTime(350 + 900 * (0.5 + 0.5 * Math.sin(step * 0.07)), when, 0.3);
    }
    if (beat === 0) {
      blip(midi(track.root - 24, 0), 0.7, 'sine', 0.14, when, musicGain, midi(track.root - 31, 0));
      noiseBurst(0.55, 0.08, when, 400, 'lowpass');
    }
    if (beat === 4 && Math.random() < 0.55) {
      const f = 1800 + Math.random() * 500;
      blip(f, 0.18, 'sine', 0.08, when, musicGain, f * 1.4);
      blip(f * 1.12, 0.12, 'sine', 0.05, when + 0.08, musicGain, f * 0.9);
    }
    if ((beat === 2 || beat === 6) && Math.random() < 0.7) {
      const semi = track.scale[(step >> 1) % track.scale.length];
      blip(midi(track.root, semi), 0.22, 'triangle', 0.16, when, musicGain);
    }
  }

  function scheduleClub(track, when, step, beat) {
    if (beat % 2 === 0) kick(when, 0.62);
    if (beat % 2 === 1) hat(when, 0.11);
    if (beat === 6) hat(when, 0.16, true);
    if (beat === 0 || beat === 4) {
      const semi = track.scale[(Math.floor(step / 8) * 3) % track.scale.length];
      blip(midi(track.root - 24, semi), 0.28, 'sawtooth', 0.32, when, musicGain);
      blip(midi(track.root - 12, semi), 0.18, 'square', 0.08, when, musicGain);
    }
    if (beat === 0 && step % 16 === 0) {
      const semi = track.scale[0];
      blip(midi(track.root, semi), 0.4, 'square', 0.1, when, musicGain);
      blip(midi(track.root, semi + 3), 0.4, 'square', 0.08, when, musicGain);
      blip(midi(track.root, semi + 7), 0.4, 'square', 0.07, when, musicGain);
    }
  }

  function scheduleDungeon(track, when, step, beat) {
    if (beat === 0) {
      blip(midi(track.root - 24, 0), 0.45, 'triangle', 0.28, when, musicGain);
      noiseBurst(0.12, 0.08, when, 180, 'lowpass');
    }
    if (step % 16 === 0) {
      [0, 4, 7, 12].forEach((s, i) => brass(midi(track.root, s), 0.28, 0.22, when + i * 0.09));
    } else if (beat === 0 || beat === 4) {
      const semi = track.scale[(step >> 2) % track.scale.length];
      brass(midi(track.root, semi), 0.42, 0.2, when);
    }
    if (beat === 6 && Math.random() < 0.5) brass(midi(track.root + 12, 4), 0.2, 0.12, when);
  }

  function scheduleZimmer(track, when, step, beat) {
    const ost = [0, 7, 3, 8];
    if (beat % 2 === 0) {
      const semi = ost[(step >> 1) % ost.length];
      piano(midi(track.root, semi), 0.85, 0.2, when);
    }
    if (step % 32 === 0) braam(when);
    if (beat === 0 && step % 8 === 0) {
      blip(midi(track.root - 12, 0), 1.4, 'sine', 0.1, when, musicGain);
      blip(midi(track.root - 12, 7), 1.4, 'sine', 0.08, when, musicGain);
    }
    if (beat === 0 || beat === 4) {
      blip(1100, 0.03, 'square', 0.045, when, musicGain);
    }
    if (step % 16 === 8) {
      brass(midi(track.root - 12, 0), 0.9, 0.1, when);
    }
  }

  function scheduleKitchen(track, when, step, beat) {
    const waltz = step % 6;
    if (waltz === 0) {
      const bassDeg = [0, 0, 7, 7, 9, 5][Math.floor(step / 6) % 6];
      blip(midi(track.root - 24, bassDeg), 0.22, 'triangle', 0.28, when, musicGain);
    }
    if (waltz === 2 || waltz === 4) {
      const chord = waltz === 2 ? [0, 4, 7] : [7, 11, 14];
      chord.forEach(s => accordion(midi(track.root, s), 0.18, 0.09, when));
    }
    if (waltz === 3 && Math.random() < 0.7) {
      blip(1600 + Math.random() * 400, 0.05, 'triangle', 0.14, when, musicGain, 900);
    }
    if (waltz === 5 && Math.random() < 0.4) {
      noiseBurst(0.08, 0.1, when, 1200, 'bandpass');
    }
    if (step % 12 === 6) {
      const semi = track.scale[leadNote % track.scale.length];
      accordion(midi(track.root + 12, semi), 0.16, 0.14, when);
      leadNote = (leadNote + (Math.random() < 0.5 ? 1 : 2)) % track.scale.length;
    }
  }

  function scheduleSauna(track, when, step, beat) {
    if (beat === 0) kick(when, 0.28);
    if (beat === 4) {
      noiseBurst(0.12, 0.12, when, 1800, 'bandpass');
      blip(220, 0.1, 'sine', 0.1, when, musicGain);
    }
    if (beat === 0 && step % 8 === 0) {
      [0, 3, 7, 10].forEach(s => blip(midi(track.root, s), 1.1, 'sine', 0.07, when, musicGain));
    }
    if ((beat === 2 || beat === 6) && Math.random() < 0.65) {
      const semi = track.scale[(step >> 1) % track.scale.length];
      blip(midi(track.root + 12, semi), 0.35, 'triangle', 0.12, when, musicGain);
      blip(midi(track.root + 12, semi) * 2, 0.12, 'sine', 0.05, when, musicGain);
    }
    if (beat === 3) noiseBurst(0.2, 0.04, when, 2400, 'lowpass');
  }

  function scheduleFantasy(track, when, step, beat) {
    if (beat % 2 === 0) {
      const arp = [0, 4, 7, 12, 7, 4];
      const semi = arp[(step >> 1) % arp.length];
      celesta(midi(track.root, semi), 0.28, 0.16, when);
    }
    if (step % 16 === 0) {
      [0, 4, 7].forEach(s => blip(midi(track.root - 12, s), 1.2, 'sine', 0.08, when, musicGain));
    }
    if (beat === 7 && Math.random() < 0.5) {
      for (let i = 0; i < 6; i++) {
        celesta(midi(track.root + 12, 12 - i * 2), 0.1, 0.07, when + i * 0.04);
      }
    }
    if (Math.random() < 0.12) {
      blip(1400 + Math.random() * 1200, 0.08, 'sine', 0.07, when, musicGain);
    }
  }

  function scheduleFesse(track, when, step, beat) {
    if (beat === 0) heartbeat(when, 0.42);
    if (beat === 2 || beat === 6) slap(when, beat === 2 ? 0.4 : 0.28);
    if (beat === 4) slap(when, 0.22);
    if (beat === 0 || beat === 4) {
      const semi = track.scale[(Math.floor(step / 8)) % 4];
      blip(midi(track.root - 24, semi), 0.32, 'triangle', 0.22, when, musicGain);
    }
    if (beat === 0 && step % 8 === 0) {
      [0, 3, 7].forEach(s => blip(midi(track.root, s), 0.7, 'sine', 0.07, when, musicGain));
    }
    if (step % 32 === 16) {
      const quotes = Math.floor(step / 32) % 8;
      if (quotes === 0) drip(when, 0.2);
      else if (quotes === 1) noiseBurst(0.45, 0.1, when, 400, 'lowpass');
      else if (quotes === 2) kick(when, 0.5);
      else if (quotes === 3) brass(midi(track.root, 7), 0.35, 0.18, when);
      else if (quotes === 4) braam(when);
      else if (quotes === 5) accordion(midi(track.root + 12, 4), 0.28, 0.16, when);
      else if (quotes === 6) {
        [0, 3, 7, 10].forEach(s => blip(midi(track.root, s), 0.8, 'sine', 0.06, when, musicGain));
      } else {
        celesta(midi(track.root + 12, 12), 0.3, 0.14, when);
      }
    }
    if (step % 64 === 48) {
      [0, 4, 7, 12, 16].forEach((s, i) => brass(midi(track.root, s), 0.22, 0.16, when + i * 0.08));
    }
  }

  function scheduleStep(track, when, step) {
    const beat = step % 8;
    const f = track.flavor;
    if (f === 'drip') scheduleBathroom(track, when, step, beat);
    else if (f === 'wave') scheduleBeach(track, when, step, beat);
    else if (f === 'kick') scheduleClub(track, when, step, beat);
    else if (f === 'brass') scheduleDungeon(track, when, step, beat);
    else if (f === 'zimmer') scheduleZimmer(track, when, step, beat);
    else if (f === 'ratatouille') scheduleKitchen(track, when, step, beat);
    else if (f === 'chill') scheduleSauna(track, when, step, beat);
    else if (f === 'fantasy') scheduleFantasy(track, when, step, beat);
    else if (f === 'fesse') scheduleFesse(track, when, step, beat);
  }

  function startMusic(trackName) {
    ensureCtx();
    stopMusic();
    const track = TRACKS[trackName] || TRACKS.bathroom;
    currentTrack = track;
    nextNoteTime = ctx.currentTime + 0.08;
    stepIndex = 0;
    leadNote = 0;
    ducked = false;
    startScene(track);
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(0.001, ctx.currentTime);
    applyGains();
    const stepDur = 60 / track.bpm / 2;
    schedulerId = setInterval(() => {
      while (nextNoteTime < ctx.currentTime + 0.28) {
        scheduleStep(track, nextNoteTime, stepIndex);
        nextNoteTime += stepDur;
        stepIndex++;
      }
    }, 80);
  }

  function stopMusic() {
    if (schedulerId) { clearInterval(schedulerId); schedulerId = null; }
    if (ctx && musicGain) {
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    }
    for (const src of ambients) {
      try { src.stop(); } catch (e) { /* déjà stoppé */ }
      try { src.disconnect(); } catch (e) { /* déjà débranché */ }
    }
    ambients = [];
    scene = {};
    currentTrack = null;
  }

  const SFX = {
    eat() {
      ensureCtx();
      const f = currentTrack && currentTrack.flavor;
      if (f === 'drip') drip(ctx.currentTime, 0.28);
      else if (f === 'wave') { noiseBurst(0.12, 0.2, ctx.currentTime, 600, 'lowpass', masterGain); blip(480, 0.1, 'sine', 0.25, null, masterGain, 220); }
      else if (f === 'kick') { blip(90, 0.08, 'sine', 0.35, null, masterGain, 50); hat(ctx.currentTime, 0.2); }
      else if (f === 'brass') brass(midi(64, 4), 0.16, 0.28, ctx.currentTime);
      else if (f === 'zimmer') piano(midi(72, 0), 0.22, 0.32, ctx.currentTime);
      else if (f === 'ratatouille') { blip(1500, 0.06, 'triangle', 0.28, null, masterGain, 800); }
      else if (f === 'chill') blip(midi(72, 3), 0.2, 'sine', 0.28, null, masterGain);
      else if (f === 'fantasy') celesta(midi(79, 7), 0.2, 0.28, ctx.currentTime);
      else if (f === 'fesse') slap(ctx.currentTime, 0.32);
      else {
        blip(520, 0.12, 'sine', 0.5, null, masterGain, 880);
        blip(660, 0.1, 'square', 0.15, ctx.currentTime + 0.05, masterGain, 990);
      }
    },
    bonus() { ensureCtx(); [0, 4, 7, 12].forEach((s, i) => blip(midi(72, s), 0.12, 'square', 0.3, ctx.currentTime + i * 0.07, masterGain)); },
    click() { ensureCtx(); blip(700, 0.06, 'sine', 0.3, null, masterGain, 500); },
    death() {
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
    hit() {
      ensureCtx();
      if (currentTrack && currentTrack.flavor === 'fesse') slap(ctx.currentTime, 0.45);
      else {
        blip(180, 0.18, 'sawtooth', 0.4, null, masterGain, 90);
        blip(420, 0.08, 'square', 0.25, ctx.currentTime + 0.04, masterGain);
      }
    },
  };

  return { startMusic, stopMusic, sfx: SFX, ensureCtx, setMuted, isMuted, duckMusic };
})();
