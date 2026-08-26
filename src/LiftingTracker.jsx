import { useState, useEffect, useLayoutEffect, useMemo, useRef, lazy, Suspense, Fragment, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { supabase, loadUserStateRecord, loadSharedUserStates, saveUserState, uploadExerciseMedia, getExerciseMediaUrl, deleteExerciseMedia, listMyGroups, listMembers, createGroup, joinGroup, leaveGroup, listReactions, addReaction, removeReaction, lastActiveFor, setGroupEmoji, resetInviteCode, getStepToken, rotateStepToken, disconnectSteps, stepsFor, lastStepSync, createDuel, listDuels, deleteDuel, acceptDuel, declineDuel, forfeitDuel, requestDuelCancel, clearDuelCancel, setGroupRecordLifts, getMyProStatus, listProUserIds, generateBackupCodes, hasBackupCodes, requestAccountDeletion, clearLocalAccountData } from "./lib/storage.js";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LegalModal } from "./Legal.jsx";

import { T, tipStyle, applyTheme, DEFAULT_THEME, ACCENTS, PALETTES } from "./theme.js";
import LoadingScreen from "./LoadingScreen.jsx";
export { T, tipStyle }; // re-export so older imports keep working

/* Charts load on demand so the gym-critical tabs (Log etc.) start fast. */
const TrendChart = lazy(() => import("./charts.jsx").then(m => ({ default: m.TrendChart })));
const BodyChart = lazy(() => import("./charts.jsx").then(m => ({ default: m.BodyChart })));
const MusclePie = lazy(() => import("./charts.jsx").then(m => ({ default: m.MusclePie })));
const ChartFallback = ({ h }) => <div className="skeleton" style={{ height: h, borderRadius:12 }} />;
const ACCOUNT_EMAIL_ENABLED = import.meta.env.VITE_ACCOUNT_EMAIL_ENABLED === "true";

/* ---------- seed exercise library ----------
   Each entry: [name, [primary muscles — full credit], [secondary muscles — half credit]]
   A muscle only makes the list at all if it does roughly 20%+ of the work. */
const SEED_EXERCISES = [
  // chest pressing
  ["Bench Press",["Chest"],["Triceps"]],["Incline Bench Press",["Chest"],["Shoulders","Triceps"]],
  ["Incline Dumbbell Press",["Chest"],["Shoulders","Triceps"]],["Dumbbell Bench Press",["Chest"],["Triceps"]],
  ["Machine Chest Press",["Chest"],["Triceps"]],
  ["Smith Machine Bench Press",["Chest"],["Triceps"]],["Smith Machine Incline Bench Press",["Chest"],["Shoulders","Triceps"]],
  ["Chest Fly",["Chest"]],["Cable Crossover",["Chest"]],
  ["High To Low Cable Chest Fly",["Chest"]],["Low To High Cable Chest Fly",["Chest"]],["Middle Cable Chest Fly",["Chest"]],
  ["Dips",["Chest","Triceps"],["Shoulders"]],
  // push-up family
  ["Push-Up",["Chest","Triceps"],["Shoulders"]],["Wide Push-Up",["Chest"],["Triceps","Shoulders"]],
  ["Diamond Push-Up",["Triceps","Chest"]],["Incline Push-Up",["Chest"],["Triceps"]],
  ["Decline Push-Up",["Chest","Shoulders"],["Triceps"]],["Pike Push-Up",["Shoulders"],["Triceps"]],
  ["Archer Push-Up",["Chest"],["Triceps"]],["Clap Push-Up",["Chest"],["Triceps"]],
  ["One-Arm Push-Up",["Chest","Triceps"],["Abs"]],
  // triceps
  ["Triceps Pushdown",["Triceps"]],["Overhead Triceps Extension",["Triceps"]],
  ["Dumbbell Overhead Triceps Extension",["Triceps"]],["Skullcrusher",["Triceps"]],
  ["Close-Grip Bench Press",["Triceps"],["Chest"]],["Triceps Dip",["Triceps"],["Chest"]],
  // shoulders
  ["Overhead Press",["Shoulders"],["Triceps"]],["Dumbbell Shoulder Press",["Shoulders"],["Triceps"]],
  ["Smith Machine Shoulder Press",["Shoulders"],["Triceps"]],
  ["Arnold Press",["Shoulders"],["Triceps"]],["Lateral Raise",["Shoulders"]],["Single-Arm Cable Side Raise",["Shoulders"]],["Rear Delt Fly",["Shoulders"]],
  ["Face Pull",["Shoulders"],["Back"]],["Upright Row",["Shoulders"],["Back"]],
  // back
  ["Deadlift",["Back","Legs"]],["Sumo Deadlift",["Legs"],["Back"]],
  ["Barbell Row",["Back"],["Biceps"]],
  ["Pull-Up",["Back"],["Biceps"]],["Chin-Up",["Back","Biceps"]],["Wide-Grip Pull-Up",["Back"],["Biceps"]],
  ["Neutral-Grip Pull-Up",["Back"],["Biceps"]],["Assisted Pull-Up",["Back"],["Biceps"]],
  ["Lat Pulldown",["Back"],["Biceps"]],["Seated Cable Row",["Back"],["Biceps"]],["Dumbbell Row",["Back"],["Biceps"]],
  ["T-Bar Row",["Back"],["Biceps"]],["Inverted Row",["Back"],["Biceps"]],["Seated Single-Arm Cross-Body Cable Row",["Back"],["Biceps"]],
  ["Barbell Shrug",["Back"]],["Dumbbell Shrug",["Back"]],["Back Extension",["Back"],["Legs"]],["Superman",["Back"]],
  // biceps
  ["Barbell Curl",["Biceps"]],["Dumbbell Curl",["Biceps"]],["Incline Dumbbell Curl",["Biceps"]],["Hammer Curl",["Biceps"]],
  ["Preacher Curl",["Biceps"]],["Cable Curl",["Biceps"]],["Concentration Curl",["Biceps"]],["Concentration Curl Machine",["Biceps"]],
  // legs
  ["Back Squat",["Legs"]],["Front Squat",["Legs"]],["Machine Squat",["Legs"]],["Hack Squat",["Legs"]],
  ["Smith Machine Squat",["Legs"]],
  ["Goblet Squat",["Legs"]],["Bodyweight Squat",["Legs"]],["Jump Squat",["Legs"]],["Leg Press",["Legs"]],["Leg Extension",["Legs"]],
  ["Lying Leg Curl",["Legs"]],["Seated Leg Curl",["Legs"]],["Romanian Deadlift",["Legs"],["Back"]],
  ["Good Morning",["Legs"],["Back"]],["Bulgarian Split Squat",["Legs"]],["Walking Lunge",["Legs"]],["Bodyweight Lunge",["Legs"]],
  ["Step-Up",["Legs"]],["Box Jump",["Legs"]],["Wall Sit",["Legs"]],["Hip Thrust",["Legs"]],["Glute Bridge",["Legs"]],
  ["Hip Adduction Machine (Inner Thigh)",["Legs"]],["Hip Abduction Machine (Outer Thigh)",["Legs"]],
  ["Kettlebell Swing",["Legs"],["Back"]],["Standing Calf Raise",["Legs"]],["Seated Calf Raise",["Legs"]],
  // abs / full body
  ["Plank",["Abs"]],["Side Plank",["Abs"]],["Hanging Leg Raise",["Abs"]],["Vertical Knee Raise",["Abs"]],["Cable Crunch",["Abs"]],["Ab Wheel",["Abs"]],
  ["Sit-Up",["Abs"]],["Crunch",["Abs"]],["Bicycle Crunch",["Abs"]],["Decline Ab Crunch",["Abs"]],["Russian Twist",["Abs"]],["Mountain Climber",["Abs"]],
  ["Burpee",["Legs"],["Chest"]],
  ["Farmer's Carry",["Back"],["Abs"]],
];
const BW_SET = new Set([
  "Pull-Up","Chin-Up","Wide-Grip Pull-Up","Neutral-Grip Pull-Up","Assisted Pull-Up",
  "Dips","Triceps Dip","Inverted Row","Back Extension","Superman","Bodyweight Squat","Jump Squat","Bodyweight Lunge","Box Jump","Wall Sit","Glute Bridge",
  "Push-Up","Wide Push-Up","Diamond Push-Up","Incline Push-Up","Decline Push-Up","Pike Push-Up","Archer Push-Up","Clap Push-Up","One-Arm Push-Up",
  "Plank","Side Plank","Hanging Leg Raise","Ab Wheel","Sit-Up","Crunch","Bicycle Crunch","Decline Ab Crunch","Russian Twist","Mountain Climber","Burpee",
]);
/* Which seed moves load plates on a straight bar — drives the plate calculator. */
const BARBELL_SEED = new Set([
  "Bench Press","Incline Bench Press","Close-Grip Bench Press","Overhead Press",
  "Deadlift","Sumo Deadlift","Barbell Row","T-Bar Row","Barbell Curl","Back Squat","Front Squat",
  "Romanian Deadlift","Hip Thrust","Barbell Shrug","Upright Row","Good Morning",
  "Smith Machine Bench Press","Smith Machine Incline Bench Press","Smith Machine Shoulder Press","Smith Machine Squat",
]);
/* Pin-loaded machines and cable stacks: unlike a barbell (fixed 45lb + known plates) or a
   dumbbell (a standard 5lb-increment number is the same everywhere), the REAL resistance
   behind a machine's printed number varies gym to gym — different pulley ratios, cam
   profiles, friction, stack calibration. A "20kg" cable row at one gym can be noticeably
   harder or easier than another gym's. Exercises here are eligible for gym-tagging (see
   `machineOf`/multi-gym below); custom exercises can also opt in via the Library's
   "machine/cable" checkbox. */
const MACHINE_SEED = new Set([
  "Machine Chest Press", "Chest Fly", "Cable Crossover",
  "High To Low Cable Chest Fly", "Low To High Cable Chest Fly", "Middle Cable Chest Fly",
  "Triceps Pushdown", "Overhead Triceps Extension",
  "Single-Arm Cable Side Raise", "Rear Delt Fly", "Face Pull",
  "Lat Pulldown", "Seated Cable Row", "Seated Single-Arm Cross-Body Cable Row", "Cable Curl", "Concentration Curl Machine",
  "Machine Squat", "Hack Squat", "Leg Press", "Leg Extension", "Lying Leg Curl", "Seated Leg Curl",
  "Hip Adduction Machine (Inner Thigh)", "Hip Abduction Machine (Outer Thigh)", "Cable Crunch",
]);
/* Whether an exercise's load is gym-dependent — the seed flag, or a manual override
   (`ex.machine === true/false`) set in the Library for that specific exercise. */
const machineOf = (ex) => !ex ? false : ex.machine != null ? ex.machine : MACHINE_SEED.has(ex.name);
/* A tiny fixed palette so a gym's color stays the same everywhere it's referenced. */
const GYM_COLORS = ["#009E04", "#3D7FD9", "#C08A1E", "#9C4DE0", "#D94F00", "#17ABA0", "#A83277", "#5B7CFA"];
const gymColor = (gyms, id) => { const i = (gyms || []).findIndex(g => g.id === id); return i < 0 ? T.sub : GYM_COLORS[i % GYM_COLORS.length]; };
const gymName = (gyms, id) => (gyms || []).find(g => g.id === id)?.name || "";

/* Primary muscle groups an exercise hits (old saved data may only have a single `muscle`). */
const musclesOf = (ex) => !ex ? []
  : Array.isArray(ex.muscles) && ex.muscles.length ? ex.muscles
  : ex.muscle ? [ex.muscle] : [];
/* Secondary (half-credit) muscle groups. */
const secondariesOf = (ex) => (ex && Array.isArray(ex.muscles2)) ? ex.muscles2 : [];
const muscleOf = (ex) => musclesOf(ex)[0];
/* [muscle, credit] pairs: primaries count as a full set, secondaries as half. */
const muscleCredits = (ex) => [...musclesOf(ex).map(m => [m, 1]), ...secondariesOf(ex).map(m => [m, 0.5])];
/* "Chest · Triceps ½" — for tables and exports */
const muscleLabel = (ex) => [...musclesOf(ex), ...secondariesOf(ex).map(m => m + " ½")].join(" · ");
/* An exercise uses plates if it's flagged barbell (or, for older data with no flag, matches a known barbell move). */
const usesPlates = (ex) => !!ex && ex.type !== "Bodyweight" && (ex.barbell ?? BARBELL_SEED.has(ex.name));
const EQUIP_OPTS = ["Barbell (plates)", "Weighted (other)", "Bodyweight"];
const equipOf = (ex) => ex.type === "Bodyweight" ? "Bodyweight" : (ex.barbell ?? BARBELL_SEED.has(ex.name)) ? "Barbell (plates)" : "Weighted (other)";
const fromEquip = (eq) => eq === "Bodyweight" ? { type: "Bodyweight", barbell: false }
  : eq === "Barbell (plates)" ? { type: "Weighted", barbell: true }
  : { type: "Weighted", barbell: false };
const MUSCLES = ["Chest","Triceps","Shoulders","Back","Biceps","Legs","Abs"];
/* Quick workouts store one compact row per muscle instead of one row per set. These
   helpers make those rows behave like normal working sets everywhere volume matters,
   while `quick:true` keeps them out of weight/reps/PR and estimated-1RM features. */
const setCountOf = (entry) => entry?.muscleOnly ? Math.max(1, parseInt(entry.sets) || 1) : 1;
const entryMuscleCredits = (entry, exMap) => entry?.muscleOnly && MUSCLES.includes(entry.muscle)
  ? [[entry.muscle, 1]]
  : muscleCredits(exMap?.[entry?.exercise]);
const entryPrimaryMuscles = (entry, exMap) => entry?.muscleOnly && MUSCLES.includes(entry.muscle)
  ? [entry.muscle]
  : musclesOf(exMap?.[entry?.exercise]);
const entryLabel = (entry) => entry?.muscleOnly ? `${entry.muscle} (quick workout)` : (entry?.exercise || "Workout");
const MUSCLE_COLORS = ["#009E04","#3D7FD9","#C08A1E","#9C4DE0","#D94F00","#17ABA0","#A83277"];

/* Curated, exact exercise illustrations. These stay outside saved user data, so the
   feature is easy to remove/replace without a migration. wger's exercise media is
   licensed per image; attribution is shown in ExerciseVisualModal. We intentionally
   leave an exercise unmatched instead of showing a similar-but-different variation. */
const VISUAL_LICENSES = {
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
};
const EXERCISE_VISUALS = {
  "Bench Press": ["https://wger.de/media/exercise-images/192/Bench-press-1.png.200x200_q85.png", "CC BY-SA 3.0", "sistab2"],
  "Incline Bench Press": ["https://wger.de/media/exercise-images/41/Incline-bench-press-1.png.200x200_q85.jpg", "CC BY-SA 3.0", "wger.de"],
  "Dumbbell Bench Press": ["https://wger.de/media/exercise-images/97/Dumbbell-bench-press-1.png.200x200_q85.jpg", "CC BY-SA 3.0", "wger.de"],
  "Incline Dumbbell Press": ["https://wger.de/media/exercise-images/16/Incline-press-1.png.200x200_q85.png", "CC BY-SA 3.0", "wger.de"],
  "Chest Fly": ["https://wger.de/media/exercise-images/926/ae9deb5d-a1e9-4c30-b1e3-c128ba5d4969.png.200x200_q85.png", "CC BY-SA 4.0", "novadani"],
  "Cable Crossover": ["https://wger.de/media/exercise-images/71/Cable-crossover-2.png.200x200_q85.jpg", "CC BY-SA 3.0", "Everkinetic"],
  "Dips": ["https://wger.de/media/exercise-images/194/34600351-8b0b-4cb0-8daa-583537be15b0.png.200x200_q85.png", "CC0 1.0", "BFad07"],
  "Triceps Dip": ["https://wger.de/media/exercise-images/194/34600351-8b0b-4cb0-8daa-583537be15b0.png.200x200_q85.png", "CC0 1.0", "BFad07"],
  "Triceps Pushdown": ["https://wger.de/media/exercise-images/1185/c5ca283d-8958-4fd8-9d59-a3f52a3ac66b.jpg.200x200_q85.jpg", "CC BY-SA 4.0", "anto.kreegyr"],
  "Overhead Press": ["https://wger.de/media/exercise-images/1893/7dbad19e-0616-41fd-9d7d-3e21649c0eea.png.200x200_q85.png", "CC BY-SA 4.0", "nishant0712"],
  "Single-Arm Cable Side Raise": ["https://wger.de/media/exercise-images/1378/7c1fcf34-fb7e-45e7-a0c1-51f296235315.jpg.200x200_q85.jpg", "CC BY-SA 4.0", "carlos3c"],
  "Pull-Up": ["https://wger.de/media/exercise-images/475/b0554016-16fd-4dbe-be47-a2a17d16ae0e.jpg.200x200_q85.jpg", "CC BY-SA 3.0", "wger.de"],
  "Chin-Up": ["https://wger.de/media/exercise-images/152/6c1a7459-266d-491a-bd50-7cbaea2bc771.png.200x200_q85.png", "CC0 1.0", "Everkinetic"],
  "Push-Up": ["https://wger.de/media/exercise-images/1551/a6a9e561-3965-45c6-9f2b-ee671e1a3a45.png.200x200_q85.jpg", "CC BY-SA 4.0", "Settebello"],
  "Clap Push-Up": ["https://wger.de/media/exercise-images/1554/49207a62-8799-4b47-8c0b-7bde02926f3d.png.200x200_q85.jpg", "CC BY-SA 4.0", "Settebello"],
  "Seated Cable Row": ["https://wger.de/media/exercise-images/1117/2555c4c3-a84d-47db-b83b-cbf721f12e45.png.200x200_q85.jpg", "CC BY-SA 4.0", "Franpol"],
  "Dumbbell Row": ["https://wger.de/media/exercise-images/81/a751a438-ae2d-4751-8d61-cef0e9292174.png.200x200_q85.jpg", "CC BY-SA 4.0", "sebk"],
  "Barbell Curl": ["https://wger.de/media/exercise-images/74/Bicep-curls-1.png.200x200_q85.png", "CC BY-SA 3.0", "wger.de"],
  "Dumbbell Curl": ["https://wger.de/media/exercise-images/1192/651a4535-8210-4dbd-8f06-61d95fdd9963.png.200x200_q85.jpg", "CC BY-SA 4.0", "Franpol"],
  "Leg Extension": ["https://wger.de/media/exercise-images/369/78c915d1-e46d-4d30-8124-65d68664c3ef.png.200x200_q85.jpg", "CC0 1.0", "BFad07"],
  "Lying Leg Curl": ["https://wger.de/media/exercise-images/154/lying-leg-curl-machine-large-1.png.200x200_q85.jpg", "CC BY-SA 3.0", "wger.de"],
  "Seated Leg Curl": ["https://wger.de/media/exercise-images/117/seated-leg-curl-large-1.png.200x200_q85.jpg", "CC BY-SA 3.0", "wger.de"],
  "Leg Press": ["https://wger.de/media/exercise-images/371/d2136f96-3a43-4d4c-9944-1919c4ca1ce1.webp.200x200_q85.png", "CC0 1.0", "wger contributor"],
  "Smith Machine Squat": ["https://wger.de/media/exercise-images/1747/af9647dd-04ec-4adf-9c07-4e33edb77277.jpg.200x200_q85.jpg", "CC BY-SA 4.0", "wger contributor"],
  "Sumo Deadlift": ["https://wger.de/media/exercise-images/630/b0f0c7d8-5878-4d9e-b820-21acc013741d.webp.200x200_q85.png", "CC BY-SA 4.0", "wger contributor"],
  "Good Morning": ["https://wger.de/media/exercise-images/1392/a02c9c7d-f42d-43e0-9946-1b99b014daee.png.200x200_q85.png", "CC BY-SA 4.0", "Everkinetic"],
  "Kettlebell Swing": ["https://wger.de/media/exercise-images/960/da4d0560-da89-4bb5-b91f-746458fb04ad.png.200x200_q85.png", "CC BY-SA 4.0", "wger contributor"],
  "Standing Calf Raise": ["https://wger.de/media/exercise-images/622/9a429bd0-afd3-4ad0-8043-e9beec901c81.jpeg.200x200_q85.jpg", "CC BY-SA 3.0", "wger.de"],
  "Plank": ["https://wger.de/media/exercise-images/458/b7bd9c28-9f1d-4647-bd17-ab6a3adf5770.png.200x200_q85.png", "CC BY-SA 3.0", "YYCfit / BFad07"],
  "Crunch": ["https://wger.de/media/exercise-images/91/Crunches-1.png.200x200_q85.png", "CC BY-SA 3.0", "wger.de"],
  "Russian Twist": ["https://wger.de/media/exercise-images/1193/70ca5d80-3847-4a8c-8882-c6e9e485e29e.png.200x200_q85.png", "CC BY-SA 4.0", "lion"],
  "Ab Wheel": ["https://wger.de/media/exercise-images/1573/a9ab402b-61ef-4d60-b91a-df52bf7f41a9.jpg.200x200_q85.png", "CC BY-SA 4.0", "wger contributor"],
};
const exerciseVisualOf = (name) => {
  const row = EXERCISE_VISUALS[name];
  return row ? { src:row[0], largeSrc:row[0].replace(".200x200_q85", ".400x400_q85"), license:row[1], author:row[2] } : null;
};
const hasExerciseVisual = (exercise) => !!exercise?.visualPath || !!exerciseVisualOf(exercise?.name);
function useExerciseVisual(exercise) {
  const builtIn = exercise?.visualPath ? null : exerciseVisualOf(exercise?.name);
  const [privateUrl, setPrivateUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    setPrivateUrl(null);
    if (!exercise?.visualPath) return () => { alive = false; };
    getExerciseMediaUrl(exercise.visualPath).then(url => { if (alive) setPrivateUrl(url); }).catch(() => {});
    return () => { alive = false; };
  }, [exercise?.visualPath]);
  if (exercise?.visualPath) return privateUrl ? { src:privateUrl, largeSrc:privateUrl, custom:true, kind:exercise.visualKind || "image" } : null;
  return builtIn;
}
const EFFORTS = ["Warm-up","Could've done more","Right amount","To failure"];
const MET = { Light: 4, Moderate: 6, Vigorous: 9, "Max Effort": 12 };
const INTENSITY_FEEL = {
  Light: "Easy pace, could hold a full conversation",
  Moderate: "Steady effort, breathing noticeably harder",
  Vigorous: "Hard effort, tough to talk",
  "Max Effort": "All-out — sprints, intervals",
};

/* ---------- helpers ---------- */
/* Time zone: "auto" follows this device's clock; a Settings pick overrides it.
   Assigned from profile.tz on every render of the main component. */
let APP_TZ = "auto";
const detectedTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };
/* Current date + hour in the chosen zone (en-CA formats as YYYY-MM-DD). */
const nowInfo = () => {
  if (APP_TZ !== "auto") {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", hourCycle:"h23" }).formatToParts(new Date());
      const g = (t) => parts.find(p => p.type === t)?.value;
      return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: +g("hour") };
    } catch {}
  }
  const d = new Date();
  return { date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`, hour: d.getHours() };
};
/* LOCAL date, not UTC — toISOString() would roll to tomorrow in the evening (US time) */
const todayStr = () => nowInfo().date;
// "Gym day": anything logged before YOUR chosen day-start hour (Settings, default 4 AM)
// still counts as the previous calendar day — so a night owl's 1 AM session stays on
// "tonight", while someone whose day starts at midnight gets the new date immediately.
// Only used to prefill the set form; the 🌙 hint shows the pick and one tap changes it.
let DAY_START = 4; // hour the date flips for logging; assigned from profile.dayStart
const gymDayStr = () => {
  const { date, hour } = nowInfo();
  if (hour >= DAY_START) return date;
  const d = new Date(date + "T00:00"); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const e1rm = (w, r) => w * (1 + r / 30);
const fmtDate = (s) => { const d = new Date(s + "T00:00"); return `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
const monthKey = (s) => s.slice(0, 7);
const monthLabel = (k) => { const [y,m]=k.split("-"); return new Date(+y, +m-1, 1).toLocaleString("en-US",{month:"short",year:"numeric"}); };
const weekStart = (s) => { const d = new Date(s + "T00:00"); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.toISOString().slice(0,10); };
const RANGE_DAYS = { "1D": 1, "1M": 30, "1Y": 365, "5Y": 1826, All: Infinity };

/* ---------- units (data is always stored in lb; we convert only for display/input) ---------- */
const LB_PER_KG = 2.2046226218;
const UnitCtx = createContext("lb");
const useUnit = () => useContext(UnitCtx);
const uLabel = (u) => u === "kg" ? "kg" : "lb";
// lb -> display number (kg rounded to 1 dp, lb left whole-ish)
const dispW = (lb, u) => lb == null ? lb : (u === "kg" ? Math.round((lb / LB_PER_KG) * 10) / 10 : Math.round(lb * 10) / 10);
// a typed display-unit value -> lb for storage
const toLb = (v, u) => u === "kg" ? v * LB_PER_KG : v;
// "135 lb" / "61.2 kg" from a stored-lb number
const showW = (lb, u) => lb == null ? "—" : `${dispW(lb, u)} ${uLabel(u)}`;

/* plate calculator: what to load per side, heaviest-first. Plates/bar depend on unit. */
const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const BARS_LB = [45, 35, 15, 0];
const BARS_KG = [20, 15, 10, 0];
function platesPerSide(total, bar, plates) {
  let side = (total - bar) / 2;
  if (side <= 0) return null;
  const out = [];
  for (const p of plates) while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 100) / 100; }
  return { plates: out, leftover: side };
}

function ExerciseThumb({ exercise, size = 46, onOpen = null }) {
  const visual = useExerciseVisual(exercise);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [visual?.src]);
  if (!visual || failed) return null;
  const content = <img src={visual.src} alt={`${visual.kind === "gif" ? "Animated demonstration" : "Illustration"} of ${exercise.name}`} loading="lazy" decoding="async" onError={()=>setFailed(true)}
    style={{width:"100%", height:"100%", display:"block", objectFit:"contain", background:"#f1f3f0"}} />;
  const shared = {
    width:size, height:size, minWidth:size, borderRadius:Math.max(9, size*.2), overflow:"hidden",
    border:"1px solid color-mix(in srgb, var(--accent) 34%, var(--line))",
    boxShadow:"0 7px 18px -10px rgba(var(--accent-rgb),.75)",
  };
  if (!onOpen) return <span style={{...shared, display:"inline-flex"}}>{content}</span>;
  return <button type="button" onClick={onOpen} aria-label={`Open ${exercise.name} movement preview`} title="View movement"
    style={{...shared, display:"inline-flex", padding:0, background:T.input, flexShrink:0}}>{content}</button>;
}

function ExerciseVisualModal({ exercise, onClose }) {
  const visual = useExerciseVisual(exercise);
  useEffect(() => {
    if (!exercise) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key); };
  }, [exercise, onClose]);
  if (!exercise) return null;
  const primary = musclesOf(exercise);
  const secondary = secondariesOf(exercise);
  return createPortal(
    <div role="presentation" onPointerDown={e=>{ if (e.target===e.currentTarget) onClose(); }} style={{position:"fixed", inset:0, zIndex:15000, display:"grid", placeItems:"center", padding:14, background:"rgba(0,0,0,.76)", WebkitBackdropFilter:"blur(10px)", backdropFilter:"blur(10px)", overflowY:"auto"}}>
      <div role="dialog" aria-modal="true" aria-label={`${exercise.name} movement preview`} className="exercise-visual-dialog" onPointerDown={e=>e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"center", gap:10, padding:"14px 15px", borderBottom:`1px solid ${T.line}`}}>
          <div style={{minWidth:0, flex:1}}>
            <div className="eyebrow" style={{color:T.green, marginBottom:3}}>Movement preview</div>
            <div className="h" style={{fontSize:19, color:T.ink, overflowWrap:"anywhere"}}>{exercise.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close movement preview" style={{width:38, height:38, minWidth:38, padding:0, background:T.input, border:`1px solid ${T.line}`, color:T.ink, fontSize:16}}>✕</button>
        </div>
        <div className="exercise-visual-body">
          <div style={{minWidth:0}}>
            {visual
              ? <div style={{borderRadius:15, overflow:"hidden", background:"#f1f3f0", border:`1px solid ${T.line}`, aspectRatio:"1 / 1", display:"grid", placeItems:"center"}}><img src={visual.largeSrc} alt={`${visual.kind === "gif" ? "Animated demonstration" : "Illustration"} of ${exercise.name}`} decoding="async" style={{width:"100%", height:"100%", objectFit:"contain"}} /></div>
              : <div className="skeleton" style={{borderRadius:15, aspectRatio:"1 / 1"}} />}
          </div>
          <div style={{minWidth:0, display:"flex", flexDirection:"column"}}>
            <div className="eyebrow" style={{marginBottom:7}}>What it trains</div>
            <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:16}}>
              {primary.map(m=><span key={m} className="chip" style={{background:T.mint, color:T.green}}>● {m} <span style={{color:T.sub}}>main</span></span>)}
              {secondary.map(m=><span key={m} className="chip" style={{background:"rgba(227,190,85,.10)", color:AMBER}}>½ {m} <span style={{color:T.sub}}>secondary</span></span>)}
            </div>
            <div className="eyebrow" style={{marginBottom:7}}>Equipment</div>
            <div style={{fontSize:14, color:T.ink, fontWeight:700, marginBottom:16}}>{equipOf(exercise)}{machineOf(exercise) ? " · Machine / cable" : ""}</div>
            <div style={{fontSize:12.5, color:T.sub, lineHeight:1.5, padding:"11px 12px", borderRadius:11, border:`1px solid ${T.line}`, background:T.input}}>
              Use this to recognize the setup and movement. Start light and use a comfortable range; this is not personalized form coaching.
            </div>
            {visual && <div style={{fontSize:10.5, color:T.sub, lineHeight:1.5, marginTop:"auto", paddingTop:16}}>
              {visual.custom ? "Your private upload · only visible in your exercise library" : <>Illustration by {visual.author} via <a href="https://wger.de" target="_blank" rel="noreferrer" style={{color:T.green}}>wger</a> · <a href={VISUAL_LICENSES[visual.license]} target="_blank" rel="noreferrer" style={{color:T.green}}>{visual.license}</a></>}
            </div>}
          </div>
        </div>
      </div>
    </div>, document.body
  );
}

/* default cardio activities — Sport = calories estimated, Machine = read them off the display,
   Steps = enter a step count (calories estimated from steps × bodyweight) */
const SEED_CARDIO = [
  ["Walking","Sport"],["Running","Sport"],["Swimming","Sport"],["Cycling","Sport"],
  ["Hiking","Sport"],["Jump Rope","Sport"],["Basketball","Sport"],
  ["Treadmill","Machine"],["Elliptical","Machine"],["Stair Master","Machine"],
  ["Rowing Machine","Machine"],["Exercise Bike","Machine"],
  ["Walk (Steps)","Steps"],
].map(([name, type]) => ({ name, type }));
/* ~0.00057 cal burned per step per kg bodyweight (≈45 cal/1000 steps at 80kg). */
const stepsCal = (steps, kg) => steps ? Math.round(steps * 0.00057 * kg) : null;
/* rough distance from steps: average stride ≈ 0.75 m */
const stepsMiles = (steps) => steps ? +(steps * 0.75 / 1609.34).toFixed(2) : null;

const defaultData = {
  // `muscle` (primary) is kept alongside `muscles`/`muscles2` so older cached app versions still work
  exercises: SEED_EXERCISES.map(([name, muscles, muscles2 = []]) => ({ name, muscle: muscles[0], muscles, muscles2, type: BW_SET.has(name) ? "Bodyweight" : "Weighted", barbell: BARBELL_SEED.has(name), machine: MACHINE_SEED.has(name) })),
  gyms: [], // [{ id, name }] — only used once multi-gym tracking is turned on in Settings
  log: [], bodyweight: [], cardio: [], cardioActivities: SEED_CARDIO,
  routines: [], // optional workout templates (feature toggled in Settings)
  foods: [], nutritionGoals: {}, // optional macro tracking (feature toggled in Settings)
  customFoods: [], recipes: [], recurringSkips: [], water: [], waterPrefs: {}, fasting: {}, dayDone: [],
  journal: {}, // { "YYYY-MM-DD": { mood, sleep, text } } — daily notes
  profile: {}, // heightIn (inches) lives here once set
  pins: [],    // pinned dashboard charts (exercise names)
  libraryV: 15, // bumped when the seed library changes, so existing users get the update once
};

/* One-time upgrade of previously saved data: pull in newly added seed exercises and
   the current primary/secondary muscle lists — custom moves pass through untouched.
   Runs only when libraryV is behind, so later deletions stay deleted. */
function migrateData(d, uname) {
  // pins used to live in this device's localStorage — carry them into account data once
  if (!Array.isArray(d.pins)) {
    let p = [];
    try { const q = JSON.parse(localStorage.getItem("lt-pins")); if (Array.isArray(q)) p = q; } catch {}
    d = { ...d, pins: p };
  }
  if ((d.libraryV || 0) >= defaultData.libraryV) return d;
  const seedMap = Object.fromEntries(defaultData.exercises.map(s => [s.name, s]));
  const have = new Set((d.exercises || []).map(x => x.name));
  const exercises = [
    // known seeds get the refreshed muscle lists (type/equipment edits are kept); `machine`
    // only fills in the seed default the FIRST time (x.machine is undefined pre-migration) —
    // once set, a manual Library override always wins on later libraryV bumps.
    ...(d.exercises || []).map(x => seedMap[x.name] ? { ...x, muscle: seedMap[x.name].muscle, muscles: seedMap[x.name].muscles, muscles2: seedMap[x.name].muscles2, machine: x.machine != null ? x.machine : seedMap[x.name].machine } : x),
    ...defaultData.exercises.filter(s => !have.has(s.name)),
  ];
  const haveAct = new Set((d.cardioActivities || []).map(a => a.name));
  const cardioActivities = [...(d.cardioActivities || []), ...SEED_CARDIO.filter(a => !haveAct.has(a.name))];
  // one-off cleanup: fold any "Low to High Side Raise" (a custom name) into the seed
  // "Single-Arm Cable Side Raise" — rename its log entries and drop the old library entry.
  const norm = (s) => (s || "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const isOldSideRaise = (name) => { const n = norm(name); return n.includes("low to high") && n.includes("side raise"); };
  // fold pal's custom "Incline Smith Press" into the new official "Smith Machine Incline
  // Bench Press" seed move, now that Smith machine exercises have their own entries.
  const isOldInclineSmith = (name) => norm(name) === "incline smith press";
  // Standardize the commonly labeled inner/outer-thigh machines. "Adduction" brings
  // the legs inward; "abduction" moves them outward. Old custom aliases keep their logs.
  const canonicalHipMachine = (name) => {
    const n=norm(name);
    if (["inner thigh","inner thigh machine","hip adductor machine","adductor machine","seated hip adduction machine","hip adduction","hip adduction machine","hip adduction machine (inner thigh)"].includes(n)) return "Hip Adduction Machine (Inner Thigh)";
    if (["outer thigh","outer thigh machine","hip abductor machine","abductor machine","seated hip abduction machine","hip abduction","hip abduction machine","hip abduction machine (outer thigh)"].includes(n)) return "Hip Abduction Machine (Outer Thigh)";
    return null;
  };
  let log = (d.log || []).map(e => isOldSideRaise(e.exercise) ? { ...e, exercise: "Single-Arm Cable Side Raise" }
    : isOldInclineSmith(e.exercise) ? { ...e, exercise: "Smith Machine Incline Bench Press" }
    : canonicalHipMachine(e.exercise) ? { ...e, exercise:canonicalHipMachine(e.exercise) } : e);
  const cleanedExercises = exercises.filter(x => !isOldSideRaise(x.name) && !isOldInclineSmith(x.name)
    && (!canonicalHipMachine(x.name) || x.name===canonicalHipMachine(x.name)));
  if (uname === "dimi" && !cleanedExercises.some(x => x.name === "Dumbbell Overhead Triceps Extension (Adjustables)")) {
    cleanedExercises.push({ name:"Dumbbell Overhead Triceps Extension (Adjustables)", muscle:"Triceps",
      muscles:["Triceps"], muscles2:[], type:"Weighted", barbell:false, machine:false });
  }
  // one-off: dimi's 7/20 decline ab session, logged for him by request (runs once — the
  // libraryV gate above plus this duplicate check keep it from ever doubling up)
  if (uname === "dimi" && !log.some(e => e.exercise === "Decline Ab Crunch" && e.date === "2026-07-20")) {
    const base = new Date("2026-07-20T12:00").getTime();
    const note = "Kept my upper back off the bench the whole set — abs under constant tension, really activated.";
    log = [...log, ...[1, 2, 3].map(n => ({ id: base + n, date: "2026-07-20", exercise: "Decline Ab Crunch",
      set: n, weight: null, reps: 8, effort: "To failure", notes: n === 1 ? note : "" }))];
  }
  return { ...d, log, exercises: cleanedExercises, cardioActivities, libraryV: defaultData.libraryV };
}

/* Data-safety helpers. Arrays in tracker state contain user-created history, so a sync
   conflict is merged as a union instead of choosing whichever device wrote last. Local
   values win only when both copies refer to the same item. This can preserve an item a
   user deleted while offline, but it cannot silently destroy an item created elsewhere. */
const stateItemKey = (item, index) => {
  if (item == null || typeof item !== "object") return `${typeof item}:${String(item)}`;
  if (item.id != null) return `id:${item.id}`;
  if (item.date != null && item.exercise != null) return `date-ex:${item.date}:${item.exercise}:${item.set ?? ""}`;
  if (item.date != null) return `date:${item.date}`;
  if (item.day != null) return `day:${item.day}`;
  if (item.name != null) return `name:${String(item.name).toLowerCase()}`;
  return `json:${JSON.stringify(item)}:${index}`;
};
const mergeStateArray = (cloud = [], local = []) => {
  const merged = new Map();
  cloud.forEach((item, i) => merged.set(stateItemKey(item, i), item));
  local.forEach((item, i) => merged.set(stateItemKey(item, i), item));
  return [...merged.values()];
};
function mergeStateWithoutLoss(cloud, local) {
  const out = { ...(cloud || {}), ...(local || {}) };
  for (const key of new Set([...Object.keys(cloud || {}), ...Object.keys(local || {})])) {
    const a = cloud?.[key], b = local?.[key];
    if (Array.isArray(a) || Array.isArray(b)) out[key] = mergeStateArray(Array.isArray(a)?a:[], Array.isArray(b)?b:[]);
    else if (a && b && typeof a === "object" && typeof b === "object") out[key] = { ...a, ...b };
  }
  return out;
}
const stateInventory = (d) => ({
  sets:(d?.log||[]).reduce((sum,e)=>sum+setCountOf(e),0),
  log:(d?.log||[]).length, bodyweight:(d?.bodyweight||[]).length, cardio:(d?.cardio||[]).length,
  exercises:(d?.exercises||[]).length, routines:(d?.routines||[]).length,
  journal:Object.keys(d?.journal||{}).length, foods:(d?.foods||[]).length,
});
const stateEntryTotal = (d) => Object.values(stateInventory(d)).reduce((a,b)=>a+b,0);
const suspiciousStateShrink = (before, after) => {
  const a=stateInventory(before),b=stateInventory(after);
  const dropped=(key,minBefore,minLost,remainingRatio) =>
    a[key]>=minBefore && a[key]-b[key]>=minLost && b[key]<a[key]*remainingRatio;
  return dropped("log",10,3,.85)
    || dropped("sets",15,4,.82)
    || dropped("bodyweight",5,2,.80)
    || dropped("cardio",3,2,.75)
    || dropped("exercises",20,3,.90)
    || dropped("routines",3,2,.75)
    || dropped("journal",5,2,.75)
    || dropped("foods",10,3,.80)
    || (stateEntryTotal(before)>=20
      && stateEntryTotal(before)-stateEntryTotal(after)>=8
      && stateEntryTotal(after)<stateEntryTotal(before)*.80);
};
const stateFingerprint = (d) => JSON.stringify(d);
const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`${label} timed out`), { code:"REQUEST_TIMEOUT" })), ms)),
]);
function keepDeviceSnapshot(userId, value) {
  if (!value) return;
  try {
    const prefix=`lt-bk-${userId}-`, day=todayStr(), key=prefix+day;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    Object.keys(localStorage).filter(k=>k.startsWith(prefix)).sort().reverse().slice(14)
      .forEach(k=>localStorage.removeItem(k));
  } catch { /* storage can be unavailable in private mode */ }
}

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
  const [startTab, setStartTab] = useState(() => localStorage.getItem("lt-start-tab") || "dash");
  const [tab, setTab] = useState(() => {
    const pref = localStorage.getItem("lt-start-tab") || "dash";
    return pref === "last" ? (localStorage.getItem("lt-last-tab") || "dash") : pref;
  });
  useEffect(() => { localStorage.setItem("lt-last-tab", tab); }, [tab]);
  const [showSettings, setShowSettings] = useState(false);
  const [navHidden, setNavHidden] = useState(false); // bottom bar slides away on scroll-down
  const nudging = useRef(false); // true while the launch viewport-nudge runs (below) — ignore its scrolls
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      if (nudging.current) return;                             // ignore the automated launch nudge
      const y = window.scrollY;
      if (y < 12) { setNavHidden(false); last = y; return; }   // always show near the top
      const dy = y - last;
      if (Math.abs(dy) < 8) return;                             // ignore tiny jitters
      setNavHidden(dy > 0);                                     // down = hide, up = show
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* iOS installed-app (standalone) cold-launch fix.
     When the app opens STRAIGHT onto a short, non-scrolling tab (e.g. Groups), iOS
     anchors the fixed bottom bar to a viewport height that hasn't settled yet, leaving
     a phantom empty row until you swipe. Opening on any other tab first avoids it because
     rendering/scrolling settles the viewport. So on launch we reproduce that swipe once,
     automatically: make the page briefly scrollable, nudge-scroll, then restore — which
     forces WebKit to recompute the viewport before the glitch is ever visible. */
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (!standalone) return;
    nudging.current = true;
    const spacer = document.createElement("div");
    Object.assign(spacer.style, { position:"absolute", top:"0", left:"0", width:"1px", height:"150vh", opacity:"0", pointerEvents:"none", zIndex:"-1" });
    document.body.appendChild(spacer);
    const t1 = setTimeout(() => { window.scrollTo(0, 60); }, 50);          // "swipe down"
    const t2 = setTimeout(() => {                                           // "swipe back up"
      window.scrollTo(0, 0);
      spacer.remove();
      nudging.current = false;
    }, 240);
    return () => { clearTimeout(t1); clearTimeout(t2); if (spacer.parentNode) spacer.remove(); nudging.current = false; };
  }, []);
  const [units, setUnits] = useState(() => localStorage.getItem("lt-units") || "lb");
  const [hunit, setHunit] = useState(() => localStorage.getItem("lt-hunit") || "ftin"); // height: "ftin" | "cm"
  const [routinesOn, setRoutinesOn] = useState(() => localStorage.getItem("lt-routines-on") === "1"); // optional templates feature
  const [stepsOn, setStepsOn] = useState(() => localStorage.getItem("lt-steps-on") !== "0"); // Apple Health steps (Pro; default on)
  const [coachOn, setCoachOn] = useState(() => localStorage.getItem("lt-coach-on") !== "0"); // Lab's AI Coach (Pro; default on)
  const liftingOn = true;
  // Pro access is checked directly for the signed-in account. Keep the last confirmed
  // result per account so a temporary network/auth hiccup never turns a Pro member free.
  const proCacheKey = `lt-pro-${user.id}`;
  const cachedPro = localStorage.getItem(proCacheKey);
  const [proStatus, setProStatus] = useState(() => cachedPro == null ? null : cachedPro === "1");
  useEffect(() => {
    let alive = true;
    const refreshPro = async () => {
      for (const delay of [0, 400, 1200]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (!alive) return;
        try {
          const active = await withTimeout(getMyProStatus(), 6000, "Membership check");
          if (!alive) return;
          setProStatus(active);
          localStorage.setItem(proCacheKey, active ? "1" : "0");
          return;
        } catch { /* retry below */ }
      }
      // With no confirmed value, allow the app to open as free; online/interval retries
      // will correct it without requiring a refresh. A prior confirmed Pro stays Pro.
      if (alive && cachedPro == null) setProStatus(false);
    };
    refreshPro();
    window.addEventListener("online", refreshPro);
    const interval = setInterval(refreshPro, 5 * 60 * 1000);
    return () => { alive = false; window.removeEventListener("online", refreshPro); clearInterval(interval); };
  }, [user.id]);
  const isPro = proStatus === true;
  // The unreleased nutrition prototype is intentionally not imported or shipped.
  const nutritionOn = false;
  const [streaksOn, setStreaksOn] = useState(() => localStorage.getItem("lt-streaks-on") !== "0"); // default on
  const [waterOn, setWaterOn] = useState(() => localStorage.getItem("lt-water-on") !== "0"); // default on
  // "I train at more than one gym" — off by default. Only matters for exercises flagged
  // `machine` (see machineOf): lets you tag which gym a set was at, since a machine's real
  // resistance isn't standardized like a barbell's. Everyone else never sees any of it.
  const [multiGymOn, setMultiGymOn] = useState(() => localStorage.getItem("lt-multigym-on") === "1"); // default OFF
  useEffect(() => { localStorage.setItem("lt-streaks-on", streaksOn ? "1" : "0"); }, [streaksOn]);
  useEffect(() => { localStorage.setItem("lt-water-on", waterOn ? "1" : "0"); }, [waterOn]);
  useEffect(() => { localStorage.setItem("lt-multigym-on", multiGymOn ? "1" : "0"); }, [multiGymOn]);
  useEffect(() => { localStorage.setItem("lt-start-tab", startTab); }, [startTab]);
  useEffect(() => { localStorage.setItem("lt-units", units); }, [units]);
  useEffect(() => { localStorage.setItem("lt-hunit", hunit); }, [hunit]);
  useEffect(() => { localStorage.setItem("lt-routines-on", routinesOn ? "1" : "0"); }, [routinesOn]);
  useEffect(() => { localStorage.setItem("lt-steps-on", stepsOn ? "1" : "0"); }, [stepsOn]);
  useEffect(() => { localStorage.setItem("lt-coach-on", coachOn ? "1" : "0"); }, [coachOn]);
  // Steps & the AI Coach are Pro features (default on for Pro). Non-Pro never see them.
  const stepsEnabled = isPro && stepsOn;
  const coachEnabled = isPro && coachOn;
  // These toggles are PROFILE-WIDE: flipping one on a device syncs to the rest via the
  // cloud state (data.profile), so enabling on your phone lights it up on your PC too.
  const setProfileFlag = (key, setLocal) => (v, cur) => {
    const on = typeof v === "function" ? v(cur) : v;
    setLocal(on);
    setData(d => ({ ...d, profile: { ...(d.profile || {}), [key]: on } }));
  };
  const setStepsOnSynced = (v) => setProfileFlag("stepsOn", setStepsOn)(v, stepsOn);
  const setCoachOnSynced = (v) => setProfileFlag("coachOn", setCoachOn)(v, coachOn);
  const setMultiGymOnSynced = (v) => setProfileFlag("multiGymOn", setMultiGymOn)(v, multiGymOn);
  useEffect(() => {
    const v = data?.profile?.stepsOn;
    if (typeof v === "boolean" && v !== stepsOn) setStepsOn(v);
  }, [data?.profile?.stepsOn]);
  useEffect(() => {
    const v = data?.profile?.coachOn;
    if (typeof v === "boolean" && v !== coachOn) setCoachOn(v);
  }, [data?.profile?.coachOn]);
  useEffect(() => {
    const v = data?.profile?.multiGymOn;
    if (typeof v === "boolean" && v !== multiGymOn) setMultiGymOn(v);
  }, [data?.profile?.multiGymOn]);
  // ---- theme (accent color + dark palette), synced across devices ----
  const [theme, setThemeState] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lt-theme")) || DEFAULT_THEME; } catch { return DEFAULT_THEME; }
  });
  const setTheme = (t) => {
    setThemeState(t);
    try { localStorage.setItem("lt-theme", JSON.stringify(t)); } catch { /* private mode */ }
    setData(d => ({ ...d, profile: { ...(d.profile || {}), theme: t } }));
  };
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const v = data?.profile?.theme;
    if (v && (v.accent !== theme.accent || v.palette !== theme.palette)) { setThemeState(v); try { localStorage.setItem("lt-theme", JSON.stringify(v)); } catch {} }
  }, [data?.profile?.theme]);
  useEffect(() => {
    if (tab === "steps" && !stepsEnabled) setTab("dash"); // hide the Steps tab when off / not Pro
  }, [stepsEnabled, tab]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncState, setSyncState] = useState("synced"); // "synced" | "offline"
  const saveTimer = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const cloudVersion = useRef(null);
  const lastSyncedFingerprint = useRef(null);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const username = user.user_metadata?.username || "you";
  const unameLower = (user.user_metadata?.username || "").toLowerCase();
  const cacheKey = `lt-cache-${user.id}`;
  const pendKey = `lt-pending-${user.id}`;
  const versionKey = `lt-cloud-version-${user.id}`;
  const protectedKey = `lt-save-protected-${user.id}`;
  APP_TZ = data.profile?.tz || "auto"; // date helpers everywhere follow the Settings pick
  DAY_START = data.profile?.dayStart ?? 4; // 0 = date flips at midnight

  useEffect(() => { let alive=true; (async () => {
    const cachedRaw = localStorage.getItem(cacheKey);
    const pending = localStorage.getItem(pendKey) === "1";
    let cached = null;
    try { if(cachedRaw) cached=JSON.parse(cachedRaw); } catch {}
    try {
      const row = await withTimeout(loadUserStateRecord(user.id), 12000, "Account load");
      if (!alive) return;
      cloudVersion.current = row?.updated_at || null;
      if (row?.updated_at) localStorage.setItem(versionKey,row.updated_at);
      if (row?.value) {
        // Never let a stale offline copy simply replace cloud state. Preserve both and
        // union their user-created records, then save using an optimistic version check.
        // A substantially fuller cache is also treated as recovery evidence even if an
        // old app incorrectly cleared its pending flag before the cloud write finished.
        const cloudN=stateEntryTotal(row.value),cachedN=stateEntryTotal(cached);
        const fullerCache=!!cached && cachedN>=cloudN+5 && cachedN>cloudN*1.15;
        const combined = cached && (pending||fullerCache) ? mergeStateWithoutLoss(row.value,cached) : row.value;
        const loadedData={ ...defaultData, ...migrateData(combined,unameLower) };
        keepDeviceSnapshot(user.id,row.value);
        lastSyncedFingerprint.current=stateFingerprint({ ...defaultData, ...migrateData(row.value,unameLower) });
        setData(loadedData);
        localStorage.setItem(cacheKey,JSON.stringify(loadedData));
        setLoaded(true); return;
      }
      if (pending && cached) {
        cloudVersion.current=null;
        setData({ ...defaultData, ...migrateData(cached,unameLower) });
        setLoaded(true); return;
      }
      setLoaded(true);
    } catch (e) {
      console.error("load failed", e);
      if (cached) {
        // no signal, but we have this device's last copy — keep going offline
        cloudVersion.current=localStorage.getItem(versionKey)||null;
        const loadedData={ ...defaultData, ...migrateData(cached,unameLower) };
        lastSyncedFingerprint.current=pending?null:stateFingerprint(loadedData);
        setData(loadedData); setSyncState("offline"); setLoaded(true); return;
      }
      setLoadFailed(true);
    }
  })(); return()=>{alive=false;}; }, [user.id]);

  // One-time bridge from the old device-only minimize settings into the cloud profile.
  // Once a key exists in the profile, the cloud value always wins on every device.
  useEffect(() => {
    if (!loaded) return;
    setData(d => {
      const profile = d.profile || {};
      const sections = { ...(profile.minimizedSections || {}) };
      let changed = false;
      const migrate = (profileKey, storageKey, invert = false) => {
        if (Object.prototype.hasOwnProperty.call(sections, profileKey)) return;
        const raw = localStorage.getItem(storageKey); if (raw == null) return;
        sections[profileKey] = invert ? raw === "0" : raw === "1"; changed = true;
      };
      migrate("weeklyTargets", "lt-target-minimized");
      migrate("muscleChart", "lt-muscle-chart-minimized");
      migrate("yearRecap", "lt-recap-minimized");
      migrate("personalRecords", "lt-records-minimized");
      migrate("quickWorkout", "lt-quick-workout-open", true);
      if (!Object.prototype.hasOwnProperty.call(sections, "aiCoach") && profile.coachHideDate === todayStr()) { sections.aiCoach = true; changed = true; }
      let charts = profile.minimizedCharts;
      if (charts == null) {
        try { const old = JSON.parse(localStorage.getItem("lt-minimized-progress-charts") || "{}"); if (old && Object.keys(old).length) { charts = old; changed = true; } } catch {}
      }
      if (!changed) return d;
      return { ...d, profile:{ ...profile, minimizedSections:sections, ...(charts ? { minimizedCharts:charts } : {}) } };
    });
  }, [loaded, user.id]);

  // Big-delete guard: if one change would wipe out a big chunk of the data (a bug or a
  // fat-fingered mass delete), saving pauses and a modal asks first. One-at-a-time
  // deletes never come close to triggering it.
  const [shrinkWarn, setShrinkWarn] = useState(null); // { prev, next } while a save is held
  const allowShrink = useRef(false);
  const enqueueCloudSave = (payload) => {
    saveQueue.current=saveQueue.current.then(async()=>{
      const sentFingerprint=stateFingerprint(payload);
      if(sentFingerprint===lastSyncedFingerprint.current){
        if(stateFingerprint(dataRef.current)===sentFingerprint)localStorage.removeItem(pendKey);
        return;
      }
      try {
        const nextVersion=await saveUserState(user.id,payload,cloudVersion.current);
        cloudVersion.current=nextVersion; localStorage.setItem(versionKey,nextVersion);
        lastSyncedFingerprint.current=sentFingerprint;
        if(stateFingerprint(dataRef.current)===sentFingerprint)localStorage.removeItem(pendKey);
        localStorage.removeItem(protectedKey);
        setSyncState("synced");
      } catch(e) {
        if(e?.code==="STATE_CONFLICT") {
          try {
            const latest=await loadUserStateRecord(user.id);
            if(!latest?.value)throw e;
            keepDeviceSnapshot(user.id,latest.value);
            try{localStorage.setItem(`lt-recovery-${user.id}-${Date.now()}`,JSON.stringify(dataRef.current));}catch{}
            cloudVersion.current=latest.updated_at;
            if(latest.updated_at)localStorage.setItem(versionKey,latest.updated_at);
            const cloudData={...defaultData,...migrateData(latest.value,unameLower)};
            lastSyncedFingerprint.current=stateFingerprint(cloudData);
            setData({...defaultData,...migrateData(mergeStateWithoutLoss(latest.value,dataRef.current),unameLower)});
            setSyncState("merging");
            return;
          } catch(conflictError) { console.error("conflict recovery failed",conflictError); }
        }
        if(e?.code==="P0001" || String(e?.message||"").includes("STATE_SHRINK_BLOCKED")) {
          localStorage.setItem(protectedKey,"1"); setSyncState("protected"); return;
        }
        console.error("save failed",e); setSyncState("offline");
      }
    }).catch(e=>{console.error("save queue failed",e);setSyncState("offline");});
  };
  useEffect(() => { if (!loaded) return;
    const fingerprint=stateFingerprint(data);
    if(fingerprint===lastSyncedFingerprint.current)return;
    let prevN = null;
    let previous=null;
    try { const raw=localStorage.getItem(cacheKey); if(raw){previous=JSON.parse(raw);prevN=stateEntryTotal(previous);} } catch {}
    const nextN=stateEntryTotal(data);
    if (!allowShrink.current && previous && suspiciousStateShrink(previous,data)) {
      setShrinkWarn({ prev: prevN, next: nextN });
      return; // NOTHING is written (device or cloud) until the user decides
    }
    allowShrink.current = false;
    // Always land the change on this device instantly; the cloud follows.
    keepDeviceSnapshot(user.id,previous);
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(pendKey, "1");
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>enqueueCloudSave(data),500);
  }, [data, loaded, user.id]);
  const keepData = () => { // undo the mass delete: reload the untouched copy from this device
    setShrinkWarn(null);
    try { const raw = localStorage.getItem(cacheKey); if (raw) setData({ ...defaultData, ...migrateData(JSON.parse(raw), unameLower) }); } catch {}
  };
  const deleteAnyway = () => { allowShrink.current = true; setShrinkWarn(null); setData(d => ({ ...d })); };

  // When signal returns (or every 30s), push anything still pending.
  useEffect(() => {
    const retry = async () => {
      if (localStorage.getItem(pendKey) !== "1") return;
      if (localStorage.getItem(protectedKey) === "1") return;
      enqueueCloudSave(dataRef.current);
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

  if (loadFailed) return <LoadingScreen forceHelp label="Couldn't reach your account safely" />;

  if (!loaded || proStatus === null) return <LoadingScreen />;

  // Grouped by how they're used so the two rows read logically:
  //   row 1 (do it / check daily): Dash · Log · Cardio · Steps · Groups
  //   row 2 (look it up / less often): Records · Library · Body · Journal
  const tabs = [
    ...(liftingOn ? [["dash","Dash","📊"],["log","Log","📝"],["cardio","Cardio","🏃"]] : []),
    ...(liftingOn && stepsEnabled ? [["steps","Steps","👟"]] : []),
    ["friends","Groups","👥"],
    ...(liftingOn ? [["records","Records","🏆"],["ex","Library","📚"],["body","Body","⚖️"]] : []),
    ["journal","Journal","📓"],
  ];

  return (
    <UnitCtx.Provider value={units}>
    <div style={{ fontFamily:"var(--appfont)", background:"radial-gradient(135% 72% at 50% -6%, rgba(var(--accent-rgb),.10), transparent 52%), var(--bg)", backgroundAttachment:"fixed", minHeight:"100dvh", color:T.ink, position:"relative", isolation:"isolate" }} className="app-root">
      <style>{`
        html { color-scheme:dark; scroll-behavior:smooth; }
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        /* 16px minimum: anything smaller makes iOS Safari zoom in when a field is tapped */
        input,select,button { font-family:inherit; font-size:16px; }
        input,select,button { touch-action:manipulation; }
        button { -webkit-touch-callout:none; user-select:none; }
        input,select,textarea { border:1px solid ${T.line}; border-radius:12px; padding:10px 12px; background:${T.input}; color:${T.ink}; width:100%; transition:border-color .18s ease, box-shadow .22s ease, background .18s ease; min-height:46px; -webkit-appearance:none; appearance:none; }
        select { background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238C8F90' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:32px; }
        input[type=date] { min-width:0; }
        input[type=date]::-webkit-date-and-time-value { text-align:left; }
        input::placeholder,textarea::placeholder { color:${T.sub}; opacity:.75; }
        /* soft green focus glow instead of a hard outline jump */
        input:focus,select:focus,textarea:focus { outline:none; border-color:${T.green}; box-shadow:0 0 0 3px rgba(var(--accent-rgb),.18); }
        button { cursor:pointer; border:none; border-radius:24px; font-weight:600; transition:transform .14s cubic-bezier(.34,1.56,.64,1), background-color .18s ease, color .18s ease, border-color .18s ease, opacity .18s ease, box-shadow .18s ease, filter .18s ease; }
        button:active { transform:scale(.95); }
        @media(hover:hover){ button:hover:not(:disabled){ filter:brightness(1.08); } }
        table { border-collapse:collapse; width:100%; } td,th { padding:9px 10px; text-align:left; font-size:13.5px; } td { font-variant-numeric:tabular-nums; }
        th { background:none; color:${T.sub}; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.8px; white-space:nowrap; border-bottom:1px solid ${T.line}; }
        td { border-bottom:1px solid color-mix(in srgb, var(--line) 65%, transparent); }
        @media(hover:hover){ tbody tr { transition:background .15s ease; } tbody tr:hover { background:rgba(var(--accent-rgb),.05); } }
        /* group-strength exercise picker menu — hover "hit box" so you can see what you'll click */
        [data-lift-menu] .lift-group { font-size:10px; font-weight:800; letter-spacing:.9px; text-transform:uppercase; color:${T.sub}; padding:11px 10px 4px; }
        [data-lift-menu] .lift-group:first-child { padding-top:4px; }
        [data-lift-menu] .lift-opt { width:100%; display:flex; align-items:center; gap:8px; text-align:left; background:none; border:1px solid transparent; border-radius:10px; cursor:pointer; font-family:inherit; font-size:14.5px; font-weight:600; color:${T.ink}; padding:11px 13px; white-space:nowrap; overflow:hidden; transition:background .12s ease, border-color .12s ease, color .12s ease; }
        [data-lift-menu] .lift-opt .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; }
        [data-lift-menu] .lift-opt .name .sub { color:${T.sub}; font-weight:500; font-size:12px; }
        @media(hover:hover){ [data-lift-menu] .lift-opt:hover .name .sub { color:color-mix(in srgb, var(--accent) 60%, ${T.sub}); } }
        [data-lift-menu] .lift-opt .tick { flex-shrink:0; color:${T.green}; font-weight:900; }
        @media(hover:hover){ [data-lift-menu] .lift-opt:hover { background:rgba(var(--accent-rgb),.13); border-color:rgba(var(--accent-rgb),.4); color:${T.green}; } }
        [data-lift-menu] .lift-opt.sel { background:rgba(var(--accent-rgb),.09); color:${T.green}; font-weight:800; }
        @media(hover:hover){ [data-lift-menu] .lift-opt.sel:hover { background:rgba(var(--accent-rgb),.17); border-color:rgba(var(--accent-rgb),.4); } }
        [data-lift-menu] .lift-opt:active { background:rgba(var(--accent-rgb),.2); }
        [data-lift-menu] .lift-rm { width:100%; display:flex; align-items:center; justify-content:center; gap:8px; background:none; border:none; cursor:pointer; font-family:inherit; font-size:12.5px; font-weight:700; letter-spacing:.2px; color:${T.sub}; padding:12px; transition:background .12s ease, color .12s ease; }
        @media(hover:hover){ [data-lift-menu] .lift-rm:hover { background:rgba(255,90,90,.12); color:#ff6b6b; } }
        [data-lift-menu] .lift-rm:active { background:rgba(255,90,90,.18); }
        /* slim themed scrollbars (desktop) */
        *::-webkit-scrollbar { width:10px; height:10px; }
        *::-webkit-scrollbar-thumb { background:color-mix(in srgb, var(--line) 70%, transparent); border-radius:99px; border:2px solid transparent; background-clip:content-box; }
        *::-webkit-scrollbar-thumb:hover { background:color-mix(in srgb, var(--accent) 45%, var(--line)); background-clip:content-box; }
        *::-webkit-scrollbar-track { background:transparent; }
        .card { position:relative; background:linear-gradient(180deg, color-mix(in srgb, var(--card) 90%, #fff 10%), var(--card) 58%); border:1px solid color-mix(in srgb, var(--line) 90%, transparent); border-radius:18px; padding:17px; margin-bottom:14px; box-shadow:0 1px 0 rgba(255,255,255,.05) inset, 0 12px 30px -18px rgba(0,0,0,.85); animation:rise .34s cubic-bezier(.22,1,.36,1) both; }
        .card.compact-card { padding:8px 11px; margin-bottom:9px; min-height:48px; border-radius:14px; }
        /* bright hairline along the very top edge of every panel — subtle cockpit sheen */
        .card::before { content:""; position:absolute; top:0; left:14px; right:14px; height:1px; background:linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 30%, rgba(255,255,255,.5)), transparent); opacity:.4; pointer-events:none; }
        .recharts-text { fill:${T.sub}; }
        .recharts-wrapper, .recharts-wrapper *, .recharts-surface { outline:none !important; -webkit-tap-highlight-color:transparent; }
        .h { font-weight:800; letter-spacing:.2px; }
        /* glass sticky app bar */
        .app-bar { position:sticky; top:0; z-index:10; background:color-mix(in srgb, var(--bg) 70%, transparent); -webkit-backdrop-filter:blur(22px) saturate(1.6); backdrop-filter:blur(22px) saturate(1.6); border-bottom:1px solid color-mix(in srgb, var(--accent) 16%, var(--line)); box-shadow:0 1px 0 rgba(var(--accent-rgb),.12), 0 8px 24px -18px rgba(0,0,0,.9); }
        /* gradient wordmark — technical, wide tracking */
        .brand-word { font-weight:900; letter-spacing:3px; text-transform:uppercase; background:linear-gradient(96deg, var(--ink) 10%, var(--accent) 135%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
        /* pill for the settings/profile chip */
        .profile-chip { display:flex; align-items:center; gap:7px; flex-shrink:0; background:color-mix(in srgb, var(--card) 90%, #fff 4%); border:1px solid color-mix(in srgb, var(--line) 90%, transparent); color:var(--ink); border-radius:99px; box-shadow:0 4px 14px -8px rgba(0,0,0,.6); transition:border-color .18s ease, background .18s ease; }
        @media(hover:hover){ .profile-chip:hover { border-color:color-mix(in srgb, var(--accent) 30%, var(--line)); } }
        @keyframes rise { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes pop { 0% { transform:scale(.6); opacity:0; } 70% { transform:scale(1.06); opacity:1; } 100% { transform:scale(1); opacity:1; } }
        @keyframes grow { from { transform:scaleY(0); } }
        .vbar { transform-origin:bottom; animation:grow .5s ease-out both; }
        .chip { animation:pop .25s ease-out both; }
        .chip { display:inline-block; padding:3px 11px; border-radius:99px; font-size:12px; font-weight:600; border:1px solid color-mix(in srgb, currentColor 22%, transparent); }
        /* premium primary CTA — gradient accent with a glow. Use on the main action of a tab. */
        .btn-primary { background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 86%, #fff 14%), var(--accent) 92%); color:#05140b; font-weight:800; border-radius:13px; text-transform:uppercase; letter-spacing:.7px; box-shadow:0 10px 26px -10px rgba(var(--accent-rgb),.7), 0 0 0 1px rgba(var(--accent-rgb),.25), 0 1px 0 rgba(255,255,255,.3) inset; transition:transform .14s cubic-bezier(.34,1.56,.64,1), box-shadow .2s ease, filter .18s ease; }
        @media(hover:hover){ .btn-primary:hover:not(:disabled){ box-shadow:0 14px 34px -10px rgba(var(--accent-rgb),.85), 0 0 0 1px rgba(var(--accent-rgb),.4), 0 1px 0 rgba(255,255,255,.35) inset; filter:brightness(1.05); } }
        .btn-primary:disabled { filter:saturate(.3) brightness(.7); box-shadow:none; cursor:default; }
        /* segmented pill control — a row of options where one is active */
        .seg { display:inline-flex; gap:2px; background:var(--input); border:1px solid var(--line); border-radius:99px; padding:3px; }
        .seg-btn { padding:6px 13px; font-size:12.5px; font-weight:700; border-radius:99px; border:none; background:transparent; color:var(--sub); min-height:0; transition:background .18s ease, color .18s ease; }
        .seg-btn.on { background:linear-gradient(180deg, rgba(var(--accent-rgb),.22), rgba(var(--accent-rgb),.12)); color:var(--accent); box-shadow:0 0 0 1px rgba(var(--accent-rgb),.25) inset; }
        /* subtle section eyebrow */
        .eyebrow { font-size:11px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; color:var(--sub); }
        @keyframes pulseDot { 0%,100%{opacity:1; transform:scale(1);} 50%{opacity:.4; transform:scale(.8);} }
        .status-dot { width:6px; height:6px; border-radius:99px; background:var(--accent); box-shadow:0 0 10px 1px rgba(var(--accent-rgb),.7); animation:pulseDot 2.4s ease-in-out infinite; flex-shrink:0; }
        @media(hover:hover){ .pro-feat:hover { border-color:color-mix(in srgb, var(--accent) 45%, var(--line))!important; transform:translateY(-2px); } }
        /* faint HUD blueprint grid behind everything, fading in from the top */
        .app-root::before { content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
          background-image:linear-gradient(to right, rgba(var(--accent-rgb),.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(var(--accent-rgb),.055) 1px, transparent 1px);
          background-size:46px 46px;
          -webkit-mask-image:radial-gradient(125% 62% at 50% -4%, #000 0%, transparent 60%); mask-image:radial-gradient(125% 62% at 50% -4%, #000 0%, transparent 60%); }
        @keyframes fadeSwap { from { opacity:0; transform:translateY(8px) scale(.994); } to { opacity:1; transform:none; } }
        @keyframes sheetUp { from { transform:translateY(100%); } to { transform:none; } }
        .tabview { animation:fadeSwap .28s cubic-bezier(.22,1,.36,1) both; }
        /* staggered card entrance — transform/opacity only, one-shot, GPU-cheap */
        .tabview > .card:nth-child(2) { animation-delay:.05s; }
        .tabview > .card:nth-child(3) { animation-delay:.10s; }
        .tabview > .card:nth-child(4) { animation-delay:.15s; }
        .tabview > .card:nth-child(5) { animation-delay:.20s; }
        .tabview > .card:nth-child(n+6) { animation-delay:.24s; }
        /* desktop depth without positional movement — floating controls can be crossed safely */
        @media(hover:hover){ .card { transition:border-color .2s ease, box-shadow .2s ease; } .card:hover { border-color:color-mix(in srgb, var(--accent) 22%, var(--line)); box-shadow:0 1px 0 rgba(255,255,255,.05) inset, 0 16px 40px -18px rgba(0,0,0,.85); } }
        .exercise-visual-dialog { width:min(680px, 100%); max-height:calc(100dvh - 28px); overflow:auto; background:linear-gradient(165deg, color-mix(in srgb, var(--card) 92%, var(--accent) 8%), var(--card) 48%); border:1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius:19px; box-shadow:0 28px 80px rgba(0,0,0,.72), 0 0 0 1px rgba(var(--accent-rgb),.08) inset; animation:calPop .22s cubic-bezier(.22,1,.36,1) both; }
        .exercise-visual-body { display:grid; grid-template-columns:minmax(220px, 270px) 1fr; gap:20px; padding:17px; }
        @media(max-width:580px){ .exercise-visual-dialog { border-radius:17px; } .exercise-visual-body { grid-template-columns:1fr; gap:15px; } .exercise-visual-body > div:first-child { max-width:280px; width:100%; margin:0 auto; } }
        .navicon { transition:transform .2s cubic-bezier(.34,1.56,.64,1); font-size:19px; }
        .navicon.on { transform:translateY(-1px) scale(1.16); }
        @media(prefers-reduced-motion:reduce){ *{transition:none!important;animation:none!important} }

        /* settings sheet: a bottom sheet on phones, a centered dialog on desktop */
        @media(min-width:640px){
          .sheet-wrap { align-items:center !important; padding:24px; }
          .sheet { border-radius:18px !important; border:1px solid ${T.line} !important; max-height:86vh !important;
            animation:calPop .2s cubic-bezier(.22,1,.36,1) both !important; }
        }

        /* ---- custom date picker ---- */
        .cal-pop { animation:calPop .16s cubic-bezier(.22,1,.36,1) both; transform-origin:top left; }
        @keyframes calPop { from { opacity:0; transform:translateY(-6px) scale(.97); } to { opacity:1; transform:none; } }
        .member-menu-pop { animation:memberMenuIn .2s cubic-bezier(.16,1,.3,1) both; will-change:opacity,transform; }
        @keyframes memberMenuIn { from { opacity:0; transform:translateY(4px) scale(.975); } to { opacity:1; transform:none; } }
        .member-menu-pop.closing { animation:memberMenuOut .13s cubic-bezier(.4,0,1,1) both; pointer-events:none; }
        @keyframes memberMenuOut { from { opacity:1; transform:none; } to { opacity:0; transform:translateY(2px) scale(.985); } }
        .cal-day { transition:background .12s ease, color .12s ease, transform .1s ease; }
        .cal-day:active:not(.cal-off) { transform:scale(.85); }
        @media(hover:hover){ .cal-day:not(.cal-off):not(.cal-sel):hover { background:rgba(255,255,255,.09)!important; } }
        .cal-nav { transition:background .14s ease, color .14s ease; }
        @media(hover:hover){ .cal-nav:not(:disabled):hover { background:rgba(255,255,255,.10)!important; color:#fff!important; } }

        /* ---- shimmering skeleton for loading states ---- */
        .skeleton { position:relative; overflow:hidden; background:${T.input}; }
        .skeleton::after { content:""; position:absolute; inset:0; transform:translateX(-100%);
          background:linear-gradient(90deg, transparent, rgba(255,255,255,.06) 45%, rgba(var(--accent-rgb),.10) 50%, rgba(255,255,255,.06) 55%, transparent);
          animation:shimmer 1.35s ease-in-out infinite; }
        @keyframes shimmer { 100% { transform:translateX(100%); } }

        /* ---- weigh-in note: expand/collapse ---- */
        .note-reveal { animation:noteIn .32s cubic-bezier(.22,1,.36,1); overflow:hidden; }
        @keyframes noteIn { from { opacity:0; transform:translateY(-6px); max-height:0; } to { opacity:1; transform:translateY(0); max-height:400px; } }
        /* settings sections: fade/slide only — NO max-height, so tall content (password
           card etc.) is never clipped and the sheet can scroll through all of it */
        @keyframes secIn { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:none; } }
        .note-btn { transition:color .15s ease, background .15s ease, transform .12s ease; }
        .note-btn:active { transform:scale(.9); }
        @media(hover:hover){ .note-btn:hover{ color:${T.green}!important; } }
        .note-caret { display:inline-block; transition:transform .28s cubic-bezier(.22,1,.36,1); }
        .note-caret.open { transform:rotate(90deg); }

        /* ---- monthly group recap popup ---- */
        @keyframes recapPop { 0%{opacity:0; transform:translateY(24px) scale(.94);} 60%{opacity:1; transform:translateY(0) scale(1.015);} 100%{opacity:1; transform:translateY(0) scale(1);} }
        @keyframes recapRow { from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:none;} }
        @keyframes recapSheen { 0%{background-position:-160% 0;} 100%{background-position:260% 0;} }
        @keyframes recapBar { from{transform:scaleX(0);} to{transform:scaleX(1);} }
        @keyframes confFall { 0%{opacity:0; transform:translateY(-14px) rotate(0);} 12%{opacity:1;} 100%{opacity:0; transform:translateY(120px) rotate(320deg);} }
        .recap-card { animation:recapPop .42s cubic-bezier(.22,1,.36,1) both; }
        .recap-title { background:linear-gradient(100deg,#8fe3a0 0%,${T.green} 30%,#F4D58D 50%,#E9C46A 60%,${T.green} 80%,#8fe3a0 100%); background-size:220% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; animation:recapSheen 3.2s linear infinite; }
        .recap-row { animation:recapRow .4s cubic-bezier(.22,1,.36,1) both; }
        .recap-bar-fill { transform-origin:left; animation:recapBar .7s cubic-bezier(.22,1,.36,1) both; }
        .conf { position:absolute; top:0; width:7px; height:11px; border-radius:2px; animation:confFall linear both; }

        /* ---- responsive: phone (<900px) vs desktop (>=900px) ---- */
        /* mobile-first: tabs live in a fixed BOTTOM bar for thumb reach */
        .nav-top { display:none; }
        .nav-bottom {
          /* Flush to the bottom edge — anchored, edge-to-edge, glass with a bright
             hairline top border. Cockpit dock, not a floating pill. */
          position:fixed; bottom:0; left:0; right:0; z-index:20;
          /* Each row below is its OWN grid sized to that row's actual button count, so
             adding/removing a tab never leaves a phantom empty slot in a shorter row —
             every row's buttons always stretch to fill the full width. */
          display:flex; flex-direction:column; row-gap:2px;
          padding:6px 6px calc(6px + min(env(safe-area-inset-bottom), 34px));
          background:linear-gradient(180deg, color-mix(in srgb, var(--card) 72%, transparent), color-mix(in srgb, var(--bg) 88%, transparent));
          -webkit-backdrop-filter:blur(26px) saturate(1.7); backdrop-filter:blur(26px) saturate(1.7);
          border-top:1px solid color-mix(in srgb, var(--accent) 22%, var(--line));
          box-shadow:0 -1px 0 rgba(255,255,255,.04) inset, 0 -10px 34px -12px rgba(0,0,0,.8);
          transition:transform .34s cubic-bezier(.4,0,.2,1), opacity .3s ease;
          /* Keep the bar on its OWN GPU layer at all times. Without a persistent
             non-none transform, iOS Safari doesn't give a position:fixed element a
             compositor layer, so during momentum/rubber-band scrolling it gets
             "stranded" mid-page until the scroll settles. translateZ(0) pins it. */
          transform:translateY(0) translateZ(0); will-change:transform; backface-visibility:hidden;
        }
        /* slide the bar down out of view while scrolling down; back up on scroll-up */
        .nav-bottom.nav-hidden { transform:translateY(140%) translateZ(0); opacity:0; }
        /* tab button — glowing green pill on the active one */
        .navbtn {
          display:flex; flex-direction:column; align-items:center; gap:2px; min-width:0;
          padding:7px 0 6px; border:none; border-radius:15px; background:transparent;
          color:${T.sub}; font-weight:500; font-size:9.5px; cursor:pointer;
          transition:background .22s ease, color .22s ease, transform .16s cubic-bezier(.34,1.56,.64,1);
        }
        .navbtn .navlbl { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .navbtn.on { background:linear-gradient(180deg, rgba(var(--accent-rgb),.26), rgba(var(--accent-rgb),.10)); color:${T.green}; font-weight:800; box-shadow:0 0 0 1px rgba(var(--accent-rgb),.35) inset, 0 6px 18px -6px rgba(var(--accent-rgb),.65); text-shadow:0 0 14px rgba(var(--accent-rgb),.5); }
        @media(hover:hover){ .navbtn:hover:not(.on){ background:rgba(255,255,255,.06); color:${T.ink}; } }
        .navbtn:active { transform:scale(.9); }
        .navrow { display:grid; column-gap:2px; }
        .app-main { max-width:860px; margin:0 auto; padding:16px 14px; }
        /* flush two-row nav dock at the bottom — reserve clearance */
        .app-root { padding-bottom:calc(118px + min(env(safe-area-inset-bottom), 34px)); }
        /* floating "back" on member profiles — above the bottom nav on phones */
        .profile-back-fab { position:fixed; right:16px; z-index:40; bottom:calc(96px + min(env(safe-area-inset-bottom), 34px)); }

        @media (min-width:900px) {
          /* desktop: tabs move into the TOP app bar, bottom bar disappears.
             Content stays a clean CENTERED single column (no stretching). */
          .nav-top { display:flex; gap:6px; }
          .nav-bottom { display:none; }
          .app-root { padding-bottom:36px; }
          .navtop-btn {
            display:flex; flex-direction:column; align-items:center; gap:4px;
            padding:9px 17px; border:none; border-radius:13px; background:transparent;
            color:${T.sub}; font-weight:600; font-size:12.5px; cursor:pointer; white-space:nowrap;
            transition:background .18s ease, color .18s ease, transform .15s ease;
          }
          .navtop-btn .navicon { font-size:21px; }
          .navtop-btn:active { transform:scale(.94); }
          .navtop-btn.on { background:rgba(var(--accent-rgb),.13); color:${T.green}; font-weight:700; }
          .navtop-btn:hover:not(.on){ background:rgba(255,255,255,.06); color:${T.ink}; }
          .profile-back-fab { bottom:28px; }
          .app-main { max-width:880px; padding:24px 20px; }
          /* the Macros tab uses a two-column layout, so it gets a wider canvas */
          .app-main-wide { max-width:1200px; }
        }

        /* Robinhood-style slider (Settings → My day starts at) */
        input[type=range].lab-range { -webkit-appearance:none; appearance:none; width:100%; height:26px; border-radius:99px; border:none; padding:10px 0; min-height:26px; background-clip:content-box; outline:none; cursor:pointer; }
        input[type=range].lab-range:focus { box-shadow:none; }
        .lab-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:26px; height:26px; border-radius:50%; background:#000; border:3px solid ${T.green}; box-shadow:0 2px 10px rgba(var(--accent-rgb),.45); transition:transform .15s ease; }
        .lab-range:active::-webkit-slider-thumb { transform:scale(1.18); }
        .lab-range::-moz-range-thumb { width:26px; height:26px; border-radius:50%; background:#000; border:3px solid ${T.green}; box-shadow:0 2px 10px rgba(var(--accent-rgb),.45); }
        /* drag-to-reorder */
        .drag-handle { cursor:grab; touch-action:none; }
        .dragging { opacity:.55; }
        .drag-over-top { box-shadow:0 -3px 0 ${T.green}; }
        .drag-over-bot { box-shadow:0 3px 0 ${T.green}; }
      `}</style>

      <div className="app-bar">
        <div style={{ maxWidth:1240, margin:"0 auto", display:"flex", alignItems:"center", gap:14,
          padding:"calc(12px + env(safe-area-inset-top)) 18px 11px", color:"#fff" }}>
          <div onClick={()=>setTab("dash")} style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer", userSelect:"none", whiteSpace:"nowrap", minWidth:0, overflow:"hidden" }}>
            <span style={{ fontSize:21, filter:"drop-shadow(0 2px 6px rgba(var(--accent-rgb),.35))" }}>🏋️</span>
            <span className="brand-word" style={{ fontSize:19.5, overflow:"hidden", textOverflow:"ellipsis" }}>THE LAB</span>
            <span className="status-dot" style={{ marginLeft:1 }} />
          </div>
          {/* tabs: inline & centered in the app bar on desktop; hidden on phone (bottom bar used) */}
          <nav className="nav-top" style={{ flex:1, justifyContent:"center" }}>
            {tabs.map(([id,label,icon]) => (
              <button key={id} onClick={()=>setTab(id)} className={"navtop-btn" + (tab===id?" on":"")}>
                <span className={"navicon" + (tab===id?" on":"")}>{icon}</span>
                <span style={{whiteSpace:"nowrap"}}>{label}</span>
              </button>
            ))}
          </nav>
          <button onClick={()=>setShowSettings(true)} className="profile-chip" style={{ marginLeft:"auto", padding: isPro ? "5px 11px 5px 6px" : "6px 13px", fontSize:13, fontWeight:600 }}>
            {isPro && <span style={{ fontSize:10, fontWeight:800, color:"#000", background:"linear-gradient(100deg, rgb(var(--accent-rgb)), #8fe3a0)", padding:"3px 8px", borderRadius:99, letterSpacing:.4, boxShadow:"0 1px 6px rgba(var(--accent-rgb),.4)", whiteSpace:"nowrap" }}>✨ PRO</span>}
            <span style={{ whiteSpace:"nowrap" }}>💪 {username}</span> <span style={{ fontSize:15, opacity:.8 }}>⚙️</span>
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsModal user={user} username={username} data={data} setData={setData}
          startTab={startTab} setStartTab={setStartTab} tabs={tabs}
          units={units} setUnits={setUnits} hunit={hunit} setHunit={setHunit}
          routinesOn={routinesOn} setRoutinesOn={setRoutinesOn}
          stepsOn={stepsOn} setStepsOn={setStepsOnSynced} isPro={isPro}
          coachOn={coachOn} setCoachOn={setCoachOnSynced}
          multiGymOn={multiGymOn} setMultiGymOn={setMultiGymOnSynced}
          theme={theme} setTheme={setTheme}
          streaksOn={streaksOn} setStreaksOn={setStreaksOn}
          waterOn={waterOn} setWaterOn={setWaterOn}
          nutritionOn={nutritionOn}
          onClose={()=>setShowSettings(false)} />
      )}

      {shrinkWarn && (
        <div style={{ position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.72)", backdropFilter:"blur(2px)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeSwap .18s ease-out both" }}>
          <div className="card" style={{ maxWidth:430, width:"100%", borderColor:T.danger, marginBottom:0 }}>
            <div className="h" style={{ fontSize:18, color:T.danger, marginBottom:8 }}>⚠️ Hold up — big deletion</div>
            <div style={{ fontSize:14.5, color:T.ink, lineHeight:1.6, marginBottom:14 }}>
              This change would shrink your saved history from <b>{shrinkWarn.prev}</b> tracked items to <b>{shrinkWarn.next}</b>.
              Nothing has been saved yet — if you didn't mean to delete this much, keep your data and it's like it never happened.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={keepData} style={{ flex:1, background:T.green, color:"#000", padding:"12px", fontWeight:800, fontSize:15 }}>Keep my data</button>
              <button onClick={deleteAnyway} style={{ background:T.dangerBg, color:T.danger, padding:"12px 16px", fontWeight:700, fontSize:14 }}>Delete anyway</button>
            </div>
          </div>
        </div>
      )}

      {(syncState === "offline" || syncState === "merging" || syncState === "protected") && (
        <div style={{ background:"#2A2416", color:"#E3BE55", padding:"8px 18px", fontSize:13, fontWeight:600 }}>
          {syncState==="merging" ? "🛟 Another device had newer data — both copies were preserved and are being safely merged." : syncState==="protected" ? "🛡️ A suspiciously large data loss was blocked. Your cloud copy was not overwritten." : "📴 Offline — your sets are saved on this device and will sync automatically when signal returns."}
        </div>
      )}

      <main className="app-main">
        <div className="tabview" key={tab}>
          {tab==="dash" && liftingOn && <Dashboard data={data} exMap={exMap} setData={setData} user={user} isPro={isPro} coachEnabled={coachEnabled} stepsEnabled={stepsEnabled} nutritionOn={nutritionOn} multiGymOn={multiGymOn} openSettings={()=>setShowSettings(true)} setTab={setTab} />}
          {tab==="log" && liftingOn && <LogTab data={data} exMap={exMap} setData={setData} routinesOn={routinesOn} multiGymOn={multiGymOn} />}
          {tab==="records" && liftingOn && <RecordsTab data={data} exMap={exMap} setData={setData} />}
          {tab==="journal" && <JournalTab data={data} setData={setData} />}
          {tab==="friends" && <FriendsTab user={user} data={data} setData={setData} exMap={exMap} nutritionOn={nutritionOn} streaksOn={streaksOn} isPro={isPro} openPro={()=>setShowSettings(true)} />}
          {tab==="body" && liftingOn && <BodyTab data={data} setData={setData} hunit={hunit} />}
          {tab==="cardio" && liftingOn && <CardioTab data={data} setData={setData} latestBW={latestBW} user={user} stepsOn={stepsEnabled} />}
          {tab==="steps" && liftingOn && stepsEnabled && <StepsTab user={user} data={data} setData={setData} />}
          {tab==="ex" && liftingOn && <ExercisesTab data={data} setData={setData} user={user} />}
        </div>
      </main>

      {/* phone tab bar (bottom, thumb-reachable) — up to two rows. Hidden on desktop.
          Split as evenly as possible so a tab count change never leaves a ragged
          half-empty row (e.g. 8 tabs => 4+4, 9 => 5+4, 10 => 5+5); each row is sized
          to ITS OWN button count, so that shorter second row still fills edge-to-edge
          instead of leaving a phantom empty slot at the old 5-column width. */}
      <nav className={"nav-bottom" + (navHidden ? " nav-hidden" : "")}>
        {(tabs.length <= 5 ? [tabs] : [tabs.slice(0, Math.ceil(tabs.length / 2)), tabs.slice(Math.ceil(tabs.length / 2))]).map((row, ri) => (
          <div key={ri} className="navrow" style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}>
            {row.map(([id,label,icon]) => (
              <button key={id} onClick={()=>setTab(id)} className={"navbtn" + (tab===id?" on":"")}>
                <span className={"navicon" + (tab===id?" on":"")}>{icon}</span>
                <span className="navlbl">{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </div>
    </UnitCtx.Provider>
  );
}

/* ================= ROUTINES (optional feature, toggled in Settings) =================
   A routine is a saved template: { id, name, items:[{exercise, sets, reps}] }.
   "Start" walks you exercise-by-exercise; tapping one loads it into the log form.
   Kept fully self-contained so the whole feature can be removed by deleting this
   block + the `routinesOn` wiring, with no other code depending on it. */
function RoutinesPanel({ data, setData, onPick }) {
  const routines = Array.isArray(data.routines) ? data.routines : [];
  const [view, setView] = useState(routines.length ? "list" : "list");
  const [draft, setDraft] = useState(null);   // routine being built/edited
  const [runId, setRunId] = useState(null);   // routine being followed
  const [collapsed, setCollapsed] = useState(routines.length === 0);
  const today = todayStr();

  const running = routines.find(r => r.id === runId);

  const saveRoutines = (next) => setData(d => ({ ...d, routines: next }));

  const startNew = () => { setDraft({ id: Date.now(), name: "", items: [] }); setView("build"); };
  const editRoutine = (r) => { setDraft(JSON.parse(JSON.stringify(r))); setView("build"); };
  const removeRoutine = (id) => saveRoutines(routines.filter(r => r.id !== id));

  const addItem = () => setDraft(d => ({ ...d, items: [...d.items, { exercise: "", sets: 3, reps: "8-12" }] }));
  const setItem = (i, patch) => setDraft(d => ({ ...d, items: d.items.map((it, j) => j === i ? { ...it, ...patch } : it) }));
  const delItem = (i) => setDraft(d => ({ ...d, items: d.items.filter((_, j) => j !== i) }));
  const moveItem = (i, dir) => setDraft(d => {
    const j = i + dir; if (j < 0 || j >= d.items.length) return d;
    const items = [...d.items]; [items[i], items[j]] = [items[j], items[i]]; return { ...d, items };
  });

  const draftValid = draft && draft.name.trim() && draft.items.length && draft.items.every(it => it.exercise);
  const saveDraft = () => {
    if (!draftValid) return;
    const clean = { ...draft, name: draft.name.trim(), items: draft.items.map(it => ({ exercise: it.exercise, sets: Math.max(1, parseInt(it.sets) || 1), reps: String(it.reps || "").trim() })) };
    const exists = routines.some(r => r.id === clean.id);
    saveRoutines(exists ? routines.map(r => r.id === clean.id ? clean : r) : [...routines, clean]);
    setDraft(null); setView("list");
  };

  const doneToday = (ex) => data.log.filter(e => e.exercise === ex && e.date === today && e.effort !== "Warm-up").length;

  const box = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, marginBottom: 14 };
  const smallBtn = { background: T.input, color: T.ink, border: `1px solid ${T.line}`, padding: "6px 11px", fontSize: 13, fontWeight: 600 };

  /* ---- BUILDER ---- */
  if (view === "build" && draft) {
    return (
      <div style={box}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div className="h" style={{ fontSize: 18, color: T.tealDk }}>{routines.some(r => r.id === draft.id) ? "Edit routine" : "New routine"}</div>
          <button onClick={() => { setDraft(null); setView("list"); }} style={{ ...smallBtn, marginLeft: "auto", color: T.sub }}>Cancel</button>
        </div>
        <label style={lbl}>Routine name
          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Push Day" autoCapitalize="words" />
        </label>
        <div style={{ margin: "14px 0 6px", fontSize: 13, fontWeight: 700, color: T.sub }}>EXERCISES</div>
        {draft.items.map((it, i) => (
          <div key={i} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, color: T.sub, fontWeight: 700, minWidth: 18 }}>{i + 1}.</span>
              <select value={it.exercise} onChange={e => setItem(i, { exercise: e.target.value })} style={{ flex: 1, minHeight: 0 }}>
                <option value="">— pick exercise —</option>
                {MUSCLES.map(m => (
                  <optgroup key={m} label={m}>
                    {data.exercises.filter(x => muscleOf(x) === m).map(x => <option key={x.name}>{x.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <button onClick={() => moveItem(i, -1)} style={{ ...smallBtn, padding: "6px 8px" }} title="Move up">↑</button>
              <button onClick={() => moveItem(i, 1)} style={{ ...smallBtn, padding: "6px 8px" }} title="Move down">↓</button>
              <button onClick={() => delItem(i)} style={{ ...smallBtn, padding: "6px 8px", color: T.danger }} title="Remove">✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8 }}>
              <label style={{ ...lbl, fontSize: 12 }}>Sets<input type="number" min="1" value={it.sets} onChange={e => setItem(i, { sets: e.target.value })} /></label>
              <label style={{ ...lbl, fontSize: 12 }}>Target reps<input value={it.reps} onChange={e => setItem(i, { reps: e.target.value })} placeholder="e.g. 8-12" /></label>
            </div>
          </div>
        ))}
        <button onClick={addItem} style={{ ...smallBtn, width: "100%", padding: "10px", marginTop: 2 }}>+ Add exercise</button>
        <button onClick={saveDraft} disabled={!draftValid}
          style={{ width: "100%", marginTop: 12, background: draftValid ? T.green : T.input, color: draftValid ? "#000" : T.sub, fontWeight: 800, padding: "12px" }}>
          Save routine
        </button>
      </div>
    );
  }

  /* ---- RUNNING a routine ---- */
  if (view === "run" && running) {
    const totalSets = running.items.reduce((s, it) => s + (parseInt(it.sets) || 0), 0);
    const doneSets = running.items.reduce((s, it) => s + Math.min(doneToday(it.exercise), parseInt(it.sets) || 0), 0);
    return (
      <div style={{ ...box, borderColor: T.green }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div className="h" style={{ fontSize: 18, color: T.tealDk }}>▶ {running.name}</div>
          <button onClick={() => { setRunId(null); setView("list"); }} style={{ ...smallBtn, marginLeft: "auto", color: T.sub }}>Done</button>
        </div>
        <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 4 }}>{doneSets} / {totalSets} sets logged today</div>
        <div style={{ height: 5, background: T.input, borderRadius: 99, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${totalSets ? doneSets / totalSets * 100 : 0}%`, background: T.green, borderRadius: 99, transition: "width .3s" }} />
        </div>
        {running.items.map((it, i) => {
          const done = doneToday(it.exercise);
          const target = parseInt(it.sets) || 0;
          const complete = done >= target;
          return (
            <button key={i} onClick={() => onPick(it.exercise, it.reps)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                background: complete ? T.mint : T.input, border: `1px solid ${complete ? T.green : T.line}`,
                borderRadius: 10, padding: "11px 12px", marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{complete ? "✅" : "⬜"}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: T.ink }}>{it.exercise}</span>
                <span style={{ fontSize: 12, color: T.sub }}>{done}/{target} sets{it.reps ? ` · ${it.reps} reps` : ""}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: complete ? T.green : T.ink }}>{complete ? "Done" : "Log ›"}</span>
            </button>
          );
        })}
        <div style={{ fontSize: 11.5, color: T.sub, marginTop: 4 }}>Tap an exercise to load it into the form below, then log your sets as normal.</div>
      </div>
    );
  }

  /* ---- LIST (default) ---- */
  return (
    <div style={{...box,...(collapsed?{padding:"8px 11px",marginBottom:9}:null)}}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="h" style={{ fontSize: collapsed?15:18, color: T.tealDk }}>📋 Routines</div>
        <button onClick={() => setCollapsed(c => !c)} style={{ background: "none", color: T.sub, fontSize: 13, padding: "4px 8px", marginLeft: "auto" }}>
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (<>
        {routines.length === 0 && (
          <div style={{ fontSize: 13, color: T.sub, margin: "8px 0 12px" }}>
            Build a template like “Push Day,” then tap Start to log it exercise-by-exercise.
          </div>
        )}
        {routines.map(r => (
          <div key={r.id} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{r.name}</div>
              <div style={{ fontSize: 12, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.items.length} exercise{r.items.length !== 1 ? "s" : ""} · {r.items.map(it => it.exercise).join(", ")}
              </div>
            </div>
            <button onClick={() => { setRunId(r.id); setView("run"); }} style={{ background: T.green, color: "#000", fontWeight: 800, padding: "8px 14px", fontSize: 13 }}>Start</button>
            <button onClick={() => editRoutine(r)} style={smallBtn}>Edit</button>
            <ConfirmX onConfirm={() => removeRoutine(r.id)} />
          </div>
        ))}
        <button onClick={startNew} style={{ ...smallBtn, width: "100%", padding: "10px", marginTop: 12 }}>+ New routine</button>
      </>)}
    </div>
  );
}

/* ================= LOG ================= */
/* Tiny gym select with an inline "add a new gym" affordance — no separate settings
   page needed. Used wherever a machine/cable exercise needs a gym tag. */
function GymPicker({ gyms, value, onChange, onCreate }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const commit = () => { const n = name.trim(); if (n) onCreate(n); setAdding(false); setName(""); };
  if (adding) return (
    <div style={{ display:"flex", gap:6 }}>
      <input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Gym name (e.g. Gym B)"
        onKeyDown={e=>{ if (e.key==="Enter") commit(); else if (e.key==="Escape") { setAdding(false); setName(""); } }}
        style={{ flex:1 }} />
      <button type="button" onClick={commit} style={{ background:T.green, color:"#000", fontWeight:700, padding:"0 16px", flexShrink:0 }}>Add</button>
      <button type="button" onClick={()=>{ setAdding(false); setName(""); }} style={{ background:T.input, color:T.sub, padding:"0 12px", flexShrink:0 }}>✕</button>
    </div>
  );
  return (
    <select value={value || ""} onChange={e => e.target.value === "__add__" ? setAdding(true) : onChange(e.target.value)}>
      <option value="">— pick a gym —</option>
      {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      <option value="__add__">+ Add a gym…</option>
    </select>
  );
}

function LogTab({ data, exMap, setData, routinesOn, multiGymOn }) {
  const entryFormRef = useRef(null);
  const sorted = useMemo(()=>[...data.log].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id),[data.log]);
  const last = [...sorted].reverse().find(e=>!e.muscleOnly && exMap[e.exercise]);
  // date defaults to the "gym day" (before your Settings day-start hour = still yesterday);
  // exercise only carries over from that same day
  const gymDay = gymDayStr();
  const [date, setDate] = useState(gymDay);
  const [exName, setExName] = useState(last?.date === gymDay ? last.exercise : "");
  const [setNum, setSetNum] = useState(1);
  // set # follows what's actually in the log for this exercise+date, so it resets on a new
  // day/exercise and heals itself when a set is deleted (no more phantom "set 4 of 3")
  useEffect(() => {
    const n = data.log.filter(e => e.date === date && e.exercise === exName).length;
    setSetNum(n + 1);
  }, [data.log, date, exName]);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [effort, setEffort] = useState("");
  const [notes, setNotes] = useState("");
  const [justSaved, setJustSaved] = useState(null);
  const [visualOpen, setVisualOpen] = useState(null);
  const units = useUnit();
  const plateSet = units === "kg" ? PLATES_KG : PLATES_LB;
  const barOpts = units === "kg" ? BARS_KG : BARS_LB;
  const [bar, setBar] = useState(units === "kg" ? 20 : 45);
  const [plateMode, setPlateMode] = useState("weight"); // "weight" = type total | "build" = tap plates
  const [built, setBuilt] = useState([]); // plates on ONE side, in the build tool
  const sumSide = built.reduce((s,p)=>s+p, 0);
  const addPlate = (p) => { const nb=[...built,p].sort((a,b)=>b-a); setBuilt(nb); setWeight(String(bar + 2*nb.reduce((s,x)=>s+x,0))); };
  const undoPlate = () => { const nb=built.slice(0,-1); setBuilt(nb); setWeight(nb.length ? String(bar + 2*nb.reduce((s,x)=>s+x,0)) : ""); };
  const clearPlates = () => { setBuilt([]); setWeight(""); };
  // switching units resets the bar/plates to that unit's defaults
  useEffect(() => { setBar(units === "kg" ? 20 : 45); setBuilt([]); }, [units]);

  // rest timer — the END TIME lives in localStorage, so the countdown survives
  // switching tabs and even closing the app (0 duration = timer switched off)
  const [restDur, setRestDur] = useState(() => {
    const raw = localStorage.getItem("lt-rest");
    return raw === null ? 90 : Number(raw);
  });
  const [customRestOpen, setCustomRestOpen] = useState(false);
  const [customRestMin, setCustomRestMin] = useState("");
  const [customRestSec, setCustomRestSec] = useState("");
  const [showRestOvertime, setShowRestOvertime] = useState(() => localStorage.getItem("lt-rest-overtime") === "1");
  const restEndAt = () => Number(localStorage.getItem("lt-rest-end")) || 0;
  const restFinishedAt = () => Number(localStorage.getItem("lt-rest-finished")) || 0;
  const secsLeft = (end) => Math.max(0, Math.ceil((end - Date.now()) / 1000));
  const [restLeft, setRestLeft] = useState(() => secsLeft(restEndAt()));
  const [restDone, setRestDone] = useState(() => {
    const end = restEndAt() || restFinishedAt(); // finished while we were away?
    return end > 0 && end <= Date.now() && Date.now() - end < 2 * 60 * 60 * 1000;
  });
  const [restOver, setRestOver] = useState(() => restFinishedAt() ? Math.max(0, Math.floor((Date.now()-restFinishedAt())/1000)) : 0);
  useEffect(() => { localStorage.setItem("lt-rest", String(restDur)); }, [restDur]);
  useEffect(() => { localStorage.setItem("lt-rest-overtime", showRestOvertime ? "1" : "0"); }, [showRestOvertime]);
  const startRest = () => {
    if (restDur <= 0) return;
    localStorage.setItem("lt-rest-end", String(Date.now() + restDur * 1000));
    localStorage.removeItem("lt-rest-finished");
    setRestOver(0); setRestDone(false); setRestLeft(restDur);
  };
  const saveCustomRest = () => {
    const blank=String(customRestMin).trim()===""&&String(customRestSec).trim()==="";
    const total=Math.max(1,Math.min(3600,blank?300:(parseInt(customRestMin)||0)*60+(parseInt(customRestSec)||0)));
    setRestDur(total);
    setCustomRestMin(""); setCustomRestSec("");
    setCustomRestOpen(false);
  };
  const restPresets = [0,60,90,120,180];
  const customRestSelected = restDur > 0 && !restPresets.includes(restDur);
  const restChoices = customRestSelected ? [...restPresets,restDur] : restPresets;
  const stopRest = () => { localStorage.removeItem("lt-rest-end"); localStorage.removeItem("lt-rest-finished"); setRestOver(0); setRestLeft(0); setRestDone(false); };
  useEffect(() => {
    if (restLeft <= 0) return;
    const t = setInterval(() => {
      const s = secsLeft(restEndAt()); // clock-based: stays honest even if ticks get throttled
      setRestLeft(s);
      if (s <= 0) { const finished=restEndAt()||Date.now(); clearInterval(t); navigator.vibrate?.([250,120,250]); localStorage.setItem("lt-rest-finished",String(finished)); setRestOver(Math.max(0,Math.floor((Date.now()-finished)/1000))); setRestDone(true); localStorage.removeItem("lt-rest-end"); }
    }, 1000);
    return () => clearInterval(t);
  }, [restLeft > 0]);
  // the ✅ done note clears itself after a few seconds
  useEffect(() => {
    if (!restDone || showRestOvertime) return;
    const t = setTimeout(() => { setRestDone(false); localStorage.removeItem("lt-rest-finished"); }, 6000);
    return () => clearTimeout(t);
  }, [restDone, showRestOvertime]);
  useEffect(() => {
    if (!restDone || !showRestOvertime) return;
    const tick = () => setRestOver(Math.max(0, Math.floor((Date.now()-(restFinishedAt()||Date.now()))/1000)));
    tick(); const t=setInterval(tick,1000); return()=>clearInterval(t);
  }, [restDone, showRestOvertime]);

  const isBW = exMap[exName]?.type === "Bodyweight";
  const selectedHasVisual = hasExerciseVisual(exMap[exName]);
  // Machine/cable exercises only, and only once multi-gym tracking is on — the load a
  // pin-loaded machine gives at "20kg" isn't standardized like a barbell's, so once tagged,
  // "last time"/PRs/the sparkline all compare within the SAME gym instead of across gyms.
  const gyms = data.gyms || [];
  const isMachine = multiGymOn && machineOf(exMap[exName]);
  const gymPickerHidden = !!data.profile?.hideGymPicker;
  const [gymId, setGymId] = useState("");
  const addGym = (name) => {
    const g = { id: Math.random().toString(36).slice(2), name };
    setData(d => ({ ...d, gyms: [...(d.gyms || []), g] }));
    setGymId(g.id);
  };
  const sameGym = (e) => !isMachine || !gymId || e.gym === gymId;

  const lastTime = useMemo(() => {
    if (!exName) return null;
    const prior = sorted.filter(e => e.exercise===exName && e.date < date && !e.quick && sameGym(e));
    if (!prior.length) return { first:true };
    const lastDate = prior[prior.length-1].date;
    const sess = prior.filter(e => e.date===lastDate);
    if (isBW) { const best = Math.max(...sess.map(s=>s.reps)); return { text:`${best} reps`, date:lastDate, bestVal:best }; }
    const best = sess.reduce((a,b)=> e1rm(b.weight||0,b.reps) > e1rm(a.weight||0,a.reps) ? b : a);
    return { text:`${dispW(best.weight,units)} × ${best.reps}`, date:lastDate, bestVal:e1rm(best.weight||0,best.reps) };
  }, [exName, date, sorted, isBW, units, isMachine, gymId]);

  // live "are you beating last time?" from the current inputs
  const beaten = useMemo(() => {
    if (!lastTime || lastTime.first || !reps) return false;
    if (isBW) return parseInt(reps) > lastTime.bestVal;
    if (!weight) return false;
    return e1rm(toLb(parseFloat(weight), units), parseInt(reps)) > lastTime.bestVal;
  }, [lastTime, isBW, weight, reps, units]);

  /* session-best history for the picked exercise (last 10 sessions before today's date) */
  const sparkPts = useMemo(() => {
    if (!exName) return null;
    const byDate = {};
    for (const e of sorted) {
      if (e.exercise !== exName || e.date >= date || e.effort === "Warm-up" || e.quick || !sameGym(e)) continue;
      const v = isBW ? e.reps : e1rm(e.weight || 0, e.reps);
      byDate[e.date] = Math.max(byDate[e.date] || 0, v);
    }
    return Object.keys(byDate).sort().map(k => Math.round(byDate[k])).slice(-10);
  }, [exName, date, sorted, isBW, isMachine, gymId]);

  const checkPR = (entry) => {
    const prior = data.log.filter(e => e.exercise===entry.exercise && e.date < entry.date && !e.quick && sameGym(e));
    if (!prior.length) return false;
    if (isBW) return entry.reps > Math.max(...prior.map(p=>p.reps));
    return e1rm(entry.weight, entry.reps) > Math.max(...prior.map(p=>e1rm(p.weight||0,p.reps)));
  };

  // drop sets: same set, weight lowered mid-set and kept going — extra {weight, reps} rows
  const [drops, setDrops] = useState([]);
  const addSet = () => {
    if (!exName || !reps || (!isBW && !weight)) return;
    if (date > todayStr()) { setDate(todayStr()); return; } // no logging the future
    const cleanDrops = drops
      .map(dr => ({ weight: toLb(parseFloat(dr.weight), units), reps: parseInt(dr.reps) }))
      .filter(dr => dr.weight > 0 && dr.reps > 0);
    // Bodyweight moves: weight is an OPTIONAL extra load (belt/vest/dumbbell between the
    // feet) — leaving it blank logs a plain bodyweight set. Either way the move still
    // counts by reps everywhere (leaderboards, graphs, PRs), since those all key off type.
    const entry = { id: Date.now(), date, exercise: exName, set: setNum,
      weight: isBW ? (weight ? toLb(parseFloat(weight), units) : null) : toLb(parseFloat(weight), units), reps: parseInt(reps), effort, notes,
      ...(cleanDrops.length ? { drops: cleanDrops } : {}), ...(isMachine && gymId ? { gym: gymId } : {}) };
    const pr = checkPR(entry);
    setData(d => ({ ...d, log: [...d.log, entry] }));
    setJustSaved({ ...entry, pr });
    setSetNum(n => n + 1); setNotes(""); setEffort(""); setDrops([]);
    if (effort !== "Warm-up") startRest(); // auto-start rest between working sets (no-op when Off)
  };
  // A quick tally intentionally creates real log rows, so it appears everywhere normal
  // sets do (calendar, 30-day chart, streaks, and weekly targets) without affecting PRs.
  const addQuickSets = (exerciseName, count) => {
    if (!exerciseName || !count) return;
    const today = todayStr();
    const already = (data.log || []).filter(e => e.date === today && e.exercise === exerciseName).length;
    const base = Date.now();
    const rows = Array.from({ length: count }, (_, i) => ({
      id: base + i, date: today, exercise: exerciseName, set: already + i + 1,
      weight: null, reps: null, effort: "", notes: "", quick: true,
    }));
    setData(d => ({ ...d, log: [...d.log, ...rows] }));
  };
  const addQuickWorkout = (quickDate, counts) => {
    const picked = MUSCLES.filter(m => (counts[m] || 0) > 0);
    if (!picked.length) return;
    const safeDate = quickDate > todayStr() ? todayStr() : quickDate;
    const base = Date.now();
    const sessionId = `quick-${base}`;
    const rows = picked.map((muscle, i) => ({
      id: base + i, date: safeDate, exercise: muscle, muscle, sets: counts[muscle], set: 1,
      weight: null, reps: null, effort: "", notes: "", quick: true, muscleOnly: true, quickSessionId: sessionId,
    }));
    setData(d => ({ ...d, log: [...d.log, ...rows] }));
  };
  const sameAgain = () => {
    if (!justSaved) return;
    setReps(String(justSaved.reps));
    if (justSaved.weight != null) setWeight(String(dispW(justSaved.weight, units)));
    if (justSaved.drops?.length) setDrops(justSaved.drops.map(dr => ({ weight: String(dispW(dr.weight, units)), reps: String(dr.reps) })));
    setJustSaved(null);
  };

  // most recent logged weight (in lb) for an exercise — lets us pre-fill the weight field so
  // you don't retype a weight that didn't change; you only edit it when it's actually different.
  const lastWeightFor = (name) => {
    let best = null;
    for (const e of data.log) {
      if (e.exercise === name && e.weight != null &&
          (!best || e.date > best.date || (e.date === best.date && (e.id||0) > (best.id||0)))) best = e;
    }
    return best ? best.weight : null;
  };
  // most recent gym you logged this exercise at — so you're not re-picking it every set
  const lastGymFor = (name) => {
    let best = null;
    for (const e of data.log) {
      if (e.exercise === name && e.gym &&
          (!best || e.date > best.date || (e.date === best.date && (e.id||0) > (best.id||0)))) best = e;
    }
    return best ? best.gym : "";
  };
  const startNewExercise = (name) => {
    const w = lastWeightFor(name);
    const already = data.log.filter(e => e.exercise === name && e.date === date).length;
    setExName(name); setSetNum(already + 1);
    setWeight(w != null ? String(dispW(w, units)) : ""); // pre-fill the last weight used for this exercise
    setGymId(lastGymFor(name));
    setReps(""); setJustSaved(null); setDrops([]); setBuilt([]);
  };
  const pickFromHistory = (entry) => {
    if (entry.muscleOnly || !exMap[entry.exercise]) return;
    startNewExercise(entry.exercise);
    setExQ(""); setEdit(null); setNoteOpen(null);
    requestAnimationFrame(() => entryFormRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }));
  };
  // on reopen: if an exercise carried over from the current gym-day, pre-fill its last weight too
  useEffect(() => {
    if (exName && weight === "") {
      const w = lastWeightFor(exName);
      if (w != null) setWeight(String(dispW(w, units)));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // routine tapped: load the exercise into the form, prefill target reps, jump to the gym day
  const pickFromRoutine = (exercise, reps) => {
    startNewExercise(exercise);
    const already = data.log.filter(e => e.exercise === exercise && e.date === gymDay && e.effort !== "Warm-up").length;
    setSetNum(already + 1);
    const n = String(reps || "").match(/\d+/);
    if (n) setReps(n[0]);
    setDate(gymDay);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // exercise search — Logs tab's own inline search (matches the name OR the muscle)
  const [exQ, setExQ] = useState("");
  const exMatches = useMemo(() => {
    const q = exQ.trim().toLowerCase();
    if (!q) return [];
    return data.exercises
      .filter(x => x.name.toLowerCase().includes(q) || muscleOf(x).toLowerCase().includes(q))
      .slice(0, 12);
  }, [exQ, data.exercises]);

  const [histQ, setHistQ] = useState("");
  const [histLimit, setHistLimit] = useState(50); // show newest 50, "Show more" reveals the rest
  const histFull = useMemo(() => {
    const q = histQ.trim().toLowerCase();
    const src = q ? sorted.filter(e => entryLabel(e).toLowerCase().includes(q)) : sorted;
    return [...src].reverse(); // full history, newest first — nothing dropped
  }, [sorted, histQ]);
  const searching = histQ.trim() !== "";
  const recent = searching ? histFull : histFull.slice(0, histLimit); // filtering shows every match

  const [noteOpen, setNoteOpen] = useState(null); // set id whose 📝 note is expanded
  const [edit, setEdit] = useState(null); // copy of the set being edited
  const editIsBW = edit ? exMap[edit.exercise]?.type === "Bodyweight" : false;
  const editIsMachine = edit ? (multiGymOn && machineOf(exMap[edit.exercise])) : false;
  const editValid = edit && (edit.muscleOnly
    ? MUSCLES.includes(edit.muscle) && (parseInt(edit.sets) || 0) > 0
    : edit.reps !== "" && edit.exercise && (editIsBW || edit.weight !== ""));
  const saveEdit = () => {
    if (!editValid) return;
    setData(d => ({ ...d, log: d.log.map(x => x.id === edit.id ? (edit.muscleOnly ? {
      ...x, date: edit.date > todayStr() ? todayStr() : edit.date, exercise: edit.muscle,
      muscle: edit.muscle, sets: Math.max(1, Math.min(50, parseInt(edit.sets) || 1)),
    } : {
      ...x, date: edit.date > todayStr() ? todayStr() : edit.date, exercise: edit.exercise, set: parseInt(edit.set) || 1,
      weight: editIsBW ? (edit.weight !== "" ? toLb(parseFloat(edit.weight), units) : null) : toLb(parseFloat(edit.weight), units), reps: parseInt(edit.reps),
      effort: edit.effort, notes: edit.notes,
      ...(editIsMachine ? { gym: edit.gym || null } : {}),
    }) : x) }));
    setEdit(null);
  };

  return (<>
    {routinesOn && <RoutinesPanel data={data} setData={setData} onPick={pickFromRoutine} />}
    <QuickWorkoutLogger defaultDate={gymDay} exercises={data.exercises} onSave={addQuickWorkout} onAddExercise={addQuickSets}
      minimized={!!data.profile?.minimizedSections?.quickWorkout}
      onMinimizedChange={value=>setData(d=>({ ...d, profile:{ ...(d.profile||{}), minimizedSections:{ ...(d.profile?.minimizedSections||{}), quickWorkout:value } } }))} />
    <div className="card" ref={entryFormRef}>
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:10}}>Log a set</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <div>
          <DateField label="Date" value={date} max={todayStr()} onChange={setDate} />
          {date === gymDay && gymDay !== todayStr() && (
            <span style={{display:"block", fontSize:11, color:T.sub, marginTop:3}}>🌙 counted as yesterday</span>
          )}
        </div>
        <label style={lbl}>Set #<input type="number" min="1" value={setNum} onChange={e=>setSetNum(parseInt(e.target.value)||1)} /></label>
      </div>
      <label style={lbl}>Exercise
        <input value={exQ} onChange={e=>setExQ(e.target.value)} placeholder="🔍 Type to search (e.g. push, chest)…"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:6}} />
        {exMatches.length > 0 && (
          <div style={{border:`1px solid ${T.line}`, borderRadius:10, overflow:"hidden", marginBottom:6}}>
            {exMatches.map(x=>(
              <button key={x.name} type="button" onClick={()=>{ startNewExercise(x.name); setExQ(""); }}
                style={{display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", padding:"8px 10px", background:T.input,
                  color:T.ink, borderRadius:0, borderBottom:`1px solid ${T.line}`, fontSize:14.5, fontWeight:600}}>
                <ExerciseThumb exercise={x} size={42} />
                <span style={{minWidth:0, flex:1}}><span style={{display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{x.name}</span><span style={{display:"block", color:T.sub, fontSize:11.5, fontWeight:500, marginTop:2}}>{muscleLabel(x)} · {equipOf(x)}</span></span>
              </button>
            ))}
          </div>
        )}
        {exQ.trim() && !exMatches.length && (
          <div style={{fontSize:12.5, color:T.sub, marginBottom:6}}>No match — you can add new moves in the 📚 Library tab.</div>
        )}
        <select value={exName} onChange={e=>startNewExercise(e.target.value)}>
          <option value="">— pick an exercise —</option>
          {MUSCLES.map(m => (
            <optgroup key={m} label={m}>
              {data.exercises.filter(x=>muscleOf(x)===m).map(x=><option key={x.name}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      {exName && (
        <div style={{ background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:12, padding:"10px 11px", margin:"10px 0", fontSize:14, display:"flex", gap:11, alignItems:"flex-start" }}>
          {selectedHasVisual && <ExerciseThumb exercise={exMap[exName]} size={74} onOpen={()=>setVisualOpen(exMap[exName])} />}
          <div style={{minWidth:0, flex:1}}>
            {selectedHasVisual && <button type="button" onClick={()=>setVisualOpen(exMap[exName])} style={{display:"flex", alignItems:"center", gap:6, maxWidth:"100%", padding:0, background:"none", color:T.green, fontSize:11.5, fontWeight:800, textTransform:"uppercase", letterSpacing:".55px", marginBottom:4}}>
              <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>View movement</span><span aria-hidden="true">↗</span>
            </button>}
            {lastTime?.first
              ? <b>First time logging this!</b>
              : <>Last time: <b>{lastTime.text}</b> <span style={{color:T.sub}}>({fmtDate(lastTime.date)})</span> — beat it.
                {beaten && <span className="chip" style={{background:T.mint, color:T.green, marginLeft:8}}>🔥 Beating last time!</span>}</>}
            {isBW && <div style={{fontSize:12, color:T.sub, marginTop:2}}>Bodyweight move — tracked by reps. Add weight below if you used a belt/vest; it still counts as bodyweight everywhere.</div>}
            {sparkPts && sparkPts.length >= 2 && (
              <div style={{display:"flex", alignItems:"center", gap:10, marginTop:8}}>
                <Spark pts={sparkPts} w={110} h={28} />
                <span style={{fontSize:11.5, color:T.sub}}>your last {sparkPts.length} sessions ({isBW ? "best reps" : "best est. 1RM"})</span>
              </div>
            )}
          </div>
        </div>
      )}

      {isMachine && !gymPickerHidden && (
        <div style={{ marginBottom:10 }}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={lbl}>🏢 Gym <span style={{fontWeight:400, color:T.sub}}>(optional)</span></span><button type="button" onClick={()=>{setGymId("");setData(d=>({...d,profile:{...(d.profile||{}),hideGymPicker:true}}));}} style={{marginLeft:"auto",padding:"3px 8px",background:"none",color:T.sub,fontSize:10.5,border:`1px solid ${T.line}`}}>Hide picker</button></div>
          <label style={lbl}>
            <GymPicker gyms={gyms} value={gymId} onChange={setGymId} onCreate={addGym} />
          </label>
          {!gymId && <div style={{fontSize:11.5, color:AMBER, marginTop:4, lineHeight:1.45}}>
            Choose a gym only if you use this machine at different locations.
            <span style={{display:"block", color:T.sub, marginTop:2}}>Turn this off in <b style={{color:T.ink}}>Settings → Features</b>.</span>
          </div>}
        </div>
      )}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <label style={lbl}>{isBW ? `+ Added weight (optional, ${uLabel(units)})` : `Weight (${uLabel(units)})`}
          <input type="number" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} placeholder={isBW ? "e.g. belt/vest" : ""} /></label>
        <label style={lbl}>Reps<input type="number" inputMode="numeric" value={reps} onChange={e=>setReps(e.target.value)} /></label>
      </div>
      {!isBW && exName && (
        <div style={{marginBottom:10}}>
          {drops.map((dr, i) => (
            <div key={i} style={{display:"grid", gridTemplateColumns:"1fr 1fr 44px", gap:10, marginBottom:8, alignItems:"end"}}>
              <label style={lbl}>Drop {i+1} weight ({uLabel(units)})
                <input type="number" inputMode="decimal" value={dr.weight} onChange={ev=>setDrops(a=>a.map((x,j)=>j===i?{...x, weight:ev.target.value}:x))} /></label>
              <label style={lbl}>Reps
                <input type="number" inputMode="numeric" value={dr.reps} onChange={ev=>setDrops(a=>a.map((x,j)=>j===i?{...x, reps:ev.target.value}:x))} /></label>
              <button type="button" onClick={()=>setDrops(a=>a.filter((_,j)=>j!==i))}
                style={{background:T.input, color:T.danger, border:`1px solid ${T.line}`, minHeight:44, borderRadius:10, fontSize:15}}>✕</button>
            </div>
          ))}
          <button type="button" onClick={()=>setDrops(a=>[...a, {weight:"", reps:""}])}
            style={{background:"none", border:`1px dashed ${T.line}`, color:T.sub, padding:"9px 14px", fontSize:13, fontWeight:600, borderRadius:10, width:"100%"}}>
            ⤵ Drop set — lowered the weight, kept going (saves inside this set)
          </button>
        </div>
      )}
      {usesPlates(exMap[exName]) && (
        <div style={{ background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:10, padding:"10px 12px", marginBottom:10, fontSize:13.5 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: (plateMode==="build" || weight>0) ? 9 : 0, flexWrap:"wrap" }}>
            <span style={{fontWeight:700}}>🏋️ Plates</span>
            <div className="seg">
              <button className={"seg-btn"+(plateMode==="weight"?" on":"")} onClick={()=>setPlateMode("weight")} style={{fontSize:12, padding:"5px 10px"}}>Show for weight</button>
              <button className={"seg-btn"+(plateMode==="build"?" on":"")} onClick={()=>setPlateMode("build")} style={{fontSize:12, padding:"5px 10px"}}>Tap what's loaded</button>
            </div>
            <select value={bar} onChange={e=>{ const nb=parseFloat(e.target.value); setBar(nb); if(plateMode==="build") setWeight(built.length? String(nb + 2*sumSide) : ""); }}
              style={{width:"auto", marginLeft:"auto", padding:"4px 26px 4px 8px", fontSize:12.5, minHeight:0}}>
              {barOpts.map(b=><option key={b} value={b}>{b===0 ? "no bar" : `${b} ${uLabel(units)} bar`}</option>)}
            </select>
          </div>

          {plateMode==="weight" ? (
            weight>0 ? (() => {
              const res = platesPerSide(parseFloat(weight), bar, plateSet);
              return (
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span style={{color:T.sub, fontSize:12.5}}>Load per side:</span>
                  {!res ? <span style={{color:T.sub}}>at or below the bar — no plates</span>
                    : <>
                      <span style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                        {res.plates.map((p,i)=>(<span key={i} style={{background:T.mint, color:T.green, borderRadius:6, padding:"1px 7px", fontWeight:700, fontSize:12.5}}>{p}</span>))}
                      </span>
                      {res.leftover > 0 && <span style={{color:T.sub, fontSize:12}}>(+{res.leftover} left over)</span>}
                    </>}
                </div>
              );
            })() : <div style={{color:T.sub, fontSize:12.5}}>Type a weight above and I'll show the plates to load.</div>
          ) : (
            <>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:9 }}>
                {plateSet.map(p=>(
                  <button key={p} onClick={()=>addPlate(p)} style={{ background:T.input, border:`1px solid ${T.line}`, color:T.ink, borderRadius:8, padding:"7px 12px", fontWeight:700, fontSize:13.5 }}>+{p}</button>
                ))}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{color:T.sub, fontSize:12.5}}>Per side:</span>
                {built.length ? (
                  <span style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                    {built.map((p,i)=>(<span key={i} style={{background:T.mint, color:T.green, borderRadius:6, padding:"1px 7px", fontWeight:700, fontSize:12.5}}>{p}</span>))}
                  </span>
                ) : <span style={{color:T.sub, fontSize:12.5}}>nothing yet — tap the plates on the bar</span>}
                {built.length>0 && <>
                  <button onClick={undoPlate} style={{ background:"none", color:T.sub, fontSize:12.5, textDecoration:"underline", padding:"0 4px", marginLeft:"auto" }}>undo</button>
                  <button onClick={clearPlates} style={{ background:"none", color:T.danger, fontSize:12.5, textDecoration:"underline", padding:"0 4px" }}>clear</button>
                </>}
              </div>
              <div style={{ marginTop:9, fontSize:15 }}>
                Total: <b style={{color:T.green, fontSize:17}}>{bar + 2*sumSide} {uLabel(units)}</b>
                <span style={{color:T.sub, fontSize:12, marginLeft:6}}>({bar} bar + {sumSide}×2)</span>
              </div>
            </>
          )}
        </div>
      )}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
        <label style={lbl}>Effort / Warm-up
          <select value={effort} onChange={e=>setEffort(e.target.value)}>
            <option value="">—</option>{EFFORTS.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label style={lbl}>Notes<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="optional" /></label>
      </div>
      <button onClick={addSet} disabled={!exName || !reps || (!isBW && !weight)} className="btn-primary"
        style={{ width:"100%", padding:"14px", fontSize:16 }}>
        Save set {setNum}
      </button>

      {justSaved && (
        <div style={{marginTop:12, textAlign:"center", fontSize:14}}>
          Saved: {justSaved.exercise} — set {justSaved.set}{justSaved.weight!=null?`, ${dispW(justSaved.weight,units)}×${justSaved.reps}`:`, ${justSaved.reps} reps`}
          {justSaved.drops?.length ? ` + ${justSaved.drops.length} drop${justSaved.drops.length===1?"":"s"}` : ""}
          {justSaved.pr && <span className="chip" style={{background:T.mint, color:T.green, marginLeft:8}}>🎉 New PR!</span>}
          <div style={{marginTop:8}}>
            <button onClick={sameAgain} style={{ background:T.input, border:`1px solid ${T.line}`, color:T.ink, padding:"8px 16px", fontSize:13.5, fontWeight:700 }}>
              ↻ Same again
            </button>
          </div>
        </div>
      )}
    </div>

    <div style={{marginBottom:14}}>
      {restDone && restLeft <= 0 && (
        <div className="card" style={{padding:"12px 16px",marginBottom:10,borderColor:T.green,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:15,fontWeight:800,color:T.green}}>✅ Rest done — next set!</span>
          {showRestOvertime&&<span style={{fontSize:16,fontWeight:900,color:T.ink,fontVariantNumeric:"tabular-nums"}}>+{Math.floor(restOver/60)}:{String(restOver%60).padStart(2,"0")}</span>}
          <button onClick={()=>{setRestDone(false);localStorage.removeItem("lt-rest-finished");}} style={{marginLeft:"auto",background:T.input,color:T.sub,padding:"6px 12px",fontSize:13,fontWeight:600}}>{showRestOvertime?"Done":"OK"}</button>
        </div>
      )}
      {restLeft>0&&(
        <div className="card" style={{padding:"12px 16px",marginBottom:10,borderColor:T.green}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:26,fontWeight:800,color:T.green,fontVariantNumeric:"tabular-nums",minWidth:74}}>{Math.floor(restLeft/60)}:{String(restLeft%60).padStart(2,"0")}</span>
            <span style={{fontSize:13,color:T.sub,flex:1}}>Rest timer</span>
            <button onClick={()=>{localStorage.setItem("lt-rest-end",String((restEndAt()||Date.now())+30000));setRestLeft(s=>s+30);}} style={{background:T.input,color:T.ink,border:"1px solid "+T.line,padding:"7px 12px",fontSize:13,fontWeight:600}}>+30s</button>
            <button onClick={stopRest} style={{background:T.input,color:T.sub,padding:"7px 12px",fontSize:13,fontWeight:600}}>Skip</button>
          </div>
          <div style={{height:5,background:T.input,borderRadius:99,marginTop:10,overflow:"hidden"}}>
            <div style={{height:"100%",width:(restDur>0?Math.min(100,restLeft/restDur*100):100)+"%",background:T.green,borderRadius:99,transition:"width 1s linear"}} />
          </div>
        </div>
      )}
      <div className="card" style={{padding:"11px 14px",marginBottom:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:12.5,color:T.ink,fontWeight:800}}>⏱ Rest timer</span>
          <span style={{fontSize:10.5,color:T.sub,flex:1}}>{restDur===0?"Off":"Auto-starts"}</span>
          <button type="button" onClick={()=>{setCustomRestMin("");setCustomRestSec("");setCustomRestOpen(v=>!v);}} style={{padding:"5px 8px",background:customRestOpen?T.mint:"none",border:"1px solid "+(customRestOpen?T.green:T.line),color:customRestOpen?T.green:T.sub,fontSize:10.5,fontWeight:750,whiteSpace:"nowrap"}}>Custom</button>
          {restDur>0&&<button type="button" onClick={()=>setShowRestOvertime(v=>!v)} style={{padding:"5px 8px",background:showRestOvertime?T.mint:"none",border:"1px solid "+(showRestOvertime?T.green:T.line),color:showRestOvertime?T.green:T.sub,fontSize:10.5,fontWeight:750,whiteSpace:"nowrap"}}>{showRestOvertime?"✓ Count up":"Count up"}</button>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${restChoices.length},minmax(0,1fr))`,gap:5}}>
          {restChoices.map(s=>(
            <button key={s} title={s===restDur&&customRestSelected?"Your custom rest time":undefined} onClick={()=>{setRestDur(s);if(s===0)stopRest();}} style={{minWidth:0,background:restDur===s?T.mint:T.input,color:restDur===s?T.green:T.sub,border:"1px solid "+(restDur===s?T.green:T.line),padding:"7px 2px",fontSize:11.5,fontWeight:800}}>{s===0?"Off":Math.floor(s/60)+":"+String(s%60).padStart(2,"0")}</button>
          ))}
        </div>
        {customRestOpen&&<div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:5,marginTop:7,paddingTop:7,borderTop:"1px solid "+T.line}}>
          <input aria-label="Custom rest minutes" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="5" value={customRestMin} onFocus={e=>e.target.select()} onChange={e=>setCustomRestMin(e.target.value.replace(/\D/g,"").slice(0,2))} style={{width:48,minHeight:36,padding:"5px 6px",textAlign:"center",fontSize:16}} />
          <span style={{fontSize:10.5,color:T.sub}}>min</span>
          <input aria-label="Custom rest seconds" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="00" value={customRestSec} onFocus={e=>e.target.select()} onChange={e=>setCustomRestSec(e.target.value.replace(/\D/g,"").slice(0,2))} style={{width:48,minHeight:36,padding:"5px 6px",textAlign:"center",fontSize:16}} />
          <span style={{fontSize:10.5,color:T.sub}}>sec</span>
          <button type="button" onClick={saveCustomRest} style={{padding:"7px 12px",background:T.green,color:"#061006",fontSize:11.5,fontWeight:850}}>Set</button>
        </div>}
      </div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Set history</div>
      <div style={{fontSize:12,color:T.sub,marginBottom:9}}>Tap any tracked set to load that exercise and its latest weight. Reps stay blank.</div>
      <input value={histQ} onChange={e=>{setHistQ(e.target.value); setHistLimit(50);}} placeholder="🔍 Filter by exercise or muscle…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:10}} />
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Date</th><th>Exercise</th><th style={{textAlign:"center"}}>Set</th><th style={{textAlign:"center"}}>Weight ({uLabel(units)})</th><th style={{textAlign:"center"}}>Reps</th><th>Effort</th><th></th></tr></thead>
          <tbody>{recent.map(e => { const isToday = e.date === todayStr(); const muscleQuick = !!e.muscleOnly; return (<Fragment key={e.id}>
            <tr onClick={()=>pickFromHistory(e)} onKeyDown={ev=>{if(!muscleQuick&&(ev.key==="Enter"||ev.key===" ")){ev.preventDefault();pickFromHistory(e);}}}
              role={muscleQuick?undefined:"button"} tabIndex={muscleQuick?undefined:0}
              title={muscleQuick?undefined:"Load exercise and latest weight"}
              style={{...(isToday ? {background:"rgba(var(--accent-rgb),.05)"} : {}),cursor:muscleQuick?"default":"pointer"}}>
              <td>{isToday ? <span style={{color:"#00A804", fontWeight:800}}>Today</span> : fmtDate(e.date)}</td><td>{muscleQuick ? <span><b style={{color:T.green}}>⚡ {e.muscle}</b><span style={{display:"block", fontSize:10, color:T.sub}}>muscle-only</span></span> : e.exercise}</td><td style={{textAlign:"center"}}>{muscleQuick ? `${setCountOf(e)} total` : e.set}</td>
              <td style={{textAlign:"center"}}>{e.quick ? "—" : e.weight==null ? "BW" : dispW(e.weight, units)}{e.drops?.length ? <span style={{color:T.sub}}>{" ↘ "}{e.drops.map(dr=>dispW(dr.weight, units)).join(" ↘ ")}</span> : null}</td>
              <td style={{textAlign:"center"}}>{e.quick ? <span title="Quick workout — no weight or reps tracked" style={{color:T.sub}}>{muscleQuick ? "quick" : "🧮 quick"}</span> : <>{e.reps}{e.drops?.length ? <span style={{color:T.sub}}>{" / "}{e.drops.map(dr=>dr.reps).join(" / ")}</span> : null}</>}</td>
              <td style={{color:T.sub}}>{e.effort||""}</td>
              <td onClick={ev=>ev.stopPropagation()} onKeyDown={ev=>ev.stopPropagation()} style={{whiteSpace:"nowrap"}}>
                {String(e.notes||"").trim() && (
                  <button className="note-btn" onClick={()=>setNoteOpen(o=>o===e.id?null:e.id)}
                    style={{background:"none", color:T.green, fontSize:12.5, fontWeight:700, padding:"4px 6px"}}>
                    <span className="note-caret" style={{display:"inline-block", transform: noteOpen===e.id?"rotate(90deg)":"none"}}>▸</span> Note
                  </button>
                )}
                <PencilBtn onClick={()=>setEdit(muscleQuick
                  ? { id:e.id, date:e.date, exercise:e.exercise, muscle:e.muscle, sets:setCountOf(e), muscleOnly:true }
                  : { id:e.id, date:e.date, exercise:e.exercise, set:e.set, weight:e.weight==null ? "" : dispW(e.weight, units), reps:e.reps, effort:e.effort||"", notes:e.notes||"", gym:e.gym||"" })} />
                <ConfirmX onConfirm={()=>setData(d=>({...d, log:d.log.filter(x=>x.id!==e.id)}))} />
              </td>
            </tr>
            {noteOpen === e.id && (
              <tr><td colSpan={7} style={{padding:"4px 6px 10px"}}>
                <div className="note-reveal" style={noteBox}><span style={{flexShrink:0}}>📝</span><span>{e.notes}</span></div>
              </td></tr>
            )}
            {edit?.id === e.id && (
              <tr><td colSpan={7} style={{padding:"6px 4px"}}>
                <div style={editBox}>
                  {edit.muscleOnly ? <>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10}}>
                      <DateField label="Date" value={edit.date} max={todayStr()} onChange={v=>setEdit(s=>({...s, date:v}))} />
                      <label style={lbl}>Sets<input type="number" inputMode="numeric" min="1" max="50" value={edit.sets} onChange={ev=>setEdit(s=>({...s, sets:ev.target.value}))} /></label>
                    </div>
                    <label style={{...lbl, marginBottom:10, display:"block"}}>Muscle group
                      <select value={edit.muscle} onChange={ev=>setEdit(s=>({...s, muscle:ev.target.value}))}>{MUSCLES.map(m=><option key={m}>{m}</option>)}</select>
                    </label>
                    <div style={{display:"flex", gap:8}}>
                      <button onClick={saveEdit} disabled={!editValid} style={{...saveSm, opacity:editValid?1:0.45}}>Save changes</button>
                      <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                    </div>
                  </> : <>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8}}>
                    <DateField label="Date" value={edit.date} max={todayStr()} onChange={v=>setEdit(s=>({...s, date:v}))} />
                    <label style={lbl}>Set #<input type="number" min="1" value={edit.set} onChange={ev=>setEdit(s=>({...s, set:ev.target.value}))} /></label>
                  </div>
                  <label style={{...lbl, marginBottom:8, display:"block"}}>Exercise
                    <select value={edit.exercise} onChange={ev=>setEdit(s=>({...s, exercise:ev.target.value}))}>
                      {MUSCLES.map(m => (
                        <optgroup key={m} label={m}>
                          {data.exercises.filter(x=>muscleOf(x)===m).map(x=><option key={x.name}>{x.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  {editIsMachine && (
                    <label style={{...lbl, marginBottom:8, display:"block"}}>🏢 Gym
                      <GymPicker gyms={gyms} value={edit.gym} onChange={v=>setEdit(s=>({...s, gym:v}))} onCreate={(name)=>{
                        const g = { id: Math.random().toString(36).slice(2), name };
                        setData(d => ({ ...d, gyms: [...(d.gyms || []), g] }));
                        setEdit(s => ({ ...s, gym: g.id }));
                      }} />
                    </label>
                  )}
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8}}>
                    <label style={lbl}>{editIsBW ? "+ Added weight (optional)" : `Weight (${uLabel(units)})`}<input type="number" inputMode="decimal" value={edit.weight} onChange={ev=>setEdit(s=>({...s, weight:ev.target.value}))} /></label>
                    <label style={lbl}>Reps<input type="number" inputMode="numeric" value={edit.reps} onChange={ev=>setEdit(s=>({...s, reps:ev.target.value}))} /></label>
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10}}>
                    <label style={lbl}>Effort
                      <select value={edit.effort} onChange={ev=>setEdit(s=>({...s, effort:ev.target.value}))}>
                        <option value="">—</option>{EFFORTS.map(x=><option key={x}>{x}</option>)}
                      </select>
                    </label>
                    <label style={lbl}>Notes<input value={edit.notes} onChange={ev=>setEdit(s=>({...s, notes:ev.target.value}))} /></label>
                  </div>
                  <div style={{display:"flex", gap:8}}>
                    <button onClick={saveEdit} disabled={!editValid} style={{...saveSm, opacity:editValid?1:0.45}}>Save changes</button>
                    <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                  </div>
                  </>}
                </div>
              </td></tr>
            )}
          </Fragment>);})}
            {!recent.length && <tr><td colSpan={7} style={{color:T.sub}}>{searching ? "No sets match that exercise." : "Nothing logged yet — your first set goes here."}</td></tr>}
          </tbody>
        </table>
      </div>
      {!searching && histFull.length > recent.length && (
        <div style={{display:"flex", gap:8, marginTop:12}}>
          <button onClick={()=>setHistLimit(l=>l+50)} style={{flex:1, background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"10px", fontWeight:700, fontSize:13, borderRadius:10}}>
            Show more ({histFull.length - recent.length} older)
          </button>
          <button onClick={()=>setHistLimit(histFull.length)} style={{background:"none", color:T.sub, padding:"10px 14px", fontWeight:700, fontSize:13}}>Show all</button>
        </div>
      )}
    </div>
    {visualOpen && <ExerciseVisualModal exercise={visualOpen} onClose={()=>setVisualOpen(null)} />}
  </>);
}
const lbl = { display:"block", fontSize:12.5, fontWeight:600, color:"#A9BDBA", marginBottom:0 };

/* Feather-light inline SVG sparkline — no chart library needed (safe for the Log tab). */
function Spark({ pts, w = 88, h = 26 }) {
  if (!pts || pts.length < 2) return <span style={{ color: T.sub, fontSize: 11 }}>—</span>;
  const min = Math.min(...pts), max = Math.max(...pts), span = (max - min) || 1;
  const step = w / (pts.length - 1);
  const color = pts[pts.length - 1] >= pts[0] ? T.green : T.down;
  const xy = pts.map((v, i) => [i * step, h - 3 - (v - min) / span * (h - 6)]);
  const last = xy[xy.length - 1];
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <polyline points={xy.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}
        fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}

/* Horizontal progress bar with a highlighted target zone (weekly sets). */
function QuickWorkoutLogger({ defaultDate, exercises, onSave, onAddExercise, minimized, onMinimizedChange }) {
  const open = !minimized;
  const [date, setDate] = useState(defaultDate || todayStr());
  const [counts, setCounts] = useState(() => Object.fromEntries(MUSCLES.map(m=>[m,0])));
  const [saved, setSaved] = useState(false);
  const total = MUSCLES.reduce((sum,m)=>sum+(counts[m]||0),0);
  const selected = MUSCLES.filter(m=>(counts[m]||0)>0);
  const bump = (muscle, delta) => {
    setSaved(false);
    setCounts(cur => {
      const current = cur[muscle]||0;
      const next = delta > 0 && current === 0 ? 3 : current + delta;
      return { ...cur, [muscle]:Math.max(0, Math.min(50, next)) };
    });
  };
  const save = () => {
    if (!total) return;
    onSave(date, counts);
    setCounts(Object.fromEntries(MUSCLES.map(m=>[m,0])));
    setSaved(true);
  };
  if (!open) return (
    <div className="card compact-card" style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:16}}>⚡</span>
      <div className="h" style={{fontSize:14,color:T.tealDk,whiteSpace:"nowrap"}}>Quick workout</div>
      <span style={{fontSize:11,color:T.sub,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Muscles + sets only</span>
      <button onClick={()=>onMinimizedChange?.(false)} title="Open quick workout" aria-label="Open quick workout" aria-expanded={false} style={showSectionBtn}>Show</button>
    </div>
  );
  return (
    <div className="card" style={{borderColor:"rgba(var(--accent-rgb),.38)"}}>
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <div style={{minWidth:0, flex:1}}>
          <div className="h" style={{fontSize:18, color:T.tealDk}}>⚡ Quick workout</div>
        </div>
        <button onClick={()=>onMinimizedChange?.(true)} title="Minimize quick workout" aria-label="Minimize quick workout" aria-expanded={true} style={minimizeBtn}>➖</button>
      </div>
      <>
        <div style={{fontSize:12, color:T.sub, lineHeight:1.45, margin:"5px 0 12px"}}>For days you only want to track what you trained. It fills your calendar, streak, muscle charts, weekly goals, and group activity—never strength records.</div>
        <div style={{maxWidth:230, marginBottom:11}}><DateField label="Workout date" value={date} max={todayStr()} onChange={v=>{setDate(v);setSaved(false);}} /></div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:8}}>
          {MUSCLES.map((muscle,i)=>{
            const n=counts[muscle]||0, active=n>0;
            return <div key={muscle} style={{display:"grid", gridTemplateColumns:"minmax(0,1fr) 30px 30px 30px", alignItems:"center", gap:3, padding:"8px 8px 8px 10px", background:active?"rgba(var(--accent-rgb),.11)":T.input, border:`1px solid ${active?MUSCLE_COLORS[i]:T.line}`, borderRadius:11}}>
              <span style={{fontSize:12.5, fontWeight:800, color:active?T.ink:T.sub, overflow:"hidden", textOverflow:"ellipsis"}}>{muscle}</span>
              <button onClick={()=>bump(muscle,-1)} disabled={!active} aria-label={`Remove one ${muscle} set`} style={{width:28,height:28,padding:0,borderRadius:8,background:T.card,color:active?T.ink:T.line,border:`1px solid ${T.line}`,fontSize:16}}>−</button>
              <span style={{textAlign:"center",fontSize:14,fontWeight:900,color:active?T.green:T.sub,fontVariantNumeric:"tabular-nums"}}>{n}</span>
              <button onClick={()=>bump(muscle,1)} aria-label={`Add or increase ${muscle} sets`} style={{width:28,height:28,padding:0,borderRadius:8,background:active?T.mint:T.card,color:T.green,border:`1px solid ${active?T.green:T.line}`,fontSize:16}}>+</button>
            </div>;
          })}
        </div>
        <button onClick={save} disabled={!total} className="btn-primary" style={{width:"100%", padding:"13px", marginTop:11, fontSize:14.5, opacity:total?1:.45}}>Save {total || ""} set{total===1?"":"s"}{selected.length?` · ${selected.length<=2?selected.join(" + "):`${selected.length} muscle groups`}`:""}</button>
        {saved && <div style={{fontSize:12.5,color:T.green,fontWeight:800,textAlign:"center",marginTop:8}}>✓ Quick workout saved everywhere</div>}
        <details style={{marginTop:12}}>
          <summary style={{cursor:"pointer", listStyle:"none", background:"linear-gradient(110deg,rgba(var(--accent-rgb),.14),rgba(var(--accent-rgb),.04))", border:`1px solid rgba(var(--accent-rgb),.42)`, borderRadius:12, padding:"11px 12px", userSelect:"none"}}>
            <span style={{display:"flex", alignItems:"center", gap:10}}>
              <span style={{display:"grid", placeItems:"center", width:32, height:32, borderRadius:9, flexShrink:0, background:T.mint, color:T.green, fontSize:16}}>🏋️</span>
              <span style={{flex:1, minWidth:0}}>
                <span style={{display:"block", color:T.green, fontSize:13.5, fontWeight:850, lineHeight:1.2}}>Know the exercises?</span>
                <span style={{display:"block", color:T.sub, fontSize:11.5, fontWeight:650, marginTop:2}}>Add the exercise and exact set count instead</span>
              </span>
              <span style={{color:T.green, fontSize:15, fontWeight:900, flexShrink:0}}>▾</span>
            </span>
          </summary>
          <div style={{marginTop:8, background:T.input, border:`1px solid ${T.line}`, borderRadius:12, padding:10}}><QuickAddSets exercises={exercises} onAdd={onAddExercise} /></div>
        </details>
      </>
    </div>
  );
}

/* Dropdown-only "quick add sets" — pick the exercise, pick how many, tap Add. No typing,
   no separate flow: it writes real log entries (flagged `quick`) so it automatically
   shows up everywhere the Log tab's sets do — the calendar, 30-day chart, streaks, this
   week's target — without any extra wiring. Kept out of weight/PR-based views on purpose
   (bestEst1RM, "last time", the Dashboard trend chart) since there's no real weight/reps
   behind it, just a count. */
function QuickAddSets({ exercises, onAdd }) {
  const [ex, setEx] = useState("");
  const [n, setN] = useState("3");
  const add = () => { if (!ex) return; onAdd(ex, parseInt(n)); setEx(""); };
  return (
    <div style={{display:"flex", gap:9, flexWrap:"wrap", alignItems:"flex-end", width:"100%"}}>
      <label style={{...lbl, flex:"1 1 220px", minWidth:0}}>Exercise
        <select value={ex} onChange={e=>setEx(e.target.value)} aria-label="Exercise to add sets for" style={{width:"100%", maxWidth:"100%", height:44, marginTop:5, fontSize:13.5, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", borderColor:ex?T.green:T.line}}>
          <option value="">— pick an exercise —</option>
          {MUSCLES.map(m => (
            <optgroup key={m} label={m}>
              {exercises.filter(x=>muscleOf(x)===m).map(x=><option key={x.name}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label style={{...lbl, flex:"1 1 104px", maxWidth:130}}>Sets
        <select value={n} onChange={e=>setN(e.target.value)} aria-label="Number of sets" style={{width:"100%", height:44, marginTop:5, textAlign:"center", fontSize:14.5, fontWeight:900, color:T.green, background:T.card, border:`1px solid ${T.green}`}}>
          {Array.from({length:10}, (_,i)=>i+1).map(v => <option key={v} value={v}>{v} set{v>1?"s":""}</option>)}
        </select>
      </label>
      <button onClick={add} disabled={!ex} style={{height:44, background:T.green, color:"#000", fontWeight:850, fontSize:13.5, padding:"0 19px", borderRadius:10, opacity:ex?1:0.45, flex:"1 1 92px", maxWidth:130}}>+ Add</button>
    </div>
  );
}

function TargetBar({ muscle, count, color, goal = 12, max = 20, open, onHover, onLeave, onToggle }) {
  const pct = Math.min(count, max) / max * 100;
  const goalPct = Math.min(goal, max) / max * 100;
  const status = count < goal ? `${goal-count} under` : count === goal ? "goal hit" : `${count-goal} over`;
  const reached = count >= goal;
  const [goalTip, setGoalTip] = useState(null); // null | "hover" | "pinned"
  const wrapRef = useRef(null);
  useEffect(() => {
    if (goalTip !== "pinned") return;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setGoalTip(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [goalTip]);
  return (
    <div ref={wrapRef} style={{position:"relative", minWidth:0, height:28, zIndex:goalTip?12:"auto"}}>
      <button type="button" onClick={onToggle} onMouseEnter={onHover} onMouseLeave={onLeave} onFocus={onHover} onBlur={onLeave} aria-expanded={open} aria-label={`${muscle}: ${count} of ${goal} sets — ${status}. Tap for exercise breakdown.`} style={{display:"block", width:"100%", height:28, padding:0, background:"none", border:0, overflow:"visible", cursor:"pointer", position:"relative"}}>
        <span style={{position:"absolute", left:0, right:0, top:12, height:10, background:T.input, borderRadius:99, overflow:"hidden", boxShadow:"0 1px 0 rgba(255,255,255,.04) inset"}}>
          <span style={{display:"block", width:`${pct}%`, height:"100%", background:color, borderRadius:99, transition:"width .6s ease"}} />
        </span>
        <span aria-hidden="true" style={{position:"absolute", zIndex:1, left:`calc(${goalPct}% - 1px)`, top:8, width:2, height:18, background:goalTip?T.green:T.ink, borderRadius:99, boxShadow:goalTip?`0 0 0 2px ${T.card}, 0 0 12px rgba(var(--accent-rgb),.9)`:`0 0 0 2px ${T.card}, 0 0 8px rgba(255,255,255,.22)`, transition:"background .16s ease, box-shadow .18s ease"}} />
        <span aria-hidden="true" style={{position:"absolute", zIndex:2, left:`calc(${pct}% - 11px)`, top:0, minWidth:22, height:22, padding:"0 4px", borderRadius:99, display:"flex", alignItems:"center", justifyContent:"center", boxSizing:"border-box", background:reached?T.green:T.card, color:reached?"#07110D":T.ink, border:`1px solid ${open?T.green:(reached?T.green:color)}`, fontSize:11, fontWeight:900, fontVariantNumeric:"tabular-nums", boxShadow:open?`0 0 0 3px ${T.mint}, 0 5px 16px rgba(0,0,0,.34)`:`0 0 0 2px ${T.card}, 0 4px 12px rgba(0,0,0,.28)`, transition:"left .6s ease, background .2s ease, box-shadow .2s ease"}}>{count}</span>
      </button>
      <button type="button" aria-label={`${muscle} goal: ${goal} sets`} aria-expanded={!!goalTip}
        onClick={e=>{ e.stopPropagation(); setGoalTip(cur=>cur==="pinned"?null:"pinned"); }}
        onMouseEnter={()=>setGoalTip(cur=>cur==="pinned"?cur:"hover")}
        onMouseLeave={()=>setGoalTip(cur=>cur==="pinned"?cur:null)}
        onFocus={()=>setGoalTip(cur=>cur==="pinned"?cur:"hover")}
        onBlur={()=>setGoalTip(cur=>cur==="pinned"?cur:null)}
        style={{position:"absolute", zIndex:4, left:`calc(${goalPct}% - 13px)`, top:3, width:26, height:25, padding:0, background:"transparent", border:0, borderRadius:8, cursor:"help"}} />
      {goalTip && (
        <div role="tooltip" style={{position:"absolute", zIndex:8, left:`clamp(65px, ${goalPct}%, calc(100% - 65px))`, bottom:31, transform:"translateX(-50%)", minWidth:126, padding:"8px 10px", background:`linear-gradient(155deg, color-mix(in srgb, ${T.card} 90%, var(--accent) 10%), ${T.card})`, border:`1px solid ${T.green}`, borderRadius:10, boxShadow:"0 14px 34px rgba(0,0,0,.5)", pointerEvents:"none", animation:"memberMenuIn .18s cubic-bezier(.16,1,.3,1) both", whiteSpace:"nowrap"}}>
          <div style={{display:"flex", alignItems:"center", gap:7}}><span style={{color:T.green, fontSize:13}}>🎯</span><span style={{fontSize:11, color:T.sub, fontWeight:750}}>WEEKLY GOAL</span></div>
          <div style={{fontSize:13, color:T.ink, fontWeight:900, marginTop:2}}>{goal} credited sets</div>
          <span aria-hidden="true" style={{position:"absolute", left:"50%", bottom:-5, width:9, height:9, background:T.card, borderRight:`1px solid ${T.green}`, borderBottom:`1px solid ${T.green}`, transform:"translateX(-50%) rotate(45deg)"}} />
        </div>
      )}
    </div>
  );
}

const fmtSets = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
function TargetBreakdown({ muscle, rows, count, goal, color }) {
  const status = count < goal ? `${fmtSets(goal-count)} under` : count === goal ? "Goal hit" : `${fmtSets(count-goal)} over`;
  return (
    <div style={{margin:"5px 0 12px", padding:"11px 12px", background:`linear-gradient(145deg, ${T.input}, ${T.card})`, border:`1px solid ${count>=goal?T.green:T.line}`, borderRadius:12, boxShadow:"0 10px 26px rgba(0,0,0,.16)"}}>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:rows.length?9:0}}>
        <span style={{width:9, height:9, borderRadius:99, background:color, flexShrink:0}} />
        <b style={{fontSize:13, color:T.ink}}>{muscle}</b>
        <span style={{marginLeft:"auto", fontSize:12, fontWeight:800, color:count>=goal?T.green:T.ink}}>{fmtSets(count)} / {goal} sets · {status}</span>
      </div>
      {rows.length ? <div style={{display:"flex", flexDirection:"column", gap:0, maxHeight:190, overflowY:"auto"}}>
        {rows.map(row => <div key={`${row.exercise}-${row.credit}`} style={{display:"grid", gridTemplateColumns:"minmax(0,1fr) auto", gap:10, alignItems:"center", padding:"7px 0", borderTop:`1px solid ${T.line}`}}>
          <div style={{minWidth:0}}><div style={{fontSize:12, color:T.ink, fontWeight:700, lineHeight:1.25, overflowWrap:"anywhere"}}>{row.exercise}</div><div style={{fontSize:10, color:T.sub, marginTop:2}}>{row.muscleOnly?"Quick workout · full set credit each":row.credit===0.5?"Secondary muscle · ½ set credit each":"Main muscle · full set credit each"}</div></div>
          <div style={{textAlign:"right", whiteSpace:"nowrap"}}><b style={{fontSize:12.5, color:T.ink}}>{fmtSets(row.total)}</b><div style={{fontSize:9.5, color:T.sub}}>{row.logged} logged × {row.credit===0.5?"½":"1"}</div></div>
        </div>)}
      </div> : <div style={{fontSize:11.5, color:T.sub}}>No working sets for {muscle.toLowerCase()} have been logged this week.</div>}
    </div>
  );
}

/* Small pencil button that opens an inline editor. */
function PencilBtn({ onClick }) {
  return (
    <button onClick={onClick} title="Edit" style={{ background:"none", color:T.sub, fontSize:14, padding:"2px 7px" }}>
      ✎
    </button>
  );
}

/* ---------- custom Robinhood-themed date picker ----------
   Replaces the native <input type=date> (whose OS popup ignores our theme and looks
   terrible on black). Same contract: value/onChange use "YYYY-MM-DD" strings; max/min
   clamp which days are selectable. Works with mouse and touch. */
const CAL_DOW = ["S","M","T","W","T","F","S"];
const calNav = (disabled) => ({ background:T.input, color:disabled?T.line:T.ink, width:32, height:32,
  borderRadius:9, fontSize:19, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center",
  opacity:disabled?0.5:1 });
function DateField({ label, value, onChange, max, min }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState((value || todayStr()).slice(0,7)); // "YYYY-MM"
  const wrapRef = useRef(null);
  const pad = (n) => String(n).padStart(2,"0");

  // Each animated .card is its own stacking context. iOS Safari was painting the next
  // card over the portion of this popover that extends below its owning card, so lift
  // the entire card while the calendar is open (the popover's own z-index cannot escape
  // its parent stacking context). Restore the original inline value on close/unmount.
  useEffect(() => {
    if (!open) return;
    const card = wrapRef.current?.closest(".card");
    if (!card) return;
    const previous = card.style.zIndex;
    card.style.zIndex = "45";
    return () => { card.style.zIndex = previous; };
  }, [open]);

  useEffect(() => { if (open) setView((value || todayStr()).slice(0,7)); }, [open]); // reopen on the selected month
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const [vy, vm] = view.split("-").map(Number);
  const title = new Date(vy, vm-1, 1).toLocaleString("en-US", { month:"long", year:"numeric" });
  const firstDow = new Date(vy, vm-1, 1).getDay();
  const nDays = new Date(vy, vm, 0).getDate();
  const shift = (n) => { const d = new Date(vy, vm-1+n, 1); setView(`${d.getFullYear()}-${pad(d.getMonth()+1)}`); };
  const nextDisabled = max ? view >= max.slice(0,7) : false;
  const prevDisabled = min ? view <= min.slice(0,7) : false;
  const fmtLong = (s) => new Date(s+"T00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });

  const pick = (day) => {
    const ds = `${vy}-${pad(vm)}-${pad(day)}`;
    if ((max && ds > max) || (min && ds < min)) return;
    onChange(ds); setOpen(false);
  };

  const cells = [];
  for (let i=0;i<firstDow;i++) cells.push(null);
  for (let d=1;d<=nDays;d++) cells.push(d);

  return (
    <div ref={wrapRef} style={{ position:"relative", zIndex:open?46:"auto" }}>
      {label && <div style={{...lbl, marginBottom:4}}>{label}</div>}
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{
        display:"flex", alignItems:"center", gap:8, width:"100%", minHeight:44,
        background:T.input, color:value?T.ink:T.sub, border:`1px solid ${open?T.green:T.line}`,
        borderRadius:10, padding:"9px 11px", fontSize:15, fontWeight:600,
        boxShadow: open?"0 0 0 3px rgba(var(--accent-rgb),.18)":"none", transition:"border-color .18s ease, box-shadow .22s ease",
      }}>
        <span style={{fontSize:15, lineHeight:1}}>📅</span>
        <span style={{flex:1, textAlign:"left", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{value ? fmtLong(value) : "Select date"}</span>
        <span style={{color:T.sub, fontSize:10, transform:open?"rotate(180deg)":"none", transition:"transform .2s ease"}}>▼</span>
      </button>

      {open && (
        <div className="cal-pop" style={{
          position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:40,
          width:268, maxWidth:"calc(100vw - 32px)",
          background:T.card, border:`1px solid ${T.creamLine}`, borderRadius:14, padding:12,
          boxShadow:"0 18px 50px rgba(0,0,0,.55)",
        }}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
            <button type="button" className="cal-nav" disabled={prevDisabled} onClick={()=>shift(-1)} style={calNav(prevDisabled)}>‹</button>
            <div style={{fontSize:14, fontWeight:800, color:T.ink}}>{title}</div>
            <button type="button" className="cal-nav" disabled={nextDisabled} onClick={()=>shift(1)} style={calNav(nextDisabled)}>›</button>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4}}>
            {CAL_DOW.map((w,i)=>(<div key={i} style={{textAlign:"center", fontSize:10.5, fontWeight:700, color:T.sub, padding:"2px 0"}}>{w}</div>))}
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2}}>
            {cells.map((d,i)=>{
              if (d==null) return <div key={i} />;
              const ds = `${vy}-${pad(vm)}-${pad(d)}`;
              const off = (max && ds>max) || (min && ds<min);
              const sel = ds===value, today = ds===todayStr();
              return (
                <button key={i} type="button" className={"cal-day"+(off?" cal-off":"")+(sel?" cal-sel":"")}
                  disabled={off} onClick={()=>pick(d)} style={{
                    height:34, borderRadius:99, background: sel?T.green:"transparent",
                    color: off?T.line : sel?"#000" : today?T.green : T.ink,
                    border: today&&!sel?`1.5px solid ${T.green}`:"1.5px solid transparent",
                    fontWeight: sel||today?800:600, fontSize:13.5,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    opacity: off?0.45:1, cursor: off?"default":"pointer",
                  }}>{d}</button>
              );
            })}
          </div>
          <button type="button" onClick={()=>{ const t=todayStr(); if ((!max||t<=max)&&(!min||t>=min)) onChange(t); setOpen(false); }}
            style={{ width:"100%", marginTop:10, padding:"9px", background:T.mint, color:T.green, fontWeight:800, fontSize:13, borderRadius:10 }}>
            Jump to today
          </button>
        </div>
      )}
    </div>
  );
}
const saveSm = { background:T.green, color:"#000", fontWeight:700, padding:"9px 18px", fontSize:13.5 };
const cancelSm = { background:"none", border:`1px solid ${T.line}`, color:T.sub, padding:"9px 14px", fontSize:13.5 };
const minimizeBtn = { background:"none", border:"1px solid transparent", color:T.sub, fontSize:15, lineHeight:1, width:36, height:36, padding:0, borderRadius:9, flexShrink:0 };
const showSectionBtn = { flexShrink:0, background:T.input, border:`1px solid ${T.line}`, color:T.green, fontWeight:800, fontSize:11.5, minHeight:32, padding:"4px 11px", borderRadius:99 };
const editBox = { background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:10, padding:12 };
const noteInput = { display:"block", width:"100%", marginTop:5, resize:"vertical", minHeight:44,
  background:T.input, color:T.ink, border:`1px solid ${T.line}`, borderRadius:10, padding:"9px 11px",
  fontSize:14, fontFamily:"inherit", lineHeight:1.4, boxSizing:"border-box" };
const noteBox = { display:"flex", gap:9, alignItems:"flex-start",
  background:"rgba(var(--accent-rgb),.06)", border:`1px solid ${T.creamLine}`,
  borderLeft:`3px solid ${T.green}`, borderRadius:10, padding:"10px 12px" };

/* Destructive actions confirm in a fixed popover. Keeping the trigger in place avoids
   resizing table rows on desktop or widening horizontally-scrolled tables on phones. */
function ConfirmX({ onConfirm, label, subject }) {
  const [armed, setArmed] = useState(false);
  const [pos, setPos] = useState(null);
  const [target, setTarget] = useState("");
  const btnRef = useRef(null);
  useEffect(() => {
    if (!armed) return;
    const close = () => setArmed(false);
    const onKey = e => { if (e.key === "Escape") close(); };
    const t = setTimeout(close, 8000);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [armed]);
  const action = label || "Delete";
  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.max(12, Math.min((r?.right || window.innerWidth/2) - width, window.innerWidth - width - 12));
    const below = (r?.bottom || window.innerHeight/2) + 8;
    const above = below + 132 > window.innerHeight - 12;
    const top = above ? null : below;
    const bottom = above ? Math.max(12, window.innerHeight-(r?.top||window.innerHeight/2)+8) : null;
    const anchorX = Math.max(18, Math.min(width-18, ((r?.left||0)+(r?.width||0)/2)-left));
    let inferred = subject || "";
    if (!inferred) {
      const row = btnRef.current?.closest("tr");
      if (row) inferred = [...row.children].slice(0,-1).map(c=>c.innerText.trim().replace(/\s+/g," ")).filter(Boolean).join(" · ");
      else {
        const chip = btnRef.current?.closest(".chip");
        if (chip) inferred = chip.innerText.replace(/[✕✎✏]/g,"").trim().replace(/\s+/g," ");
      }
    }
    setTarget(inferred); setPos({left, top, bottom, width, above, anchorX}); setArmed(true);
  };
  return (<>
    <button ref={btnRef} type="button" onClick={open} aria-label={action} aria-expanded={armed} title={`${action}…`} style={ label
      ? { background:armed?"rgba(255,70,70,.12)":"none", border:`1px solid ${armed?T.danger:T.line}`, color:armed?T.danger:T.sub, fontSize:12, fontWeight:700, minHeight:36, padding:"6px 13px", borderRadius:99, whiteSpace:"nowrap" }
      : { background:armed?"rgba(255,70,70,.12)":"none", border:`1px solid ${armed?T.danger:"transparent"}`, color:armed?T.danger:T.sub, fontSize:16, lineHeight:1, width:36, height:36, padding:0, borderRadius:9 } }>
      {label || "✕"}
    </button>
    {armed && pos && createPortal(
      <div onPointerDown={()=>setArmed(false)} style={{position:"fixed",inset:0,zIndex:12000,background:"transparent"}}>
        <div role="dialog" aria-label={`${action} confirmation`} onPointerDown={e=>e.stopPropagation()} style={{position:"fixed",left:pos.left,top:pos.top??"auto",bottom:pos.bottom??"auto",width:pos.width,boxSizing:"border-box",background:T.card,border:`1px solid ${T.line}`,borderRadius:14,padding:12,boxShadow:"0 16px 42px rgba(0,0,0,.58)",animation:"fadeSwap .15s ease-out both"}}>
          <span aria-hidden="true" style={{position:"absolute",left:pos.anchorX-6,[pos.above?"bottom":"top"]:-7,width:12,height:12,background:T.card,transform:"rotate(45deg)",borderLeft:pos.above?"none":`1px solid ${T.line}`,borderTop:pos.above?"none":`1px solid ${T.line}`,borderRight:pos.above?`1px solid ${T.line}`:"none",borderBottom:pos.above?`1px solid ${T.line}`:"none"}} />
          <div style={{fontSize:13.5,fontWeight:800,color:T.ink}}>{action === "Delete" ? "Delete this entry?" : `${action}?`}</div>
          {target && <div style={{fontSize:11.5,color:T.sub,lineHeight:1.4,margin:"3px 0 10px",overflowWrap:"anywhere"}}>{target}</div>}
          {!target && <div style={{height:10}} />}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button type="button" onClick={()=>setArmed(false)} style={{background:T.input,border:`1px solid ${T.line}`,color:T.ink,fontSize:13,fontWeight:750,minHeight:40,padding:"8px 10px",borderRadius:10}}>Back</button>
            <button type="button" onClick={()=>{setArmed(false);onConfirm?.();}} style={{background:T.danger,color:"#fff",fontSize:13,fontWeight:850,minHeight:40,padding:"8px 10px",borderRadius:10,overflow:"hidden",textOverflow:"ellipsis"}}>{action}</button>
          </div>
        </div>
      </div>, document.body)}
  </>);
}

/* Reusable searchable dropdown. Renders its own trigger via `renderButton` and a
   fixed-position, viewport-clamped menu through a portal on <body> — so a transformed
   or overflow-scrolled ancestor can't offset or clip it. Used by the group strength
   header pickers and the Logs exercise field. items: [{ value, label, sub, selected }]. */
function DropdownPicker({ renderButton, items, onPick, footer, placeholder = "Search…", emptyHint, desiredWidth = 230, matchWidth = false }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const [query, setQuery] = useState("");
  const btnRef = useRef(null);
  const inputRef = useRef(null);
  // The search box autofocuses ~40ms after opening. On iOS, that first-ever keyboard
  // raise animates in slowly (300-800ms+) and the page auto-scrolls repeatedly while it
  // does, to keep the input visible — each of those is a real "scroll" event fired on
  // `document`/`window` (no `.closest()`, so the old check always treated it as an
  // outside scroll and slammed the menu shut mid-animation). A SECOND open right after
  // is fast because the keyboard is already up, which is why it "worked on attempt 2".
  // Rather than guess a fixed timeout, keep pushing the grace deadline out for as long as
  // the visual viewport is actively resizing (the keyboard animation), capped so a
  // deliberate later scroll still closes the menu.
  const graceUntilRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    graceUntilRef.current = Date.now() + 600;
    const onDown = (e) => { if (btnRef.current && !btnRef.current.contains(e.target) && !e.target.closest?.("[data-lift-menu]")) setOpen(false); };
    // Close when the PAGE scrolls, but NOT when the menu's own list is scrolled, and NOT
    // during the keyboard-opening grace window.
    const onScroll = (e) => {
      if (Date.now() < graceUntilRef.current) return;
      if (e.target instanceof Element && e.target.closest("[data-lift-menu]")) return;
      setOpen(false);
    };
    // Only close on a real resize (orientation) — NOT the phone keyboard opening on autofocus.
    const w0 = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== w0) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("resize", onResize); window.removeEventListener("scroll", onScroll, true); };
  }, [open]);
  useEffect(() => { if (!open) return; setQuery(""); const t = setTimeout(() => inputRef.current?.focus(), 40); return () => clearTimeout(t); }, [open]);
  // Re-measure when the on-screen keyboard opens/closes (mobile shrinks the visual
  // viewport without firing a normal `resize`) so the menu doesn't render taller than
  // the space actually visible above the keyboard. Each resize during the animation also
  // extends the scroll-close grace window (capped at 2.5s after open) so a slow first-time
  // iOS keyboard raise can't get cut off mid-animation.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const openedAt = Date.now();
    const onVV = () => {
      graceUntilRef.current = Math.min(Date.now() + 400, openedAt + 2500);
      forceTick(t => t + 1);
    };
    window.visualViewport.addEventListener("resize", onVV);
    return () => window.visualViewport.removeEventListener("resize", onVV);
  }, [open]);
  const toggle = () => { if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect()); setOpen(o => !o); };
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter(it => it.label.toLowerCase().includes(q) || (it.sub || "").toLowerCase().includes(q)) : items;
  const pick = (it) => { onPick(it.value); setOpen(false); };
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" && window.visualViewport ? window.visualViewport.height : (typeof window !== "undefined" ? window.innerHeight : 640);
  const W = matchWidth && rect ? Math.min(Math.max(rect.width, 220), vw - 16) : Math.min(desiredWidth, vw - 16);
  let menuStyle = null;
  if (rect) {
    const left = matchWidth
      ? Math.min(Math.max(rect.left, 8), vw - W - 8)
      : Math.min(Math.max(rect.left + rect.width / 2 - W / 2, 8), vw - W - 8);
    const spaceBelow = vh - rect.bottom;
    const openUp = spaceBelow < 240 && rect.top > spaceBelow;
    const maxH = Math.max(160, (openUp ? rect.top - 12 : spaceBelow - 12));
    menuStyle = openUp
      ? { position: "fixed", bottom: vh - rect.top + 6, left, width: W, maxHeight: Math.min(340, maxH) }
      : { position: "fixed", top: rect.bottom + 6, left, width: W, maxHeight: Math.min(340, maxH) };
  }
  return (
    <>
      {renderButton({ ref: btnRef, toggle, open })}
      {open && menuStyle && createPortal(
        <div data-lift-menu style={{
          ...menuStyle, zIndex: 3000, display: "flex", flexDirection: "column", textAlign: "left",
          background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, boxShadow: "0 18px 44px -12px rgba(0,0,0,.65)",
        }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: T.input, border: `1px solid ${T.line}`, borderRadius: 9, padding: "0 10px" }}>
              <span style={{ fontSize: 13, color: T.sub }}>🔍</span>
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onKeyDown={e => { if (e.key === "Enter" && filtered[0]) pick(filtered[0]); else if (e.key === "Escape") setOpen(false); }}
                style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", boxShadow: "none", color: T.ink, fontFamily: "inherit", fontSize: 16, fontWeight: 600, padding: "9px 0" }} />
              {query && <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} style={{ background: "none", border: "none", color: T.sub, fontSize: 14, cursor: "pointer", padding: "2px 2px" }}>✕</button>}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y", padding: 6 }}>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 12.5, color: T.sub, padding: "12px 10px", lineHeight: 1.5 }}>{emptyHint || <>No matches for “{query}”.</>}</div>
            ) : (() => {
              // Logs-style organization: section header whenever the muscle group changes
              // (items arrive pre-sorted by group), with the search filtering across all.
              const rows = []; let lastG = null;
              for (const it of filtered) {
                if (it.group && it.group !== lastG) { rows.push(<div key={"g-" + it.group} className="lift-group">{it.group}</div>); lastG = it.group; }
                rows.push(
                  <button key={it.value} className={"lift-opt" + (it.selected ? " sel" : "")} onClick={() => pick(it)}>
                    <span className="name">{it.label}{it.sub ? <span className="sub"> · {it.sub}</span> : null}</span>
                    {it.selected && <span className="tick">✓</span>}
                  </button>
                );
              }
              return rows;
            })()}
          </div>
          {footer && <div style={{ flexShrink: 0, borderTop: `1px solid ${T.line}` }}>{footer(() => setOpen(false))}</div>}
        </div>,
        document.body
      )}
    </>
  );
}

/* Group-strength column header: compact uppercase pill that swaps/removes the tracked lift.
   Its menu borrows the Logs organization — muscle-grouped sections — plus a search box. */
function LiftHeaderPicker({ value, options, onPick, onRemove, exMap = {} }) {
  const items = useMemo(() => {
    const ord = (m) => { const i = MUSCLES.indexOf(m); return i < 0 ? 99 : i; };
    return options
      .map(o => ({ value: o, label: o, group: (exMap[o] && muscleOf(exMap[o])) || "Other", selected: o === value }))
      .sort((a, b) => ord(a.group) - ord(b.group) || a.label.localeCompare(b.label));
  }, [options, value, exMap]);
  return (
    <DropdownPicker
      items={items} onPick={onPick} placeholder="Search exercises…" desiredWidth={264}
      renderButton={({ ref, toggle, open }) => (
        <button ref={ref} onClick={toggle} title={value} style={{
          display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
          background: open ? "rgba(var(--accent-rgb),.14)" : T.input,
          border: `1px solid ${open ? "var(--accent)" : T.line}`, borderRadius: 9,
          color: T.ink, fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase",
          padding: "7px 11px", cursor: "pointer", maxWidth: 178, lineHeight: 1.2, textAlign: "center",
        }}>
          {/* full exercise name (no cryptic abbreviations); wraps rather than truncating */}
          <span style={{ minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}>{value}</span>
          <span style={{ fontSize: 8, flexShrink: 0, color: open ? "var(--accent)" : T.sub }}>▼</span>
        </button>
      )}
      footer={(close) => (
        <button className="lift-rm" onClick={() => { onRemove(); close(); }} style={{ borderRadius: "0 0 12px 12px" }}>🗑 Remove this column</button>
      )}
    />
  );
}

/* Dashboard chart exercise picker — same searchable, muscle-grouped dropdown as the
   group strength headers, but full-width (styled like the select it replaces) and
   scoped to only exercises you've actually logged (passed in via `options`). */
function ChartExercisePicker({ value, options, onPick, exMap = {} }) {
  const items = useMemo(() => {
    const ord = (m) => { const i = MUSCLES.indexOf(m); return i < 0 ? 99 : i; };
    return options
      .map(o => ({ value: o, label: o, group: (exMap[o] && muscleOf(exMap[o])) || "Other", selected: o === value }))
      .sort((a, b) => ord(a.group) - ord(b.group) || a.label.localeCompare(b.label));
  }, [options, value, exMap]);
  return (
    <DropdownPicker
      items={items} onPick={onPick} placeholder="Search exercises…" matchWidth desiredWidth={280}
      renderButton={({ ref, toggle, open }) => (
        <button ref={ref} onClick={toggle} title={value} style={{
          display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between",
          flex: 1, minWidth: 0, background: T.cream, border: `1px solid ${open ? "var(--accent)" : "transparent"}`,
          borderRadius: 10, color: T.ink, fontFamily: "inherit", fontWeight: 600, fontSize: 14.5,
          padding: "9px 12px", cursor: "pointer", textAlign: "left",
        }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
          <span style={{ fontSize: 9, flexShrink: 0, color: open ? "var(--accent)" : T.sub }}>▼</span>
        </button>
      )}
    />
  );
}

/* ---------- drag-to-reorder (pointer events: works on mouse AND touch) ---------- */
function useReorder(storageKey, defaultIds) {
  const [saved, setSaved] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey)); if (Array.isArray(s)) return s; } catch {}
    return null;
  });
  useEffect(() => { if (saved) localStorage.setItem(storageKey, JSON.stringify(saved)); }, [storageKey, saved]);
  // reconcile: honor saved order, append any new widgets, drop any that vanished
  const base = saved || defaultIds;
  const ids = [...base.filter(id => defaultIds.includes(id)), ...defaultIds.filter(id => !base.includes(id))];
  return [ids, setSaved];
}

/* One sortable widget (dnd-kit). Drag starts only from the grip pill, so buttons
   and charts inside the card keep working normally. */
function SortableWidget({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform), transition,
      position:"relative", zIndex: isDragging ? 20 : "auto", opacity: isDragging ? 0.9 : 1,
      outline:`2px dashed ${isDragging ? T.green : T.line}`, outlineOffset:-3, borderRadius:16, marginBottom:2,
    }}>
      <div className="drag-handle" {...attributes} {...listeners}
        style={{ position:"absolute", top:6, left:"50%", transform:"translateX(-50%)", zIndex:6,
          background:T.green, color:"#000", borderRadius:99, padding:"3px 16px", fontSize:12, fontWeight:800,
          boxShadow:"0 2px 8px rgba(0,0,0,.4)", cursor:"grab", touchAction:"none", userSelect:"none" }}>
        ⠿ drag
      </div>
      {/* freeze the card's interior while arranging so hovering (e.g. the
          calendar's day cells) can't fire — only the drag handle stays live */}
      <div style={{ pointerEvents:"none" }}>{children}</div>
    </div>
  );
}

/* renderItem(id) -> node. When enabled is false it just renders in order (no dnd). */
function DragList({ ids, setIds, enabled, renderItem }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) setIds(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id)));
  };
  if (!enabled) return ids.map(id => <div key={id}>{renderItem(id)}</div>);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map(id => <SortableWidget key={id} id={id}>{renderItem(id)}</SortableWidget>)}
      </SortableContext>
    </DndContext>
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

/* Workout calendar: last 90 days, built for thumbs — the 13-week grid fits the
   screen with no sideways scrolling, and TAPPING a day shows its details below. */
const CAL_VIEWS = { "1M": 5, "3M": 13, "6M": 26, "1Y": 52 }; // label -> weeks shown
function WorkoutHeatmap({ log, cardio, exMap = {}, storageKey="lt-cal-view", emptyPast="rest day 😴", steps = null, stepGoal = 10000, rewardMode = false }) {
  const [sel, setSel] = useState(todayStr());
  // view choice sticks (remembered on this device)
  const [view, setView] = useState(() => {
    const v = localStorage.getItem(storageKey);
    return CAL_VIEWS[v] ? v : "3M";
  });
  useEffect(() => { localStorage.setItem(storageKey, view); }, [view, storageKey]);
  const { cols, monthMarks, info } = useMemo(() => {
    const info = {}; // date -> lifting, cardio and optional step details
    for (const e of (log||[])) if (e.effort !== "Warm-up") {
      const d = (info[e.date] ||= { n:0, ms:new Set(), ex:{}, cd:[], cardioMin:0, cardioCal:0, steps:null });
      const sets = setCountOf(e), label = entryLabel(e);
      d.n += sets; d.ex[label] = (d.ex[label]||0) + sets;
      for (const [m] of entryMuscleCredits(e, exMap)) d.ms.add(m);
    }
    for (const c of (cardio||[])) {
      const d = (info[c.date] ||= { n:0, ms:new Set(), ex:{}, cd:[], cardioMin:0, cardioCal:0, steps:null });
      d.cd.push(`${c.activity} · ${c.duration || 0} min${c.calories!=null?` · ${c.calories} cal`:""}`);
      d.cardioMin += c.duration || 0; d.cardioCal += c.calories || 0;
    }
    for (const [date,count] of Object.entries(steps||{})) {
      const d = (info[date] ||= { n:0, ms:new Set(), ex:{}, cd:[], cardioMin:0, cardioCal:0, steps:null });
      d.steps = Math.max(d.steps||0, Number(count)||0);
    }
    const WEEKS = CAL_VIEWS[view];
    const end = new Date(todayStr() + "T00:00");
    const start = new Date(weekStart(todayStr()) + "T00:00");
    start.setDate(start.getDate() - 7*(WEEKS-1));
    const cols = []; const monthMarks = [];
    let d = new Date(start), lastMonth = -1;
    for (let w=0; w<WEEKS; w++) {
      const days = [];
      for (let i=0; i<7; i++) {
        const key = d.toISOString().slice(0,10);
        const di = info[key];
        days.push({ key, n: (di?.n || 0) + (di?.cd.length || 0), future: d > end });
        if (d.getMonth() !== lastMonth && d.getDate() <= 7) { monthMarks.push({ col:w, label:d.toLocaleString("en-US",{month:"short"}) }); lastMonth = d.getMonth(); }
        d.setDate(d.getDate()+1);
      }
      cols.push(days);
    }
    return { cols, monthMarks, info };
  }, [log, cardio, exMap, steps, view]);

  const shade = (n, future) => {
    if (future) return "transparent";
    if (n === 0) return T.input;
    const base = rewardMode ? "var(--cal-lift)" : "var(--cal-cardio)";
    if (n <= 2) return `color-mix(in srgb, ${base} 30%, var(--input))`;
    if (n <= 4) return `color-mix(in srgb, ${base} 55%, var(--input))`;
    if (n <= 6) return `color-mix(in srgb, ${base} 80%, var(--input))`;
    return base;
  };

  const rewardOf = (day) => {
    if (!rewardMode || !day) return null;
    const lifted = day.n > 0;
    const cardioHit = day.cardioMin >= 30 || day.cardioCal >= 200;
    const stepHit = (day.steps||0) >= stepGoal;
    const wins = Number(lifted) + Number(cardioHit) + Number(stepHit);
    // Each accent has its own coordinated three-color calendar palette. The categories
    // stay unmistakably different even when the app's main accent is blue or purple.
    if (wins >= 2) return {key:"combo",label:"Combined day",color:"var(--cal-combo)",ink:"var(--cal-combo-ink)"};
    if (cardioHit || stepHit) return {key:"active",label:cardioHit?"Cardio goal":"Step goal",color:"var(--cal-cardio)",ink:"var(--cal-cardio-ink)"};
    if (lifted) return {key:"lift",label:"Lift day",color:"var(--cal-lift)",ink:"var(--cal-lift-ink)"};
    if (day.cd.length) return {key:"activeLow",label:"Cardio logged",color:"color-mix(in srgb, var(--cal-cardio) 48%, var(--input))",ink:T.ink};
    return null;
  };
  const cellStyle = (d) => {
    const reward = rewardOf(info[d.key]);
    if (!reward) return {background:shade(d.n,d.future),color:d.n>4?"#000":T.sub};
    return {background:reward.color,color:reward.ink,boxShadow:reward.key==="combo"?`0 0 11px color-mix(in srgb, ${reward.color} 42%, transparent)`:"none"};
  };

  const order = [...MUSCLES, "Cardio"];
  const day = info[sel];
  const reward = rewardOf(day);
  const muscles = day ? [...day.ms].sort((a,b)=>order.indexOf(a)-order.indexOf(b)) : [];

  const weeks = CAL_VIEWS[view];
  const gap = weeks > 26 ? 2 : 4;
  const pick = (d) => { if (!d.future) setSel(d.key); };
  const outlineFor = (d) =>
    sel===d.key ? `2px solid ${T.ink}` : d.key===todayStr() ? `1.5px solid ${T.sub}` : "none";

  /* 1M: a real calendar — 7 columns (Mon–Sun), day numbers, exactly the last 30 days */
  const monthGrid = () => {
    const days = cols.flat();
    const cutoff = new Date(todayStr() + "T00:00"); cutoff.setDate(cutoff.getDate() - 29);
    const cutKey = cutoff.toISOString().slice(0,10);
    return (
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:6, maxWidth:380, margin:"0 auto" }}>
        {["M","T","W","T","F","S","S"].map((w,i)=>(
          <div key={i} style={{ textAlign:"center", fontSize:10.5, color:T.sub, fontWeight:600 }}>{w}</div>
        ))}
        {days.map(d=>{
          const hidden = d.future || d.key < cutKey;
          return (
            <div key={d.key} onClick={()=>pick(d)} onMouseEnter={()=>pick(d)}
              style={{ aspectRatio:"1", borderRadius:8, ...cellStyle(d),
                visibility: hidden ? "hidden" : "visible", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12.5, fontWeight:600,
                outline: outlineFor(d), outlineOffset:-1 }}>
              {Number(d.key.slice(8))}
            </div>
          );
        })}
      </div>
    );
  };

  /* 3M/6M/1Y: GitHub-style week columns, capped so cells never balloon */
  const weekGrid = () => (
    <div style={{ maxWidth: weeks===13 ? 400 : weeks===26 ? 700 : "none", margin:"0 auto" }}>
      <div style={{ position:"relative", height:14 }}>
        {monthMarks.map((m,i)=>(
          <span key={i} style={{ position:"absolute", left:`${m.col/weeks*100}%`, fontSize:10, color:T.sub }}>{m.label}</span>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${weeks}, 1fr)`, gap }}>
        {cols.map((week,wi)=>(
          <div key={wi} style={{ display:"flex", flexDirection:"column", gap }}>
            {week.map(d=>(
              <div key={d.key} onClick={()=>pick(d)} onMouseEnter={()=>pick(d)}
                style={{ aspectRatio:"1", borderRadius: weeks > 26 ? 2 : 4, ...cellStyle(d),
                  cursor: d.future ? "default" : "pointer",
                  outline: outlineFor(d), outlineOffset:-1 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {/* view switcher — remembered */}
      <div style={{ display:"flex", gap:2, marginBottom:8, justifyContent:"center" }}>
        {Object.keys(CAL_VIEWS).map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{
            background:"none", padding:"4px 10px", fontSize:12, fontWeight:700, letterSpacing:".5px", borderRadius:0,
            color: view===v?T.green:T.sub, borderBottom: view===v?`2px solid ${T.green}`:"2px solid transparent",
          }}>{v}</button>
        ))}
      </div>
      {view === "1M" ? monthGrid() : weekGrid()}

      {rewardMode && <div style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:6,marginTop:10,fontSize:10.5,color:T.sub}}>
        {[["var(--cal-lift)","Lift"],["var(--cal-cardio)","Cardio / step goal"],["var(--cal-combo)","Combined"]].map(([c,l])=><span key={l} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 7px",borderRadius:99,background:`color-mix(in srgb,${c} 9%,transparent)`,border:`1px solid color-mix(in srgb,${c} 24%,var(--line))`}}><i style={{width:8,height:8,borderRadius:3,background:c,boxShadow:`0 0 7px color-mix(in srgb,${c} 42%,transparent)`}} />{l}</span>)}
      </div>}

      {/* tapped-day details */}
      <div style={{ marginTop:12, background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"10px 13px" }} key={sel}>
        <div style={{ fontSize:13.5, fontWeight:700, marginBottom: day ? 4 : 0 }}>
          {fmtDate(sel)}{sel===todayStr() ? " (today)" : ""}
          {!day && (sel < todayStr()
            ? <span style={{ color:T.sub, fontWeight:500 }}> — {emptyPast}</span>
            : <span style={{ color:T.sub, fontWeight:500 }}> — nothing logged yet</span>)}
        </div>
        {day && (
          <>
            {reward && <div style={{display:"inline-flex",alignItems:"center",gap:5,background:`color-mix(in srgb, ${reward.color} 16%, transparent)`,border:`1px solid ${reward.color}`,color:reward.color,borderRadius:99,padding:"3px 8px",fontSize:10.5,fontWeight:850,marginBottom:6}}>{reward.key==="combo"?"⚡":"●"} {reward.label}</div>}
            {day.n > 0 && (
              <div style={{ fontSize:12.5, marginBottom:4 }}>
                <b style={{ color:"var(--cal-lift)" }}>{day.n} set{day.n===1?"":"s"}</b>
                {muscles.length > 0 && <span style={{ color:T.sub }}> · {muscles.join(", ")}</span>}
              </div>
            )}
            {Object.keys(day.ex).length > 0 && (
              <div style={{ fontSize:12, color:T.sub, lineHeight:1.6 }}>
                {Object.entries(day.ex).map(([n,c]) => `${n} ×${c}`).join(" · ")}
              </div>
            )}
            {day.cd.map((c,i)=>(
              <div key={i} style={{ fontSize:12, color:T.sub }}>🏃 {c}</div>
            ))}
            {day.steps!=null && <div style={{fontSize:12,color:(day.steps>=stepGoal)?"var(--cal-cardio)":T.sub}}>👟 {day.steps.toLocaleString()} steps{rewardMode?` / ${stepGoal.toLocaleString()} goal`:""}{day.steps>=stepGoal?" ✓":""}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* Spotify-Wrapped-style yearly recap. */
function YearRecap({ data, setData }) {
  const units = useUnit();
  const year = new Date().getFullYear();
  const canMinimize = typeof setData === "function";
  const minimized = canMinimize && !!data.profile?.minimizedSections?.yearRecap;
  const setMinimizedSaved = (value) => setData?.(d=>({ ...d, profile:{ ...(d.profile||{}), minimizedSections:{ ...(d.profile?.minimizedSections||{}), yearRecap:value } } }));
  const stats = useMemo(() => {
    const log = (data.log||[]).filter(e => e.date.startsWith(String(year)));
    const cardio = (data.cardio||[]).filter(c => c.date.startsWith(String(year)));
    const days = new Set([...log.map(e=>e.date), ...cardio.map(c=>c.date)]);
    const volume = log.reduce((s,e)=>s + (e.weight||0)*(e.reps||0), 0);
    const byMuscle = {};
    const exCred = Object.fromEntries((data.exercises||[]).map(x=>[x.name,muscleCredits(x)]));
    for (const e of log) { if (e.effort==="Warm-up") continue; for (const [m,w] of (e.muscleOnly ? [[e.muscle,1]] : exCred[e.exercise]||[])) byMuscle[m]=(byMuscle[m]||0)+w*setCountOf(e); }
    const topMuscle = Object.entries(byMuscle).sort((a,b)=>b[1]-a[1])[0];
    let bigPR = null;
    for (const e of log) {
      if (e.quick || e.weight==null || !e.reps) continue;
      const est = e1rm(e.weight, e.reps);
      if (!bigPR || est > bigPR.est) bigPR = { est, text:`${dispW(e.weight,units)}×${e.reps} ${e.exercise}` };
    }
    const cardioMin = cardio.reduce((s,c)=>s+(c.duration||0),0);
    return { sets: log.reduce((s,e)=>s+setCountOf(e),0), days: days.size, volume: Math.round(dispW(volume,units)), topMuscle, bigPR, cardioMin, empty: !log.length && !cardio.length };
  }, [data, year, units]);

  if (stats.empty) return null;
  if (minimized) return (
    <div className="card compact-card" style={{display:"flex", alignItems:"center", gap:8, background:"linear-gradient(160deg,#0C1A0E,#0C0D0D 60%)"}}>
      <span style={{fontSize:17}}>✨</span>
      <div style={{minWidth:0, flex:1}}><div className="h" style={{fontSize:14, color:T.green}}>{year} in review</div><div style={{fontSize:11, color:T.sub}}>{stats.sets} sets · {stats.days} workout day{stats.days===1?"":"s"}</div></div>
      <button onClick={()=>setMinimizedSaved(false)} style={showSectionBtn}>Show</button>
    </div>
  );
  const Item = ({ big, label }) => (
    <div style={{ textAlign:"center", padding:"6px 4px" }}>
      <div style={{ fontSize:24, fontWeight:800, color:T.ink, lineHeight:1.15 }}>{big}</div>
      <div style={{ fontSize:11.5, color:T.sub }}>{label}</div>
    </div>
  );
  return (
    <div className="card" style={{ background:"linear-gradient(160deg,#0C1A0E,#0C0D0D 60%)", border:`1px solid ${T.creamLine}` }}>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:2}}>
        <div className="h" style={{ fontSize:19, color:T.green, flex:1 }}>✨ {year} in review</div>
        {canMinimize && <button onClick={()=>setMinimizedSaved(true)} title="Minimize yearly review" aria-label="Minimize yearly review" style={minimizeBtn}>➖</button>}
      </div>
      <div style={{ fontSize:12.5, color:T.sub, marginBottom:12 }}>Your year so far.</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
        <Item big={stats.sets} label="sets logged" />
        <Item big={stats.days} label="workout days" />
        <Item big={stats.volume.toLocaleString()} label={`${uLabel(units)} total volume`} />
        <Item big={stats.topMuscle ? stats.topMuscle[0] : "—"} label="most trained" />
        <Item big={stats.cardioMin} label="cardio minutes" />
        <Item big={stats.bigPR ? dispW(stats.bigPR.est, units) : "—"} label="top est. 1RM" />
      </div>
      {stats.bigPR && <div style={{ marginTop:12, textAlign:"center", fontSize:13 }}>
        🏆 Biggest lift: <b style={{color:T.green}}>{stats.bigPR.text}</b>
      </div>}
    </div>
  );
}

/* ================= DASHBOARD ================= */
const DASH_WIDGETS = ["calendar","target","streak","charts","muscle","recap"];
/* Hero stat tile for the dashboard — big gradient number, icon, label. `hero`
   gives the primary tile an accent-tinted glow so the eye lands on it first. */
function StatTile({ icon, value, label, hero }) {
  return (
    <div className="card stat-tile" style={{ margin:0, padding:"13px 13px 15px", position:"relative", overflow:"hidden",
      background: hero ? "linear-gradient(165deg, rgba(var(--accent-rgb),.20), color-mix(in srgb, var(--card) 90%, #fff 4%) 68%)" : undefined,
      borderColor: hero ? "rgba(var(--accent-rgb),.45)" : undefined,
      boxShadow: hero ? "0 12px 34px -14px rgba(var(--accent-rgb),.7), 0 1px 0 rgba(255,255,255,.07) inset" : undefined }}>
      {/* top HUD accent bar */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background: hero ? "linear-gradient(90deg, transparent, var(--accent), transparent)" : "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 40%, transparent), transparent)", opacity: hero?1:.5 }} />
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:6, minHeight:22, marginBottom:9 }}>
        <span className="eyebrow" style={{ fontSize:9, letterSpacing:"1px", lineHeight:1.25, color: hero?T.green:T.sub }}>{label}</span>
        <span style={{ fontSize:14, flexShrink:0, filter: hero ? "drop-shadow(0 2px 8px rgba(var(--accent-rgb),.6))" : "none" }}>{icon}</span>
      </div>
      <div style={{ fontSize:33, fontWeight:900, lineHeight:.95, color: hero ? T.green : T.ink, letterSpacing:"-1.2px", fontVariantNumeric:"tabular-nums", textShadow: hero?"0 0 26px rgba(var(--accent-rgb),.45)":"none" }}>{value}</div>
    </div>
  );
}

function Dashboard({ data, exMap, setData, own = true, user, sharedSteps = null, isPro, coachEnabled, stepsEnabled, nutritionOn, multiGymOn, openSettings, setTab }) {
  const units = useUnit();
  const syncedDashSteps = useOwnSteps(user, 370, !!(own && stepsEnabled && user?.id));
  const stepSource = own ? syncedDashSteps : (sharedSteps || {});
  const dashStepData = useMemo(()=>mergeSteps(stepSource, data.cardio),[stepSource,data.cardio]);
  const dashStepGoal = data.profile?.stepGoal || 10000;
  const showDashSteps = own ? !!stepsEnabled : sharedSteps != null;
  const [researchMode, setResearchMode] = useState(() => goalModeOf(data));
  const [targetDetail, setTargetDetail] = useState(null); // { muscle, pinned }
  const minimizedSections = data.profile?.minimizedSections || {};
  const setSectionMinimized = (key, value) => setData(d=>({ ...d, profile:{ ...(d.profile||{}), minimizedSections:{ ...(d.profile?.minimizedSections||{}), [key]:value } } }));
  const targetMinimized = own && !!minimizedSections.weeklyTargets;
  const minimizeTarget = (value) => { setSectionMinimized("weeklyTargets", value); if (value) setTargetDetail(null); };
  const muscleMinimized = own && !!minimizedSections.muscleChart;
  const minimizeMuscle = (value) => setSectionMinimized("muscleChart", value);
  const minimizedCharts = own ? (data.profile?.minimizedCharts || {}) : {};
  const minimizeChart = (name, value) => setData(d=>({ ...d, profile:{ ...(d.profile||{}), minimizedCharts:{ ...(d.profile?.minimizedCharts||{}), [name]:value } } }));
  const targetCardRef = useRef(null);
  useEffect(() => { setResearchMode(goalModeOf(data)); }, [data.profile?.setGoalMode]);
  useEffect(() => {
    if (!targetDetail) return;
    const closeOutside = (e) => { if (targetCardRef.current && !targetCardRef.current.contains(e.target)) setTargetDetail(null); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [targetDetail]);
  // range sticks forever (remembered on this device)
  const [range, setRange] = useState(() => {
    const r = localStorage.getItem("lt-range");
    return r && RANGE_DAYS[r] !== undefined ? r : "1M";
  });
  useEffect(() => { localStorage.setItem("lt-range", range); }, [range]);
  /* per-bodyweight-exercise chart mode: "reps" (volume) or "strength" (est. 1RM) */
  const [bwMode, setBwMode] = useState({});
  /* draggable dashboard widget order (remembered on this device) */
  const [arrange, setArrange] = useState(false);
  const [wOrder, setWOrder] = useReorder("lt-dash-order-v3", DASH_WIDGETS);
  /* Pinned charts live in account data (data.pins) so they sync across devices and
     friends' profiles show THEIR pins. Local state first, then persisted when it's your own. */
  const [pins, setPins] = useState(() => Array.isArray(data.pins) ? data.pins : []);
  useEffect(() => {
    if (!own) return;
    setData(d => {
      const cur = Array.isArray(d.pins) ? d.pins : [];
      return cur.length === pins.length && cur.every((p, i) => p === pins[i]) ? d : { ...d, pins };
    });
  }, [pins, own, setData]);
  // read-only profiles: always mirror THAT person's pins (data can arrive/switch after mount)
  useEffect(() => {
    if (!own) setPins(Array.isArray(data.pins) ? data.pins : []);
  }, [own, data.pins]);

  /* exercises with at least one working set, newest session first */
  const logged = useMemo(() => {
    const last = {};
    for (const e of data.log) {
      if (e.effort === "Warm-up" || !exMap[e.exercise]) continue;
      if (!last[e.exercise] || e.date > last[e.exercise]) last[e.exercise] = e.date;
    }
    return Object.keys(last).sort((a, b) => last[b].localeCompare(last[a]));
  }, [data.log, exMap]);

  const validPins = pins.filter(p => exMap[p]);
  const picks = useMemo(() => {
    const out = [...validPins];
    for (const name of logged) {
      if (out.length >= 4) break;
      if (!out.includes(name)) out.push(name);
    }
    return out.slice(0, 4);
  }, [pins, logged, exMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPinned = (i) => i < validPins.length;
  /* choosing from the dropdown pins that slot; the 📌 button toggles */
  const changePick = (i, name) => setPins(() => {
    const without = validPins.filter(p => p !== name);
    without.splice(Math.min(i, without.length), 0, name);
    return without;
  });
  const togglePin = (i) => setPins(() => {
    if (i < validPins.length) return validPins.filter((_, j) => j !== i);
    const name = picks[i];
    return name && !validPins.includes(name) ? [...validPins, name] : validPins;
  });

  const chartOpts = useMemo(() => [...logged].sort((a, b) => a.localeCompare(b)), [logged]);

  // ---- gym tagging (machine/cable exercises only, once multi-gym is on in Settings) ----
  const gyms = data.gyms || [];
  const [gymFilter, setGymFilter] = useState({}); // exName -> "ALL" | gymId; unset = default (most-used gym)
  // which gym you've logged this exercise at most — the sane default view per chart, so
  // day-to-day it reads clean; "All gyms" is one tap away to see the full picture.
  const mostUsedGym = (exName) => {
    const counts = {};
    for (const e of data.log) if (e.exercise === exName && e.gym) counts[e.gym] = (counts[e.gym] || 0) + 1;
    const ids = Object.keys(counts);
    return ids.length ? ids.sort((a, b) => counts[b] - counts[a])[0] : "";
  };
  const gymsUsedFor = (exName) => {
    const ids = new Set(data.log.filter(e => e.exercise === exName && e.gym).map(e => e.gym));
    return gyms.filter(g => ids.has(g.id));
  };

  const seriesFor = (exName) => {
    const ex = exMap[exName]; if (!ex) return [];
    const isMachineEx = multiGymOn && machineOf(ex);
    const effGym = isMachineEx ? (gymFilter[exName] ?? mostUsedGym(exName)) : "";
    const showingAll = isMachineEx && effGym === "ALL";
    let entries = data.log.filter(e => e.exercise===exName && !(e.effort==="Warm-up") && !e.quick);
    if (isMachineEx && effGym && !showingAll) entries = entries.filter(e => e.gym === effGym);
    if (!entries.length) return [];
    const isBWex = ex.type==="Bodyweight";
    /* bodyweight lifts: "total" reps per day (volume) or "best" single set (strength/progress) */
    const best = isBWex && bwMode[exName]==="best";
    const dotColorFor = (gymId) => showingAll ? gymColor(gyms, gymId) : null;

    /* 1D: the latest session set-by-set — one dot per set */
    if (range === "1D") {
      const lastDate = entries.reduce((a,b)=>a.date>b.date?a:b).date;
      const day = entries.filter(e=>e.date===lastDate).sort((a,b)=>(a.id||0)-(b.id||0));
      if (isBWex && best) {
        let top = 0;
        return day.map((e,i) => (top = Math.max(top, e.reps), { date:lastDate, label:`Set ${e.set ?? i+1}`, value:e.reps, sub:`${e.reps} reps${e.reps>=top?" · best so far":""}`, dotColor:dotColorFor(e.gym) }));
      }
      if (isBWex) {
        let run = 0;
        return day.map((e,i) => (run += e.reps, { date:lastDate, label:`Set ${e.set ?? i+1}`, value:run, sub:`+${e.reps} reps (total ${run})`, dotColor:dotColorFor(e.gym) }));
      }
      return day.map((e,i) => ({ date:lastDate, label:`Set ${e.set ?? i+1}`, value:dispW(e1rm(e.weight||0, e.reps), units), sub:`${dispW(e.weight,units)} ${uLabel(units)} × ${e.reps}${showingAll && e.gym ? ` · ${gymName(gyms, e.gym)}` : ""}`, dotColor:dotColorFor(e.gym) }));
    }

    /* longer ranges: one point per day */
    const byDate = {};
    for (const e of entries) {
      const b = byDate[e.date] || (byDate[e.date] = { reps:0, sets:0, bestSet:0, best1rm:0, gym:e.gym });
      b.sets++; b.reps += e.reps; b.bestSet = Math.max(b.bestSet, e.reps); b.gym = e.gym || b.gym; // last entry's gym for the day
      if (!isBWex) b.best1rm = Math.max(b.best1rm, dispW(e1rm(e.weight||0, e.reps), units));
    }
    let pts = Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([d,b])=>{
        const setTxt = `${b.sets} set${b.sets>1?"s":""}`;
        const gymTag = showingAll && b.gym ? ` · ${gymName(gyms, b.gym)}` : "";
        if (isBWex && best) return { date:d, label:fmtDate(d),
          value: b.bestSet, sub: `${setTxt} · ${b.reps} total reps${gymTag}`, dotColor:dotColorFor(b.gym) };
        if (isBWex) return { date:d, label:fmtDate(d),
          value: b.reps, sub: `${setTxt} · best set ${b.bestSet} reps${gymTag}`, dotColor:dotColorFor(b.gym) };
        return { date:d, label:fmtDate(d),
          value: Math.round(b.best1rm*10)/10,
          sub: `${b.reps} total reps · ${setTxt}${gymTag}`, dotColor:dotColorFor(b.gym) };
      });
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
      for (const [m,w] of entryMuscleCredits(e, exMap)) if (m in c) c[m]+=w*setCountOf(e);
    }
    return c;
  }, [data.log, exMap, wkStart]);
  const weekSetBreakdown = useMemo(() => {
    const grouped = Object.fromEntries(MUSCLES.map(m=>[m,{}]));
    for (const e of data.log) {
      if (e.effort==="Warm-up" || weekStart(e.date)!==wkStart) continue;
      for (const [m, credit] of entryMuscleCredits(e, exMap)) {
        if (!(m in grouped)) continue;
        const label = entryLabel(e), key = `${label}|${credit}`;
        const row = grouped[m][key] || { exercise:label, credit, logged:0, total:0, muscleOnly:!!e.muscleOnly };
        row.logged += setCountOf(e); row.total += credit*setCountOf(e); grouped[m][key] = row;
      }
    }
    return Object.fromEntries(MUSCLES.map(m=>[m,Object.values(grouped[m]).sort((a,b)=>b.total-a.total || a.exercise.localeCompare(b.exercise))]));
  }, [data.log, exMap, wkStart]);

  /* 30-day pie */
  const pieData = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
    const c = Object.fromEntries(MUSCLES.map(m=>[m,0]));
    for (const e of data.log) {
      if (e.effort==="Warm-up") continue;
      if (new Date(e.date+"T00:00") < cutoff) continue;
      for (const [m,w] of entryMuscleCredits(e, exMap)) if (m in c) c[m]+=w*setCountOf(e);
    }
    return MUSCLES.map((m,i)=>({name:m, value:Math.round(c[m]*10)/10, fill:MUSCLE_COLORS[i]})).filter(x=>x.value>0);
  }, [data.log, exMap]);

  /* weekly streak (lifting OR cardio) with mid-week protection */
  const streak = useMemo(() => computeStreak(data.log, data.cardio), [data.log, data.cardio]);

  const cardioMin = data.cardio.filter(e=>weekStart(e.date)===wkStart).reduce((s,e)=>s+(e.duration||0),0);

  /* each dashboard block is a widget you can drag to reorder */
  const widgets = {};
  widgets.charts = (<>
    <div className="card" style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", gap:8, flexWrap:"wrap"}}>
      <div className="h" style={{fontSize:16, color:T.tealDk}}>📈 Progress</div>
      <div style={{display:"inline-flex", gap:2, background:T.input, border:`1px solid ${T.line}`, borderRadius:99, padding:3}}>
        {Object.keys(RANGE_DAYS).map(r=>{
          const on = range===r;
          return (
          <button key={r} onClick={()=>setRange(r)} style={{
            padding:"5px 11px", fontSize:11.5, fontWeight:800, letterSpacing:".4px", borderRadius:99, border:"none", minHeight:0,
            background: on ? "linear-gradient(180deg, rgba(var(--accent-rgb),.22), rgba(var(--accent-rgb),.12))" : "transparent",
            color: on ? T.green : T.sub, boxShadow: on ? "0 0 0 1px rgba(var(--accent-rgb),.25) inset" : "none",
            transition:"background .18s ease, color .18s ease",
          }}>{r.toUpperCase()}</button>
          );
        })}
      </div>
    </div>

    {picks.length === 0 && (
      <div className="card" style={{textAlign:"center", color:T.sub, fontSize:14, padding:"30px 16px"}}>
        Log your first set and your charts show up here automatically. 📈
      </div>
    )}

    {picks.map((p,i)=>{
      const pts = seriesFor(p);
      const pinned = isPinned(i);
      const isBW = exMap[p]?.type==="Bodyweight";
      if (minimizedCharts[p]) {
        const latest = pts[pts.length-1];
        return <div className="card compact-card" key={p} style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{fontSize:17}}>📈</span>
          <div style={{minWidth:0, flex:1}}><div className="h" style={{fontSize:14, color:T.tealDk, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{p}</div><div style={{fontSize:11, color:T.sub}}>{latest ? `Latest: ${latest.value}${isBW?" reps":` ${uLabel(units)}`}` : "No chart data yet"}</div></div>
          <button onClick={()=>minimizeChart(p,false)} style={showSectionBtn}>Show</button>
        </div>;
      }
      /* latest session totals for this exercise (working sets only) */
      const sess = data.log.filter(e => e.exercise===p && e.effort!=="Warm-up" && !e.quick);
      const lastDate = sess.length ? sess.reduce((a,b)=>a.date>b.date?a:b).date : null;
      const daySets = lastDate ? sess.filter(e=>e.date===lastDate) : [];
      const dayReps = daySets.reduce((s,e)=>s+e.reps, 0);
      const bestMode = isBW && bwMode[p]==="best";
      const isMachineEx = multiGymOn && machineOf(exMap[p]);
      const exGyms = isMachineEx ? gymsUsedFor(p) : [];
      const effGym = isMachineEx ? (gymFilter[p] ?? mostUsedGym(p)) : "";
      return (
      <div className="card" key={p}>
        <div style={{display:"flex", gap:8, alignItems:"center", marginBottom: isBW?8:6}}>
          <ChartExercisePicker value={p} options={chartOpts} exMap={exMap} onPick={x=>changePick(i, x)} />
          {own && (
          <button onClick={()=>togglePin(i)} title={pinned ? "Unpin — go back to most recent" : "Pin this chart"} style={{
            flexShrink:0, minHeight:38, padding:"5px 12px", fontSize:12.5, fontWeight:700, borderRadius:99,
            background: pinned ? "rgba(var(--accent-rgb),.14)" : "none",
            border: `1px solid ${pinned ? T.green : T.line}`,
            color: pinned ? T.green : T.sub,
          }}>
            {pinned ? "📌 Pinned" : "📌 Pin"}
          </button>
          )}
          {own && <button onClick={()=>minimizeChart(p,true)} title={`Minimize ${p} graph`} aria-label={`Minimize ${p} graph`} style={minimizeBtn}>➖</button>}
        </div>
        {exGyms.length > 0 && (
          <div style={{display:"flex", gap:6, flexWrap:"wrap", marginBottom:8}}>
            {exGyms.map(g => {
              const on = effGym === g.id;
              return (
                <button key={g.id} onClick={()=>setGymFilter(f=>({...f, [p]:g.id}))} style={{
                  display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:99,
                  fontSize:11.5, fontWeight:700, background: on ? "rgba(var(--accent-rgb),.14)" : T.input,
                  border:`1px solid ${on ? "var(--accent)" : T.line}`, color: on ? T.ink : T.sub,
                }}>
                  <span style={{width:7, height:7, borderRadius:99, background:gymColor(gyms, g.id), display:"inline-block"}} />
                  {g.name}
                </button>
              );
            })}
            <button onClick={()=>setGymFilter(f=>({...f, [p]:"ALL"}))} style={{
              padding:"4px 10px", borderRadius:99, fontSize:11.5, fontWeight:700,
              background: effGym==="ALL" ? "rgba(var(--accent-rgb),.14)" : T.input,
              border:`1px solid ${effGym==="ALL" ? "var(--accent)" : T.line}`, color: effGym==="ALL" ? T.ink : T.sub,
            }}>All gyms</button>
          </div>
        )}
        {/* Total/Best on its own row so it never squeezes the exercise name */}
        {isBW && (
          <div className="seg" style={{display:"inline-flex", marginBottom:8}}
            title="Total reps per day, or your best single set">
            {[["total","Total"],["best","Best"]].map(([m,lbl])=>{
              const on = (bwMode[p]||"total")===m;
              return (
                <button key={m} onClick={()=>setBwMode(s=>({...s,[p]:m}))} className={"seg-btn"+(on?" on":"")}
                  style={{padding:"6px 18px", fontSize:12.5}}>{lbl}</button>
              );
            })}
          </div>
        )}
        {lastDate && (
          <div style={{fontSize:12.5, color:T.ink, marginBottom:2}}>
            Last workout {fmtDate(lastDate)}: <b style={{color:T.green}}>{daySets.length} set{daySets.length===1?"":"s"}</b> · <b style={{color:T.green}}>{dayReps} reps</b>
          </div>
        )}
        <div style={{fontSize:11.5, color:T.sub, fontStyle:"italic", marginBottom:4}}>
          {range==="1D" ? "Latest session, set by set — tap a dot for the details"
            : !isBW ? `Tracked by est. 1RM (${uLabel(units)})`
            : bestMode ? "Best set — top reps in a single set" : "Volume — total reps per day"}
        </div>
        {pts.length
          ? <Suspense fallback={<ChartFallback h={210} />}><TrendChart pts={pts} dots={range==="1D"} unit={isBW ? " reps" : " "+uLabel(units)} /></Suspense>
          : <div style={{color:T.sub, fontSize:14, padding:"28px 0", textAlign:"center"}}>No sessions logged for this lift yet.</div>}
      </div>
      );
    })}
  </>);

  {
    const goalMode = goalModeOf(data);
    const goalModeInfo = GOAL_MODES[goalMode];
    const targets = setTargetsOf(data);
    const customTargets = customSetTargetsOf(data);
    const bumpDashTarget = (m, delta) => setData(d => {
      const cur = setTargetsOf(d);
      const key = targetOverrideKeyOf(d);
      return { ...d, profile: { ...(d.profile || {}), [key]: { ...(d.profile?.[key] || {}), [m]: Math.max(0, Math.min(40, (cur[m] || 0) + delta)) } } };
    });
    const resetDashTarget = (m) => setData(d => {
      const key = targetOverrideKeyOf(d);
      const rest = { ...(d.profile?.[key] || {}) }; delete rest[m];
      return { ...d, profile: { ...(d.profile || {}), [key]: rest } };
    });
    const resetAllDashTargets = () => setData(d => {
      const key = targetOverrideKeyOf(d);
      return { ...d, profile: { ...(d.profile || {}), [key]: {} } };
    });
    const setGoalMode = (mode) => setData(d => ({ ...d, profile: { ...(d.profile || {}), setGoalMode: mode } }));
    const toggleTargetDetail = (muscle) => setTargetDetail(cur => cur?.muscle===muscle && cur.pinned ? null : {muscle, pinned:true});
    const previewTargetDetail = (muscle) => setTargetDetail(cur => cur?.pinned ? cur : {muscle, pinned:false});
    const leaveTargetDetail = (muscle) => setTargetDetail(cur => cur?.muscle===muscle && !cur.pinned ? null : cur);
    const activeTargetMuscle = targetDetail?.muscle;
    const dropdownSummary = { fontSize:12.5, color:T.green, fontWeight:700, cursor:"pointer", listStyle:"none", display:"inline-flex", alignItems:"center", gap:6, background:T.input, border:`1px solid ${T.line}`, borderRadius:99, padding:"6px 13px" };
    const targetDone = Object.values(weekSets).reduce((sum,n)=>sum+n,0);
    const targetGoal = Object.values(targets).reduce((sum,n)=>sum+n,0);
    widgets.target = targetMinimized ? (
      <div className="card compact-card" style={{display:"flex", alignItems:"center", gap:8}}>
        <span style={{fontSize:17}}>🎯</span>
        <div style={{minWidth:0, flex:1}}><div className="h" style={{fontSize:14, color:T.tealDk}}>Weekly set target</div><div style={{fontSize:11, color:T.sub}}>{fmtSets(targetDone)} / {fmtSets(targetGoal)} credited sets this week</div></div>
        <button onClick={()=>minimizeTarget(false)} style={showSectionBtn}>Show</button>
      </div>
    ) : (
      <div className="card" ref={targetCardRef}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:2}}>
          <div className="h" style={{fontSize:17, color:T.tealDk, flex:1}}>Weekly set target</div>
          {own && <button onClick={()=>minimizeTarget(true)} title="Minimize weekly targets" aria-label="Minimize weekly targets" style={minimizeBtn}>➖</button>}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:6, margin:"8px 0 7px", flexWrap:"wrap"}}>
          <span style={{fontSize:11.5, color:T.sub, marginRight:2}}>Goal type</span>
          {own
            ? Object.entries(GOAL_MODES).map(([mode, info]) => <button key={mode} type="button" onClick={()=>setGoalMode(mode)} aria-pressed={goalMode===mode} style={{background:goalMode===mode ? T.mint : T.input, color:goalMode===mode ? T.green : T.sub, border:`1px solid ${goalMode===mode ? T.green : T.line}`, borderRadius:99, padding:"5px 10px", fontSize:11.5, fontWeight:800}}>{info.label}</button>)
            : <span style={{background:T.mint, color:T.green, border:`1px solid ${T.green}`, borderRadius:99, padding:"5px 10px", fontSize:11.5, fontWeight:800}}>{goalModeInfo.label}</span>}
        </div>
        <div style={{fontSize:12, color:T.sub, marginBottom:12}}>
          {goalModeInfo.short} goal, Mon–Sun. Main muscles count as a full set; secondary muscles (like triceps on bench) count as half. Tap a bar to see its exact count.
        </div>
        {MUSCLES.map((m,i)=>{
          const goal = targets[m];
          const n = weekSets[m];
          const status = n < goal ? `${goal-n} under` : n === goal ? "✓ goal hit" : `${n-goal} over`;
          const sColor = n < goal ? T.ink : T.green;
          return (
            <div key={m} style={{display:"grid", gridTemplateColumns:"78px 1fr 96px", gap:10, alignItems:"center", marginBottom:9}}>
              <button type="button" onClick={()=>toggleTargetDetail(m)} style={{padding:0, background:"none", color:T.ink, textAlign:"left", fontSize:13, fontWeight:600}}>{m}</button>
              <TargetBar muscle={m} count={n} color={MUSCLE_COLORS[i]} goal={goal} max={Math.max(20, goal+4, n)} open={activeTargetMuscle===m} onHover={()=>previewTargetDetail(m)} onLeave={()=>leaveTargetDetail(m)} onToggle={()=>toggleTargetDetail(m)} />
              <button type="button" onClick={()=>toggleTargetDetail(m)} aria-expanded={activeTargetMuscle===m} style={{padding:0, background:"none", fontSize:11.5, textAlign:"right", whiteSpace:"nowrap", lineHeight:1.25}}>
                <span style={{display:"block", color:T.sub}}><b style={{color:T.ink, fontSize:13}}>{n}</b> / {goal}</span>
                <span style={{display:"block", color:sColor, fontWeight:700}}>{status}</span>
              </button>
            </div>
          );
        })}
        {activeTargetMuscle && <TargetBreakdown muscle={activeTargetMuscle} rows={weekSetBreakdown[activeTargetMuscle] || []} count={weekSets[activeTargetMuscle]} goal={targets[activeTargetMuscle]} color={MUSCLE_COLORS[MUSCLES.indexOf(activeTargetMuscle)]} />}
        {own && <div style={{display:"flex", gap:10, marginTop:6, flexWrap:"wrap"}}>
          <details style={{width:"100%"}}>
            <summary style={{...dropdownSummary, color:T.green}}>🎛 Modify your own {goalModeInfo.label.toLowerCase()} goals <span style={{fontSize:9}}>▾</span></summary>
            <div style={{marginTop:10, padding:"13px", background:`linear-gradient(145deg, ${T.input}, ${T.card})`, border:`1px solid ${T.line}`, borderRadius:13, boxShadow:"0 10px 28px rgba(0,0,0,.14)"}}>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:9}}>
                <div><div style={{fontSize:13, color:T.ink, fontWeight:800}}>{goalModeInfo.label} targets</div><div style={{fontSize:10.5, color:T.sub, marginTop:2}}>Your changes are saved separately for each goal type.</div></div>
                {Object.keys(customTargets).length>0 && <button type="button" onClick={resetAllDashTargets} style={{background:T.card, color:T.sub, border:`1px solid ${T.line}`, padding:"6px 9px", fontSize:10.5, fontWeight:700, whiteSpace:"nowrap"}}>Reset all</button>}
              </div>
              {MUSCLES.map(m => {
                const isCustom = customTargets[m] != null;
                return (
                  <div key={m} style={{display:"grid", gridTemplateColumns:"minmax(78px,1fr) auto", alignItems:"center", gap:10, padding:"9px 0", borderTop:`1px solid ${T.line}`}}>
                    <div><span style={{fontSize:12.5, fontWeight:750, color:T.ink}}>{m}</span><span style={{display:"block", fontSize:9.5, color:isCustom?T.green:T.sub, marginTop:1}}>{isCustom ? `Custom · research default ${goalModeInfo.targets[m]}` : `Research default ${goalModeInfo.targets[m]}`}</span></div>
                    <div style={{display:"flex", alignItems:"center", gap:6}}>
                      <button onClick={()=>bumpDashTarget(m,-1)} aria-label={`Lower ${m} goal`} style={{width:30, height:30, borderRadius:8, background:T.card, border:`1px solid ${T.line}`, color:T.ink, fontSize:17, lineHeight:1, padding:0}}>−</button>
                      <span style={{fontSize:15, fontWeight:850, minWidth:28, textAlign:"center", color:isCustom?T.green:T.ink, fontVariantNumeric:"tabular-nums"}}>{targets[m]}</span>
                      <button onClick={()=>bumpDashTarget(m,1)} aria-label={`Raise ${m} goal`} style={{width:30, height:30, borderRadius:8, background:T.card, border:`1px solid ${T.line}`, color:T.ink, fontSize:17, lineHeight:1, padding:0}}>+</button>
                      {isCustom && <button onClick={()=>resetDashTarget(m)} title="Reset this muscle" aria-label={`Reset ${m} goal`} style={{width:30, height:30, background:T.mint, color:T.green, border:`1px solid ${T.green}`, borderRadius:8, fontSize:13, fontWeight:800, padding:0}}>↺</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </div>}
        {own && <details style={{marginTop:10}}>
          <summary style={{...dropdownSummary, color:T.sub}}>🔬 Why these numbers? <span style={{fontSize:9}}>▾</span></summary>
          <div style={{marginTop:8, padding:"12px", background:T.input, border:`1px solid ${T.line}`, borderRadius:12}}>
            <div style={{display:"flex", gap:5, marginBottom:11, padding:3, background:T.card, borderRadius:10}}>
              {Object.entries(GOAL_MODES).map(([mode, info]) => <button key={mode} type="button" onClick={()=>setResearchMode(mode)} aria-pressed={researchMode===mode} style={{flex:1, background:researchMode===mode?T.mint:"transparent", color:researchMode===mode?T.green:T.sub, border:`1px solid ${researchMode===mode?T.green:"transparent"}`, borderRadius:8, padding:"7px 8px", fontSize:11.5, fontWeight:800}}>{info.label}</button>)}
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:7}}>
            {MUSCLES.map(m => (
              <div key={m} style={{fontSize:11.5, color:T.sub, lineHeight:1.5}}>
                <b style={{color:T.ink}}>{m} · research default {GOAL_MODES[researchMode].targets[m]}:</b> {GOAL_RESEARCH[researchMode][m]}
                {researchMode===goalMode && customTargets[m]!=null && <span style={{display:"inline-block", marginLeft:5, color:T.green, fontWeight:700}}>Your saved target is {targets[m]}.</span>}
              </div>
            ))}
            </div>
            <div style={{fontSize:11, color:T.sub, marginTop:4, fontStyle:"italic"}}>
              Evidence reviewed: Schoenfeld, Ogborn & Krieger (2017, doi:10.1080/02640414.2016.1210197); Baz-Valle et al. (2022, doi:10.2478/hukin-2022-0017); Currier et al. (2023, doi:10.1136/bjsports-2023-106807); Lopez et al. (2021, doi:10.1249/MSS.0000000000002585); Ralston et al. (2017, doi:10.1007/s40279-017-0762-7); and Pelland et al. (2026, doi:10.1007/s40279-025-02344-w). These guide a starting point; change goals based on progress and recovery.
            </div>
          </div>
        </details>}
      </div>
    );
  }

  widgets.streak = (
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14}}>
      <StatTile hero icon="🔥" value={streak.cur} label="Week streak" />
      <StatTile icon="🏆" value={streak.best} label="Best ever (wks)" />
      <StatTile icon="🏃" value={cardioMin} label="Cardio min · wk" />
    </div>
  );

  widgets.calendar = (
    <div className="card" style={{background:"radial-gradient(90% 68% at 100% 0%,color-mix(in srgb,var(--cal-combo) 8%,transparent),transparent 58%),radial-gradient(80% 65% at 0% 100%,color-mix(in srgb,var(--cal-cardio) 7%,transparent),transparent 60%),linear-gradient(180deg,color-mix(in srgb,var(--card) 92%,#fff 5%),var(--card))",borderColor:"color-mix(in srgb,var(--cal-lift) 22%,var(--line))"}}>
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>Workout calendar</div>
      <div style={{fontSize:12, color:T.sub, marginBottom:10}}>Lifting, cardio or step goals, and combined days each use a different color matched to your theme. Tap a day for details.</div>
      <WorkoutHeatmap log={data.log} cardio={data.cardio} exMap={exMap} steps={showDashSteps?dashStepData.map:null} stepGoal={dashStepGoal} rewardMode />
    </div>
  );

  const muscleTotal = pieData.reduce((sum,row)=>sum+row.value,0);
  widgets.muscle = muscleMinimized ? (
    <div className="card compact-card" style={{display:"flex", alignItems:"center", gap:8}}>
      <span style={{fontSize:17}}>🥧</span>
      <div style={{minWidth:0, flex:1}}><div className="h" style={{fontSize:14, color:T.tealDk}}>Last 30 days — work by muscle</div><div style={{fontSize:11, color:T.sub}}>{fmtSets(muscleTotal)} credited sets · {pieData.length} muscle group{pieData.length===1?"":"s"}</div></div>
      <button onClick={()=>minimizeMuscle(false)} style={showSectionBtn}>Show</button>
    </div>
  ) : (
    <div className="card">
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
        <div className="h" style={{fontSize:17, color:T.tealDk, flex:1}}>Last 30 days — work by muscle</div>
        {own && <button onClick={()=>minimizeMuscle(true)} title="Minimize muscle chart" aria-label="Minimize muscle chart" style={minimizeBtn}>➖</button>}
      </div>
      <div style={{fontSize:12, color:T.sub, marginBottom:4}}>Main muscles get full credit, secondaries half — a bench set counts 1 for chest, ½ for triceps.</div>
      {pieData.length ? (
        <Suspense fallback={<ChartFallback h={230} />}><MusclePie data={pieData} /></Suspense>
      ) : <div style={{color:T.sub, fontSize:14}}>Log some sets and your split shows up here.</div>}
    </div>
  );

  widgets.recap = <YearRecap data={data} setData={own ? setData : null} />;

  return (<>
    {own && coachEnabled && user && <CoachCard data={data} exMap={exMap} user={user} setData={setData} onOpenLog={()=>setTab("log")} />}
    {own && isPro === false && <ProUpsellCard openSettings={openSettings} setTab={setTab} nutritionOn={nutritionOn} />}
    {own && (
      <div style={{display:"flex", justifyContent:"flex-end", marginBottom:10}}>
        <button onClick={()=>setArrange(a=>!a)} style={{
          background: arrange ? T.green : T.input, color: arrange ? "#000" : T.sub,
          border:`1px solid ${arrange ? T.green : T.line}`, padding:"6px 14px", fontSize:13, fontWeight:700,
        }}>{arrange ? "✓ Done arranging" : "⇅ Arrange"}</button>
      </div>
    )}
    <DragList ids={own ? wOrder : DASH_WIDGETS} setIds={setWOrder} enabled={arrange && own}
      renderItem={(id) => widgets[id]} />
  </>);
}

/* Home upsell shown to non-Pro users: clean cards advertising what Pro unlocks. */
function ProUpsellCard({ openSettings }) {
  const feats = [
    ["💪", "Lab's AI Coach", "Personalized progression, plateau & weak-point advice from your logs."],
    ["👟", "Apple Health steps", "Sync steps by iPhone Shortcut, plus duels and a group board."],
    ["🎨", "Themes", "Recolor the app — accent colors + dark palettes."],
  ];
  return (
    <div className="card pro-hero" style={{ marginBottom: 14, overflow: "hidden",
      border: "1px solid rgba(var(--accent-rgb),.42)",
      background: "radial-gradient(120% 90% at 0% 0%, rgba(var(--accent-rgb),.18), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--card) 88%, #fff 6%), var(--card) 70%)",
      boxShadow: "0 14px 40px -18px rgba(var(--accent-rgb),.55), 0 1px 0 rgba(255,255,255,.06) inset" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
        <div className="recap-title" style={{ fontSize: 22, fontWeight: 900, letterSpacing: .3 }}>✨ The Lab Pro</div>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#05140b", background: "linear-gradient(100deg, rgb(var(--accent-rgb)), #8fe3a0)", padding: "3px 9px", borderRadius: 99, letterSpacing: .5, boxShadow: "0 2px 10px rgba(var(--accent-rgb),.45)" }}>UPGRADE</span>
      </div>
      <div style={{ fontSize: 13, color: T.sub, marginBottom: 14, lineHeight: 1.5 }}>Unlock the coach, steps and themes — everything that makes The Lab <b style={{color:T.ink}}>yours</b>.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 15 }}>
        {feats.map(([icon, title, desc]) => (
          <div key={title} className="pro-feat" style={{ background: "color-mix(in srgb, var(--input) 88%, transparent)", border: `1px solid ${T.line}`, borderRadius: 14, padding: "12px 13px", transition: "border-color .18s ease, transform .18s ease" }}>
            <div style={{ fontSize: 22, marginBottom: 5, filter: "drop-shadow(0 2px 7px rgba(var(--accent-rgb),.35))" }}>{icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 3 }}>{title}</div>
            <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.45 }}>{desc}</div>
          </div>
        ))}
      </div>
      <button onClick={openSettings} className="btn-primary" style={{ width: "100%", fontSize: 15.5, padding: "14px" }}>See Pro plans →</button>
    </div>
  );
}
const kpiN = { fontWeight:800, fontSize:28, color:T.ink };
const kpiL = { fontSize:11.5, color:T.sub };


/* ================= RECORDS ================= */
function RecordsTab({ data, exMap, setData }) {
  const setNote = (name, text) => setData?.(d => {
    const notes = { ...(d.prNotes || {}) };
    if (text.trim()) notes[name] = text; else delete notes[name];
    return { ...d, prNotes: notes };
  });
  const units = useUnit();
  const canMinimize = typeof setData === "function";
  const minimized = canMinimize && !!data.profile?.minimizedSections?.personalRecords;
  const setMinimizedSaved = (value) => setData?.(d=>({ ...d, profile:{ ...(d.profile||{}), minimizedSections:{ ...(d.profile?.minimizedSections||{}), personalRecords:value } } }));
  const rows = useMemo(() => data.exercises.map(ex => {
    const entries = data.log.filter(e => e.exercise===ex.name && !e.quick && (e.reps||0)>0);
    if (!entries.length) return { ...ex, empty:true };
    const isBW = ex.type==="Bodyweight";
    const mostReps = Math.max(...entries.map(e=>e.reps));
    const lastDone = entries.reduce((a,b)=>a.date>b.date?a:b).date;
    const byDate = {};
    for (const e of entries) {
      const v = isBW ? e.reps : e1rm(e.weight||0, e.reps);
      byDate[e.date] = Math.max(byDate[e.date]||0, v);
    }
    const spark = Object.keys(byDate).sort().map(k=>byDate[k]).slice(-10);
    const sessions = Object.keys(byDate).length;
    if (isBW) return { ...ex, isBW:true, heaviest:"BW", best:"BW", est:null, mostReps, vol:"—", lastDone, spark, sessions };
    const maxW = Math.max(...entries.map(e=>e.weight||0));
    const repsAtMax = Math.max(...entries.filter(e=>e.weight===maxW).map(e=>e.reps));
    const bestEntry = entries.reduce((a,b)=> e1rm(b.weight||0,b.reps)>e1rm(a.weight||0,a.reps)?b:a);
    const vol = Math.max(...entries.map(e=>(e.weight||0)*e.reps));
    return { ...ex, isBW:false, heaviest:`${dispW(maxW,units)} × ${repsAtMax}`, best:`${dispW(bestEntry.weight,units)} × ${bestEntry.reps}`,
      est: dispW(e1rm(bestEntry.weight, bestEntry.reps), units), mostReps, vol: Math.round(dispW(vol,units)), lastDone, spark, sessions };
  }), [data, units]);
  const logged = rows.filter(r=>!r.empty);

  const [filter, setFilter] = useState("All");
  const [recQ, setRecQ] = useState("");
  const [openEx, setOpenEx] = useState(null);
  const hits = (r, m) => musclesOf(r).includes(m) || secondariesOf(r).includes(m);
  const present = MUSCLES.filter(m => logged.some(r => hits(r, m)));
  const q = recQ.trim().toLowerCase();
  const shown = (filter==="All" ? logged : logged.filter(r => hits(r, filter)))
    .filter(r => !q || r.name.toLowerCase().includes(q))
    .slice().sort((a,b)=>b.lastDone.localeCompare(a.lastDone) || a.name.localeCompare(b.name));

  if (minimized) return (
    <div className="card compact-card" style={{display:"flex", alignItems:"center", gap:8}}>
      <span style={{fontSize:17}}>🏆</span>
      <div style={{minWidth:0, flex:1}}><div className="h" style={{fontSize:14, color:T.tealDk}}>Personal records</div><div style={{fontSize:11, color:T.sub}}>{logged.length} lift{logged.length===1?"":"s"} with saved records</div></div>
      <button onClick={()=>setMinimizedSaved(false)} style={showSectionBtn}>Show</button>
    </div>
  );

  const statBox = { background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"8px 10px" };
  const statL = { fontSize:10.5, color:T.sub, textTransform:"uppercase", letterSpacing:".6px", fontWeight:600 };
  const statV = { fontSize:15, fontWeight:700, color:T.ink, marginTop:2 };

  return (<>
    <div className="card">
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:2}}>
        <div className="h" style={{fontSize:19, color:T.tealDk, flex:1}}>🏆 Personal records</div>
        {canMinimize && <button onClick={()=>setMinimizedSaved(true)} title="Minimize personal records" aria-label="Minimize personal records" style={minimizeBtn}>➖</button>}
      </div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:12}}>Best-ever numbers per lift, in {uLabel(units)} — freshest first. Tap a lift for the full breakdown.</div>
      <input value={recQ} onChange={e=>setRecQ(e.target.value)} placeholder="🔍 Search lifts…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:8}} />
      {/* muscle filter chips (scroll sideways if they overflow) */}
      <div style={{display:"flex", gap:6, overflowX:"auto", paddingBottom:2, WebkitOverflowScrolling:"touch"}}>
        {["All", ...present].map(m=>{
          const on = filter===m;
          return (
          <button key={m} onClick={()=>setFilter(m)} style={{
            flexShrink:0, padding:"6px 14px", borderRadius:99, fontSize:13, fontWeight:700,
            background: on ? "linear-gradient(180deg, rgba(var(--accent-rgb),.22), rgba(var(--accent-rgb),.12))" : T.input,
            color: on ? T.green : T.sub,
            border:`1px solid ${on ? "rgba(var(--accent-rgb),.4)" : T.line}`,
            boxShadow: on ? "0 0 0 1px rgba(var(--accent-rgb),.15) inset" : "none",
          }}>{m}</button>
          );
        })}
      </div>
    </div>

    {!logged.length && (
      <div className="card" style={{color:T.sub, fontSize:14, textAlign:"center", padding:"30px 16px"}}>
        No lifts logged yet — records build themselves as you train. 🏗️
      </div>
    )}

    {shown.map(r=>{
      const open = openEx === r.name;
      return (
        <div key={r.name} className="card" onClick={()=>setOpenEx(o=>o===r.name?null:r.name)}
          style={{padding:"13px 14px", marginBottom:8, cursor:"pointer", borderColor: open ? T.green : T.line}}>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:15.5, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{r.name}</div>
              {BIG_LIFT_SET.has(r.name) && (data.prNotes?.[r.name]
                ? <div style={{fontSize:11.5, color:T.ink, marginTop:2, fontStyle:"italic", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>💬 {data.prNotes[r.name]}</div>
                : <div style={{fontSize:11, color:T.sub, marginTop:2}}>Tap to add a PR note</div>)}
            </div>
            <div style={{textAlign:"right", flexShrink:0}}>
              <div style={{fontSize:17, fontWeight:800, color:T.green}}>
                {r.isBW ? r.mostReps : r.est}<span style={{fontSize:11, color:T.sub, fontWeight:600}}> {r.isBW ? "reps" : uLabel(units)}</span>
              </div>
              <div style={{fontSize:10.5, color:T.sub}}>{r.isBW ? "best set" : "est. 1RM"}</div>
            </div>
            <Spark pts={r.spark} />
            <span style={{color:T.sub, fontSize:12, transform: open ? "rotate(90deg)" : "none", transition:"transform .15s ease"}}>▶</span>
          </div>
          {open && (
            <div onClick={e=>e.stopPropagation()} style={{animation:"fadeSwap .18s ease-out both"}}>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginTop:12}}>
                <div style={statBox}><div style={statL}>Heaviest</div><div style={statV}>{r.heaviest}</div></div>
                <div style={statBox}><div style={statL}>Best set</div><div style={statV}>{r.best}</div></div>
                <div style={statBox}><div style={statL}>Most reps</div><div style={statV}>{r.mostReps}</div></div>
                <div style={statBox}><div style={statL}>Top volume</div><div style={statV}>{r.vol}</div></div>
                <div style={statBox}><div style={statL}>Sessions</div><div style={statV}>{r.sessions}</div></div>
                <div style={statBox}><div style={statL}>Last done</div><div style={statV}>{fmtDate(r.lastDone)}</div></div>
              </div>
              {BIG_LIFT_SET.has(r.name) && (
                <div style={{marginTop:11}}>
                  <div style={{...statL, marginBottom:5}}>💬 PR note — shows in your groups</div>
                  <input value={data.prNotes?.[r.name] || ""} onChange={e=>setNote(r.name, e.target.value.slice(0,50))} maxLength={50}
                    placeholder="e.g. finally 2 plates 🔥" style={{width:"100%"}} />
                  <div style={{fontSize:10.5, color:T.sub, textAlign:"right", marginTop:3}}>{(data.prNotes?.[r.name]||"").length}/50</div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    })}
    {logged.length > 0 && !shown.length && (
      <div className="card" style={{color:T.sub, fontSize:14, textAlign:"center"}}>{recQ ? `Nothing matches "${recQ.trim()}".` : `Nothing logged for ${filter} yet.`}</div>
    )}
  </>);
}

/* ================= BODY WEIGHT ================= */
/* ---------- BMI (height saved once; weight auto-follows the latest weigh-in) ---------- */
const BMI_CATS = [
  { max: 18.5, label: "Underweight", color: "#E3BE55" },
  { max: 25,   label: "Normal",      color: T.green },
  { max: 30,   label: "Overweight",  color: "#E3BE55" },
  { max: Infinity, label: "Obese",   color: T.down },
];
/* ---------- goal weight (MyFitnessPal-style: bar from start -> goal, pace ETA) ---------- */
function GoalCard({ data, setData, current, rows, readOnly = false, who = "They" }) {
  const units = useUnit();
  const goal = data.profile?.goalWeight || null;         // lb
  const start = data.profile?.goalStartWeight || null;   // lb, weight when the goal was set
  const [inp, setInp] = useState("");
  const [editing, setEditing] = useState(false);

  const save = () => {
    const v = parseFloat(inp);
    if (!v || v <= 0 || !current) return;
    setData(d => ({ ...d, profile: { ...(d.profile||{}), goalWeight: toLb(v, units), goalStartWeight: current.weight, goalSetDate: todayStr() } }));
    setInp(""); setEditing(false);
  };
  const clear = () => setData(d => ({ ...d, profile: { ...(d.profile||{}), goalWeight: null, goalStartWeight: null, goalSetDate: null } }));

  if (!current) return null; // needs at least one weigh-in

  // read-only (someone else's profile): show their goal, or a subtle "no goal" line
  if (readOnly) {
    if (!goal) return (
      <div className="card" style={{color:T.sub, fontSize:13.5}}>🎯 {who} set a goal weight yet.</div>
    );
  } else if (!goal || editing) return (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:4}}>🎯 Goal weight</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>Set a target and every weigh-in moves the progress bar — cutting or bulking both work.</div>
      <div style={{display:"flex", gap:8}}>
        <input type="number" inputMode="decimal" value={inp} onChange={e=>setInp(e.target.value)}
          placeholder={`e.g. ${dispW(current.weight, units) + (units==="kg" ? -5 : -10)}`} style={{flex:1}} />
        <button onClick={save} disabled={!parseFloat(inp)}
          style={{background:T.green, color:"#000", padding:"0 18px", fontWeight:700, opacity:parseFloat(inp)?1:0.45}}>Set goal</button>
        {editing && <button onClick={()=>setEditing(false)} style={{background:T.input, color:T.sub, padding:"0 14px", fontWeight:600}}>Cancel</button>}
      </div>
      <div style={{fontSize:11.5, color:T.sub, marginTop:6}}>In {uLabel(units)} — you're at {showW(current.weight, units)} now.</div>
    </div>
  );

  const span = goal - start;                       // + bulking, - cutting
  const done = current.weight - start;
  const pct = span === 0 ? 100 : Math.max(0, Math.min(100, done / span * 100));
  const remain = goal - current.weight;            // + still to gain, - still to lose
  const reached = span >= 0 ? current.weight >= goal : current.weight <= goal;

  /* pace from the last 30 days of weigh-ins -> ETA */
  let eta = null, wrongWay = false;
  const cutoff = new Date(todayStr()+"T00:00"); cutoff.setDate(cutoff.getDate()-30);
  const recent = rows.filter(r => new Date(r.date+"T00:00") >= cutoff);
  if (!reached && recent.length >= 2) {
    const daysSpan = (new Date(recent[recent.length-1].date+"T00:00") - new Date(recent[0].date+"T00:00")) / 864e5;
    if (daysSpan >= 7) {
      const rate = (recent[recent.length-1].weight - recent[0].weight) / daysSpan; // lb/day
      if (Math.abs(rate) > 0.01) {
        const daysLeft = remain / rate;
        if (daysLeft > 0) { const d = new Date(); d.setDate(d.getDate() + Math.round(daysLeft)); eta = d.toLocaleDateString("en-US", { month:"short", day:"numeric" }); }
        else wrongWay = true;
      }
    }
  }

  const showPct = reached ? 100 : pct;
  return (
    <div className="card" style={reached ? {borderColor:T.green} : undefined}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
        <div className="h" style={{fontSize:17, color:T.tealDk}}>🎯 Goal weight</div>
        {!readOnly && (
          <div style={{display:"flex", gap:4, alignItems:"center"}}>
            <PencilBtn onClick={()=>{setEditing(true); setInp(String(dispW(goal, units)));}} />
            <ConfirmX onConfirm={clear} />
          </div>
        )}
      </div>

      {/* hero */}
      <div style={{textAlign:"center", marginBottom:14}}>
        {reached ? (<>
          <div style={{fontSize:26, fontWeight:800, color:T.green, lineHeight:1.15}}>🎉 Goal reached</div>
          <div style={{fontSize:12.5, color:T.sub, marginTop:3}}>You hit {showW(goal, units)} — set the next one when you're ready.</div>
        </>) : (<>
          <div style={{fontSize:32, fontWeight:800, color:T.green, lineHeight:1.1}}>
            {Math.abs(dispW(remain, units))}<span style={{fontSize:15, color:T.sub, fontWeight:600}}> {uLabel(units)} {remain > 0 ? "to gain" : "to lose"}</span>
          </div>
          <div style={{fontSize:12.5, color:T.sub, marginTop:3}}>{Math.round(pct)}% of the way there</div>
        </>)}
      </div>

      {/* progress bar with position marker */}
      <div style={{position:"relative", height:12, background:T.input, borderRadius:99, marginBottom:8}}>
        <div style={{position:"absolute", inset:0, width:`${showPct}%`, background:`linear-gradient(90deg, rgba(var(--accent-rgb),.55), ${T.green})`, borderRadius:99, transition:"width .6s ease"}} />
        <div style={{position:"absolute", top:"50%", left:`${showPct}%`, transform:"translate(-50%,-50%)",
          width:18, height:18, borderRadius:99, background:"#FFF", border:`3px solid ${T.green}`,
          boxShadow:"0 1px 6px rgba(0,0,0,.5)", transition:"left .6s ease"}} />
      </div>

      {/* start / now / goal */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", textAlign:"center", marginTop:12}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.sub}}>{dispW(start, units)}</div><div style={kpiL}>Start</div></div>
        <div><div style={{fontSize:20, fontWeight:800, color:T.ink}}>{dispW(current.weight, units)}</div><div style={kpiL}>Now</div></div>
        <div><div style={{fontSize:16, fontWeight:700, color:T.green}}>{dispW(goal, units)}</div><div style={kpiL}>Goal</div></div>
      </div>

      {(eta || wrongWay) && !reached && (
        <div style={{textAlign:"center", marginTop:10}}>
          {eta && <span className="chip" style={{background:T.mint, color:T.green}}>📅 On pace for {eta}</span>}
          {wrongWay && <span className="chip" style={{background:"#2A1105", color:T.down}}>Trending the wrong way — you've got this 💪</span>}
        </div>
      )}
    </div>
  );
}

function BMICard({ data, setData, hunit, current }) {
  const units = useUnit();
  const saved = data.profile?.heightIn || null; // inches, canonical
  const [ft, setFt] = useState(saved ? String(Math.floor(saved / 12)) : "");
  const [inch, setInch] = useState(saved ? String(Math.round((saved % 12) * 10) / 10) : "");
  const [cm, setCm] = useState(saved ? String(Math.round(saved * 2.54)) : "");
  const typedIn = hunit === "cm"
    ? (parseFloat(cm) || 0) / 2.54
    : (parseFloat(ft) || 0) * 12 + (parseFloat(inch) || 0);
  const canSave = typedIn >= 36 && typedIn <= 96; // 3ft–8ft sanity window
  const dirty = canSave && Math.abs(typedIn - (saved || 0)) > 0.05;
  const save = () => setData(d => ({ ...d, profile: { ...(d.profile || {}), heightIn: Math.round(typedIn * 10) / 10 } }));

  const bmi = saved && current ? Math.round(703 * current.weight / (saved * saved) * 10) / 10 : null;
  const cat = bmi != null ? BMI_CATS.find(c => bmi < c.max) : null;
  const lo = saved ? 18.5 * saved * saved / 703 : null, hi = saved ? 24.9 * saved * saved / 703 : null;
  const hLabel = saved ? (hunit === "cm" ? `${Math.round(saved * 2.54)} cm` : `${Math.floor(saved / 12)}'${Math.round(saved % 12)}"`) : null;

  return (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:4}}>🧮 BMI</div>
      <div style={{fontSize:12, color:T.sub, marginBottom:10}}>
        Uses your latest weigh-in automatically — just set your height once.
        (Height unit switches to cm in ⚙️ Settings.)
      </div>
      <div style={{display:"flex", gap:8, alignItems:"flex-end", flexWrap:"wrap", marginBottom: bmi != null ? 12 : 0}}>
        {hunit === "cm" ? (
          <label style={{...lbl, flex:1, minWidth:110, marginBottom:0}}>Height (cm)
            <input type="number" inputMode="decimal" value={cm} onChange={e=>setCm(e.target.value)} placeholder="e.g. 180" />
          </label>
        ) : (<>
          <label style={{...lbl, flex:1, minWidth:80, marginBottom:0}}>Height (ft)
            <input type="number" inputMode="numeric" value={ft} onChange={e=>setFt(e.target.value)} placeholder="5" />
          </label>
          <label style={{...lbl, flex:1, minWidth:80, marginBottom:0}}>+ inches
            <input type="number" inputMode="decimal" value={inch} onChange={e=>setInch(e.target.value)} placeholder="11" />
          </label>
        </>)}
        {(dirty || !saved) && (
          <button onClick={save} disabled={!canSave} style={{background:T.green, color:"#000", padding:"11px 18px", fontWeight:700, opacity:canSave?1:0.45}}>
            Save height
          </button>
        )}
      </div>
      {!saved ? (
        <div style={{fontSize:13, color:T.sub, marginTop:10}}>Type your height and hit save — BMI shows up right here.</div>
      ) : !current ? (
        <div style={{fontSize:13, color:T.sub}}>Log a weigh-in above and your BMI appears here.</div>
      ) : (
        <>
          <div style={{display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap"}}>
            <span style={{fontSize:34, fontWeight:800, color:cat.color}}>{bmi}</span>
            <span className="chip" style={{background:"none", border:`1px solid ${cat.color}`, color:cat.color}}>{cat.label}</span>
          </div>
          {current.weight < lo && (
            <div style={{fontSize:13.5, fontWeight:700, color:cat.color, marginTop:6}}>
              {Math.round(dispW(lo - current.weight, units))} {uLabel(units)} below the healthy range — gaining that puts you at Normal.
            </div>
          )}
          {current.weight > hi && (
            <div style={{fontSize:13.5, fontWeight:700, color:cat.color, marginTop:6}}>
              {Math.round(dispW(current.weight - hi, units))} {uLabel(units)} above the healthy range.
            </div>
          )}
          <div style={{fontSize:12.5, color:T.sub, marginTop:6}}>
            {hLabel} · {showW(current.weight, units)} (latest weigh-in, {fmtDate(current.date)})
            <br/>Healthy-BMI weight range for your height: <b style={{color:T.ink}}>{Math.round(dispW(lo,units))}–{Math.round(dispW(hi,units))} {uLabel(units)}</b>
            <br/>Heads up: BMI can't tell muscle from fat — lifters often read a category high.
          </div>
        </>
      )}
    </div>
  );
}

function BodyTab({ data, setData, hunit }) {
  const units = useUnit();
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState("");
  const [creatine, setCreatine] = useState("No");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(null); // date of the weigh-in whose note is expanded
  const [weightChartView, setWeightChartView] = useState("monthly");
  const rows = useMemo(()=>[...data.bodyweight].sort((a,b)=>a.date.localeCompare(b.date)),[data.bodyweight]);

  const current = rows.length ? rows[rows.length-1] : null;
  const starting = rows.length ? rows[0] : null;
  const change = current && starting ? (current.weight - starting.weight) : null;
  const changeDisp = change==null ? null : dispW(change, units);
  // Weight changes are only "good" relative to the person's saved goal. A loss
  // goal makes decreases green; a gain goal makes increases green. With no goal,
  // direction is neutral instead of assuming that everybody wants to gain.
  const goalWeight = data.profile?.goalWeight ?? null;
  const goalStartWeight = data.profile?.goalStartWeight ?? starting?.weight ?? null;
  const goalDirection = goalWeight == null || goalStartWeight == null ? null : Math.sign(goalWeight - goalStartWeight); // -1 lose, +1 gain, 0 maintain
  const weightChangeColor = (delta) => {
    if (delta == null) return T.ink;
    if (Math.abs(delta) < 0.05) return T.sub;
    if (goalDirection == null) return T.sub;
    if (goalDirection === 0) return T.down;
    return Math.sign(delta) === goalDirection ? T.green : T.down;
  };

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
      out.push({ key:k, label:monthLabel(k), avg, creatine:cr, count:rs.length });
      m++; if (m>12){m=1;y++;}
    }
    return out;
  }, [rows]);

  const monthlyChartData = months.map(m=>({ key:m.key, label:m.label, tipLabel:m.label, value:dispW(m.avg, units), sub:m.avg==null?"No weigh-ins":`${m.count} weigh-in${m.count===1?"":"s"}` }));
  const weighInChartData = rows.map(r=>{const [,mo,day]=r.date.split("-");return {key:r.date,label:`${+mo}/${+day}`,tipLabel:fmtDate(r.date),value:dispW(r.weight,units),sub:r.note||"Individual weigh-in"};});
  const bodyChartData = weightChartView==="monthly"?monthlyChartData:weighInChartData;

  const add = () => {
    if (!weight) return;
    setData(d=>({ ...d, bodyweight:[...d.bodyweight.filter(r=>r.date!==date), { date, weight:toLb(parseFloat(weight), units), creatine, note:note.trim() }] }));
    setWeight(""); setNote("");
  };

  const [edit, setEdit] = useState(null); // { orig (original date), date, weight, creatine, note }
  const saveEdit = () => {
    if (!edit.weight) return;
    // drop the old row plus any row already on the new date, then add the edited one
    setData(d=>({ ...d, bodyweight:[...d.bodyweight.filter(r=>r.date!==edit.orig && r.date!==edit.date),
      { date:edit.date, weight:toLb(parseFloat(edit.weight), units), creatine:edit.creatine, note:(edit.note||"").trim() }] }));
    setEdit(null);
  };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:10}}>⚖️ Log a weigh-in</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12}}>
        <DateField label="Date" value={date} max={todayStr()} onChange={setDate} />
        <label style={lbl}>Weight ({uLabel(units)})<input type="number" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} /></label>
        <label style={lbl}>Creatine today?<select value={creatine} onChange={e=>setCreatine(e.target.value)}><option>No</option><option>Yes</option></select></label>
      </div>
      <label style={{...lbl, marginBottom:12}}>Note <span style={{color:T.sub, fontWeight:500}}>(optional)</span>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
          placeholder="How'd you feel? e.g. felt full, big water day, slept great, sore…"
          style={noteInput} />
      </label>
      <button onClick={add} disabled={!weight} className="btn-primary" style={{width:"100%", padding:"14px", fontSize:16}}>Save weigh-in</button>
    </div>

    <div className="card" style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, textAlign:"center"}}>
      <div><div style={kpiN}>{current?dispW(current.weight,units):"—"}</div><div style={kpiL}>Current</div></div>
      <div><div style={kpiN}>{starting?dispW(starting.weight,units):"—"}</div><div style={kpiL}>Starting</div></div>
      <div><div style={{...kpiN, color:weightChangeColor(change)}}>{changeDisp!=null?(changeDisp>0?"+":"")+changeDisp:"—"}</div><div style={kpiL}>Change ({uLabel(units)})</div></div>
      <div><div style={{...kpiN, fontSize:20, paddingTop:8}}>{current?fmtDate(current.date):"—"}</div><div style={kpiL}>Latest</div></div>
    </div>

    <GoalCard data={data} setData={setData} current={current} rows={rows} />

    <BMICard data={data} setData={setData} hunit={hunit} current={current} />

    <div className="card">
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}><div className="h" style={{fontSize:17,color:T.tealDk,flex:1}}>Body weight</div><div style={{display:"flex",gap:3,padding:3,background:T.input,borderRadius:99}}>{[["monthly","Monthly average"],["entries","Every weigh-in"]].map(([value,label])=><button key={value} type="button" onClick={()=>setWeightChartView(value)} aria-pressed={weightChartView===value} style={{padding:"5px 10px",borderRadius:99,background:weightChartView===value?T.mint:"transparent",border:`1px solid ${weightChartView===value?T.green:"transparent"}`,color:weightChartView===value?T.green:T.sub,fontSize:10.5,fontWeight:800}}>{label}</button>)}</div></div>
      <div style={{fontSize:12, color:T.sub, marginBottom:6}}>{weightChartView==="monthly"?"One point per monthly average; months without data stay blank.":"One point for every saved weigh-in."} Tap a point to see its exact value.</div>
      {bodyChartData.length ? (
        <Suspense fallback={<ChartFallback h={220} />}><BodyChart data={bodyChartData} unit={" "+uLabel(units)} goalDirection={goalDirection} /></Suspense>
      ) : <div style={{color:T.sub, fontSize:14}}>Log a weigh-in and the trend starts here.</div>}
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Monthly average</div>
      <table><thead><tr><th>Month</th><th>Avg wt ({uLabel(units)})</th><th>vs prev</th><th>Creatine</th></tr></thead>
        <tbody>{(() => {
          // pair each month with the previous month that actually has an average
          const withPrev = months.map((m, i) => {
            let prev = null;
            for (let j = i - 1; j >= 0; j--) if (months[j].avg != null) { prev = months[j].avg; break; }
            return { ...m, diff: (m.avg != null && prev != null) ? dispW(m.avg - prev, units) : null };
          });
          return [...withPrev].reverse().map(m=>(
            <tr key={m.key}><td>{m.label}</td><td style={{fontWeight:600}}>{m.avg==null ? "-" : dispW(m.avg, units)}</td>
              <td style={{color:weightChangeColor(m.diff), fontWeight:700}}>
                {m.diff==null ? "—" : `${m.diff>0?"▲ +":m.diff<0?"▼ ":""}${m.diff===0?"0":Math.abs(m.diff)}`}
              </td>
              <td style={{color:T.sub}}>{m.creatine}</td></tr>
          ));
        })()}
        {!months.length && <tr><td colSpan={4} style={{color:T.sub}}>No weigh-ins yet.</td></tr>}
        </tbody></table>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>All weigh-ins</div>
      <table><thead><tr><th>Date</th><th>Weight ({uLabel(units)})</th><th>Creatine</th><th></th></tr></thead>
        <tbody>{[...rows].reverse().map(r=>{
          const hasNote = !!(r.note && r.note.trim());
          const open = noteOpen === r.date;
          return (<Fragment key={r.date}>
          <tr><td style={{whiteSpace:"nowrap"}}>{fmtDate(r.date)}</td><td>{dispW(r.weight,units)}</td><td>{r.creatine}</td>
            <td style={{whiteSpace:"nowrap", textAlign:"right"}}>
              {hasNote && (
                <button className="note-btn" onClick={()=>setNoteOpen(open?null:r.date)}
                  title={open?"Hide note":"Show note"}
                  style={{ background:"none", color:open?T.green:T.sub, fontSize:12.5, fontWeight:700, padding:"2px 7px" }}>
                  <span className={"note-caret"+(open?" open":"")}>▸</span> Note
                </button>
              )}
              <PencilBtn onClick={()=>setEdit({ orig:r.date, date:r.date, weight:dispW(r.weight,units), creatine:r.creatine||"No", note:r.note||"" })} />
              <ConfirmX onConfirm={()=>setData(d=>({...d, bodyweight:d.bodyweight.filter(x=>x.date!==r.date)}))} />
            </td></tr>
          {hasNote && open && (
            <tr><td colSpan={4} style={{padding:"2px 4px 8px"}}>
              <div className="note-reveal" style={noteBox}>
                <span style={{fontSize:15, lineHeight:1, flexShrink:0}}>📝</span>
                <span style={{fontSize:13.5, color:T.ink, lineHeight:1.45, whiteSpace:"pre-wrap"}}>{r.note}</span>
              </div>
            </td></tr>
          )}
          {edit?.orig === r.date && (
            <tr><td colSpan={4} style={{padding:"6px 4px"}}>
              <div style={editBox}>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10}}>
                  <DateField label="Date" value={edit.date} max={todayStr()} onChange={v=>setEdit(s=>({...s, date:v}))} />
                  <label style={lbl}>Weight ({uLabel(units)})<input type="number" inputMode="decimal" value={edit.weight} onChange={ev=>setEdit(s=>({...s, weight:ev.target.value}))} /></label>
                  <label style={lbl}>Creatine<select value={edit.creatine} onChange={ev=>setEdit(s=>({...s, creatine:ev.target.value}))}><option>No</option><option>Yes</option></select></label>
                </div>
                <label style={{...lbl, marginBottom:10}}>Note <span style={{color:T.sub, fontWeight:500}}>(optional)</span>
                  <textarea value={edit.note||""} rows={2} onChange={ev=>setEdit(s=>({...s, note:ev.target.value}))}
                    placeholder="How'd you feel?" style={noteInput} />
                </label>
                <div style={{display:"flex", gap:8}}>
                  <button onClick={saveEdit} disabled={!edit.weight} style={{...saveSm, opacity:edit.weight?1:0.45}}>Save changes</button>
                  <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                </div>
              </div>
            </td></tr>
          )}
        </Fragment>);})}</tbody></table>
    </div>
  </>);
}

/* ================= CARDIO ================= */
/* ---- step helpers (module-level so the tab and member popups share them) ---- */
const dAdd = (ds,n)=>{ const d=new Date(ds+"T00:00"); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const stepAvg = (a)=> a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length) : 0;
/* "just now" / "5 min ago" / "3h ago" / "2d ago" from an ISO timestamp. */
const stepRel = (iso) => { if (!iso) return null; const ms = Date.now() - new Date(iso).getTime();
  return ms<60000 ? "just now" : ms<3600000 ? `${Math.floor(ms/60000)} min ago` : ms<86400000 ? `${Math.floor(ms/3600000)}h ago` : `${Math.floor(ms/86400000)}d ago`; };

/* Merge auto-synced steps (steps table) with manually-logged cardio "Steps" entries into
   one day->count map, plus a day->source map ("auto" | "manual" | "both"). */
function mergeSteps(autoMap, cardio) {
  const map = { ...(autoMap || {}) };
  const meta = {};
  for (const d in map) meta[d] = "auto";
  for (const c of (cardio || [])) {
    if (!c.steps || !c.date) continue;
    // If Apple Health already synced this day, that number is the source of truth —
    // keep it and DROP the manual entry so the day isn't double-counted. Manual only
    // fills days Health never synced.
    if (map[c.date] != null) { meta[c.date] = "both"; }   // synced value wins; no add
    else { map[c.date] = c.steps; meta[c.date] = "manual"; }
  }
  return { map, meta };
}

/* Build 1D/W/M/6M/Y/5Y bars from a day->count map. Pure — reused by the tab and popups. */
function computeStepChart(m, range) {
  const today = todayStr(); const yStr = dAdd(today,-1); let bars=[]; let every=1; const isAvg = !(range==="W"||range==="M"||range==="1D");
  if (range==="1D") {
    // "Yesterday" — the last few finished days so yesterday has a little context, totals not averages
    every=1;
    for (let i=4;i>=1;i--){ const d=dAdd(today,-i); const dt=new Date(d+"T00:00");
      bars.push({ label: dt.toLocaleDateString("en-US",{weekday:"short"}),
        full: d===yStr ? "Yesterday" : dt.toLocaleDateString("en-US",{weekday:"long", month:"short", day:"numeric"}),
        day: d, value: m[d]||0, has: m[d]!=null, mark: d===yStr }); }
  } else if (range==="W" || range==="M") {
    const n = range==="W"?7:30; every = range==="W"?1:5;
    for (let i=n-1;i>=0;i--){ const d=dAdd(today,-i); const dt=new Date(d+"T00:00");
      bars.push({ label: range==="W" ? dt.toLocaleDateString("en-US",{weekday:"narrow"}) : String(dt.getDate()),
        full: d===yStr ? "Yesterday" : d===today ? "Today" : dt.toLocaleDateString("en-US",{weekday:"short", month:"short", day:"numeric"}),
        day: d, value: m[d]||0, has: m[d]!=null, mark: d===yStr }); }
  } else if (range==="6M") {
    every = 4; const ws = weekStart(today);
    for (let i=25;i>=0;i--){ const start=dAdd(ws,-7*i); const days=[]; for(let k=0;k<7;k++){ const d=dAdd(start,k); if(m[d]!=null) days.push(m[d]); }
      bars.push({ label: new Date(start+"T00:00").toLocaleDateString("en-US",{month:"short"}),
        full: "Week of " + new Date(start+"T00:00").toLocaleDateString("en-US",{month:"short", day:"numeric"}),
        value: stepAvg(days), has: days.length>0 }); }
  } else if (range==="Y") {
    every = 1; const [yy,mm] = today.split("-").map(Number);
    for (let i=11;i>=0;i--){ const dt=new Date(yy, mm-1-i, 1); const key=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
      const days=Object.keys(m).filter(d=>d.startsWith(key)).map(d=>m[d]);
      bars.push({ label: dt.toLocaleDateString("en-US",{month:"narrow"}), full: dt.toLocaleDateString("en-US",{month:"long", year:"numeric"}), value: stepAvg(days), has: days.length>0 }); }
  } else { // 5Y
    every=1; const yy=Number(today.slice(0,4));
    for (let i=4;i>=0;i--){ const year=yy-i; const days=Object.keys(m).filter(d=>d.startsWith(String(year))).map(d=>m[d]);
      bars.push({ label:String(year), full:String(year), value: stepAvg(days), has: days.length>0 }); }
  }
  const wd = bars.filter(b=>b.has);
  return { bars, avg: stepAvg(wd.map(b=>b.value)), max: Math.max(1, ...bars.map(b=>b.value)), every, isAvg };
}

/* Lightweight dashboard loader: only the signed-in user's steps. */
function useOwnSteps(user, sinceDays, enabled=true) {
  const [mine,setMine]=useState({});
  useEffect(()=>{
    let alive=true;
    const uid=user?.id;
    if(!enabled||!uid){setMine({});return ()=>{alive=false;};}
    const load=()=>stepsFor([uid],dAdd(todayStr(),-sinceDays)).then(s=>{if(alive)setMine(s[uid]||{});}).catch(()=>{});
    load(); window.addEventListener("focus",load);
    return ()=>{alive=false;window.removeEventListener("focus",load);};
  },[user?.id,sinceDays,enabled]);
  return mine;
}

/* Shared loader: returns everyone's step maps (yourself + groupmates) plus a yesterday
   leaderboard and the all-logged-today flag. Reads the `steps` table (RLS-scoped). */
function useSteps(user, sinceDays) {
  const yStr = dAdd(todayStr(), -1);
  const [mine, setMine] = useState(undefined);
  const [all, setAll] = useState({});
  const [nameOf, setNameOf] = useState({});
  const [board, setBoard] = useState([]);
  const [celebrate, setCelebrate] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const reloadRef = useRef(() => {});
  useEffect(()=>{
    let alive = true;
    const load = async () => {
      try {
        const since = dAdd(todayStr(), -sinceDays);
        let groups=[]; try { groups = await listMyGroups(); } catch {}
        const nm = {}; const gm = [];
        for (const g of groups) { try {
          const mems = await listMembers(g.id);
          gm.push({ name:g.name, ids: mems.map(m=>m.user_id) });
          mems.forEach(m => { nm[m.user_id] = m.username; });
        } catch {} }
        const myName = user.user_metadata?.username || "you";
        nm[user.id] = nm[user.id] || myName;
        const ids = Array.from(new Set([user.id, ...Object.keys(nm)]));
        const s = await stepsFor(ids, since);
        if (!alive) return;
        setMine(s[user.id] || {}); setAll(s); setNameOf(nm);
        const bd = ids.map(id => ({ id, name: id===user.id ? myName : (nm[id]||"?"), me: id===user.id, steps: s[id]?.[yStr] ?? null }))
          .filter(r => r.steps != null).sort((a,b)=> b.steps - a.steps);
        setBoard(bd);
        lastStepSync(user.id).then(t => { if (alive) setLastSync(t); }).catch(()=>{});
        for (const g of gm) {
          if (g.ids.length >= 2 && g.ids.every(id => s[id]?.[yStr] != null)) {
            if (localStorage.getItem(`lt-allin-${yStr}`) !== "1") setCelebrate(g.name);
            break;
          }
        }
      } catch { if (alive) setMine(prev => prev === undefined ? {} : prev); }
    };
    reloadRef.current = load;
    load();
    // re-fetch when the app regains focus (e.g. after running the Sync shortcut and returning)
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [user.id, sinceDays]);
  const dismiss = () => { localStorage.setItem(`lt-allin-${yStr}`, "1"); setCelebrate(null); };
  return { mine, all, nameOf, board, celebrate, dismiss, yStr, myId: user.id, lastSync, reload: () => reloadRef.current() };
}

/* One reliable "Sync now" launcher — runs the phone shortcut via its URL scheme.
   Works only while the phone is unlocked (Apple's Health rule), which it is when you tap. */
function SyncNowButton({ block, small }) {
  const href = `shortcuts://run-shortcut?name=${encodeURIComponent("The Lab: Steps")}`;
  return (
    <a href={href} style={{ display: block ? "flex" : "inline-flex", width: block ? "100%" : "auto",
      alignItems:"center", justifyContent:"center", gap:7, background:"var(--cal-cardio)", color:"var(--cal-cardio-ink)", fontWeight:800,
      fontSize: small?12.5:14.5, padding: small?"7px 13px":"12px 16px", borderRadius: small?99:11, textDecoration:"none" }}>
      🔄 Sync now
    </a>
  );
}

/* Reusable goal ring + Apple-Health-style ranged chart for a single person's step map.
   Powers both your own tab and the tap-to-view popup for any groupmate. */
function StepRingChart({ map, goal, meta }) {
  const [range, setRange] = useState("M");
  const [sel, setSel] = useState(null);
  const plotRef = useRef(null);
  const hasManual = meta && Object.values(meta).some(v => v !== "auto");
  const srcLabel = { manual:"✍️ manual entry", both:"Apple Health + manual", auto:"Apple Health" };
  const m = map || {};
  const yStr = dAdd(todayStr(), -1);
  const yCount = m[yStr] || 0;
  const pct = Math.min(1, yCount/goal);
  const R=52, C=2*Math.PI*R;
  const hero = useMemo(()=>{ const seven=[]; for(let i=1;i<=7;i++){ const v=m[dAdd(todayStr(),-i)]; if(v!=null) seven.push(v); }
    const vals=Object.values(m); return { avg:stepAvg(seven), best:vals.length?Math.max(...vals):0 }; }, [map]);
  const chart = useMemo(()=>computeStepChart(m, range), [map, range]);
  const scrub = (x)=>{ const el=plotRef.current; if(!el) return; const r=el.getBoundingClientRect();
    const n=chart.bars.length; if(!n) return; const idx=Math.floor((x-r.left)/r.width*n); setSel(Math.max(0,Math.min(n-1,idx))); };
  const rangeSub = { "1D":"Yesterday", W:"Past week", M:"Past 30 days", "6M":"Past 6 months", Y:"Past year", "5Y":"Past 5 years" };
  const goalK = goal % 1000 === 0 ? `${goal/1000}k` : goal.toLocaleString();

  const hit = yCount >= goal;
  const remaining = Math.max(0, goal - yCount);
  return (<>
    <div className="card" style={{borderColor:hit?"var(--cal-cardio)":"color-mix(in srgb,var(--cal-cardio) 20%,var(--line))",background:"radial-gradient(120% 90% at 100% 0%,color-mix(in srgb,var(--cal-cardio) 10%,transparent),transparent 58%),var(--card)"}}>
      <div style={{display:"flex", alignItems:"center", gap:20}}>
        <div style={{position:"relative", width:120, height:120, flexShrink:0}}>
          <svg width="120" height="120">
            <circle cx="60" cy="60" r={R} fill="none" stroke={T.line} strokeWidth="10" />
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--cal-cardio)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C*(1-pct)} transform="rotate(-90 60 60)"
              style={{transition:"stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)", filter: hit ? "drop-shadow(0 0 6px color-mix(in srgb,var(--cal-cardio) 70%,transparent))" : "none"}} />
          </svg>
          <div style={{position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center"}}>
            <div style={{fontSize:23, fontWeight:900, color:T.ink, fontVariantNumeric:"tabular-nums", lineHeight:1}}>{yCount.toLocaleString()}</div>
            <div style={{fontSize:11, fontWeight:800, color: hit?"var(--cal-cardio)":T.sub, marginTop:3}}>{hit ? "✓ 100%" : `${Math.round(pct*100)}% of ${goalK}`}</div>
          </div>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div className="eyebrow" style={{fontSize:10, color:T.sub, marginBottom:7}}>Yesterday</div>
          {/* clear, high-contrast goal status — no more squinting */}
          <div style={{display:"inline-flex", alignItems:"center", gap:7, padding:"6px 12px", borderRadius:99, marginBottom:13,
            background: hit ? "var(--cal-cardio)" : yCount>0 ? "color-mix(in srgb,var(--cal-cardio) 12%,transparent)" : T.input,
            border: hit ? "none" : `1px solid ${T.line}`,
            boxShadow: hit ? "0 6px 18px -6px color-mix(in srgb,var(--cal-cardio) 70%,transparent)" : "none"}}>
            <span style={{fontSize:15}}>{hit ? "🏆" : yCount>0 ? "🚶" : "😴"}</span>
            <span style={{fontSize:13.5, fontWeight:800, color: hit ? "var(--cal-cardio-ink)" : yCount>0 ? "var(--cal-cardio)" : T.sub}}>
              {hit ? "Goal reached!" : yCount>0 ? `${remaining.toLocaleString()} steps to go` : "No steps yet"}
            </span>
          </div>
          <div style={{display:"flex", gap:18}}>
            <div><div style={{fontSize:18, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>{hero.avg.toLocaleString()}</div><div style={{fontSize:10.5, color:T.sub}}>7-day avg</div></div>
            <div><div style={{fontSize:18, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>{hero.best.toLocaleString()}</div><div style={{fontSize:10.5, color:T.sub}}>best day</div></div>
          </div>
        </div>
      </div>
    </div>

    <div className="card">
      <div style={{display:"flex", background:T.input, borderRadius:10, padding:3, gap:2, marginBottom:14}}>
        {["1D","W","M","6M","Y","5Y"].map(r=>(
          <button key={r} onClick={()=>{setRange(r); setSel(null);}} style={{flex:1, padding:"7px 0", borderRadius:8, fontSize:12, fontWeight:800,
            background: range===r?"var(--cal-cardio)":"none", color: range===r?"var(--cal-cardio-ink)":T.sub}}>{r}</button>
        ))}
      </div>

      {sel!=null && chart.bars[sel] ? (<>
        <div style={{fontSize:11, fontWeight:800, color:"var(--cal-cardio)", textTransform:"uppercase", letterSpacing:.6}}>
          {chart.bars[sel].full}
          {(() => { const s = meta && chart.bars[sel].day && chart.bars[sel].has ? meta[chart.bars[sel].day] : null;
            return s ? <span style={{color: s==="manual"?T.down:T.sub, marginLeft:6}}>· {srcLabel[s]}</span> : null; })()}
        </div>
        <div style={{display:"flex", alignItems:"baseline", gap:6}}>
          <span style={{fontSize:27, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>{chart.bars[sel].has ? chart.bars[sel].value.toLocaleString() : "—"}</span>
          <span style={{fontSize:13, color:T.sub}}>{chart.bars[sel].has ? (chart.isAvg ? "steps/day" : "steps") : "no data"}</span>
        </div>
        <div style={{fontSize:12, color:T.sub, marginBottom:14}}>{rangeSub[range]}</div>
      </>) : (<>
        <div style={{fontSize:11, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.6}}>Daily average</div>
        <div style={{display:"flex", alignItems:"baseline", gap:6}}>
          <span style={{fontSize:27, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>{chart.avg.toLocaleString()}</span>
          <span style={{fontSize:13, color:T.sub}}>steps/day</span>
        </div>
        <div style={{fontSize:12, color:T.sub, marginBottom:14}}>{rangeSub[range]} · <span style={{color:"var(--cal-cardio)"}}>tap a bar for details</span></div>
      </>)}

      <div ref={plotRef}
        onPointerDown={e=>scrub(e.clientX)} onPointerMove={e=>{ if (e.pointerType==="mouse" || e.buttons) scrub(e.clientX); }}
        onMouseLeave={()=>setSel(null)}
        style={{display:"flex", alignItems:"flex-end", gap: range==="W"?8:3, height:130, touchAction:"pan-y", cursor:"crosshair"}}>
        {chart.bars.map((b,i)=>(
          <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:5, minWidth:0, pointerEvents:"none"}}>
            <div className="vbar" style={{width:"100%", maxWidth: range==="W"?30:14, borderRadius:"4px 4px 2px 2px",
              height: b.has&&b.value>0 ? Math.max(4, (b.value/chart.max)*100) : 3,
              background: sel===i ? "#fff" : (meta && b.day && meta[b.day]==="manual") ? T.down : b.mark ? "var(--cal-cardio)" : b.has ? "color-mix(in srgb,var(--cal-cardio) 60%,var(--input))" : T.line,
              animationDelay:`${i*0.02}s`, transition:"background .12s ease"}} />
            <span style={{fontSize:9, color: (sel===i||b.mark)?"var(--cal-cardio)":T.sub, fontWeight: (sel===i||b.mark)?800:400, whiteSpace:"nowrap"}}>{(i%chart.every===0 || i===chart.bars.length-1) ? b.label : ""}</span>
          </div>
        ))}
      </div>
      {hasManual && (
        <div style={{display:"flex", gap:14, marginTop:10, fontSize:11, color:T.sub, flexWrap:"wrap"}}>
          <span style={{display:"flex", alignItems:"center", gap:5}}><span style={{width:9, height:9, borderRadius:2, background:"var(--cal-cardio)"}} /> Apple Health (auto)</span>
          <span style={{display:"flex", alignItems:"center", gap:5}}><span style={{width:9, height:9, borderRadius:2, background:T.down}} /> manually entered</span>
          <span>· hover a bar to check</span>
        </div>
      )}
    </div>
  </>);
}

/* Head-to-head step duels: instant-start, custom length, most total steps wins.
   Standings are summed from each person's step map over the duel window. */
function DuelsCard({ user, all, nameOf, myId, myName, proIds = [], minimized = false, onMinimizedChange }) {
  const oIsPro = (oId) => proIds.includes(oId);
  const [duels, setDuels] = useState([]);
  const [open, setOpen] = useState(false);
  const [oppId, setOppId] = useState("");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = async () => { try { setDuels(await listDuels()); } catch {} };
  useEffect(()=>{ load(); }, []);

  const today = todayStr();
  const opps = Object.entries(nameOf).filter(([id])=>id!==myId);
  const sumRange = (map, s, e)=>{ let t=0; const m=map||{}; for (const d in m) if (d>=s && d<=e) t+=m[d]; return t; };
  // only duels vs someone in THIS context's roster (nameOf) — so opening a group you don't
  // share with them won't show that duel. In the Steps tab nameOf = all your groupmates.
  const mine = duels.filter(d => {
    if (d.a_id!==myId && d.b_id!==myId) return false;
    const oId = d.a_id===myId ? d.b_id : d.a_id;
    return oId in nameOf;
  });

  const create = async () => {
    if (!oppId) return;
    const n = Math.max(1, Math.min(30, parseInt(days)||7));
    setBusy(true); setErr("");
    try { await createDuel(oppId, n); setOpen(false); setOppId(""); setDays("7"); await load(); }
    catch(e){ setErr(String(e?.message||e)); }
    finally { setBusy(false); }
  };
  const remove  = async (id) => { try { await deleteDuel(id); await load(); } catch {} };
  const accept  = async (d)  => { try { await acceptDuel(d.id); await load(); } catch(e){ setErr(String(e?.message||e)); } };
  const decline = async (id) => { try { await declineDuel(id); await load(); } catch {} };
  const forfeit = async (id) => { try { await forfeitDuel(id); await load(); } catch {} };
  const reqCancel = async (id) => { try { await requestDuelCancel(id); await load(); } catch {} };
  const undoCancel = async (id) => { try { await clearDuelCancel(id); await load(); } catch {} };

  const currentCount = mine.filter(d => d.status === "pending" || (d.status === "active" && today <= d.end_day)).length;
  if (minimized) return (
    <div className="card compact-card" style={{display:"flex", alignItems:"center", gap:8}}>
      <span style={{fontSize:17}}>⚔️</span>
      <div style={{minWidth:0, flex:1}}><div className="h" style={{fontSize:14, color:T.tealDk}}>Step duels</div><div style={{fontSize:11, color:T.sub}}>{currentCount} current duel{currentCount===1?"":"s"}{mine.length>currentCount?` · ${mine.length} total`:""}</div></div>
      <button onClick={()=>onMinimizedChange?.(false)} style={showSectionBtn}>Show</button>
    </div>
  );

  return (
    <div className="card">
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: (mine.length||open)?10:0}}>
        <div className="h" style={{fontSize:16, color:T.tealDk}}>⚔️ Step duels</div>
        <div style={{display:"flex", alignItems:"center", gap:7}}>
          {!open && <button onClick={()=>setOpen(true)} style={{background:T.green, color:"#000", fontWeight:800, fontSize:12.5, padding:"6px 13px", borderRadius:99}}>+ New</button>}
          <button onClick={()=>{setOpen(false);onMinimizedChange?.(true);}} title="Minimize step duels" aria-label="Minimize step duels" style={minimizeBtn}>➖</button>
        </div>
      </div>

      {open && (
        <div style={{background:T.input, border:`1px solid ${T.line}`, borderRadius:12, padding:12, marginBottom:12}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 92px", gap:8, marginBottom:8}}>
            <label style={lbl}>Opponent
              <select value={oppId} onChange={e=>setOppId(e.target.value)}>
                <option value="">— pick —</option>
                {opps.map(([id,name])=><option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label style={lbl}>Days<input type="number" inputMode="numeric" value={days} onChange={e=>setDays(e.target.value)} /></label>
          </div>
          {!opps.length && <div style={{fontSize:12, color:T.sub, marginBottom:8}}>Join a group with friends to duel them.</div>}
          {err && <div style={{color:T.danger, fontSize:12.5, marginBottom:8}}>{err}</div>}
          <div style={{display:"flex", gap:8}}>
            <button onClick={create} disabled={!oppId||busy} style={{flex:1, background:T.green, color:"#000", fontWeight:800, padding:"9px", opacity:(!oppId||busy)?0.5:1}}>{busy?"Sending…":"Send challenge ⚔️"}</button>
            <button onClick={()=>setOpen(false)} style={{background:T.card, color:T.sub, padding:"9px 14px"}}>Cancel</button>
          </div>
        </div>
      )}

      {!mine.length && !open && <div style={{fontSize:13, color:T.sub, marginTop:10}}>No duels yet — challenge a groupmate to a step battle 👊</div>}

      {mine.map(d=>{
        const meA = d.a_id===myId;
        const oId = meA ? d.b_id : d.a_id;
        const oName = meA ? d.b_name : d.a_name;

        // ---- pending: waiting on the opponent to accept ----
        if (d.status === "pending") {
          const iOwe = !meA; // I'm the one who needs to accept
          return (
            <div key={d.id} style={{borderTop:`1px solid ${T.creamLine}`, padding:"12px 0"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom: iOwe?9:0}}>
                <span style={{fontSize:13.5, fontWeight:800, color:T.ink}}>
                  {iOwe ? <>⚔️ {oName} challenged you</> : <>⏳ Waiting for {oName}…</>}
                </span>
                <span style={{fontSize:11.5, fontWeight:700, color:T.sub, background:T.input, padding:"3px 9px", borderRadius:99}}>{d.days||7}-day duel</span>
              </div>
              {iOwe ? (
                <div style={{display:"flex", gap:8}}>
                  <button onClick={()=>accept(d)} style={{flex:1, background:T.green, color:"#000", fontWeight:800, fontSize:13, padding:"9px", borderRadius:10}}>Accept ⚔️</button>
                  <button onClick={()=>decline(d.id)} style={{background:T.card, color:T.sub, fontWeight:700, fontSize:13, padding:"9px 16px", borderRadius:10}}>Decline</button>
                </div>
              ) : (
                <div style={{display:"flex", justifyContent:"flex-end", marginTop:4}}><ConfirmX label="Cancel" onConfirm={()=>remove(d.id)} /></div>
              )}
            </div>
          );
        }

        // ---- declined ----
        if (d.status === "declined") {
          return (
            <div key={d.id} style={{borderTop:`1px solid ${T.creamLine}`, padding:"11px 0", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span style={{fontSize:13, color:T.sub}}>{meA ? `${oName} declined the duel` : `You declined ${oName}'s duel`}</span>
              <ConfirmX label="Remove" onConfirm={()=>remove(d.id)} />
            </div>
          );
        }

        // ---- active / finished: live standings ----
        const mySum = sumRange(all[myId] || all[user.id], d.start_day, d.end_day);
        const oppSum = sumRange(all[oId], d.start_day, d.end_day);
        const mx = Math.max(mySum, oppSum, 1);
        const forfeited = d.status === "forfeited";
        const dateOver = today > d.end_day;
        const finished = forfeited || dateOver;
        const daysLeft = finished ? 0 : Math.round((new Date(d.end_day+"T00:00") - new Date(today+"T00:00"))/86400000) + 1;
        const iWon = forfeited ? d.winner_id === myId : mySum > oppSum;
        const status = !finished ? `${daysLeft} day${daysLeft===1?"":"s"} left`
          : forfeited ? (iWon ? "🏆 Won — forfeit" : "Forfeited")
          : (mySum>oppSum ? "🏆 You won!" : oppSum>mySum ? `${oName} won` : "Tie — dead heat");
        const statusColor = !finished ? T.sub : (forfeited ? (iWon?T.green:T.danger) : (mySum>oppSum?T.green:oppSum>mySum?T.danger:T.sub));
        return (
          <div key={d.id} style={{borderTop:`1px solid ${T.creamLine}`, padding:"11px 0"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
              <span style={{fontSize:13.5, fontWeight:800, color:T.ink}}>You vs <span style={{color:oIsPro(oId)?T.green:"inherit"}}>{oName}{oIsPro(oId) && <ProBadge small />}</span></span>
              <span style={{fontSize:12.5, fontWeight:800, color:statusColor}}>{status}</span>
            </div>
            {!forfeited && [["You", mySum, true],[oName, oppSum, false]].map(([nm,val,me])=>(
              <div key={nm+String(me)} style={{display:"flex", alignItems:"center", gap:8, marginBottom:5}}>
                <span style={{width:80, flexShrink:0, display:"flex", alignItems:"center", gap:3, fontSize:12.5, fontWeight: me?800:600, color: (me||oIsPro(oId))?T.green:T.ink}}>
                  <span style={{minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{nm}</span>
                  {!me && oIsPro(oId) && <span style={{flexShrink:0, display:"inline-flex"}}><ProBadge small /></span>}
                </span>
                <span style={{flex:1, height:8, background:T.input, borderRadius:99, overflow:"hidden"}}>
                  <span style={{display:"block", width:`${val/mx*100}%`, height:"100%", background:me?"var(--cal-cardio)":`color-mix(in srgb, var(--cal-cardio) 44%, ${T.input})`, borderRadius:99, transition:"width .5s ease", boxShadow:me?"0 0 10px color-mix(in srgb, var(--cal-cardio) 34%, transparent)":"none"}} />
                </span>
                <b style={{fontSize:12.5, color:T.ink, minWidth:54, textAlign:"right", fontVariantNumeric:"tabular-nums"}}>{val.toLocaleString()}</b>
              </div>
            ))}
            {forfeited && (
              <div style={{fontSize:12, color:T.sub, marginBottom:2}}>{iWon ? `${oName} forfeited — counts as your win.` : "You forfeited this duel."}</div>
            )}
            {/* finished duels are the permanent W-L record, so they can't be unilaterally deleted */}
            {finished ? (
              <div style={{fontSize:11, color:T.sub, marginTop:4}}>Final · {fmtDate(d.start_day)} – {fmtDate(d.end_day)}</div>
            ) : d.cancel_req === myId ? (
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, background:T.input, borderRadius:9, padding:"8px 11px", marginTop:6}}>
                <span style={{fontSize:12, color:T.sub}}>⏳ Waiting for {oName} to agree to void…</span>
                <button onClick={()=>undoCancel(d.id)} style={{background:"none", border:`1px solid ${T.line}`, color:T.ink, fontSize:12, fontWeight:700, padding:"5px 11px", borderRadius:99}}>Withdraw</button>
              </div>
            ) : d.cancel_req === oId ? (
              <div style={{background:T.input, borderRadius:9, padding:"9px 11px", marginTop:6}}>
                <div style={{fontSize:12.5, color:T.ink, fontWeight:700, marginBottom:8}}>🤝 {oName} wants to void this duel — no win or loss for either of you.</div>
                <div style={{display:"flex", gap:8}}>
                  <button onClick={()=>remove(d.id)} style={{flex:1, background:T.green, color:"#000", fontWeight:800, fontSize:12.5, padding:"8px", borderRadius:9}}>Agree & void</button>
                  <button onClick={()=>undoCancel(d.id)} style={{flex:1, background:T.card, color:T.sub, fontWeight:700, fontSize:12.5, padding:"8px", borderRadius:9}}>Keep dueling</button>
                </div>
              </div>
            ) : (
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginTop:6}}>
                <span style={{fontSize:11, color:T.sub}}>{fmtDate(d.start_day)} – {fmtDate(d.end_day)}</span>
                <div style={{display:"flex", gap:7, alignItems:"center"}}>
                  <button onClick={()=>reqCancel(d.id)} title="Both sides must agree to void a duel" style={{background:"none", border:`1px solid ${T.line}`, color:T.sub, fontSize:11.5, fontWeight:700, padding:"5px 11px", borderRadius:99}}>Ask to void</button>
                  <ConfirmX label="Forfeit" onConfirm={()=>forfeit(d.id)} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Full Steps tab: editable daily goal, your ring+chart, a weekly race, step duels,
   and a once-a-day whole-group celebration. */
function StepsTab({ user, data, setData }) {
  const goal = (data.profile?.stepGoal) || 10000;
  const { mine, all, nameOf, board, celebrate, dismiss, yStr, myId, lastSync } = useSteps(user, 5*365 + 40);
  const myName = nameOf[myId] || (user.user_metadata?.username || "you");
  const [proIds, setProIds] = useState([]);
  useEffect(()=>{ listProUserIds().then(setProIds).catch(()=>{}); }, []);
  const merged = useMemo(() => mergeSteps(mine || {}, data.cardio), [mine, data.cardio]);
  const [editGoal, setEditGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(goal));
  const [view, setView] = useState(null); // { id, name } groupmate graph popup
  const dayLabel = (d) => d===yStr ? "yesterday" : d===todayStr() ? "today" : new Date(d+"T00:00").toLocaleDateString("en-US",{weekday:"short"});

  const race = useMemo(()=>{
    const ws = weekStart(todayStr());
    return Object.keys(all).map(id => {
      const mm = all[id]||{}; let sum=0;
      for (const d in mm) if (weekStart(d)===ws) sum += mm[d];
      return { id, name: nameOf[id] || (id===myId?"you":"?"), me:id===myId, sum };
    }).filter(r=>r.sum>0).sort((a,b)=>b.sum-a.sum);
  }, [all, nameOf, myId]);

  const saveGoal = () => {
    const g = Math.max(1000, Math.min(100000, parseInt(goalInput)||10000));
    setData(d=>({ ...d, profile:{ ...(d.profile||{}), stepGoal:g } }));
    setEditGoal(false);
  };

  const Row = ({ r, i, value }) => (
    <button onClick={()=>setView({ id:r.id, name:r.name })} style={{width:"100%", textAlign:"left", background:"none", display:"flex", alignItems:"center", gap:10, padding:"9px 2px", borderTop: i===0?"none":`1px solid ${T.creamLine}`}}>
      <span style={{width:24, textAlign:"center", fontWeight:800, color: i===0?T.green:T.sub, fontSize:14}}>{i===0?"👑":i+1}</span>
      <span style={{flex:1, minWidth:0, display:"flex", alignItems:"center", gap:3, fontWeight: r.me?800:600, color: (r.me||proIds.includes(r.id))?T.green:T.ink, fontSize:14}}>
        <span style={{minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.name}{r.me?" (you)":""}</span>
        {!r.me && proIds.includes(r.id) && <span style={{flexShrink:0, display:"inline-flex"}}><ProBadge small /></span>}
      </span>
      <span style={{fontSize:14, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>{value.toLocaleString()}</span>
      <span style={{color:T.sub, fontSize:15}}>›</span>
    </button>
  );

  if (mine === undefined) return <div className="card"><div className="skeleton" style={{height:220, borderRadius:12}} /></div>;

  if (!Object.keys(merged.map).length) {
    return (
      <div className="card" style={{textAlign:"center"}}>
        <div style={{fontSize:40, marginBottom:8}}>👟</div>
        <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:6}}>No steps yet</div>
        <div style={{fontSize:13, color:T.sub, lineHeight:1.55, maxWidth:340, margin:"0 auto"}}>
          Set up the iPhone Shortcut in <b style={{color:T.ink}}>Settings → 🚶 Apple Health steps</b>, then tap <b style={{color:T.ink}}>Sync now</b> when you want to refresh.
          After the first sync your ring, charts, and group board fill in here.
        </div>
      </div>
    );
  }

  return (<>
    {/* header + editable goal + reliable Sync now */}
    <div className="card">
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap", marginBottom:12}}>
        <div className="h" style={{fontSize:19, color:T.tealDk}}>👟 Steps</div>
        {!editGoal ? (
          <button onClick={()=>{ setGoalInput(String(goal)); setEditGoal(true); }} style={{background:T.input, color:T.ink, border:`1px solid ${T.line}`, borderRadius:99, padding:"7px 13px", fontSize:12.5, fontWeight:700}}>🎯 Goal {goal.toLocaleString()} · Edit</button>
        ) : (
          <div style={{display:"flex", gap:6, alignItems:"center"}}>
            <input type="number" inputMode="numeric" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{width:96}} />
            <button onClick={saveGoal} className="btn-primary" style={{padding:"9px 16px", fontSize:13}}>Save</button>
            <button onClick={()=>setEditGoal(false)} style={{background:T.input, color:T.sub, padding:"8px 11px", fontSize:13}}>✕</button>
          </div>
        )}
      </div>
      {IS_MOBILE && <SyncNowButton block />}
      {(() => {
        if (lastSync) {
          const ms = Date.now() - new Date(lastSync).getTime();
          const recent = ms < 120000;
          const rel = ms<60000 ? "just now" : ms<3600000 ? `${Math.floor(ms/60000)} min ago` : ms<86400000 ? `${Math.floor(ms/3600000)}h ago` : `${Math.floor(ms/86400000)}d ago`;
          return (
            <div style={{textAlign:"center", marginTop: IS_MOBILE?9:0, fontSize:12.5, fontWeight:800, color: recent?T.green:T.sub,
              background: recent?"rgba(var(--accent-rgb),.10)":"transparent", borderRadius:99, padding:recent?"6px 0":"2px 0", transition:"all .2s ease"}}>
              {recent ? "✓ Synced " : "🕐 Last synced "}{rel}
            </div>
          );
        }
        if (IS_MOBILE) return <div style={{fontSize:11, color:T.sub, textAlign:"center", marginTop:7, lineHeight:1.5}}>Runs your <b style={{color:T.ink}}>“The Lab: Steps”</b> shortcut — this page updates the moment you come back.</div>;
        return <div style={{fontSize:11.5, color:T.sub, textAlign:"center", lineHeight:1.5}}>Steps sync from your iPhone — open The Lab on your phone and tap <b style={{color:T.ink}}>🔄 Sync now</b>.</div>;
      })()}
    </div>

    <StepRingChart map={merged.map} goal={goal} meta={merged.meta} />

    <DuelsCard user={user} all={all} nameOf={nameOf} myId={myId} myName={myName} proIds={proIds}
      minimized={!!data.profile?.minimizedSections?.stepDuels}
      onMinimizedChange={value=>setData(d=>({ ...d, profile:{ ...(d.profile||{}), minimizedSections:{ ...(d.profile?.minimizedSections||{}), stepDuels:value } } }))} />

    {race.length > 1 && (
      <div className="card" style={{display:"flex", alignItems:"center", gap:11, padding:"13px 15px"}}>
        <span style={{fontSize:22}}>🏁</span>
        <div style={{flex:1, minWidth:0, fontSize:12.5, color:T.sub, lineHeight:1.5}}>
          <b style={{color:T.ink}}>Weekly step race</b> lives in your <b style={{color:T.green}}>Groups</b> tab now — open a group to see everyone's steps this week.
        </div>
      </div>
    )}

    {/* groupmate graph popup */}
    {view && (
      <div onClick={()=>setView(null)} style={{position:"fixed", inset:0, zIndex:55, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)", display:"flex", alignItems:"flex-end", justifyContent:"center", animation:"fadeSwap .18s ease-out both"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.bg, borderTop:`1px solid ${T.line}`, borderRadius:"18px 18px 0 0", width:"100%", maxWidth:520, maxHeight:"88dvh", overflowY:"auto", overscrollBehavior:"contain", padding:"16px 14px calc(20px + env(safe-area-inset-bottom))", animation:"sheetUp .26s cubic-bezier(.22,1,.36,1) both"}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
            <div className="h" style={{fontSize:18, color:T.tealDk}}>👟 {view.name}{view.id===myId?" (you)":""}</div>
            <button onClick={()=>setView(null)} style={{background:T.input, color:T.sub, width:32, height:32, borderRadius:99, fontSize:15}}>✕</button>
          </div>
          <StepRingChart map={all[view.id] || {}} goal={goal} />
        </div>
      </div>
    )}
  </>);
}

/* One-line steps recap shown on the Cardio tab (only when the Steps feature is on). */
function CardioStepsRecap({ user }) {
  const { mine, yStr } = useSteps(user, 8);
  if (!mine || !Object.keys(mine).length) return null;
  const y = mine[yStr]; const t = mine[todayStr()];
  const show = t != null ? { n:t, when:"today" } : y != null ? { n:y, when:"yesterday" } : null;
  if (!show) return null;
  return (
    <div className="card" style={{display:"flex", alignItems:"center", gap:12, padding:"12px 16px",borderColor:"color-mix(in srgb,var(--cal-cardio) 22%,var(--line))",background:"radial-gradient(90% 100% at 100% 0%,color-mix(in srgb,var(--cal-cardio) 8%,transparent),transparent 65%),var(--card)"}}>
      <span style={{fontSize:24}}>👟</span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:18, fontWeight:800, color:"var(--cal-cardio)", fontVariantNumeric:"tabular-nums"}}>{show.n.toLocaleString()} <span style={{fontSize:12.5, color:T.sub, fontWeight:600}}>steps {show.when}</span></div>
        <div style={{fontSize:11.5, color:T.sub}}>Synced from Apple Health via your iPhone Shortcut · full charts in the Steps tab</div>
      </div>
    </div>
  );
}

const CARDIO_RANGES = ["1D","1M","1Y","All"];
function CardioOverview({ cardio, minimized=false, onMinimizedChange }) {
  const [range,setRange]=useState("1M");
  const [metric,setMetric]=useState("minutes");
  const [selected,setSelected]=useState(null);
  const bins=useMemo(()=>{
    const today=todayStr();
    const since=range==="1D"?today:range==="1M"?dAdd(today,-29):range==="1Y"?dAdd(today,-364):"0000-00-00";
    const sessions=[...(cardio||[])].filter(c=>c.date>=since&&c.date<=today).sort((a,b)=>a.date.localeCompare(b.date)||(a.id||0)-(b.id||0));
    if(range==="1D") return sessions.map((c,i)=>({key:String(c.id??i),label:c.activity.length>10?c.activity.slice(0,9)+"…":c.activity,title:c.activity,sessions:[c],minutes:c.duration||0,calories:c.calories||0,calKnown:c.calories!=null}));
    const grouped={};
    for(const c of sessions){
      const key=(range==="1Y"||range==="All")?c.date.slice(0,7):c.date;
      (grouped[key]||=[]).push(c);
    }
    return Object.entries(grouped).map(([key,list])=>{
      const dt=new Date(key+(key.length===7?"-01":"")+"T00:00");
      const label=key.length===7?(range==="All"?dt.toLocaleString("en-US",{month:"short",year:"2-digit"}):dt.toLocaleString("en-US",{month:"short"})):`${dt.getMonth()+1}/${dt.getDate()}`;
      return {key,label,title:key.length===7?dt.toLocaleString("en-US",{month:"long",year:"numeric"}):fmtDate(key),sessions:list,
        minutes:list.reduce((s,c)=>s+(c.duration||0),0),calories:list.reduce((s,c)=>s+(c.calories||0),0),calKnown:list.some(c=>c.calories!=null)};
    });
  },[cardio,range]);
  useEffect(()=>{if(!bins.some(b=>b.key===selected))setSelected(bins.at(-1)?.key||null);},[bins,selected]);
  const picked=bins.find(b=>b.key===selected)||bins.at(-1);
  const totals=useMemo(()=>({sessions:bins.reduce((s,b)=>s+b.sessions.length,0),minutes:bins.reduce((s,b)=>s+b.minutes,0),calories:bins.reduce((s,b)=>s+b.calories,0),calKnown:bins.some(b=>b.calKnown)}),[bins]);
  const allTotals=useMemo(()=>({sessions:(cardio||[]).length,minutes:(cardio||[]).reduce((s,c)=>s+(c.duration||0),0)}),[cardio]);
  const max=Math.max(1,...bins.map(b=>metric==="minutes"?b.minutes:b.calories));
  const rangeText=range==="1D"?"today":range==="1M"?"the last 30 days":range==="1Y"?"the last 12 months":"all time";
  if(minimized) return <div className="card compact-card" style={{display:"flex",alignItems:"center",gap:8}}>
    <span style={{fontSize:18}}>🏃</span>
    <div style={{minWidth:0,flex:1}}><div className="h" style={{fontSize:14,color:T.tealDk}}>Cardio activity</div><div style={{fontSize:11,color:T.sub}}>{allTotals.sessions} session{allTotals.sessions===1?"":"s"} · {allTotals.minutes} min</div></div>
    <button type="button" onClick={()=>onMinimizedChange?.(false)} aria-label="Show cardio activity chart" style={showSectionBtn}>Show</button>
  </div>;
  return <div className="card" style={{background:"radial-gradient(90% 70% at 100% 0%,color-mix(in srgb,var(--cal-cardio) 8%,transparent),transparent 62%),var(--card)",borderColor:"color-mix(in srgb,var(--cal-cardio) 24%,var(--line))"}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
      <div style={{flex:1,minWidth:0}}><div className="h" style={{fontSize:18,color:T.tealDk}}>Cardio activity</div><div style={{fontSize:12,color:T.sub,marginTop:2}}>Only periods with logged cardio appear.</div></div>
      <div style={{display:"flex",alignItems:"center",gap:6}}><div className="seg"><button type="button" aria-pressed={metric==="minutes"} className={`seg-btn ${metric==="minutes"?"on":""}`} onClick={()=>setMetric("minutes")} style={metric==="minutes"?{color:"var(--cal-cardio)",background:"color-mix(in srgb,var(--cal-cardio) 15%,transparent)"}:undefined}>Minutes</button><button type="button" aria-pressed={metric==="calories"} className={`seg-btn ${metric==="calories"?"on":""}`} onClick={()=>setMetric("calories")} style={metric==="calories"?{color:"var(--cal-cardio)",background:"color-mix(in srgb,var(--cal-cardio) 15%,transparent)"}:undefined}>Calories</button></div>
      <button type="button" onClick={()=>onMinimizedChange?.(true)} title="Minimize cardio activity" aria-label="Minimize cardio activity" style={minimizeBtn}>➖</button></div>
    </div>
    <div style={{display:"flex",gap:2,marginBottom:12,borderBottom:`1px solid ${T.line}`}}>{CARDIO_RANGES.map(v=><button type="button" aria-pressed={range===v} key={v} onClick={()=>setRange(v)} style={{flex:1,background:"none",padding:"9px 4px",fontSize:12.5,color:range===v?"var(--cal-cardio)":T.sub,borderBottom:range===v?"2px solid var(--cal-cardio)":"2px solid transparent",borderRadius:0,fontWeight:800}}>{v}</button>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:13}}>
      {[[totals.sessions,"sessions"],[totals.minutes,"minutes"],[totals.calKnown?totals.calories.toLocaleString():"—","calories"]].map(([v,l])=><div key={l} style={{background:T.input,border:`1px solid ${T.line}`,borderRadius:10,padding:"9px 6px",textAlign:"center"}}><div style={{fontSize:19,fontWeight:850,color:l===(metric==="minutes"?"minutes":"calories")?"var(--cal-cardio)":T.ink,fontVariantNumeric:"tabular-nums"}}>{v}</div><div style={{fontSize:10.5,color:T.sub}}>{l}</div></div>)}
    </div>
    {!bins.length?<div style={{minHeight:110,display:"grid",placeItems:"center",textAlign:"center",color:T.sub,fontSize:13}}>No cardio logged {rangeText}.</div>:<>
      <div style={{overflowX:"auto",padding:"4px 1px 8px",WebkitOverflowScrolling:"touch"}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:7,height:132,minWidth:`max(100%, ${bins.length*48}px)`}}>{bins.map((b,i)=>{const val=metric==="minutes"?b.minutes:b.calories;const active=b.key===(picked?.key);return <button key={b.key} onClick={()=>setSelected(b.key)} aria-label={`${b.title}: ${b.minutes} minutes, ${b.calKnown?`${b.calories} calories`:"calories unavailable"}`} style={{flex:"1 0 40px",height:"100%",minWidth:40,padding:0,background:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",gap:5,borderRadius:8}}>
          <span style={{fontSize:10.5,fontWeight:800,color:active?"var(--cal-cardio)":T.sub}}>{val>0?val:""}</span>
          <span className="vbar" style={{width:"70%",maxWidth:32,minHeight:5,height:Math.max(5,val/max*82),borderRadius:"7px 7px 3px 3px",background:active?"var(--cal-cardio)":"color-mix(in srgb,var(--cal-cardio) 45%,var(--input))",boxShadow:active?"0 0 16px color-mix(in srgb,var(--cal-cardio) 45%,transparent)":"none",animationDelay:`${Math.min(i,12)*.025}s`}} />
          <span style={{fontSize:9.5,color:active?T.ink:T.sub,whiteSpace:"nowrap",maxWidth:46,overflow:"hidden",textOverflow:"ellipsis"}}>{b.label}</span>
        </button>;})}</div>
      </div>
      {picked&&<div key={picked.key} style={{marginTop:6,background:T.input,border:"1px solid var(--cal-cardio)",borderRadius:12,padding:"11px 12px",animation:"fadeSwap .2s ease-out both"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><div style={{fontSize:13.5,fontWeight:800,flex:1}}>{picked.title}</div><span style={{fontSize:12,color:"var(--cal-cardio)",fontWeight:800}}>{picked.minutes} min</span><span style={{fontSize:12,color:T.ink,fontWeight:800}}>{picked.calKnown?`${picked.calories} cal`:"— cal"}</span></div>
        <div style={{display:"grid",gap:6}}>{picked.sessions.map((c,i)=><div key={c.id??i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5}}><span style={{width:6,height:6,borderRadius:99,background:"var(--cal-cardio)",flexShrink:0}}/><span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:650}}>{c.activity}</span><span style={{color:T.sub}}>{c.duration||0} min</span><span style={{color:T.sub,minWidth:48,textAlign:"right"}}>{c.calories!=null?`${c.calories} cal`:"—"}</span></div>)}</div>
      </div>}
    </>}
  </div>;
}

function CardioTab({ data, setData, latestBW, user, stepsOn }) {
  const units = useUnit();
  const minimizedSections=data.profile?.minimizedSections||{};
  const setCardioMinimized=(key,value)=>setData(d=>({...d,profile:{...(d.profile||{}),minimizedSections:{...(d.profile?.minimizedSections||{}),[key]:value}}}));
  const [date, setDate] = useState(todayStr());
  const [activity, setActivity] = useState("");
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState("");
  const [machineCal, setMachineCal] = useState("");
  const [steps, setSteps] = useState("");
  const [newAct, setNewAct] = useState(""); const [newType, setNewType] = useState("Sport");

  const actMap = Object.fromEntries(data.cardioActivities.map(a=>[a.name,a.type]));
  const isMachine = actMap[activity]==="Machine";
  const isSteps = actMap[activity]==="Steps";
  const kg = latestBW * 0.453592;

  const estCal = isSteps ? stepsCal(parseInt(steps)||0, kg)
    : (!isMachine && duration && intensity) ? Math.round(MET[intensity]*kg*(duration/60)) : null;
  const canSave = activity && (isSteps ? steps : duration) && (isMachine || isSteps || intensity);

  const add = () => {
    if (!canSave) return;
    const calories = isMachine ? (machineCal?parseInt(machineCal):null) : estCal;
    setData(d=>({ ...d, cardio:[...d.cardio, {
      id:Date.now(), date, activity,
      duration: duration ? parseInt(duration) : 0,
      steps: isSteps ? (parseInt(steps)||0) : null,
      intensity: (isMachine||isSteps) ? null : intensity, calories,
    }] }));
    setDuration(""); setMachineCal(""); setSteps("");
  };

  const [cardQ, setCardQ] = useState("");
  const [cardSort,setCardSort]=useState("newest");
  const rows = useMemo(() => {
    const q = cardQ.trim().toLowerCase();
    const out=[...data.cardio].filter(e => !q || e.activity.toLowerCase().includes(q));
    out.sort(cardSort==="duration"?(a,b)=>(b.duration||0)-(a.duration||0)||b.date.localeCompare(a.date):cardSort==="calories"?(a,b)=>(b.calories??-1)-(a.calories??-1)||b.date.localeCompare(a.date):(a,b)=>b.date.localeCompare(a.date)||(b.id||0)-(a.id||0));
    return out.slice(0,80);
  }, [data.cardio, cardQ, cardSort]);

  const stepStats = useMemo(() => {
    const wk = weekStart(todayStr());
    let today = 0, week = 0, total = 0, any = false;
    for (const c of data.cardio) {
      if (!c.steps) continue;
      any = true; total += c.steps;
      if (weekStart(c.date) === wk) week += c.steps;
      if (c.date === todayStr()) today += c.steps;
    }
    return { any, today, week, total };
  }, [data.cardio]);
  const cardioSummary=useMemo(()=>({sessions:data.cardio.length,days:new Set(data.cardio.map(c=>c.date)).size}),[data.cardio]);

  const [editAct, setEditAct] = useState(null); // { orig, name, type }
  const actValid = editAct && editAct.name.trim() &&
    !data.cardioActivities.some(a => a.name === editAct.name.trim() && a.name !== editAct.orig);
  const saveAct = () => {
    if (!actValid) return;
    const nn = editAct.name.trim();
    setData(d=>({ ...d,
      cardioActivities: d.cardioActivities.map(a => a.name===editAct.orig ? { name:nn, type:editAct.type } : a),
      cardio: nn !== editAct.orig ? d.cardio.map(c => c.activity===editAct.orig ? { ...c, activity:nn } : c) : d.cardio,
    }));
    setEditAct(null);
  };

  const [edit, setEdit] = useState(null); // { id, date, activity, duration, intensity, machineCal, steps }
  const editIsMachine = edit ? actMap[edit.activity]==="Machine" : false;
  const editIsSteps = edit ? actMap[edit.activity]==="Steps" : false;
  const saveEdit = () => {
    if (!edit.activity || (editIsSteps ? !edit.steps : !edit.duration)) return;
    const dur = edit.duration ? parseInt(edit.duration) : 0;
    const stp = editIsSteps ? (parseInt(edit.steps)||0) : null;
    const calories = editIsSteps ? stepsCal(stp, kg)
      : editIsMachine ? (edit.machineCal ? parseInt(edit.machineCal) : null)
      : (edit.intensity ? Math.round(MET[edit.intensity]*kg*(dur/60)) : null);
    setData(d=>({ ...d, cardio: d.cardio.map(x => x.id===edit.id ? {
      ...x, date:edit.date, activity:edit.activity, duration:dur, steps:stp,
      intensity: (editIsMachine||editIsSteps) ? null : (edit.intensity || null), calories,
    } : x) }));
    setEdit(null);
  };

  return (<>
    {stepsOn && <CardioStepsRecap user={user} />}

    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>🏃 Log cardio</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>
        Sports get an automatic calorie estimate from duration × intensity × your tracked bodyweight ({showW(latestBW, units)}).
        Machines: type in what the display says.
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <DateField label="Date" value={date} max={todayStr()} onChange={setDate} />
        <label style={lbl}>Activity
          <select value={activity} onChange={e=>setActivity(e.target.value)}>
            <option value="">— pick —</option>
            {data.cardioActivities.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
        {isSteps
          ? <>
              <label style={lbl}>Steps<input type="number" inputMode="numeric" value={steps} onChange={e=>setSteps(e.target.value)} placeholder="e.g. 8500" /></label>
              <label style={lbl}>Duration (min, optional)<input type="number" inputMode="numeric" value={duration} onChange={e=>setDuration(e.target.value)} /></label>
            </>
          : <>
              <label style={lbl}>Duration (min)<input type="number" inputMode="numeric" value={duration} onChange={e=>setDuration(e.target.value)} /></label>
              {isMachine
                ? <label style={lbl}>Machine calories<input type="number" inputMode="numeric" value={machineCal} onChange={e=>setMachineCal(e.target.value)} placeholder="from the display" /></label>
                : <label style={lbl}>Intensity
                    <select value={intensity} onChange={e=>setIntensity(e.target.value)}>
                      <option value="">—</option>{Object.keys(MET).map(k=><option key={k}>{k}</option>)}
                    </select>
                  </label>}
            </>}
      </div>
      {isSteps && stepsOn && (
        <div style={{display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"9px 12px", marginBottom:10, fontSize:12.5, color:T.sub, lineHeight:1.5}}>
          <span style={{flexShrink:0}}>⚠️</span>
          <span>Your Apple Health steps are already <b style={{color:T.ink}}>synced in the Steps tab</b> through your Shortcut. Logging a step count here too will double-count — skip it unless you specifically want a separate manual entry.</span>
        </div>
      )}
      {!isMachine && !isSteps && activity && duration && !intensity && <div style={{background:T.input,border:`1px solid ${T.line}`,borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:12.5,color:T.sub}}>Choose an intensity so calories can be estimated.</div>}
      {estCal!=null && <div style={{background:T.cream, borderRadius:10, padding:"8px 12px", marginBottom:10, fontSize:14}}>Estimated: <b>{estCal} cal</b>{isSteps && steps && <span style={{color:T.sub}}> · about {stepsMiles(parseInt(steps)||0)} mi</span>}</div>}
      <button onClick={add} disabled={!canSave} className="btn-primary" style={{width:"100%", padding:"14px", fontSize:16}}>Save session</button>
    </div>

    {stepStats.any && (
      <div className="card" style={{display:"flex", justifyContent:"space-around", textAlign:"center", gap:8}}>
        <div><div style={{fontSize:20, fontWeight:800, color:"var(--cal-cardio)"}}>{stepStats.today.toLocaleString()}</div><div style={{fontSize:11.5, color:T.sub}}>👣 today</div></div>
        <div><div style={{fontSize:20, fontWeight:800, color:T.ink}}>{stepStats.week.toLocaleString()}</div><div style={{fontSize:11.5, color:T.sub}}>this week</div></div>
        <div><div style={{fontSize:20, fontWeight:800, color:T.ink}}>{stepStats.total.toLocaleString()}</div><div style={{fontSize:11.5, color:T.sub}}>all-time</div></div>
      </div>
    )}

    <CardioOverview cardio={data.cardio} minimized={!!minimizedSections.cardioActivity} onMinimizedChange={value=>setCardioMinimized("cardioActivity",value)} />

    {minimizedSections.cardioCalendar ? <div className="card compact-card" style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:18}}>🗓️</span>
      <div style={{minWidth:0,flex:1}}><div className="h" style={{fontSize:14,color:T.tealDk}}>Cardio calendar</div><div style={{fontSize:11,color:T.sub}}>{cardioSummary.days} active day{cardioSummary.days===1?"":"s"}</div></div>
      <button type="button" onClick={()=>setCardioMinimized("cardioCalendar",false)} aria-label="Show cardio calendar" style={showSectionBtn}>Show</button>
    </div> : <div className="card">
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}><div className="h" style={{fontSize:17,color:T.tealDk,flex:1}}>Cardio calendar</div><button type="button" onClick={()=>setCardioMinimized("cardioCalendar",true)} title="Minimize cardio calendar" aria-label="Minimize cardio calendar" style={minimizeBtn}>➖</button></div>
      <div style={{fontSize:12,color:T.sub,marginBottom:10}}>Your cardio days at a glance. Tap a day to see every session, its duration, and calories.</div>
      <WorkoutHeatmap log={[]} cardio={data.cardio} storageKey="lt-cardio-cal-view" emptyPast="no cardio logged" />
    </div>}

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:6}}>Activity library</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Add your own (Basketball, Elliptical, whatever you do). Sport = we estimate calories. Machine = you type them in. Steps = enter a step count (calories estimated from your bodyweight).</div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <input value={newAct} onChange={e=>setNewAct(e.target.value)} placeholder="Activity name" />
        <select value={newType} onChange={e=>setNewType(e.target.value)} style={{width:120}}><option>Sport</option><option>Machine</option><option>Steps</option></select>
        <button onClick={()=>{ if(!newAct.trim())return; setData(d=>({...d, cardioActivities:[...d.cardioActivities.filter(a=>a.name!==newAct.trim()), {name:newAct.trim(), type:newType}]})); setNewAct(""); }}
          style={{background:T.green,color:"#000",padding:"0 16px",fontWeight:700}}>Add</button>
      </div>
      {data.cardioActivities.map(a=>(
        <span key={a.name} className="chip" style={{background:T.mint, color:T.green, marginRight:6, marginBottom:6}}>
          {a.name} · {a.type}
          <PencilBtn onClick={()=>setEditAct({ orig:a.name, name:a.name, type:a.type })} />
          <ConfirmX onConfirm={()=>setData(d=>({...d, cardioActivities:d.cardioActivities.filter(x=>x.name!==a.name)}))} />
        </span>
      ))}
      {editAct && (
        <div style={{...editBox, marginTop:8}}>
          <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Editing <b>{editAct.orig}</b> — renaming updates all your past sessions too.</div>
          <div style={{display:"flex", gap:8, marginBottom:10}}>
            <input value={editAct.name} onChange={ev=>setEditAct(s=>({...s, name:ev.target.value}))} />
            <select value={editAct.type} onChange={ev=>setEditAct(s=>({...s, type:ev.target.value}))} style={{width:120}}><option>Sport</option><option>Machine</option><option>Steps</option></select>
          </div>
          <div style={{display:"flex", gap:8}}>
            <button onClick={saveAct} disabled={!actValid} style={{...saveSm, opacity:actValid?1:0.45}}>Save changes</button>
            <button onClick={()=>setEditAct(null)} style={cancelSm}>Cancel</button>
          </div>
          {!actValid && editAct.name.trim() && <div style={{fontSize:12, color:T.danger, marginTop:6}}>That name is already taken by another activity.</div>}
        </div>
      )}
      <div style={{marginTop:12, fontSize:12.5, color:T.sub}}>
        <b>Intensity guide:</b> {Object.entries(INTENSITY_FEEL).map(([k,v])=><div key={k}>• <b>{k}</b> — {v}</div>)}
      </div>
    </div>

    <div className="card">
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <div className="h" style={{fontSize:17,color:T.tealDk,flex:1}}>Recent cardio</div>
        <select aria-label="Sort cardio history" value={cardSort} onChange={e=>setCardSort(e.target.value)} style={{width:138,minHeight:38,fontSize:12.5,padding:"7px 30px 7px 10px"}}>
          <option value="newest">Newest</option>
          <option value="duration">Longest</option>
          <option value="calories">Most calories</option>
        </select>
      </div>
      <input value={cardQ} onChange={e=>setCardQ(e.target.value)} placeholder="🔍 Filter by activity…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:10}} />
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}><table><thead><tr><th>Date</th><th>Activity</th><th>Min</th><th>Intensity</th><th>Cal</th><th></th></tr></thead>
        <tbody>{rows.map(e=>(<Fragment key={e.id}>
          <tr><td>{fmtDate(e.date)}</td><td>{e.activity}</td><td>{e.duration||"—"}</td><td>{e.steps ? `${e.steps.toLocaleString()} steps` : (e.intensity||"machine")}</td><td>{e.calories??"—"}</td>
            <td style={{whiteSpace:"nowrap"}}>
              <PencilBtn onClick={()=>setEdit({ id:e.id, date:e.date, activity:e.activity, duration:e.duration, intensity:e.intensity||"", machineCal:e.calories ?? "", steps:e.steps ?? "" })} />
              <ConfirmX onConfirm={()=>setData(d=>({...d, cardio:d.cardio.filter(x=>x.id!==e.id)}))} />
            </td></tr>
          {edit?.id === e.id && (
            <tr><td colSpan={6} style={{padding:"6px 4px"}}>
              <div style={editBox}>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8}}>
                  <DateField label="Date" value={edit.date} max={todayStr()} onChange={v=>setEdit(s=>({...s, date:v}))} />
                  <label style={lbl}>Activity
                    <select value={edit.activity} onChange={ev=>setEdit(s=>({...s, activity:ev.target.value}))}>
                      {data.cardioActivities.map(a=><option key={a.name}>{a.name}</option>)}
                      {!data.cardioActivities.some(a=>a.name===edit.activity) && <option>{edit.activity}</option>}
                    </select>
                  </label>
                </div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10}}>
                  {editIsSteps
                    ? <>
                        <label style={lbl}>Steps<input type="number" inputMode="numeric" value={edit.steps} onChange={ev=>setEdit(s=>({...s, steps:ev.target.value}))} /></label>
                        <label style={lbl}>Duration (min, optional)<input type="number" inputMode="numeric" value={edit.duration} onChange={ev=>setEdit(s=>({...s, duration:ev.target.value}))} /></label>
                      </>
                    : <>
                        <label style={lbl}>Duration (min)<input type="number" inputMode="numeric" value={edit.duration} onChange={ev=>setEdit(s=>({...s, duration:ev.target.value}))} /></label>
                        {editIsMachine
                          ? <label style={lbl}>Machine calories<input type="number" inputMode="numeric" value={edit.machineCal} onChange={ev=>setEdit(s=>({...s, machineCal:ev.target.value}))} /></label>
                          : <label style={lbl}>Intensity
                              <select value={edit.intensity} onChange={ev=>setEdit(s=>({...s, intensity:ev.target.value}))}>
                                <option value="">—</option>{Object.keys(MET).map(k=><option key={k}>{k}</option>)}
                              </select>
                            </label>}
                      </>}
                </div>
                {!editIsMachine && <div style={{fontSize:12, color:T.sub, marginBottom:10}}>Calories re-estimate automatically when you save.</div>}
                <div style={{display:"flex", gap:8}}>
                  <button onClick={saveEdit} disabled={!edit.activity||(editIsSteps?!edit.steps:!edit.duration)} style={{...saveSm, opacity:(edit.activity&&(editIsSteps?edit.steps:edit.duration))?1:0.45}}>Save changes</button>
                  <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                </div>
              </div>
            </td></tr>
          )}
        </Fragment>))}
        {!rows.length && <tr><td colSpan={6} style={{color:T.sub}}>No cardio logged yet.</td></tr>}
        </tbody></table></div>
    </div>
  </>);
}

/* ================= EXERCISES ================= */
/* 3-state muscle picker: tap once = main muscle (full credit, green ✓),
   tap again = secondary (half credit, amber ½), third tap = off. */
const AMBER = "#E3BE55";
function MuscleChips({ prim, sec, onChange }) {
  const cycle = (m) => {
    if (prim.includes(m)) onChange(prim.filter(x => x !== m), [...sec, m]);
    else if (sec.includes(m)) onChange(prim, sec.filter(x => x !== m));
    else onChange([...prim, m], sec);
  };
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
      {MUSCLES.map((m)=>{
        const state = prim.includes(m) ? "prim" : sec.includes(m) ? "sec" : "off";
        const col = state === "prim" ? T.green : state === "sec" ? AMBER : T.sub;
        return (
          <button key={m} type="button" onClick={()=>cycle(m)} style={{
            padding:"6px 12px", borderRadius:99, fontSize:13, fontWeight:600, minHeight:36,
            background: state === "prim" ? "rgba(var(--accent-rgb),.14)" : state === "sec" ? "rgba(227,190,85,.12)" : "none",
            border: `1px solid ${state === "off" ? T.line : col}`, color: col,
          }}>
            {state === "prim" ? "✓ " : state === "sec" ? "½ " : ""}{m}
          </button>
        );
      })}
    </div>
  );
}

/* "ez bar curl" -> "Ez Bar Curl" — words typed all-lowercase get capitalized (after
   spaces, hyphens, and parens); words the user already capitalized (EZ, RDL) are kept. */
const properCase = (s) => s.trim().replace(/\s+/g, " ").split(" ")
  .map(w => w === w.toLowerCase() ? w.replace(/(^|[-(/])([a-z])/g, (m, p, c) => p + c.toUpperCase()) : w).join(" ");

function ExercisesTab({ data, setData, user }) {
  const [name, setName] = useState(""); const [muscles, setMuscles] = useState([]);
  const [muscles2, setMuscles2] = useState([]); const [equip, setEquip] = useState("Barbell (plates)");
  const [machine, setMachine] = useState(false);
  const [visualOpen, setVisualOpen] = useState(null);
  const [newVisual, setNewVisual] = useState(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaMsg, setMediaMsg] = useState(null);
  const [addMsg, setAddMsg] = useState(null); // "already in your library" notice
  const [libQ, setLibQ] = useState(""); const [libM, setLibM] = useState("All");
  const shownEx = useMemo(() => {
    const q = libQ.trim().toLowerCase();
    return data.exercises.filter(x =>
      (!q || x.name.toLowerCase().includes(q)) &&
      (libM === "All" || musclesOf(x).includes(libM) || secondariesOf(x).includes(libM)));
  }, [data.exercises, libQ, libM]);

  const [edit, setEdit] = useState(null); // { orig, name, muscles, muscles2, equip, machine }
  const [mergeTo, setMergeTo] = useState(""); // fold this exercise into another one
  const editValid = edit && edit.name.trim() && edit.muscles.length > 0 &&
    !data.exercises.some(x => x.name.toLowerCase() === edit.name.trim().toLowerCase() && x.name !== edit.orig);
  const saveEdit = () => {
    if (!editValid) return;
    const nn = properCase(edit.name);
    setData(d=>({ ...d,
      exercises: d.exercises.map(x => x.name===edit.orig ? { ...x, name:nn, muscle:edit.muscles[0], muscles:edit.muscles, muscles2:edit.muscles2, machine: edit.equip==="Bodyweight" ? false : edit.machine, ...fromEquip(edit.equip) } : x),
      log: nn !== edit.orig ? d.log.map(e => e.exercise===edit.orig ? { ...e, exercise:nn } : e) : d.log,
      routines: nn !== edit.orig ? (d.routines||[]).map(r => ({ ...r, items:(r.items||[]).map(it => it.exercise===edit.orig ? { ...it, exercise:nn } : it) })) : d.routines,
    }));
    setEdit(null);
  };
  // merge: every logged set (and routine slot) moves to the picked exercise, then this one is deleted
  const doMerge = async () => {
    if (!mergeTo || !edit) return;
    const source = data.exercises.find(x=>x.name===edit.orig);
    const target = data.exercises.find(x=>x.name===mergeTo);
    if (source?.visualPath && target?.visualPath) {
      try { await deleteExerciseMedia(source.visualPath); } catch {}
    }
    setData(d=>({ ...d,
      log: d.log.map(e => e.exercise===edit.orig ? { ...e, exercise:mergeTo } : e),
      routines: (d.routines||[]).map(r => ({ ...r, items:(r.items||[]).map(it => it.exercise===edit.orig ? { ...it, exercise:mergeTo } : it) })),
      exercises: d.exercises.filter(x => x.name !== edit.orig).map(x => x.name===mergeTo && source?.visualPath && !x.visualPath ? { ...x, visualPath:source.visualPath, visualKind:source.visualKind } : x),
    }));
    setEdit(null); setMergeTo("");
  };
  const addExercise = async () => {
    if (!name.trim() || !muscles.length || mediaBusy) return;
    const nn = properCase(name);
    const dupe = data.exercises.find(x => x.name.toLowerCase() === nn.toLowerCase());
    if (dupe) { setAddMsg(`“${dupe.name}” is already in your library — no duplicate added. (To fold one exercise into another, open it with ✏️ and use Merge.)`); return; }
    setMediaBusy(true); setMediaMsg(null);
    try {
      const visualPath = newVisual ? await uploadExerciseMedia(user.id, newVisual) : null;
      setData(d=>({...d, exercises:[...d.exercises, {name:nn, muscle:muscles[0], muscles, muscles2, machine:equip==="Bodyweight"?false:machine, ...fromEquip(equip), ...(visualPath?{visualPath,visualKind:newVisual.type==="image/gif"?"gif":"image"}:{})}]}));
      setName(""); setMuscles([]); setMuscles2([]); setMachine(false); setNewVisual(null); setAddMsg(null);
    } catch (err) { setMediaMsg(err?.message || "Couldn't upload that visual."); }
    finally { setMediaBusy(false); }
  };
  const uploadVisualFor = async (exercise, file) => {
    if (!file || mediaBusy) return;
    setMediaBusy(true); setMediaMsg(null);
    try {
      const path = await uploadExerciseMedia(user.id, file);
      setData(d=>({...d, exercises:d.exercises.map(x=>x.name===exercise.name?{...x,visualPath:path,visualKind:file.type==="image/gif"?"gif":"image"}:x)}));
      if (exercise.visualPath) { try { await deleteExerciseMedia(exercise.visualPath); } catch {} }
      setMediaMsg(`${file.type==="image/gif"?"GIF":"Image"} saved for ${exercise.name}.`);
    } catch (err) { setMediaMsg(err?.message || "Couldn't upload that visual."); }
    finally { setMediaBusy(false); }
  };
  const removeVisualFor = async (exercise) => {
    if (!exercise?.visualPath || mediaBusy) return;
    setMediaBusy(true); setMediaMsg(null);
    try {
      await deleteExerciseMedia(exercise.visualPath);
      setData(d=>({...d, exercises:d.exercises.map(x=>x.name===exercise.name?((({visualPath,visualKind,...rest})=>rest)(x)):x)}));
      setMediaMsg(`Your upload was removed from ${exercise.name}.`);
    } catch (err) { setMediaMsg(err?.message || "Couldn't remove that visual."); }
    finally { setMediaBusy(false); }
  };
  const removeExercise = async (exercise) => {
    if (exercise.visualPath) { try { await deleteExerciseMedia(exercise.visualPath); } catch {} }
    setData(d=>({...d, exercises:d.exercises.filter(e=>e.name!==exercise.name)}));
  };

  const exMuscle = Object.fromEntries(data.exercises.map(x => [x.name, muscleLabel(x)]));
  const stamp = todayStr();
  const exportLog = () => download(`workout-log-${stamp}.csv`, "﻿" + [
    "date,exercise,muscle,set,sets_count,weight_lb,reps,effort,quick_workout,notes",
    ...[...data.log].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id)
      .map(e => [e.date, entryLabel(e), e.muscleOnly?e.muscle:(exMuscle[e.exercise]||""), e.set, setCountOf(e), e.quick?"":(e.weight ?? "BW"), e.reps??"", e.effort||"", e.muscleOnly?"yes":"no", e.notes||""].map(csvEsc).join(",")),
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
  const exportAll = () => download(`the-lab-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
  const outBtn = { background:"none", border:`1px solid ${T.line}`, color:T.ink, padding:"9px 14px", fontSize:13.5, fontWeight:600 };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>📚 Exercise library</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:6}}>Add your own moves (e.g. Decline Push-Up). Pick <b>Barbell</b> to get the plate helper when logging; <b>Bodyweight</b> moves auto-track by reps.</div>
      <div style={{fontSize:11.5, color:T.sub, marginBottom:11, lineHeight:1.45}}>Exercises with a visual show it beside the name. Add your own image or GIF below; exercises without one stay clean and text-only.</div>
      <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap"}}>
        <input value={name} onChange={e=>{setName(e.target.value); setAddMsg(null);}} placeholder="Type to add exercise…" style={{flex:2, minWidth:150}} />
        <select value={equip} onChange={e=>setEquip(e.target.value)} style={{flex:1, minWidth:150}}>{EQUIP_OPTS.map(o=><option key={o}>{o}</option>)}</select>
      </div>
      {equip !== "Bodyweight" && (
        <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:T.ink, marginBottom:10, cursor:"pointer"}}>
          <input type="checkbox" checked={machine} onChange={e=>setMachine(e.target.checked)} style={{width:17, height:17, minHeight:0}} />
          🏢 Compare this machine separately at each gym
        </label>
      )}
      <div style={{fontSize:12, color:T.sub, marginBottom:6}}>Muscle groups: tap once = <b style={{color:T.green}}>✓ main</b> (full set credit) · tap again = <b style={{color:AMBER}}>½ secondary</b> (half credit) · third tap clears. First main pick decides where it sorts.</div>
      <MuscleChips prim={muscles} sec={muscles2} onChange={(p,s)=>{setMuscles(p);setMuscles2(s);}} />
      <div style={{display:"flex", alignItems:"center", gap:8, marginTop:10, flexWrap:"wrap"}}>
        <label style={{display:"inline-flex", alignItems:"center", gap:7, width:"auto", padding:"8px 13px", borderRadius:10, background:T.input, border:`1px solid ${T.line}`, color:T.ink, fontSize:12.5, fontWeight:750, cursor:mediaBusy?"wait":"pointer", opacity:mediaBusy?.6:1}}>
          🖼️ {newVisual ? "Change visual" : "Optional image or GIF"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={mediaBusy} onChange={e=>setNewVisual(e.target.files?.[0]||null)} style={{display:"none"}} />
        </label>
        {newVisual && <><span style={{fontSize:11.5, color:T.green, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{newVisual.name}</span><button type="button" onClick={()=>setNewVisual(null)} style={{padding:"5px 8px", background:"none", color:T.sub, fontSize:12}}>Remove</button></>}
        <span style={{fontSize:10.5, color:T.sub}}>JPG, PNG, WebP, or GIF · max 8 MB</span>
      </div>
      {name.trim() && !muscles.length && <div style={{fontSize:12, color:AMBER, marginTop:6}}>Pick at least one main muscle group to add this exercise.</div>}
      {addMsg && <div style={{fontSize:12.5, color:AMBER, marginTop:6}}>{addMsg}</div>}
      <button onClick={addExercise} disabled={!name.trim()||!muscles.length||mediaBusy} className="btn-primary"
        style={{padding:"11px 22px", marginTop:10, marginBottom:14}}>{mediaBusy?"Saving…":"Add exercise"}</button>
      {mediaMsg && <div style={{fontSize:11.5, color:mediaMsg.includes("Couldn't")?T.danger:T.green, margin:"-5px 0 10px"}}>{mediaMsg}</div>}
      <input value={libQ} onChange={e=>setLibQ(e.target.value)} placeholder="🔍 Search your library…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:8}} />
      <div style={{display:"flex", gap:6, overflowX:"auto", paddingBottom:6, WebkitOverflowScrolling:"touch"}}>
        {["All", ...MUSCLES].map(m=>(
          <button key={m} onClick={()=>setLibM(m)} style={{
            flexShrink:0, padding:"5px 12px", borderRadius:99, fontSize:12.5, fontWeight:700,
            background: libM===m ? T.green : T.input, color: libM===m ? "#000" : T.sub,
            border:`1px solid ${libM===m ? T.green : T.line}`,
          }}>{m}</button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Exercise</th><th>Muscle</th><th>Equipment</th><th></th></tr></thead>
          <tbody>{shownEx.map(x=>(<Fragment key={x.name}>
             <tr><td><div style={{display:"flex", alignItems:"center", gap:hasExerciseVisual(x)?10:0, minWidth:175}}>{hasExerciseVisual(x) && <ExerciseThumb exercise={x} size={48} onOpen={()=>setVisualOpen(x)} />}{hasExerciseVisual(x)?<button type="button" onClick={()=>setVisualOpen(x)} style={{padding:0, background:"none", color:T.ink, textAlign:"left", fontSize:13.5, fontWeight:700, overflowWrap:"anywhere"}}>{x.name}</button>:<span style={{fontSize:13.5,fontWeight:700,color:T.ink}}>{x.name}</span>}</div></td><td>{muscleLabel(x)}</td><td>{equipOf(x)}{machineOf(x) && <span title="Compared separately by gym" style={{marginLeft:5}}>🏢</span>}</td>
              <td style={{whiteSpace:"nowrap"}}>
                <PencilBtn onClick={()=>{ setEdit({ orig:x.name, name:x.name, muscles:musclesOf(x), muscles2:secondariesOf(x), equip:equipOf(x), machine:machineOf(x) }); setMergeTo(""); }} />
                <ConfirmX onConfirm={()=>removeExercise(x)} />
              </td></tr>
            {edit?.orig === x.name && (
              <tr><td colSpan={4} style={{padding:"6px 4px"}}>
                <div style={editBox}>
                  <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Renaming updates every set you've logged for it — history stays intact.</div>
                  <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap"}}>
                    <input value={edit.name} onChange={ev=>setEdit(s=>({...s, name:ev.target.value}))} style={{flex:2, minWidth:150}} />
                    <select value={edit.equip} onChange={ev=>setEdit(s=>({...s, equip:ev.target.value}))} style={{flex:1, minWidth:150}}>{EQUIP_OPTS.map(o=><option key={o}>{o}</option>)}</select>
                  </div>
                  {edit.equip !== "Bodyweight" && (
                    <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:T.ink, marginBottom:10, cursor:"pointer"}}>
                      <input type="checkbox" checked={edit.machine} onChange={ev=>setEdit(s=>({...s, machine:ev.target.checked}))} style={{width:17, height:17, minHeight:0}} />
                      🏢 Compare this machine separately at each gym
                    </label>
                  )}
                  <div style={{fontSize:12, color:T.sub, marginBottom:6}}>Tap once = ✓ main (full credit) · again = ½ secondary (half credit) · again = off:</div>
                  <div style={{marginBottom:10}}>
                    <MuscleChips prim={edit.muscles} sec={edit.muscles2} onChange={(p,s2)=>setEdit(s=>({...s, muscles:p, muscles2:s2}))} />
                  </div>
                  <div style={{display:"flex", alignItems:"center", gap:9, flexWrap:"wrap", margin:"0 0 11px", padding:"10px 11px", background:T.card, border:`1px solid ${T.line}`, borderRadius:11}}>
                    {hasExerciseVisual(x) && <ExerciseThumb exercise={x} size={46} onOpen={()=>setVisualOpen(x)} />}
                    <div style={{minWidth:130, flex:1}}><div style={{fontSize:12.5,fontWeight:750,color:T.ink}}>{x.visualPath?"Your uploaded visual":exerciseVisualOf(x.name)?"Included visual":"No visual"}</div><div style={{fontSize:10.5,color:T.sub,marginTop:2}}>Use a still image or animated GIF.</div></div>
                    <label style={{width:"auto", padding:"8px 11px", borderRadius:9, background:T.input, border:`1px solid ${T.line}`, color:T.green, fontSize:11.5, fontWeight:800, cursor:mediaBusy?"wait":"pointer", opacity:mediaBusy?.6:1}}>
                      {x.visualPath?"Replace":"Upload"}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={mediaBusy} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)uploadVisualFor(x,f);}} style={{display:"none"}} />
                    </label>
                    {x.visualPath && <button type="button" onClick={()=>removeVisualFor(x)} disabled={mediaBusy} style={{padding:"8px 10px", background:"none", border:`1px solid ${T.line}`, color:T.sub, fontSize:11.5}}>Remove</button>}
                  </div>
                  <div style={{display:"flex", gap:8}}>
                    <button onClick={saveEdit} disabled={!editValid} style={{...saveSm, opacity:editValid?1:0.45}}>Save changes</button>
                    <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                  </div>
                  {!editValid && edit.name.trim() && <div style={{fontSize:12, color:T.danger, marginTop:6}}>That name is already used by another exercise.</div>}
                  {data.exercises.length > 1 && (
                    <div style={{marginTop:12, paddingTop:12, borderTop:`1px solid ${T.line}`}}>
                      <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>
                        Added this by accident and it already exists? <b style={{color:T.ink}}>Merge it:</b> every set logged
                        under “{edit.orig}” moves to the exercise you pick, then “{edit.orig}” is deleted. History stays intact.
                      </div>
                      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                        <select value={mergeTo} onChange={ev=>setMergeTo(ev.target.value)} style={{flex:1, minWidth:170}}>
                          <option value="">— merge into… —</option>
                          {data.exercises.filter(z=>z.name!==edit.orig).map(z=><option key={z.name}>{z.name}</option>)}
                        </select>
                        {mergeTo && (
                          <button onClick={doMerge} style={{background:AMBER, color:"#000", padding:"9px 16px", fontWeight:700, fontSize:13.5}}>
                            Merge &amp; delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </td></tr>
            )}
          </Fragment>))}</tbody></table>
      </div>
      <div style={{fontSize:10.5, color:T.sub, marginTop:9, lineHeight:1.45}}>Included illustrations are provided by <a href="https://wger.de" target="_blank" rel="noreferrer" style={{color:T.green}}>wger</a> under per-image Creative Commons licenses. Personal uploads are private to their owner.</div>
    </div>

    {visualOpen && <ExerciseVisualModal exercise={visualOpen} onClose={()=>setVisualOpen(null)} />}

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

/* ================= SETTINGS / ACCOUNT ================= */
/* On a phone browser (not already installed as a home-screen app)? */
const IS_MOBILE = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const IS_STANDALONE = typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator?.standalone === true);

function DownloadAppCard() {
  const [done, setDone] = useState(() => localStorage.getItem("lt-a2hs-done") === "1");
  if (!IS_MOBILE || IS_STANDALONE) return null;
  if (done) return <div style={{ fontSize:13, color:T.green, fontWeight:700, padding:"4px 2px" }}>✅ Marked as installed — this guide disappears next time you open Settings.</div>;
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <div style={{ ...sCard, borderColor:T.green }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.green, marginBottom:2 }}>📲 Download the app</div>
      <div style={{ fontSize:12.5, color:T.ink, lineHeight:1.6 }}>
        {isiOS ? (<>
          Put this on your home screen and it opens like a real app — full screen, no browser bar:
          <ol style={{ margin:"6px 0", paddingLeft:20 }}>
            <li>Open this site in <b>Safari</b> (Apple's built-in browser).</li>
            <li><b>Tap once near the bottom of the screen</b> to bring up Safari's toolbar if it's hidden. <span style={{color:T.sub}}>(On iPad the toolbar is at the top instead.)</span></li>
            <li>Tap the <b>Share</b> button — the <b>square with an ↑ arrow</b>, in the middle of the bottom toolbar. <span style={{color:T.sub}}>If you only see three dots <b>•••</b>, tap those first, then Share.</span></li>
            <li>In the menu that slides up, <b>scroll down</b> and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b> (top-right). Done — look for the barbell icon on your home screen.</li>
          </ol>
          <div style={{ fontSize:12, color:T.sub, marginBottom:4 }}>Note: the Share button is <b>not</b> the three-lines/aA button next to the web address — that one only changes text size.</div>
          <b style={{color:T.down}}>Things to avoid:</b>
          <ul style={{ margin:"4px 0", paddingLeft:20, color:T.sub }}>
            <li>In-app browsers (Instagram, Snapchat, TikTok, Messenger) <b>hide</b> Add to Home Screen — copy the link into Safari first.</li>
            <li>Private/incognito tabs forget your sign-in every time.</li>
            <li>Some browsers clear cookies aggressively and sign you out. Your data is <b>always safe in the cloud</b> — you'd only have to sign in again — but the home-screen app avoids the hassle.</li>
          </ul>
        </>) : (<>
          Put this on your home screen and it opens like a real app:
          <ol style={{ margin:"6px 0", paddingLeft:20 }}>
            <li>Open this site in <b>Chrome</b>.</li>
            <li>Tap the <b>⋮</b> menu (top right).</li>
            <li>Tap <b>Add to Home screen</b>, then <b>Add</b>.</li>
          </ol>
          <span style={{color:T.sub}}>Avoid in-app browsers (Instagram, Snapchat…) — they hide this option. Your data is always safe in the cloud either way.</span>
        </>)}
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>
        <input type="checkbox" style={{ width:18, height:18, minHeight:0, accentColor:T.green }}
          onChange={()=>{ localStorage.setItem("lt-a2hs-done","1"); setDone(true); }} />
        I added it — hide this
      </label>
    </div>
  );
}

function FeatureToggle({ label, desc, on, setOn }) {
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>{desc}</div>
      <div style={{ display:"flex", background:T.input, borderRadius:10, padding:3, maxWidth:200 }}>
        {[["off","Off"],["on","On"]].map(([v,l])=>{
          const isOn = v === "on";
          return (
            <button key={v} onClick={()=>setOn(isOn)} style={{
              flex:1, padding:"9px 0", borderRadius:8, fontWeight:700, fontSize:14,
              background: on===isOn ? T.green : "none", color: on===isOn ? "#000" : T.sub,
            }}>{l}</button>
          );
        })}
      </div>
    </div>
  );
}

/* Small PRO badge shown next to Pro members in groups. */
function ProBadge({ small }) {
  return <span style={{ fontSize: small ? 8.5 : 9.5, fontWeight: 800, color: "#000", background: T.green, padding: small ? "1px 5px" : "1px 6px", borderRadius: 99, letterSpacing: .3, marginLeft: 5, verticalAlign: "middle" }}>PRO</span>;
}

/* A tappable "advertising" card for a locked Pro feature (shown in-context to non-Pro).
   Clicking it takes them to Go Pro. Wire real checkout here later. */
function ProTeaser({ icon, title, desc, onGoPro }) {
  return (
    <button onClick={onGoPro} className="card" style={{ display:"block", width:"100%", textAlign:"left", cursor:"pointer",
      border:`1px solid ${T.green}`, background:"linear-gradient(180deg,rgba(var(--accent-rgb),.08),transparent 62%)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:5, flexWrap:"wrap" }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <span style={{ fontSize:16, fontWeight:800, color:T.ink }}>{title}</span>
        <span style={{ fontSize:9.5, fontWeight:800, color:"#000", background:T.green, padding:"2px 7px", borderRadius:99, letterSpacing:.3 }}>🔒 PRO</span>
      </div>
      <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.5, marginBottom:11 }}>{desc}</div>
      <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:T.green, color:"#000", fontWeight:800, fontSize:13.5, padding:"9px 15px", borderRadius:10 }}>✨ Unlock with Pro →</span>
    </button>
  );
}

/* A locked Pro feature placeholder shown to non-Pro members in Settings — tappable to Go Pro. */
function ProLocked({ feature, note, onGoPro }) {
  return (
    <button onClick={onGoPro} style={{ ...sCard, borderColor: T.line, display: "flex", gap: 11, alignItems: "flex-start", width: "100%", textAlign: "left", cursor: "pointer" }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>🔒</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{feature} <span style={{ fontSize: 10, fontWeight: 800, color: "#000", background: T.green, padding: "1px 7px", borderRadius: 99, marginLeft: 4, letterSpacing: .3 }}>PRO</span></div>
        <div style={{ fontSize: 12, color: T.sub, marginTop: 3, lineHeight: 1.5 }}>{note} <span style={{ color: T.green, fontWeight: 700 }}>Tap to unlock →</span></div>
      </div>
    </button>
  );
}

/* Theme picker: accent color swatches + dark palette chips. Free tiers usable by all;
   the rest need Pro (tapping a locked one nudges toward upgrading). */
function ThemePicker({ theme, setTheme, isPro, onGoPro }) {
  const pick = (patch, locked) => { if (locked && !isPro) { onGoPro?.(); return; } setTheme({ ...theme, ...patch }); };
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 2 }}>Accent color</div>
      <div style={{ fontSize: 12, color: T.sub, marginBottom: 10 }}>{isPro ? "Recolors buttons, rings and highlights across the app." : "2 colors are free — the rest unlock with Pro."}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        {Object.entries(ACCENTS).map(([id, a]) => {
          const locked = !a.free && !isPro, active = theme.accent === id;
          return (
            <button key={id} onClick={() => pick({ accent: id }, !a.free)} title={a.name + (locked ? " (Pro)" : "")} style={{
              width: 38, height: 38, borderRadius: 99, flexShrink: 0, position: "relative", cursor: locked ? "not-allowed" : "pointer",
              background: `rgb(${a.rgb})`, border: active ? "3px solid #fff" : "3px solid transparent",
              boxShadow: active ? `0 0 0 2px rgb(${a.rgb})` : "none", opacity: locked ? .5 : 1,
            }}>{locked && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🔒</span>}</button>
          );
        })}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Palette</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Object.entries(PALETTES).map(([id, p]) => {
          const locked = !p.free && !isPro, active = theme.palette === id;
          return (
            <button key={id} onClick={() => pick({ palette: id }, !p.free)} style={{
              display: "flex", alignItems: "center", gap: 8, cursor: locked ? "not-allowed" : "pointer",
              background: active ? "rgba(var(--accent-rgb),.14)" : T.input, border: `1px solid ${active ? T.green : T.line}`,
              borderRadius: 10, padding: "8px 12px", opacity: locked ? .55 : 1,
            }}>
              <span style={{ width: 16, height: 16, borderRadius: 5, background: p.bg, border: `1px solid ${p.line}`, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: active ? T.green : T.ink }}>{p.name}</span>
              {locked && <span style={{ fontSize: 11 }}>🔒</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ===== JOURNAL: dead-simple daily notes, one per day ===== */
function JournalTab({ data, setData }) {
  const [sel, setSel] = useState(todayStr());
  // desktop (mouse) auto-focuses the note so you can just type; on phones we DON'T,
  // so opening the tab doesn't yank up the keyboard — you tap the box when ready.
  const isDesktop = typeof window !== "undefined" && window.matchMedia?.("(hover:hover) and (pointer:fine)").matches;
  const journal = data.journal || {};
  const text = (journal[sel] && journal[sel].text) || "";
  const shift = (n) => { const d = new Date(sel+"T00:00"); d.setDate(d.getDate()+n); setSel(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`); };
  const setText = (v) => setData(d => {
    const j = { ...(d.journal||{}) };
    if (v.trim()) j[sel] = { text: v }; else delete j[sel];
    return { ...d, journal: j };
  });
  const recent = useMemo(() => Object.entries(journal)
    .filter(([,e]) => String(e && e.text || "").trim())
    .sort((a,b) => b[0].localeCompare(a[0])).slice(0, 60), [journal]);
  const prettyDay = (dstr) => new Date(dstr+"T00:00").toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });

  return (<>
    <div className="card" style={{ padding:18 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <button onClick={()=>shift(-1)} style={{ background:T.input, color:T.ink, border:`1px solid ${T.line}`, borderRadius:10, padding:"7px 13px", fontSize:15 }}>‹</button>
        <div style={{ textAlign:"center", cursor:"pointer" }} onClick={()=>setSel(todayStr())}>
          <div style={{ fontSize:18, fontWeight:800, color:T.tealDk }}>{sel===todayStr() ? "Today" : prettyDay(sel)}</div>
          {sel!==todayStr() && <div style={{ fontSize:11.5, color:T.green, fontWeight:700 }}>tap for today</div>}
        </div>
        <button onClick={()=>shift(1)} disabled={sel>=todayStr()} style={{ background:T.input, color: sel>=todayStr()?T.line:T.ink, border:`1px solid ${T.line}`, borderRadius:10, padding:"7px 13px", fontSize:15 }}>›</button>
      </div>

      <textarea autoFocus={isDesktop && sel===todayStr()} value={text} onChange={e=>setText(e.target.value)}
        placeholder="How was the session? Soreness, energy, PRs, what to try next time…"
        rows={7} style={{ width:"100%", border:`1px solid ${T.line}`, borderRadius:12, padding:"14px 15px", background:T.input, color:T.ink, fontFamily:"inherit", fontSize:15.5, lineHeight:1.5, resize:"vertical" }} />
      <div style={{ fontSize:11.5, color:T.sub, marginTop:8, textAlign:"right" }}>{text.trim() ? "✓ Saved automatically" : "Saves as you type"}</div>
    </div>

    {recent.length > 0 && (
      <div className="card">
        <div className="h" style={{ fontSize:17, color:T.tealDk, marginBottom:6 }}>📓 Past entries</div>
        {recent.map(([d,e])=>(
          <button key={d} onClick={()=>setSel(d)} style={{ display:"flex", gap:12, width:"100%", textAlign:"left", background: d===sel?"linear-gradient(90deg, rgba(var(--accent-rgb),.14), transparent)":"none", borderRadius: d===sel?10:0, border:"none", borderTop:`1px solid ${T.line}`, padding:"11px 8px", cursor:"pointer", alignItems:"baseline" }}>
            <span style={{ fontSize:12.5, fontWeight:800, color: d===sel?T.green:T.ink, whiteSpace:"nowrap", flexShrink:0, minWidth:96 }}>{prettyDay(d)}{d===todayStr()?" ·":""}</span>
            <span style={{ fontSize:13, color:T.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.text}</span>
          </button>
        ))}
      </div>
    )}
  </>);
}

function SectionHead({ icon, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, margin:"20px 2px 10px" }}>
      <span style={{ fontSize:12, fontWeight:800, color:T.green, textTransform:"uppercase", letterSpacing:"1.2px" }}>{icon} {label}</span>
      <div style={{ flex:1, height:1, background:T.line }} />
    </div>
  );
}

function SettingsModal({ user, username, data, setData, startTab, setStartTab, tabs, units, setUnits, hunit, setHunit, routinesOn, setRoutinesOn, stepsOn, setStepsOn, coachOn, setCoachOn, multiGymOn, setMultiGymOn, theme, setTheme, streaksOn, setStreaksOn, waterOn, setWaterOn, nutritionOn, isPro, onClose }) {
  const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
  const totalSets = (data.log||[]).length;
  const goPro = () => document.getElementById("pro-section")?.scrollIntoView({ behavior:"smooth", block:"start" });

  // close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // freeze the page behind the sheet — otherwise iOS "scroll chains" to the app
  // underneath when the sheet's scroll hits an edge, which feels like broken scrolling
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // swipe DOWN on the grab handle to dismiss (the sheet follows your finger)
  const sheetRef = useRef(null);
  const dragY = useRef(null);
  const grab = {
    onTouchStart: (e) => {
      dragY.current = { y0: e.touches[0].clientY, dy: 0 };
      if (sheetRef.current) sheetRef.current.style.animation = "none"; // let transform take over
    },
    onTouchMove: (e) => {
      if (!dragY.current) return;
      const dy = Math.max(0, e.touches[0].clientY - dragY.current.y0);
      dragY.current.dy = dy;
      if (sheetRef.current) { sheetRef.current.style.transition = "none"; sheetRef.current.style.transform = `translateY(${dy}px)`; }
    },
    onTouchEnd: () => {
      const dy = dragY.current?.dy || 0; dragY.current = null;
      const el = sheetRef.current; if (!el) return;
      if (dy > 90) { onClose(); return; }
      el.style.transition = "transform .25s cubic-bezier(.22,1,.36,1)"; el.style.transform = "translateY(0)";
    },
  };

  return (
    <div onClick={onClose} className="sheet-wrap" style={{
      position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)",
      display:"flex", alignItems:"flex-end", justifyContent:"center", touchAction:"none",
      animation:"fadeSwap .18s ease-out both",
    }}>
      <div ref={sheetRef} onClick={e=>e.stopPropagation()} className="sheet" style={{
        background:T.card, borderTop:`1px solid ${T.line}`, borderRadius:"18px 18px 0 0",
        width:"100%", maxWidth:520, maxHeight:"88dvh", overflowY:"auto",
        overscrollBehavior:"contain", WebkitOverflowScrolling:"touch", touchAction:"pan-y",
        padding:"18px 16px calc(20px + env(safe-area-inset-bottom))",
        animation:"sheetUp .26s cubic-bezier(.22,1,.36,1) both",
      }}>
        <div {...grab} style={{ touchAction:"none", cursor:"grab", padding:"6px 0 12px", margin:"-8px 0 2px" }}>
          <div style={{ width:38, height:4, background:T.line, borderRadius:99, margin:"0 auto" }} />
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div className="h" style={{ fontSize:22, color:T.tealDk }}>💪 {username}</div>
            <div style={{ fontSize:12.5, color:T.sub, marginTop:2 }}>Member since {memberSince} · {totalSets} sets logged</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            {isPro ? (
              <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:"linear-gradient(100deg, rgb(var(--accent-rgb)), #8fe3a0)", color:"#000", fontWeight:800, fontSize:12.5, padding:"6px 12px", borderRadius:99, letterSpacing:.3, boxShadow:"0 2px 10px rgba(var(--accent-rgb),.35)" }}>✨ PRO</span>
            ) : (
              <button onClick={()=>document.getElementById("pro-section")?.scrollIntoView({ behavior:"smooth", block:"start" })}
                style={{ background:T.green, color:"#000", fontWeight:800, fontSize:12.5, padding:"6px 13px", borderRadius:99, cursor:"pointer", letterSpacing:.3 }}>✨ Go Pro</button>
            )}
            <button onClick={onClose} style={{ background:T.input, color:T.sub, width:34, height:34, borderRadius:99, fontSize:16 }}>✕</button>
          </div>
        </div>

        <div id="pro-section">
          <SettingsSection icon="✨" title={isPro ? "The Lab Pro — active" : "Go Pro"} desc={isPro ? "You're a Pro member 🎉" : "Steps, themes & an AI coach"} defaultOpen={!isPro}>
            <ProCard isPro={isPro} />
          </SettingsSection>
        </div>

        {/* the install guide only exists on a phone browser that hasn't installed yet */}
        {IS_MOBILE && !IS_STANDALONE && localStorage.getItem("lt-a2hs-done") !== "1" && (
          <SettingsSection icon="📲" title="Get the app" desc="Put The Lab on your home screen" defaultOpen>
            <DownloadAppCard />
          </SettingsSection>
        )}

        <SettingsSection icon="🎛" title="Display & units" desc="Pounds or kilos, height, and your start tab">
          <div style={{ ...sCard }}>
            <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Weight units</div>
            <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>Changes everything shown across the app, and switches the plate calculator to matching plates. Your data is unchanged underneath.</div>
            <div className="seg" style={{ display:"flex", maxWidth:200, borderRadius:12 }}>
              {["lb","kg"].map(u=>(
                <button key={u} onClick={()=>setUnits(u)} className={"seg-btn"+(units===u?" on":"")} style={{ flex:1, padding:"10px 0", borderRadius:9, fontSize:14 }}>{u === "lb" ? "Pounds (lb)" : "Kilos (kg)"}</button>
              ))}
            </div>
          </div>

          <div style={{ ...sCard }}>
            <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Height units</div>
            <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>Used by the BMI calculator on the Body tab.</div>
            <div className="seg" style={{ display:"flex", maxWidth:230, borderRadius:12 }}>
              {[["ftin","Feet + inches"],["cm","Centimeters"]].map(([v,label])=>(
                <button key={v} onClick={()=>setHunit(v)} className={"seg-btn"+(hunit===v?" on":"")} style={{ flex:1, padding:"10px 0", borderRadius:9, fontSize:14 }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{ ...sCard, marginBottom:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Open the app on</div>
            <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>Pick the tab you land on each time — set it to Log for the fastest gym start.</div>
            <select value={startTab} onChange={e=>setStartTab(e.target.value)}>
              {tabs.map(([id,label,icon])=><option key={id} value={id}>{icon} {label}</option>)}
              <option value="last">📍 Wherever I left off</option>
            </select>
          </div>
        </SettingsSection>

        <SettingsSection icon="🕐" title="Time & dates" desc="Your time zone, and when your day starts">
          <TimeZoneCard data={data} setData={setData} />
          <DayStartCard data={data} setData={setData} />
        </SettingsSection>

        <SettingsSection icon="🧩" title="Features" desc="Optional parts of the app — on or off">
          <FeatureToggle label="Workout routines" on={routinesOn} setOn={setRoutinesOn}
            desc="Adds a Routines section to the Log tab: build templates like “Push Day,” then tap Start to log them exercise-by-exercise. Off by default. Turning it off just hides it — your saved routines stay." />
          <FeatureToggle label="Compare machines by gym" on={multiGymOn} setOn={setMultiGymOn}
            desc="Optional. Turn this on if you use machines at different gyms. The app will compare each machine only with sets from the same gym. Leave it off otherwise." />
          {multiGymOn && <FeatureToggle label="Show gym picker while logging" on={!data.profile?.hideGymPicker} setOn={on=>setData(d=>({...d,profile:{...(d.profile||{}),hideGymPicker:!on}}))}
            desc="Hide the optional gym field from the Log tab without deleting your saved gyms or past gym comparisons." />}
        </SettingsSection>

        <SettingsSection icon="🎨" title="Themes" desc={isPro ? "Recolor the app your way" : "Accent colors + palettes · Pro"} defaultOpen={false}>
          <ThemePicker theme={theme} setTheme={setTheme} isPro={isPro} onGoPro={goPro} />
        </SettingsSection>

        <SettingsSection icon="💪" title="Lab's AI Coach" desc={isPro ? "Personalized tips on your dashboard" : "Smart training tips · Pro"}>
          {isPro ? (
            <FeatureToggle label="Show the AI Coach" on={coachOn} setOn={setCoachOn}
              desc="Puts a coach card on your Home tab with progression, plateau, volume, weak-point and recovery tips built from your logs. Tap ➖ on the card to hide it just for today; dismiss any single tip with ✕. Turn this off to remove it entirely. On by default." />
          ) : <ProLocked feature="Lab's AI Coach" note="Personalized progression, plateau, and weak-point coaching from your own logs." onGoPro={goPro} />}
        </SettingsSection>


        <SettingsSection icon="🚶" title="Apple Health steps" desc={isPro ? "Sync daily steps from your iPhone" : "iPhone step syncing · Pro"}>
          {isPro ? (<>
            <FeatureToggle label="Show the Steps tab" on={stepsOn} setOn={setStepsOn}
              desc="Adds a 👟 Steps tab (goal ring, 1D/W/M/6M/Y/5Y charts, group leaderboard, step duels) and a steps recap on the Cardio tab. On by default. Set up syncing below." />
            <StepsCard user={user} data={data} setData={setData} />
          </>) : <ProLocked feature="Apple Health steps" note="Sync iPhone steps, battle friends in step duels, and climb the group steps board." onGoPro={goPro} />}
        </SettingsSection>

        <SettingsSection icon="🛡️" title="Privacy & sharing" desc="Control exactly what groupmates receive">
          <PrivacySharingCard data={data} setData={setData} />
          <LegalLinksCard />
        </SettingsSection>

        <SettingsSection icon="🔐" title="Account & security" desc="Password, recovery and account control">
          <ChangePasswordCard />
          <BackupCodesCard user={user} />
          <DeleteAccountCard user={user} />
        </SettingsSection>

        <button onClick={()=>signOutAndClear(user)} style={{
          width:"100%", marginTop:6, padding:13, background:T.dangerBg, color:T.danger, fontWeight:700, fontSize:15,
        }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
const sCard = { background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:12, padding:14, marginBottom:12 };
export const __SettingsTest = SettingsModal; // harness.html renders the sheet standalone for testing

/* Short, popular-first time-zone list — Auto covers almost everyone; the full IANA
   list (~400 zones) hides behind a "show every time zone" tap for the rare case. */
const TZ_POPULAR = [
  ["United States & Canada", [
    ["America/New_York", "Eastern — New York"],
    ["America/Chicago", "Central — Chicago"],
    ["America/Denver", "Mountain — Denver"],
    ["America/Phoenix", "Arizona — Phoenix"],
    ["America/Los_Angeles", "Pacific — Los Angeles"],
    ["America/Anchorage", "Alaska"],
    ["Pacific/Honolulu", "Hawaii"],
    ["America/Toronto", "Eastern — Toronto"],
  ]],
  ["Europe", [
    ["Europe/London", "UK & Ireland — London"],
    ["Europe/Paris", "Central Europe — Paris, Berlin"],
    ["Europe/Sarajevo", "Central Europe — Sarajevo"],
    ["Europe/Athens", "Eastern Europe — Athens"],
  ]],
  ["Rest of the world", [
    ["America/Mexico_City", "Mexico — Mexico City"],
    ["America/Sao_Paulo", "Brazil — São Paulo"],
    ["Asia/Dubai", "UAE — Dubai"],
    ["Asia/Kolkata", "India"],
    ["Asia/Shanghai", "China"],
    ["Asia/Tokyo", "Japan"],
    ["Australia/Sydney", "Australia — Sydney"],
    ["UTC", "UTC"],
  ]],
];
const TZ_POPULAR_IDS = new Set(TZ_POPULAR.flatMap(([, zs]) => zs.map(([id]) => id)));

/* Collapsible Settings section: icon + title + one-line description, tap to expand. */
function SettingsSection({ icon, title, desc, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:`1px solid ${open ? T.green : T.line}`, borderRadius:14, marginBottom:10, overflow:"hidden",
      background:T.card, transition:"border-color .2s ease" }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ width:"100%", display:"flex", alignItems:"center", gap:12,
        padding:"14px", background:"none", borderRadius:0, textAlign:"left" }}>
        <span style={{ fontSize:21, width:28, textAlign:"center", flexShrink:0 }}>{icon}</span>
        <span style={{ flex:1, minWidth:0 }}>
          <span style={{ display:"block", fontSize:15, fontWeight:800, color:T.ink }}>{title}</span>
          <span style={{ display:"block", fontSize:12, color:T.sub, marginTop:1 }}>{desc}</span>
        </span>
        <span style={{ color: open ? T.green : T.sub, fontSize:15, flexShrink:0,
          display:"inline-block", transform: open ? "rotate(90deg)" : "none", transition:"transform .22s cubic-bezier(.34,1.56,.64,1)" }}>▸</span>
      </button>
      {open && <div style={{ padding:"2px 14px 14px", animation:"secIn .22s ease-out both" }}>{children}</div>}
    </div>
  );
}

/* Time zone: Auto (detected from the device) is the default and right for almost
   everyone; the dropdown offers the popular zones, full list on request. */
function TimeZoneCard({ data, setData }) {
  const [showAll, setShowAll] = useState(false);
  const tzVal = data.profile?.tz || "auto";
  const setTz = (z) => setData(d => ({ ...d, profile: { ...(d.profile||{}), tz: z } }));
  const allZones = showAll && typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Time zone</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>
        Decides when “today” starts for your logs. <b>Auto detects it from your phone</b> — right for
        almost everyone, and it follows you when you travel. Only pick one manually if your device's
        clock is set to a different place than where you lift.
      </div>
      <select value={tzVal} onChange={e=>setTz(e.target.value)}>
        <option value="auto">🌐 Auto — detected: {detectedTZ().replace(/_/g," ")}</option>
        {TZ_POPULAR.map(([g, zs]) => (
          <optgroup key={g} label={g}>
            {zs.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </optgroup>
        ))}
        {/* a manually-set zone outside the short list still shows correctly */}
        {tzVal !== "auto" && !TZ_POPULAR_IDS.has(tzVal) && !showAll && <option value={tzVal}>{tzVal.replace(/_/g," ")}</option>}
        {showAll && (
          <optgroup label="Every time zone">
            {allZones.filter(z => !TZ_POPULAR_IDS.has(z)).map(z => <option key={z} value={z}>{z.replace(/_/g," ")}</option>)}
          </optgroup>
        )}
      </select>
      {!showAll && (
        <button onClick={()=>setShowAll(true)} style={{ background:"none", color:T.sub, fontSize:12, textDecoration:"underline", padding:"6px 2px 0" }}>
          Can't find yours? Show every time zone
        </button>
      )}
    </div>
  );
}

/* "My day starts at" — slider from Midnight to 8 AM with a live readout. Sets logged
   before this hour are dated the night before (stored as profile.dayStart). */
function DayStartCard({ data, setData }) {
  const v = data.profile?.dayStart ?? 4;
  const set = (n) => setData(d => ({ ...d, profile: { ...(d.profile||{}), dayStart: n } }));
  const fmtH = (h) => h === 0 ? "Midnight" : `${h}:00 AM`;
  const pct = v / 8 * 100;
  return (
    <div style={{ ...sCard, marginBottom:0 }}>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8, marginBottom:2 }}>
        <div style={{ fontSize:14, fontWeight:700, color:T.ink }}>🌙 My day starts at</div>
        <div style={{ fontSize:19, fontWeight:800, color:T.green, fontVariantNumeric:"tabular-nums" }}>{fmtH(v)}</div>
      </div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10, lineHeight:1.55 }}>
        {v === 0
          ? "The date flips exactly at midnight — a 12:30 AM set counts as the new day."
          : `Sets logged between midnight and ${fmtH(v)} still count as the night before, so a late session stays on one date.`}
        {" "}This only changes the pre-filled date when logging — tapping the date always overrides it.
      </div>
      <input type="range" min="0" max="8" step="1" value={v} onChange={e=>set(+e.target.value)}
        className="lab-range" aria-label="Hour your day starts"
        style={{ background:`linear-gradient(to right, ${T.green} ${pct}%, ${T.input} ${pct}%)` }} />
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10.5, color:T.sub, margin:"2px 3px 12px" }}>
        {["12","1","2","3","4","5","6","7","8 AM"].map(t=><span key={t}>{t}</span>)}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {[[0,"🌅 Midnight — early bird"],[4,"🦉 4 AM — night owl"]].map(([n,l])=>(
          <button key={n} onClick={()=>set(n)} style={{
            padding:"7px 13px", borderRadius:99, fontSize:12.5, fontWeight:700,
            background: v===n ? "rgba(var(--accent-rgb),.14)" : T.input, color: v===n ? T.green : T.sub,
            border:`1px solid ${v===n ? T.green : T.line}`,
          }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/* Small visual bits that make the walkthrough look like the Shortcuts app. */
const STEP_BLUE = "var(--cal-cardio)", STEP_BLUEBG = "color-mix(in srgb,var(--cal-cardio) 16%,transparent)";
/* a word you tap in Shortcuts */
function Tap({ children }) {
  return <span style={{ display:"inline-block", color:STEP_BLUE, background:STEP_BLUEBG, borderRadius:6, padding:"1px 7px", fontWeight:700, whiteSpace:"nowrap" }}>{children}</span>;
}
/* a Shortcuts "magic variable" chip — blue text on a blue tint with a small app-icon
   square, matching how variables actually render in the Shortcuts editor. */
function Var({ children, icon, iconBg }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, color:STEP_BLUE, background:STEP_BLUEBG, borderRadius:6, padding:"2px 8px 2px 4px", fontWeight:700, fontSize:12.5, whiteSpace:"nowrap" }}>
      <span style={{ width:16, height:16, borderRadius:4, flexShrink:0, background:iconBg || "#3B7BEF", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9.5, lineHeight:1 }}>{icon || "◈"}</span>
      {children}
    </span>
  );
}
/* a mock of one action block as it appears on the phone */
function MockCard({ glyph, glyphBg, title, rows }) {
  return (
    <div style={{ background:T.cardAlt, border:`1px solid ${T.line}`, borderRadius:12, padding:"11px 12px", margin:"8px 0 10px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ width:27, height:27, borderRadius:7, flexShrink:0, background:glyphBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>{glyph}</span>
        <span style={{ fontSize:13.5, fontWeight:600, color:T.ink, lineHeight:1.4 }}>{title}</span>
      </div>
      {rows && rows.length > 0 && (
        <div style={{ marginTop:9, borderTop:`1px solid ${T.line}`, paddingTop:9, display:"flex", flexDirection:"column", gap:8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", fontSize:13 }}>
              <span style={{ color:T.sub }}>{r[0]}</span>
              <span style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end", alignItems:"center" }}>{r[1]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/* the "Search Actions" bar at the bottom of the Shortcuts editor — how you add
   every action. Shown big at the top of each step so it can't be missed. */
function SearchBar({ text }) {
  return (
    <div style={{ margin:"2px 0 12px" }}>
      <div style={{ fontSize:12, color:STEP_BLUE, fontWeight:700, marginBottom:6 }}>Tap “Search Actions” at the very bottom, then type:</div>
      <div style={{ display:"flex", alignItems:"center", gap:10, background:T.input, border:`1.5px solid ${STEP_BLUE}`, borderRadius:99, padding:"11px 16px" }}>
        <span style={{ fontSize:15, color:T.sub }}>🔍</span>
        <span style={{ fontSize:14.5, color:T.ink, fontWeight:700 }}>{text}</span>
      </div>
      <div style={{ fontSize:11.5, color:T.sub, marginTop:6 }}>…then tap it in the results to add it. It looks like this:</div>
    </div>
  );
}

/* numbered wrapper: big number + title, then the search bar + card + notes */
function StepBlock({ n, title, children }) {
  return (
    <div style={{ marginBottom:20, paddingTop:14, borderTop:`1px solid ${T.line}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <span style={{ width:26, height:26, borderRadius:8, flexShrink:0, background:T.green, color:"#000", fontWeight:800, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>{n}</span>
        <span style={{ fontSize:16.5, fontWeight:800, color:T.ink }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

/* Apple Health steps: a website can't read Health directly (Apple only allows native
   apps), so an iPhone Shortcut reads today's steps and POSTs them to log_steps() using
   this user's secret code. The card generates that code, shows every setup value as a
   copy button, walks the whole Shortcut with mock action cards, and shows today's count. */
function StepsCard({ user, data, setData }) {
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState("");
  const [latest, setLatest] = useState(undefined); // undefined = loading, null = none, else { day, count }
  const [securityMsg, setSecurityMsg] = useState("");
  const consented = !!data.profile?.appleHealthConsentAt;
  const url = (import.meta.env.VITE_SUPABASE_URL || "") + "/rest/v1/rpc/log_steps";
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

  const addDays = (ds, n) => { const d = new Date(ds + "T00:00"); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const yStr = addDays(todayStr(), -1);
  const dayLabel = (day) => day === todayStr() ? "today" : day === yStr ? "yesterday" : fmtDate(day);

  // show the most recent day that has synced steps (the Shortcut logs the finished previous day)
  useEffect(() => { (async () => {
    try {
      const s = await stepsFor([user.id], addDays(todayStr(), -4));
      const mine = s[user.id] || {};
      const days = Object.keys(mine).sort();
      const last = days[days.length - 1];
      setLatest(last ? { day: last, count: mine[last] } : null);
    } catch { setLatest(null); }
  })(); }, [user.id]);

  const connect = async () => {
    if (!consented) { setErr("Confirm the step-data notice first."); return; }
    setBusy(true); setErr(null);
    try { setToken(await getStepToken()); }
    catch { setErr("Couldn't set this up right now — check your connection and try again."); }
    finally { setBusy(false); }
  };
  const rotate = async () => {
    setBusy(true); setErr(null); setSecurityMsg("");
    try { setToken(await rotateStepToken()); setSecurityMsg("Secret rotated. Replace p_token in your iPhone Shortcut before syncing again."); }
    catch { setErr("Couldn't rotate the secret right now."); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true); setErr(null); setSecurityMsg("");
    try { await disconnectSteps(true); setToken(null); setLatest(null); setSecurityMsg("Disconnected. The old secret is revoked and synced step history was deleted."); }
    catch { setErr("Couldn't disconnect right now."); }
    finally { setBusy(false); }
  };
  const copy = (text, label) => {
    try { navigator.clipboard.writeText(text); } catch {}
    setCopied(label); setTimeout(() => setCopied(c => c === label ? "" : c), 1400);
  };

  // one copyable value (the whole box is tappable to copy)
  const Copy = ({ label, value, id, secret }) => (
    <div style={{ marginBottom:9 }}>
      <div style={{ fontSize:10.5, fontWeight:700, color: secret ? T.green : T.sub, marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }}>{label}</div>
      <button onClick={()=>copy(value, id)} style={{ display:"flex", gap:8, alignItems:"center", width:"100%", textAlign:"left",
        background:T.input, border:`1px solid ${copied===id ? T.green : (secret ? T.green : T.line)}`, borderRadius:9, padding:"9px 11px" }}>
        <code style={{ flex:1, minWidth:0, fontSize:12, color:T.ink, overflowWrap:"anywhere", fontFamily:"ui-monospace, Menlo, monospace" }}>{value}</code>
        <span style={{ flexShrink:0, fontSize:12, fontWeight:700, color: copied===id ? T.green : STEP_BLUE }}>{copied===id ? "Copied ✓" : "Copy"}</span>
      </button>
    </div>
  );

  // a tap-to-copy chip used inline inside the mock pictures. `block` = full width,
  // `wrap` = let a long value wrap so nothing (incl. the Copy button) gets cut off.
  const CopyChip = ({ value, id, label, secret, block, wrap }) => {
    const on = copied === id;
    return (
      <button onClick={()=>copy(value, id)} title="Tap to copy" style={{
        display: block ? "flex" : "inline-flex", width: block ? "100%" : "auto",
        alignItems: wrap ? "flex-start" : "center", gap:8, textAlign:"left", verticalAlign:"middle",
        background: on ? T.green : T.input, border:`1px solid ${on ? T.green : (secret ? T.green : T.line)}`,
        borderRadius:7, padding: block ? "9px 11px" : "4px 9px", fontSize:12, fontWeight:700,
        color: on ? "#000" : STEP_BLUE, fontFamily:"ui-monospace, Menlo, monospace", maxWidth:"100%", overflow:"hidden" }}>
        <span style={{ flex: block ? 1 : "0 1 auto", minWidth:0,
          overflow: wrap ? "visible" : "hidden", textOverflow: wrap ? "clip" : "ellipsis",
          whiteSpace: wrap ? "normal" : "nowrap", overflowWrap: wrap ? "anywhere" : "normal", wordBreak: wrap ? "break-all" : "normal" }}>{label ?? value}</span>
        <span style={{ flexShrink:0, fontSize:11, fontWeight:800, color: on ? "#000" : STEP_BLUE }}>{on ? "Copied ✓" : "Copy"}</span>
      </button>
    );
  };

  // one JSON body field. Consistent layout for all three: a "Key" label + chip, then a
  // value label that matches the field's TYPE (Text/Number — same word the Shortcuts app
  // shows), with the value box to the right, wrapping onto multiple lines so nothing clips.
  const JField = ({ num, type, name, nameId, valueCopy, valueId, valueNote, valuePick, secret }) => (
    <div style={{ background:T.input, border:`1px solid ${secret ? T.green : T.line}`, borderRadius:10, overflow:"hidden", marginBottom:9 }}>
      <div style={{ fontSize:10, fontWeight:800, color:T.sub, textTransform:"uppercase", letterSpacing:.6, padding:"6px 11px", borderBottom:`1px solid ${T.line}`, background:T.cardAlt, display:"flex", justifyContent:"space-between" }}>
        <span>Field {num}</span><span style={{ color:STEP_BLUE }}>type: {type}</span>
      </div>
      {/* same key → value, left-to-right layout as the Headers above */}
      <div style={{ padding:"10px 11px", display:"flex", alignItems:"flex-start", gap:8 }}>
        <div style={{ flexShrink:0, paddingTop:2 }}><CopyChip value={name} id={nameId} /></div>
        <span style={{ color:T.sub, flexShrink:0, paddingTop:6, fontWeight:700 }}>→</span>
        <div style={{ flex:1, minWidth:0 }}>
          {valueCopy != null ? (<>
            <CopyChip value={valueCopy} id={valueId} secret={secret} block wrap />
            {valueNote && <div style={{ fontSize:11, fontWeight:800, color: secret ? T.danger : T.sub, marginTop:6 }}>{valueNote}</div>}
          </>) : (
            <div style={{ display:"flex", gap:8, alignItems:"flex-start", background:STEP_BLUEBG, border:`1px solid ${STEP_BLUE}`, borderRadius:8, padding:"9px 11px" }}>
              <span style={{ flexShrink:0, fontSize:14 }}>👆</span>
              <span style={{ fontSize:12, color:T.ink, lineHeight:1.5 }}>{valuePick}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ ...sCard, marginBottom:0 }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>🚶 Steps from Apple Health</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10, lineHeight:1.55 }}>
        A website can't read Apple Health on its own. This uses an iPhone <b>Shortcut</b> that sends only a date and daily step total when you tap <b>Sync now</b>. A one-time, ~2-minute setup.
      </div>

      <label style={{display:"flex",gap:9,alignItems:"flex-start",background:T.input,border:`1px solid ${consented?T.green:T.line}`,borderRadius:10,padding:"10px 11px",fontSize:11.5,color:T.sub,lineHeight:1.5,marginBottom:10}}>
        <input type="checkbox" checked={consented} onChange={e=>setData(d=>({...d,profile:{...(d.profile||{}),appleHealthConsentAt:e.target.checked?new Date().toISOString():null}}))} style={{width:18,minHeight:18,marginTop:1}} />
        <span>I understand the Shortcut sends <b style={{color:T.ink}}>daily date + step total</b> to The Lab/Supabase. Individual Health samples are not uploaded. I can revoke access and delete synced steps below.</span>
      </label>

      {latest !== undefined && latest !== null && (
        <div style={{ display:"flex", alignItems:"baseline", gap:8, background:"rgba(var(--accent-rgb),.10)", border:`1px solid ${T.green}`,
          borderRadius:10, padding:"9px 12px", marginBottom:10 }}>
          <span style={{ fontSize:22, fontWeight:800, color:T.green, fontVariantNumeric:"tabular-nums" }}>{latest.count.toLocaleString()}</span>
          <span style={{ fontSize:12.5, color:T.sub }}>steps · {dayLabel(latest.day)} ✓</span>
        </div>
      )}

      {err && <div style={{ fontSize:12.5, color:T.danger, marginBottom:8 }}>{err}</div>}
      {securityMsg && <div style={{fontSize:12.5,color:T.green,fontWeight:700,marginBottom:8,lineHeight:1.45}}>{securityMsg}</div>}

      {!token ? (
        <button onClick={connect} disabled={busy || !consented} style={{ background:T.green, color:"#000", fontWeight:800,
          padding:"11px 16px", borderRadius:10, fontSize:14, width:"100%", opacity:(busy||!consented)?0.5:1 }}>
          {busy ? "Setting up…" : "Connect Apple Health"}
        </button>
      ) : (<>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",margin:"2px 0 12px",padding:"10px 11px",background:T.input,border:`1px solid ${T.line}`,borderRadius:10}}>
          <div style={{flex:1,minWidth:170,fontSize:11.5,color:T.sub,lineHeight:1.45}}><b style={{color:T.ink}}>Shortcut access is active.</b> Rotate if the secret was exposed. Disconnect revokes it and deletes synced steps.</div>
          <ConfirmX label="Rotate secret" onConfirm={rotate} />
          <ConfirmX label="Disconnect & delete" onConfirm={disconnect} />
        </div>
        {/* how it works + the 14-day loop */}
        <div style={{ display:"flex", gap:11, alignItems:"flex-start", background:T.cardAlt, border:`1px solid ${T.line}`, borderRadius:12, padding:"12px 13px", margin:"4px 0 12px" }}>
          <span style={{ fontSize:20, flexShrink:0, lineHeight:1.1 }}>💡</span>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55 }}>
            Open the <b style={{ color:T.ink }}>Shortcuts</b> app → <b style={{ color:T.ink }}>+</b>, then add the actions below from the search bar (blue words = things you tap).
            This shortcut <b style={{ color:T.ink }}>loops over the last 14 days</b> and sends each one, so a single <b>🔄 Sync now</b> fills any gaps.
          </div>
        </div>
        <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(var(--accent-rgb),.08)", border:`1px solid ${T.green}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55, marginBottom:16 }}>
          <span style={{ flexShrink:0 }}>🎯</span>
          <span>It logs <b style={{ color:T.ink }}>finished days</b> (yesterday going back 14), so your numbers always <b style={{ color:T.ink }}>match Health exactly</b> —
            and re-syncing never double-counts, because each day just overwrites itself.</span>
        </div>

        {/* the one setting that unblocks Health sending — this is Step 1 (people skip it) */}
        <StepBlock n="1" title="Open Settings → Shortcuts → Advanced">
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.6, marginBottom:8 }}>
            Apple blocks shortcuts from sending Health data until you allow it. Turn this on once, or the sync fails with a “can't share Health items” error:
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, background:T.input, borderRadius:10, padding:"11px 13px" }}>
            {[["a","Open the iPhone", "Settings app"],["b","Tap", "Shortcuts"],["c","Tap", "Advanced"],["d","Turn ON", "Allow Sharing Large Amounts of Data"]].map(([n,pre,bold])=>(
              <div key={n} style={{ display:"flex", gap:8, alignItems:"baseline", fontSize:13, lineHeight:1.5 }}>
                <span style={{ color:STEP_BLUE, fontWeight:800, minWidth:14 }}>{n}.</span>
                <span style={{ color:T.sub }}>{pre} <b style={{ color:T.ink }}>{bold}</b></span>
              </div>
            ))}
          </div>
        </StepBlock>

        <StepBlock n="2" title="Repeat  (the 14-day loop)">
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:10 }}>
            Open the <b style={{ color:T.ink }}>Shortcuts</b> app → tap <b style={{ color:T.ink }}>+</b> (top-right) to start a new shortcut. Then add your first action:
          </div>
          <SearchBar text="Repeat" />
          <MockCard glyph="🔁" glyphBg="#8E8E93" title={<>Repeat <Tap>14</Tap> times</>} />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:10 }}>
            Add <b>Repeat</b>, then tap its number and change it to <b style={{ color:T.ink }}>14</b>. It drops in a <b>Repeat 14 Times</b> line and an <b>End Repeat</b> line.
          </div>
          {/* target structure — what the finished shortcut should look like */}
          <div style={{ fontSize:11, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Your shortcut should end up like this:</div>
          <div style={{ background:T.cardAlt, border:`1px solid ${STEP_BLUE}`, borderRadius:12, padding:"12px 14px", marginBottom:10, fontSize:12.5, fontFamily:"ui-monospace, Menlo, monospace", lineHeight:1.85 }}>
            <div style={{ color:STEP_BLUE, fontWeight:700 }}>🔁 Repeat 14 Times</div>
            {["Adjust Date","Find Health Samples","Calculate Statistics","Text  (Sum)","Format Date","Get Contents of URL"].map((t,i)=>(
              <div key={t} style={{ paddingLeft:16, color:T.ink }}><span style={{ color:T.sub }}>{i+2}.</span> {t}</div>
            ))}
            <div style={{ color:STEP_BLUE, fontWeight:700 }}>End Repeat</div>
          </div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"11px 13px", fontSize:12, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0, fontSize:15 }}>⚠️</span>
            <span><b style={{ color:T.ink }}>Every action must end up ABOVE the “End Repeat” line.</b> When you add steps 3–8 they'll appear <b>below</b> “End Repeat” by default —
              press-and-hold the <b>≡</b> grip on the right of each one and <b>drag it up above “End Repeat”</b> so it's inside the loop. Nothing should sit below End Repeat.</span>
          </div>
        </StepBlock>

        <StepBlock n="3" title="Adjust Date  (inside the loop)">
          <SearchBar text="Adjust Date" />
          <div style={{ fontSize:11, color:STEP_BLUE, fontWeight:700, marginBottom:8 }}>🔼 After adding it, drag it above “End Repeat.”</div>
          <MockCard glyph="🗓" glyphBg="#E64637" title={<><Tap>Subtract</Tap> <Var icon="🔁" iconBg="#8E8E93">Repeat Index</Var> <Tap>days</Tap> from <Var icon="📅" iconBg="#3B7BEF">Current Date</Var></>} />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:8 }}>Do these 4 taps, in order:</div>
          <ol style={{ fontSize:12.5, color:T.sub, lineHeight:1.6, paddingLeft:18, margin:"0 0 10px" }}>
            <li>It starts as “<b>Add 1 Days to …</b>”. Tap <b>Add</b> → choose <b>Subtract</b>.</li>
            <li>Tap the empty <b>date</b> slot (the “from ___” part) → pick <b style={{ color:STEP_BLUE }}>Current Date</b>.</li>
            <li>Tap the number <b>1</b> and delete it. A row of <b style={{ color:T.ink }}>blue chips</b> appears right above the keyboard — that's the <b>Variables bar</b>.</li>
            <li><b style={{ color:T.ink }}>Swipe that blue bar sideways</b> and tap <b style={{ color:STEP_BLUE }}>Repeat Index</b>. (Don't tap “Select Variable” — it's not in there.)</li>
          </ol>
          <div style={{ fontSize:12, color:T.sub, lineHeight:1.5, marginBottom:9 }}>Done right, it reads <b>Subtract Repeat Index Days from Current Date</b>, and its result is called <b>Adjusted Date</b>.</div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0, fontSize:14 }}>⚠️</span>
            <span><b style={{ color:T.ink }}>No “Repeat Index” in the blue bar?</b> Then this Adjust Date action isn't inside the loop yet — go to step 2 and drag it up between “Repeat 14 Times” and “End Repeat,” then try again.</span>
          </div>
        </StepBlock>

        <StepBlock n="4" title="Find Health Samples  (inside the loop)">
          <SearchBar text="Find Health Samples" />
          <div style={{ fontSize:11, color:STEP_BLUE, fontWeight:700, marginBottom:8 }}>🔼 After adding it, drag it above “End Repeat.”</div>
          {/* mock: the action with its two filter rows (Start Date is on yesterday) */}
          <div style={{ background:T.cardAlt, border:`1px solid ${STEP_BLUE}`, borderRadius:12, padding:"12px", margin:"0 0 10px" }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ width:29, height:29, borderRadius:8, flexShrink:0, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>❤️</span>
              <span style={{ fontSize:14, fontWeight:600, color:T.ink, lineHeight:1.5 }}>Find <Tap>Health Samples</Tap> where <Tap>All</Tap> of the following are true</span>
            </div>
            <div style={{ marginTop:11, borderTop:`1px solid ${T.line}`, paddingTop:10 }}>
              <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap", paddingBottom:10 }}>
                <span style={{ color:T.ink, fontSize:14, fontWeight:600 }}>Type</span><Tap>is</Tap><Tap>Steps</Tap>
              </div>
              <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap", padding:"10px 0", borderTop:`1px solid ${T.line}` }}>
                <span style={{ color:T.ink, fontSize:14, fontWeight:600 }}>Start Date</span><Tap>is on</Tap><Var icon="🗓" iconBg="#E64637">Adjusted Date</Var>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6, borderTop:`1px solid ${T.line}`, padding:"10px 0", color:STEP_BLUE, fontSize:13.5, fontWeight:600 }}><span style={{ fontSize:16 }}>⊕</span> Add Filter</div>
              {[["Unit","count"],["Group by","None"],["Sort by","None"]].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${T.line}`, padding:"10px 0", fontSize:14 }}>
                  <span style={{ color:T.ink }}>{k}</span><span style={{ color:STEP_BLUE, fontWeight:600 }}>{v}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:`1px solid ${T.line}`, paddingTop:10, fontSize:14 }}>
                <span style={{ color:T.ink }}>Limit</span>
                <span style={{ width:34, height:20, borderRadius:99, background:T.line, position:"relative", flexShrink:0 }}><span style={{ position:"absolute", top:2, left:2, width:16, height:16, borderRadius:99, background:"#fff" }} /></span>
              </div>
            </div>
          </div>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
            Two rows: <b>Type is Steps</b>, and <b>Start Date is on Adjusted Date</b>.
          </div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0, fontSize:14 }}>⚠️</span>
            <span>Tapping the <b>Date</b> opens a calendar — you don't want that. <b style={{ color:T.ink }}>Long-press (tap &amp; hold)</b> it → <b>Select Variable</b> → <b style={{ color:STEP_BLUE }}>Adjusted Date</b>.</span>
          </div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(var(--accent-rgb),.08)", borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0 }}>🔒</span>
            <span>The Lab <b style={{ color:T.ink }}>only writes to the one date you send</b>, so nobody can flood your history with old logs.</span>
          </div>
        </StepBlock>

        <StepBlock n="5" title="Calculate Statistics  (inside the loop)">
          <SearchBar text="Calculate Statistics" />
          <div style={{ fontSize:11, color:STEP_BLUE, fontWeight:700, marginBottom:8 }}>🔼 After adding it, drag it above “End Repeat.”</div>
          <MockCard glyph="📊" glyphBg="#8E8E93" title={<>Calculate the <Tap>Sum</Tap> of <Var icon="❤️" iconBg="#fff">Health Samples</Var></>} />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>It starts as “<b>Average</b> of <b>Input</b>.” Tap <b>Average</b> → pick <b>Sum</b>. Tap <b>Input</b> → pick <b>Health Samples</b>. That adds that day's steps into one number.</div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:STEP_BLUEBG, border:`1px solid ${STEP_BLUE}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
            <span style={{ flexShrink:0 }}>ℹ️</span>
            <span>Don't see <b style={{ color:T.ink }}>Health Samples</b> when you tap Input? Then step 4 isn't <b style={{ color:T.ink }}>above</b> this one — drag it up so it's <b>Find first, then Calculate</b>.</span>
          </div>
        </StepBlock>

        <StepBlock n="6" title="Text  (the Health-privacy fix)">
          <SearchBar text="Text" />
          <div style={{ fontSize:11, color:STEP_BLUE, fontWeight:700, marginBottom:8 }}>🔼 After adding it, drag it above “End Repeat.”</div>
          <MockCard glyph="📝" glyphBg="#EAB308" title={<>Text: <Var icon="📊" iconBg="#8E8E93">Sum</Var></>} />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
            Add a <b>Text</b> action. Tap the empty text box → insert <b>only the <span style={{ color:STEP_BLUE }}>Sum</span></b> variable (don't type anything).
            This turns the Health number into plain text so iOS will let you send it. In the next steps, <b>p_count</b> uses this <b>Text</b> — not Sum.
          </div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0, fontSize:14 }}>🔒</span>
            <span><b style={{ color:T.ink }}>Why this step:</b> without it you'd get <i>“trying to share N Health items.”</i> Sending plain text instead of raw Health data is the free workaround.</span>
          </div>
        </StepBlock>

        <StepBlock n="7" title="Format Date  (inside the loop)">
          <SearchBar text="Format Date" />
          <div style={{ fontSize:11, color:STEP_BLUE, fontWeight:700, marginBottom:8 }}>🔼 After adding it, drag it above “End Repeat.”</div>
          <MockCard glyph="🗓" glyphBg="#E64637" title={<>Format <Var icon="🗓" iconBg="#E64637">Adjusted Date</Var></>}
            rows={[
              ["Date Format", <span key="a" style={{ color:STEP_BLUE, fontWeight:600 }}>Custom</span>],
              ["Format String", <span key="b" style={{ color:T.sub, fontStyle:"italic" }}>paste from the box below ↓</span>],
              ["Locale", <span key="c" style={{ color:STEP_BLUE, fontWeight:600 }}>Default</span>],
            ]} />
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
            <span style={{ flexShrink:0, fontSize:14 }}>⚠️</span>
            <span><b style={{ color:T.ink }}>#1 mistake:</b> the date here must say <b style={{ color:STEP_BLUE }}>Adjusted Date</b> — not a greyed-out <b>“Date”</b>. If it's greyed,
              <b style={{ color:T.ink }}> tap it and pick Adjusted Date</b>, or your steps won't save.</span>
          </div>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:8 }}>
            Tap the date slot → pick <b style={{ color:STEP_BLUE }}>Adjusted Date</b>. Tap <b>Short</b> next to Date Format → pick <b>Custom</b>.
            A <b>Format String</b> box appears — tap <b>Copy</b> below and paste it in there:
          </div>
          <Copy label="Paste into the Format String box" value="yyyy-MM-dd" id="fmt" />
        </StepBlock>

        <StepBlock n="8" title="Get Contents of URL  (inside the loop)">
          <SearchBar text="Get Contents of URL" />
          <div style={{ fontSize:11, color:STEP_BLUE, fontWeight:700, marginBottom:8 }}>🔼 After adding it, drag it above “End Repeat.”</div>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:10 }}>
            Everything here is <b style={{ color:T.ink }}>tap-to-copy right in place</b> — no scrolling around. A blue box = copy it. A grey note = tap that box on your phone and pick a variable.
          </div>
          {/* the whole expanded action, with every value copyable in place */}
          <div style={{ background:T.cardAlt, border:`1px solid ${STEP_BLUE}`, borderRadius:12, padding:"12px", margin:"0 0 12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ width:29, height:29, borderRadius:8, flexShrink:0, background:STEP_BLUE, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>🌐</span>
              <span style={{ fontSize:14.5, fontWeight:700, color:T.ink }}>Get Contents of <Tap>URL</Tap></span>
            </div>

            {/* URL */}
            <div style={{ marginTop:11, borderTop:`1px solid ${T.line}`, paddingTop:11 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>URL — paste this in the top box, then tap “Show More”</div>
              <div style={{ display:"flex", gap:8, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:8, padding:"9px 11px", fontSize:11.5, color:T.sub, lineHeight:1.55, marginBottom:8 }}>
                <span style={{ flexShrink:0, fontSize:14 }}>⚠️</span>
                <span>The URL box often already has a blue variable in it (like <b style={{ color:T.ink }}>Formatted Date</b>). <b style={{ color:T.ink }}>Delete that first</b> — tap it and hit backspace so the box is empty — then paste the URL below.</span>
              </div>
              <CopyChip value={url} id="url" block wrap />
            </div>

            {/* Method */}
            <div style={{ marginTop:13 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Method — tap POST</div>
              <div style={{ display:"inline-flex", background:T.input, borderRadius:8, padding:3, gap:3 }}>
                <span style={{ padding:"5px 14px", borderRadius:6, fontSize:12.5, fontWeight:700, color:T.sub }}>GET</span>
                <span style={{ padding:"5px 14px", borderRadius:6, fontSize:12.5, fontWeight:800, background:T.green, color:"#000" }}>POST</span>
              </div>
            </div>

            {/* Headers — both key and value copyable */}
            <div style={{ marginTop:13 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:7 }}>Headers — tap “Add new header” twice</div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:7, marginBottom:8, flexWrap:"nowrap" }}>
                <div style={{ flexShrink:0, paddingTop:2 }}><CopyChip value="apikey" id="k-api" /></div>
                <span style={{ color:T.sub, flexShrink:0, paddingTop:6 }}>→</span>
                <div style={{ flex:1, minWidth:0 }}><CopyChip value={apikey} id="v-api" block wrap /></div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"nowrap" }}>
                <CopyChip value="Content-Type" id="k-ct" />
                <span style={{ color:T.sub, flexShrink:0 }}>→</span>
                <div style={{ flex:1, minWidth:0 }}><CopyChip value="application/json" id="v-ct" block /></div>
              </div>
              <div style={{ fontSize:10.5, color:T.sub, marginTop:6 }}>Left chip = the header’s <b style={{ color:T.ink }}>Key</b>, right chip = its <b style={{ color:T.ink }}>Value</b>.</div>
            </div>

            {/* Request Body */}
            <div style={{ marginTop:13 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:7 }}>Request Body — tap JSON, then tap “Add new field” 3 times</div>
              <div style={{ display:"inline-flex", background:T.input, borderRadius:8, padding:3, gap:3, marginBottom:9 }}>
                <span style={{ padding:"5px 12px", borderRadius:6, fontSize:12.5, fontWeight:700, color:T.sub }}>Form</span>
                <span style={{ padding:"5px 12px", borderRadius:6, fontSize:12.5, fontWeight:800, background:T.green, color:"#000" }}>JSON</span>
                <span style={{ padding:"5px 12px", borderRadius:6, fontSize:12.5, fontWeight:700, color:T.sub }}>File</span>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"flex-start", background:STEP_BLUEBG, border:`1px solid ${STEP_BLUE}`, borderRadius:8, padding:"9px 11px", fontSize:11.5, color:T.ink, lineHeight:1.55, marginBottom:10 }}>
                <span style={{ flexShrink:0 }}>ℹ️</span>
                <span>Set the 3 fields' types in this order: <b>Field 1 = Text</b>, <b>Field 2 = Text</b>, <b>Field 3 = Number</b>. So it's <b>2 Text then 1 Number</b> — the last one must be <b style={{ color:STEP_BLUE }}>Number</b>. Tap the little type label on each field to change it.</span>
              </div>
              <JField num="1" type="Text" name="p_token" nameId="k-tok" valueCopy={token} valueId="tok" secret valueNote="🔒 Don’t share this with anyone" />
              <JField num="2" type="Text" name="p_day" nameId="k-day" valuePick={<>Tap this Text box. In the bar <b>above the keyboard</b>, tap <b>Formatted Date</b> (from step 7). When it's set it looks like this: <span style={{ display:"inline-block", verticalAlign:"middle" }}><Var icon="📅" iconBg="#3B7BEF">Formatted Date</Var></span></>} />
              <JField num="3" type="Number" name="p_count" nameId="k-cnt" valuePick={<>Tap this Number box → pick the <b>Text</b> variable (from step 6). When it's set it looks like this: <span style={{ display:"inline-block", verticalAlign:"middle" }}><Var icon="📝" iconBg="#EAB308">Text</Var></span> <b style={{ color:T.danger }}>Not Sum directly</b> — that triggers the "share Health items" block.</>} />
              <div style={{ fontSize:10.5, color:T.sub, marginTop:2, lineHeight:1.5 }}>
                Only <b style={{ color:T.ink }}>p_token</b>’s value is copied. For <b>p_day</b> and <b>p_count</b> the value is a blue variable you <b>pick</b>, not type — they should end up looking exactly like the chips above.
              </div>
            </div>
          </div>
        </StepBlock>

        <StepBlock n="9" title="Name it & save">
          <div style={{ background:"rgba(var(--accent-rgb),.08)", border:`1px solid ${T.green}`, borderRadius:12, padding:"13px 14px" }}>
            <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
              At the top of the shortcut, tap its <b style={{ color:T.ink }}>name</b> (or the <b>⌄</b> next to it → <b>Rename</b>), erase what's there,
              and paste this <b style={{ color:T.ink }}>exact</b> name — it must match, or the Sync button and automations can't find it:
            </div>
            <Copy label="Shortcut name — tap Copy, then paste it" value="The Lab: Steps" id="name" />
            <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginTop:8 }}>Then tap <b style={{ color:T.ink }}>Done</b> (top-right). Your shortcut is built. ✅</div>
          </div>
        </StepBlock>

        {/* test it — do this first, before automating */}
        <div style={{ display:"flex", gap:11, alignItems:"flex-start", background:T.cardAlt, border:`1px solid ${T.line}`, borderRadius:12, padding:"12px 13px", marginBottom:14 }}>
          <span style={{ width:30, height:30, borderRadius:99, background:T.green, color:"#000", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, paddingLeft:2 }}>▶</span>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55 }}>
            <b style={{ color:T.ink }}>Test it first:</b> open the shortcut and tap its <b style={{ color:T.ink }}>play button</b> once.
            The very first run, iPhone pops up permission prompts (read Health, then send data to the URL) — tap
            <b style={{ color:T.ink }}> Always Allow</b> each time. It usually asks <b style={{ color:T.ink }}>about 3 times</b>; keep tapping Always Allow until they stop.
            Then come back here and you'll see <b style={{ color:T.green }}>yesterday's step total</b> appear at the top ✓.
            <div style={{ marginTop:6, fontSize:11.5 }}>After that first time it won't ask again — future syncs are one tap.</div>
          </div>
        </div>

        {/* one-tap manual refresh from inside the app (iOS shortcuts:// scheme) */}
        <a href={`shortcuts://run-shortcut?name=${encodeURIComponent("The Lab: Steps")}`} style={{
          display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:T.green, color:"#000",
          fontWeight:800, fontSize:14, padding:"12px 16px", borderRadius:10, textDecoration:"none", marginBottom:6 }}>
          🔄 Sync my steps now
        </a>
        <div style={{ fontSize:11, color:T.sub, textAlign:"center", lineHeight:1.5, marginBottom:16 }}>
          Tap this anytime to refresh (iPhone only). It runs the shortcut you built, so it must be named exactly <b>The Lab: Steps</b>.
        </div>

        {/* how you keep it updated — Sync now is the only reliable path */}
        <div style={{ background:"rgba(var(--accent-rgb),.08)", borderRadius:12, padding:"14px 15px", margin:"0 0 14px" }}>
          <div style={{ fontSize:14.5, fontWeight:800, color:T.ink, marginBottom:6 }}>Keeping it updated 🔄</div>
          <div style={{ fontSize:12, color:T.sub, lineHeight:1.6 }}>
            Apple only lets apps read Health while your iPhone is <b style={{ color:T.ink }}>unlocked</b>, so there's no reliable way to sync in the
            background. Just tap <b style={{ color:T.ink }}>🔄 Sync now</b> whenever you open The Lab — it refills the <b style={{ color:T.ink }}>last 14 days</b> each
            time, so you never get gaps (and it never double-counts).
          </div>
        </div>
      </>)}
    </div>
  );
}

/* The Lab Pro card — real product plan. Reflects whether the account already has Pro
   (server-granted). Payment checkout isn't wired yet, so the CTA shows a friendly note. */
function ProCard({ isPro }) {
  const [plan, setPlan] = useState("yr");
  const [note, setNote] = useState(false);
  const feats = [
    ["💪", "Lab's AI Coach", "Progression, plateau, volume & weak-point tips from your logs"],
    ["👟", "Apple Health steps", "iPhone Shortcut syncing, step duels & the group steps board"],
    ["🎨", "Themes & PRO badge", "Accent colors, dark palettes, and a PRO badge in your groups"],
  ];
  return (
    <div style={{ ...sCard, marginBottom:0 }}>
      {isPro ? (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <span style={{ fontSize:26 }}>✨</span>
          <div><div style={{ fontSize:15, fontWeight:800, color:T.green }}>You're a Pro member</div><div style={{ fontSize:12, color:T.sub }}>Everything below is unlocked — thanks for supporting The Lab 🙏</div></div>
        </div>
      ) : (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:17, fontWeight:800, color:T.ink, marginBottom:2 }}>✨ The Lab Pro</div>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.5 }}>Everything that turns The Lab from a tracker into a coach.</div>
        </div>
      )}
      {feats.map(([ic,t,d])=>(
        <div key={t} style={{ display:"flex", gap:11, alignItems:"flex-start", padding:"9px 0", borderTop:`1px solid ${T.creamLine}` }}>
          <span style={{ fontSize:19, flexShrink:0 }}>{ic}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>{t}
              <span style={{ fontSize:10, color:T.green, fontWeight:800, marginLeft:6, letterSpacing:.4 }}>{isPro?"UNLOCKED":"✓"}</span>
            </div>
            <div style={{ fontSize:12, color:T.sub, lineHeight:1.45 }}>{d}</div>
          </div>
        </div>
      ))}
      {!isPro && (<>
        <div style={{ display:"flex", gap:8, marginTop:14, marginBottom:12 }}>
          <button onClick={()=>setPlan("mo")} style={{ flex:1, background: plan==="mo"?"rgba(var(--accent-rgb),.10)":T.input, border:`1px solid ${plan==="mo"?T.green:T.line}`, borderRadius:12, padding:"11px 12px", textAlign:"center", cursor:"pointer" }}>
            <div style={{ fontSize:18, fontWeight:800, color: plan==="mo"?T.green:T.ink }}>$4.99<span style={{fontSize:12, color:T.sub, fontWeight:600}}>/mo</span></div>
            <div style={{ fontSize:11, color:T.sub }}>Monthly</div>
          </button>
          <button onClick={()=>setPlan("yr")} style={{ flex:1, position:"relative", background: plan==="yr"?"rgba(var(--accent-rgb),.10)":T.input, border:`1px solid ${plan==="yr"?T.green:T.line}`, borderRadius:12, padding:"11px 12px", textAlign:"center", cursor:"pointer" }}>
            <div style={{ fontSize:18, fontWeight:800, color: plan==="yr"?T.green:T.ink }}>$39.99<span style={{fontSize:12, color:T.sub, fontWeight:600}}>/yr</span></div>
            <div style={{ fontSize:11, color:T.green, fontWeight:700 }}>Save 33%</div>
          </button>
        </div>
        <button onClick={()=>setNote(true)} style={{ width:"100%", background:T.green, color:"#000", fontWeight:800, padding:"12px", borderRadius:11, fontSize:15, cursor:"pointer" }}>
          Go Pro — {plan==="yr" ? "$39.99/yr" : "$4.99/mo"}
        </button>
        {note && <div style={{ fontSize:12, color:T.sub, textAlign:"center", marginTop:9, lineHeight:1.5 }}>🚧 Checkout is being finalized — you'll be able to subscribe right here very soon. Thanks for the interest!</div>}
      </>)}
    </div>
  );
}

/* Cloud backups: Supabase keeps a snapshot of each day's starting state (~30 days,
   written by a database trigger — no app code can forget to do it). Works from ANY
   device, so a lost phone can't take your history with it. */
function CloudBackupsCard({ username, setData }) {
  const [rows, setRows] = useState(null); // null = loading
  const [err, setErr] = useState(null);
  const [confirmDay, setConfirmDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { (async () => {
    try { setRows(await listCloudBackups()); }
    catch (e) { setErr("Couldn't reach the cloud — check your connection."); setRows([]); }
  })(); }, []);
  const restore = async (day) => {
    setBusy(true); setErr(null);
    try {
      const v = await getCloudBackup(day);
      if (!v) throw new Error("empty");
      setData({ ...defaultData, ...migrateData(v, (username || "").toLowerCase()) });
      setConfirmDay(null); setDone(true);
    } catch { setErr("Couldn't load that backup — try again in a moment."); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>☁️ In the cloud</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>
        A copy of each day's data, kept for 30 days — reachable from <b>any</b> device, even if
        this one is lost or wiped. Saved automatically; nothing for you to do.
      </div>
      {done && <div style={{ fontSize:12.5, color:T.green, fontWeight:700, marginBottom:8 }}>✅ Restored — check your log, then just keep using the app to save it.</div>}
      {err && <div style={{ fontSize:12.5, color:T.danger, marginBottom:8 }}>{err}</div>}
      {rows === null && <div className="skeleton" style={{ height:44, borderRadius:10 }} />}
      {rows !== null && !rows.length && !err && (
        <div style={{ fontSize:12.5, color:T.sub }}>No cloud backups yet — your first one appears after tomorrow's first change.</div>
      )}
      {(rows || []).map(r => (
        <div key={String(r.day)} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderTop:`1px solid ${T.creamLine}`, fontSize:13 }}>
          <span style={{ fontWeight:700, minWidth:88 }}>{fmtDate(String(r.day))}</span>
          <span style={{ color:T.sub, flex:1 }}>{(r.sets||0) + (r.weighins||0) + (r.cardio||0)} entries</span>
          {confirmDay === r.day ? (<>
            <button disabled={busy} onClick={()=>restore(r.day)} style={{ background:T.dangerBg, color:T.danger, padding:"6px 12px", fontSize:12.5, fontWeight:700, opacity:busy?0.6:1 }}>{busy ? "Restoring…" : "Yes, restore this"}</button>
            <button disabled={busy} onClick={()=>setConfirmDay(null)} style={{ background:T.input, color:T.sub, padding:"6px 10px", fontSize:12.5, fontWeight:600 }}>Cancel</button>
          </>) : (
            <button onClick={()=>setConfirmDay(r.day)} style={{ background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"6px 12px", fontSize:12.5, fontWeight:700 }}>Restore</button>
          )}
        </div>
      ))}
    </div>
  );
}

/* Automatic on-device backups: the first save of each day snapshots your data (last 7
   days kept). Restoring loads that snapshot — and still goes through the big-delete
   guard, so a bad restore can't silently nuke anything either. */
function BackupsCard({ user, username, setData }) {
  const scan = () => {
    const pre = `lt-bk-${user.id}-`;
    return Object.keys(localStorage).filter(k => k.startsWith(pre)).sort().reverse()
      .map(k => { try { const d = JSON.parse(localStorage.getItem(k)); return { key:k, day:k.slice(pre.length),
        n:(d.log||[]).length + (d.bodyweight||[]).length + (d.cardio||[]).length }; } catch { return null; } })
      .filter(Boolean);
  };
  const [list] = useState(scan);
  const [confirmKey, setConfirmKey] = useState(null);
  const [done, setDone] = useState(false);
  const restore = (k) => {
    try {
      const raw = localStorage.getItem(k); if (!raw) return;
      setData({ ...defaultData, ...migrateData(JSON.parse(raw), (username||"").toLowerCase()) });
      setConfirmKey(null); setDone(true);
    } catch {}
  };
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>📱 On this device</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>
        The last 7 days you used the app here — works even offline. Restoring replaces what's
        loaded now (a big shrink still asks first). For a copy you keep yourself, the 📚 Library
        tab has full downloads under “Your data.”
      </div>
      {done && <div style={{ fontSize:12.5, color:T.green, fontWeight:700, marginBottom:8 }}>✅ Restored — check your log, then just keep using the app to save it.</div>}
      {!list.length && <div style={{ fontSize:12.5, color:T.sub }}>No snapshots yet — one is kept automatically the next time you log something.</div>}
      {list.map(b => (
        <div key={b.key} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderTop:`1px solid ${T.creamLine}`, fontSize:13 }}>
          <span style={{ fontWeight:700, minWidth:88 }}>{fmtDate(b.day)}</span>
          <span style={{ color:T.sub, flex:1 }}>{b.n} entries</span>
          {confirmKey === b.key ? (<>
            <button onClick={()=>restore(b.key)} style={{ background:T.dangerBg, color:T.danger, padding:"6px 12px", fontSize:12.5, fontWeight:700 }}>Yes, restore this</button>
            <button onClick={()=>setConfirmKey(null)} style={{ background:T.input, color:T.sub, padding:"6px 10px", fontSize:12.5, fontWeight:600 }}>Cancel</button>
          </>) : (
            <button onClick={()=>setConfirmKey(b.key)} style={{ background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"6px 12px", fontSize:12.5, fontWeight:700 }}>Restore</button>
          )}
        </div>
      ))}
    </div>
  );
}

/* Password changes require the current password, so an unattended signed-in device is
   not enough to silently take over the account. */
function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {ok, text}
  const save = async () => {
    setMsg(null);
    if (!current) { setMsg({ ok:false, text:"Enter your current password." }); return; }
    if (pw.length < 10) { setMsg({ ok:false, text:"Use at least 10 characters." }); return; }
    if (pw !== pw2) { setMsg({ ok:false, text:"The two passwords don't match." }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw, current_password: current });
      if (error) throw error;
      setMsg({ ok:true, text:"✅ Password changed — your browser will offer to update the saved one." });
      setCurrent(""); setPw(""); setPw2("");
    } catch (e) { setMsg({ ok:false, text:String(e?.message || e) }); }
    finally { setBusy(false); }
  };
  return (
      <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:10 }}>Change password</div>
      <input type={show?"text":"password"} value={current} onChange={e=>{setCurrent(e.target.value);setMsg(null);}} placeholder="current password" autoComplete="current-password" style={{marginBottom:8}} />
      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
        <input type={show?"text":"password"} value={pw} onChange={e=>{setPw(e.target.value); setMsg(null);}} placeholder="new password" autoComplete="new-password" />
        <button onClick={()=>setShow(s=>!s)} style={{ background:T.input, color:T.sub, padding:"0 12px", fontSize:13, border:`1px solid ${T.line}` }}>{show?"Hide":"Show"}</button>
      </div>
      <input type={show?"text":"password"} value={pw2} onChange={e=>{setPw2(e.target.value); setMsg(null);}} placeholder="confirm new password" autoComplete="new-password" style={{ marginBottom:10 }} />
      <button onClick={save} disabled={busy || !current || !pw || !pw2} style={{ background:T.green, color:"#000", padding:"10px 18px", fontWeight:700, opacity:(busy||!current||!pw||!pw2)?0.5:1 }}>
        {busy ? "Saving…" : "Update password"}
      </button>
      {msg && <div style={{ marginTop:8, fontSize:13, color: msg.ok?T.green:T.danger }}>{msg.text}</div>}
    </div>
  );
}

function BackupCodesCard({ user }) {
  const [ready,setReady]=useState(null);
  const [codes,setCodes]=useState([]);
  const [copied,setCopied]=useState(false);
  const [busy, setBusy] = useState(false);
  const [err,setErr]=useState("");
  const legacy=user.email?.endsWith("@lifting.local");
  useEffect(()=>{hasBackupCodes().then(setReady).catch(()=>setReady(false));},[]);
  const generate=async()=>{setBusy(true);setErr("");try{const next=await generateBackupCodes();setCodes(next);setReady(true);}catch(e){setErr(String(e?.message||e));}finally{setBusy(false);}};
  const copy=async()=>{try{await navigator.clipboard.writeText(codes[0]||"");setCopied(true);setTimeout(()=>setCopied(false),1600);}catch{setErr("Copy failed — save the code somewhere private.");}};
  return <div style={{...sCard}}>
    <div style={{fontSize:14,fontWeight:800,color:T.ink,marginBottom:3}}>🛟 One-time backup code</div>
    <div style={{fontSize:12,color:T.sub,lineHeight:1.5,marginBottom:10}}>
      {legacy?"Your existing username account does not need an email. This code lets you recover it once if you forget the password.":"Your verified email is the main recovery method. This code is an optional one-time fallback."}
      {' '}Generating a new code permanently replaces the old one.
    </div>
    {ready===false&&legacy&&<div style={{background:T.dangerBg,color:T.danger,padding:"9px 11px",borderRadius:9,fontSize:12.5,fontWeight:700,marginBottom:9}}>Recovery is not protected yet. Generate and save your codes now.</div>}
    {codes.length>0&&<div style={{background:T.input,border:`1px solid ${T.green}`,borderRadius:10,padding:11,marginBottom:10}}>
      <div style={{fontSize:11,color:T.danger,fontWeight:800,marginBottom:8}}>Shown once. Store it in a password manager.</div>
      <code style={{display:"block",color:T.ink,fontFamily:"ui-monospace,monospace",fontSize:14,letterSpacing:.4}}>{codes[0]}</code>
      <button onClick={copy} style={{marginTop:10,background:T.green,color:"#000",padding:"8px 12px",fontWeight:800,fontSize:12.5}}>{copied?"Copied ✓":"Copy code"}</button>
    </div>}
    <button onClick={generate} disabled={busy} style={{background:T.input,color:T.ink,border:`1px solid ${T.line}`,padding:"9px 14px",fontSize:13,fontWeight:750,opacity:busy ? 0.6 : 1}}>{busy?"Generating…":ready?"Replace my code":"Generate backup code"}</button>
    {err&&<div style={{color:T.danger,fontSize:12.5,marginTop:8}}>{err}</div>}
  </div>;
}

function PrivacySharingCard({ data, setData }) {
  const sharing=data.profile?.sharing||{};
  const toggle=(key, fallback)=>(value)=>setData(d=>({...d,profile:{...(d.profile||{}),sharing:{...(d.profile?.sharing||{}),[key]:typeof value==="function"?value(d.profile?.sharing?.[key]??fallback):value}}}));
  return <div style={{...sCard}}>
    <div style={{fontSize:14,fontWeight:800,color:T.ink,marginBottom:3}}>👥 What groups can see</div>
    <div style={{fontSize:12,color:T.sub,lineHeight:1.5,marginBottom:10}}>The private account file is never shared. These switches control the small, sanitized profile groups receive.</div>
    <FeatureToggle label="Workout history and PRs" on={sharing.workouts??true} setOn={toggle("workouts",true)} desc="On by default. Shares set details needed for the group feed, records and workout profile." />
    <FeatureToggle label="Cardio activity" on={sharing.cardio??true} setOn={toggle("cardio",true)} desc="On by default. Shares activity, duration and calories—not private notes." />
    <FeatureToggle label="Bodyweight" on={sharing.bodyweight??false} setOn={toggle("bodyweight",false)} desc="Private by default. Enable only if you want group comparisons and your profile weight tile." />
    <FeatureToggle label="Bodyweight goals" on={sharing.goals??false} setOn={toggle("goals",false)} desc="Private by default. Enable only if you want your goal and progress shown to groupmates." />
  </div>;
}

function DeleteAccountCard({ user }) {
  const [busy,setBusy]=useState(false); const [err,setErr]=useState(""); const [sent,setSent]=useState(false);
  const legacy=user.email?.endsWith("@lifting.local");
  const request=async()=>{setBusy(true);setErr("");try{await requestAccountDeletion();setSent(true);}catch(e){setErr(String(e?.message||e));}finally{setBusy(false);}};
  return <div style={{...sCard,border:`1px solid ${T.danger}`}}>
    <div style={{fontSize:14,fontWeight:800,color:T.danger,marginBottom:4}}>Permanently delete account</div>
    <div style={{fontSize:12,color:T.sub,lineHeight:1.5}}>Deletion is never immediate. We email a private confirmation link first; the final confirmation permanently removes your login and app data.</div>
    {legacy?<div style={{marginTop:9,fontSize:12.5,color:T.sub}}>This username-only account has no delivery email. It can stay email-free; choose the legacy deletion policy before this option is activated.</div>:
      sent?<div style={{marginTop:9,fontSize:12.5,color:T.green,fontWeight:750}}>Confirmation sent to {user.email}. The link expires in 30 minutes.</div>:
      <button onClick={request} disabled={busy||!ACCOUNT_EMAIL_ENABLED} style={{marginTop:10,background:T.dangerBg,color:T.danger,padding:"9px 13px",fontSize:13,fontWeight:800,opacity:ACCOUNT_EMAIL_ENABLED?1:.55}}>{busy?"Sending…":ACCOUNT_EMAIL_ENABLED?"Email deletion confirmation":"Email confirmation is being activated"}</button>}
    {err&&<div style={{color:T.danger,fontSize:12.5,marginTop:8}}>{err}</div>}
  </div>;
}

function LegalLinksCard() {
  const [page,setPage]=useState(null);
  return <div style={{...sCard,display:"flex",gap:8}}>
    <button onClick={()=>setPage("privacy")} style={{flex:1,background:T.input,color:T.ink,border:`1px solid ${T.line}`,padding:9,fontSize:13}}>Privacy Policy</button>
    <button onClick={()=>setPage("terms")} style={{flex:1,background:T.input,color:T.ink,border:`1px solid ${T.line}`,padding:9,fontSize:13}}>Terms of Use</button>
    {page&&<LegalModal page={page} onClose={()=>setPage(null)} />}
  </div>;
}

function signOutAndClear(user) {
  clearLocalAccountData(user.id);
  return supabase.auth.signOut();
}

/* ================= FRIENDS ================= */
const BIG_LIFTS = ["Bench Press","Incline Bench Press","Incline Dumbbell Press","Back Squat","Deadlift","Overhead Press"];
const LIFT_SHORT = { "Bench Press":"Bench", "Incline Bench Press":"Inc Bench", "Incline Dumbbell Press":"Inc DB", "Back Squat":"Squat", "Deadlift":"Dead", "Overhead Press":"OHP" };
const BIG_LIFT_SET = new Set(BIG_LIFTS);
/* High-rep sets don't give a trustworthy estimated 1RM. Cap the reps that count:
   the competitive "big lifts" cut off at 12, everything else is more lenient at 15. */
const REP_CAP = (exercise) => (BIG_LIFT_SET.has(exercise) ? 12 : 15);
/* Best estimated 1RM for one exercise from its logged entries, ignoring sets whose
   reps exceed the cap (a 30-rep set shouldn't crown anyone). null if nothing qualifies. */
const bestEst1RM = (exercise, entries) => {
  const cap = REP_CAP(exercise);
  const vals = (entries || [])
    .filter(e => !e.quick && e.weight != null && (e.reps || 0) >= 1 && (e.reps || 0) <= cap)
    .map(e => e1rm(e.weight, e.reps));
  return vals.length ? Math.max(...vals) : null;
};

/* =================== THE LAB COACH (rule-based, no LLM / no API) ===================
   Reads your logged sets and turns them into personalized coaching with plain math:
   progression nudges, plateau/deload alerts, and push/pull/legs balance. Group weak-
   point comparison is loaded separately in CoachCard. 100% local, free, offline. */
const MUSCLE_GROUP = (m) => {
  const s = (m || "").toLowerCase();
  if (/chest|shoulder|tricep|delt|pec/.test(s)) return "push";
  if (/back|lat|bicep|trap|rear|rhomboid/.test(s)) return "pull";
  if (/quad|hamstring|glute|calf|leg|adductor/.test(s)) return "legs";
  if (/ab|core|oblique/.test(s)) return "core";
  return "other";
};
const dayGap = (a, b) => Math.round((new Date(a + "T00:00") - new Date(b + "T00:00")) / 86400000);

const GNAME = { push: "push (chest/shoulders/triceps)", pull: "pull (back/biceps)", legs: "legs" };
const GSHORT = { push: "Push", pull: "Pull", legs: "Legs" };

/* Training splits the coach can tailor its "what to train today" advice to. The user
   picks one in the Coach card; until they do, the coach won't assume a rotation. */
const SPLITS = {
  ppl:        { icon: "🔁", label: "Push / Pull / Legs", short: "PPL" },
  arnold:     { icon: "💪", label: "Arnold Split", short: "Arnold" },
  upperlower: { icon: "↕️", label: "Upper / Lower", short: "Upper/Lower" },
  phul:       { icon: "⚡", label: "PHUL / Power-Hypertrophy", short: "PHUL" },
  fullbody:   { icon: "🌐", label: "Full Body", short: "Full body" },
  bro:        { icon: "🎯", label: "Bro Split (body-part)", short: "Bro split" },
  custom:     { icon: "🛠", label: "Custom", short: "Custom" },
  other:      { icon: "🤷", label: "No fixed split", short: "No split" },
};
/* auto-name a custom day from the muscles it targets — no typing needed */
const dayLabel = (muscles) => (muscles && muscles.length) ? muscles.join(" & ") : "New day";
const maxDate = (...ds) => ds.filter(Boolean).sort().reverse()[0] || null;
/* Arnold split groups antagonists: Chest & Back, then Shoulders & Arms, then Legs. */
const ARNOLD_DAY = (m) => {
  const s = (m || "").toLowerCase();
  if (/chest|pec|back|lat|rhomboid/.test(s)) return "cb";
  if (/shoulder|delt|bicep|tricep|trap|forearm|arm/.test(s)) return "sa";
  if (/quad|hamstring|glute|calf|leg|adductor/.test(s)) return "legs";
  return "other";
};
const ARNOLD_NAME = { cb: "chest & back", sa: "shoulders & arms", legs: "legs" };

/* These are editable starting points, not one-size-fits-all prescriptions. The evidence
   supports fractional accounting for secondary muscles and shows different volume curves
   for hypertrophy versus strength. */
const GOAL_MODES = {
  hypertrophy: { label:"Hypertrophy", short:"Muscle growth", targets:{ Chest:14, Back:16, Shoulders:14, Biceps:12, Triceps:12, Legs:16, Abs:10 } },
  strength: { label:"Strength", short:"Strength & heavier work", targets:{ Chest:8, Back:10, Shoulders:8, Biceps:6, Triceps:6, Legs:10, Abs:6 } },
};
const GOAL_RESEARCH = {
  hypertrophy: {
  Chest: "14 is a middle-of-the-evidence target: volume generally helps, while the best trained-lifter review places the practical range around 12–20 hard sets per muscle each week.",
  Back: "16 gives room for both vertical and horizontal pulling. It is a practical higher-midrange target, not proof that back needs more sets than every other muscle.",
  Shoulders: "14 recognizes that different movements emphasize front, side, and rear delts. Pressing contributes only a half set here, so add direct work if a head is lagging.",
  Biceps: "12 is a moderate target because rows and pulldowns already contribute half sets. If recovery and progress are good, you can move the editable goal higher.",
  Triceps: "12 is a moderate target because presses contribute half sets. Research does not establish one unique triceps optimum, so adjust it using progress and recovery.",
  Legs: "16 is a practical higher-midrange total for the app’s combined leg group. Track quad, hamstring, glute, and calf exercise choices too—one total cannot guarantee each gets enough work.",
  Abs: "10 is a conservative direct-work starting target. Evidence is much thinner for a precise ab-set optimum, and bracing in compound lifts is not counted as equivalent direct ab training.",
  },
  strength: {
    Chest: "8 keeps enough pressing practice while leaving recovery room for heavier bench work. Strength is more specific to the lifts you practice than to a muscle-only set total.",
    Back: "10 supports rows and pulls that build a stable base for pressing and pulling strength without using hypertrophy-level volume by default.",
    Shoulders: "8 includes pressing plus some direct shoulder work. Keep the main strength movement heavy and technically consistent.",
    Biceps: "6 is accessory volume; it supports pulling strength but does not replace practicing your main pulling lift.",
    Triceps: "6 is accessory volume; pressing strength responds especially to heavy, specific press practice, not just more isolation sets.",
    Legs: "10 supports squat and hinge work while managing fatigue. Strength programs should distribute these sets across the exact lifts you want to improve.",
    Abs: "6 is a conservative accessory target. Bracing and trunk work help support heavy compound lifting, but are not a direct measure of squat or deadlift strength.",
  },
};
/* Which muscles a push/pull/legs (and Arnold) day actually targets — used to keep
   the coach's insights relevant to the day it's pointing you at. */
const GROUP_MUSCLES = { push: ["Chest", "Shoulders", "Triceps"], pull: ["Back", "Biceps"], legs: ["Legs"] };
const ARNOLD_MUSCLES = { cb: ["Chest", "Back"], sa: ["Shoulders", "Biceps", "Triceps"], legs: ["Legs"] };
const ALL_UPPER = ["Chest", "Back", "Shoulders", "Biceps", "Triceps"];
const goalModeOf = (data) => data.profile?.setGoalMode === "strength" ? "strength" : "hypertrophy";
const targetOverrideKeyOf = (data) => goalModeOf(data) === "strength" ? "strengthSetTargets" : "setTargets";
const customSetTargetsOf = (data) => data.profile?.[targetOverrideKeyOf(data)] || {};
const setTargetsOf = (data) => ({ ...GOAL_MODES[goalModeOf(data)].targets, ...customSetTargetsOf(data) });
const splitLabelOf = (data) => SPLITS[data.profile?.split]?.short || "current plan";
/* Estimated weekly frequency for converting the weekly target into a practical
   per-workout number. Custom rotations use their real cycle and muscle days. */
const splitFrequencyOf = (data) => {
  const split=data.profile?.split||"other";
  const fixed={ppl:2,arnold:2,upperlower:2,phul:2,fullbody:3,bro:1,other:1};
  if (split!=="custom") return Object.fromEntries(MUSCLES.map(m=>[m,fixed[split]||1]));
  const days=(Array.isArray(data.profile?.customSplit)?data.profile.customSplit:[]).filter(d=>d.rest||d.muscles?.length);
  if (!days.length) return Object.fromEntries(MUSCLES.map(m=>[m,1]));
  const repeats=Math.max(1,Math.round(7/days.length));
  return Object.fromEntries(MUSCLES.map(m=>[m,Math.max(1,days.filter(d=>!d.rest&&d.muscles?.includes(m)).length*repeats)]));
};
/* A custom-split day can be a rest day; label it accordingly. */
const dayTitle = (day) => day?.rest ? "Rest day" : dayLabel(day?.muscles);
/* Muscle groups actually logged on a given date. */
const groupsLoggedOn = (log, exMap, date) => {
  const s = new Set();
  for (const e of log) if (e.date === date && e.effort !== "Warm-up") for (const m of entryPrimaryMuscles(e, exMap)) s.add(m);
  return s;
};
/* Where you are in a custom rotation TODAY. Training days are sticky: a missed workout
   stays next until a matching session is logged. Explicit rest days still pass with the
   calendar. A manual restart ignores older logs and puts Day 1 back at the front. */
function customCyclePosition(data, log, exMap) {
  const cycle = (Array.isArray(data.profile?.customSplit) ? data.profile.customSplit : []).filter(d => d.rest || d.muscles?.length);
  if (!cycle.length) return { cycle, idx: -1 };
  const today = todayStr();
  const len = cycle.length;
  const restartAt = Number(data.profile?.cycleRestartAt) || 0;
  const eligibleLog = restartAt ? (log || []).filter(e => Number(e?.id) > restartAt) : (log || []);
  // 1) log-driven anchor: match your latest logged session to the best-fitting training day
  const dates = [...new Set(eligibleLog.map(e => e.date))].sort().reverse();
  const lastDate = dates.find(date => groupsLoggedOn(eligibleLog, exMap, date).size > 0);
  if (lastDate) {
    const g = groupsLoggedOn(eligibleLog, exMap, lastDate);
    if (g.size) {
      let bestIdx = -1, best = 0;
      cycle.forEach((d, i) => {
        if (d.rest || !d.muscles?.length) return;
        const set = new Set(d.muscles);
        let inter = 0; g.forEach(m => { if (set.has(m)) inter++; });
        const uni = new Set([...d.muscles, ...g]).size;
        const jac = uni ? inter / uni : 0;               // Jaccard overlap — how well the day matches
        if (jac > best) { best = jac; bestIdx = i; }
      });
      if (bestIdx >= 0) {
        if (lastDate === today) return { cycle, idx: bestIdx };
        // The matched workout is complete. Move once, then consume only explicit rest
        // days with elapsed time. Stop on the next training day no matter how old the log is.
        let idx = (bestIdx + 1) % len;
        let elapsed = Math.max(1, dayGap(today, lastDate));
        while (cycle[idx].rest && elapsed > 1) { idx = (idx + 1) % len; elapsed--; }
        return { cycle, idx };
      }
    }
  }
  // 2) Before a matching workout exists, Day 1 stays queued. If Day 1 is an explicit
  // rest day, calendar time can consume rest entries until the first training day.
  const start = data.profile?.cycleStart || today;
  let idx = 0, elapsed = Math.max(0, dayGap(today, start));
  while (cycle[idx].rest && elapsed > 0) { idx = (idx + 1) % len; elapsed--; }
  return { cycle, idx };
}
const naturalList = (items) => {
  const a = [...new Set((items || []).filter(Boolean))];
  if (a.length < 2) return a[0] || "your planned muscles";
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0,-1).join(", ")}, and ${a[a.length-1]}`;
};
const coachMuscleList = (muscles) => naturalList((muscles || []).map(m=>m.toLowerCase()));
const effortAllowsLoad = (effort) => effort === "Could've done more" || effort === "Right amount";
const DEFAULT_COACH_PREFS = { focusStyle:"overdue", staleDays:4, progression:true, volume:true, balance:true };
const coachPrefsOf = (data) => ({ ...DEFAULT_COACH_PREFS, ...(data.profile?.coachPrefs || {}) });

/* Build one practical session from the same inputs as the coach: split position,
   overdue work, weekly gaps, today's credited sets, and the selected goal mode. */
function todayWorkoutPlan(data, exMap) {
  const log=Array.isArray(data.log)?data.log:[];
  const today=gymDayStr(), wk=weekStart(today), split=data.profile?.split||"";
  const prefs=coachPrefsOf(data), targets=setTargetsOf(data), frequency=splitFrequencyOf(data);
  const weekly=Object.fromEntries(MUSCLES.map(m=>[m,0]));
  const todayDone=Object.fromEntries(MUSCLES.map(m=>[m,0]));
  const lastByMuscle={};
  for (const e of log) {
    if (e.effort==="Warm-up") continue;
    for (const [m,credit] of entryMuscleCredits(e,exMap)) {
      if (!MUSCLES.includes(m)) continue;
      const amount=credit*setCountOf(e);
      if (weekStart(e.date)===wk) weekly[m]+=amount;
      if (e.date===today) todayDone[m]+=amount;
    }
    for (const m of entryPrimaryMuscles(e,exMap)) if(!lastByMuscle[m]||e.date>lastByMuscle[m]) lastByMuscle[m]=e.date;
  }
  const goalFor=(m)=>{
    const base=Math.round((targets[m]/Math.max(1,frequency[m]))*2)/2;
    const left=Math.max(0,targets[m]-weekly[m]);
    return Math.max(0,Math.round(Math.min(base,todayDone[m]+left)*2)/2);
  };
  if (!split) return {muscles:[],rows:[],reason:"Choose a split so the coach can build today's session.",complete:false};
  let candidates=[];
  if(split==="custom") candidates=(data.profile?.customSplit||[]).filter(d=>!d.rest&&d.muscles?.length).map(d=>({id:d.id,muscles:d.muscles}));
  else if(split==="ppl") candidates=Object.entries(GROUP_MUSCLES).map(([id,muscles])=>({id,muscles}));
  else if(split==="arnold") candidates=Object.entries(ARNOLD_MUSCLES).map(([id,muscles])=>({id,muscles}));
  else if(split==="upperlower"||split==="phul") candidates=[{id:"upper",muscles:ALL_UPPER},{id:"lower",muscles:["Legs"]}];
  else if(split==="fullbody") candidates=[{id:"full",muscles:["Chest","Back","Legs"]}];
  else if(split==="bro") candidates=MUSCLES.filter(m=>m!=="Abs").map(m=>({id:m,muscles:[m]}));
  else candidates=MUSCLES.map(m=>({id:m,muscles:[m]}));
  candidates=candidates.map(c=>({...c,muscles:[...new Set(c.muscles)].filter(m=>MUSCLES.includes(m))})).filter(c=>c.muscles.length);
  const gapFor=m=>lastByMuscle[m]?dayGap(today,lastByMuscle[m]):30;
  const overdueScore=c=>c.muscles.reduce((sum,m)=>sum+gapFor(m),0)/c.muscles.length;
  const todayGroups=groupsLoggedOn(log,exMap,today);
  const matchScore=c=>{
    const matches=c.muscles.filter(m=>todayGroups.has(m)).length;
    const coverage=matches/Math.max(1,todayGroups.size);
    const specificity=matches/Math.max(1,c.muscles.length);
    return coverage*.75+specificity*.25;
  };
  let chosen=null, reason="";
  // Once the log clearly matches a split day, make the visible session follow what
  // the person is actually doing; missed-work coaching is still evaluated separately.
  if(todayGroups.size){
    const started=candidates.slice().sort((a,b)=>matchScore(b)-matchScore(a))[0];
    if(started&&matchScore(started)>=.65){
      chosen=started;
      reason="Tracking the split day your logged sets match.";
    }
  }
  if(!chosen&&split==="custom"&&prefs.focusStyle!=="volume"){
    const pos=customCyclePosition(data,log.filter(e=>e.date<today),exMap);
    const queued=pos.idx>=0?pos.cycle[pos.idx]:null;
    if(queued?.rest) return {muscles:[],rows:[],reason:"😴 Rest day in your custom split. Recovery is the plan today.",complete:true,rest:true};
    if(queued&&!queued.rest){
      const match=queued.muscles.filter(m=>todayGroups.has(m)).length/Math.max(1,queued.muscles.length);
      if(match<.5) chosen=candidates.find(c=>c.id===queued.id)||null;
      if(chosen) reason="Next unfinished day in your custom split.";
    }
  }
  if(!chosen&&prefs.focusStyle==="volume"){
    chosen=candidates.map(c=>({...c,score:c.muscles.reduce((sum,m)=>sum+Math.max(0,targets[m]-weekly[m]),0)})).sort((a,b)=>b.score-a.score)[0]||null;
    if(chosen) reason="These muscles have your largest remaining weekly set gap.";
  }
  if(!chosen){
    chosen=candidates.slice().sort((a,b)=>overdueScore(b)-overdueScore(a))[0]||null;
    if(chosen){
      const gap=Math.round(overdueScore(chosen));
      reason=gap>=prefs.staleDays?"This workout is the most overdue — about "+gap+" day"+(gap===1?"":"s")+" since training.":"Best next fit for your "+splitLabelOf(data)+".";
    }
  }
  const rows=(chosen?.muscles||[]).map(m=>({muscle:m,done:Math.round(todayDone[m]*10)/10,goal:goalFor(m),weekly:Math.round(weekly[m]*10)/10,weeklyGoal:targets[m]})).filter(r=>r.goal>0||r.done>0);
  const complete=rows.length>0&&rows.every(r=>r.goal===0||r.done>=r.goal);
  if(!rows.length&&chosen) return {muscles:chosen.muscles,rows:[],reason:"Your weekly targets for this workout are already covered.",complete:true};
  return {muscles:chosen?.muscles||[],rows,reason:complete?"Today's recommended targets are complete.":reason,complete};
}

function coachTips(data, exMap, units) {
  const log = Array.isArray(data.log) ? data.log : [];
  const cardio = Array.isArray(data.cardio) ? data.cardio : [];
  const tips = [];
  const today = todayStr();
  const wk = weekStart(today);
  const goalMode = goalModeOf(data);
  const trainingLevel = data.profile?.trainingLevel || "beginner";
  const coachPrefs = coachPrefsOf(data);
  const inc = units === "kg" ? 2.5 : 5;              // smallest sensible jump
  const byEx = {};
  for (const e of log) {
    if (e.weight == null || e.quick || e.effort === "Warm-up" || !(e.reps > 0)) continue;
    (byEx[e.exercise] ||= []).push(e);
  }

  // ---- PROGRESSION: goal-aware double progression, checked across recent sessions ----
  const progressions = [];
  for (const [ex, entries] of Object.entries(byEx)) {
    if (exMap[ex]?.type === "Bodyweight") continue;
    const byDate = {};
    for (const e of entries) (byDate[e.date] ||= []).push(e);
    const dates = Object.keys(byDate).sort().reverse();
    const confirmationSessions = trainingLevel === "advanced" ? 3 : 2;
    if (dates.length < confirmationSessions || dayGap(today, dates[0]) > 21) continue;
    const topSet = (ds) => byDate[ds].slice().sort((a, b) => (b.weight - a.weight) || ((b.reps || 0) - (a.reps || 0)))[0];
    const recentTops = dates.slice(0, confirmationSessions).map(topSet);
    const t0 = recentTops[0], t1 = recentTops[1];
    if (machineOf(exMap[ex]) && recentTops.some(t=>(t.gym||"") !== (t0.gym||""))) continue;
    const isMainLift = BIG_LIFT_SET.has(ex);
    const upper = goalMode === "strength" && isMainLift ? 5 : isMainLift ? 10 : 12;
    const priorFloor = trainingLevel === "intermediate" ? upper - 1 : upper;
    if (recentTops.some((t,i)=>t.weight!==t0.weight || t.reps < (i===0?upper:priorFloor))) continue;
    const nextRepText = goalMode === "strength" && isMainLift ? "3–5 reps" : isMainLift ? "6–8 clean reps" : "8–10 clean reps";
    progressions.push({ ex, cur:t0.weight, curReps:t0.reps, repsList:recentTops.map(t=>t.reps), next:t0.weight+inc, nextRepText,
      canAdd:effortAllowsLoad(t0.effort), failed:t0.effort==="To failure", sessions:confirmationSessions });
  }
  // (progressions are pushed later, once we know which muscles today's plan targets)

  // ---- TRAINING FOCUS: missed work and genuinely overdue muscles come first ----
  // The default does NOT blindly advance because somebody logged an out-of-order day.
  // A user's custom split still defines sensible muscle pairings, while their preference
  // decides whether the coach ranks overdue work, the planned split, or weekly goal gaps.
  const split = data.profile?.split || null;
  const todayGroups = groupsLoggedOn(log, exMap, today);
  const trainedToday = todayGroups.size > 0;
  const todayList = naturalList([...todayGroups].map(m=>m.toLowerCase()));
  const pushTrain = (key, text, icon = "🎯") => tips.push({ key, icon, cat: "Training focus", text });
  let focusMuscles = null;
  const lastByMuscle = {};
  for (const e of log) {
    if (e.effort === "Warm-up") continue;
    for (const m of entryPrimaryMuscles(e, exMap)) if (!lastByMuscle[m] || e.date > lastByMuscle[m]) lastByMuscle[m] = e.date;
  }
  let candidates = [];
  if (split === "custom") candidates = (data.profile?.customSplit || []).filter(d=>!d.rest&&d.muscles?.length).map(d=>({id:d.id,muscles:d.muscles}));
  else if (split === "ppl") candidates = Object.entries(GROUP_MUSCLES).map(([id,muscles])=>({id,muscles}));
  else if (split === "arnold") candidates = Object.entries(ARNOLD_MUSCLES).map(([id,muscles])=>({id,muscles}));
  else if (split === "upperlower" || split === "phul") candidates = [{id:"upper",muscles:ALL_UPPER},{id:"lower",muscles:["Legs"]}];
  else if (split === "fullbody") candidates = [{id:"full",muscles:["Chest","Back","Legs"]}];
  else if (split === "bro") candidates = MUSCLES.filter(m=>m!=="Abs").map(m=>({id:m,muscles:[m]}));
  else if (split === "other") candidates = MUSCLES.map(m=>({id:m,muscles:[m]}));
  candidates = candidates.map(c=>({...c,muscles:[...new Set(c.muscles)].filter(m=>MUSCLES.includes(m)&&!todayGroups.has(m))})).filter(c=>c.muscles.length);
  const gapFor = (m) => lastByMuscle[m] ? dayGap(today,lastByMuscle[m]) : 30;
  const rank = (c) => c.muscles.reduce((s,m)=>s+gapFor(m),0)/c.muscles.length;
  let chosen = null;
  if (split && candidates.length) {
    if (coachPrefs.focusStyle !== "volume" && split === "custom") {
      const pos = customCyclePosition(data, log.filter(e=>e.date<today), exMap);
      const queued = pos.idx>=0 ? pos.cycle[pos.idx] : null;
      const matched = queued && !queued.rest ? queued.muscles.filter(m=>todayGroups.has(m)).length / Math.max(1,queued.muscles.length) : 1;
      // If today's workout did not substantially match the day that was already queued,
      // keep that missed day visible instead of allowing the new log to jump past it.
      if (queued && !queued.rest && matched < .5) chosen = candidates.find(c=>c.id===queued.id) || null;
    }
    if (coachPrefs.focusStyle === "volume") {
      const targetsNow=setTargetsOf(data), got={};
      for (const e of log) if(e.effort!=="Warm-up"&&weekStart(e.date)===wk) for(const [m,c] of entryMuscleCredits(e,exMap)) got[m]=(got[m]||0)+c*setCountOf(e);
      chosen=candidates.map(c=>({...c,score:c.muscles.reduce((s,m)=>s+Math.max(0,(targetsNow[m]||0)-(got[m]||0)),0)})).sort((a,b)=>b.score-a.score)[0]||null;
    }
    if (!chosen) chosen=candidates.slice().sort((a,b)=>rank(b)-rank(a))[0];
  }
  if (chosen) {
    focusMuscles=chosen.muscles;
    const gap=Math.round(rank(chosen));
    const label=coachMuscleList(chosen.muscles);
    if (coachPrefs.focusStyle === "volume") {
      pushTrain(`focus-volume-${wk}-${chosen.id}`, `${label[0].toUpperCase()+label.slice(1)} currently has your largest weekly set gap.`);
    } else if (gap >= coachPrefs.staleDays) {
      const timing=gap>=30&&chosen.muscles.some(m=>!lastByMuscle[m])?"has no recent logged session":`hasn't been trained in about ${gap} day${gap===1?"":"s"}`;
      pushTrain(`focus-overdue-${chosen.id}-${today}`, `${label[0].toUpperCase()+label.slice(1)} ${timing}.${trainedToday?` You logged ${todayList} today, but this work is still overdue.`:" Prioritize it when you train."}`);
    }
  }

  // ---- PROGRESSION tips, now filtered to stay relevant to today's plan ----
  // Drop suggestions for muscles you already trained today (stale), and — when the coach
  // knows what you're hitting next — prefer moves for those muscles.
  const progMuscle = (ex) => exMap[ex]?.muscle;
  let progPool = progressions.filter(p => !todayGroups.has(progMuscle(p.ex)));
  if (focusMuscles && focusMuscles.length) {
    progPool = progPool.filter(p => focusMuscles.includes(progMuscle(p.ex)));
  }
  progPool.sort((a, b) => (BIG_LIFT_SET.has(b.ex) - BIG_LIFT_SET.has(a.ex)));
  for (const p of progPool.slice(0, 2)) {
    const recent = `${dispW(p.cur, units)}${uLabel(units)} × ${p.repsList.join(" / ")} over ${p.sessions} sessions`;
    const action = p.failed
      ? `Repeat the weight without hitting failure.`
      : p.canAdd
        ? `Next: ${dispW(p.next, units)}${uLabel(units)} for ${p.nextRepText}.`
        : `Had 1–2 reps left? Try ${dispW(p.next, units)}${uLabel(units)}. If not, add 1 clean rep.`;
    tips.push({ key: `prog-${p.ex}-${p.cur}-${p.curReps}`, icon: "📈", cat: "Progression",
      text: `${p.ex}: ${recent}. ${action}`,
      basis: `${goalMode === "strength" ? "Strength" : "Hypertrophy"} mode · warm-ups excluded · effort ${p.failed || p.canAdd ? "was logged" : "wasn't logged"}` });
  }

  // ---- PR PROJECTION / ETA: a big lift trending up → project the next milestone ----
  for (const ex of BIG_LIFTS) {
    const entries = byEx[ex]; if (!entries || entries.length < 6) continue;
    const weekBest = {};
    for (const e of entries) if ((e.reps || 0) <= REP_CAP(ex)) { const w = weekStart(e.date); weekBest[w] = Math.max(weekBest[w] || 0, e1rm(e.weight, e.reps)); }
    const weeks = Object.keys(weekBest).sort(); if (weeks.length < 3) continue;
    const recent = weeks.slice(-6);
    const firstD = dispW(weekBest[recent[0]], units), lastD = dispW(weekBest[recent[recent.length - 1]], units);
    const span = recent.length - 1; if (span < 2) continue;
    const slope = (lastD - firstD) / span;                // display units / week
    if (slope > (units === "kg" ? 0.4 : 1)) {
      const cur = Math.max(...recent.map(w => dispW(weekBest[w], units)));
      const round = units === "kg" ? 5 : 10;
      const milestone = Math.ceil((cur + 0.5) / round) * round;
      const weeksTo = Math.ceil((milestone - cur) / slope);
      if (weeksTo >= 1 && weeksTo <= 16) {
        tips.push({ key: `pr-${ex}-${milestone}`, icon: "🚀", cat: "Projection",
          text: `${LIFT_SHORT[ex] || ex}: estimated 1RM trending toward ${milestone}${uLabel(units)} in ~${weeksTo} week${weeksTo === 1 ? "" : "s"}.`,
          basis: `${recent.length} weekly bests · estimate, not a guarantee` });
        break;
      }
    }
  }

  // ---- PLATEAU: no est-1RM gain over the last 4 trained weeks despite recent training ----
  for (const ex of BIG_LIFTS) {
    const entries = byEx[ex]; if (!entries || entries.length < 4) continue;
    const lastDate = entries.map(e => e.date).sort().reverse()[0];
    if (dayGap(today, lastDate) > 14) continue;
    const weekBest = {};
    for (const e of entries) if ((e.reps || 0) <= REP_CAP(ex)) { const w = weekStart(e.date); weekBest[w] = Math.max(weekBest[w] || 0, e1rm(e.weight, e.reps)); }
    const weeks = Object.keys(weekBest).sort(); if (weeks.length < 4) continue;
    const recent = weeks.slice(-4);
    if (Math.max(...recent.map(w => weekBest[w])) <= weekBest[recent[0]] * 1.005)
      tips.push({ key: `plateau-${ex}-${wk}`, icon: "🧱", cat: "Plateau",
        text: `${LIFT_SHORT[ex] || ex}: no estimated-strength gain in 4 trained weeks. Check technique and effort; go lighter if fatigued.`,
        basis: "Four weekly estimated-1RM bests · high-rep sets excluded" });
  }

  // ---- WEEKLY VOLUME: exact fractional math, goal-aware wording, no end-week cramming ----
  const targets = setTargetsOf(data);
  const wsets = {};
  const creditedToday = new Set();
  for (const e of log) {
    if (e.effort === "Warm-up" || weekStart(e.date) !== wk) continue;
    for (const [m, c] of entryMuscleCredits(e, exMap)) {
      wsets[m] = (wsets[m] || 0) + c*setCountOf(e);
      if (e.date === today) creditedToday.add(m);
    }
  }
  const totalSets = Object.values(wsets).reduce((a, b) => a + b, 0);
  if (totalSets >= 6) {
    const behind = (m) => { if (creditedToday.has(m)) return null; const tgt = targets[m]; if (!tgt) return null; const got = wsets[m] || 0; if (got < 1) return null; const deficit = tgt - got; return deficit >= 3 ? { m, got, tgt, deficit } : null; };
    const pickWorst = (pool) => pool.map(behind).filter(Boolean).sort((a, b) => b.deficit - a.deficit)[0] || null;
    const worst = (focusMuscles && focusMuscles.length && pickWorst(focusMuscles)) || pickWorst(MUSCLES);
    if (worst) {
      const usesCustomGoal = customSetTargetsOf(data)[worst.m] != null;
      const mondayIndex = (new Date(today + "T12:00:00").getDay() + 6) % 7;
      const daysLeft = 6 - mondayIndex;
      const remaining = fmtSets(worst.deficit);
      const timing = daysLeft <= 1 && worst.deficit > 4
        ? `Don't cram ${remaining} sets in now—plan them across next week.`
        : `${remaining} left this week. Spread them across normal sessions.`;
      tips.push({ key: `vol-${worst.m}-${wk}`, icon: "📊", cat: "Volume",
        text: `${worst.m}: ${fmtSets(worst.got)} / ${worst.tgt} sets. ${timing}`,
        basis: `${usesCustomGoal?"Saved custom target":"Research starting target"} · main muscle = 1 · secondary muscle = ½ · warm-ups excluded` });
    }
  }

  // ---- BALANCE: push/pull ratio + leg neglect over the last 28 days ----
  const since = dAdd(today, -28);
  const vol = { push: 0, pull: 0, legs: 0, core: 0, other: 0 };
  const recentTrainingDates = new Set();
  for (const e of log) {
    if (e.date < since || e.effort === "Warm-up") continue;
    for (const muscle of entryPrimaryMuscles(e, exMap)) vol[MUSCLE_GROUP(muscle)] += setCountOf(e);
    recentTrainingDates.add(e.date);
  }
  if (vol.push + vol.pull >= 8) {
    if (vol.push >= vol.pull * 1.75 && vol.push-vol.pull >= 6) tips.push({ key: `bal-pp-${wk}`, icon: "⚖️", cat: "Balance", text: `4 weeks: ${vol.push} push vs ${vol.pull} pull sets. Add rows or pulldowns for better balance.`, basis:"Four-week primary-muscle comparison · warm-ups excluded" });
    else if (vol.pull >= vol.push * 1.75 && vol.pull-vol.push >= 6) tips.push({ key: `bal-pp-${wk}`, icon: "⚖️", cat: "Balance", text: `4 weeks: ${vol.pull} pull vs ${vol.push} push sets. Add pressing for better balance.`, basis:"Four-week primary-muscle comparison · warm-ups excluded" });
  }
  const tot = vol.push + vol.pull + vol.legs + vol.core + vol.other;
  const customPlansLegs = split !== "custom" || (data.profile?.customSplit || []).some(d=>d.muscles?.includes("Legs"));
  if (customPlansLegs && recentTrainingDates.size >= 5 && tot >= 20 && vol.legs <= tot * 0.15)
    tips.push({ key: `bal-legs-${wk}`, icon: "🦵", cat: "Balance", text: `4 weeks: ${vol.legs} leg vs ${vol.push + vol.pull} upper-body sets. Leg training is overdue for better balance.`, basis:"Four-week primary-muscle comparison · neutral planning flag" });

  // ---- RECOVERY: only flag a lower-fatigue week when schedule + effort support it ----
  const daysByWeek = {};
  for (const e of log) {
    if (e.effort === "Warm-up") continue;
    const w = weekStart(e.date); (daysByWeek[w] ||= new Set()).add(e.date);
  }
  let streakWeeks = 0;
  for (let i = 0; i < 12; i++) { const w = dAdd(wk, -7 * i); const days = daysByWeek[w]; if (days && days.size >= 3) streakWeeks++; else break; }
  const fatigueWindow = dAdd(today, -13);
  const effortSets = log.filter(e=>e.date>=fatigueWindow && e.effort && e.effort!=="Warm-up" && !e.quick);
  const failureRate = effortSets.length ? effortSets.filter(e=>e.effort==="To failure").length / effortSets.length : 0;
  const hasPlateau = tips.some(t=>t.cat==="Plateau");
  if (streakWeeks >= 5 && effortSets.length >= 6 && failureRate >= 0.35 && hasPlateau)
    tips.push({ key: `deload-${wk}`, icon: "🛌", cat: "Recovery",
      text: `Fatigue flag: ${streakWeeks} busy weeks + a plateau + ${Math.round(failureRate*100)}% failure sets. Consider a lighter week.`,
      basis:"Schedule + logged effort + performance trend; only appears when all three agree" });

  return tips.filter(t => {
    if (["Progression","Projection","Plateau"].includes(t.cat)) return coachPrefs.progression;
    if (t.cat === "Volume") return coachPrefs.volume;
    if (["Balance","Recovery"].includes(t.cat)) return coachPrefs.balance;
    return true;
  });
}

/* The Coach card (shown on Home for Pro). Personal tips are instant; the group weak-
   point comparison loads in the background. Every tip can be dismissed ("don't show
   again"), stored per-account in data.profile.coachDismissed. */
function CoachCard({ data, exMap, user, setData, onOpenLog }) {
  const units = useUnit();
  const tips = useMemo(() => coachTips(data, exMap, units), [data, exMap, units]);
  const [groupTip, setGroupTip] = useState(null);
  const dismissed = data.profile?.coachDismissed || [];
  const dismiss = (key) => setData(d => ({ ...d, profile: { ...(d.profile || {}), coachDismissed: [...(d.profile?.coachDismissed || []), key] } }));
  const split = data.profile?.split || "";
  const setSplit = (v) => setData(d => ({ ...d, profile: { ...(d.profile || {}), split: v } }));
  // custom split builder — a list of named days, each targeting some muscles
  const customDays = Array.isArray(data.profile?.customSplit) ? data.profile.customSplit : [];
  const setCustom = (fn) => setData(d => { const cur = Array.isArray(d.profile?.customSplit) ? d.profile.customSplit : []; return { ...d, profile: { ...(d.profile || {}), customSplit: fn(cur) } }; });
  const addDay = () => setCustom(days => [...days, { id: Math.random().toString(36).slice(2), muscles: [] }]);
  const addRest = () => setCustom(days => [...days, { id: Math.random().toString(36).slice(2), rest: true, muscles: [] }]);
  const toggleMuscle = (id, m) => setCustom(days => days.map(x => x.id === id ? { ...x, muscles: x.muscles.includes(m) ? x.muscles.filter(z => z !== m) : [...x.muscles, m] } : x));
  const removeDay = (id) => setCustom(days => days.filter(x => x.id !== id));
  // Explicitly put Day 1 back at the front and ignore workouts logged before this click.
  // Save the exact prior cursor fields so the action is completely reversible.
  const restartRotation = () => setData(d => {
    const profile = d.profile || {};
    const undo = profile.cycleRestartUndo || {
      hadStart: Object.prototype.hasOwnProperty.call(profile, "cycleStart"),
      start: profile.cycleStart ?? null,
      hadRestartAt: Object.prototype.hasOwnProperty.call(profile, "cycleRestartAt"),
      restartAt: profile.cycleRestartAt ?? null,
    };
    return { ...d, profile: { ...profile, cycleStart: todayStr(), cycleRestartAt: Date.now(), cycleRestartUndo: undo } };
  });
  const undoRestartRotation = () => setData(d => {
    const profile = { ...(d.profile || {}) };
    const undo = profile.cycleRestartUndo;
    if (!undo) return d;
    if (undo.hadStart) profile.cycleStart = undo.start; else delete profile.cycleStart;
    if (undo.hadRestartAt) profile.cycleRestartAt = undo.restartAt; else delete profile.cycleRestartAt;
    delete profile.cycleRestartUndo;
    return { ...d, profile };
  });
  const canUndoRestart = !!data.profile?.cycleRestartUndo;
  // position is read from your logs (same logic the coach uses), so the builder agrees with the tips
  const { cycle, idx: cyPos } = customCyclePosition(data, data.log || [], exMap);
  const todayDayId = cyPos >= 0 ? cycle[cyPos].id : null;
  // editable weekly set targets per muscle; mirrors the Dashboard's selected goal type
  const goalMode = goalModeOf(data);
  const goalModeInfo = GOAL_MODES[goalMode];
  const trainingLevel = data.profile?.trainingLevel || "beginner";
  const setTrainingLevel = (level) => setData(d=>({...d, profile:{...(d.profile||{}), trainingLevel:level}}));
  const coachPrefs = coachPrefsOf(data);
  const setCoachPref = (key, value) => setData(d=>({...d,profile:{...(d.profile||{}),coachPrefs:{...coachPrefsOf(d),[key]:value}}}));
  const customTargetCount = Object.keys(customSetTargetsOf(data)).length;
  const targets = setTargetsOf(data);
  const bumpTarget = (m, delta) => setData(d => { const cur = setTargetsOf(d); const key = targetOverrideKeyOf(d); return { ...d, profile: { ...(d.profile || {}), [key]: { ...(d.profile?.[key] || {}), [m]: Math.max(0, Math.min(40, (cur[m] || 0) + delta)) } } }; });
  const [showTargets, setShowTargets] = useState(false);
  // the split setup collapses once you've chosen one; expands again via the ✎ chip
  const [editing, setEditing] = useState(!split);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const groups = await listMyGroups(); if (!groups.length) return;
        const ids = new Set();
        for (const g of groups) { const ms = await listMembers(g.id); for (const m of ms) if (m.user_id !== user.id) ids.add(m.user_id); }
        if (!ids.size) return;
        const list = [...ids];
        const states = await loadSharedUserStates(list);
        const myLog = data.log || [];
        const latestBw = (st) => {
          const rows = [...(st?.bodyweight || [])].filter(x=>x.weight>0).sort((a,b)=>a.date.localeCompare(b.date));
          return rows[rows.length-1]?.weight || null;
        };
        const myBw = latestBw(data); if (!myBw) return;
        let worst = null;
        for (const lift of BIG_LIFTS) {
          const mine = bestEst1RM(lift, myLog.filter(e => e.exercise === lift)); if (mine == null) continue;
          const peers = [];
          for (const id of list) { const st = states[id]; if (!st?.log) continue;
            const bw = latestBw(st); if (!bw) continue;
            const b = bestEst1RM(lift, st.log.filter(e => e.exercise === lift)); if (b != null) peers.push(b/bw); }
          if (peers.length < 2) continue;
          peers.sort((a,b)=>a-b); const mid=Math.floor(peers.length/2); const median=peers.length%2?peers[mid]:(peers[mid-1]+peers[mid])/2;
          const ratio = (mine/myBw)/median; if (!worst || ratio < worst.ratio) worst = { lift, ratio, peers:peers.length };
        }
        if (alive && worst && worst.ratio < 0.85)
          setGroupTip({ key: `weak-${worst.lift}`, icon: "🎯", cat: "Weak point",
            text: `${LIFT_SHORT[worst.lift] || worst.lift}: ${Math.round((1 - worst.ratio) * 100)}% below your group's bodyweight-adjusted median. Prioritize it if it matters to you.`,
            basis:`Compared with ${worst.peers} group members using estimated 1RM ÷ latest bodyweight` });
      } catch { /* offline / no groups */ }
    })();
    return () => { alive = false; };
  }, [data.log, user.id, units]);

  const all = (groupTip && coachPrefs.balance ? [...tips, groupTip] : tips).filter(t => !dismissed.includes(t.key));
  const otherTips = all.filter(t => t.cat !== "Training focus");
  const workoutPlan = useMemo(()=>todayWorkoutPlan(data,exMap),[data,exMap]);
  const workoutStartedToday = useMemo(()=>groupsLoggedOn(data.log||[],exMap,gymDayStr()).size>0,[data.log,exMap]);
  const CAT_COLOR = { Progression:"var(--cal-lift)", "Training focus":"var(--cal-lift)", Projection:"var(--cal-combo)", Plateau:"#E9C46A", Volume:STEP_BLUE, Balance:STEP_BLUE, Recovery:STEP_BLUE, "Weak point":"#FF7A45" };

  const setMinimized = (value) => setData(d => ({ ...d, profile: { ...(d.profile || {}), minimizedSections:{ ...(d.profile?.minimizedSections||{}), aiCoach:value } } }));
  const minimized = !!data.profile?.minimizedSections?.aiCoach;
  if (minimized) {
    return (
      <div className="card compact-card" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>💪</span>
        <span style={{ fontSize: 13, color: T.sub, fontWeight: 600, flex: 1, minWidth: 0 }}>Lab's AI Coach minimized{workoutStartedToday&&workoutPlan.rows.length ? " — today's workout is active" : ""}.</span>
        <button onClick={() => setMinimized(false)} style={showSectionBtn}>Show</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ border: "1px solid color-mix(in srgb,var(--cal-lift) 34%,var(--line))", background: "radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--cal-lift) 11%,transparent),transparent 55%),radial-gradient(85% 70% at 100% 100%,color-mix(in srgb,var(--cal-cardio) 6%,transparent),transparent 62%),linear-gradient(180deg,color-mix(in srgb,var(--card) 90%,#fff 5%),var(--card) 70%)" }}>
      {/* header — split chip + minimize on the right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13 }}>
        <div className="h" style={{ fontSize: 18, color: T.ink, flex:1, minWidth:0 }}>💪 Lab's AI Coach</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          {split && !editing && (
            <button onClick={() => setEditing(true)} title="Change split" style={{ display: "flex", alignItems: "center", gap: 5, background: T.input, border: `1px solid ${T.line}`, color: T.ink, fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 99 }}>
              {SPLITS[split].icon} {SPLITS[split].short}{split === "custom" && customDays.length ? ` · ${customDays.length}d` : ""} <span style={{ color: T.sub }}>✎</span>
            </button>
          )}
          <button onClick={() => setMinimized(true)} title="Minimize AI Coach" aria-label="Minimize AI Coach" style={minimizeBtn}>➖</button>
        </div>
      </div>

      {/* Wait for the first real set: targets should guide an active session, not
          greet somebody with unfinished work before they have even started. */}
      {workoutStartedToday && <div style={{ borderRadius: 15, padding: "14px 15px", marginBottom: 13,
        background: workoutPlan.complete ? "linear-gradient(135deg, rgba(var(--accent-rgb),.22), rgba(var(--accent-rgb),.06))" : "rgba(255,255,255,.03)",
        border: "1px solid " + (workoutPlan.rows.length ? "rgba(var(--accent-rgb),.4)" : T.line) }}>
        <div className="eyebrow" style={{ fontSize: 9.5, color: workoutPlan.rows.length ? T.green : T.sub, marginBottom: 7, display: "flex", alignItems: "center", gap: 6 }}>
          <span className="status-dot" style={{ width: 5, height: 5 }} />Today's workout
        </div>
        {!split ? (
          <div style={{ fontSize: 14, color: T.ink, fontWeight: 600, lineHeight: 1.5 }}>Pick your training split below so reminders match how you actually lift.</div>
        ) : workoutPlan.rows.length ? (
          <>
            <div style={{display:"flex",alignItems:"flex-start",gap:9,marginBottom:4}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:17,color:workoutPlan.complete?T.green:T.ink,fontWeight:850,lineHeight:1.3}}>{workoutPlan.complete?"✅ Workout target reached":naturalList(workoutPlan.muscles)}</div>
                <div style={{fontSize:11.5,color:T.sub,lineHeight:1.45,marginTop:3}}>{workoutPlan.reason}</div>
              </div>
              <span style={{flexShrink:0,background:T.mint,color:T.green,border:"1px solid "+T.green,borderRadius:99,padding:"4px 8px",fontSize:9.5,fontWeight:850}}>{goalModeInfo.label}</span>
            </div>
            <div style={{marginTop:11,borderTop:"1px solid "+T.line}}>
              {workoutPlan.rows.map((row,i)=>{
                const hit=row.goal===0||row.done>=row.goal;
                const left=Math.max(0,row.goal-row.done);
                const pct=row.goal>0?Math.min(100,row.done/row.goal*100):100;
                return <div key={row.muscle} style={{padding:"10px 0",borderTop:i?"1px solid "+T.line:"none"}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:6}}>
                    <span style={{fontSize:13.5,fontWeight:800,color:T.ink,flex:1}}>{row.muscle}</span>
                    <span style={{fontSize:12,color:T.sub,fontVariantNumeric:"tabular-nums"}}><b style={{fontSize:14,color:hit?T.green:T.ink}}>{fmtSets(row.done)}</b> / {fmtSets(row.goal)} sets</span>
                  </div>
                  <div style={{height:7,background:T.input,border:"1px solid "+T.line,borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:hit?T.green:MUSCLE_COLORS[MUSCLES.indexOf(row.muscle)],borderRadius:99,transition:"width .25s ease"}} /></div>
                  <div style={{fontSize:10.5,color:hit?T.green:T.sub,fontWeight:hit?750:500,marginTop:4}}>{hit?"Target reached — more is optional":<>{fmtSets(left)} left today · {fmtSets(row.weekly)} / {fmtSets(row.weeklyGoal)} this week</>}</div>
                </div>;
              })}
            </div>
            {!workoutPlan.complete&&<button type="button" onClick={onOpenLog} className="btn-primary" style={{width:"100%",padding:"10px 13px",fontSize:13.5,marginTop:6}}>Open Log</button>}
            <div style={{fontSize:9.8,color:T.sub,lineHeight:1.45,marginTop:8}}>Targets adapt to your split frequency and sets already credited this week. Secondary muscles count as ½.</div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: workoutPlan.complete?T.green:T.ink, fontWeight: 600, lineHeight: 1.5 }}>{workoutPlan.reason||"No workout target is available yet. Add a training day to your split."}</div>
        )}
        {split === "custom" && cycle.length > 0 && !editing && (
          <div style={{display:"flex", alignItems:"center", gap:8, marginTop:11, paddingTop:10, borderTop:`1px solid ${T.line}`, flexWrap:"wrap"}}>
            {canUndoRestart
              ? <button onClick={undoRestartRotation} title="Restore your previous rotation position" style={{background:T.mint, color:T.green, border:`1px solid ${T.green}`, borderRadius:99, padding:"7px 12px", fontSize:11.5, fontWeight:850}}>↶ Undo restart</button>
              : <button onClick={restartRotation} title="Reset your saved rotation marker to Day 1" style={{background:T.input, color:T.green, border:`1px solid ${T.line}`, borderRadius:99, padding:"7px 12px", fontSize:11.5, fontWeight:850}}>↺ Restart at Day 1</button>}
            <span style={{fontSize:10.5, color:T.sub}}>{canUndoRestart ? "Restores your exact previous split position." : "Use only when you want to begin the rotation again."}</span>
          </div>
        )}
      </div>}

      {/* SPLIT SETUP — collapsible; clickable options, no typing */}
      {editing && (
        <div style={{ marginBottom: 13 }}>
          <div style={{background:T.input, border:`1px solid ${T.line}`, borderRadius:13, padding:"11px 12px", marginBottom:12}}>
            <div className="eyebrow" style={{fontSize:9.5, color:T.sub, marginBottom:7}}>Coaching experience</div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6}}>
              {[['beginner','Beginner'],['intermediate','Intermediate'],['advanced','Advanced']].map(([value,label])=><button key={value} type="button" onClick={()=>setTrainingLevel(value)} aria-pressed={trainingLevel===value} style={{padding:"8px 5px", borderRadius:9, background:trainingLevel===value?T.mint:T.card, color:trainingLevel===value?T.green:T.sub, border:`1px solid ${trainingLevel===value?T.green:T.line}`, fontSize:10.5, fontWeight:800}}>{label}</button>)}
            </div>
            <div style={{fontSize:10.5,color:T.sub,lineHeight:1.45,marginTop:7}}>{trainingLevel==="advanced" ? "Advanced waits for three consistent sessions before suggesting more weight." : trainingLevel==="intermediate" ? "Intermediate recognizes progress across two sessions while allowing small rep variation." : "Beginner keeps progression simple and suggests more weight after two solid sessions."}</div>
          </div>
          <div style={{background:T.input,border:`1px solid ${T.line}`,borderRadius:13,padding:"11px 12px",marginBottom:12}}>
            <div className="eyebrow" style={{fontSize:9.5,color:T.sub,marginBottom:7}}>Build your coach</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
              {[["overdue","Overdue first"],["split","My split first"],["volume","Weekly goals"]].map(([value,label])=>{const on=coachPrefs.focusStyle===value;return <button key={value} type="button" onClick={()=>setCoachPref("focusStyle",value)} style={{padding:"8px 5px",borderRadius:9,background:on?T.mint:T.card,color:on?T.green:T.sub,border:`1px solid ${on?T.green:T.line}`,fontSize:10.5,fontWeight:800}}>{label}</button>;})}
            </div>
            <div style={{fontSize:10.5,color:T.sub,lineHeight:1.45,marginTop:7}}>{coachPrefs.focusStyle==="volume" ? "Weekly goals recommends the muscle furthest below its set target this week." : coachPrefs.focusStyle==="split" ? "My split first keeps the next unfinished workout in your rotation." : "Overdue first prioritizes the muscle groups you have gone longest without training."}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10,flexWrap:"wrap"}}><span style={{fontSize:10.5,color:T.sub,marginRight:2}}>Remind me after</span>{[3,4,5,7].map(days=><button key={days} type="button" onClick={()=>setCoachPref("staleDays",days)} style={{padding:"5px 9px",background:coachPrefs.staleDays===days?T.mint:T.card,color:coachPrefs.staleDays===days?T.green:T.sub,border:`1px solid ${coachPrefs.staleDays===days?T.green:T.line}`,fontSize:10.5,fontWeight:800}}>{days}d</button>)}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:9,flexWrap:"wrap"}}><span style={{fontSize:10.5,color:T.sub,marginRight:2}}>Advice cards</span>{[["progression","Progress"],["volume","Volume"],["balance","Balance"]].map(([key,label])=><button key={key} type="button" onClick={()=>setCoachPref(key,!coachPrefs[key])} style={{padding:"5px 9px",background:coachPrefs[key]?T.mint:T.card,color:coachPrefs[key]?T.green:T.sub,border:`1px solid ${coachPrefs[key]?T.green:T.line}`,fontSize:10.5,fontWeight:800}}>{coachPrefs[key]?"✓ ":""}{label}</button>)}</div>
          </div>
          <div className="eyebrow" style={{ fontSize: 9.5, color: T.sub, marginBottom: 9 }}>Choose your split</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(102px, 1fr))", gap: 7, marginBottom: split === "custom" ? 12 : (split ? 12 : 0) }}>
            {Object.entries(SPLITS).map(([k, v]) => {
              const on = split === k;
              return (
                <button key={k} onClick={() => { setSplit(k); if (k !== "custom") setEditing(false); }} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 6px", borderRadius: 13, textAlign: "center",
                  background: on ? "linear-gradient(180deg, rgba(var(--accent-rgb),.22), rgba(var(--accent-rgb),.10))" : T.input,
                  border: `1px solid ${on ? "rgba(var(--accent-rgb),.45)" : T.line}`,
                  color: on ? T.green : T.ink, fontWeight: 700, fontSize: 11.5, lineHeight: 1.2,
                  boxShadow: on ? "0 0 0 1px rgba(var(--accent-rgb),.2) inset" : "none",
                }}><span style={{ fontSize: 21 }}>{v.icon}</span>{v.short}</button>
              );
            })}
          </div>

          {/* custom builder — an ordered, repeating cycle of training + rest days */}
          {split === "custom" && (
            <div>
              <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, marginBottom: 10 }}>Add training and rest days in order. The cycle repeats automatically.</div>
              {customDays.map((day, idx) => {
                const isToday = day.id === todayDayId;
                return (
                <div key={day.id} style={{ background: T.input, borderRadius: 13, padding: 12, marginBottom: 9,
                  border: `1px solid ${isToday ? "var(--accent)" : day.rest ? "rgba(0,209,178,.35)" : day.muscles.length ? "rgba(var(--accent-rgb),.3)" : T.line}`,
                  boxShadow: isToday ? "0 0 0 2px rgba(var(--accent-rgb),.25)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: day.rest ? 0 : 10 }}>
                    <span className="eyebrow" style={{ fontSize: 9, color: T.sub, flexShrink: 0 }}>Day {idx + 1}</span>
                    {isToday && <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 900, color: "#05140b", background: "var(--accent)", padding: "2px 7px", borderRadius: 99, letterSpacing: .6 }}>TODAY</span>}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: day.rest ? "#00D1B2" : day.muscles.length ? T.green : T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{day.rest ? "😴 Rest day" : dayLabel(day.muscles)}</span>
                    <button onClick={() => removeDay(day.id)} title="Remove day" style={{ flexShrink: 0, background: "none", border: `1px solid ${T.line}`, color: T.danger, width: 34, height: 34, borderRadius: 9, fontSize: 14 }}>🗑</button>
                  </div>
                  {!day.rest && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {MUSCLES.map(m => {
                        const on = day.muscles.includes(m);
                        return (
                          <button key={m} onClick={() => toggleMuscle(day.id, m)} style={{
                            padding: "6px 13px", borderRadius: 99, fontSize: 12.5, fontWeight: 700,
                            background: on ? "linear-gradient(180deg, rgba(var(--accent-rgb),.24), rgba(var(--accent-rgb),.12))" : T.card,
                            color: on ? T.green : T.sub, border: `1px solid ${on ? "rgba(var(--accent-rgb),.45)" : T.line}`,
                          }}>{on ? "✓ " : ""}{m}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })}
              {/* the loop back to the top — this is what "repeats" means, made visible */}
              {cycle.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.green, fontSize: 12, fontWeight: 800, padding: "2px 4px 10px", letterSpacing: .3 }}>
                  <span style={{ fontSize: 15 }}>🔁</span>
                  <span>Then loops back to Day 1 — repeats forever</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button onClick={addDay} style={{ flex: 1, background: T.input, border: `1px dashed ${T.line}`, color: T.green, fontWeight: 800, padding: "12px", borderRadius: 12, fontSize: 13 }}>+ Training day</button>
                <button onClick={addRest} style={{ flex: 1, background: T.input, border: `1px dashed ${T.line}`, color: "#00D1B2", fontWeight: 800, padding: "12px", borderRadius: 12, fontSize: 13 }}>+ Rest day</button>
              </div>
              {/* live position — proves it rolls with you, not the calendar week */}
              {cycle.length > 0 && cyPos >= 0 && (
                <div style={{ background: "rgba(var(--accent-rgb),.08)", border: `1px solid rgba(var(--accent-rgb),.3)`, borderRadius: 12, padding: "11px 13px", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, color: T.ink, fontWeight: 700, lineHeight: 1.45 }}>
                    Right now you're on <span style={{ color: T.green }}>Day {cyPos + 1} · {dayTitle(cycle[cyPos])}</span>.
                  </div>
                  <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.5, marginTop: 4 }}>
                    Missed training days stay queued until you log them.
                  </div>
                  {canUndoRestart
                    ? <button onClick={undoRestartRotation} style={{ marginTop: 9, background:T.mint, border:`1px solid ${T.green}`, color:T.green, fontWeight:800, fontSize:12.5, padding:"8px 14px", borderRadius:99 }}>↶ Undo restart</button>
                    : <button onClick={restartRotation} style={{ marginTop: 9, background: T.input, border: `1px solid ${T.line}`, color: T.green, fontWeight: 800, fontSize: 12.5, padding: "8px 14px", borderRadius: 99 }}>↺ Restart at Day 1</button>}
                </div>
              )}
            </div>
          )}

          {/* weekly set targets — science-based, fully editable */}
          {split && (
            <div style={{ marginBottom: 12 }}>
              <button onClick={() => setShowTargets(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: T.input, border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 13px", color: T.ink, fontWeight: 700, fontSize: 13 }}>
                <span style={{ fontSize: 16 }}>📊</span>
                <span style={{ flex: 1, textAlign: "left" }}>Weekly set targets</span>
                <span style={{ color: T.sub, fontSize: 12, fontWeight: 600 }}>{showTargets ? "Hide" : "Customize"} {showTargets ? "▲" : "▼"}</span>
              </button>
              {showTargets && (
                <div style={{ marginTop: 9 }}>
                  <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.55, marginBottom: 10 }}><b style={{ color: T.ink }}>{goalModeInfo.label}</b> goals · synced with Dashboard.</div>
                  {MUSCLES.map(m => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", borderTop: `1px solid ${T.creamLine}` }}>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: T.ink }}>{m}</span>
                      <button onClick={() => bumpTarget(m, -1)} style={{ width: 30, height: 30, borderRadius: 8, background: T.card, border: `1px solid ${T.line}`, color: T.ink, fontSize: 17, lineHeight: 1 }}>−</button>
                      <span style={{ minWidth: 42, textAlign: "center", fontSize: 15, fontWeight: 800, color: T.green, fontVariantNumeric: "tabular-nums" }}>{targets[m]}</span>
                      <button onClick={() => bumpTarget(m, 1)} style={{ width: 30, height: 30, borderRadius: 8, background: T.card, border: `1px solid ${T.line}`, color: T.ink, fontSize: 17, lineHeight: 1 }}>+</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {split && (
            <button onClick={() => setEditing(false)} className="btn-primary" style={{ width: "100%", padding: "12px", fontSize: 14 }}>✓ Done — show my tips</button>
          )}
        </div>
      )}

      {/* INSIGHTS — everything except the "train today" headline */}
      {otherTips.length === 0 ? (
        <div style={{ fontSize: 13.5, color: T.sub, paddingTop: 2, lineHeight: 1.5 }}>{split ? "All caught up. Keep logging for new insights." : "Log a few sessions to unlock insights."}</div>
      ) : (
        <div>
          <div className="eyebrow" style={{ fontSize: 9.5, color: T.sub, marginBottom: 2 }}>Insights</div>
          {otherTips.slice(0, 5).map((t) => (
            <div key={t.key} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "10px 0", borderTop: `1px solid ${T.creamLine}` }}>
              <span style={{ fontSize: 19, lineHeight: 1.2, flexShrink: 0 }}>{t.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display:"inline-block", fontSize:9.5, fontWeight:800, color:CAT_COLOR[t.cat]||T.sub, textTransform:"uppercase", letterSpacing:.5, background:`color-mix(in srgb,${CAT_COLOR[t.cat]||T.sub} 10%,transparent)`, border:`1px solid color-mix(in srgb,${CAT_COLOR[t.cat]||T.sub} 25%,transparent)`, borderRadius:99, padding:"2px 6px", marginBottom:2 }}>{t.cat}</span>
                <div title={t.basis || ""} style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.45 }}>{t.text}</div>
              </div>
              <button onClick={() => dismiss(t.key)} title="Don't show this again" style={{ flexShrink: 0, background: "none", border: "none", color: T.sub, fontSize: 15, lineHeight: 1, padding: "2px 4px", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <details style={{marginTop:10, borderTop:`1px solid ${T.line}`, paddingTop:9}}>
        <summary style={{cursor:"pointer", color:T.sub, fontSize:10.5, fontWeight:800, listStyle:"none"}}>How coaching works <span style={{fontSize:8}}>▾</span></summary>
        <div style={{marginTop:8, padding:"9px 11px", background:T.input, border:`1px solid ${T.line}`, borderRadius:11, fontSize:10.5, color:T.sub, lineHeight:1.65}}>
          <div>✓ Uses your {goalModeInfo.label.toLowerCase()} goals{customTargetCount ? `, including ${customTargetCount} custom` : ""}.</div>
          <div>✓ Uses your coach style, split, recent sets, reps, and effort.</div>
          {split === "custom" && <div>✓ An out-of-order workout does not erase older missed muscle groups.</div>}
          <div>✓ Main muscle = 1 set · secondary = ½ · warm-ups ignored.</div>
        </div>
      </details>
    </div>
  );
}

/* End-of-month recap: pops up once per group each month with everyone's
   average weigh-in for the month that just finished (+ their goal). */
function MonthlyRecapModal({ recap, groupName, emoji, onClose }) {
  const units = useUnit();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // you first, then heaviest movers-toward-goal feel natural — but keep it simple & friendly: you first, then alphabetical
  const rows = [...recap.rows].sort((a, b) =>
    a.isYou ? -1 : b.isYou ? 1 : a.username.localeCompare(b.username));

  const CONF = ["#00C805", "#E9C46A", "#F4D58D", "#FFFFFF", "#8fe3a0"];
  const confetti = Array.from({ length: 16 }, (_, i) => ({
    left: `${(i * 6.3 + 4) % 100}%`,
    bg: CONF[i % CONF.length],
    delay: `${(i % 6) * 0.15}s`,
    dur: `${1.5 + (i % 5) * 0.35}s`,
  }));

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.72)", backdropFilter:"blur(3px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
      animation:"fadeSwap .2s ease-out both",
    }}>
      <div onClick={e=>e.stopPropagation()} className="recap-card" style={{
        position:"relative", overflow:"hidden", width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto",
        background:T.card, border:`1px solid ${T.creamLine}`, borderRadius:20,
        padding:"0 0 18px", boxShadow:"0 24px 70px rgba(0,0,0,.6)",
      }}>
        {/* confetti burst */}
        <div style={{position:"absolute", inset:"0 0 auto 0", height:150, pointerEvents:"none", overflow:"hidden"}}>
          {confetti.map((c, i) => (
            <span key={i} className="conf" style={{ left:c.left, background:c.bg, animationDelay:c.delay, animationDuration:c.dur }} />
          ))}
        </div>

        {/* header with gradient strip */}
        <div style={{
          padding:"22px 20px 16px", textAlign:"center", position:"relative",
          background:"linear-gradient(180deg, rgba(var(--accent-rgb),.10), rgba(233,196,106,.05) 60%, transparent)",
          borderBottom:`1px solid ${T.line}`,
        }}>
          <div style={{fontSize:34, lineHeight:1, marginBottom:8}}>📊</div>
          <div className="recap-title" style={{fontSize:25, fontWeight:800, letterSpacing:".2px"}}>{recap.monthLabel} Recap</div>
          <div style={{fontSize:12.5, color:T.sub, marginTop:5}}>
            {emoji ? emoji + " " : ""}{groupName} · everyone's monthly weigh-in average
          </div>
        </div>

        {/* member rows */}
        <div style={{padding:"12px 14px 4px", display:"flex", flexDirection:"column", gap:9}}>
          {rows.map((r, i) => {
            const avg = dispW(r.avgLb, units);
            const change = r.prevLb != null ? dispW(r.avgLb - r.prevLb, units) : null;
            const goal = r.goalLb != null ? dispW(r.goalLb, units) : null;
            // direction relative to their goal (toward = good). No goal → neutral.
            let chDir = "neutral";
            if (change != null && r.goalLb != null) {
              const wantUp = r.goalLb > r.avgLb; // still need to gain
              chDir = change === 0 ? "neutral" : (change > 0) === wantUp ? "toward" : "away";
            }
            const chColor = chDir === "toward" ? T.green : chDir === "away" ? T.down : T.sub;
            const remain = goal != null ? Math.abs(dispW(r.goalLb - r.avgLb, units)) : null;
            const reached = goal != null && Math.abs(r.goalLb - r.avgLb) < 0.5;
            // progress toward goal for the mini bar (0..1) — needs a reference; use 8% band as "close"
            return (
              <div key={r.uid} className="recap-row" style={{
                animationDelay:`${0.12 + i * 0.07}s`,
                background:r.isYou ? "rgba(var(--accent-rgb),.08)" : T.input,
                border:`1px solid ${r.isYou ? "rgba(var(--accent-rgb),.35)" : T.line}`,
                borderRadius:14, padding:"11px 13px",
              }}>
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <div style={{
                    width:34, height:34, borderRadius:99, flexShrink:0,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    background:r.isYou ? T.green : "rgba(255,255,255,.08)",
                    color:r.isYou ? "#000" : T.ink, fontWeight:800, fontSize:15,
                  }}>{r.username.slice(0,1).toUpperCase()}</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:14.5, fontWeight:700, color:T.ink, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                      {r.username}{r.isYou && <span style={{color:T.green, fontWeight:700}}> · you</span>}
                    </div>
                    <div style={{fontSize:11.5, color:T.sub, marginTop:1}}>monthly average</div>
                  </div>
                  <div style={{textAlign:"right", flexShrink:0}}>
                    <div style={{fontSize:20, fontWeight:800, color:T.ink, lineHeight:1.1}}>{avg}<span style={{fontSize:11.5, color:T.sub, fontWeight:600}}> {uLabel(units)}</span></div>
                    {change != null && (
                      <div style={{fontSize:12, fontWeight:700, color:chColor, marginTop:1}}>
                        {change > 0 ? "▲ +" : change < 0 ? "▼ " : "•  "}{change === 0 ? "0" : Math.abs(change)} vs prev
                      </div>
                    )}
                  </div>
                </div>
                {goal != null && (
                  <div style={{marginTop:9, display:"flex", alignItems:"center", gap:8}}>
                    <span className="chip" style={{background:reached ? T.green : T.mint, color:reached ? "#000" : T.green, fontSize:11.5, whiteSpace:"nowrap"}}>
                      🎯 {reached ? "Goal reached!" : `Goal ${goal} ${uLabel(units)}`}
                    </span>
                    {!reached && <span style={{fontSize:11.5, color:T.sub}}>{remain} {uLabel(units)} to go</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{padding:"10px 16px 0"}}>
          <button onClick={onClose} style={{width:"100%", padding:"13px", background:T.green, color:"#000", fontWeight:800, fontSize:15.5, borderRadius:12}}>
            Let's go 💪
          </button>
        </div>
      </div>
    </div>
  );
}

/* Read-only set history for a group member's profile — their FULL log (the data is
   already downloaded for the group screens, so this costs nothing extra). */
function MemberLog({ pdata, who }) {
  const units = useUnit();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(30);
  const full = useMemo(() => {
    const sortedL = [...(pdata.log || [])].sort((a,b)=>a.date.localeCompare(b.date)||(a.id||0)-(b.id||0)).reverse();
    const qq = q.trim().toLowerCase();
    return qq ? sortedL.filter(e => entryLabel(e).toLowerCase().includes(qq)) : sortedL;
  }, [pdata.log, q]);
  const searching = q.trim() !== "";
  const shown = searching ? full : full.slice(0, limit);
  if (!(pdata.log || []).length) return null;
  return (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>📝 {who}'s set history</div>
      <input value={q} onChange={e=>{setQ(e.target.value); setLimit(30);}} placeholder="🔍 Filter by exercise or muscle…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:10}} />
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Date</th><th>Exercise</th><th>Set</th><th>Weight ({uLabel(units)})</th><th>Reps</th><th>Effort</th></tr></thead>
          <tbody>{shown.map(e => (
            <tr key={e.id || `${e.date}-${e.exercise}-${e.set}`}>
              <td>{e.date === todayStr() ? <span style={{color:"#00A804", fontWeight:800}}>Today</span> : fmtDate(e.date)}</td>
              <td>{e.muscleOnly ? <b style={{color:T.green}}>⚡ {e.muscle}</b> : e.exercise}</td><td>{e.muscleOnly ? `${setCountOf(e)} total` : e.set}</td>
              <td>{e.quick ? "—" : e.weight==null ? "BW" : dispW(e.weight, units)}{e.drops?.length ? <span style={{color:T.sub}}>{" ↘ "}{e.drops.map(dr=>dispW(dr.weight, units)).join(" ↘ ")}</span> : null}</td>
              <td>{e.quick ? "quick" : e.reps}{e.drops?.length ? <span style={{color:T.sub}}>{" / "}{e.drops.map(dr=>dr.reps).join(" / ")}</span> : null}</td>
              <td style={{color:T.sub}}>{e.effort||""}</td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={6} style={{color:T.sub}}>No sets match that exercise.</td></tr>}
          </tbody></table>
      </div>
      {!searching && full.length > shown.length && (
        <div style={{display:"flex", gap:8, marginTop:12}}>
          <button onClick={()=>setLimit(l=>l+50)} style={{flex:1, background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"10px", fontWeight:700, fontSize:13, borderRadius:10}}>
            Show more ({full.length - shown.length} older)
          </button>
          <button onClick={()=>setLimit(full.length)} style={{background:"none", color:T.sub, padding:"10px 14px", fontWeight:700, fontSize:13}}>Show all</button>
        </div>
      )}
    </div>
  );
}

/* Quick "cool facts" popup for a member's steps (opened from the group Steps board). */
function StepFactsModal({ name, isMe, map, rank, onClose }) {
  const m = map || {};
  const today = todayStr();
  const days = Object.keys(m);
  const total = days.reduce((s,d)=>s+m[d],0);
  let best=null; for (const d of days) if (!best || m[d]>best.count) best={date:d,count:m[d]};
  const thisWk = weekStart(today);
  let wkTotal=0, wkDays=0; for (const d of days) if (weekStart(d)===thisWk){ wkTotal+=m[d]; wkDays++; }
  const wkAvg = wkDays ? Math.round(wkTotal/wkDays) : 0;
  const last7=[]; for(let i=1;i<=7;i++){ const d=dAdd(today,-i); if(m[d]!=null) last7.push(m[d]); }
  const avg7 = last7.length ? Math.round(last7.reduce((a,b)=>a+b,0)/last7.length) : 0;
  const goalDays = days.filter(d=>m[d]>=10000).length;
  let streak=0; for(let i=1;i<400;i++){ const d=dAdd(today,-i); if(m[d]!=null && m[d]>=10000) streak++; else break; }
  const tiles = [
    [rank?`#${rank}`:"—", "this week's rank", rank===1],
    [wkTotal.toLocaleString(), "steps this week"],
    [wkAvg.toLocaleString(), "avg/day this week"],
    [avg7.toLocaleString(), "7-day average"],
    [best?best.count.toLocaleString():"—", best?`best day · ${fmtDate(best.date)}`:"best day"],
    [String(streak), "🔥 day 10k streak", streak>0],
    [goalDays.toLocaleString(), "days over 10k"],
    [stepsMiles(total), "miles logged (total)"],
  ];
  return (
    <div onClick={onClose} style={{position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeSwap .18s ease-out both"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:`radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--cal-cardio) 10%, transparent), transparent 42%), ${T.card}`, border:"1px solid color-mix(in srgb, var(--cal-cardio) 32%, var(--line))", borderRadius:18, padding:"20px 18px", maxWidth:380, width:"100%", animation:"calPop .26s cubic-bezier(.34,1.56,.64,1) both"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3}}>
          <div className="h" style={{fontSize:19, color:T.tealDk}}>👟 {name}{isMe?" (you)":""}</div>
          <button onClick={onClose} style={{background:T.input, color:T.sub, width:30, height:30, borderRadius:99, fontSize:14}}>✕</button>
        </div>
        <div style={{fontSize:12, color:T.sub, marginBottom:14}}>Step stats{rank===1?" — leading the group 👑":""}</div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
          {tiles.map(([n,l,hot],i)=>(
            <div key={i} style={{background:hot?"color-mix(in srgb, var(--cal-cardio) 9%, var(--input))":T.input, borderRadius:12, padding:"11px 12px", border:`1px solid ${hot?"var(--cal-cardio)":T.line}`}}>
              <div style={{fontSize:19, fontWeight:800, color: hot?"var(--cal-cardio)":T.ink, fontVariantNumeric:"tabular-nums", lineHeight:1.1}}>{n}</div>
              <div style={{fontSize:11, color:T.sub, marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FriendsTab({ user, data, setData, exMap = {}, nutritionOn, streaksOn, isPro, openPro }) {
  const units = useUnit();
  const [groups, setGroups] = useState(null);        // null = loading
  const [active, setActive] = useState(null);        // selected group
  const [members, setMembers] = useState(null);
  const [states, setStates] = useState({});          // user_id -> tracker data
  useEffect(() => { setStates(cur => ({ ...cur, [user.id]: data })); }, [data, user.id]);
  const [proIds, setProIds] = useState([]);          // Pro members you can see (for the PRO badge)
  const [memberMenu, setMemberMenu] = useState(null); // compact profile menu anchored to a tapped name
  const memberMenuRef = useRef(null);
  const closeMemberMenu = () => setMemberMenu(cur=>cur ? { ...cur, closing:true } : null);
  const isProUser = (uid) => proIds.includes(uid);
  useEffect(() => { listProUserIds().then(setProIds).catch(()=>{}); }, [members]);
  useEffect(() => { setMemberMenu(null); }, [active?.id]);
  useEffect(() => {
    if (!memberMenu?.closing) return;
    const timer = window.setTimeout(()=>setMemberMenu(null), 130);
    return () => window.clearTimeout(timer);
  }, [memberMenu?.closing]);
  useEffect(() => {
    if (!memberMenu) return;
    const closeOutside = (e) => {
      if (!memberMenuRef.current?.contains(e.target) && !e.target.closest?.("[data-member-name]")) closeMemberMenu();
    };
    const onKey = (e) => { if (e.key === "Escape") closeMemberMenu(); };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [memberMenu]);
  const openMemberMenu = (event, uid, name) => {
    event.stopPropagation();
    if (!members?.some(m=>m.user_id===uid)) return;
    if (memberMenu?.uid===uid && !memberMenu.closing) { closeMemberMenu(); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuW = 224, menuH = 108, gap = 7, edge = 10;
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - menuW - edge));
    const below = rect.bottom + gap;
    const fitsBelow = below + menuH <= window.innerHeight - edge;
    const top = fitsBelow ? below : Math.max(edge, rect.top - menuH - gap);
    setMemberMenu({ uid, name, left, top, origin:fitsBelow ? "top left" : "bottom left" });
  };
  // Render a member's name with the theme accent + a PRO badge if they're Pro — used
  // everywhere a friend's name shows. Tapping it opens the same compact profile menu.
  const nameEl = (uid, name, { you = false, weight, size } = {}) => {
    const pro = isProUser(uid);
    // inline-flex so a long name ellipsizes on its own, while "(you)" + the Pro badge
    // stay pinned (flex-shrink:0) and never get clipped or pushed under the bar
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, maxWidth: "100%", verticalAlign: "bottom" }}>
        <span role="button" tabIndex={0} data-member-name aria-haspopup="menu" aria-expanded={memberMenu?.uid===uid}
          title={`Open ${name}'s profile menu`}
          onMouseDown={e=>{ if (e.detail > 1) e.preventDefault(); }}
          onClick={e=>openMemberMenu(e, uid, name)}
          onKeyDown={e=>{ if (e.key==="Enter" || e.key===" ") { e.preventDefault(); openMemberMenu(e, uid, name); } }}
          style={{ color:T.green, cursor:"pointer", userSelect:"none", WebkitUserSelect:"none", fontWeight:weight ?? (you ? 800 : 650), fontSize:size, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration:"underline", textDecorationColor:"rgba(var(--accent-rgb),.38)", textUnderlineOffset:3 }}>
          {name}{you ? " (you)" : ""}
        </span>
        {pro && <span style={{ flexShrink: 0, display: "inline-flex" }}><ProBadge small /></span>}
      </span>
    );
  };
  const [squadCel, setSquadCel] = useState(null);    // "whole squad logged steps" popup, per group
  const [profile, setProfile] = useState(null);      // member whose profile is open
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [gname, setGname] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [reactions, setReactions] = useState({}); // event_key -> [{reactor_id, reactor_name}]
  const [stepRange, setStepRange] = useState("W"); // group step board window: W | 1M | 6M | YTD | 1Y
  const [duels, setDuels] = useState([]); // all visible duels — for each member's profile duel record
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [feedN, setFeedN] = useState(null); // null = auto (3, or the whole latest day if bigger)
  const [recap, setRecap] = useState(null); // end-of-month recap popup: { pmKey, monthLabel, rows } | null
  const [profileTab, setProfileTab] = useState("lifting"); // sub-tab inside a member profile
  const [profileSteps, setProfileSteps] = useState(undefined); // open profile's step map (separate steps table)
  const [profileLastSync, setProfileLastSync] = useState(null); // open profile's last step sync time
  const [memberSteps, setMemberSteps] = useState({}); // user_id -> {day->count} auto steps (~1yr) for board + facts
  const [facts, setFacts] = useState(null); // steps "cool facts" popup: { uid, name } | null
  const savedActiveId = useRef(localStorage.getItem("lt-active-group")); // reopen last group after refresh
  const restoredGroup = useRef(false);
  const [dueling, setDueling] = useState(false); // challenge form open on a profile
  const [duelDays, setDuelDays] = useState("7");
  const [duelMsg, setDuelMsg] = useState("");
  const myName = user.user_metadata?.username || "you";
  const isOwner = active?.created_by === user.id;
  const viewerTheme = data.profile?.theme || DEFAULT_THEME;
  const viewedTheme = (profile && states[profile.user_id]?.profile?.theme) || DEFAULT_THEME;
  // A viewed profile always wears its owner's saved theme. The viewer's subscription and
  // theme never override it; leaving the profile restores the viewer immediately.
  useLayoutEffect(() => {
    if (!profile) { applyTheme(viewerTheme); return; }
    applyTheme(viewedTheme);
    return () => applyTheme(viewerTheme);
  }, [profile?.user_id, viewedTheme.accent, viewedTheme.palette, viewerTheme.accent, viewerTheme.palette]);
  // which lifts the group's strength board tracks — owner-configurable, defaults to the big lifts
  const recordLifts = (Array.isArray(active?.record_lifts) && active.record_lifts.length) ? active.record_lifts : BIG_LIFTS;
  // every exercise the owner can point a column at: the big lifts + anything anyone's logged
  const liftOptions = useMemo(() => {
    const s = new Set([...BIG_LIFTS, ...recordLifts]);
    for (const m of (members || [])) for (const e of (states[m.user_id]?.log || [])) if (e.exercise && !e.quick && !e.muscleOnly) s.add(e.exercise);
    return [...s].sort();
  }, [members, states, recordLifts]);
  // owner-only: persist the column set (optimistic + server). null → back to default big lifts.
  const commitLifts = (list) => {
    const val = (list && list.length) ? list : null;
    setActive(a => ({ ...a, record_lifts: val }));
    setGroups(gs => gs.map(g => g.id === active.id ? { ...g, record_lifts: val } : g));
    setGroupRecordLifts(active.id, val).catch(e => setErr(String(e?.message || e)));
  };
  const swapLift = (i, ex) => { const b = recordLifts.slice(); if (ex === "__remove__") b.splice(i, 1); else b[i] = ex; commitLifts(b); };
  const addLift = () => { const used = new Set(recordLifts); const opt = liftOptions.find(o => !used.has(o)) || liftOptions[0]; if (opt) commitLifts([...recordLifts, opt]); };

  const startDuel = async () => {
    if (!profile) return;
    const n = Math.max(1, Math.min(30, parseInt(duelDays)||7));
    try { await createDuel(profile.user_id, n);
      setDueling(false); setDuelMsg(`Duel started — ${n} day${n===1?"":"s"}! Track it in the 👟 Steps tab.`); }
    catch(e){ setDuelMsg("Couldn't start: " + String(e?.message||e)); }
  };

  // load the open profile's steps (they live in the `steps` table, not user_state)
  useEffect(() => {
    if (!profile) { setProfileSteps(undefined); setProfileLastSync(null); setProfileTab("lifting"); return; }
    setDueling(false); setDuelMsg("");
    let alive = true;
    (async () => {
      try { const s = await stepsFor([profile.user_id], dAdd(todayStr(), -5*365 - 40)); if (alive) setProfileSteps(s[profile.user_id] || {}); }
      catch { if (alive) setProfileSteps({}); }
      try { const t = await lastStepSync(profile.user_id); if (alive) setProfileLastSync(t); } catch {}
    })();
    return () => { alive = false; };
  }, [profile?.user_id]);

  // members' auto-synced steps for the group "this week" board
  useEffect(() => {
    if (!members?.length) { setMemberSteps({}); return; }
    let alive = true;
    (async () => {
      try { const s = await stepsFor(members.map(m=>m.user_id), dAdd(todayStr(), -5*365 - 40)); if (alive) setMemberSteps(s); }
      catch { if (alive) setMemberSteps({}); }
    })();
    return () => { alive = false; };
  }, [members]);

  // all duels involving anyone you can see — used for each person's duel record on their profile
  useEffect(() => {
    let alive = true;
    (async () => { try { const d = await listDuels(); if (alive) setDuels(d); } catch { /* table may be empty */ } })();
    return () => { alive = false; };
  }, [members]);

  // "whole squad logged their steps" — only when THIS group is open and everyone in it
  // has YESTERDAY's steps in. Shows at most ONCE per group per all-logged day: we only
  // ever check yesterday (so being away for days can't stack popups), and once dismissed
  // (localStorage) or shown-this-session (ref) it never comes back.
  const squadSeen = useRef(new Set());
  useEffect(() => {
    if (!active || !members || members.length < 2) { setSquadCel(null); return; }
    const yStr = dAdd(todayStr(), -1);
    const tag = `${active.id}-${yStr}`;
    if (squadSeen.current.has(tag)) return;
    let dismissed = false; try { dismissed = localStorage.getItem(`lt-squad-${tag}`) === "1"; } catch {}
    if (dismissed) { squadSeen.current.add(tag); return; }
    const allIn = members.every(m => (memberSteps[m.user_id] || {})[yStr] != null);
    setSquadCel(allIn ? yStr : null);
  }, [active, members, memberSteps]);
  const dismissSquad = () => {
    const yStr = dAdd(todayStr(), -1);
    if (active) { const tag = `${active.id}-${yStr}`; squadSeen.current.add(tag); try { localStorage.setItem(`lt-squad-${tag}`, "1"); } catch {} }
    setSquadCel(null);
  };

  /* A member's finished-duel record (wins–losses–ties), computed from step totals. */
  const duelRecord = (uid) => {
    const today = todayStr();
    let w=0, l=0, t=0;
    const sumRange = (map,s,e)=>{ let x=0; const m=map||{}; for (const d in m) if (d>=s && d<=e) x+=m[d]; return x; };
    for (const d of duels) {
      if (d.a_id!==uid && d.b_id!==uid) continue;
      if (d.status === "forfeited") { if (d.winner_id === uid) w++; else l++; continue; }
      if (d.status !== "active") continue;          // pending/declined don't count
      if (today <= d.end_day) continue; // only finished duels count toward the record
      const mine = sumRange(memberSteps[uid], d.start_day, d.end_day);
      const oId = d.a_id===uid ? d.b_id : d.a_id;
      const opp = sumRange(memberSteps[oId], d.start_day, d.end_day);
      if (mine>opp) w++; else if (opp>mine) l++; else t++;
    }
    return { w, l, t, total: w+l+t };
  };

  const saveEmoji = async (e) => {
    if (!e || !active) return;
    setActive(a => ({ ...a, emoji: e })); // instant locally; cloud follows
    setEmojiOpen(false);
    try { await setGroupEmoji(active.id, e); refreshGroups(); }
    catch (err2) { setErr(String(err2?.message || err2)); }
  };

  const refreshGroups = async () => {
    try { setGroups(await listMyGroups()); setErr(""); }
    catch (e) { setGroups([]); setErr("Couldn't load groups — check your connection. (If this is the first time, the database part may not be set up yet.)"); }
  };
  useEffect(() => { refreshGroups(); }, []);

  // remember which group you're in, and reopen it after a refresh
  useEffect(() => {
    if (active) localStorage.setItem("lt-active-group", active.id);
    else localStorage.removeItem("lt-active-group");
  }, [active]);
  useEffect(() => {
    if (restoredGroup.current || !groups?.length) return;
    restoredGroup.current = true;
    const id = savedActiveId.current;
    if (id) { const g = groups.find(x => x.id === id); if (g) setActive(g); }
  }, [groups]);

  /* one-line preview per group: members + how recently each was active */
  const [previews, setPreviews] = useState({}); // group_id -> [{username, last}]
  useEffect(() => {
    if (!groups?.length) return;
    (async () => {
      try {
        const p = {};
        await Promise.all(groups.map(async (g) => {
          const ms = await listMembers(g.id);
          const la = await lastActiveFor(ms.map(m => m.user_id));
          p[g.id] = ms.map(m => ({ uid: m.user_id, username: m.username, last: la[m.user_id] || null }))
            .sort((a, b) => {
              if (a.uid === user.id) return -1;   // you always first
              if (b.uid === user.id) return 1;
              return (b.last || "").localeCompare(a.last || "");
            });
        }));
        setPreviews(p);
      } catch { /* previews are a bonus — group list works without them */ }
    })();
  }, [groups]);
  const agoTxt = (ts) => {
    if (!ts) return null;
    const mins = (Date.now() - new Date(ts).getTime()) / 6e4;
    if (mins < 1) return "now";
    if (mins < 60) return `${Math.floor(mins)}m`;
    const h = mins / 60;
    if (h < 24) return `${Math.floor(h)}h`;      // 23h, then rolls to 1d
    const d = h / 24;
    if (d < 7) return `${Math.floor(d)}d`;
    if (d < 30) return `${Math.floor(d / 7)}w`;
    return `${Math.floor(d / 30)}mo`;
  };

  useEffect(() => {
    if (!active) return;
    (async () => {
      setMembers(null); setStates({}); setReactions({}); setEmojiOpen(false); setFeedN(null); setRecap(null);
      try {
        const ms = await listMembers(active.id);
        setMembers(ms);
        const otherIds = ms.map(m=>m.user_id).filter(id=>id!==user.id);
        const st = await loadSharedUserStates(otherIds);
        st[user.id] = data;
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

  /* end-of-month recap: once per group each month, everyone's avg weigh-in for the month that just ended */
  useEffect(() => {
    if (!active || !members || !members.length) return;
    const now = new Date();
    const km = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;      // month key for a JS (year, 0-based month)
    const pmKey = km(now.getFullYear(), now.getMonth() - 1);            // month that just finished
    const bmDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);  // one before that (for the ▲▼ change)
    const bmKey = km(bmDate.getFullYear(), bmDate.getMonth());
    let seen = false;
    try { seen = !!localStorage.getItem(`recap-${active.id}-${pmKey}`); } catch { /* private mode */ }
    if (seen) return;
    const avgFor = (bw, key) => { const rs = (bw || []).filter(r => monthKey(r.date) === key); return rs.length ? rs.reduce((s, r) => s + r.weight, 0) / rs.length : null; };
    const rows = members.map(m => {
      const st = states[m.user_id]; if (!st) return null;
      const avgLb = avgFor(st.bodyweight, pmKey);
      if (avgLb == null) return null; // no weigh-in that month → skip them
      return { uid: m.user_id, username: m.username, avgLb, prevLb: avgFor(st.bodyweight, bmKey), goalLb: st.profile?.goalWeight || null, isYou: m.user_id === user.id };
    }).filter(Boolean);
    if (!rows.length) return;
    setRecap({ pmKey, monthLabel: monthLabel(pmKey), rows });
  }, [active?.id, members, states, user.id]);

  const closeRecap = () => {
    if (recap && active) { try { localStorage.setItem(`recap-${active.id}-${recap.pmKey}`, "1"); } catch { /* ignore */ } }
    setRecap(null);
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
    try {
      const result = await joinGroup(code.trim());
      if (!result?.ok) {
        if (result?.code === "slow_down") throw new Error(`Too many wrong codes. Try again in ${Math.max(1, Math.ceil((result.retry_after || 15) / 60))} minute(s).`);
        throw new Error("No group found with that invite code — double-check it.");
      }
      setCode(""); await refreshGroups();
    }
    catch (e) { setErr(String(e?.message || e)); }
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
      const bestSoFar = {}; const prsByDate = {}; const byDate = {}; const seenCount = {};
      for (const e of sorted) {
        (byDate[e.date] ||= []).push(e);
        if (e.quick || e.muscleOnly || !e.reps) continue;
        const isBW = exType[e.exercise] === "Bodyweight";
        const score = isBW ? e.reps : e1rm(e.weight || 0, e.reps);
        // PRs only get celebrated once a lift is established (first 5 sets don't count —
        // otherwise every early session is a "PR" and the chip means nothing)
        if (bestSoFar[e.exercise] != null && score > bestSoFar[e.exercise] && (seenCount[e.exercise] || 0) >= 5) {
          (prsByDate[e.date] ||= []).push({ ex: e.exercise, label: isBW ? `${e.exercise} ${e.reps} reps` : `${e.exercise} ${dispW(e.weight,units)}×${e.reps}` });
        }
        bestSoFar[e.exercise] = Math.max(bestSoFar[e.exercise] ?? -1, score);
        seenCount[e.exercise] = (seenCount[e.exercise] || 0) + 1;
      }
      for (const [date, entries] of Object.entries(byDate)) {
        const quick = entries.filter(e=>e.muscleOnly);
        const detailed = entries.filter(e=>!e.muscleOnly);
        if (detailed.length) {
          const names = [...new Set(detailed.map(e=>e.exercise))];
          evs.push({ key:`${m.user_id}-${date}-lift`, date, user:m.username, uid:m.user_id, kind:"lift",
            sets: detailed.reduce((sum,e)=>sum+setCountOf(e),0), names: names.slice(0,3), more: Math.max(0, names.length-3),
            prs: Object.values((prsByDate[date] || []).reduce((acc,p)=>{ acc[p.ex] = { ...p, note: st.prNotes?.[p.ex] || "" }; return acc; }, {})) });
        }
        if (quick.length) {
          const totals = {};
          for (const e of quick) totals[e.muscle] = (totals[e.muscle]||0)+setCountOf(e);
          evs.push({ key:`${m.user_id}-${date}-quick-lift`, date, user:m.username, uid:m.user_id, kind:"quick-lift",
            sets:Object.values(totals).reduce((sum,n)=>sum+n,0), muscles:Object.entries(totals) });
        }
      }
      for (const c of (st.cardio || [])) {
        const txt = c.steps ? `${c.steps.toLocaleString()} steps — ${c.activity}` : `${c.duration} min ${c.activity}`;
        evs.push({ key:`${m.user_id}-${c.id}-cardio`, date:c.date, user:m.username, uid:m.user_id, kind:"cardio",
          icon: c.steps ? "👣" : "🏃", text: txt });
      }
    }
    // step moments (from the steps table): new record (>10k only), goal hit, whole-squad
    const syncedPerDay = {};
    for (const m of members) {
      const mp = memberSteps[m.user_id] || {}; const days = Object.keys(mp); if (!days.length) continue;
      let best = -1, bestDate = null;
      for (const d of days) { syncedPerDay[d] = (syncedPerDay[d] || 0) + 1; if (mp[d] > best) { best = mp[d]; bestDate = d; } }
      if (best >= 10000 && bestDate)
        evs.push({ key:`${m.user_id}-${bestDate}-rec`, date:bestDate, user:m.username, uid:m.user_id, kind:"step", icon:"🔥", text:`set a new step record — ${best.toLocaleString()} steps` });
      // Goal alert threshold = the higher of 10k and the person's own goal. So a 15k-goal
      // person only pings the group at 15k, but a 7k-goal person still isn't announced until 10k.
      const goal = Math.max(10000, (states[m.user_id]?.profile?.stepGoal) || 10000);
      const goalK = goal % 1000 === 0 ? `${goal/1000}k` : goal.toLocaleString();
      let latestGoal = null;
      for (const d of days) if (mp[d] >= goal && (!latestGoal || d > latestGoal)) latestGoal = d;
      if (latestGoal && latestGoal !== bestDate)
        evs.push({ key:`${m.user_id}-${latestGoal}-goal`, date:latestGoal, user:m.username, uid:m.user_id, kind:"step", icon:"🎯", text:`hit their ${goalK} goal — ${mp[latestGoal].toLocaleString()} steps` });
    }
    if (members.length >= 2) {
      const full = Object.keys(syncedPerDay).filter(d => syncedPerDay[d] === members.length).sort();
      const d = full[full.length - 1];
      if (d) evs.push({ key:`squad-${d}`, date:d, kind:"step", squad:true, icon:"🎉", user:"", text:"Everyone in the group logged their steps" });
    }
    return evs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 25);
  }, [members, states, memberSteps, units]);

  /* default feed length: 3 lines, unless the newest day alone has more — then show that whole day */
  const feedAuto = useMemo(() => {
    if (!feed.length) return 3;
    const latestDayCount = feed.filter(e => e.date === feed[0].date).length;
    return Math.max(3, latestDayCount);
  }, [feed]);
  const feedShown = feedN ?? feedAuto;

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

  /* steps leaderboard — this week's total per member (only shown if anyone logged steps) */
  const stepBoard = useMemo(() => {
    if (!members) return { rows: [], total: 0, since: "", label: "", sub: "" };
    const today = todayStr();
    let since, label, sub;
    if      (stepRange === "W")   { since = weekStart(today);          label = "This week";  sub = "since Monday"; }
    else if (stepRange === "1M")  { since = dAdd(today, -29);          label = "Past month"; sub = "last 30 days"; }
    else if (stepRange === "6M")  { since = dAdd(today, -181);         label = "6 months";   sub = "last 6 months"; }
    else if (stepRange === "YTD") { since = today.slice(0,4)+"-01-01"; label = "This year";  sub = "since Jan 1"; }
    else if (stepRange === "1Y")  { since = dAdd(today, -364);         label = "Past year";  sub = "last 12 months"; }
    else                          { since = dAdd(today, -5*365);       label = "Past 5 years"; sub = "last 5 years"; }
    const rows = members.map(m => {
      const mp = memberSteps[m.user_id] || {};
      let total = 0, days = 0;
      for (const d in mp) if (d >= since && d <= today) { total += mp[d]; days++; }
      return { user: m.username, uid: m.user_id, total, avg: days ? Math.round(total/days) : 0 };
    }).filter(r => r.total > 0).sort((a,b)=>b.total - a.total);
    const total = rows.reduce((s,r)=>s+r.total, 0);
    // fun "group journey": combined miles walked + a playful real-world equivalent.
    const miles = total * 0.762 / 1609.34; // ~0.762 m per step
    const eq = miles >= 500 ? `≈ ${(miles/2789).toFixed(miles/2789>=1?1:2)}× across the USA 🇺🇸`
      : miles >= 26.2 ? `≈ ${Math.round(miles/26.2)} marathon${Math.round(miles/26.2)===1?"":"s"} 🏅`
      : miles >= 1 ? `${Math.round(total*0.762)} m together` : "";
    return { rows, total, since, label, sub, miles, eq };
  }, [members, memberSteps, stepRange]);

  const strength = useMemo(() => {
    if (!members) return { rows: [], best: {}, bw: {} };
    // bodyweight moves have no weight → rank them by the most reps done in ONE set instead
    const bw = {};
    for (const lift of recordLifts) bw[lift] = (exMap[lift]?.type === "Bodyweight") || BW_SET.has(lift);
    const rows = members.map(m => {
      const st = states[m.user_id] || {};
      const lifts = {};
      for (const lift of recordLifts) {
        const entries = (st.log || []).filter(e => e.exercise === lift && !e.quick);
        if (bw[lift]) {
          const reps = entries.map(e => e.reps || 0).filter(r => r > 0);
          lifts[lift] = reps.length ? Math.max(...reps) : null;   // best single-set reps
        } else {
          const best = bestEst1RM(lift, entries);
          lifts[lift] = best != null ? Math.round(best) : null;
        }
      }
      return { user: m.username, uid: m.user_id, lifts };
    });
    const best = {};
    for (const lift of recordLifts) best[lift] = Math.max(0, ...rows.map(r => r.lifts[lift] || 0));
    return { rows, best, bw };
  }, [members, states, recordLifts, exMap]);

  /* all-time group records */
  const records = useMemo(() => {
    if (!members) return [];
    let sessionsBest=null, setsBest=null, prBest=null, streakBest=null, weekMost=null, cardioLong=null;
    for (const m of members) {
      const st = states[m.user_id]; if (!st) continue;
      const trainDays = new Set([...(st.log||[]).map(e=>e.date), ...(st.cardio||[]).map(e=>e.date)]);
      if (trainDays.size > 0 && (!sessionsBest || trainDays.size > sessionsBest.v))
        sessionsBest = { v:trainDays.size, text:`${trainDays.size} sessions`, who:m.username, uid:m.user_id };
      const setCount = (st.log || []).reduce((sum,e)=>sum+setCountOf(e),0);
      if (setCount > 0 && (!setsBest || setCount > setsBest.v))
        setsBest = { v:setCount, text:`${setCount.toLocaleString()} sets`, who:m.username, uid:m.user_id };
      // biggest all-time estimated-1RM across the big lifts (progress, not just who's heaviest today).
      // Uses the rep cap so a 30-rep burnout set can't fake a huge 1RM.
      let top1rm = 0, top1rmLift = "";
      for (const lift of recordLifts) {
        const est = bestEst1RM(lift, (st.log || []).filter(e => e.exercise === lift));
        if (est != null && est > top1rm) { top1rm = est; top1rmLift = lift; }
      }
      if (top1rm > 0 && (!prBest || top1rm > prBest.v))
        prBest = { v:top1rm, text:`${Math.round(dispW(top1rm,units)).toLocaleString()} ${uLabel(units)} ${LIFT_SHORT[top1rmLift]||top1rmLift}`, who:m.username, uid:m.user_id };
      const s = computeStreak(st.log, st.cardio);
      if (s.best > 0 && (!streakBest || s.best > streakBest.v))
        streakBest = { v:s.best, text:`${s.best} week${s.best===1?"":"s"} in a row`, who:m.username, uid:m.user_id };
      const byWeek = {};
      for (const d of new Set([...(st.log||[]).map(e=>e.date), ...(st.cardio||[]).map(e=>e.date)]))
        byWeek[weekStart(d)] = (byWeek[weekStart(d)] || 0) + 1;
      for (const [wk, c] of Object.entries(byWeek)) {
        if (!weekMost || c > weekMost.v)
          weekMost = { v:c, text:`${c} day${c===1?"":"s"} (week of ${fmtDate(wk)})`, who:m.username, uid:m.user_id };
      }
      for (const c of (st.cardio || [])) {
        if (c.duration && (!cardioLong || c.duration > cardioLong.v))
          cardioLong = { v:c.duration, text:`${c.duration} min ${c.activity}`, who:m.username, uid:m.user_id };
      }
    }
    return [
      sessionsBest && { icon:"📈", label:"Most sessions logged", ...sessionsBest },
      setsBest     && { icon:"🧱", label:"Most sets logged", ...setsBest },
      prBest       && { icon:"🏆", label:"Top estimated 1RM", ...prBest },
      streakBest   && { icon:"🔥", label:"Longest streak", ...streakBest },
      weekMost     && { icon:"📅", label:"Most workout days in a week", ...weekMost },
      cardioLong   && { icon:"🏃", label:"Longest cardio", ...cardioLong },
    ].filter(Boolean);
  }, [members, states, units, recordLifts]);

  /* ---- read-only profile view ---- */
  if (profile) {
    const raw = states[profile.user_id];
    const pdata = raw ? { ...defaultData, ...raw } : null;
    const pexMap = pdata ? Object.fromEntries(pdata.exercises.map(e=>[e.name,e])) : {};
    const bw = pdata ? [...pdata.bodyweight].sort((a,b)=>a.date.localeCompare(b.date)) : [];
    const recentCardio = pdata ? [...pdata.cardio].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10) : [];
    return (<>
      <button onClick={()=>setProfile(null)} style={{ background:"none", color:T.green, fontWeight:700, fontSize:14, marginBottom:10 }}>← Back to group</button>
      {/* always-reachable floating back button, so you don't have to scroll up */}
      <button className="profile-back-fab" onClick={()=>setProfile(null)} title="Back to group" style={{
        background:T.green, color:"#000", fontWeight:800, fontSize:14, padding:"11px 18px", borderRadius:99,
        border:"none", boxShadow:"0 8px 24px rgba(0,0,0,.5)",
      }}>← Back</button>
      <div className="card" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div className="h" style={{fontSize:19, color:T.tealDk}}>💪 <span style={{color:isProUser(profile.user_id)?T.green:"inherit"}}>{profile.username}</span>{isProUser(profile.user_id) && <ProBadge />}</div>
        <span className="chip" style={{background:T.mint, color:T.green}}>read-only</span>
      </div>
      {!pdata ? (
        <div className="card" style={{color:T.sub}}>They haven't logged anything yet.</div>
      ) : (() => {
        const ptabs = [["lifting","Lifting","🏋️"], ["steps","Steps","👟"]];
        const tab = ptabs.some(t=>t[0]===profileTab) ? profileTab : "lifting";
        return (<>
          <div className="seg" style={{display:"flex", width:"100%", marginBottom:14, borderRadius:14, padding:4}}>
            {ptabs.map(([id,label,icon])=>(
              <button key={id} onClick={()=>setProfileTab(id)} className={"seg-btn"+(tab===id?" on":"")}
                style={{flex:1, padding:"10px 0", borderRadius:11, fontWeight:800, fontSize:13}}>{icon} {label}</button>
            ))}
          </div>

          {tab==="lifting" && (<>
            <Dashboard data={pdata} exMap={pexMap} setData={()=>{}} own={false} sharedSteps={profileSteps} />
            <RecordsTab data={pdata} exMap={pexMap} />
            <MemberLog pdata={pdata} who={profile.username} />
            <GoalCard data={pdata} setData={()=>{}} current={bw.length ? bw[bw.length-1] : null} rows={bw}
              readOnly who={`${profile.username} hasn't`} />
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14}}>
              <StatTile icon="⚖️" value={bw.length ? dispW(bw[bw.length-1].weight, units) : "—"} label={`Body wt (${uLabel(units)})`} />
              <StatTile icon="📉" value={bw.length ? (b=>{const c=dispW(bw[bw.length-1].weight-bw[0].weight, units); return (c>0?"+":"")+c;})() : "—"} label={`Change (${uLabel(units)})`} />
              <StatTile icon="🏃" value={pdata.cardio.length} label="Cardio sessions" />
            </div>
            {recentCardio.length > 0 && (
              <div className="card">
                <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Recent cardio</div>
                <table><thead><tr><th>Date</th><th>Activity</th><th style={{textAlign:"center"}}>Min</th><th style={{textAlign:"center"}}>Cal</th></tr></thead>
                  <tbody>{recentCardio.map(e=>(
                    <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.activity}</td><td style={{textAlign:"center"}}>{e.duration}</td><td style={{textAlign:"center"}}>{e.calories ?? "—"}</td></tr>
                  ))}</tbody></table>
              </div>
            )}
          </>)}

          {tab==="steps" && (<>
            {profile.user_id !== user.id && (isPro ? (
              <div className="card">
                {!dueling && !duelMsg && (
                  <button onClick={()=>{ setDuelDays("7"); setDueling(true); }} className="btn-primary" style={{width:"100%", padding:"13px", fontSize:14}}>⚔️ Challenge {profile.username} to a step duel</button>
                )}
                {dueling && (
                  <div style={{display:"flex", gap:8, alignItems:"flex-end", flexWrap:"wrap"}}>
                    <label style={{...lbl, flex:1, minWidth:120}}>Length (1–30 days)<input type="number" inputMode="numeric" min="1" max="30" value={duelDays} onChange={e=>setDuelDays(e.target.value)} /></label>
                    <button onClick={startDuel} style={{background:T.green, color:"#000", fontWeight:800, padding:"11px 16px"}}>Start ⚔️</button>
                    <button onClick={()=>setDueling(false)} style={{background:T.input, color:T.sub, padding:"11px 13px"}}>Cancel</button>
                  </div>
                )}
                {duelMsg && <div style={{fontSize:13, color:T.green, fontWeight:700}}>{duelMsg}</div>}
              </div>
            ) : (
              <ProTeaser icon="⚔️" title="Step duels" onGoPro={openPro}
                desc={`Go Pro to challenge ${profile.username} to a step duel — most steps over your chosen number of days wins.`} />
            ))}
            {profileLastSync && (
              <div className="card" style={{display:"flex", alignItems:"center", gap:9, padding:"11px 14px"}}>
                <span style={{fontSize:16}}>🕐</span>
                <span style={{fontSize:13, color:T.sub}}>Last synced <b style={{color:T.ink}}>{stepRel(profileLastSync)}</b></span>
              </div>
            )}
            {(() => {
              const rec = duelRecord(profile.user_id);
              if (!rec.total) return null;
              const wr = Math.round(rec.w / rec.total * 100);
              return (
                <div className="card" style={{display:"flex", alignItems:"center", gap:12, padding:"12px 15px"}}>
                  <span style={{fontSize:22}}>⚔️</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, color:T.sub, fontWeight:600}}>Step duel record</div>
                    <div style={{fontSize:17, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>
                      {rec.w}<span style={{color:T.sub, fontWeight:600}}>W</span> – {rec.l}<span style={{color:T.sub, fontWeight:600}}>L</span>{rec.t ? <> – {rec.t}<span style={{color:T.sub, fontWeight:600}}>T</span></> : null}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:20, fontWeight:800, color: wr>=50?T.green:T.sub}}>{wr}%</div>
                    <div style={{fontSize:10.5, color:T.sub}}>win rate</div>
                  </div>
                </div>
              );
            })()}
            {profileSteps === undefined ? <div className="card"><div className="skeleton" style={{height:220, borderRadius:12}} /></div>
            : (() => {
                const mg = mergeSteps(profileSteps, pdata.cardio);
                return Object.keys(mg.map).length
                  ? <StepRingChart map={mg.map} goal={(pdata.profile?.stepGoal) || 10000} meta={mg.meta} />
                  : <div className="card" style={{textAlign:"center", color:T.sub, padding:"26px 16px"}}><div style={{fontSize:34, marginBottom:8}}>👟</div>{profile.username} hasn't logged any steps yet.</div>;
              })()}
          </>)}

        </>);
      })()}
    </>);
  }

  /* ---- group view ---- */
  if (active) {
    return (<>
      {memberMenu && createPortal(
        <div key={memberMenu.uid} ref={memberMenuRef} role="menu" aria-label={`${memberMenu.name} profile menu`} className={`member-menu-pop${memberMenu.closing?" closing":""}`}
          style={{position:"fixed", zIndex:85, left:memberMenu.left, top:memberMenu.top, width:224, transformOrigin:memberMenu.origin, background:`linear-gradient(155deg, color-mix(in srgb, ${T.card} 91%, var(--accent) 9%), ${T.card})`, border:`1px solid color-mix(in srgb, ${T.green} 72%, ${T.line})`, borderRadius:13, padding:9, boxShadow:"0 18px 48px -12px rgba(0,0,0,.72), 0 0 0 1px rgba(var(--accent-rgb),.08) inset"}}>
          <div style={{display:"flex", alignItems:"center", gap:8, padding:"3px 5px 8px", minWidth:0}}>
            <span style={{display:"grid", placeItems:"center", width:28, height:28, borderRadius:9, flexShrink:0, background:T.mint, color:T.green}}>👤</span>
            <span style={{minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:T.green, fontSize:13.5, fontWeight:850}}>{memberMenu.name}{memberMenu.uid===user.id?" (you)":""}</span>
          </div>
          <button role="menuitem" onClick={()=>{
            const picked = members?.find(m=>m.user_id===memberMenu.uid);
            setMemberMenu(null);
            if (picked) { setProfileTab("lifting"); setProfile(picked); }
          }} style={{width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(var(--accent-rgb),.12)", color:T.ink, border:`1px solid ${T.line}`, borderRadius:9, padding:"9px 11px", fontSize:13, fontWeight:800}}>
            <span>View profile</span><span style={{color:T.green}}>→</span>
          </button>
        </div>, document.body
      )}
      {recap && <MonthlyRecapModal recap={recap} groupName={active.name} emoji={active.emoji} onClose={closeRecap} />}
      {facts && <StepFactsModal name={facts.name} isMe={facts.uid===user.id} map={memberSteps[facts.uid]} rank={(stepBoard.rows.findIndex(r=>r.uid===facts.uid)+1) || null} onClose={()=>setFacts(null)} />}
      {squadCel && (
        <div onClick={dismissSquad} style={{position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", padding:24, animation:"fadeSwap .2s ease-out both"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.card, border:`1px solid ${T.green}`, borderRadius:18, padding:"26px 22px", maxWidth:340, textAlign:"center", animation:"calPop .28s cubic-bezier(.34,1.56,.64,1) both"}}>
            <div style={{fontSize:44, marginBottom:8}}>🎉</div>
            <div className="h" style={{fontSize:20, color:T.green, marginBottom:6}}>Whole squad logged!</div>
            <div style={{fontSize:13.5, color:T.sub, lineHeight:1.55, marginBottom:16}}>Everyone in <b style={{color:T.ink}}>{active.name}</b> got their steps in for {squadCel === dAdd(todayStr(), -1) ? "yesterday" : fmtDate(squadCel)}. Momentum. 🔥</div>
            <button onClick={dismissSquad} className="btn-primary" style={{fontSize:15, padding:"13px 20px", width:"100%"}}>Let's go</button>
          </div>
        </div>
      )}
      <button onClick={()=>{setActive(null); setMembers(null);}} style={{ background:"none", color:T.green, fontWeight:700, fontSize:14, marginBottom:10 }}>← All groups</button>
      <div className="card">
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap"}}>
          <div className="h" style={{fontSize:19, color:T.tealDk, display:"flex", alignItems:"center", gap:6}}>
            <button onClick={()=>setEmojiOpen(o=>!o)} title="Change group emoji" style={{
              background:T.input, border:`1px solid ${emojiOpen ? T.green : T.line}`, borderRadius:10,
              fontSize:20, padding:"4px 9px", lineHeight:1.2,
            }}>{active.emoji || "👥"}</button>
            {active.name}
          </div>
          <ConfirmX label="Leave group" onConfirm={async ()=>{ try { await leaveGroup(active.id, user.id); setActive(null); refreshGroups(); } catch(e){ setErr(String(e?.message||e)); } }} />
        </div>
        {emojiOpen && (
          <div style={{marginTop:10, background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"10px 12px"}}>
            <div style={{fontSize:12, color:T.sub, marginBottom:8}}>Pick the group's emoji — everyone in the group sees it, and anyone can change it.</div>
            <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
              {["👥","💪","🏋️","🔥","⚡","🏆","🐐","😤","🦾","❄️","🥩","🚀","🎯","🃏"].map(e=>(
                <button key={e} onClick={()=>saveEmoji(e)} style={{
                  fontSize:20, padding:"5px 9px", borderRadius:10, lineHeight:1.2,
                  background: (active.emoji||"👥")===e ? "rgba(var(--accent-rgb),.16)" : T.card,
                  border:`1px solid ${(active.emoji||"👥")===e ? T.green : T.line}`,
                }}>{e}</button>
              ))}
              <input value={customEmoji} onChange={e=>setCustomEmoji(e.target.value)} placeholder="or type any…"
                maxLength={4} style={{width:110, fontSize:15}} />
              {customEmoji.trim() && (
                <button onClick={()=>{ saveEmoji(customEmoji.trim()); setCustomEmoji(""); }}
                  style={{background:T.green, color:"#000", padding:"6px 14px", fontWeight:700, fontSize:13.5}}>Set</button>
              )}
            </div>
          </div>
        )}
      </div>

      {err && <div className="card" style={{color:T.danger, fontSize:13.5}}>{err}</div>}
      {!members && (
        <div className="card">
          <div className="skeleton" style={{height:16, width:"45%", borderRadius:6, marginBottom:12}} />
          <div className="skeleton" style={{height:52, borderRadius:10, marginBottom:9}} />
          <div className="skeleton" style={{height:52, borderRadius:10, marginBottom:9}} />
          <div className="skeleton" style={{height:52, borderRadius:10}} />
        </div>
      )}

      {members && (<>
        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>📣 Recent activity</div>
          {!feed.length && <div style={{color:T.sub, fontSize:14}}>Nothing yet — someone go lift something.</div>}
          {feed.slice(0, feedShown).map(ev=>{
            const rs = reactions[ev.key] || [];
            const mine = rs.some(r=>r.reactor_id===user.id);
            return (
              <div key={ev.key} style={{padding:"9px 0", borderBottom:`1px solid ${T.line}`, fontSize:14}}>
                <span style={{color:T.sub, fontSize:12.5}}>{fmtDate(ev.date)}</span>{" "}
                {ev.kind==="step" && ev.squad
                  ? <><b style={{color:T.green}}>{ev.icon} {ev.text}</b></>
                  : <>{nameEl(ev.uid, ev.user, { you: ev.uid===user.id, weight:700 })}{" "}
                      {ev.kind==="step" ? <>{ev.icon} {ev.text}</>
                        : ev.kind==="cardio" ? <>{ev.icon||"🏃"} {ev.text}</>
                        : ev.kind==="quick-lift" ? <>⚡ logged a quick workout — {ev.muscles.map(([muscle,sets])=>`${muscle} ×${sets}`).join(" · ")}</>
                        : <>logged {ev.sets} set{ev.sets===1?"":"s"} — {ev.names.join(", ")}{ev.more>0?` +${ev.more} more`:""}</>}
                    </>}
                {ev.prs?.map(pr=>(
                  <span key={pr.ex} className="chip" style={{background:T.mint, color:T.green, marginLeft:6}}>🎉 PR: {pr.label}{pr.note ? ` — “${pr.note}”` : ""}</span>
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
          <div style={{ display:"flex", gap:8 }}>
            {feed.length > feedShown && (
              <button onClick={()=>setFeedN(feedShown+15)} style={{
                flex:1, marginTop:10, padding:"9px 0", background:T.input, color:T.green,
                fontWeight:700, fontSize:13.5, border:`1px solid ${T.line}`,
              }}>View more ({feed.length - feedShown} older)</button>
            )}
            {feedN !== null && feedShown > feedAuto && (
              <button onClick={()=>setFeedN(null)} style={{
                flex:1, marginTop:10, padding:"9px 0", background:T.input, color:T.sub,
                fontWeight:700, fontSize:13.5, border:`1px solid ${T.line}`,
              }}>View less</button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>🏁 This week</div>
          <div style={{fontSize:12, color:T.sub, marginBottom:6}}>How many days each of you has trained, Mon–Sun.</div>
          {consistency.map((r,i)=>{
            const isMe = r.uid===user.id;
            return (
              <div key={r.uid} style={{display:"flex", alignItems:"center", gap:9, padding:"10px 2px", borderTop: i===0?"none":`1px solid ${T.creamLine}`}}>
                <span style={{width:22, textAlign:"center", fontWeight:800, fontSize:14, color: i===0&&r.workouts>0?T.green:T.sub}}>{i===0&&r.workouts>0?"👑":i+1}</span>
                <span style={{flex:1, minWidth:0, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{nameEl(r.uid, r.user, { you: isMe })}</span>
                <span style={{width:88, display:"flex", alignItems:"center", gap:6, flexShrink:0}}>
                  <span style={{flex:1, height:6, background:T.input, borderRadius:99, overflow:"hidden"}}>
                    <span style={{display:"block", width:`${Math.min(r.workouts,7)/7*100}%`, height:"100%", background:T.green, borderRadius:99}} />
                  </span>
                  <b style={{color: r.workouts>0?T.green:T.sub, fontSize:13, width:40, textAlign:"right", fontVariantNumeric:"tabular-nums"}}>{r.workouts}/7<span style={{fontSize:10, color:T.sub, fontWeight:600}}>d</span></b>
                </span>
                {streaksOn && (
                  <span title="Week streak" style={{width:46, textAlign:"center", fontSize:12.5, fontWeight:700, color: r.streak>0?T.ink:T.sub, flexShrink:0}}>
                    {r.streak>0 ? <>🔥{r.streak}<span style={{fontSize:10, color:T.sub, fontWeight:600}}>wk</span></> : "—"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="card">
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:10}}>
            <div className="h" style={{fontSize:17, color:T.tealDk}}>👣 Group steps</div>
            <div style={{display:"flex", gap:2, background:T.input, borderRadius:99, padding:3, flexShrink:0}}>
              {["W","1M","6M","YTD","1Y","5Y"].map(rg=>(
                <button key={rg} onClick={()=>setStepRange(rg)} style={{
                  border:"none", cursor:"pointer", fontSize:11, fontWeight:700, padding:"4px 7px", borderRadius:99,
                  background: stepRange===rg ? "var(--cal-cardio)" : "transparent", color: stepRange===rg ? "var(--cal-cardio-ink)" : T.sub }}>{rg}</button>
              ))}
            </div>
          </div>

          {/* group "journey" — everyone's steps combined into one fun number */}
          {stepBoard.total > 0 && (
            <div style={{display:"flex", alignItems:"center", gap:11, background:"linear-gradient(100deg,color-mix(in srgb,var(--cal-cardio) 11%,transparent),color-mix(in srgb,var(--cal-cardio) 2%,transparent))",
              border:"1px solid color-mix(in srgb,var(--cal-cardio) 24%,var(--line))", borderRadius:14, padding:"11px 14px", marginBottom:10}}>
              <span style={{fontSize:24}}>🌍</span>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:18, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums", lineHeight:1.1}}>{stepBoard.total.toLocaleString()} <span style={{fontSize:12, fontWeight:600, color:T.sub}}>steps together</span></div>
                <div style={{fontSize:12, color:"var(--cal-cardio)", fontWeight:700}}>{Math.round(stepBoard.miles).toLocaleString()} mi {stepBoard.eq ? `· ${stepBoard.eq}` : ""}</div>
              </div>
            </div>
          )}

          {stepBoard.rows.length === 0 ? (
            <div style={{fontSize:13, color:T.sub, padding:"6px 2px"}}>No steps logged in this range yet.</div>
          ) : stepBoard.rows.map((r,i)=>{
            const top = stepBoard.rows[0].total || 1;
            const isMe = r.uid===user.id;
            return (
              <button key={r.uid} onClick={()=>setFacts({ uid:r.uid, name:r.user })} title={`${r.avg.toLocaleString()} steps/day average`}
                style={{width:"100%", textAlign:"left", background:"none", display:"flex", alignItems:"center", gap:9, padding:"9px 2px", borderTop: i===0?"none":`1px solid ${T.creamLine}`}}>
                <span style={{width:20, flexShrink:0, textAlign:"center", fontWeight:800, fontSize:13, color:i===0?"var(--cal-cardio)":T.sub}}>{i===0?"👑":i+1}</span>
                <span style={{flex:"0 1 auto", minWidth:40, maxWidth:150, display:"flex", fontSize:13.5}}>{nameEl(r.uid, r.user, { you: isMe })}</span>
                <span style={{flex:1, minWidth:36, height:8, background:T.input, borderRadius:99, overflow:"hidden"}}>
                  <span style={{display:"block", width:`${r.total/top*100}%`, height:"100%", background:"var(--cal-cardio)", borderRadius:99, transition:"width .5s ease"}} />
                </span>
                <span style={{textAlign:"right", flexShrink:0, minWidth:64}}>
                  <b style={{fontSize:13, color:T.ink, display:"block", fontVariantNumeric:"tabular-nums"}}>{r.total.toLocaleString()}</b>
                  <span style={{fontSize:10.5, color:T.sub}}>{r.avg.toLocaleString()}/day</span>
                </span>
              </button>
            );
          })}
        </div>

        {isPro
          ? <DuelsCard user={user} all={memberSteps} nameOf={Object.fromEntries((members||[]).map(m=>[m.user_id,m.username]))} myId={user.id} myName={myName} proIds={proIds}
              minimized={!!data.profile?.minimizedSections?.stepDuels}
              onMinimizedChange={value=>setData(d=>({ ...d, profile:{ ...(d.profile||{}), minimizedSections:{ ...(d.profile?.minimizedSections||{}), stepDuels:value } } }))} />
          : <ProTeaser icon="👟" title="Join the steps game" onGoPro={openPro}
              desc="You can see the squad's steps here — go Pro to sync your own, climb the board, and challenge friends to head-to-head step duels ⚔️" />}

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>🏋️ Strength — best est. 1RM ({uLabel(units)})</div>
          <div style={{fontSize:12, color:T.sub, marginBottom:8}}>Green = group best. Bodyweight moves show the most reps done in one set.{isOwner ? " Tap a column's exercise to swap it." : ""}</div>
          <div style={{overflowX:"auto"}}>
            <table><thead><tr>
              <th>Member</th>
              {recordLifts.map((l,i)=>(
                <th key={i} style={{textAlign:"center", minWidth: isOwner?150:120}}>
                  {isOwner
                    ? <LiftHeaderPicker value={l} options={liftOptions} exMap={exMap} onPick={ex=>swapLift(i, ex)} onRemove={()=>swapLift(i, "__remove__")} />
                    : <span style={{display:"inline-block", whiteSpace:"normal", maxWidth:170, lineHeight:1.2}}>{l}</span>}
                </th>
              ))}
              {isOwner && recordLifts.length < 8 && (
                <th style={{textAlign:"center"}}>
                  <button onClick={addLift} title="Add a lift column" style={{background:T.input, border:`1px solid ${T.line}`, color:T.green, fontWeight:800, fontSize:15, width:30, height:30, borderRadius:8}}>＋</button>
                </th>
              )}
            </tr></thead>
              <tbody>{strength.rows.map(r=>(
                <tr key={r.uid}>
                  <td>{nameEl(r.uid, r.user, { you: r.uid===user.id, weight: r.uid===user.id?700:400 })}</td>
                  {recordLifts.map((l,i)=>(
                    <td key={i} style={{ textAlign:"center", color: r.lifts[l] && r.lifts[l]===strength.best[l] ? T.green : T.ink, fontWeight: r.lifts[l] && r.lifts[l]===strength.best[l] ? 700 : 400 }}>
                      {r.lifts[l] == null ? "—" : strength.bw[l] ? <>{r.lifts[l]}<span style={{fontSize:10, color:T.sub, fontWeight:500}}> reps</span></> : dispW(r.lifts[l], units)}
                    </td>
                  ))}
                  {isOwner && recordLifts.length < 8 && <td />}
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
                  <td>{nameEl(r.uid, r.who, { weight:700 })}</td>
                  <td>{r.text}</td>
                </tr>
              ))}</tbody></table>
          </div>
        )}

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>🎟️ Invite & members</div>
          <div style={{fontSize:13.5, color:T.sub, marginBottom:10,lineHeight:1.55}}>
            <div>Private invite code:</div>
            <div style={{display:"flex",gap:8,alignItems:"center",margin:"5px 0",minWidth:0}}><code style={{color:T.green,letterSpacing:".7px",fontSize:11.5,overflowWrap:"anywhere",flex:1}}>{active.invite_code}</code>
            <button onClick={copyCode} style={{background:T.input, color:T.green, fontSize:12.5, padding:"7px 11px",flexShrink:0}}>{copied ? "Copied!" : "Copy"}</button></div>
            <span>Friends enter it under Groups → Join. Wrong attempts are throttled after three tries.</span>
          </div>
          {members.map(m=>(
            <div key={m.user_id} style={{display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:`1px solid ${T.line}`, fontSize:14}}>
              <span style={{flex:1}}>
                {m.user_id===active.created_by ? "👑 " : ""}{nameEl(m.user_id, m.username, { you: m.user_id===user.id, weight: m.user_id===user.id?700:500 })}
              </span>
              {isOwner && m.user_id !== user.id && (
                <ConfirmX label="Remove" onConfirm={async ()=>{
                  try { await leaveGroup(active.id, m.user_id); setMembers(ms=>ms.filter(x=>x.user_id!==m.user_id)); }
                  catch(e){ setErr(String(e?.message||e)); }
                }} />
              )}
            </div>
          ))}
          {isOwner && (
            <div style={{marginTop:10}}>
              <ConfirmX label="🔄 Reset invite code" onConfirm={async ()=>{
                try { const nc = await resetInviteCode(active.id); setActive(a=>({...a, invite_code:nc})); refreshGroups(); }
                catch(e){ setErr(String(e?.message||e)); }
              }} />
              <div style={{fontSize:11.5, color:T.sub, marginTop:4}}>Resetting kills the old code — anyone who hasn't joined yet needs the new one.</div>
            </div>
          )}
        </div>
      </>)}
    </>);
  }

  /* ---- groups list / create / join ---- */
  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>👥 Groups</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>
        Make a group, send friends the invite code, and see each other's workouts, PRs, and a friendly weekly race.
      </div>
      {groups === null && (
        <div style={{display:"flex", flexDirection:"column", gap:9}}>
          <div className="skeleton" style={{height:64, borderRadius:12}} />
          <div className="skeleton" style={{height:64, borderRadius:12}} />
        </div>
      )}
      {groups !== null && !groups.length && <div style={{color:T.sub, fontSize:14, marginBottom:4}}>You're not in a group yet — create one below or join with a friend's code.</div>}
      {groups?.map(g=>{
        const mem = previews[g.id];
        return (
        <button key={g.id} onClick={()=>setActive(g)} style={{
          display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, width:"100%",
          background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"12px 14px",
          color:T.ink, fontSize:15, fontWeight:600, marginBottom:8, textAlign:"left",
        }}>
          <span style={{flex:1, minWidth:0}}>
            <span style={{display:"block"}}>{g.emoji || "👥"} {g.name}{mem && <span style={{color:T.sub, fontWeight:500, fontSize:12.5}}> · {mem.length} member{mem.length===1?"":"s"}</span>}</span>
            {mem && mem.length > 0 && (
              <span style={{display:"block", fontSize:12, color:T.sub, fontWeight:500, marginTop:3,
                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                {mem.slice(0,4).map(m=>`${m.uid===user.id?"you":m.username}${agoTxt(m.last)?` (${agoTxt(m.last)})`:""}`).join(", ")}
                {mem.length > 4 ? `, +${mem.length-4} more` : ""}
              </span>
            )}
          </span>
          <span style={{color:T.green, flexShrink:0}}>→</span>
        </button>
        );
      })}
    </div>

    <div className="card">
      <div className="h" style={{fontSize:16, color:T.tealDk, marginBottom:8}}>Create a group</div>
      <div style={{display:"flex", gap:8}}>
        <input value={gname} onChange={e=>setGname(e.target.value)} placeholder="e.g. Gym Rats" maxLength={40} />
        <button onClick={doCreate} disabled={busy||!gname.trim()} className="btn-primary" style={{padding:"0 20px"}}>Create</button>
      </div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:16, color:T.tealDk, marginBottom:8}}>Join with an invite code</div>
      <div style={{fontSize:11.5,color:T.sub,lineHeight:1.5,marginBottom:9}}>Joining lets members see only the categories enabled under <b style={{color:T.ink}}>Settings → Privacy & sharing</b>. Journals, private notes, routines, nutrition history, email and backups are never included.</div>
      <div style={{display:"flex", gap:8}}>
        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,""))} placeholder="32-character private code" maxLength={32} style={{letterSpacing:"1px",fontFamily:"ui-monospace,monospace"}} />
        <button onClick={doJoin} disabled={busy||code.trim().length<32} className="btn-primary" style={{padding:"0 20px"}}>Join</button>
      </div>
    </div>

    {err && <div className="card" style={{color:T.danger, fontSize:13.5}}>{err}</div>}
  </>);
}




