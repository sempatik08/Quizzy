'use client';

import { useEffect, useMemo, useState } from 'react';

interface ConfettiProps {
  /** Tints the burst toward the winning team. */
  team: 'blue' | 'red';
  /** Number of pieces. Kept modest — this runs on phones. */
  count?: number;
}

/**
 * Win-screen confetti (PBI 15).
 *
 * Hand-rolled rather than pulled from a package: canvas-confetti and friends
 * are ~15 KB for an effect that shows once per match, and a DOM burst of ~60
 * absolutely-positioned divs animating transform/opacity stays on the compositor
 * and costs nothing measurable.
 *
 * Honours prefers-reduced-motion by rendering nothing at all — a full-screen
 * particle burst is exactly what that setting is asking us not to do.
 */
export function Confetti({ team, count = 60 }: ConfettiProps) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setAllowed(!reduced);
  }, []);

  // Positions are randomised once per mount, not per render.
  const pieces = useMemo(() => {
    const palette =
      team === 'blue'
        ? ['#4D96FF', '#93C5FD', '#DBEAFE', '#FBBF24', '#FFFFFF']
        : ['#FF6B6B', '#FCA5A5', '#FEE2E2', '#FBBF24', '#FFFFFF'];

    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.9,
      duration: 2.4 + Math.random() * 1.8,
      size: 6 + Math.random() * 7,
      drift: (Math.random() - 0.5) * 140,
      spin: 360 + Math.random() * 720,
      color: palette[i % palette.length],
      round: Math.random() > 0.65,
    }));
  }, [team, count]);

  if (!allowed) return null;

  return (
    <div
      aria-hidden="true"
      id="confetti-layer"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-6%] block animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.round ? p.size : p.size * 0.45}px`,
            backgroundColor: p.color,
            borderRadius: p.round ? '9999px' : '1px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            // Read by the keyframes so each piece drifts and spins differently.
            ['--confetti-drift' as string]: `${p.drift}px`,
            ['--confetti-spin' as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
