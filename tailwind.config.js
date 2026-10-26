/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        samsung: {
          blue: "#2c8cfb",
          dark: "#07090e"
        }
      }
    }
  },
  plugins: []
};