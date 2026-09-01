/* ===== ZIGOUIGOUI — pubs (prêt pour plus tard) =====
   Aujourd’hui : simulateur (mock) pour tester le parcours.
   Demain : tu branches un vrai réseau via window.ZigouigouiAds.

   Argent réel = un compte pub + IDs ci-dessous. Google AdMob / AdSense
   refusent souvent le contenu adulte : vise un réseau qui l’accepte
   (ExoClick, TrafficStars, JuicyAds…) ou un SDK store plus tard.

   Adapter attendu :
     window.ZigouigouiAds = {
       init(config): Promise<void>
       isReady(placementId): boolean
       showRewarded(placementId): Promise<'rewarded'|'skipped'|'failed'>
       showInterstitial(placementId): Promise<'closed'|'failed'>
     }
*/

const AdsMan = (() => {
  const CONFIG = {
    enabled: true,
    provider: 'mock', // 'mock' | 'none' | 'adapter'
    testMode: true,
    creditsPerAd: 12,
    continuePerRun: 2,
    creditCooldownMs: 75 * 1000,
    creditsPerDay: 6,
    interstitialEnabled: false,
    interstitialEveryMs: 3 * 60 * 1000,
    mockSeconds: { rewarded: 6, interstitial: 4 },
    eCpmEur: { rewarded: 0.012, interstitial: 0.004 },
    placements: {
      continue: 'zgg-rewarded-continue',
      credits: 'zgg-rewarded-credits',
      interstitial: 'zgg-interstitial',
    },
  };

  const el = {
    layer: null, title: null, copy: null, bar: null, timer: null, skip: null, consent: null,
  };

  let busy = false;
  let continuesThisRun = 0;
  let lastInterstitial = 0;
  let skipTimer = null;
  let tickTimer = null;

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function stats() {
    if (!Save.data.ads) {
      Save.data.ads = {
        consent: null,
        impressions: 0,
        rewards: 0,
        estimatedCents: 0,
        lastCreditAt: 0,
        creditsToday: 0,
        creditsDay: '',
      };
    }
    const a = Save.data.ads;
    if (a.creditsDay !== todayKey()) {
      a.creditsDay = todayKey();
      a.creditsToday = 0;
    }
    return a;
  }

  function persist() { Save.write(); }

  function consented() {
    return stats().consent === 'yes';
  }

  function ready() {
    return CONFIG.enabled && CONFIG.provider !== 'none' && consented() && !busy;
  }

  function $(id) { return document.getElementById(id); }

  function bindDom() {
    el.layer = $('ad-layer');
    el.title = $('ad-title');
    el.copy = $('ad-copy');
    el.bar = $('ad-bar');
    el.timer = $('ad-timer');
    el.skip = $('ad-skip');
    el.consent = $('ad-consent');
    if (el.skip) el.skip.addEventListener('click', () => finish('skipped'));
    const yes = $('ad-consent-yes');
    const no = $('ad-consent-no');
    if (yes) yes.addEventListener('click', () => setConsent('yes'));
    if (no) no.addEventListener('click', () => setConsent('no'));
  }

  function setConsent(value) {
    stats().consent = value;
    persist();
    if (el.consent) el.consent.classList.add('hidden');
    if (typeof AdsMan.onConsent === 'function') AdsMan.onConsent(value);
  }

  function maybeAskConsent() {
    if (!CONFIG.enabled || CONFIG.provider === 'none') return;
    if (stats().consent) return;
    if (el.consent) el.consent.classList.remove('hidden');
  }

  let waiter = null;
  function finish(result) {
    clearInterval(tickTimer);
    clearTimeout(skipTimer);
    tickTimer = skipTimer = null;
    if (el.layer) el.layer.classList.add('hidden');
    if (el.skip) el.skip.classList.add('hidden');
    AudioMan.duckMusic(false);
    busy = false;
    const done = waiter;
    waiter = null;
    if (done) done(result);
  }

  function showMock(kind, placement) {
    return new Promise(resolve => {
      waiter = resolve;
      busy = true;
      const secs = CONFIG.mockSeconds[kind] || 5;
      const start = performance.now();
      if (el.title) el.title.textContent = kind === 'rewarded' ? 'Pub récompensée' : 'Pub partenaire';
      if (el.copy) {
        el.copy.textContent = CONFIG.testMode
          ? 'Mode test — plus tard, une vraie pub ici, et de l’argent sur ton compte.'
          : 'Merci, cette pub aide Zigouigoui à rester en ligne.';
      }
      if (el.timer) el.timer.textContent = `${secs} s`;
      if (el.bar) el.bar.style.width = '0%';
      if (el.skip) {
        el.skip.classList.toggle('hidden', kind === 'rewarded');
        el.skip.disabled = true;
      }
      if (el.layer) el.layer.classList.remove('hidden');
      AudioMan.duckMusic(true);
      tickTimer = setInterval(() => {
        const left = Math.max(0, secs - (performance.now() - start) / 1000);
        const pct = Math.min(100, ((secs - left) / secs) * 100);
        if (el.bar) el.bar.style.width = pct + '%';
        if (el.timer) el.timer.textContent = left > 0.05 ? `${Math.ceil(left)} s` : 'OK';
        if (kind !== 'rewarded' && el.skip && secs - left >= 2) el.skip.disabled = false;
        if (left <= 0) {
          record(kind === 'rewarded' ? 'rewarded' : 'interstitial', placement);
          finish(kind === 'rewarded' ? 'rewarded' : 'closed');
        }
      }, 80);
    });
  }

  function record(kind, placement) {
    const a = stats();
    a.impressions++;
    if (kind === 'rewarded') a.rewards++;
    const eur = CONFIG.eCpmEur[kind] || 0;
    a.estimatedCents += Math.round(eur * 100);
    persist();
    void placement;
  }

  async function viaAdapter(kind, placementId) {
    const api = window.ZigouigouiAds;
    if (!api) return 'failed';
    busy = true;
    AudioMan.duckMusic(true);
    try {
      const fn = kind === 'rewarded' ? api.showRewarded : api.showInterstitial;
      const result = await fn.call(api, placementId);
      if (result === 'rewarded' || result === 'closed') record(kind, placementId);
      return result;
    } catch (e) {
      return 'failed';
    } finally {
      AudioMan.duckMusic(false);
      busy = false;
    }
  }

  async function play(kind, placementId) {
    if (!ready()) return 'failed';
    if (CONFIG.provider === 'adapter' && window.ZigouigouiAds) {
      return viaAdapter(kind, placementId);
    }
    return showMock(kind, placementId);
  }

  function canContinue() {
    return ready() && continuesThisRun < CONFIG.continuePerRun && Game.hasAdContinue();
  }

  function canCredits() {
    if (!ready()) return false;
    const a = stats();
    if (a.creditsToday >= CONFIG.creditsPerDay) return false;
    if (Date.now() - (a.lastCreditAt || 0) < CONFIG.creditCooldownMs) return false;
    return true;
  }

  async function watchContinue() {
    if (!canContinue()) return false;
    const result = await play('rewarded', CONFIG.placements.continue);
    if (result !== 'rewarded') return false;
    continuesThisRun++;
    return true;
  }

  async function watchCredits() {
    if (!canCredits()) return 0;
    const result = await play('rewarded', CONFIG.placements.credits);
    if (result !== 'rewarded') return 0;
    const a = stats();
    a.lastCreditAt = Date.now();
    a.creditsToday++;
    persist();
    Save.addCredits(CONFIG.creditsPerAd);
    return CONFIG.creditsPerAd;
  }

  async function maybeInterstitial() {
    if (!ready() || !CONFIG.interstitialEnabled) return;
    if (Date.now() - lastInterstitial < CONFIG.interstitialEveryMs) return;
    lastInterstitial = Date.now();
    await play('interstitial', CONFIG.placements.interstitial);
  }

  function newRun() { continuesThisRun = 0; }

  async function init() {
    bindDom();
    stats();
    if (CONFIG.provider === 'adapter' && window.ZigouigouiAds && window.ZigouigouiAds.init) {
      try { await window.ZigouigouiAds.init(CONFIG); } catch (e) { /* réseau pas prêt */ }
    }
    maybeAskConsent();
  }

  return {
    CONFIG, init, ready, consented, canContinue, canCredits,
    watchContinue, watchCredits, maybeInterstitial, newRun, maybeAskConsent,
    onConsent: null,
    stats,
  };
})();
