import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { supabase, loadUserState, saveUserState, listMyGroups, listMembers, createGroup, joinGroup, leaveGroup, listReactions, addReaction, removeReaction } from "./lib/storage.js";

/* ---------- theme (Robinhood-style: black + neon green) ---------- */
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

/* Charts load on demand so the gym-critical tabs (Log etc.) start fast. */
const TrendChart = lazy(() => import("./charts.jsx").then(m => ({ default: m.TrendChart })));
const BodyChart = lazy(() => import("./charts.jsx").then(m => ({ default: m.BodyChart })));
const MusclePie = lazy(() => import("./charts.jsx").then(m => ({ default: m.MusclePie })));
const ChartFallback = ({ h }) => <div style={{ height: h, display:"flex", alignItems:"center", justifyContent:"center", color:T.sub, fontSize:13 }}>loading chart…</div>;

/* ---------- seed exercise library (same as the sheet) ---------- */
const SEED_EXERCISES = [
  ["Bench Press","Chest"],["Incline Bench Press","Chest"],["Incline Dumbbell Press","Chest"],["Dumbbell Bench Press","Chest"],
  ["Chest Fly","Chest"],["Cable Crossover","Chest"],["Dips","Chest"],["Push-Up","Chest"],
  ["Triceps Pushdown","Triceps"],["Overhead Triceps Extension","Triceps"],["Skullcrusher","Triceps"],["Close-Grip Bench Press","Triceps"],["Triceps Dip","Triceps"],
  ["Overhead Press","Shoulders"],["Dumbbell Shoulder Press","Shoulders"],["Lateral Raise","Shoulders"],["Rear Delt Fly","Shoulders"],["Arnold Press","Shoulders"],["Face Pull","Shoulders"],
  ["Deadlift","Back"],["Barbell Row","Back"],["Pull-Up","Back"],["Chin-Up","Back"],["Lat Pulldown","Back"],["Seated Cable Row","Back"],["Dumbbell Row","Back"],["T-Bar Row","Back"],
  ["Barbell Curl","Biceps"],["Dumbbell Curl","Biceps"],["Hammer Curl","Biceps"],["Preacher Curl","Biceps"],["Cable Curl","Biceps"],
  ["Back Squat","Legs"],["Front Squat","Legs"],["Machine Squat","Legs"],["Hack Squat","Legs"],["Leg Press","Legs"],["Leg Extension","Legs"],
  ["Lying Leg Curl","Legs"],["Seated Leg Curl","Legs"],["Romanian Deadlift","Legs"],["Bulgarian Split Squat","Legs"],["Walking Lunge","Legs"],["Hip Thrust","Legs"],
  ["Standing Calf Raise","Legs"],["Seated Calf Raise","Legs"],
  ["Plank","Abs"],["Hanging Leg Raise","Abs"],["Cable Crunch","Abs"],["Ab Wheel","Abs"],
];
const BW_SET = new Set(["Pull-Up","Chin-Up","Push-Up","Dips","Triceps Dip","Plank","Hanging Leg Raise","Ab Wheel"]);
const MUSCLES = ["Chest","Triceps","Shoulders","Back","Biceps","Legs","Abs"];
const MUSCLE_COLORS = ["#009E04","#3D7FD9","#C08A1E","#9C4DE0","#D94F00","#17ABA0","#A83277"];
const EFFORTS = ["Warm-up","Could've done more","Right amount","To failure"];
const MET = { Light: 4, Moderate: 6, Vigorous: 9, "Max Effort": 12 };
const INTENSITY_FEEL = {
  Light: "Easy pace, could hold a full conversation",
  Moderate: "Steady effort, breathing noticeably harder",
  Vigorous: "Hard effort, tough to talk",
  "Max Effort": "All-out — sprints, intervals",
};

/* ---------- helpers ---------- */
const todayStr = () => new Date().toISOString().slice(0, 10);
const e1rm = (w, r) => w * (1 + r / 30);
const fmtDate = (s) => { const d = new Date(s + "T00:00"); return `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
const monthKey = (s) => s.slice(0, 7);
const monthLabel = (k) => { const [y,m]=k.split("-"); return new Date(+y, +m-1, 1).toLocaleString("en-US",{month:"short",year:"numeric"}); };
const weekStart = (s) => { const d = new Date(s + "T00:00"); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.toISOString().slice(0,10); };
const RANGE_DAYS = { "1M": 30, "1Y": 365, "5Y": 1826, All: Infinity };

const defaultData = {
  exercises: SEED_EXERCISES.map(([name, muscle]) => ({ name, muscle, type: BW_SET.has(name) ? "Bodyweight" : "Weighted" })),
  log: [], bodyweight: [], cardio: [], cardioActivities: [],
};

/* weekly streak (lifting OR cardio) with mid-week protection */
function computeStreak(log, cardio) {
  const weeks = new Set([...(log||[]).map(e=>weekStart(e.date)), ...(cardio||[]).map(e=>weekStart(e.date))]);
  if (!weeks.size) return { cur:0, best:0 };
  let best=0, cur=0;
  const thisWk = weekStart(todayStr());
  let run=0;
  const sortedWeeks=[...weeks].sort();
  const first=sortedWeeks[0];
  for (let d=new Date(first+"T00:00"); ; d.setDate(d.getDate()+7)) {
    const key=d.toISOString().slice(0,10);
    if (weeks.has(key)) { run++; best=Math.max(best,run); } else run=0;
    if (key===thisWk) { cur = run; break; }
    if (key>thisWk) break;
  }
  if (!weeks.has(thisWk)) { // mid-week protection: use last week's run
    let r=0; const lw=new Date(thisWk+"T00:00"); lw.setDate(lw.getDate()-7);
    for (let d=lw; ; d.setDate(d.getDate()-7)) { const k=d.toISOString().slice(0,10); if (weeks.has(k)) r++; else break; }
    cur=r;
  }
  return { cur, best };
}

export default function LiftingTracker({ user }) {
  const [data, setData] = useState(defaultData);
  const [tab, setTab] = useState("log");
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncState, setSyncState] = useState("synced"); // "synced" | "offline"
  const saveTimer = useRef(null);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const username = user.user_metadata?.username || "you";
  const cacheKey = `lt-cache-${user.id}`;
  const pendKey = `lt-pending-${user.id}`;

  useEffect(() => { (async () => {
    const cachedRaw = localStorage.getItem(cacheKey);
    // Unsynced offline edits from a previous session win (accepted trade-off)
    if (localStorage.getItem(pendKey) === "1" && cachedRaw) {
      try { setData({ ...defaultData, ...JSON.parse(cachedRaw) }); setLoaded(true); return; } catch {}
    }
    try {
      const v = await loadUserState(user.id);
      if (v) {
        setData({ ...defaultData, ...v });
        localStorage.setItem(cacheKey, JSON.stringify(v));
        setLoaded(true); return;
      }
      setLoaded(true);
    } catch (e) {
      console.error("load failed", e);
      if (cachedRaw) {
        // no signal, but we have this device's last copy — keep going offline
        try { setData({ ...defaultData, ...JSON.parse(cachedRaw) }); setSyncState("offline"); setLoaded(true); return; } catch {}
      }
      setLoadFailed(true);
    }
  })(); }, [user.id]);

  useEffect(() => { if (!loaded) return;
    // Always land the change on this device instantly; the cloud follows.
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(pendKey, "1");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await saveUserState(user.id, data); localStorage.removeItem(pendKey); setSyncState("synced"); }
      catch (e) { console.error("save failed", e); setSyncState("offline"); }
    }, 500);
  }, [data, loaded, user.id]);

  // When signal returns (or every 30s), push anything still pending.
  useEffect(() => {
    const retry = async () => {
      if (localStorage.getItem(pendKey) !== "1") return;
      try { await saveUserState(user.id, dataRef.current); localStorage.removeItem(pendKey); setSyncState("synced"); }
      catch { /* still offline — keep waiting */ }
    };
    window.addEventListener("online", retry);
    const iv = setInterval(retry, 30000);
    return () => { window.removeEventListener("online", retry); clearInterval(iv); };
  }, [user.id]);


  const exMap = useMemo(() => Object.fromEntries(data.exercises.map(e => [e.name, e])), [data.exercises]);
  const latestBW = useMemo(() => {
    const rows = [...data.bodyweight].sort((a,b)=>a.date.localeCompare(b.date));
    return rows.length ? rows[rows.length-1].weight : 195;
  }, [data.bodyweight]);

  if (loadFailed) return (
    <div style={{fontFamily:"system-ui",padding:40,color:T.sub}}>
      ⚠️ Couldn't load your data — check your internet connection and refresh the page.
      (Saving is switched off so nothing gets overwritten.)
    </div>
  );

  if (!loaded) return <div style={{fontFamily:"system-ui",padding:40,color:T.sub}}>Loading your tracker…</div>;

  const tabs = [
    ["dash","Dash","📊"],["log","Log","📝"],["records","Records","🏆"],
    ["friends","Friends","👥"],["body","Body","⚖️"],["cardio","Cardio","🏃"],["ex","Library","📚"],
  ];

  return (
    <div style={{ fontFamily:"system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", background:T.bg, minHeight:"100vh", color:T.ink, paddingBottom:76 }}>
      <style>{`
        html { color-scheme:dark; scroll-behavior:smooth; }
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; } input,select,button { font-family:inherit; font-size:15px; }
        input,select,button { touch-action:manipulation; }
        input,select { border:1px solid ${T.line}; border-radius:10px; padding:9px 10px; background:${T.input}; color:${T.ink}; width:100%; transition:border-color .15s ease; }
        input::placeholder { color:${T.sub}; opacity:.75; }
        input:focus,select:focus { outline:2px solid ${T.green}; outline-offset:0; border-color:${T.green}; }
        button { cursor:pointer; border:none; border-radius:24px; transition:transform .08s ease, background-color .15s ease, color .15s ease, border-color .15s ease, opacity .15s ease; }
        button:active { transform:scale(.96); }
        table { border-collapse:collapse; width:100%; } td,th { padding:9px 10px; text-align:left; font-size:13.5px; }
        th { background:none; color:${T.sub}; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.8px; white-space:nowrap; border-bottom:1px solid ${T.line}; }
        td { border-bottom:1px solid ${T.line}; }
        .card { background:${T.card}; border:1px solid ${T.line}; border-radius:14px; padding:16px; margin-bottom:14px; animation:rise .22s ease-out both; }
        .recharts-text { fill:${T.sub}; }
        .h { font-weight:800; letter-spacing:.2px; }
        @keyframes rise { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        @keyframes pop { 0% { transform:scale(.6); opacity:0; } 70% { transform:scale(1.06); opacity:1; } 100% { transform:scale(1); opacity:1; } }
        .chip { animation:pop .25s ease-out both; }
        .chip { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; font-weight:600; }
        @media(prefers-reduced-motion:reduce){ *{transition:none!important;animation:none!important} }
      `}</style>

      <header style={{ background:T.bg, color:"#fff", padding:"14px 18px", position:"sticky", top:0, zIndex:5, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, borderBottom:`1px solid ${T.line}` }}>
        <div className="h" style={{ fontSize:24 }}>🏋️ MY LIFTING TRACKER</div>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:600 }}>💪 {username}</span>
          <button onClick={()=>supabase.auth.signOut()} style={{ background:"rgba(255,255,255,.18)", color:"#fff", padding:"6px 12px", fontSize:12.5, fontWeight:600 }}>
            Sign out
          </button>
        </div>
      </header>

      {syncState === "offline" && (
        <div style={{ background:"#2A2416", color:"#E3BE55", padding:"8px 18px", fontSize:13, fontWeight:600 }}>
          📴 Offline — your sets are saved on this device and will sync automatically when signal returns.
        </div>
      )}

      <main style={{ maxWidth:860, margin:"0 auto", padding:"16px 14px" }}>
        {tab==="dash" && <Dashboard data={data} exMap={exMap} setData={setData} />}
        {tab==="log" && <LogTab data={data} exMap={exMap} setData={setData} />}
        {tab==="records" && <RecordsTab data={data} exMap={exMap} />}
        {tab==="friends" && <FriendsTab user={user} />}
        {tab==="body" && <BodyTab data={data} setData={setData} />}
        {tab==="cardio" && <CardioTab data={data} setData={setData} latestBW={latestBW} />}
        {tab==="ex" && <ExercisesTab data={data} setData={setData} />}
      </main>

      <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:T.bg, borderTop:`1px solid ${T.line}`, display:"flex", zIndex:10 }}>
        {tabs.map(([id,label,icon]) => (
          <button key={id} onClick={()=>setTab(id)} style={{
            flex:1, padding:"9px 2px 10px", background:"none", display:"flex", flexDirection:"column", alignItems:"center", gap:2,
            color: tab===id?T.tealDk:T.sub, fontWeight: tab===id?700:500, fontSize:11.5,
            borderTop: tab===id?`3px solid ${T.teal}`:"3px solid transparent",
          }}>
            <span style={{fontSize:18}}>{icon}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ================= LOG ================= */
function LogTab({ data, exMap, setData }) {
  const sorted = useMemo(()=>[...data.log].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id),[data.log]);
  const last = sorted[sorted.length-1];
  const [date, setDate] = useState(last?.date || todayStr());
  const [exName, setExName] = useState(last?.exercise || "");
  const [setNum, setSetNum] = useState(last ? (last.exercise===exName? last.set+1 : 1) : 1);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [effort, setEffort] = useState("");
  const [notes, setNotes] = useState("");
  const [justSaved, setJustSaved] = useState(null);

  const isBW = exMap[exName]?.type === "Bodyweight";

  const lastTime = useMemo(() => {
    if (!exName) return null;
    const prior = sorted.filter(e => e.exercise===exName && e.date < date);
    if (!prior.length) return { first:true };
    const lastDate = prior[prior.length-1].date;
    const sess = prior.filter(e => e.date===lastDate);
    if (isBW) { const best = Math.max(...sess.map(s=>s.reps)); return { text:`${best} reps`, date:lastDate }; }
    const best = sess.reduce((a,b)=> e1rm(b.weight||0,b.reps) > e1rm(a.weight||0,a.reps) ? b : a);
    return { text:`${best.weight} × ${best.reps}`, date:lastDate };
  }, [exName, date, sorted, isBW]);

  const checkPR = (entry) => {
    const prior = data.log.filter(e => e.exercise===entry.exercise && e.date < entry.date);
    if (!prior.length) return false;
    if (isBW) return entry.reps > Math.max(...prior.map(p=>p.reps));
    return e1rm(entry.weight, entry.reps) > Math.max(...prior.map(p=>e1rm(p.weight||0,p.reps)));
  };

  const addSet = () => {
    if (!exName || !reps || (!isBW && !weight)) return;
    const entry = { id: Date.now(), date, exercise: exName, set: setNum,
      weight: isBW ? null : parseFloat(weight), reps: parseInt(reps), effort, notes };
    const pr = checkPR(entry);
    setData(d => ({ ...d, log: [...d.log, entry] }));
    setJustSaved({ ...entry, pr });
    setSetNum(n => n + 1); setNotes(""); setEffort("");
  };

  const startNewExercise = (name) => { setExName(name); setSetNum(1); setWeight(""); setReps(""); setJustSaved(null); };

  const recent = [...sorted].reverse().slice(0, 30);

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:10}}>Log a set</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <label style={lbl}>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label style={lbl}>Set #<input type="number" min="1" value={setNum} onChange={e=>setSetNum(parseInt(e.target.value)||1)} /></label>
      </div>
      <label style={lbl}>Exercise
        <select value={exName} onChange={e=>startNewExercise(e.target.value)}>
          <option value="">— pick an exercise —</option>
          {MUSCLES.map(m => (
            <optgroup key={m} label={m}>
              {data.exercises.filter(x=>x.muscle===m).map(x=><option key={x.name}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      {exName && (
        <div style={{ background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:10, padding:"9px 12px", margin:"10px 0", fontSize:14 }}>
          {lastTime?.first
            ? <b>First time logging this!</b>
            : <>Last time: <b>{lastTime.text}</b> <span style={{color:T.sub}}>({fmtDate(lastTime.date)})</span> — beat it.</>}
          {isBW && <div style={{fontSize:12, color:T.sub, marginTop:2}}>Bodyweight move — tracked by reps, no weight needed.</div>}
        </div>
      )}

      <div style={{display:"grid", gridTemplateColumns: isBW ? "1fr" : "1fr 1fr", gap:10, marginBottom:10}}>
        {!isBW && <label style={lbl}>Weight (lb)<input type="number" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} /></label>}
        <label style={lbl}>Reps<input type="number" inputMode="numeric" value={reps} onChange={e=>setReps(e.target.value)} /></label>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
        <label style={lbl}>Effort / Warm-up
          <select value={effort} onChange={e=>setEffort(e.target.value)}>
            <option value="">—</option>{EFFORTS.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label style={lbl}>Notes<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="optional" /></label>
      </div>
      <button onClick={addSet} disabled={!exName || !reps || (!isBW && !weight)}
        style={{ width:"100%", padding:"12px", background:T.green, color:"#000", fontWeight:700, fontSize:16, opacity:(!exName||!reps||(!isBW&&!weight))?0.45:1 }}>
        Save set {setNum}
      </button>
      {justSaved && (
        <div style={{marginTop:10, textAlign:"center", fontSize:14}}>
          Saved: {justSaved.exercise} — set {justSaved.set}{justSaved.weight!=null?`, ${justSaved.weight}×${justSaved.reps}`:`, ${justSaved.reps} reps`}
          {justSaved.pr && <span className="chip" style={{background:T.mint, color:T.green, marginLeft:8}}>🎉 New PR!</span>}
        </div>
      )}
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Recent sets</div>
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Date</th><th>Exercise</th><th>Set</th><th>Weight</th><th>Reps</th><th>Effort</th><th></th></tr></thead>
          <tbody>{recent.map(e => (
            <tr key={e.id}>
              <td>{fmtDate(e.date)}</td><td>{e.exercise}</td><td>{e.set}</td>
              <td>{e.weight ?? "BW"}</td><td>{e.reps}</td><td style={{color:T.sub}}>{e.effort||""}</td>
              <td><ConfirmX onConfirm={()=>setData(d=>({...d, log:d.log.filter(x=>x.id!==e.id)}))} /></td>
            </tr>))}
            {!recent.length && <tr><td colSpan={7} style={{color:T.sub}}>Nothing logged yet — your first set goes here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </>);
}
const lbl = { display:"block", fontSize:12.5, fontWeight:600, color:"#A9BDBA", marginBottom:0 };

/* Two-tap delete: first tap arms it ("Sure?"), second tap confirms; disarms itself. */
function ConfirmX({ onConfirm, label }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed) return (
    <button onClick={onConfirm} style={{ background:T.down, color:"#000", fontSize:11.5, fontWeight:700, padding:"3px 10px", whiteSpace:"nowrap" }}>
      Sure?
    </button>
  );
  return (
    <button onClick={()=>setArmed(true)} style={{ background:"none", color:label?T.sub:T.danger, fontSize:label?12.5:13, textDecoration:label?"underline":"none" }}>
      {label || "✕"}
    </button>
  );
}

/* ---------- export helpers ---------- */
const csvEsc = (v) => { const s = v==null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const download = (name, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ================= DASHBOARD ================= */
function Dashboard({ data, exMap, setData }) {
  const [range, setRange] = useState("1Y");
  const [picks, setPicks] = useState(["Bench Press","Lat Pulldown","Back Squat","Overhead Press"]);

  const seriesFor = (exName) => {
    const ex = exMap[exName]; if (!ex) return [];
    const entries = data.log.filter(e => e.exercise===exName && !(e.effort==="Warm-up"));
    if (!entries.length) return [];
    const byDate = {};
    for (const e of entries) {
      const v = ex.type==="Bodyweight" ? e.reps : e1rm(e.weight||0, e.reps);
      byDate[e.date] = Math.max(byDate[e.date]||0, v);
    }
    let pts = Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([d,v])=>({ date:d, label:fmtDate(d), value:Math.round(v*10)/10 }));
    const days = RANGE_DAYS[range];
    if (days!==Infinity && pts.length) {
      const latest = new Date(pts[pts.length-1].date+"T00:00");
      const cutoff = new Date(latest); cutoff.setDate(cutoff.getDate()-days);
      pts = pts.filter(p => new Date(p.date+"T00:00") >= cutoff);
    }
    return pts;
  };

  /* weekly sets per muscle (this week, warm-ups excluded) */
  const wkStart = weekStart(todayStr());
  const weekSets = useMemo(() => {
    const c = Object.fromEntries(MUSCLES.map(m=>[m,0]));
    for (const e of data.log) {
      if (e.effort==="Warm-up") continue;
      if (weekStart(e.date)!==wkStart) continue;
      const m = exMap[e.exercise]?.muscle; if (m) c[m]++;
    }
    return c;
  }, [data.log, exMap, wkStart]);

  /* 30-day pie */
  const pieData = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
    const c = Object.fromEntries(MUSCLES.map(m=>[m,0]));
    for (const e of data.log) {
      if (e.effort==="Warm-up") continue;
      if (new Date(e.date+"T00:00") < cutoff) continue;
      const m = exMap[e.exercise]?.muscle; if (m) c[m]++;
    }
    return MUSCLES.map((m,i)=>({name:m, value:c[m], fill:MUSCLE_COLORS[i]})).filter(x=>x.value>0);
  }, [data.log, exMap]);

  /* weekly streak (lifting OR cardio) with mid-week protection */
  const streak = useMemo(() => computeStreak(data.log, data.cardio), [data.log, data.cardio]);

  const cardioMin = data.cardio.filter(e=>weekStart(e.date)===wkStart).reduce((s,e)=>s+(e.duration||0),0);

  return (<>
    <div className="card" style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", gap:8, flexWrap:"wrap"}}>
      <div style={{fontSize:13, color:T.sub}}>Best est. 1RM per session (reps for bodyweight moves)</div>
      <div style={{display:"flex", gap:2}}>
        {Object.keys(RANGE_DAYS).map(r=>(
          <button key={r} onClick={()=>setRange(r)} style={{
            background:"none", padding:"5px 10px", fontSize:12, fontWeight:700, letterSpacing:".5px", borderRadius:0,
            color: range===r?T.green:T.sub, borderBottom: range===r?`2px solid ${T.green}`:"2px solid transparent",
          }}>{r.toUpperCase()}</button>
        ))}
      </div>
    </div>

    {picks.map((p,i)=>{
      const pts = seriesFor(p);
      return (
      <div className="card" key={i}>
        <div style={{display:"flex", gap:10, alignItems:"center", marginBottom:6}}>
          <span className="h" style={{color:T.tealDk, fontSize:16}}>Chart {i+1} ▸</span>
          <select value={p} onChange={e=>setPicks(ps=>ps.map((x,j)=>j===i?e.target.value:x))}
            style={{flex:1, background:T.cream, fontWeight:600}}>
            {data.exercises.map(x=><option key={x.name}>{x.name}</option>)}
          </select>
        </div>
        <div style={{fontSize:11.5, color:T.sub, fontStyle:"italic", marginBottom:4}}>
          {exMap[p]?.type==="Bodyweight" ? "tracked by reps (no 1RM for bodyweight moves)" : "tracked by est. 1RM"}
        </div>
        {pts.length
          ? <Suspense fallback={<ChartFallback h={210} />}><TrendChart pts={pts} /></Suspense>
          : <div style={{color:T.sub, fontSize:14, padding:"28px 0", textAlign:"center"}}>No sessions logged for this lift yet.</div>}
      </div>
      );
    })}

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Weekly set target — aim 12–16 hard sets / muscle</div>
      <table><thead><tr><th>Muscle</th><th>Sets this week</th><th>Target</th><th>Status</th></tr></thead>
        <tbody>{MUSCLES.map(m=>(
          <tr key={m}><td>{m}</td><td style={{textAlign:"center"}}>{weekSets[m]}</td><td>12–16</td>
            <td style={{color: weekSets[m]<12?T.sub:weekSets[m]<=16?T.green:T.down, fontWeight:600}}>
              {weekSets[m]<12?"↓ under — add sets":weekSets[m]<=16?"✓ on target":"↑ over"}</td></tr>
        ))}</tbody></table>
    </div>

    <div className="card" style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, textAlign:"center"}}>
      <div><div style={kpiN}>{streak.cur}</div><div style={kpiL}>Current streak (weeks)</div></div>
      <div><div style={kpiN}>{streak.best}</div><div style={kpiL}>Best streak (weeks)</div></div>
      <div><div style={kpiN}>{cardioMin}</div><div style={kpiL}>Cardio this week (min)</div></div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:4}}>Last 30 days — sets by muscle</div>
      {pieData.length ? (
        <Suspense fallback={<ChartFallback h={230} />}><MusclePie data={pieData} /></Suspense>
      ) : <div style={{color:T.sub, fontSize:14}}>Log some sets and your split shows up here.</div>}
    </div>
  </>);
}
const kpiN = { fontWeight:800, fontSize:28, color:T.ink };
const kpiL = { fontSize:11.5, color:T.sub };


/* ================= RECORDS ================= */
function RecordsTab({ data, exMap }) {
  const rows = useMemo(() => data.exercises.map(ex => {
    const entries = data.log.filter(e => e.exercise===ex.name);
    if (!entries.length) return { ...ex, empty:true };
    const isBW = ex.type==="Bodyweight";
    const mostReps = Math.max(...entries.map(e=>e.reps));
    const lastDone = entries.reduce((a,b)=>a.date>b.date?a:b).date;
    if (isBW) return { ...ex, heaviest:"BW", best:"BW", est:"—", mostReps, vol:"—", lastDone };
    const maxW = Math.max(...entries.map(e=>e.weight||0));
    const repsAtMax = Math.max(...entries.filter(e=>e.weight===maxW).map(e=>e.reps));
    const bestEntry = entries.reduce((a,b)=> e1rm(b.weight||0,b.reps)>e1rm(a.weight||0,a.reps)?b:a);
    const vol = Math.max(...entries.map(e=>(e.weight||0)*e.reps));
    return { ...ex, heaviest:`${maxW} × ${repsAtMax}`, best:`${bestEntry.weight} × ${bestEntry.reps}`,
      est: Math.round(e1rm(bestEntry.weight, bestEntry.reps)*10)/10, mostReps, vol, lastDone };
  }), [data]);
  const logged = rows.filter(r=>!r.empty);
  return (
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:2}}>🏆 Personal records</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>Best-ever numbers per lift. Updates as you log.</div>
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Exercise</th><th>Muscle</th><th>Heaviest</th><th>Best set</th><th>Est. 1RM</th><th>Most reps</th><th>Best volume</th><th>Last done</th></tr></thead>
          <tbody>
            {logged.map(r=>(
              <tr key={r.name}><td>{r.name}</td><td>{r.muscle}</td><td>{r.heaviest}</td><td>{r.best}</td>
                <td>{r.est}</td><td>{r.mostReps}</td><td>{r.vol}</td><td>{fmtDate(r.lastDone)}</td></tr>
            ))}
            {!logged.length && <tr><td colSpan={8} style={{color:T.sub}}>No lifts logged yet — records build themselves as you train.</td></tr>}
          </tbody></table>
      </div>
    </div>
  );
}

/* ================= BODY WEIGHT ================= */
function BodyTab({ data, setData }) {
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState("");
  const [creatine, setCreatine] = useState("No");
  const rows = useMemo(()=>[...data.bodyweight].sort((a,b)=>a.date.localeCompare(b.date)),[data.bodyweight]);

  const current = rows.length ? rows[rows.length-1] : null;
  const starting = rows.length ? rows[0] : null;
  const change = current && starting ? (current.weight - starting.weight) : null;

  const months = useMemo(() => {
    if (!rows.length) return [];
    const byM = {};
    for (const r of rows) { (byM[monthKey(r.date)] ||= []).push(r); }
    const keys = Object.keys(byM).sort();
    const first = keys[0], last = keys[keys.length-1];
    const out=[];
    let [y,m]=first.split("-").map(Number);
    const [ly,lm]=last.split("-").map(Number);
    while (y<ly || (y===ly && m<=lm)) {
      const k=`${y}-${String(m).padStart(2,"0")}`;
      const rs=byM[k]||[];
      const avg = rs.length ? Math.round(rs.reduce((s,r)=>s+r.weight,0)/rs.length*10)/10 : null;
      const cr = !rs.length ? "-" : rs.every(r=>r.creatine==="Yes") ? "Yes" : rs.every(r=>r.creatine==="No") ? "No" : "Mixed";
      out.push({ key:k, label:monthLabel(k), avg, creatine:cr });
      m++; if (m>12){m=1;y++;}
    }
    return out;
  }, [rows]);

  const chartData = months.map(m=>({ label:m.label.replace(" 20"," '"), value:m.avg }));

  const add = () => {
    if (!weight) return;
    setData(d=>({ ...d, bodyweight:[...d.bodyweight.filter(r=>r.date!==date), { date, weight:parseFloat(weight), creatine }] }));
    setWeight("");
  };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:10}}>⚖️ Log a weigh-in</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12}}>
        <label style={lbl}>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label style={lbl}>Weight (lb)<input type="number" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} /></label>
        <label style={lbl}>Creatine today?<select value={creatine} onChange={e=>setCreatine(e.target.value)}><option>No</option><option>Yes</option></select></label>
      </div>
      <button onClick={add} disabled={!weight} style={{width:"100%", padding:"12px", background:T.green, color:"#000", fontWeight:700, fontSize:16, opacity:weight?1:0.45}}>Save weigh-in</button>
    </div>

    <div className="card" style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, textAlign:"center"}}>
      <div><div style={kpiN}>{current?current.weight:"—"}</div><div style={kpiL}>Current</div></div>
      <div><div style={kpiN}>{starting?starting.weight:"—"}</div><div style={kpiL}>Starting</div></div>
      <div><div style={kpiN}>{change!=null?(change>0?"+":"")+Math.round(change*10)/10:"—"}</div><div style={kpiL}>Change (lb)</div></div>
      <div><div style={{...kpiN, fontSize:20, paddingTop:8}}>{current?fmtDate(current.date):"—"}</div><div style={kpiL}>Latest</div></div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:4}}>Body weight — monthly average</div>
      <div style={{fontSize:12, color:T.sub, marginBottom:6}}>One dot per month. Months you didn't log stay blank.</div>
      {chartData.length ? (
        <Suspense fallback={<ChartFallback h={220} />}><BodyChart data={chartData} /></Suspense>
      ) : <div style={{color:T.sub, fontSize:14}}>Log a weigh-in and the trend starts here.</div>}
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Monthly average</div>
      <table><thead><tr><th>Month</th><th>Avg wt</th><th>Creatine</th></tr></thead>
        <tbody>{[...months].reverse().map(m=>(
          <tr key={m.key}><td>{m.label}</td><td>{m.avg ?? "-"}</td><td>{m.creatine}</td></tr>
        ))}
        {!months.length && <tr><td colSpan={3} style={{color:T.sub}}>No weigh-ins yet.</td></tr>}
        </tbody></table>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>All weigh-ins</div>
      <table><thead><tr><th>Date</th><th>Weight</th><th>Creatine</th><th></th></tr></thead>
        <tbody>{[...rows].reverse().map(r=>(
          <tr key={r.date}><td>{fmtDate(r.date)}</td><td>{r.weight}</td><td>{r.creatine}</td>
            <td><ConfirmX onConfirm={()=>setData(d=>({...d, bodyweight:d.bodyweight.filter(x=>x.date!==r.date)}))} /></td></tr>
        ))}</tbody></table>
    </div>
  </>);
}

/* ================= CARDIO ================= */
function CardioTab({ data, setData, latestBW }) {
  const [date, setDate] = useState(todayStr());
  const [activity, setActivity] = useState("");
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState("");
  const [machineCal, setMachineCal] = useState("");
  const [newAct, setNewAct] = useState(""); const [newType, setNewType] = useState("Sport");

  const actMap = Object.fromEntries(data.cardioActivities.map(a=>[a.name,a.type]));
  const isMachine = actMap[activity]==="Machine";
  const kg = latestBW * 0.453592;

  const estCal = (!isMachine && duration && intensity) ? Math.round(MET[intensity]*kg*(duration/60)) : null;

  const add = () => {
    if (!activity || !duration) return;
    const calories = isMachine ? (machineCal?parseInt(machineCal):null) : estCal;
    setData(d=>({ ...d, cardio:[...d.cardio, { id:Date.now(), date, activity, duration:parseInt(duration), intensity: isMachine?null:intensity, calories }] }));
    setDuration(""); setMachineCal("");
  };

  const rows = [...data.cardio].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40);

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>🏃 Log cardio</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>
        Sports get an automatic calorie estimate from duration × intensity × your tracked bodyweight ({latestBW} lb).
        Machines: type in what the display says.
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <label style={lbl}>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label style={lbl}>Activity
          <select value={activity} onChange={e=>setActivity(e.target.value)}>
            <option value="">— pick —</option>
            {data.cardioActivities.map(a=><option key={a.name}>{a.name} ({a.type})</option>).map((o,i)=>
              <option key={i} value={data.cardioActivities[i].name}>{data.cardioActivities[i].name}</option>)}
          </select>
        </label>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
        <label style={lbl}>Duration (min)<input type="number" inputMode="numeric" value={duration} onChange={e=>setDuration(e.target.value)} /></label>
        {isMachine
          ? <label style={lbl}>Machine calories<input type="number" inputMode="numeric" value={machineCal} onChange={e=>setMachineCal(e.target.value)} placeholder="from the display" /></label>
          : <label style={lbl}>Intensity
              <select value={intensity} onChange={e=>setIntensity(e.target.value)}>
                <option value="">—</option>{Object.keys(MET).map(k=><option key={k}>{k}</option>)}
              </select>
            </label>}
      </div>
      {estCal!=null && <div style={{background:T.cream, borderRadius:10, padding:"8px 12px", marginBottom:10, fontSize:14}}>Estimated: <b>{estCal} cal</b></div>}
      <button onClick={add} disabled={!activity||!duration} style={{width:"100%", padding:"12px", background:T.green, color:"#000", fontWeight:700, fontSize:16, opacity:(activity&&duration)?1:0.45}}>Save session</button>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:6}}>Your activities</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Add your own (Basketball, Elliptical, whatever you do). Sport = we estimate calories. Machine = you type them in.</div>
      <div style={{display:"flex", gap:8, marginBottom:10}}>
        <input value={newAct} onChange={e=>setNewAct(e.target.value)} placeholder="Activity name" />
        <select value={newType} onChange={e=>setNewType(e.target.value)} style={{width:120}}><option>Sport</option><option>Machine</option></select>
        <button onClick={()=>{ if(!newAct.trim())return; setData(d=>({...d, cardioActivities:[...d.cardioActivities.filter(a=>a.name!==newAct.trim()), {name:newAct.trim(), type:newType}]})); setNewAct(""); }}
          style={{background:T.green, color:"#000", padding:"0 16px", fontWeight:700}}>Add</button>
      </div>
      {data.cardioActivities.map(a=>(
        <span key={a.name} className="chip" style={{background:T.mint, color:T.green, marginRight:6, marginBottom:6}}>
          {a.name} · {a.type} <ConfirmX onConfirm={()=>setData(d=>({...d, cardioActivities:d.cardioActivities.filter(x=>x.name!==a.name)}))} />
        </span>
      ))}
      <div style={{marginTop:12, fontSize:12.5, color:T.sub}}>
        <b>Intensity guide:</b> {Object.entries(INTENSITY_FEEL).map(([k,v])=><div key={k}>• <b>{k}</b> — {v}</div>)}
      </div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Recent cardio</div>
      <table><thead><tr><th>Date</th><th>Activity</th><th>Min</th><th>Intensity</th><th>Cal</th><th></th></tr></thead>
        <tbody>{rows.map(e=>(
          <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.activity}</td><td>{e.duration}</td><td>{e.intensity||"machine"}</td><td>{e.calories??"—"}</td>
            <td><ConfirmX onConfirm={()=>setData(d=>({...d, cardio:d.cardio.filter(x=>x.id!==e.id)}))} /></td></tr>
        ))}
        {!rows.length && <tr><td colSpan={6} style={{color:T.sub}}>No cardio logged yet.</td></tr>}
        </tbody></table>
    </div>
  </>);
}

/* ================= EXERCISES ================= */
function ExercisesTab({ data, setData }) {
  const [name, setName] = useState(""); const [muscle, setMuscle] = useState("Chest"); const [type, setType] = useState("Weighted");

  const exMuscle = Object.fromEntries(data.exercises.map(x => [x.name, x.muscle]));
  const stamp = todayStr();
  const exportLog = () => download(`workout-log-${stamp}.csv`, "﻿" + [
    "date,exercise,muscle,set,weight_lb,reps,effort,notes",
    ...[...data.log].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id)
      .map(e => [e.date, e.exercise, exMuscle[e.exercise]||"", e.set, e.weight ?? "BW", e.reps, e.effort||"", e.notes||""].map(csvEsc).join(",")),
  ].join("\n"), "text/csv");
  const exportBW = () => download(`body-weight-${stamp}.csv`, "﻿" + [
    "date,weight_lb,creatine",
    ...[...data.bodyweight].sort((a,b)=>a.date.localeCompare(b.date))
      .map(r => [r.date, r.weight, r.creatine||""].map(csvEsc).join(",")),
  ].join("\n"), "text/csv");
  const exportCardio = () => download(`cardio-${stamp}.csv`, "﻿" + [
    "date,activity,duration_min,intensity,calories",
    ...[...data.cardio].sort((a,b)=>a.date.localeCompare(b.date))
      .map(e => [e.date, e.activity, e.duration, e.intensity||"machine", e.calories ?? ""].map(csvEsc).join(",")),
  ].join("\n"), "text/csv");
  const exportAll = () => download(`lifting-tracker-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
  const outBtn = { background:"none", border:`1px solid ${T.line}`, color:T.ink, padding:"9px 14px", fontSize:13.5, fontWeight:600 };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>📚 Exercise library</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>Add your own moves (e.g. Decline Push-Up). Bodyweight moves auto-track by reps.</div>
      <div style={{display:"flex", gap:8, marginBottom:14, flexWrap:"wrap"}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Exercise name" style={{flex:2, minWidth:150}} />
        <select value={muscle} onChange={e=>setMuscle(e.target.value)} style={{flex:1, minWidth:100}}>{MUSCLES.map(m=><option key={m}>{m}</option>)}</select>
        <select value={type} onChange={e=>setType(e.target.value)} style={{flex:1, minWidth:110}}><option>Weighted</option><option>Bodyweight</option></select>
        <button onClick={()=>{ if(!name.trim())return; setData(d=>({...d, exercises:[...d.exercises.filter(x=>x.name!==name.trim()), {name:name.trim(), muscle, type}]})); setName(""); }}
          style={{background:T.green, color:"#000", padding:"0 16px", fontWeight:700}}>Add</button>
      </div>
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Exercise</th><th>Muscle</th><th>Type</th><th></th></tr></thead>
          <tbody>{data.exercises.map(x=>(
            <tr key={x.name}><td>{x.name}</td><td>{x.muscle}</td><td>{x.type}</td>
              <td><ConfirmX onConfirm={()=>setData(d=>({...d, exercises:d.exercises.filter(e=>e.name!==x.name)}))} /></td></tr>
          ))}</tbody></table>
      </div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>💾 Your data</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:12}}>
        Download a copy any time — it's yours. CSV files open straight in Excel or Google Sheets.
        The full backup holds everything in one file.
      </div>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <button onClick={exportLog} style={outBtn}>Workout log (CSV)</button>
        <button onClick={exportBW} style={outBtn}>Body weight (CSV)</button>
        <button onClick={exportCardio} style={outBtn}>Cardio (CSV)</button>
        <button onClick={exportAll} style={outBtn}>Full backup (JSON)</button>
      </div>
    </div>
  </>);
}

/* ================= FRIENDS ================= */
const BIG_LIFTS = ["Bench Press","Back Squat","Deadlift","Overhead Press"];
const LIFT_SHORT = { "Bench Press":"Bench", "Back Squat":"Squat", "Deadlift":"Dead", "Overhead Press":"OHP" };

function FriendsTab({ user }) {
  const [groups, setGroups] = useState(null);        // null = loading
  const [active, setActive] = useState(null);        // selected group
  const [members, setMembers] = useState(null);
  const [states, setStates] = useState({});          // user_id -> tracker data
  const [profile, setProfile] = useState(null);      // member whose profile is open
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [gname, setGname] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [reactions, setReactions] = useState({}); // event_key -> [{reactor_id, reactor_name}]
  const myName = user.user_metadata?.username || "you";

  const refreshGroups = async () => {
    try { setGroups(await listMyGroups()); setErr(""); }
    catch (e) { setGroups([]); setErr("Couldn't load groups — check your connection. (If this is the first time, the database part may not be set up yet.)"); }
  };
  useEffect(() => { refreshGroups(); }, []);

  useEffect(() => {
    if (!active) return;
    (async () => {
      setMembers(null); setStates({}); setReactions({});
      try {
        const ms = await listMembers(active.id);
        setMembers(ms);
        const st = {};
        await Promise.all(ms.map(async (m) => {
          try { st[m.user_id] = await loadUserState(m.user_id); } catch { /* member has no data yet */ }
        }));
        setStates(st);
        try {
          const rs = await listReactions(active.id);
          const map = {};
          for (const r of rs) (map[r.event_key] ||= []).push(r);
          setReactions(map);
        } catch { /* reactions table may not exist yet — feed still works */ }
      } catch (e) { setErr("Couldn't load this group."); }
    })();
  }, [active?.id]);

  const toggleReact = async (key) => {
    const mine = (reactions[key] || []).some(r => r.reactor_id === user.id);
    setReactions(prev => {
      const cur = prev[key] || [];
      return { ...prev, [key]: mine ? cur.filter(r => r.reactor_id !== user.id) : [...cur, { reactor_id: user.id, reactor_name: myName }] };
    });
    try {
      if (mine) await removeReaction(active.id, key, user.id);
      else await addReaction(active.id, key, myName);
    } catch { /* offline or table missing — optimistic UI stays, refresh reconciles */ }
  };

  const doCreate = async () => {
    if (!gname.trim()) return;
    setBusy(true); setErr("");
    try { await createGroup(gname.trim()); setGname(""); await refreshGroups(); }
    catch (e) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  const doJoin = async () => {
    if (!code.trim()) return;
    setBusy(true); setErr("");
    try { await joinGroup(code.trim()); setCode(""); await refreshGroups(); }
    catch (e) { setErr(/no group/i.test(String(e?.message)) ? "No group found with that invite code — double-check it." : String(e?.message || e)); }
    finally { setBusy(false); }
  };
  const copyCode = () => {
    navigator.clipboard?.writeText(active.invite_code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(()=>{});
  };

  /* ---- feed + scoreboards, computed from members' data ---- */
  const feed = useMemo(() => {
    if (!members) return [];
    const evs = [];
    for (const m of members) {
      const st = states[m.user_id]; if (!st) continue;
      const exType = Object.fromEntries((st.exercises || []).map(x => [x.name, x.type]));
      const sorted = [...(st.log || [])].sort((a,b)=>a.date.localeCompare(b.date)||(a.id||0)-(b.id||0));
      const bestSoFar = {}; const prsByDate = {}; const byDate = {};
      for (const e of sorted) {
        (byDate[e.date] ||= []).push(e);
        const isBW = exType[e.exercise] === "Bodyweight";
        const score = isBW ? e.reps : e1rm(e.weight || 0, e.reps);
        if (bestSoFar[e.exercise] != null && score > bestSoFar[e.exercise]) {
          (prsByDate[e.date] ||= []).push(isBW ? `${e.exercise} ${e.reps} reps` : `${e.exercise} ${e.weight}×${e.reps}`);
        }
        bestSoFar[e.exercise] = Math.max(bestSoFar[e.exercise] ?? -1, score);
      }
      for (const [date, entries] of Object.entries(byDate)) {
        const names = [...new Set(entries.map(e=>e.exercise))];
        evs.push({ key:`${m.user_id}-${date}-lift`, date, user:m.username, kind:"lift",
          sets: entries.length, names: names.slice(0,3), more: Math.max(0, names.length-3),
          prs: [...new Set(prsByDate[date] || [])] });
      }
      for (const c of (st.cardio || [])) {
        evs.push({ key:`${m.user_id}-${c.id}-cardio`, date:c.date, user:m.username, kind:"cardio",
          text: `${c.duration} min ${c.activity}` });
      }
    }
    return evs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 25);
  }, [members, states]);

  const consistency = useMemo(() => {
    if (!members) return [];
    const thisWk = weekStart(todayStr());
    return members.map(m => {
      const st = states[m.user_id] || {};
      const days = new Set([
        ...(st.log || []).filter(e=>weekStart(e.date)===thisWk).map(e=>e.date),
        ...(st.cardio || []).filter(e=>weekStart(e.date)===thisWk).map(e=>e.date),
      ]);
      return { user: m.username, uid: m.user_id, workouts: days.size, streak: computeStreak(st.log, st.cardio).cur };
    }).sort((a,b)=>b.workouts-a.workouts || b.streak-a.streak);
  }, [members, states]);

  const strength = useMemo(() => {
    if (!members) return { rows: [], best: {} };
    const rows = members.map(m => {
      const st = states[m.user_id] || {};
      const lifts = {};
      for (const lift of BIG_LIFTS) {
        const entries = (st.log || []).filter(e => e.exercise === lift && e.weight != null);
        lifts[lift] = entries.length ? Math.round(Math.max(...entries.map(e => e1rm(e.weight, e.reps)))) : null;
      }
      return { user: m.username, uid: m.user_id, lifts };
    });
    const best = {};
    for (const lift of BIG_LIFTS) best[lift] = Math.max(0, ...rows.map(r => r.lifts[lift] || 0));
    return { rows, best };
  }, [members, states]);

  /* all-time group records */
  const records = useMemo(() => {
    if (!members) return [];
    let heaviest=null, volBest=null, streakBest=null, weekMost=null, cardioLong=null;
    for (const m of members) {
      const st = states[m.user_id]; if (!st) continue;
      for (const e of (st.log || [])) {
        if (e.weight != null && (!heaviest || e.weight > heaviest.v))
          heaviest = { v:e.weight, text:`${e.weight} lb × ${e.reps} — ${e.exercise}`, who:m.username };
      }
      const volByDate = {};
      for (const e of (st.log || [])) volByDate[e.date] = (volByDate[e.date] || 0) + (e.weight || 0) * e.reps;
      for (const [d, v] of Object.entries(volByDate)) {
        if (v > 0 && (!volBest || v > volBest.v))
          volBest = { v, text:`${Math.round(v).toLocaleString()} lb (${fmtDate(d)})`, who:m.username };
      }
      const s = computeStreak(st.log, st.cardio);
      if (s.best > 0 && (!streakBest || s.best > streakBest.v))
        streakBest = { v:s.best, text:`${s.best} week${s.best===1?"":"s"} in a row`, who:m.username };
      const byWeek = {};
      for (const d of new Set([...(st.log||[]).map(e=>e.date), ...(st.cardio||[]).map(e=>e.date)]))
        byWeek[weekStart(d)] = (byWeek[weekStart(d)] || 0) + 1;
      for (const [wk, c] of Object.entries(byWeek)) {
        if (!weekMost || c > weekMost.v)
          weekMost = { v:c, text:`${c} day${c===1?"":"s"} (week of ${fmtDate(wk)})`, who:m.username };
      }
      for (const c of (st.cardio || [])) {
        if (c.duration && (!cardioLong || c.duration > cardioLong.v))
          cardioLong = { v:c.duration, text:`${c.duration} min ${c.activity}`, who:m.username };
      }
    }
    return [
      heaviest   && { icon:"🏋️", label:"Heaviest set", ...heaviest },
      volBest    && { icon:"🐂", label:"Biggest session volume", ...volBest },
      streakBest && { icon:"🔥", label:"Longest streak", ...streakBest },
      weekMost   && { icon:"📅", label:"Most workout days in a week", ...weekMost },
      cardioLong && { icon:"🏃", label:"Longest cardio", ...cardioLong },
    ].filter(Boolean);
  }, [members, states]);

  /* ---- read-only profile view ---- */
  if (profile) {
    const raw = states[profile.user_id];
    const pdata = raw ? { ...defaultData, ...raw } : null;
    const pexMap = pdata ? Object.fromEntries(pdata.exercises.map(e=>[e.name,e])) : {};
    const bw = pdata ? [...pdata.bodyweight].sort((a,b)=>a.date.localeCompare(b.date)) : [];
    const recentCardio = pdata ? [...pdata.cardio].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10) : [];
    return (<>
      <button onClick={()=>setProfile(null)} style={{ background:"none", color:T.green, fontWeight:700, fontSize:14, marginBottom:10 }}>← Back to group</button>
      <div className="card" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div className="h" style={{fontSize:19, color:T.tealDk}}>💪 {profile.username}</div>
        <span className="chip" style={{background:T.mint, color:T.green}}>read-only</span>
      </div>
      {!pdata ? (
        <div className="card" style={{color:T.sub}}>They haven't logged anything yet.</div>
      ) : (<>
        <Dashboard data={pdata} exMap={pexMap} setData={()=>{}} />
        <RecordsTab data={pdata} exMap={pexMap} />
        <div className="card" style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, textAlign:"center"}}>
          <div><div style={kpiN}>{bw.length ? bw[bw.length-1].weight : "—"}</div><div style={kpiL}>Body wt (lb)</div></div>
          <div><div style={kpiN}>{bw.length ? (b=>{const c=bw[bw.length-1].weight-bw[0].weight; return (c>0?"+":"")+Math.round(c*10)/10;})() : "—"}</div><div style={kpiL}>Change (lb)</div></div>
          <div><div style={kpiN}>{pdata.cardio.length}</div><div style={kpiL}>Cardio sessions</div></div>
        </div>
        {recentCardio.length > 0 && (
          <div className="card">
            <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Recent cardio</div>
            <table><thead><tr><th>Date</th><th>Activity</th><th>Min</th><th>Cal</th></tr></thead>
              <tbody>{recentCardio.map(e=>(
                <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.activity}</td><td>{e.duration}</td><td>{e.calories ?? "—"}</td></tr>
              ))}</tbody></table>
          </div>
        )}
      </>)}
    </>);
  }

  /* ---- group view ---- */
  if (active) {
    return (<>
      <button onClick={()=>{setActive(null); setMembers(null);}} style={{ background:"none", color:T.green, fontWeight:700, fontSize:14, marginBottom:10 }}>← All groups</button>
      <div className="card">
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap"}}>
          <div className="h" style={{fontSize:19, color:T.tealDk}}>👥 {active.name}</div>
          <ConfirmX label="Leave group" onConfirm={async ()=>{ try { await leaveGroup(active.id, user.id); setActive(null); refreshGroups(); } catch(e){ setErr(String(e?.message||e)); } }} />
        </div>
        <div style={{marginTop:8, fontSize:13.5, color:T.sub}}>
          Invite code: <b style={{color:T.green, letterSpacing:"1px"}}>{active.invite_code}</b>
          <button onClick={copyCode} style={{background:"none", color:T.green, fontSize:12.5, marginLeft:8, textDecoration:"underline"}}>{copied ? "Copied!" : "Copy"}</button>
          <span style={{marginLeft:6}}>— send it to a friend; they enter it under Friends → Join.</span>
        </div>
      </div>

      {err && <div className="card" style={{color:T.danger, fontSize:13.5}}>{err}</div>}
      {!members && <div className="card" style={{color:T.sub}}>Loading group…</div>}

      {members && (<>
        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>🏁 This week</div>
          <table><thead><tr><th>Member</th><th>Workouts</th><th>Streak (wks)</th><th></th></tr></thead>
            <tbody>{consistency.map((r,i)=>(
              <tr key={r.uid}>
                <td style={{fontWeight: r.uid===user.id?700:400}}>{i===0 && r.workouts>0 ? "👑 " : ""}{r.user}{r.uid===user.id?" (you)":""}</td>
                <td style={{textAlign:"center", color: r.workouts>0?T.green:T.sub, fontWeight:700}}>{r.workouts}</td>
                <td style={{textAlign:"center"}}>{r.streak}</td>
                <td><button onClick={()=>setProfile(members.find(m=>m.user_id===r.uid))} style={{background:"none", color:T.green, fontSize:12.5, textDecoration:"underline"}}>View profile</button></td>
              </tr>
            ))}</tbody></table>
        </div>

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>🏋️ Strength — best est. 1RM (lb)</div>
          <div style={{fontSize:12, color:T.sub, marginBottom:8}}>Green = group best.</div>
          <div style={{overflowX:"auto"}}>
            <table><thead><tr><th>Member</th>{BIG_LIFTS.map(l=><th key={l}>{LIFT_SHORT[l]}</th>)}</tr></thead>
              <tbody>{strength.rows.map(r=>(
                <tr key={r.uid}>
                  <td style={{fontWeight: r.uid===user.id?700:400}}>{r.user}</td>
                  {BIG_LIFTS.map(l=>(
                    <td key={l} style={{ color: r.lifts[l] && r.lifts[l]===strength.best[l] ? T.green : T.ink, fontWeight: r.lifts[l] && r.lifts[l]===strength.best[l] ? 700 : 400 }}>
                      {r.lifts[l] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}</tbody></table>
          </div>
        </div>

        {records.length > 0 && (
          <div className="card">
            <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>🏆 Group records</div>
            <table><thead><tr><th>Record</th><th>Holder</th><th>Mark</th></tr></thead>
              <tbody>{records.map(r=>(
                <tr key={r.label}>
                  <td>{r.icon} {r.label}</td>
                  <td style={{color:T.green, fontWeight:700}}>{r.who}</td>
                  <td>{r.text}</td>
                </tr>
              ))}</tbody></table>
          </div>
        )}

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>📣 Recent activity</div>
          {!feed.length && <div style={{color:T.sub, fontSize:14}}>Nothing yet — someone go lift something.</div>}
          {feed.map(ev=>{
            const rs = reactions[ev.key] || [];
            const mine = rs.some(r=>r.reactor_id===user.id);
            return (
              <div key={ev.key} style={{padding:"9px 0", borderBottom:`1px solid ${T.line}`, fontSize:14}}>
                <span style={{color:T.sub, fontSize:12.5}}>{fmtDate(ev.date)}</span>{" "}
                <b>{ev.user}</b>{" "}
                {ev.kind==="cardio" ? <>🏃 {ev.text}</> : <>
                  logged {ev.sets} set{ev.sets===1?"":"s"} — {ev.names.join(", ")}{ev.more>0?` +${ev.more} more`:""}
                </>}
                {ev.prs?.map(pr=>(
                  <span key={pr} className="chip" style={{background:T.mint, color:T.green, marginLeft:6}}>🎉 PR: {pr}</span>
                ))}
                <div style={{marginTop:5, display:"flex", alignItems:"center", gap:8}}>
                  <button onClick={()=>toggleReact(ev.key)} style={{
                    background: mine ? T.mint : "none", border:`1px solid ${mine ? T.green : T.line}`,
                    color: mine ? T.green : T.sub, padding:"2px 12px", fontSize:12.5, fontWeight:600, borderRadius:99,
                  }}>
                    💪 {rs.length > 0 ? rs.length : ""}
                  </button>
                  {rs.length > 0 && (
                    <span style={{color:T.sub, fontSize:11.5}}>{rs.map(r=>r.reactor_name).join(", ")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>)}
    </>);
  }

  /* ---- groups list / create / join ---- */
  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>👥 Friends</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>
        Make a group, send friends the invite code, and see each other's workouts, PRs, and a friendly weekly race.
      </div>
      {groups === null && <div style={{color:T.sub}}>Loading…</div>}
      {groups !== null && !groups.length && <div style={{color:T.sub, fontSize:14, marginBottom:4}}>You're not in a group yet — create one below or join with a friend's code.</div>}
      {groups?.map(g=>(
        <button key={g.id} onClick={()=>setActive(g)} style={{
          display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%",
          background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"12px 14px",
          color:T.ink, fontSize:15, fontWeight:600, marginBottom:8, textAlign:"left",
        }}>
          <span>👥 {g.name}</span><span style={{color:T.green}}>→</span>
        </button>
      ))}
    </div>

    <div className="card">
      <div className="h" style={{fontSize:16, color:T.tealDk, marginBottom:8}}>Create a group</div>
      <div style={{display:"flex", gap:8}}>
        <input value={gname} onChange={e=>setGname(e.target.value)} placeholder="e.g. Gym Rats" maxLength={40} />
        <button onClick={doCreate} disabled={busy||!gname.trim()} style={{background:T.green, color:"#000", padding:"0 18px", fontWeight:700, opacity:(busy||!gname.trim())?0.5:1}}>Create</button>
      </div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:16, color:T.tealDk, marginBottom:8}}>Join with an invite code</div>
      <div style={{display:"flex", gap:8}}>
        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="6-character code" maxLength={6} style={{letterSpacing:"2px"}} />
        <button onClick={doJoin} disabled={busy||code.trim().length<6} style={{background:T.green, color:"#000", padding:"0 18px", fontWeight:700, opacity:(busy||code.trim().length<6)?0.5:1}}>Join</button>
      </div>
    </div>

    {err && <div className="card" style={{color:T.danger, fontSize:13.5}}>{err}</div>}
  </>);
}
