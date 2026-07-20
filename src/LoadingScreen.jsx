/* Full-screen "loading" splash: a fancy Robinhood-style green-&-gold hourglass.
   Reused for BOTH the initial auth check (App.jsx) and the data load
   (LiftingTracker.jsx) so the screen looks identical the whole time —
   no flash or text change between the two phases.

   The whole animation is a single 3s loop:
     0%–73%  the top sand drains into the bottom
     73%–100% the glass flips 180° — and because a full bottom, once flipped,
              looks exactly like a full top, the loop restarts seamlessly. */

const GREEN = "#00C805";
const GOLD  = "#E9C46A";

export default function LoadingScreen({ label = "Loading your tracker…" }) {
  return (
    <div style={wrap}>
      <style>{css}</style>

      <svg className="lt-glow" width="150" height="200" viewBox="0 0 120 160"
           role="img" aria-label="Loading" fill="none">
        <defs>
          {/* frame: green at top fading to gold at the bottom */}
          <linearGradient id="lt-frame" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0"  stopColor={GREEN} />
            <stop offset="1"  stopColor={GOLD} />
          </linearGradient>
          {/* the sand itself: warm gold */}
          <linearGradient id="lt-sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F4D58D" />
            <stop offset="1" stopColor={GOLD} />
          </linearGradient>
          <clipPath id="lt-top"><path d="M28,21 L92,21 L60,80 Z" /></clipPath>
          <clipPath id="lt-bot"><path d="M60,80 L92,139 L28,139 Z" /></clipPath>
        </defs>

        {/* everything rotates together so the flip carries the sand with it */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            values="0 60 80; 0 60 80; 180 60 80" keyTimes="0;0.73;1"
            dur="3s" repeatCount="indefinite" calcMode="spline"
            keySplines="0 0 1 1; .6 0 .4 1" />

          {/* draining top sand */}
          <g clipPath="url(#lt-top)">
            <rect x="24" width="72" fill="url(#lt-sand)">
              <animate attributeName="y"      values="21;80;80" keyTimes="0;0.73;1" dur="3s" repeatCount="indefinite" />
              <animate attributeName="height" values="59;0;0"   keyTimes="0;0.73;1" dur="3s" repeatCount="indefinite" />
            </rect>
          </g>

          {/* growing bottom pile */}
          <g clipPath="url(#lt-bot)">
            <rect x="24" width="72" fill="url(#lt-sand)">
              <animate attributeName="y"      values="139;80;80" keyTimes="0;0.73;1" dur="3s" repeatCount="indefinite" />
              <animate attributeName="height" values="0;59;59"   keyTimes="0;0.73;1" dur="3s" repeatCount="indefinite" />
            </rect>
          </g>

          {/* falling grains through the neck */}
          <g clipPath="url(#lt-bot)">
            {[0, 0.2, 0.4].map((d, i) => (
              <circle key={i} cx="60" r="1.7" fill={GOLD}>
                <animate attributeName="cy" values="80;132" dur="0.6s" begin={`${d}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;1;1;0" dur="0.6s" begin={`${d}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>

          {/* glass frame + caps, drawn on top */}
          <path d="M28,21 L92,21 L60,80 L92,139 L28,139 L60,80 Z"
                stroke="url(#lt-frame)" strokeWidth="4"
                strokeLinejoin="round" strokeLinecap="round" />
          <rect x="23" y="12" width="74" height="9" rx="4.5" fill="url(#lt-frame)" />
          <rect x="23" y="139" width="74" height="9" rx="4.5" fill="url(#lt-frame)" />
        </g>
      </svg>

      <div className="lt-shimmer">{label}</div>
    </div>
  );
}

const wrap = {
  position: "fixed", inset: 0, background: "#000",
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: 22,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  zIndex: 9999,
};

const css = `
  .lt-glow { filter: drop-shadow(0 0 10px rgba(0,200,5,.35)) drop-shadow(0 0 26px rgba(233,196,106,.18)); }
  .lt-shimmer {
    font-size: 15px; font-weight: 700; letter-spacing: .3px;
    background: linear-gradient(100deg, #6f7a72 0%, #6f7a72 35%, ${GREEN} 50%, ${GOLD} 60%, #6f7a72 75%, #6f7a72 100%);
    background-size: 220% 100%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
    animation: lt-slide 2.4s linear infinite;
  }
  @keyframes lt-slide { 0% { background-position: 130% 0; } 100% { background-position: -130% 0; } }
  @media (prefers-reduced-motion: reduce) {
    .lt-shimmer { animation: none; color: ${GREEN}; -webkit-text-fill-color: ${GREEN}; }
  }
`;
