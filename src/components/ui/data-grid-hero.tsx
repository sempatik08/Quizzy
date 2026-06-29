'use client';

import { useRef, useEffect, useCallback, ReactNode } from 'react';

export interface DataGridHeroProps {
  rows?: number;
  cols?: number;
  spacing?: number;
  duration?: number;
  /** Any CSS color string. CSS variables (e.g. "var(--color-blue-soft)") are resolved at runtime. */
  color?: string;
  animationType?: 'pulse' | 'wave' | 'random';
  pulseEffect?: boolean;
  mouseGlow?: boolean;
  opacityMin?: number;
  opacityMax?: number;
  background?: string;
  children?: ReactNode;
  className?: string;
}

function resolveCssColor(color: string): string {
  if (typeof window === 'undefined') return color;
  if (!color.startsWith('var(')) return color;
  const match = color.match(/var\(\s*(--[\w-]+)\s*\)/);
  if (!match) return color;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(match[1])
    .trim();
  return value || color;
}

/** Parse any canvas-compatible color string into its RGB triple. */
function colorToRgb(color: string): [number, number, number] {
  if (typeof window === 'undefined') return [77, 150, 255];

  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export default function DataGridHero({
  rows = 22,
  cols = 32,
  spacing = 3,
  duration = 6,
  color = 'var(--color-blue-soft)',
  animationType = 'pulse',
  pulseEffect = true,
  mouseGlow = true,
  opacityMin = 0.03,
  opacityMax = 0.45,
  background = 'var(--color-bg)',
  children,
  className = '',
}: DataGridHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -99999, y: -99999 });
  const frameRef = useRef<number>(0);
  const phasesRef = useRef<Float32Array | null>(null);

  /* Build random phase table once per grid-size change */
  const buildPhases = useCallback(() => {
    const arr = new Float32Array(rows * cols);
    for (let i = 0; i < arr.length; i++) arr[i] = Math.random();
    phasesRef.current = arr;
  }, [rows, cols]);

  useEffect(() => {
    buildPhases();
  }, [buildPhases]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* Resolve color once per color prop change */
    const resolvedColor = resolveCssColor(color);
    const [r, g, b] = colorToRgb(resolvedColor);
    const rgbBase = `${r},${g},${b}`;

    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    resize();

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(canvas);

    const startTime = performance.now();

    const draw = (now: number) => {
      const t = (now - startTime) / 1000;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      ctx.clearRect(0, 0, W, H);

      const slotW = W / cols;
      const slotH = H / rows;
      const cellW = Math.max(1, slotW - spacing);
      const cellH = Math.max(1, slotH - spacing);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const glowR = Math.max(slotW, slotH) * 5;

      const centerRow = (rows - 1) / 2;
      const centerCol = (cols - 1) / 2;
      const maxDist = Math.sqrt(centerRow ** 2 + centerCol ** 2) || 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * slotW + spacing / 2;
          const y = row * slotH + spacing / 2;

          /* Phase calculation */
          let phase: number;
          if (animationType === 'pulse') {
            const d = Math.sqrt((row - centerRow) ** 2 + (col - centerCol) ** 2);
            phase = d / maxDist;
          } else if (animationType === 'wave') {
            phase = col / cols + row / rows * 0.3;
          } else {
            phase = phasesRef.current ? phasesRef.current[row * cols + col] : Math.random();
          }

          let opacity =
            opacityMin +
            (opacityMax - opacityMin) *
              (0.5 + 0.5 * Math.sin(2 * Math.PI * (t / duration - phase)));

          /* Secondary pulse ring */
          if (pulseEffect && animationType === 'pulse') {
            const pulse =
              0.5 +
              0.5 *
                Math.sin(2 * Math.PI * (t / (duration * 0.4) - phase * 0.6));
            opacity = Math.max(
              opacity,
              opacityMin + (opacityMax - opacityMin) * pulse * 0.5
            );
          }

          /* Mouse glow */
          if (mouseGlow) {
            const cellCx = x + cellW / 2;
            const cellCy = y + cellH / 2;
            const dist = Math.sqrt((cellCx - mx) ** 2 + (cellCy - my) ** 2);
            if (dist < glowR) {
              const strength = (1 - dist / glowR) ** 2;
              opacity = Math.min(1, opacity + strength * opacityMax * 1.2);
            }
          }

          const alpha = Math.max(0, Math.min(1, opacity));
          ctx.fillStyle = `rgba(${rgbBase},${alpha.toFixed(3)})`;
          ctx.fillRect(x, y, cellW, cellH);
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, [rows, cols, spacing, duration, color, animationType, pulseEffect, mouseGlow, opacityMin, opacityMax]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onMouseLeave = useCallback(() => {
    mouseRef.current = { x: -99999, y: -99999 };
  }, []);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: resolveCssColor(background) || background }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      />
      <div className="relative z-10 flex flex-col min-h-full">{children}</div>
    </div>
  );
}
