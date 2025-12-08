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
        // OmniVerifier Design System
        'omni-black': '#000000',
        'omni-dark': '#181A1A',
        'omni-cyan': '#00D9FF',
        'omni-white': '#FFFFFF',
        'omni-gray': '#999999',
        'omni-light-gray': '#CCCCCC',
        'omni-border': '#333333',
        // Legacy support
        border: '#333333',
        background: '#000000',
        foreground: '#FFFFFF',
        primary: {
          DEFAULT: '#00D9FF',
          foreground: '#000000',
        },
        secondary: {
          DEFAULT: '#181A1A',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: '#999999',
          foreground: '#CCCCCC',
        },
        accent: {
          DEFAULT: '#00D9FF',
          foreground: '#000000',
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


