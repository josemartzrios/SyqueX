import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#18181b',
          secondary: '#52525b',
          tertiary: '#a1a1aa',
          muted: '#e4e4e7',
        },
        sage: {
          DEFAULT: '#5a9e8a',
          dark: '#3d7a68',
          light: '#e8f4f1',
        },
        amber: {
          DEFAULT: '#c4935a',
          light: '#fdf3e7',
        },
        surface: '#f4f4f2',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
