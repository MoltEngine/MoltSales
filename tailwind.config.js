/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./frontend/**/*.html", "./frontend/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        background: '#1e1e2e',
        surface: '#313244',
        surfaceHighlight: '#45475a',
        primary: '#89b4fa',
        secondary: '#cba6f7',
        accent: '#f38ba8',
        textMain: '#cdd6f4',
        textMuted: '#a6adc8',
        success: '#a6e3a1',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
