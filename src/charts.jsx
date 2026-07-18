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
      {p.payload?.sub && <div style={{ fontSize: 11.5, color: T.sub, marginTop: 3 }}>{p.payload.sub}</div>}
    </div>
  );
}

/* ---------- gradient area line (exercise trends) ---------- */
export function TrendChart({ pts, unit = "", dots = false }) {
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
        <Tooltip content={<NiceTip unit={unit} />} cursor={{ stroke: "#4A4E50", strokeDasharray: "3 3" }} />
        <ReferenceLine y={first} stroke="#4A4E50" strokeDasharray="2 6" />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={`url(#${gid})`}
          dot={dots ? { r: 4.5, fill: stroke, stroke: "#000", strokeWidth: 1.5 } : false}
          activeDot={{ r: 5.5, fill: stroke, stroke: "#000", strokeWidth: 2 }}
          isAnimationActive={ANIM} animationDuration={700} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------- body weight (trend-colored, same style as the exercise charts) ---------- */
export function BodyChart({ data, unit = " lb" }) {
  const vals = data.filter(m => m.value != null);
  const first = vals[0]?.value, last = vals[vals.length - 1]?.value;
  const up = last >= first;
  const stroke = up ? T.green : T.down;
  const gid = up ? "gradBWup" : "gradBWdown";
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.26} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
        <Tooltip content={<NiceTip unit={unit} />} cursor={{ stroke: "#4A4E50", strokeDasharray: "3 3" }} />
        <ReferenceLine y={first} stroke="#4A4E50" strokeDasharray="2 6" />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={`url(#${gid})`}
          dot={{ r: 3, fill: stroke, strokeWidth: 0 }} activeDot={{ r: 5, fill: stroke, stroke: "#000", strokeWidth: 2 }}
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

/* Highcharts-style outside label: bent connector line from the slice to
   "Name 32%", anchored left or right of the donut. */
const RAD = Math.PI / 180;
function PieLabel({ cx, cy, midAngle, outerRadius, fill, name, percent }) {
  if (percent < 0.05) return null; // tiny slices: the legend chips below cover them
  const cos = Math.cos(-RAD * midAngle), sin = Math.sin(-RAD * midAngle);
  const sx = cx + (outerRadius + 3) * cos,  sy = cy + (outerRadius + 3) * sin;   // start on the slice edge
  const mx = cx + (outerRadius + 12) * cos, my = cy + (outerRadius + 12) * sin;  // bend point
  const ex = mx + (cos >= 0 ? 10 : -10),    ey = my;                             // horizontal tail
  const anchor = cos >= 0 ? "start" : "end";
  return (
    <g>
      <polyline points={`${sx},${sy} ${mx},${my} ${ex},${ey}`} fill="none" stroke={fill} strokeWidth={1.3} opacity={0.85} />
      <text x={ex + (cos >= 0 ? 3 : -3)} y={ey} textAnchor={anchor} dominantBaseline="central"
        fill="#FFFFFF" fontSize={11} fontWeight={600}>
        {name} <tspan fill={fill} fontWeight={700}>{Math.round(percent * 100)}%</tspan>
      </text>
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
        <ResponsiveContainer width="100%" height={280}>
          <PieChart margin={{ top: 22, right: 26, bottom: 22, left: 26 }}>
            <Pie data={data} dataKey="value" nameKey="name"
              innerRadius={44} outerRadius={64} paddingAngle={2} cornerRadius={5}
              stroke="none" activeIndex={active} activeShape={<ActiveSlice />}
              labelLine={false} label={<PieLabel />}
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
            <div style={{ fontSize: 21, fontWeight: 800, color: cur.fill, lineHeight: 1.1 }}>{cur.value}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#FFF" }}>{cur.name}</div>
            <div style={{ fontSize: 10, color: T.sub }}>{Math.round(cur.value / total * 100)}% of work</div>
          </>) : (<>
            <div style={{ fontSize: 21, fontWeight: 800, color: "#FFF", lineHeight: 1.1 }}>{total}</div>
            <div style={{ fontSize: 10.5, color: T.sub }}>muscle hits<br/>30 days</div>
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
