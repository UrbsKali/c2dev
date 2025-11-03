const config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        control: '#1B3A57',
        accent: '#3BAFDA',
        danger: '#FF5D5D',
        success: '#3AD29F'
      },
      fontFamily: {
        mono: ['"Fira Code"', 'monospace']
      }
    }
  },
  plugins: []
};

module.exports = config;
