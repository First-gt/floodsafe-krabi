import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0b1120',
          900: '#0f172a',
          800: '#16213a',
          700: '#1e2d4d',
        },
        ocean: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        safety: '#facc15',
        danger: '#ef4444',
        safe: '#22c55e',
        caution: '#f59e0b',
      },
      fontFamily: {
        sans: ['var(--font-prompt)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fade: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
      animation: {
        'sheet-up': 'sheet-up .28s cubic-bezier(.2,.8,.2,1)',
        fade: 'fade .2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
