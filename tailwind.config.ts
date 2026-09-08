import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F3F2ED",
        ink: "#1B2430",
        blueprint: "#1F3A5F",
        amber: "#C77D2E",
        sage: "#4C7A63",
        brick: "#A8432F",
        slate: "#6B7280",
        line: "#DAD7CC",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-plex-sans)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
