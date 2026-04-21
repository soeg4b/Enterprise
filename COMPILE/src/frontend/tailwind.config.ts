import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ontrack: '#10b981',
        atrisk: '#f59e0b',
        delay: '#ef4444',
      },
    },
  },
  plugins: [],
};
export default config;
