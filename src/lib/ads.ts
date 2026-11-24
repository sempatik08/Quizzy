/**
 * Between-match ads on our own domain via Google's H5 Games Ads (PBI 32).
 *
 * Placement policy, deliberately narrow:
 *   - Interstitials only at a screen transition the player chose: match end →
 *     "Play again" / "Find a new opponent". Never during a question, never on
 *     the home page or in the lobby.
 *   - No rewarded ads yet. The obvious reward ("watch an ad, get an extra
 *     joker") is client-claimed — H5 gives the server no way to verify it — and
 *     in a team match it would let one side buy an advantage over the other.
 *
 * Everything is off unless NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-…) is set at
 * build time, so local dev, Docker images and forks show nothing. With it unset
 * `showInterstitial` just runs the continuation.
 *
 * Google decides whether an ad actually plays (frequency capping, fill, the
 * account's approval state). Our job is only to offer the break and to make
 * sure the game always continues — `adBreakDone` fires even when no ad was
 * shown, and a fallback timer covers the script never loading at all (ad
 * blockers, offline, not yet approved).
 */

export const ADSENSE_CLIENT = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '').trim();

/** "on" serves Google's test ads — use on staging and while the account is under review. */
export const ADS_TEST_MODE = process.env.NEXT_PUBLIC_ADS_TEST === '1';

/** A valid publisher id looks like ca-pub-1234567890123456. */
export function isValidClientId(id: string): boolean {
  return /^ca-pub-\d{10,20}$/.test(id);
}

export const ADS_ENABLED = isValidClientId(ADSENSE_CLIENT);

/**
 * How long to wait for the ad script to take over before giving up and
 * continuing. Once `beforeAd` fires an ad is on screen and the timer is
 * cancelled — we never navigate out from under a playing ad.
 */
export const AD_FALLBACK_MS = 2500;

type AdBreakDone = { breakStatus?: string };

interface AdBreakParams {
  type: 'start' | 'pause' | 'next' | 'browse' | 'reward';
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: (info: AdBreakDone) => void;
}

interface AdConfigParams {
  preloadAdBreaks?: 'on' | 'auto';
  sound?: 'on' | 'off';
  onReady?: () => void;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (o: AdBreakParams) => void;
    adConfig?: (o: AdConfigParams) => void;
  }
}

/**
 * Defines the `adBreak`/`adConfig` stubs Google's docs ask for. Calls made
 * before adsbygoogle.js finishes loading are queued on `window.adsbygoogle`
 * and replayed by the script. Safe to call more than once.
 */
export function installAdStubs(win: Window = window): void {
  win.adsbygoogle = win.adsbygoogle || [];
  if (!win.adBreak) {
    win.adBreak = win.adConfig = function (o: unknown) {
      (win.adsbygoogle as unknown[]).push(o);
    } as never;
  }
}

/** Sets preloading and whether ads may play sound (mirrors the in-game toggle). */
export function configureAds(soundOn: boolean): void {
  if (!ADS_ENABLED || typeof window === 'undefined') return;
  installAdStubs();
  window.adConfig?.({ preloadAdBreaks: 'on', sound: soundOn ? 'on' : 'off' });
}

/**
 * Offer an interstitial, then run `next` exactly once — whether an ad played,
 * was skipped by frequency capping, failed to fill, or the script never loaded.
 *
 * `name` is the placement label that shows up in AdSense reports.
 */
export function showInterstitial(
  name: string,
  next: () => void,
  opts: { win?: Window; enabled?: boolean; fallbackMs?: number } = {},
): void {
  const enabled = opts.enabled ?? ADS_ENABLED;
  const win = opts.win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!enabled || !win) {
    next();
    return;
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    next();
  };

  const timer = setTimeout(finish, opts.fallbackMs ?? AD_FALLBACK_MS);

  try {
    installAdStubs(win);
    win.adBreak!({
      type: 'next',
      name,
      // An ad is now covering the page: wait for it however long it runs.
      beforeAd: () => clearTimeout(timer),
      adBreakDone: () => finish(),
    });
  } catch {
    finish();
  }
}
