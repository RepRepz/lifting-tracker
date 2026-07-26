const SUPPORT_URL = "https://github.com/RepRepz/lifting-tracker/issues";

const pages = {
  privacy: {
    title: "Privacy Policy",
    updated: "July 26, 2026",
    sections: [
      ["What The Lab stores", "Your account identifier, public username, workout logs, exercises, bodyweight and goals you enter, cardio, journal entries, settings, backups, and—only if you connect it—daily Apple Health step totals."],
      ["What stays private", "Your complete account record, journal, private notes, routines, nutrition history, backup files, height, gym names, email address, recovery codes, and Apple Health upload secret are not shared with group members."],
      ["Group sharing", "Joining a group shares only the categories you enable in Settings → Privacy & sharing. Workouts and cardio are on by default because they power group activity. Bodyweight and bodyweight goals are off by default. Anything displayed to a groupmate can be received by that groupmate's browser; private categories are never included in that response."],
      ["Apple Health", "The website cannot read Apple Health directly. If you choose to build the iPhone Shortcut, it sends a date and total step count to The Lab. It does not send individual Health samples. You can rotate the upload secret or disconnect and delete synced steps in Settings."],
      ["Where data is processed", "Account and cloud data are processed by Supabase. The website is currently delivered through GitHub Pages. The app keeps a temporary on-device cache so logging can survive a weak gym connection."],
      ["Retention and control", "Protected cloud history snapshots are kept for approximately 30 days for administrative recovery. You can export your own current data, adjust group sharing, disconnect Apple Health, sign out and clear this device, or request permanent account deletion from Settings. Email accounts must confirm deletion through a short-lived email link."],
      ["No sale of data", "The Lab does not sell personal data or use workout, journal, bodyweight, or step data for third-party advertising."],
      ["Security", "Passwords and backup-code hashes are stored through protected authentication/database systems. No service can promise perfect security, so use a unique password and keep backup codes and Apple Health upload secrets private."],
      ["Contact", "For privacy requests or problems, use the project support link below."],
    ],
  },
  terms: {
    title: "Terms of Use",
    updated: "July 26, 2026",
    sections: [
      ["The service", "The Lab is a workout logging and social accountability tool. Features may change while the product is in active development."],
      ["Not medical advice", "Set targets, estimated one-rep maxes, calorie estimates, and coaching insights are informational estimates—not medical advice, diagnosis, treatment, or a guarantee of strength or muscle growth. Train within your ability and consult a qualified professional when appropriate."],
      ["Your account", "Use accurate signup information, protect your password and backup codes, and do not access another person's account. You are responsible for activity performed through your account until you report or secure it."],
      ["Groups and conduct", "Only join groups you are invited to. Do not harass people, impersonate others, manipulate competitions, scrape private information, probe the service, or upload unlawful or abusive content."],
      ["Your content", "You keep ownership of the workout and profile information you enter. You give The Lab permission to process it only as needed to operate the features you choose, including sharing enabled categories with your groups."],
      ["Availability", "The service and backups are provided on an as-available basis. Keep your own export of anything you cannot afford to lose."],
      ["Age", "You must be at least 13 years old and meet any higher minimum age required where you live. If local law requires a parent or guardian's consent, obtain it before using the service."],
      ["Ending use", "You may permanently delete your account in Settings. Access may be limited for abuse, attempted unauthorized access, or conduct that threatens other users or the service."],
    ],
  },
};

export function LegalModal({ page="privacy", onClose }) {
  const doc = pages[page] || pages.privacy;
  return <div role="dialog" aria-modal="true" aria-label={doc.title} onClick={onClose} style={{position:"fixed",inset:0,zIndex:120,background:"rgba(0,0,0,.78)",backdropFilter:"blur(4px)",display:"grid",placeItems:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"min(620px,100%)",maxHeight:"88dvh",overflowY:"auto",background:"var(--card,#101215)",border:"1px solid var(--line,#242A31)",borderRadius:18,padding:"20px 18px",color:"var(--ink,#fff)",boxShadow:"0 24px 80px rgba(0,0,0,.65)"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:14}}>
        <div><div style={{fontSize:22,fontWeight:900}}>{doc.title}</div><div style={{fontSize:12,color:"var(--sub,#8A9098)",marginTop:3}}>Effective and last updated: {doc.updated}</div></div>
        <button onClick={onClose} aria-label="Close" style={{width:34,height:34,borderRadius:99,background:"var(--input,#15181C)",color:"var(--sub,#8A9098)",fontSize:16}}>✕</button>
      </div>
      {doc.sections.map(([title,text])=><section key={title} style={{borderTop:"1px solid var(--line,#242A31)",padding:"13px 1px"}}>
        <div style={{fontSize:14,fontWeight:850,marginBottom:4,color:"var(--accent,#00C805)"}}>{title}</div>
        <div style={{fontSize:13,lineHeight:1.58,color:"var(--sub,#A0A5AB)"}}>{text}</div>
      </section>)}
      <a href={SUPPORT_URL} target="_blank" rel="noreferrer" style={{display:"block",textAlign:"center",marginTop:8,padding:11,borderRadius:10,background:"rgba(var(--accent-rgb,0,200,5),.12)",color:"var(--accent,#00C805)",fontWeight:800,textDecoration:"none"}}>Open support</a>
    </div>
  </div>;
}
