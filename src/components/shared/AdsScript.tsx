'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { useSound } from '@/context/SoundContext';
import { ADS_ENABLED, ADS_TEST_MODE, ADSENSE_CLIENT, configureAds, installAdStubs } from '@/lib/ads';

/**
 * Loads Google's H5 Games Ads script (PBI 32). Rendered only on the game page,
 * so the home page and lobby stay free of third-party script weight.
 *
 * Renders nothing when NEXT_PUBLIC_ADSENSE_CLIENT is unset.
 */
export function AdsScript() {
  const { enabled: soundOn } = useSound();

  useEffect(() => {
    if (!ADS_ENABLED) return;
    installAdStubs();
    configureAds(soundOn);
  }, [soundOn]);

  if (!ADS_ENABLED) return null;

  return (
    <Script
      id="h5-games-ads"
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      // Google's frequency cap still applies on top; this only asks for no
      // more than one interstitial every two minutes.
      data-ad-frequency-hint="120s"
      {...(ADS_TEST_MODE ? { 'data-adbreak-test': 'on' } : {})}
    />
  );
}
