import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Bandas de maturidade
        band: {
          low: {
            DEFAULT: '#C0392B',
            bg: '#FDEDEC',
          },
          medium: {
            DEFAULT: '#E67E22',
            bg: '#FEF9E7',
          },
          high: {
            DEFAULT: '#27AE60',
            bg: '#EAFAF1',
          },
        },
        // Brand FCA
        brand: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          900: '#1E3A8A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};

export default config;
