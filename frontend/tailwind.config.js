/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dashbrd X Design System
        'dashbrd': {
          'bg': '#0D0F14',
          'card': '#141821',
          'card-hover': '#1A1F2C',
          'border': '#1E2433',
          'border-light': '#2A3142',
          'accent': '#3B82F6',
          'accent-glow': 'rgba(59, 130, 246, 0.2)',
          'text': '#FFFFFF',
          'text-muted': '#6B7280',
          'text-subtle': '#4B5563',
          'success': '#10B981',
          'warning': '#F59E0B',
          'error': '#EF4444',
        },
        // OmniVerifier Design System (legacy - kept for backward compatibility)
        'omni-black': '#0D0F14',
        'omni-dark': '#141821',
        'omni-cyan': '#3B82F6',
        'omni-white': '#FFFFFF',
        'omni-gray': '#6B7280',
        'omni-light-gray': '#9CA3AF',
        'omni-border': '#1E2433',
        // Legacy support
        border: '#1E2433',
        background: '#0D0F14',
        foreground: '#FFFFFF',
        primary: {
          DEFAULT: '#3B82F6',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#141821',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: '#6B7280',
          foreground: '#9CA3AF',
        },
        accent: {
          DEFAULT: '#3B82F6',
          foreground: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
      },
      spacing: {
        'xs': '4px',
        's': '8px',
        'm': '12px',
        'l': '16px',
        'xl': '24px',
        '2xl': '32px',
        '3xl': '48px',
        '4xl': '60px',
        '5xl': '100px',
        '15': '60px',
      },
    },
  },
  plugins: [],
}


