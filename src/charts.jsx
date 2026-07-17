/* All recharts usage lives here so the charting library only downloads
   when a chart is actually on screen (Dashboard / Body / profiles). */
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, PieChart, Pie } from "recharts";
import { T, tipStyle } from "./LiftingTracker.jsx";

export function TrendChart({ pts }) {
  const display = pts.length === 1 ? [pts[0], { ...pts[0], label: pts[0].label + " " }] : pts;
  const first = display[0].value, last = display[display.length - 1].value;
  const stroke = last >= first ? T.green : T.down; // green when trending up, orange when down
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={display} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tipStyle} itemStyle={{ color: T.ink }} labelStyle={{ color: T.sub }} cursor={{ stroke: T.line }} />
        <ReferenceLine y={first} stroke="#4A4E50" strokeDasharray="2 6" />
        <Line type="linear" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: stroke }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BodyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tipStyle} itemStyle={{ color: T.ink }} labelStyle={{ color: T.sub }} cursor={{ stroke: T.line }} />
        <ReferenceLine y={data.find(m => m.value != null)?.value} stroke="#4A4E50" strokeDasharray="2 6" />
        <Line type="linear" dataKey="value" stroke="#FFFFFF" strokeWidth={2} dot={{ r: 3, fill: "#FFFFFF" }} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MusclePie({ data }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={85} label={({ name, value }) => `${name} ${value}`} />
        <Tooltip contentStyle={tipStyle} itemStyle={{ color: T.ink }} labelStyle={{ color: T.sub }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
