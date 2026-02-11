/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  safelist: [
    "bg-indigo-50", "text-indigo-600",
    "bg-emerald-50", "text-emerald-600",
    "bg-amber-50", "text-amber-600",
    "bg-sky-50", "text-sky-600",
    "bg-rose-50", "text-rose-600",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
