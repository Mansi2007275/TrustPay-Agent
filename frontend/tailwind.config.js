/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0a",
        paper: "#fdf6e3",
        accent: "#ffde59",
        danger: "#ff5c5c",
        warn: "#ffb700",
        safe: "#7ee787",
        panel: "#ffffff",
      },
      boxShadow: {
        hard: "6px 6px 0px #0a0a0a",
        "hard-sm": "3px 3px 0px #0a0a0a",
        "hard-lg": "10px 10px 0px #0a0a0a",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(0.8)", opacity: "0.8" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        floatY: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        pulseRing: "pulseRing 1.8s cubic-bezier(0.4,0,0.6,1) infinite",
        floatY: "floatY 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
