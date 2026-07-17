/* All recharts usage lives here so the charting library only downloads
   when a chart is actually on screen (Dashboard / Body / profiles). */
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, PieChart, Pie, Sector } from "recharts";
import { T } from "./LiftingTracker.jsx";

/* Respect the phone's "reduce motion" setting: charts appear instantly there. */
const ANIM = !(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/* ---------- shared tooltip (Highcharts-style floating card) ---------- */
function NiceTip({ active, payload, label, unit }) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  const p = payload[0];
  return (
    <div style={{
      background: "rgba(18,19,20,.96)", border: `1px solid ${T.line}`, borderRadius: 10,
      padding: "8px 12px", boxShadow: "0 6px 18px rgba(0,0,0,.55)", pointerEvents: "none",
    }}>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#FFF", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: p.stroke || p.color, display: "inline-block" }} />
        {p.value}{unit ? <span style={{ fontSize: 11.5, color: T.sub, fontWeight: 500 }}>{unit}</span> : null}
      </div>
    </div>
  );
}

/* ---------- gradient area line (exercise trends) ---------- */
export function TrendChart({ pts }) {
  const display = pts.length === 1 ? [pts[0], { ...pts[0], label: pts[0].label + " " }] : pts;
  const first = display[0].value, last = display[display.length - 1].value;
  const up = last >= first;
  const stroke = up ? T.green : T.down;
  const gid = up ? "gradUp" : "gradDown";
  return (
    <ResponsiveContainer width="100%" height={210}>
      <AreaChart data={display} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
        <Tooltip content={<NiceTip />} cursor={{ stroke: "#4A4E50", strokeDasharray: "3 3" }} />
        <ReferenceLine y={first} stroke="#4A4E50" strokeDasharray="2 6" />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={`url(#${gid})`}
          dot={false} activeDot={{ r: 5, fill: stroke, stroke: "#000", strokeWidth: 2 }}
          isAnimationActive={ANIM} animationDuration={700} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------- body weight (soft white gradient) ---------- */
export function BodyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="gradBW" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
        <Tooltip content={<NiceTip unit=" lb" />} cursor={{ stroke: "#4A4E50", strokeDasharray: "3 3" }} />
        <ReferenceLine y={data.find(m => m.value != null)?.value} stroke="#4A4E50" strokeDasharray="2 6" />
        <Area type="monotone" dataKey="value" stroke="#FFFFFF" strokeWidth={2.5} fill="url(#gradBW)"
          dot={{ r: 3, fill: "#FFFFFF", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#FFF", stroke: "#000", strokeWidth: 2 }}
          connectNulls isAnimationActive={ANIM} animationDuration={700} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------- muscle split: animated donut with hover pop-out ---------- */
function ActiveSlice(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      {/* the slice itself, grown slightly */}
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6}
        startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={5} />
      {/* thin halo ring just outside it */}
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 9} outerRadius={outerRadius + 11}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.5} />
    </g>
  );
}

export function MusclePie({ data }) {
  const [active, setActive] = useState(-1);
  const total = data.reduce((s, d) => s + d.value, 0);
  const cur = active >= 0 ? data[active] : null;
  return (
    <div>
      <div style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name"
              innerRadius={62} outerRadius={88} paddingAngle={2} cornerRadius={5}
              stroke="none" activeIndex={active} activeShape={<ActiveSlice />}
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(-1)}
              onClick={(_, i) => setActive(a => a === i ? -1 : i)}
              isAnimationActive={ANIM} animationBegin={0} animationDuration={800} animationEasing="ease-out" />
          </PieChart>
        </ResponsiveContainer>
        {/* live center readout */}
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center",
        }}>
          {cur ? (<>
            <div style={{ fontSize: 26, fontWeight: 800, color: cur.fill, lineHeight: 1.1 }}>{cur.value}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#FFF" }}>{cur.name}</div>
            <div style={{ fontSize: 11, color: T.sub }}>{Math.round(cur.value / total * 100)}% of sets</div>
          </>) : (<>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#FFF", lineHeight: 1.1 }}>{total}</div>
            <div style={{ fontSize: 11.5, color: T.sub }}>sets · 30 days</div>
          </>)}
        </div>
      </div>
      {/* legend chips — identity never rides on color alone */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 6 }}>
        {data.map((d, i) => (
          <button key={d.name}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(-1)}
            onClick={() => setActive(a => a === i ? -1 : i)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
              borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: active === i ? "rgba(255,255,255,.08)" : "none",
              border: `1px solid ${active === i ? d.fill : T.line}`, color: T.ink,
            }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: d.fill, display: "inline-block" }} />
            {d.name} <span style={{ color: T.sub, fontWeight: 500 }}>{d.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
