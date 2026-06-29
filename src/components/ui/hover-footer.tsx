'use client';

import { useRef, useState, useCallback, useId } from 'react';

interface TextHoverEffectProps {
  text: string;
  className?: string;
}

export function TextHoverEffect({ text, className = '' }: TextHoverEffectProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState(false);
  const [maskPos, setMaskPos] = useState({ cx: '50%', cy: '50%' });
  const id = useId().replace(/:/g, '');

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * 100;
    const cy = ((e.clientY - rect.top) / rect.height) * 100;
    setMaskPos({ cx: `${cx}%`, cy: `${cy}%` });
  }, []);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 300 80"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <defs>
        <linearGradient id={`stroke-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4D96FF" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#a855f7" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FF6B6B" stopOpacity="0.6" />
        </linearGradient>

        <radialGradient
          id={`hover-${id}`}
          gradientUnits="userSpaceOnUse"
          r="30%"
          cx={maskPos.cx}
          cy={maskPos.cy}
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity={hovered ? '1' : '0'} />
          <stop offset="70%" stopColor="#4D96FF" stopOpacity={hovered ? '0.6' : '0'} />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>

        <mask id={`mask-${id}`}>
          <rect width="100%" height="100%" fill="black" />
          <text
            x="50%"
            y="72%"
            textAnchor="middle"
            fontSize="60"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
            fill="white"
            letterSpacing="4"
          >
            {text}
          </text>
        </mask>
      </defs>

      {/* Static outline */}
      <text
        x="50%"
        y="72%"
        textAnchor="middle"
        fontSize="60"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        fill="transparent"
        stroke={`url(#stroke-${id})`}
        strokeWidth="0.8"
        letterSpacing="4"
        style={{ transition: 'opacity 0.3s' }}
      >
        {text}
      </text>

      {/* Hover spotlight */}
      <rect
        width="100%"
        height="100%"
        fill={`url(#hover-${id})`}
        mask={`url(#mask-${id})`}
        style={{ transition: 'opacity 0.2s' }}
      />
    </svg>
  );
}

export function FooterBackgroundGradient() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -bottom-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(ellipse, #4D96FF 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-16 left-1/4 h-48 w-72 rounded-full opacity-10 blur-3xl"
        style={{ background: 'radial-gradient(ellipse, #a855f7 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-16 right-1/4 h-48 w-72 rounded-full opacity-10 blur-3xl"
        style={{ background: 'radial-gradient(ellipse, #FF6B6B 0%, transparent 70%)' }}
      />
    </div>
  );
}
