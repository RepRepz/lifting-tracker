import { useState, useEffect, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { loadState, saveState } from "./lib/storage.js";

/* ---------- theme (carried over from the spreadsheet) ---------- */
const T = {
  teal: "#0E7C7B", tealDk: "#0A5C5B", mint: "#D9F0EE", cream: "#FFF3D6",
  gold: "#B8860B", bg: "#F7FAF9", ink: "#14201F", sub: "#5B6B69", line: "#DCE7E5",
};

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
const MUSCLE_COLORS = ["#0E7C7B","#3FA7A5","#7BC5C3","#B8860B","#D9A94B","#6E8B8A","#2F4F4E"];
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

const STORAGE_KEY = "lifting-tracker-v1";

export default function LiftingTracker() {
  const [data, setData] = useState(defaultData);
  const [tab, setTab] = useState("log");
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => { (async () => {
    try { const v = await loadState(STORAGE_KEY);
      if (v) setData({ ...defaultData, ...v });
    } catch (e) { console.error("load failed", e); }
    setLoaded(true);
  })(); }, []);

  useEffect(() => { if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await saveState(STORAGE_KEY, data); setSaveError(false); }
      catch (e) { console.error("save failed", e); setSaveError(true); }
    }, 500);
  }, [data, loaded]);

  const exMap = useMemo(() => Object.fromEntries(data.exercises.map(e => [e.name, e])), [data.exercises]);
  const latestBW = useMemo(() => {
    const rows = [...data.bodyweight].sort((a,b)=>a.date.localeCompare(b.date));
    return rows.length ? rows[rows.length-1].weight : 195;
  }, [data.bodyweight]);

  if (!loaded) return <div style={{fontFamily:"system-ui",padding:40,color:T.sub}}>Loading your tracker…</div>;

  const tabs = [
    ["dash","Dashboard","📊"],["log","Log","📝"],["records","Records","🏆"],
    ["body","Body Wt","⚖️"],["cardio","Cardio","🏃"],["ex","Exercises","📚"],
  ];

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", background:T.bg, minHeight:"100vh", color:T.ink, paddingBottom:76 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing:border-box; } input,select,button { font-family:inherit; font-size:15px; }
        input,select { border:1px solid ${T.line}; border-radius:8px; padding:9px 10px; background:#fff; width:100%; }
        input:focus,select:focus { outline:2px solid ${T.teal}; outline-offset:0; border-color:${T.teal}; }
        button { cursor:pointer; border:none; border-radius:8px; }
        table { border-collapse:collapse; width:100%; } td,th { padding:8px 10px; text-align:left; font-size:13.5px; }
        th { background:${T.tealDk}; color:#fff; font-weight:600; white-space:nowrap; }
        tr:nth-child(even) td { background:#fff; } tr:nth-child(odd) td { background:#FBFDFC; }
        td { border-bottom:1px solid ${T.line}; }
        .card { background:#fff; border:1px solid ${T.line}; border-radius:14px; padding:16px; margin-bottom:14px; }
        .h { font-family:'Barlow Condensed',system-ui; font-weight:700; letter-spacing:.4px; }
        .chip { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; font-weight:600; }
        @media(prefers-reduced-motion:reduce){ *{transition:none!important;animation:none!important} }
      `}</style>

      <header style={{ background:T.tealDk, color:"#fff", padding:"14px 18px", position:"sticky", top:0, zIndex:5 }}>
        <div className="h" style={{ fontSize:24 }}>🏋️ MY LIFTING TRACKER</div>
      </header>

      {saveError && (
        <div style={{ background:"#FDECEA", color:"#B33", padding:"8px 18px", fontSize:13, fontWeight:600 }}>
          ⚠️ Couldn't sync to the cloud — your latest changes may not be saved. Check your connection.
        </div>
      )}

      <main style={{ maxWidth:860, margin:"0 auto", padding:"16px 14px" }}>
        {tab==="dash" && <Dashboard data={data} exMap={exMap} setData={setData} />}
        {tab==="log" && <LogTab data={data} exMap={exMap} setData={setData} />}
        {tab==="records" && <RecordsTab data={data} exMap={exMap} />}
        {tab==="body" && <BodyTab data={data} setData={setData} />}
        {tab==="cardio" && <CardioTab data={data} setData={setData} latestBW={latestBW} />}
        {tab==="ex" && <ExercisesTab data={data} setData={setData} />}
      </main>

      <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:`1px solid ${T.line}`, display:"flex", zIndex:10 }}>
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
        <div style={{ background:T.cream, border:`1px solid #EAD9A8`, borderRadius:10, padding:"9px 12px", margin:"10px 0", fontSize:14 }}>
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
        style={{ width:"100%", padding:"12px", background:T.teal, color:"#fff", fontWeight:700, fontSize:16, opacity:(!exName||!reps||(!isBW&&!weight))?0.45:1 }}>
        Save set {setNum}
      </button>
      {justSaved && (
        <div style={{marginTop:10, textAlign:"center", fontSize:14}}>
          Saved: {justSaved.exercise} — set {justSaved.set}{justSaved.weight!=null?`, ${justSaved.weight}×${justSaved.reps}`:`, ${justSaved.reps} reps`}
          {justSaved.pr && <span className="chip" style={{background:T.cream, color:T.gold, marginLeft:8}}>🎉 New PR!</span>}
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
              <td><button onClick={()=>setData(d=>({...d, log:d.log.filter(x=>x.id!==e.id)}))}
                style={{background:"none", color:"#B33", fontSize:13}}>✕</button></td>
            </tr>))}
            {!recent.length && <tr><td colSpan={7} style={{color:T.sub}}>Nothing logged yet — your first set goes here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </>);
}
const lbl = { display:"block", fontSize:12.5, fontWeight:600, color:"#3F5654", marginBottom:0 };

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
  const streak = useMemo(() => {
    const weeks = new Set([...data.log.map(e=>weekStart(e.date)), ...data.cardio.map(e=>weekStart(e.date))]);
    if (!weeks.size) return { cur:0, best:0 };
    let best=0, cur=0;
    const thisWk = weekStart(todayStr());
    let run=0, w=null;
    const sortedWeeks=[...weeks].sort();
    const first=sortedWeeks[0];
    for (let d=new Date(first+"T00:00"); ; d.setDate(d.getDate()+7)) {
      const key=d.toISOString().slice(0,10);
      if (weeks.has(key)) { run++; best=Math.max(best,run); } else run=0;
      if (key===thisWk) { cur = weeks.has(thisWk) ? run : run; break; }
      if (key>thisWk) break;
      w=key;
    }
    if (!weeks.has(thisWk)) { // mid-week protection: use last week's run
      let r=0; const lw=new Date(thisWk+"T00:00"); lw.setDate(lw.getDate()-7);
      for (let d=lw; ; d.setDate(d.getDate()-7)) { const k=d.toISOString().slice(0,10); if (weeks.has(k)) r++; else break; }
      cur=r;
    }
    return { cur, best };
  }, [data.log, data.cardio]);

  const cardioMin = data.cardio.filter(e=>weekStart(e.date)===wkStart).reduce((s,e)=>s+(e.duration||0),0);

  return (<>
    <div className="card" style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px"}}>
      <div style={{fontSize:13, color:T.sub}}>Charts show best est. 1RM per session (or reps for bodyweight moves)</div>
      <select value={range} onChange={e=>setRange(e.target.value)} style={{width:90, background:T.cream, fontWeight:700}}>
        {Object.keys(RANGE_DAYS).map(r=><option key={r}>{r}</option>)}
      </select>
    </div>

    {picks.map((p,i)=>(
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
        <ChartBody pts={seriesFor(p)} />
      </div>
    ))}

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Weekly set target — aim 12–16 hard sets / muscle</div>
      <table><thead><tr><th>Muscle</th><th>Sets this week</th><th>Target</th><th>Status</th></tr></thead>
        <tbody>{MUSCLES.map(m=>(
          <tr key={m}><td>{m}</td><td style={{textAlign:"center"}}>{weekSets[m]}</td><td>12–16</td>
            <td>{weekSets[m]<12?"↓ under — add sets":weekSets[m]<=16?"✓ on target":"↑ over"}</td></tr>
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
        <ResponsiveContainer width="100%" height={230}>
          <PieChart><Pie data={pieData} dataKey="value" nameKey="name" outerRadius={85} label={({name,value})=>`${name} ${value}`} />
          <Tooltip /></PieChart>
        </ResponsiveContainer>
      ) : <div style={{color:T.sub, fontSize:14}}>Log some sets and your split shows up here.</div>}
    </div>
  </>);
}
const kpiN = { fontFamily:"'Barlow Condensed'", fontWeight:700, fontSize:30, color:T.tealDk };
const kpiL = { fontSize:11.5, color:T.sub };

function ChartBody({ pts }) {
  if (!pts.length) return <div style={{color:T.sub, fontSize:14, padding:"28px 0", textAlign:"center"}}>No sessions logged for this lift yet.</div>;
  const display = pts.length===1 ? [pts[0], {...pts[0], label:pts[0].label+" "}] : pts;
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={display} margin={{top:8,right:12,bottom:0,left:-14}}>
        <CartesianGrid stroke={T.line} strokeDasharray="0" vertical={false} />
        <XAxis dataKey="label" tick={{fontSize:11}} />
        <YAxis tick={{fontSize:11}} domain={["auto","auto"]} />
        <Tooltip />
        <Line type="linear" dataKey="value" stroke={T.teal} strokeWidth={2.5} dot={{r:4, fill:T.teal}} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

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
      <button onClick={add} disabled={!weight} style={{width:"100%", padding:"12px", background:T.teal, color:"#fff", fontWeight:700, fontSize:16, opacity:weight?1:0.45}}>Save weigh-in</button>
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
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{top:8,right:12,bottom:0,left:-10}}>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="label" tick={{fontSize:11}} />
            <YAxis tick={{fontSize:11}} domain={["auto","auto"]} />
            <Tooltip />
            <Line type="linear" dataKey="value" stroke={T.teal} strokeWidth={2.5} dot={{r:4, fill:T.teal}} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
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
            <td><button onClick={()=>setData(d=>({...d, bodyweight:d.bodyweight.filter(x=>x.date!==r.date)}))} style={{background:"none",color:"#B33"}}>✕</button></td></tr>
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
      <button onClick={add} disabled={!activity||!duration} style={{width:"100%", padding:"12px", background:T.teal, color:"#fff", fontWeight:700, fontSize:16, opacity:(activity&&duration)?1:0.45}}>Save session</button>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:6}}>Your activities</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Add your own (Basketball, Elliptical, whatever you do). Sport = we estimate calories. Machine = you type them in.</div>
      <div style={{display:"flex", gap:8, marginBottom:10}}>
        <input value={newAct} onChange={e=>setNewAct(e.target.value)} placeholder="Activity name" />
        <select value={newType} onChange={e=>setNewType(e.target.value)} style={{width:120}}><option>Sport</option><option>Machine</option></select>
        <button onClick={()=>{ if(!newAct.trim())return; setData(d=>({...d, cardioActivities:[...d.cardioActivities.filter(a=>a.name!==newAct.trim()), {name:newAct.trim(), type:newType}]})); setNewAct(""); }}
          style={{background:T.teal, color:"#fff", padding:"0 16px", fontWeight:700}}>Add</button>
      </div>
      {data.cardioActivities.map(a=>(
        <span key={a.name} className="chip" style={{background:T.mint, color:T.tealDk, marginRight:6, marginBottom:6}}>
          {a.name} · {a.type} <button onClick={()=>setData(d=>({...d, cardioActivities:d.cardioActivities.filter(x=>x.name!==a.name)}))} style={{background:"none", color:"#B33"}}>✕</button>
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
            <td><button onClick={()=>setData(d=>({...d, cardio:d.cardio.filter(x=>x.id!==e.id)}))} style={{background:"none",color:"#B33"}}>✕</button></td></tr>
        ))}
        {!rows.length && <tr><td colSpan={6} style={{color:T.sub}}>No cardio logged yet.</td></tr>}
        </tbody></table>
    </div>
  </>);
}

/* ================= EXERCISES ================= */
function ExercisesTab({ data, setData }) {
  const [name, setName] = useState(""); const [muscle, setMuscle] = useState("Chest"); const [type, setType] = useState("Weighted");
  return (
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>📚 Exercise library</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>Add your own moves (e.g. Decline Push-Up). Bodyweight moves auto-track by reps.</div>
      <div style={{display:"flex", gap:8, marginBottom:14, flexWrap:"wrap"}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Exercise name" style={{flex:2, minWidth:150}} />
        <select value={muscle} onChange={e=>setMuscle(e.target.value)} style={{flex:1, minWidth:100}}>{MUSCLES.map(m=><option key={m}>{m}</option>)}</select>
        <select value={type} onChange={e=>setType(e.target.value)} style={{flex:1, minWidth:110}}><option>Weighted</option><option>Bodyweight</option></select>
        <button onClick={()=>{ if(!name.trim())return; setData(d=>({...d, exercises:[...d.exercises.filter(x=>x.name!==name.trim()), {name:name.trim(), muscle, type}]})); setName(""); }}
          style={{background:T.teal, color:"#fff", padding:"0 16px", fontWeight:700}}>Add</button>
      </div>
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Exercise</th><th>Muscle</th><th>Type</th><th></th></tr></thead>
          <tbody>{data.exercises.map(x=>(
            <tr key={x.name}><td>{x.name}</td><td>{x.muscle}</td><td>{x.type}</td>
              <td><button onClick={()=>setData(d=>({...d, exercises:d.exercises.filter(e=>e.name!==x.name)}))} style={{background:"none",color:"#B33"}}>✕</button></td></tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}
