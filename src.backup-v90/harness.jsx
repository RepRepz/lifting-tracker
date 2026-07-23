import { useState } from "react";
import ReactDOM from "react-dom/client";
import { __SettingsTest as SettingsModal, T } from "./LiftingTracker.jsx";
const fakeUser = { id:"t", created_at:"2026-01-01T00:00:00Z", user_metadata:{ username:"mike" } };
const tabs = [["dash","Dash","📊"],["log","Log","📝"],["journal","Journal","📓"],["friends","Groups","👥"]];
const noop=()=>{};
function Harness() {
  const [data, setData] = useState({ log:[], bodyweight:[], cardio:[], profile:{} });
  const [open, setOpen] = useState(true);
  return (
    <div style={{background:T.bg,minHeight:"200vh",color:"#fff",padding:20}}>
      <button id="reopen" onClick={()=>setOpen(true)}>open settings</button>
      {open && <SettingsModal user={fakeUser} username="mike" data={data} setData={setData} startTab="dash" setStartTab={noop} tabs={tabs}
        units="lb" setUnits={noop} hunit="ftin" setHunit={noop} routinesOn={false} setRoutinesOn={noop}
        streaksOn setStreaksOn={noop} waterOn setWaterOn={noop} nutritionOn={false} onClose={()=>setOpen(false)} />}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
