import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0faf9',
          100: '#d2eeec',
          200: '#a5ddd9',
          300: '#529F97',
          400: '#3d8b83',
          500: '#2F7C74',
          600: '#2F7C74',
          700: '#115E56',
          800: '#0e4e47',
          900: '#0a3a34',
        },
        gold: {
          400: '#E2B251',
          500: '#c49102',
          600: '#a87a00',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
