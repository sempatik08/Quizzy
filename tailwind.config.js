/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/context/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          soft:  'var(--color-blue-soft)',
          light: 'var(--color-blue-light)',
          pale:  'var(--color-blue-pale)',
        },
        red: {
          soft:  'var(--color-red-soft)',
          light: 'var(--color-red-light)',
          pale:  'var(--color-red-pale)',
        },
        quizzy: {
          bg:     'var(--color-bg)',
          card:   'var(--color-card)',
          border: 'var(--color-border)',
          text:   'var(--color-text)',
          muted:  'var(--color-muted)',
          subtle: 'var(--color-subtle)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:       '0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.10)',
      },
      animation: {
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'spin-slow':  'spin 1.5s linear infinite',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4,0,0.6,1) infinite',
        // PBI 15 polish
        'confetti-fall': 'confettiFall linear forwards',
        'pop-in':        'popIn 0.32s cubic-bezier(0.34,1.56,0.64,1)',
        'shake':         'shake 0.4s cubic-bezier(0.36,0.07,0.19,0.97)',
        'emoji-float':   'emojiFloat 2.6s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
        // Drift and spin come from per-piece CSS variables set in Confetti.tsx,
        // so one keyframe covers every piece.
        confettiFall: {
          '0%': {
            opacity: '1',
            transform: 'translate3d(0, 0, 0) rotate(0deg)',
          },
          '100%': {
            opacity: '0',
            transform:
              'translate3d(var(--confetti-drift, 0px), 105vh, 0) rotate(var(--confetti-spin, 360deg))',
          },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '0%, 100%':   { transform: 'translateX(0)' },
          '20%, 60%':   { transform: 'translateX(-5px)' },
          '40%, 80%':   { transform: 'translateX(5px)' },
        },
        emojiFloat: {
          '0%':   { opacity: '0', transform: 'translateY(6px) scale(0.7)' },
          '15%':  { opacity: '1', transform: 'translateY(0) scale(1.15)' },
          '30%':  { transform: 'translateY(-14px) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-96px) scale(0.9)' },
        },
      },
    },
  },
  plugins: [],
};
