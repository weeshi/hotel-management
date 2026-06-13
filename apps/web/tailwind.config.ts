import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#FDF8E8',
          100: '#F9EEC5',
          200: '#F3DD8A',
          300: '#EDCC4F',
          400: '#E4BE2A',
          500: '#C9A84C',
          600: '#A8882E',
          700: '#876A1C',
          800: '#6B5215',
          900: '#4F3C10',
        },
        primary: {
          50: '#F0EDE8',
          100: '#D6D0C4',
          200: '#BDB39F',
          300: '#A39C7B',
          400: '#8A8556',
          500: '#0D0D12',
          600: '#13131A',
          700: '#1A1A24',
          800: '#22222E',
          900: '#2A2A36',
        },
        sidebar: {
          DEFAULT: '#13131A',
          hover: '#1A1A24',
        },
        border: {
          DEFAULT: '#2A2A36',
        },
      },
      fontFamily: {
        cairo: ['Cairo', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
