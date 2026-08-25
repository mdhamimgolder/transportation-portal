/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Midnight Neon — backgrounds
        page: "#0A0A0B",
        surface: "#131316",
        elevated: "#1A1A1F",
        border: "#26262C",
        zebra: "#0F0F12",
        // Accents
        lime: "#C6F432",
        cyan: "#22D3EE",
        // Status
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#F87171",
        urgent: "#FB7185",
        // Text
        ink: "#F4F4F5",
        muted: "#A1A1AA",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
      },
      transitionDuration: {
        150: "150ms",
      },
    },
  },
  plugins: [],
};
