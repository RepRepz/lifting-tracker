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
  green:  { name: "Neon Green",    rgb: "0,200,5",    free: true,  calendar:{ lift:"#20D94A", cardio:"#3B82F6", combo:"#A970FF" } },
  blue:   { name: "Electric Blue", rgb: "10,132,255", free: true,  calendar:{ lift:"#0A84FF", cardio:"#22D3EE", combo:"#8B5CF6" } },
  purple: { name: "Ultraviolet",   rgb: "157,92,255", free: false, calendar:{ lift:"#9D5CFF", cardio:"#38BDF8", combo:"#F472B6" } },
  pink:   { name: "Hot Pink",      rgb: "255,45,146", free: false, calendar:{ lift:"#FF2D92", cardio:"#A78BFA", combo:"#F59E0B" } },
  orange: { name: "Sunset Orange", rgb: "255,122,0",  free: false, calendar:{ lift:"#FF7A00", cardio:"#2DD4BF", combo:"#E879F9" } },
  red:    { name: "Crimson",       rgb: "255,59,48",  free: false, calendar:{ lift:"#FF3B30", cardio:"#F59E0B", combo:"#A78BFA" } },
  gold:   { name: "Gold",          rgb: "240,185,11", free: false, calendar:{ lift:"#F0B90B", cardio:"#22C55E", combo:"#8B5CF6" } },
  cyan:   { name: "Aqua",          rgb: "0,209,178",  free: false, calendar:{ lift:"#00D1B2", cardio:"#3B82F6", combo:"#C084FC" } },
};

/* Background palettes (all dark, tuned to stay legible). Midnight is the free default. */
export const PALETTES = {
  midnight: { name: "Midnight", free: true,  bg: "#070809", card: "#101215", cardAlt: "#171A1F", input: "#15181C", line: "#242A31", ink: "#FFFFFF", sub: "#8A9098", creamLine: "#26302B" },
  slate:    { name: "Slate",    free: false, bg: "#0C0F12", card: "#171B20", cardAlt: "#1E242A", input: "#1B2127", line: "#2C343C", ink: "#F2F5F7", sub: "#8A949C", creamLine: "#2A3138" },
  navy:     { name: "Deep Navy", free: false, bg: "#080B15", card: "#121828", cardAlt: "#192134", input: "#161D2E", line: "#26304A", ink: "#EEF2FF", sub: "#8890A8", creamLine: "#232C42" },
  graphite: { name: "Graphite", free: false, bg: "#101011", card: "#1C1C1E", cardAlt: "#252528", input: "#232325", line: "#35353A", ink: "#F5F5F7", sub: "#9A9AA0", creamLine: "#333336" },
};

export const DEFAULT_THEME = { accent: "green", palette: "midnight" };

const contrastInk = (hex) => {
  const n = parseInt(hex.slice(1),16);
  const channel = shift => { const x=((n>>shift)&255)/255; return x<=.04045?x/12.92:((x+.055)/1.055)**2.4; };
  const luminance=.2126*channel(16)+.7152*channel(8)+.0722*channel(0);
  return luminance>.179 ? "#061008" : "#FFFFFF";
};

/* Push a theme onto :root as CSS variables. Falls back to defaults for unknown ids. */
export function applyTheme(theme) {
  const a = ACCENTS[theme?.accent] || ACCENTS.green;
  const p = PALETTES[theme?.palette] || PALETTES.midnight;
  const r = document.documentElement.style;
  r.setProperty("--accent-rgb", a.rgb);
  r.setProperty("--accent", `rgb(${a.rgb})`);
  for (const [kind,color] of Object.entries(a.calendar)) {
    r.setProperty(`--cal-${kind}`,color);
    r.setProperty(`--cal-${kind}-ink`,contrastInk(color));
  }
  for (const k of ["bg", "card", "cardAlt", "input", "line", "ink", "sub", "creamLine"]) r.setProperty(`--${k}`, p[k]);
  // keep the iOS status bar / PWA chrome in sync with the background
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p.bg);
}
