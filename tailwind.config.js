/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,ts,tsx}",
    "./app/**/*.{js,ts,tsx}",
    "./lib/**/*.{js,ts,tsx}",
    "./components/**/*.{js,ts,tsx}",
  ],

  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Bologna Rossa — warm civic palette rooted in the city's terracotta brick
        brick: {
          50:  "#fdf4f4",
          100: "#fbe6e6",
          200: "#f5c4c4",
          300: "#ec9191",
          400: "#de5c5c",
          500: "#c73535",
          600: "#9B2335", // The Bologna brick — primary action color
          700: "#7d1c2b",
          800: "#661921",
          900: "#4a1017",
          950: "#2d0a0e",
        },
        // Warm parchment — paper/stone backgrounds
        parchment: {
          50:  "#fdfcfa",
          100: "#F5F0E8", // Main background
          200: "#ede5d6",
          300: "#ddd0bc",
          400: "#c8b89e",
          500: "#b09d82",
          600: "#96826a",
        },
        // Stone — travertine mid-tones for borders, secondary elements
        stone: {
          100: "#f2ede6",
          200: "#e2d9cd",
          300: "#c9bfb3",
          400: "#a89888",
          500: "#8B7355",
          600: "#70593f",
          700: "#5a4632",
          800: "#3d2f22",
          900: "#281f16",
        },
        // Ink — near-black for text
        ink: {
          50:  "#f7f5f2",
          100: "#e8e3dc",
          200: "#ccc5bb",
          300: "#a89e92",
          400: "#7d7268",
          500: "#5c5248",
          600: "#3f382f",
          700: "#2d261e",
          800: "#1C1612", // Primary text
          900: "#110e0b",
        },
        // Filing-type accent colors — architectural, deliberate
        pdc: {
          light: "#FDF3E3",
          mid:   "#E8A94A",
          dark:  "#8B5E1A",
          text:  "#6B4510",
        },
        scia: {
          light: "#E8EEE6",
          mid:   "#6B8B63",
          dark:  "#3D5C38",
          text:  "#2E4829",
        },
        cila: {
          light: "#E6E8F0",
          mid:   "#6B7AAB",
          dark:  "#3A4A82",
          text:  "#2B3866",
        },
      },
    },
  },
  plugins: [],
};
