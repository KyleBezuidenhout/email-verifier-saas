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
        // Premium B2B Landing Page Design System - Pure Dark Aesthetic
        'landing': {
          'bg': '#0D0F12',            // Near Black - Primary sections
          'bg-alt': '#121418',        // Charcoal - Alternate sections
          'surface': '#161A1F',       // Subtle lift - Cards
          'card': '#1A1E24',          // Card backgrounds on alt sections
          'accent': '#0099FF',        // Vibrant Blue - CTAs and highlights
          'text': '#F0F4F8',          // Off-White - Body text
          'heading': '#FFFFFF',       // Pure White - Main headings
          'border': '#252A31',        // Subtle border color (neutral gray)
          'muted': '#6B7280',         // Muted text for secondary content
        },
        // Unified Black Glass Design System (formerly Apple-inspired)
        'apple': {
          'bg': '#000000',            // Pure Black - Main background
          'surface': '#0A0C0F',       // Near black - Cards, modals, sidebars
          'surface-hover': '#161A1F', // Hover state for surfaces
          'border': '#1E2228',        // Subtle dark borders
          'accent': '#0099FF',        // Vibrant Blue - Primary actions
          'text': '#F5F5F7',          // Off-White - Primary text and icons
          'text-muted': '#6B7280',    // Secondary/muted text
          'success': '#34C759',       // Standard Green - Success states
          'warning': '#FF9500',       // Orange for warnings
          'error': '#FF3B30',         // System Red for errors
        },
        // Dashboard Dark Theme - Matching landing page
        'dashboard-dark': '#000000',
        'dashboard': {
          'bg': '#000000',            // Pure Black background
          'surface': '#0D0F12',       // Near black for cards
          'surface-alt': '#121418',   // Slightly lighter surface
          'card': '#161A1F',          // Card backgrounds
          'border': '#1E2228',        // Subtle border
          'border-light': '#252A31',  // Lighter border
          'accent': '#0099FF',        // Vibrant Blue
          'text': '#F0F4F8',          // Off-White text
          'text-muted': '#6B7280',    // Muted text
        },
        // Legacy Dashbrd support (mapped to black glass for consistency)
        'dashbrd': {
          'bg': '#000000',
          'card': '#0D0F12',
          'card-hover': '#161A1F',
          'border': '#1E2228',
          'border-light': '#252A31',
          'accent': '#0099FF',
          'accent-glow': 'rgba(0, 153, 255, 0.2)',
          'text': '#F5F5F7',
          'text-muted': '#6B7280',
          'text-subtle': '#6B7280',
          'success': '#34C759',
          'warning': '#FF9500',
          'error': '#FF3B30',
        },
        // OmniVerifier Design System (legacy - mapped to black glass)
        'omni-black': '#000000',
        'omni-dark': '#0D0F12',
        'omni-cyan': '#0099FF',
        'omni-white': '#F5F5F7',
        'omni-gray': '#6B7280',
        'omni-light-gray': '#6B7280',
        'omni-border': '#1E2228',
        // Legacy support
        border: '#1E2228',
        background: '#000000',
        foreground: '#F5F5F7',
        primary: {
          DEFAULT: '#0099FF',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#0D0F12',
          foreground: '#F5F5F7',
        },
        muted: {
          DEFAULT: '#6B7280',
          foreground: '#6B7280',
        },
        accent: {
          DEFAULT: '#0099FF',
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


