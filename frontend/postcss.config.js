// frontend/postcss.config.js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}, // <--- 核心就是改了这一行
    autoprefixer: {},
  },
}