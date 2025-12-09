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
        // Apple-Inspired Enterprise Design System
        'apple': {
          'bg': '#1C1C1E',           // Graphite - Main background
          'surface': '#2C2C2E',       // Dark Gray - Cards, modals, sidebars
          'surface-hover': '#3A3A3C', // Hover state for surfaces
          'border': '#38383A',        // Subtle borders
          'accent': '#007AFF',        // Functional Blue - Primary actions
          'text': '#F5F5F7',          // Off-White - Primary text and icons
          'text-muted': '#98989D',    // Secondary/muted text
          'success': '#34C759',       // Standard Green - Success states
          'warning': '#FF9500',       // Orange for warnings
          'error': '#FF3B30',         // System Red for errors
        },
        // Legacy Dashbrd support (mapped to Apple colors for backward compatibility)
        'dashbrd': {
          'bg': '#1C1C1E',
          'card': '#2C2C2E',
          'card-hover': '#3A3A3C',
          'border': '#38383A',
          'border-light': '#38383A',
          'accent': '#007AFF',
          'accent-glow': 'rgba(0, 122, 255, 0.2)',
          'text': '#F5F5F7',
          'text-muted': '#98989D',
          'text-subtle': '#98989D',
          'success': '#34C759',
          'warning': '#FF9500',
          'error': '#FF3B30',
        },
        // OmniVerifier Design System (legacy - kept for backward compatibility)
        'omni-black': '#1C1C1E',
        'omni-dark': '#2C2C2E',
        'omni-cyan': '#007AFF',
        'omni-white': '#F5F5F7',
        'omni-gray': '#98989D',
        'omni-light-gray': '#98989D',
        'omni-border': '#38383A',
        // Legacy support
        border: '#38383A',
        background: '#1C1C1E',
        foreground: '#F5F5F7',
        primary: {
          DEFAULT: '#007AFF',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#2C2C2E',
          foreground: '#F5F5F7',
        },
        muted: {
          DEFAULT: '#98989D',
          foreground: '#98989D',
        },
        accent: {
          DEFAULT: '#007AFF',
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


