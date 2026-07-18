/* ---------- theme (Robinhood-style: black + neon green) ---------- */
/* Lives in its own file so components can import it without pulling in
   LiftingTracker.jsx (circular imports crash the app at startup). */
export const T = {
  green: "#00C805",       // the accent: buttons, gains, active controls
  down: "#FF5000",        // declines / destructive
  teal: "#00C805",        // (legacy alias)
  tealBright: "#00C805",
  tealDk: "#FFFFFF",      // headings: bold white
  deep: "#000000",
  mint: "rgba(0,200,5,.12)",
  cream: "#111312", creamLine: "#26302B",
  gold: "#00C805", bg: "#000000", card: "#0C0D0D", cardAlt: "#111213",
  input: "#111213", ink: "#FFFFFF", sub: "#8C8F90", line: "#222527",
  danger: "#FF5000", dangerBg: "#2A1105",
};
export const tipStyle = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 8, color: T.ink };
