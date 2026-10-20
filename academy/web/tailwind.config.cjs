module.exports = {
  content: ['./web/src/**/*.{js,jsx}', './web/index.html'],
  theme: {
    extend: {
      colors: {
        night: { 950: '#050B22', 900: '#071030', 800: '#0B1842', 700: '#12225A' },
        brand: { DEFAULT: '#0A84FF', hover: '#3D9BFF' },
        accent: '#8FD0FF', violet: '#A99BFF',
        ink: { DEFAULT: '#EEF2FA', soft: '#C9D3EA', mute: '#8E9BBB' },
      },
      fontFamily: { sans: ['Vazirmatn', 'Tahoma', 'system-ui', 'sans-serif'], math: ['"STIX Two Text"', 'Georgia', 'serif'] },
      spacing: { 13: '3.25rem' },
      boxShadow: { glow: '0 12px 32px -12px rgba(10,132,255,.85), inset 0 1px 0 rgba(255,255,255,.25)' },
    },
  },
  plugins: [],
};
