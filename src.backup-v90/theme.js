/* ---------- theme ----------
   The palette is driven by CSS variables so it can be re-skinned live (accent color +
   dark palette) without touching every component. T's values are `var(--…)` refs; the
   actual values are set on :root by applyTheme() below (and seeded in index.html so the
   very first paint isn't unstyled). Lives in its own file to avoid circular imports. */
export const T = {
  green: "var(--accent)",        // the accent: buttons, gains, active controls
  teal: "var(--accent)",         // (legacy aliases — all the accent)
  tealBright: "var(--accent)",
  gold: "var(--accent)",
  tealDk: "var(--ink)",          // headings: bold, theme text color
  down: "#FF5000",               // declines / destructive (never themed)
  deep: "#000000",
  mint: "rgba(var(--accent-rgb),.12)",
  cream: "var(--cardAlt)", creamLine: "var(--creamLine)",
  bg: "var(--bg)", card: "var(--card)", cardAlt: "var(--cardAlt)",
  input: "var(--input)", ink: "var(--ink)", sub: "var(--sub)", line: "var(--line)",
  danger: "#FF5000", dangerBg: "#2A1105",
};
export const tipStyle = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 8, color: T.ink };

/* Accent colors. `free: true` ones are usable without Pro. */
export const ACCENTS = {
  green:  { name: "Neon Green",     rgb: "0,200,5",     free: true  },
  blue:   { name: "Electric Blue",  rgb: "10,132,255",  free: true  },
  purple: { name: "Ultraviolet",    rgb: "157,92,255",  free: false },
  pink:   { name: "Hot Pink",       rgb: "255,45,146",  free: false },
  orange: { name: "Sunset Orange",  rgb: "255,122,0",   free: false },
  red:    { name: "Crimson",        rgb: "255,59,48",   free: false },
  gold:   { name: "Gold",           rgb: "240,185,11",  free: false },
  cyan:   { name: "Aqua",           rgb: "0,209,178",   free: false },
};

/* Background palettes (all dark, tuned to stay legible). Midnight is the free default. */
export const PALETTES = {
  midnight: { name: "Midnight", free: true,  bg: "#000000", card: "#0C0D0D", cardAlt: "#111213", input: "#111213", line: "#222527", ink: "#FFFFFF", sub: "#8C8F90", creamLine: "#26302B" },
  slate:    { name: "Slate",    free: false, bg: "#0E1113", card: "#161A1D", cardAlt: "#1B2024", input: "#1B2024", line: "#2A3138", ink: "#F2F5F7", sub: "#8A949C", creamLine: "#2A3138" },
  navy:     { name: "Deep Navy", free: false, bg: "#0A0E1A", card: "#111725", cardAlt: "#161D2E", input: "#161D2E", line: "#232C42", ink: "#EEF2FF", sub: "#8890A8", creamLine: "#232C42" },
  graphite: { name: "Graphite", free: false, bg: "#141414", card: "#1C1C1E", cardAlt: "#232325", input: "#232325", line: "#333336", ink: "#F5F5F7", sub: "#9A9AA0", creamLine: "#333336" },
};

export const DEFAULT_THEME = { accent: "green", palette: "midnight" };

/* Push a theme onto :root as CSS variables. Falls back to defaults for unknown ids. */
export function applyTheme(theme) {
  const a = ACCENTS[theme?.accent] || ACCENTS.green;
  const p = PALETTES[theme?.palette] || PALETTES.midnight;
  const r = document.documentElement.style;
  r.setProperty("--accent-rgb", a.rgb);
  r.setProperty("--accent", `rgb(${a.rgb})`);
  for (const k of ["bg", "card", "cardAlt", "input", "line", "ink", "sub", "creamLine"]) r.setProperty(`--${k}`, p[k]);
  // keep the iOS status bar / PWA chrome in sync with the background
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p.bg);
}
