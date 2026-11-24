'use strict';

/**
 * Between-match ad break (PBI 32). Pure — no socket server needed.
 *
 * The one property that matters: the game always continues, exactly once,
 * whatever the ad script does — and it never continues out from under an ad
 * that is still playing.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const { createReporter, sleep } = require('./helpers');

const r = createReporter('ADS — H5 interstitial wrapper (PBI 32)');
r.banner();

const SRC = path.join(__dirname, '..', 'src', 'lib', 'ads.ts');

/** Loads src/lib/ads.ts fresh with the given NEXT_PUBLIC_* env. */
function loadAds(env = {}) {
  const saved = { ...process.env };
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  delete process.env.NEXT_PUBLIC_ADS_TEST;
  Object.assign(process.env, env);
  const { outputText } = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const m = new Module(SRC);
  m._compile(outputText, SRC);
  process.env = saved;
  return m.exports;
}

/** A fake window whose adBreak behaves like the real script in a given way. */
function fakeWin(adBreak) {
  return { adsbygoogle: [], adBreak, adConfig: () => {} };
}

(async () => {
  r.section('Configuration');
  {
    const off = loadAds();
    r.check('disabled without a client id', off.ADS_ENABLED === false);
    const bad = loadAds({ NEXT_PUBLIC_ADSENSE_CLIENT: 'pub-123' });
    r.check('malformed client id stays disabled', bad.ADS_ENABLED === false);
    const on = loadAds({ NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890123456' });
    r.check('valid client id enables ads', on.ADS_ENABLED === true);
    r.check('test mode off by default', on.ADS_TEST_MODE === false);
    const test = loadAds({ NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890123456', NEXT_PUBLIC_ADS_TEST: '1' });
    r.check('NEXT_PUBLIC_ADS_TEST=1 turns test mode on', test.ADS_TEST_MODE === true);
  }

  const ads = loadAds();

  r.section('Disabled → continue immediately');
  {
    let n = 0;
    ads.showInterstitial('rematch', () => n++, { enabled: false, win: fakeWin(() => { throw new Error('called'); }) });
    r.check('continuation ran synchronously, ad never offered', n === 1);
  }

  r.section('No ad served (frequency cap / no fill)');
  {
    let n = 0;
    let name = null;
    let type = null;
    const win = fakeWin((o) => { name = o.name; type = o.type; o.adBreakDone({ breakStatus: 'frequencyCapped' }); });
    ads.showInterstitial('rematch', () => n++, { enabled: true, win, fallbackMs: 50 });
    r.check('placement name passed through', name === 'rematch');
    r.check("break type is 'next' (interstitial)", type === 'next');
    r.check('continued once on adBreakDone', n === 1);
    await sleep(80);
    r.check('fallback timer did not fire a second time', n === 1);
  }

  r.section('Ad plays longer than the fallback');
  {
    let n = 0;
    let done;
    const win = fakeWin((o) => { o.beforeAd(); done = o.adBreakDone; });
    ads.showInterstitial('rematch', () => n++, { enabled: true, win, fallbackMs: 30 });
    await sleep(80);
    r.check('did not continue while the ad is on screen', n === 0);
    done({ breakStatus: 'viewed' });
    r.check('continued when the ad finished', n === 1);
    done({ breakStatus: 'viewed' });
    r.check('a duplicate callback is ignored', n === 1);
  }

  r.section('Script never loads (ad blocker / offline)');
  {
    let n = 0;
    const win = { }; // no adBreak: the stub will queue and nothing replays it
    ads.showInterstitial('rematch', () => n++, { enabled: true, win, fallbackMs: 30 });
    r.check('not continued yet', n === 0);
    r.check('call was queued on adsbygoogle', Array.isArray(win.adsbygoogle) && win.adsbygoogle.length === 1);
    await sleep(80);
    r.check('fallback continued the game', n === 1);
  }

  r.section('adBreak throws');
  {
    let n = 0;
    ads.showInterstitial('rematch', () => n++, { enabled: true, win: fakeWin(() => { throw new Error('boom'); }), fallbackMs: 30 });
    r.check('continued immediately', n === 1);
    await sleep(60);
    r.check('and only once', n === 1);
  }

  r.section('Stubs');
  {
    const win = {};
    ads.installAdStubs(win);
    win.adBreak({ type: 'next', name: 'x' });
    win.adConfig({ preloadAdBreaks: 'on' });
    r.check('adBreak/adConfig queue onto adsbygoogle', win.adsbygoogle.length === 2);
    const real = () => {};
    const win2 = { adBreak: real };
    ads.installAdStubs(win2);
    r.check('an existing adBreak is not overwritten', win2.adBreak === real);
  }

  r.section('Placement — no ads during a question');
  {
    const root = path.join(__dirname, '..', 'src');
    const users = [];
    (function walk(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f.name) && /showInterstitial\(/.test(fs.readFileSync(p, 'utf8'))) {
          users.push(path.relative(root, p));
        }
      }
    })(root);
    const allowed = ['lib/ads.ts', 'components/game/WinnerScreen.tsx', 'components/ffa/FfaGame.tsx'];
    const extra = users.filter((u) => !allowed.includes(u.split(path.sep).join('/')));
    r.check('interstitials only from the match-end screens', extra.length === 0, extra.join(', '));
  }

  process.exit(r.finish());
})();
