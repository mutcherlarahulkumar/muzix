/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        muzix: {
          bg: '#070711',
          surface: '#0d0d1a',
          card: '#111128',
          border: 'rgba(255,255,255,0.08)',
          purple: '#8b5cf6',
          pink: '#ec4899',
          cyan: '#06b6d4',
          muted: '#64748b',
        }
      },
      backgroundImage: {
        'gradient-muzix': 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
        'gradient-dark': 'linear-gradient(135deg, #070711 0%, #0d0d1a 100%)',
      },
      boxShadow: {
        'neon-purple': '0 0 30px rgba(139, 92, 246, 0.35)',
        'neon-pink': '0 0 30px rgba(236, 72, 153, 0.35)',
        'neon-cyan': '0 0 30px rgba(6, 182, 212, 0.35)',
        'card': '0 4px 32px rgba(0,0,0,0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 3s infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-16px)' },
        }
      },
    },
  },
  plugins: [],
}
