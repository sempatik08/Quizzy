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
      },
    },
  },
  plugins: [],
};
