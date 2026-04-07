/**
 * AgentVKYC.jsx
 * Presentation Layer — Agent / Officer Workflow
 *
 * RBI V-CIP Compliant Agent Dashboard:
 * - Case queue dashboard (in-queue, in-progress, hold, processed)
 * - Accept & start live KYC session
 * - Real-time liveness, face match, name match, location match scoring
 * - Customer data + application file panel
 * - Geo-location display
 * - Reconnect capability
 * - Approve / Reject with remarks
 *
 * Business logic: vkyc.agent.service.js
 */

import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  primary: "#074994",
  secondary: "#3067A6",
  light: "#ACC2DB",
  bg: "#E6E6EB",
  error: "#900909",
  warning: "#FFAA00",
  success: "#16a34a",
  white: "#ffffff",
  dark: "#0f1f3d",
  mid: "#3a4a6b",
  muted: "#6b7a99",
  panel: "#f4f6fb",
};

// ─── MOCK CASE DATA ───────────────────────────────────────────────────────────
const MOCK_CASES = [
  {
    id: "KYC-A7B3X2C",
    name: "Durgesh Nigam",
    mobile: "98765 43210",
    appId: "CDL2847391",
    product: "Personal Loan",
    loanAmt: 300000,
    emi: 8750,
    pan: "AWEPD11232",
    dob: "02/08/1979",
    fatherName: "Suresh Kumar",
    address: "B-204, Andheri West, Mumbai, Maharashtra 400058",
    status: "in-queue",
    waitMins: 4,
    queuePos: 1,
    aadhaarDate: "2025-04-04",
    preCheckLiveness: { score: 94.2, passed: true, method: "ISO-30107-3 Passive", timestamp: "10:28:43 AM" },
    geo: { lat: 19.1136, lng: 72.8697, city: "Andheri West, Mumbai" },
    appointmentId: "APT-XY3K9P",
    scheduledAt: "10:30 AM",
  },
  {
    id: "KYC-D4F9Z1K",
    name: "Priya Sharma",
    mobile: "87654 32109",
    appId: "CDL9302841",
    product: "Two Wheeler Loan",
    loanAmt: 85000,
    emi: 1980,
    pan: "BSKPR2341C",
    dob: "15/03/1992",
    fatherName: "Ramesh Sharma",
    address: "Flat 12, Koramangala 4th Block, Bangalore, Karnataka 560034",
    status: "in-queue",
    waitMins: 11,
    queuePos: 2,
    aadhaarDate: "2025-04-05",
    preCheckLiveness: { score: 91.7, passed: true, method: "ISO-30107-3 Passive", timestamp: "10:41:12 AM" },
    geo: { lat: 12.9279, lng: 77.6271, city: "Koramangala, Bangalore" },
    appointmentId: null,
    scheduledAt: "Walk-in",
  },
  {
    id: "KYC-M2P7Y5R",
    name: "Anil Mehta",
    mobile: "76543 21098",
    appId: "CDL5621034",
    product: "Credit Card",
    loanAmt: 150000,
    emi: 0,
    pan: "CFHME4512D",
    dob: "22/11/1985",
    fatherName: "Kishore Mehta",
    address: "C-301, Sector 62, Noida, UP 201309",
    status: "hold",
    waitMins: 0,
    queuePos: 0,
    aadhaarDate: "2025-03-30",
    geo: { lat: 28.6271, lng: 77.3655, city: "Sector 62, Noida" },
    appointmentId: "APT-MN7RQ2",
    scheduledAt: "2:00 PM",
  },
  {
    id: "KYC-R8T6W3N",
    name: "Sunita Patel",
    mobile: "65432 10987",
    appId: "CDL4012837",
    product: "Home Loan",
    loanAmt: 2500000,
    emi: 22400,
    pan: "DJGSP7823F",
    dob: "08/07/1978",
    fatherName: "Vijay Patel",
    address: "Plot 45, Bopal, Ahmedabad, Gujarat 380058",
    status: "approved",
    waitMins: 0,
    queuePos: 0,
    aadhaarDate: "2025-04-03",
    geo: { lat: 23.0225, lng: 72.4114, city: "Bopal, Ahmedabad" },
    appointmentId: "APT-SG4PN1",
    scheduledAt: "9:30 AM",
  },
  {
    id: "KYC-H5V2K8B",
    name: "Rahul Joshi",
    mobile: "54321 09876",
    appId: "CDL7823019",
    product: "Personal Loan",
    loanAmt: 50000,
    emi: 1450,
    pan: "EKHPJ1290G",
    dob: "30/01/1990",
    fatherName: "Girish Joshi",
    address: "Near Baner Road, Pune, Maharashtra 411045",
    status: "rejected",
    waitMins: 0,
    queuePos: 0,
    aadhaarDate: "2025-04-02",
    geo: { lat: 18.5590, lng: 73.7868, city: "Baner, Pune" },
    appointmentId: null,
    scheduledAt: "Walk-in",
  },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AgentVKYC() {
  const [view, setView] = useState("dashboard"); // 'dashboard' | 'session'
  const [activeFilter, setActiveFilter] = useState("all");
  const [cases, setCases] = useState(MOCK_CASES);
  const [activeCase, setActiveCase] = useState(null);
  const [sessionState, setSessionState] = useState("idle"); // idle | connecting | live | reconnecting | ended
  const [callTimer, setCallTimer] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [liveness, setLiveness] = useState({ face: "pending", blink: "pending", smile: "pending", turn: "pending" });
  const [livenessRunning, setLivenessRunning] = useState(false);
  const [livenessPrompt, setLivenessPrompt] = useState("");
  const [livenessAttempt, setLivenessAttempt] = useState(0);   // 0 = not yet run; increments on each run/re-run
  const [livenessConfirmed, setLivenessConfirmed] = useState(false); // true after any successful live run
  const [matchScores, setMatchScores] = useState({ name: null, face: null, location: null, pan: null });
  const [panFront, setPanFront] = useState(null);
  const [panBack, setPanBack] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [decision, setDecision] = useState(null);
  const [toast, setToast] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [spokenCode, setSpokenCode] = useState(null);
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeAttempts, setCodeAttempts] = useState(0);
  const [codeMaxRetry, setCodeMaxRetry] = useState(false);
  const [questionnaire, setQuestionnaire] = useState({});
  const [signatureImg, setSignatureImg] = useState(null);

  const videoRef = useRef(null);
  const agentVideoRef = useRef(null);
  const timerRef = useRef(null);
  const chatEndRef = useRef(null);

  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Call timer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionState === "live") {
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (sessionState !== "live") setCallTimer(0);
    }
    return () => clearInterval(timerRef.current);
  }, [sessionState]);

  const timerLabel = () => {
    const m = String(Math.floor(callTimer / 60)).padStart(2, "0");
    const s = String(callTimer % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  // ── Chat scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Start session ────────────────────────────────────────────────────────────
  async function acceptCase(c) {
    setActiveCase(c);
    setView("session");
    setSessionState("connecting");
    setCases((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, status: "in-progress" } : x))
    );

    // Start camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (agentVideoRef.current) {
        agentVideoRef.current.srcObject = stream;
        agentVideoRef.current.play();
      }
    } catch {}

    await delay(2000);
    const sid = "KYC-" + Math.random().toString(36).substr(2, 7).toUpperCase();
    setSessionId(sid);
    setSessionState("live");
    addSystemChat(`Session ${sid} started. Customer: ${c.name}`);
    showToast(`Session connected — ${c.name}`, "success");
  }

  // ── Reconnect ────────────────────────────────────────────────────────────────
  async function reconnect() {
    setSessionState("reconnecting");
    showToast("Reconnecting to session...", "info");
    await delay(2500);
    setSessionState("live");
    addSystemChat("Session reconnected.");
    showToast("Reconnected successfully", "success");
  }

  // ── Liveness ─────────────────────────────────────────────────────────────────
  async function runLiveness() {
    if (livenessRunning || sessionState !== "live") return;
    setLivenessRunning(true);
    setLivenessConfirmed(false);
    // Reset all checks before running
    setLiveness({ face: "pending", blink: "pending", smile: "pending", turn: "pending" });
    setLivenessAttempt(prev => prev + 1);
    const prompts = {
      face: "Ask customer to look straight at camera",
      blink: "Ask customer to blink twice",
      smile: "Ask customer to smile",
      turn: "Ask customer to turn head left then right",
    };
    for (const checkId of ["face", "blink", "smile", "turn"]) {
      setLivenessPrompt(prompts[checkId]);
      setLiveness((l) => ({ ...l, [checkId]: "checking" }));
      await delay({ face: 2000, blink: 2500, smile: 2500, turn: 3000 }[checkId]);
      setLiveness((l) => ({ ...l, [checkId]: "pass" }));
      addSystemChat(`Liveness check: ${checkId} — PASSED`);
    }
    setLivenessPrompt("");
    setLivenessRunning(false);
    setLivenessConfirmed(true);
    addSystemChat("Live liveness confirmation complete.");

    // Compute face & location match after liveness
    await computeFaceLocationMatch();
  }

  // ── Face + Location match (after liveness) ────────────────────────────────────
  async function computeFaceLocationMatch() {
    addSystemChat("Computing face & location match...");
    await delay(1500);
    setMatchScores(prev => ({ ...prev, face: 91.7, location: 98.1 }));
    addSystemChat("Face match: 91.7%, Location match: 98.1%");
  }

  // ── PAN Capture ──────────────────────────────────────────────────────────────
  function captureID(side) {
    if (sessionState !== "live") {
      showToast("Session must be live to capture ID", "error");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a2a4a";
    ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = "#3b82f6";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`PAN Card — ${side === "front" ? "Front" : "Back"}`, 160, 85);
    ctx.fillStyle = "#7b90b8";
    ctx.font = "11px sans-serif";
    ctx.fillText("Captured from live stream", 160, 110);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (side === "front") setPanFront(dataUrl);
    else setPanBack(dataUrl);
    addSystemChat(`PAN card ${side} side captured.`);
    showToast(`PAN ${side} captured`, "success");
  }

  // ── OCR ───────────────────────────────────────────────────────────────────────
  async function runOCR() {
    if (!panFront || !panBack) {
      showToast("Capture both sides of PAN first", "error");
      return;
    }
    setOcrRunning(true);
    addSystemChat("Running OCR on PAN card...");
    await delay(2200);
    setOcrData({
      name: activeCase.name.toUpperCase(),
      pan: activeCase.pan,
      dob: activeCase.dob,
      fatherName: activeCase.fatherName.toUpperCase(),
      confidence: 0.97,
    });
    setOcrRunning(false);
    addSystemChat(`OCR complete — Name: ${activeCase.name}, PAN: ${activeCase.pan}`);
    showToast("OCR extraction complete! Running PAN & Name match...", "success");
    await computeMatchScoresAfterOCR({
      name: activeCase.name.toUpperCase(),
      pan: activeCase.pan,
      dob: activeCase.dob,
      fatherName: activeCase.fatherName.toUpperCase(),
      confidence: 0.97,
    });
  }

  // ── Spoken Code ───────────────────────────────────────────────────────────────
  function generateCode() {
    setCodeAttempts(prev => {
      if (prev >= 3) {
        showToast("Maximum retries reached", "error");
        return prev;
      }
      const next = prev + 1;
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      setSpokenCode(code);
      setCodeVerified(false);
      addSystemChat("Spoken code generated (attempt " + next + "/3): " + code + " — Ask customer to read it aloud");
      showToast("Code generated — attempt " + next + " of 3", "success");
      return next;
    });
  }

  // ── Signature Capture ─────────────────────────────────────────────────────────
  function captureSignature() {
    if (sessionState !== "live") { showToast("Session must be live to capture", "error"); return; }
    const canvas = document.createElement("canvas");
    canvas.width = 320; canvas.height = 160;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 320, 160);
    ctx.strokeStyle = "#1a2a4a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, 100); ctx.bezierCurveTo(80, 60, 120, 130, 160, 95);
    ctx.bezierCurveTo(200, 60, 240, 110, 280, 90); ctx.stroke();
    ctx.fillStyle = "#6b7a99"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Captured from live stream", 160, 145);
    setSignatureImg(canvas.toDataURL("image/jpeg", 0.9));
    addSystemChat("Customer signature captured.");
    showToast("Signature captured", "success");
  }

  // ── Match scores after OCR ─────────────────────────────────────────────────────
  async function computeMatchScoresAfterOCR(ocrResult) {
    addSystemChat("Computing PAN & Name match scores from OCR data...");
    await delay(1500);
    const nameMatch = ocrResult.name.toUpperCase() === activeCase.name.toUpperCase() ? 97.3 : 62.1;
    const panMatch  = ocrResult.pan === activeCase.pan ? 99.8 : 45.2;
    setMatchScores(prev => ({ ...prev, name: nameMatch, pan: panMatch }));
    addSystemChat(`Name match: ${nameMatch}%, PAN match: ${panMatch}%`);
  }

  // ── Decision ──────────────────────────────────────────────────────────────────
  async function submitDecision(type) {
    if (!remarks && (type === "reject" || type === "escalate")) {
      showToast(`Please enter remarks for ${type === "reject" ? "rejection" : "escalation"}`, "error");
      return;
    }
    setDecision(type);
    await delay(800);
    const statusMap = { approve: "approved", reject: "rejected", escalate: "escalated" };
    setCases((prev) =>
      prev.map((x) => (x.id === activeCase.id ? { ...x, status: statusMap[type], deviationRaised: type === "escalate", deviationRemarks: type === "escalate" ? remarks : null } : x))
    );
    addSystemChat(`Decision submitted: ${type.toUpperCase()}. Remarks: ${remarks || "None"}`);
    const toastMap = { approve: ["KYC Approved successfully!", "success"], reject: ["KYC Rejected.", "error"], escalate: ["Deviation raised — case escalated!", "info"] };
    showToast(...toastMap[type]);
  }

  // ── Chat ─────────────────────────────────────────────────────────────────────
  function addSystemChat(msg) {
    setChatMessages((prev) => [
      ...prev,
      { type: "system", msg, time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) },
    ]);
  }
  function sendChat() {
    if (!chatInput.trim()) return;
    setChatMessages((prev) => [
      ...prev,
      { type: "agent", msg: chatInput.trim(), time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) },
    ]);
    setChatInput("");
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div style={agentStyles.root}>
      {/* Header */}
      <header style={agentStyles.header}>
        <div style={agentStyles.headerInner}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={agentStyles.logoMark}>
              <span style={{ color: C.white, fontWeight: 800, fontSize: 16 }}>V</span>
              <span style={{ color: C.warning, fontWeight: 800, fontSize: 16 }}>KYC</span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>
                {view === "dashboard" ? "Agent Dashboard" : "Live KYC Session"}
              </div>
              <div style={{ fontSize: 10, color: C.light }}>RBI V-CIP Compliant</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {view === "session" && (
              <div style={agentStyles.sessionBadge}>
                <span style={{ ...agentStyles.recDotSm, background: sessionState === "live" ? C.success : C.warning }} />
                <span style={{ fontSize: 12, color: C.white, fontWeight: 700 }}>
                  {sessionState === "connecting" ? "Connecting..." :
                   sessionState === "reconnecting" ? "Reconnecting..." :
                   sessionState === "live" ? timerLabel() : "Session Ended"}
                </span>
              </div>
            )}
            {view === "session" && (
              <button style={agentStyles.backBtn} onClick={() => setView("dashboard")}>
                ← Dashboard
              </button>
            )}
            <div style={agentStyles.agentBadge}>
              <div style={agentStyles.agentAvatar}>AK</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.white }}>Agent Kumar</div>
                <div style={{ fontSize: 10, color: C.light }}>AGT001 • Online</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard View */}
      {view === "dashboard" && (
        <DashboardView
          cases={cases}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          onAccept={acceptCase}
        />
      )}

      {/* Session View */}
      {view === "session" && activeCase && (
        <SessionView
          case_={activeCase}
          sessionId={sessionId}
          sessionState={sessionState}
          videoRef={videoRef}
          agentVideoRef={agentVideoRef}
          timerLabel={timerLabel}
          micOn={micOn}
          setMicOn={setMicOn}
          camOn={camOn}
          setCamOn={setCamOn}
          liveness={liveness}
          livenessRunning={livenessRunning}
          livenessPrompt={livenessPrompt}
          livenessAttempt={livenessAttempt}
          livenessConfirmed={livenessConfirmed}
          onRunLiveness={runLiveness}
          matchScores={matchScores}
          panFront={panFront}
          panBack={panBack}
          ocrData={ocrData}
          ocrRunning={ocrRunning}
          onCaptureID={captureID}
          onRunOCR={runOCR}
          remarks={remarks}
          setRemarks={setRemarks}
          decision={decision}
          onDecision={submitDecision}
          onReconnect={reconnect}
          spokenCode={spokenCode}
          codeVerified={codeVerified}
          setCodeVerified={setCodeVerified}
          codeAttempts={codeAttempts}
          codeMaxRetry={codeMaxRetry}
          setCodeMaxRetry={setCodeMaxRetry}
          onGenerateCode={generateCode}
          questionnaire={questionnaire}
          setQuestionnaire={setQuestionnaire}
          signatureImg={signatureImg}
          onCaptureSignature={captureSignature}
          chatMessages={chatMessages}
          chatInput={chatInput}
          setChatInput={setChatInput}
          onSendChat={sendChat}
          chatEndRef={chatEndRef}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          ...agentStyles.toast,
          background: toast.type === "error" ? C.error : toast.type === "success" ? C.success : C.primary,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
function DashboardView({ cases, activeFilter, setActiveFilter, onAccept }) {
  const filters = [
    { id: "all", label: "All Cases" },
    { id: "in-queue", label: "In Queue" },
    { id: "in-progress", label: "In Progress" },
    { id: "hold", label: "On Hold" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "escalated", label: "Escalated" },
  ];

  const counts = filters.reduce((acc, f) => {
    acc[f.id] = f.id === "all" ? cases.length : cases.filter((c) => c.status === f.id).length;
    return acc;
  }, {});

  const filtered = activeFilter === "all" ? cases : cases.filter((c) => c.status === activeFilter);

  const statusColors = {
    "in-queue": { bg: "#dbeafe", color: "#1d4ed8", label: "In Queue" },
    "in-progress": { bg: "#fef3c7", color: "#d97706", label: "In Progress" },
    hold: { bg: "#f3e8ff", color: "#7c3aed", label: "On Hold" },
    approved:  { bg: "#dcfce7", color: C.success,  label: "Approved"  },
    rejected:  { bg: "#fee2e2", color: C.error,    label: "Rejected"  },
    escalated: { bg: "#f3e8ff", color: "#7c3aed",  label: "Escalated" },
  };

  return (
    <div style={agentStyles.dashWrap}>
      {/* Stats Row */}
      <div style={agentStyles.statsRow}>
        {[
          { label: "In Queue", value: counts["in-queue"], color: "#1d4ed8", bg: "#dbeafe" },
          { label: "In Progress", value: counts["in-progress"], color: "#d97706", bg: "#fef3c7" },
          { label: "On Hold", value: counts["hold"], color: "#7c3aed", bg: "#f3e8ff" },
          { label: "Approved Today", value: counts["approved"], color: C.success, bg: "#dcfce7" },
          { label: "Rejected Today", value: counts["rejected"], color: C.error, bg: "#fee2e2" },
          { label: "Escalated", value: counts["escalated"] || 0, color: "#7c3aed", bg: "#f3e8ff" },
        ].map((s) => (
          <div key={s.label} style={{ ...agentStyles.statCard, background: s.bg }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.color, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={agentStyles.filterRow}>
        {filters.map((f) => (
          <button
            key={f.id}
            style={{
              ...agentStyles.filterBtn,
              background: activeFilter === f.id ? C.primary : C.white,
              color: activeFilter === f.id ? C.white : C.mid,
              border: `2px solid ${activeFilter === f.id ? C.primary : C.light}`,
            }}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 800,
              background: activeFilter === f.id ? "rgba(255,255,255,0.2)" : C.bg,
              color: activeFilter === f.id ? C.white : C.muted,
              padding: "1px 6px", borderRadius: 10,
            }}>
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Cases table */}
      <div style={agentStyles.caseTable}>
        <div style={agentStyles.tableHeader}>
          <span style={{ flex: 2 }}>Customer</span>
          <span style={{ flex: 1.5 }}>Application</span>
          <span style={{ flex: 1 }}>Product</span>
          <span style={{ flex: 1 }}>Amount</span>
          <span style={{ flex: 1 }}>Status</span>
          <span style={{ flex: 1 }}>Action</span>
        </div>
        {filtered.map((c) => {
          const sc = statusColors[c.status] || {};
          return (
            <div key={c.id} style={agentStyles.tableRow}>
              <div style={{ flex: 2 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.dark }}>{c.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{c.mobile} • {c.id}</div>
              </div>
              <div style={{ flex: 1.5 }}>
                <div style={{ fontSize: 13, color: C.mid }}>{c.appId}</div>
                {c.appointmentId && (
                  <div style={{ fontSize: 11, color: C.muted }}>📅 {c.appointmentId}</div>
                )}
                {c.deviationRaised && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", background: "#f3e8ff", padding: "2px 6px", borderRadius: 6, marginTop: 4, display: "inline-block" }}>
                    ⚠ Deviation Raised
                  </div>
                )}
              </div>
              <div style={{ flex: 1, fontSize: 13, color: C.mid }}>{c.product}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.dark }}>
                ₹{c.loanAmt.toLocaleString("en-IN")}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ ...agentStyles.statusPill, background: sc.bg, color: sc.color }}>
                  {sc.label || c.status}
                </span>
                {c.status === "in-queue" && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    Pos #{c.queuePos} • {c.waitMins}min
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                {c.status === "in-queue" && (
                  <button style={agentStyles.acceptBtn} onClick={() => onAccept(c)}>
                    Accept →
                  </button>
                )}
                {c.status === "hold" && (
                  <button style={{ ...agentStyles.acceptBtn, background: "#7c3aed" }} onClick={() => onAccept(c)}>
                    Resume →
                  </button>
                )}
                {(c.status === "approved" || c.status === "rejected" || c.status === "escalated" || c.status === "in-progress") && (
                  <span style={{ fontSize: 12, color: c.status === "escalated" ? "#7c3aed" : C.muted }}>
                    {c.status === "in-progress" ? "Active" : c.status === "escalated" ? "⚠ Deviation Raised" : "Done"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SESSION VIEW ─────────────────────────────────────────────────────────────
function SessionView({
  case_, sessionId, sessionState, videoRef, agentVideoRef,
  timerLabel, micOn, setMicOn, camOn, setCamOn,
  liveness, livenessRunning, livenessPrompt, livenessAttempt, livenessConfirmed, onRunLiveness,
  matchScores, panFront, panBack, ocrData, ocrRunning,
  onCaptureID, onRunOCR, remarks, setRemarks, decision, onDecision,
  onReconnect, spokenCode, codeVerified, setCodeVerified, codeAttempts, codeMaxRetry, setCodeMaxRetry, onGenerateCode,
  questionnaire, setQuestionnaire, signatureImg, onCaptureSignature,
  chatMessages, chatInput, setChatInput, onSendChat, chatEndRef,
}) {
  const [activeRightTab, setActiveRightTab] = useState("app"); // 'app' | 'code' | 'questionnaire' | 'pan' | 'ocr' | 'signature'

  return (
    <div style={agentStyles.sessionWrap}>
      {/* ── LEFT: Video + Controls ── */}
      <div style={agentStyles.leftCol}>

        {/* Customer video */}
        <div style={agentStyles.videoBox}>
          <div style={agentStyles.videoLabel}>
            <span style={{ ...agentStyles.recDotSm, background: sessionState === "live" ? C.success : C.warning }} />
            {case_.name} {sessionState === "live" ? "• LIVE" : sessionState === "connecting" ? "• Connecting..." : "• Reconnecting..."}
          </div>

          {/* Simulated customer feed */}
          <div style={agentStyles.custVideoArea}>
            <div style={agentStyles.custVideoInner}>
              <div style={{ fontSize: 56 }}>👤</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginTop: 8 }}>
                {case_.name}
              </div>
              <div style={{ fontSize: 11, color: C.light, marginTop: 4 }}>
                📍 {case_.geo.city}
              </div>
              <div style={{ fontSize: 11, color: "#4ade80", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ ...agentStyles.recDotSm, background: "#4ade80" }} />
                Simulated Feed — Live
              </div>
            </div>
          </div>

          {/* Agent's self-view PiP */}
          <div style={agentStyles.pipWrap}>
            <video ref={agentVideoRef} autoPlay muted playsInline style={agentStyles.pipVideo} />
            <div style={{ position: "absolute", bottom: 4, left: 4, fontSize: 9, color: C.white, fontWeight: 700 }}>
              YOU
            </div>
          </div>

          {/* Timer overlay */}
          {sessionState === "live" && (
            <div style={agentStyles.timerOverlay}>
              <span style={agentStyles.recDotSm} />
              {timerLabel()}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={agentStyles.controls}>
          <ControlBtn
            icon={micOn ? "🎤" : "🔇"}
            label={micOn ? "Mute" : "Unmute"}
            active={!micOn}
            onClick={() => setMicOn(!micOn)}
          />
          <ControlBtn
            icon={camOn ? "📷" : "📵"}
            label={camOn ? "Camera" : "Cam Off"}
            active={!camOn}
            onClick={() => setCamOn(!camOn)}
          />
          <ControlBtn icon="🔄" label="Flip" onClick={() => {}} />
          <ControlBtn icon="📸" label="Screenshot" onClick={() => {}} />
          {(sessionState === "idle" || sessionState === "ended") && (
            <ControlBtn icon="📞" label="Reconnect" highlight onClick={onReconnect} />
          )}
          {sessionState === "live" && (
            <ControlBtn icon="📵" label="Disconnect" danger onClick={() => {}} />
          )}
        </div>

        {/* Geo Location */}
        <div style={agentStyles.geoBox}>
          <div style={agentStyles.geoTitle}>📍 Customer Geo Location</div>
          <div style={agentStyles.geoContent}>
            <div style={agentStyles.geoMapPlaceholder}>
              <div style={{ fontSize: 28 }}>🗺️</div>
              <div style={{ fontSize: 11, color: C.white, marginTop: 6 }}>{case_.geo.city}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.mid }}>
                <strong>Lat:</strong> {case_.geo.lat}
              </div>
              <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>
                <strong>Lng:</strong> {case_.geo.lng}
              </div>
              <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>
                <strong>City:</strong> {case_.geo.city}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 11, background: "#dcfce7", color: C.success, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
                  ✓ Location Verified
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div style={agentStyles.chatBox}>
          <div style={agentStyles.geoTitle}>💬 Session Chat</div>
          <div style={agentStyles.chatMessages}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{
                ...agentStyles.chatMsg,
                alignSelf: m.type === "agent" ? "flex-end" : "flex-start",
                background: m.type === "agent" ? C.primary : m.type === "system" ? C.bg : C.bg,
                color: m.type === "agent" ? C.white : m.type === "system" ? C.muted : C.dark,
                fontStyle: m.type === "system" ? "italic" : "normal",
              }}>
                <div style={{ fontSize: 12 }}>{m.msg}</div>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2, textAlign: "right" }}>{m.time}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={agentStyles.chatInputRow}>
            <input
              style={agentStyles.chatInput}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => e.key === "Enter" && onSendChat()}
            />
            <button style={agentStyles.chatSendBtn} onClick={onSendChat}>Send</button>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Data Panel ── */}
      <div style={agentStyles.rightCol}>
        {/* Reconnect banner */}
        {sessionState === "reconnecting" && (
          <div style={agentStyles.reconnectBanner}>
            <span style={agentStyles.spinnerSm} />
            Reconnecting to session...
          </div>
        )}
        {sessionState === "connecting" && (
          <div style={{ ...agentStyles.reconnectBanner, background: "#dbeafe", color: "#1d4ed8" }}>
            <span style={{ ...agentStyles.spinnerSm, borderTopColor: "#1d4ed8" }} />
            Connecting to customer...
          </div>
        )}

        {/* Liveness + Match row */}
        <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.bg}` }}>
          <div style={{ ...agentStyles.panelSection, flex:1, borderBottom:"none", borderRight:`1px solid ${C.bg}` }}>
            <div style={agentStyles.panelTitle}>🔍 Liveness Verification</div>

            {/* ── Pre-check result card ── */}
            {case_.preCheckLiveness ? (
              <div style={{
                borderRadius: 8, padding: "10px 12px", marginBottom: 10,
                background: case_.preCheckLiveness.passed ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${case_.preCheckLiveness.passed ? "#86efac" : "#fca5a5"}`,
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: case_.preCheckLiveness.passed ? C.success : C.error }}>
                    {case_.preCheckLiveness.passed ? "✅ Pre-check Passed" : "❌ Pre-check Failed"}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: case_.preCheckLiveness.passed ? C.success : C.error }}>
                    {case_.preCheckLiveness.score}%
                  </span>
                </div>
                <div style={agentStyles.progressBg}>
                  <div style={{ ...agentStyles.progressFill, width:`${case_.preCheckLiveness.score}%`, background: case_.preCheckLiveness.passed ? C.success : C.error }} />
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize: 10, color: C.muted, marginTop: 5 }}>
                  <span>{case_.preCheckLiveness.method}</span>
                  <span>@ {case_.preCheckLiveness.timestamp}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, padding:"8px 10px", background: C.bg, borderRadius: 7 }}>
                ⚠ No pre-check result available
              </div>
            )}

            {/* ── Live confirmation separator ── */}
            <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 8 }}>
              <div style={{ flex:1, height:1, background: C.light }} />
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, whiteSpace:"nowrap" }}>
                {livenessAttempt === 0 ? "LIVE CONFIRMATION" : `RE-RUN #${livenessAttempt}`}
              </span>
              <div style={{ flex:1, height:1, background: C.light }} />
            </div>

            {/* ── Live check rows ── */}
            {["face", "blink", "smile", "turn"].map((c) => {
              const labels = { face: "Face Detection", blink: "Blink", smile: "Smile", turn: "Head Turn" };
              return (
                <div key={c} style={agentStyles.livenessRow}>
                  <span style={{ fontSize: 12 }}>{labels[c]}</span>
                  <LivenessBadge status={liveness[c]} />
                </div>
              );
            })}

            {/* ── Prompt hint ── */}
            {livenessPrompt && (
              <div style={agentStyles.livenessHint}>{livenessPrompt}</div>
            )}

            {/* ── Confirmed badge ── */}
            {livenessConfirmed && !livenessRunning && (
              <div style={{ margin:"8px 0", padding:"7px 10px", background:"#dcfce7", borderRadius:7, fontSize:11, fontWeight:700, color:C.success, textAlign:"center" }}>
                ✅ Live Liveness Confirmed
              </div>
            )}

            {/* ── Run / Re-run buttons ── */}
            <div style={{ display:"flex", gap:6, marginTop: 6 }}>
              {livenessAttempt === 0 ? (
                <button
                  style={{ ...agentStyles.btnSm, flex:1, opacity: livenessRunning || sessionState !== "live" ? 0.5 : 1 }}
                  disabled={livenessRunning || sessionState !== "live"}
                  onClick={onRunLiveness}
                >
                  {livenessRunning ? "⏳ Running..." : "▶ Run Live Check"}
                </button>
              ) : (
                <>
                  <button
                    style={{ ...agentStyles.btnSm, flex:1, opacity: livenessRunning || sessionState !== "live" ? 0.5 : 1 }}
                    disabled={livenessRunning || sessionState !== "live"}
                    onClick={onRunLiveness}
                  >
                    {livenessRunning ? "⏳ Running..." : "🔄 Re-run Check"}
                  </button>
                </>
              )}
            </div>
            {livenessAttempt > 0 && !livenessRunning && (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 5, textAlign:"center" }}>
                {livenessAttempt} run{livenessAttempt > 1 ? "s" : ""} completed
              </div>
            )}
          </div>
          <div style={{ ...agentStyles.panelSection, flex:1, borderBottom:"none" }}>
            <div style={agentStyles.panelTitle}>📊 Match Scores</div>
            {[
              { key: "name", label: "Name Match" },
              { key: "face", label: "Face Match" },
              { key: "location", label: "Location Match" },
              { key: "pan", label: "PAN Match" },
            ].map((m) => {
              const score = matchScores[m.key];
              const pct = score || 0;
              const color = pct >= 90 ? C.success : pct >= 75 ? C.warning : C.error;
              return (
                <div key={m.key} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: C.mid }}>{m.label}</span>
                    <span style={{ fontWeight: 700, color: score ? color : C.muted }}>
                      {score ? `${score}%` : "—"}
                    </span>
                  </div>
                  <div style={agentStyles.progressBg}>
                    <div style={{ ...agentStyles.progressFill, width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
            {/* Pre-check liveness score from applicant side */}
            {case_.preCheckLiveness && (
              <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: case_.preCheckLiveness.passed ? "#f0fdf4" : "#fef2f2", border: `1px solid ${case_.preCheckLiveness.passed ? "#86efac" : "#fca5a5"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: C.mid, fontWeight: 600 }}>Pre-session Liveness</span>
                  <span style={{ fontWeight: 700, color: case_.preCheckLiveness.passed ? C.success : C.error }}>
                    {case_.preCheckLiveness.score}%
                  </span>
                </div>
                <div style={agentStyles.progressBg}>
                  <div style={{ ...agentStyles.progressFill, width: `${case_.preCheckLiveness.score}%`, background: case_.preCheckLiveness.passed ? C.success : C.error }} />
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 5, display: "flex", justifyContent: "space-between" }}>
                  <span>{case_.preCheckLiveness.method}</span>
                  <span>@ {case_.preCheckLiveness.timestamp}</span>
                </div>
              </div>
            )}
          </div>
        </div>{/* end liveness+match row */}

        {/* Tabs */}
        <div style={agentStyles.rightTabs}>
          {[
            { id: "app",       label: "Application" },
            { id: "code",      label: "🎤 Code" },
            { id: "pan",       label: "ID Capture" },
            { id: "ocr",       label: "OCR Data" },
            { id: "signature", label: "✍️ Sign" },
          ].map((t) => (
            <button
              key={t.id}
              style={{
                ...agentStyles.tabBtn,
                borderBottom: activeRightTab === t.id ? `3px solid ${C.primary}` : "3px solid transparent",
                color: activeRightTab === t.id ? C.primary : C.muted,
                fontWeight: activeRightTab === t.id ? 700 : 500,
              }}
              onClick={() => setActiveRightTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={agentStyles.rightScrollable}>

        {/* App File */}
        {activeRightTab === "app" && (
          <div style={agentStyles.panelSection}>
            <div style={agentStyles.appFile}>
              <div style={agentStyles.customerHeader}>
                <div style={agentStyles.avatar}>
                  {case_.name.split(" ").map((w) => w[0]).join("").substr(0, 2)}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>{case_.name}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{case_.mobile}</div>
                </div>
              </div>
              {[
                { k: "Application ID", v: case_.appId },
                { k: "Session ID", v: sessionId || "—" },
                { k: "Product", v: case_.product },
                { k: "Loan Amount", v: `₹${case_.loanAmt.toLocaleString("en-IN")}` },
                { k: "EMI", v: case_.emi ? `₹${case_.emi.toLocaleString("en-IN")}/mo` : "N/A" },
                { k: "PAN", v: case_.pan },
                { k: "Date of Birth", v: case_.dob },
                { k: "Father's Name", v: case_.fatherName },
                { k: "Address", v: case_.address },
                { k: "Aadhaar eKYC", v: case_.aadhaarDate },
                { k: "Appointment", v: case_.appointmentId || "Walk-in" },
                { k: "Pre-check Liveness", v: case_.preCheckLiveness ? `${case_.preCheckLiveness.score}% — ${case_.preCheckLiveness.passed ? "PASS" : "FAIL"} (${case_.preCheckLiveness.method})` : "Not available" },
              ].map((r) => (
                <div key={r.k} style={agentStyles.appRow}>
                  <div style={agentStyles.appKey}>{r.k}</div>
                  <div style={agentStyles.appVal}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAN Capture */}
        {activeRightTab === "pan" && (
          <div style={agentStyles.panelSection}>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {["front", "back"].map((side) => {
                const img = side === "front" ? panFront : panBack;
                return (
                  <div key={side} style={{ flex: 1 }}>
                    <div style={agentStyles.panCapSlot}>
                      {img ? (
                        <img src={img} alt={`PAN ${side}`} style={{ width: "100%", borderRadius: 6 }} />
                      ) : (
                        <div style={{ textAlign: "center", color: C.muted, fontSize: 12 }}>
                          <div style={{ fontSize: 24 }}>📷</div>
                          <div>{side === "front" ? "Front" : "Back"}</div>
                        </div>
                      )}
                      {img && (
                        <div style={agentStyles.capturedBadge}>✓ Captured</div>
                      )}
                    </div>
                    <button
                      style={{ ...agentStyles.btnSm, width: "100%", marginTop: 8 }}
                      onClick={() => onCaptureID(side)}
                      disabled={sessionState !== "live"}
                    >
                      Capture {side === "front" ? "Front" : "Back"}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              style={{
                ...agentStyles.btnSm,
                width: "100%",
                opacity: panFront && panBack ? 1 : 0.5,
              }}
              disabled={!panFront || !panBack || ocrRunning}
              onClick={onRunOCR}
            >
              {ocrRunning ? "⏳ Running OCR..." : "🔍 Run OCR"}
            </button>
          </div>
        )}

        {/* OCR Data */}
        {activeRightTab === "ocr" && (
          <div style={agentStyles.panelSection}>
            {ocrData ? (
              <>
                <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, background: "#dcfce7", color: C.success, padding: "2px 10px", borderRadius: 10, fontWeight: 700 }}>
                    ✓ OCR Complete — {(ocrData.confidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>
                {[
                  { label: "Name on PAN", value: ocrData.name },
                  { label: "PAN Number", value: ocrData.pan },
                  { label: "Date of Birth", value: ocrData.dob },
                  { label: "Father's Name", value: ocrData.fatherName },
                ].map((f) => (
                  <div key={f.label} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>
                      {f.label}
                    </div>
                    <input
                      style={agentStyles.ocrField}
                      defaultValue={f.value}
                    />
                  </div>
                ))}
              </>
            ) : (
              <div style={{ textAlign: "center", color: C.muted, padding: "32px 0", fontSize: 13 }}>
                Capture PAN card first, then run OCR
              </div>
            )}
          </div>
        )}

        {/* ── Spoken Code Tab ── */}
        {activeRightTab === "code" && (
          <div style={agentStyles.panelSection}>
            <div style={agentStyles.panelTitle}>🎤 Spoken Code Verification</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>
              Generate a random code and ask the customer to read it aloud. Verify when they do.
            </div>

            {/* Attempt tracker */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Attempts:</span>
              {[1, 2, 3].map(n => (
                <span key={n} style={{
                  width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800,
                  background: codeAttempts >= n ? (codeMaxRetry ? C.error : C.warning) : C.bg,
                  color: codeAttempts >= n ? C.white : C.muted,
                  border: `2px solid ${codeAttempts >= n ? (codeMaxRetry ? C.error : C.warning) : C.light}`,
                }}>{n}</span>
              ))}
              <span style={{ fontSize: 11, color: C.muted }}>{codeAttempts}/3 used</span>
            </div>

            {/* Generate button — disabled after 3 attempts or if verified/maxretry */}
            {!codeVerified && !codeMaxRetry && (
              <button
                style={{ ...agentStyles.btnSm, width: "100%", marginBottom: 14, opacity: codeAttempts >= 3 ? 0.4 : 1 }}
                disabled={codeAttempts >= 3}
                onClick={onGenerateCode}
              >
                🔄 {codeAttempts === 0 ? "Generate Code" : "Generate New Code"}
              </button>
            )}

            {spokenCode && !codeMaxRetry && (
              <>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: C.mid }}>
                  Code for customer (attempt {codeAttempts}/3):
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
                  {spokenCode.split("").map((ch, i) => (
                    <span key={i} style={{ width: 38, height: 46, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: C.primary, background: `${C.primary}12`, border: `2px solid ${C.light}`, borderRadius: 8, fontFamily: "monospace" }}>{ch}</span>
                  ))}
                </div>

                {!codeVerified && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button
                      style={{ ...agentStyles.btnSm, width: "100%", background: C.success, color: C.white, border: "none" }}
                      onClick={() => { setCodeVerified(true); }}
                    >
                      ✅ Mark Code as Verified
                    </button>
                    {codeAttempts >= 3 && (
                      <button
                        style={{ ...agentStyles.btnSm, width: "100%", background: C.error, color: C.white, border: "none" }}
                        onClick={() => { setCodeMaxRetry(true); }}
                      >
                        ⛔ Maximum Retry Exceeded
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Verified state */}
            {codeVerified && (
              <div style={{ textAlign: "center", padding: "12px", background: "#dcfce7", borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.success }}>
                ✅ Code Verified Successfully
              </div>
            )}

            {/* Max retry exceeded state */}
            {codeMaxRetry && (
              <div style={{ textAlign: "center", padding: "14px", background: "#fee2e2", borderRadius: 8, border: `1px solid #fca5a5` }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>⛔</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.error }}>Maximum Retry Exceeded</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                  Customer failed to verify spoken code after 3 attempts. Please proceed to rejection or escalate.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Signature Tab ── */}
        {activeRightTab === "signature" && (
          <div style={agentStyles.panelSection}>
            <div style={agentStyles.panelTitle}>✍️ Customer Signature Capture</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
              Ask the customer to hold a signed blank paper clearly to the camera. Capture when signature is visible and clear.
            </div>
            <div style={agentStyles.panCapSlot}>
              {signatureImg ? (
                <>
                  <img src={signatureImg} alt="Signature" style={{ width: "100%", borderRadius: 6 }} />
                  <div style={agentStyles.capturedBadge}>✓ Captured</div>
                </>
              ) : (
                <div style={{ textAlign: "center", color: C.muted, fontSize: 12 }}>
                  <div style={{ fontSize: 32 }}>✍️</div>
                  <div>No signature captured yet</div>
                </div>
              )}
            </div>
            <button style={{ ...agentStyles.btnSm, width: "100%", marginTop: 10 }}
              onClick={onCaptureSignature} disabled={sessionState !== "live"}>
              📸 Capture Signature
            </button>
            {signatureImg && (
              <button style={{ ...agentStyles.btnSm, width: "100%", marginTop: 8, background: C.bg, color: C.mid, border: `1px solid ${C.light}` }}
                onClick={() => { setSignatureImg && onCaptureSignature(); }}>
                🔄 Recapture
              </button>
            )}
          </div>
        )}

        </div>{/* end rightScrollable */}

        {/* Decision */}
        {!decision ? (
          <div style={agentStyles.decisionSection}>
            <div style={agentStyles.panelTitle}>⚖️ Agent Decision</div>
            <textarea
              style={agentStyles.remarksField}
              placeholder="Enter remarks (required for rejection / escalation)..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...agentStyles.approveBtn, flex: 1 }}
                onClick={() => onDecision("approve")}
                disabled={sessionState !== "live"}
              >
                ✓ Approve
              </button>
              <button
                style={{ ...agentStyles.rejectBtn, flex: 1 }}
                onClick={() => onDecision("reject")}
                disabled={sessionState !== "live"}
              >
                ✗ Reject
              </button>
              <button
                style={{ ...agentStyles.escalateBtn, flex: 1 }}
                onClick={() => onDecision("escalate")}
                disabled={sessionState !== "live"}
              >
                ⚠ Escalate
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            ...agentStyles.decisionSection,
            background: decision === "approve" ? "#dcfce7" : decision === "escalate" ? "#f3e8ff" : "#fee2e2",
            borderColor: decision === "approve" ? "#86efac" : decision === "escalate" ? "#c4b5fd" : "#fca5a5",
          }}>
            <div style={{ fontSize: 24, textAlign: "center" }}>
              {decision === "approve" ? "✅" : decision === "escalate" ? "⚠️" : "❌"}
            </div>
            <div style={{ textAlign: "center", fontWeight: 800, fontSize: 16, color: decision === "approve" ? C.success : decision === "escalate" ? "#7c3aed" : C.error, marginTop: 8 }}>
              {decision === "approve" ? "KYC Approved" : decision === "escalate" ? "Deviation Raised" : "KYC Rejected"}
            </div>
            {decision === "escalate" && (
              <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
                Case has been escalated for supervisor review. Deviation recorded on dashboard.
              </div>
            )}
            {remarks && (
              <div style={{ fontSize: 12, color: C.mid, marginTop: 8, textAlign: "center" }}>
                Remarks: {remarks}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CHECKLIST SIDEBAR ── */}
      <div style={agentStyles.checklistCol}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.light}`, background: `${C.primary}08`, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.primary, textTransform: "uppercase", letterSpacing: 0.7 }}>
            ✅ Checklist
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            Verify verbally with customer
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {[
            { id: "q1", q: "Full Name", hint: "Ask customer to state their full name" },
            { id: "q2", q: "Address & Pincode", hint: "Ask for complete address including pincode" },
            { id: "q3", q: "Date of Birth", hint: "Ask customer to state their date of birth" },
            { id: "q4", q: "Registered Mobile", hint: "Ask customer to confirm their mobile number" },
          ].map((item) => {
            const val = questionnaire[item.id];
            return (
              <div key={item.id} style={{
                marginBottom: 10, padding: "10px 10px", borderRadius: 8,
                background: val === "Confirmed" ? "#f0fdf4" : val === "Mismatch" ? "#fef2f2" : C.bg,
                border: `1px solid ${val === "Confirmed" ? "#86efac" : val === "Mismatch" ? "#fca5a5" : C.light}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 2 }}>{item.q}</div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8, lineHeight: 1.4 }}>{item.hint}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["Confirmed", "Mismatch", "N/A"].map((opt) => (
                    <button key={opt} style={{
                      flex: 1, padding: "4px 2px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
                      background: val === opt ? (opt === "Confirmed" ? C.success : opt === "Mismatch" ? C.error : C.warning) : C.white,
                      color: val === opt ? C.white : C.mid,
                      border: `1.5px solid ${val === opt ? (opt === "Confirmed" ? C.success : opt === "Mismatch" ? C.error : C.warning) : C.light}`,
                    }}
                    onClick={() => setQuestionnaire(prev => ({ ...prev, [item.id]: opt }))}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4, textAlign: "center" }}>
            {Object.keys(questionnaire).length}/4 verified
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function ControlBtn({ icon, label, active, danger, highlight, onClick }) {
  return (
    <button
      style={{
        ...agentStyles.ctrlBtn,
        background: danger ? C.error : active ? "#374151" : C.panel,
        border: `1px solid ${danger ? C.error : active ? "#4b5563" : C.light}`,
        color: danger || active ? C.white : C.dark,
      }}
      onClick={onClick}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 10, marginTop: 2 }}>{label}</span>
    </button>
  );
}

function LivenessBadge({ status }) {
  const map = {
    pending: { bg: C.bg, color: C.muted, label: "—" },
    checking: { bg: "#dbeafe", color: "#1d4ed8", label: "⏳" },
    pass: { bg: "#dcfce7", color: C.success, label: "✓" },
    fail: { bg: "#fee2e2", color: C.error, label: "✗" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ padding: "2px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ─── AGENT STYLES ─────────────────────────────────────────────────────────────
const agentStyles = {
  root: {
    minHeight: "100vh",
    background: C.bg,
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
    color: C.dark,
  },
  header: {
    background: C.primary,
    position: "sticky",
    top: 0,
    zIndex: 100,
    boxShadow: "0 2px 12px rgba(7,73,148,0.3)",
  },
  headerInner: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoMark: {
    width: 38, height: 38, borderRadius: 9, background: C.secondary,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 1,
  },
  sessionBadge: {
    display: "flex", alignItems: "center", gap: 7,
    background: "rgba(255,255,255,0.15)", padding: "6px 14px", borderRadius: 20,
  },
  recDotSm: {
    display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.error,
  },
  agentBadge: { display: "flex", alignItems: "center", gap: 10 },
  agentAvatar: {
    width: 36, height: 36, borderRadius: "50%", background: C.secondary,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 800, color: C.white,
  },
  backBtn: {
    background: "rgba(255,255,255,0.15)", color: C.white, border: "none",
    padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  dashWrap: { maxWidth: 1400, margin: "0 auto", padding: "20px 16px" },
  statsRow: { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" },
  statCard: {
    flex: "1 1 120px", padding: "16px 20px", borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  filterRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  filterBtn: {
    padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: "pointer", display: "flex", alignItems: "center", gap: 2,
  },
  caseTable: {
    background: C.white, borderRadius: 12,
    border: `1px solid ${C.light}`, overflow: "hidden",
  },
  tableHeader: {
    display: "flex", padding: "12px 20px", background: C.primary,
    color: C.white, fontSize: 12, fontWeight: 700,
  },
  tableRow: {
    display: "flex", padding: "14px 20px", borderBottom: `1px solid ${C.bg}`,
    alignItems: "center", transition: "background 0.15s",
  },
  statusPill: { padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700 },
  acceptBtn: {
    background: C.primary, color: C.white, border: "none",
    padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  sessionWrap: {
    maxWidth: 1600, margin: "0 auto", padding: "12px 16px",
    display: "flex", gap: 12, alignItems: "stretch",
    height: "calc(100vh - 60px)",
    overflow: "hidden",
  },
  leftCol: {
    flex: "0 0 320px", display: "flex", flexDirection: "column", gap: 10,
    overflowY: "auto", paddingRight: 2,
  },
  rightCol: {
    flex: 1, background: C.white, borderRadius: 12,
    border: `1px solid ${C.light}`, padding: 0,
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  checklistCol: {
    flex: "0 0 260px", background: C.white, borderRadius: 12,
    border: `1px solid ${C.light}`, display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  videoBox: {
    position: "relative", borderRadius: 12, overflow: "hidden",
    background: "#111827", border: `3px solid ${C.primary}`, height: 260, flexShrink: 0,
  },
  videoLabel: {
    position: "absolute", top: 10, left: 10, zIndex: 10,
    background: "rgba(7,73,148,0.85)", color: C.white,
    fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 12,
    display: "flex", alignItems: "center", gap: 6,
  },
  custVideoArea: { width: "100%", height: "100%" },
  custVideoInner: {
    width: "100%", height: "100%", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #0f1f3d, #162444)",
  },
  pipWrap: {
    position: "absolute", bottom: 10, right: 10, width: 90, height: 70,
    borderRadius: 8, overflow: "hidden", border: `2px solid ${C.primary}`,
    background: "#111",
  },
  pipVideo: { width: "100%", height: "100%", objectFit: "cover" },
  timerOverlay: {
    position: "absolute", top: 10, right: 10,
    background: C.error, color: C.white, fontSize: 12, fontWeight: 800,
    padding: "4px 10px", borderRadius: 8,
    display: "flex", alignItems: "center", gap: 6,
  },
  controls: { display: "flex", gap: 8, flexWrap: "wrap" },
  ctrlBtn: {
    flex: "1 1 60px", padding: "10px 6px", borderRadius: 10, cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 11,
  },
  geoBox: {
    background: C.white, borderRadius: 10, padding: 14,
    border: `1px solid ${C.light}`,
  },
  geoTitle: { fontSize: 12, fontWeight: 700, color: C.primary, marginBottom: 10 },
  geoContent: { display: "flex", gap: 12, alignItems: "flex-start" },
  geoMapPlaceholder: {
    width: 80, height: 70, background: "linear-gradient(135deg, #0f2d4f, #1a4a8a)",
    borderRadius: 8, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  chatBox: {
    background: C.white, borderRadius: 10, border: `1px solid ${C.light}`,
    overflow: "hidden",
  },
  chatMessages: {
    padding: "10px 12px", height: 120, overflowY: "auto",
    display: "flex", flexDirection: "column", gap: 6,
  },
  chatMsg: {
    maxWidth: "85%", padding: "6px 10px", borderRadius: 10, fontSize: 12,
  },
  chatInputRow: { display: "flex", borderTop: `1px solid ${C.light}` },
  chatInput: {
    flex: 1, border: "none", padding: "10px 12px", fontSize: 12, outline: "none",
  },
  chatSendBtn: {
    padding: "10px 16px", background: C.primary, color: C.white,
    border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  reconnectBanner: {
    display: "flex", alignItems: "center", gap: 10,
    background: "#fef3c7", color: "#92400e", padding: "10px 16px", fontSize: 13, fontWeight: 600,
  },
  spinnerSm: {
    display: "inline-block", width: 18, height: 18, borderRadius: "50%",
    border: "3px solid rgba(0,0,0,0.1)", borderTopColor: "#92400e",
    animation: "spin 0.8s linear infinite",
  },
  panelSection: {
    padding: "16px", borderBottom: `1px solid ${C.bg}`,
  },
  panelTitle: {
    fontSize: 12, fontWeight: 800, color: C.primary, textTransform: "uppercase",
    letterSpacing: 0.7, marginBottom: 12,
  },
  livenessRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 10px", background: C.bg, borderRadius: 7, marginBottom: 6, fontSize: 12,
  },
  livenessHint: {
    background: `${C.primary}10`, border: `1px solid ${C.light}`,
    borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.primary,
    fontWeight: 600, marginTop: 8,
  },
  btnSm: {
    padding: "8px 14px", background: C.primary, color: C.white, border: "none",
    borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  },
  progressBg: { height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, transition: "width 0.5s ease" },
  rightTabs: { display: "flex", borderBottom: `1px solid ${C.light}`, flexShrink: 0 },
  rightScrollable: { flex: 1, overflowY: "auto" },
  tabBtn: {
    flex: 1, padding: "12px 8px", background: "transparent", border: "none",
    cursor: "pointer", fontSize: 11, letterSpacing: 0.3,
  },
  appFile: {},
  customerHeader: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
    padding: "12px 14px", background: `${C.primary}08`,
    borderRadius: 10, border: `1px solid ${C.light}`,
  },
  avatar: {
    width: 44, height: 44, borderRadius: "50%", background: C.primary,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, fontWeight: 800, color: C.white, flexShrink: 0,
  },
  appRow: { display: "flex", marginBottom: 8, gap: 8 },
  appKey: { flex: "0 0 130px", fontSize: 12, color: C.muted, fontWeight: 600 },
  appVal: { flex: 1, fontSize: 12, color: C.dark, fontWeight: 600, wordBreak: "break-all" },
  panCapSlot: {
    height: 90, background: C.bg, borderRadius: 8, border: `2px dashed ${C.light}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    position: "relative", overflow: "hidden",
  },
  capturedBadge: {
    position: "absolute", bottom: 4, right: 4, background: C.success, color: C.white,
    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8,
  },
  ocrField: {
    width: "100%", border: `1px solid ${C.light}`, borderRadius: 7,
    padding: "8px 10px", fontSize: 13, color: C.dark, background: C.bg,
    outline: "none", boxSizing: "border-box",
  },
  decisionSection: {
    padding: 16, margin: 12, borderRadius: 12,
    border: `1px solid ${C.light}`, background: C.panel,
  },
  remarksField: {
    width: "100%", border: `1px solid ${C.light}`, borderRadius: 8,
    padding: "10px 12px", fontSize: 13, color: C.dark, resize: "vertical",
    outline: "none", marginBottom: 12, boxSizing: "border-box", fontFamily: "inherit",
  },
  approveBtn: {
    padding: "12px 20px", background: C.success, color: C.white, border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer",
  },
  rejectBtn: {
    padding: "12px 20px", background: C.error, color: C.white, border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer",
  },
  escalateBtn: {
    padding: "12px 20px", background: "#7c3aed", color: C.white, border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer",
  },
  toast: {
    position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
    color: C.white, padding: "12px 28px", borderRadius: 24, fontSize: 13, fontWeight: 600,
    zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", whiteSpace: "nowrap", maxWidth: "90vw",
  },
};
