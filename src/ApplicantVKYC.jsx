/**
 * ApplicantVKYC.jsx
 * Presentation Layer — Applicant / Customer Workflow
 *
 * RBI V-CIP Compliant Applicant Flow:
 * 1. System Pre-check & Prerequisites
 * 2. Consent Collection
 * 3. Aadhaar eKYC Verification Check (re-route if >3 days old)
 * 4. Queue Position / Schedule Appointment
 * 5. Live Session (4 passive sub-steps):
 *    a. Face Alignment — passive liveness, agent verifies
 *    b. Spoken Code   — random code displayed, applicant reads aloud
 *    c. PAN Display   — applicant shows card, agent captures
 *    d. Waiting       — agent reviews and submits KYC
 * 6. Complete — triggered by agent signal, call auto-disconnects, reference ID shown
 *
 * Key changes from v1:
 * - Liveness is fully PASSIVE — applicant just keeps face in oval, no button
 * - PAN: applicant shows card to camera; agent captures — no button on applicant side
 * - Spoken code: a random 6-char alphanumeric code is shown; applicant reads it aloud
 * - KYC submission is agent action; applicant waits with checklist
 * - Completion triggered by agent signal → overlay shown → call disconnects → reference ID
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── COLOR PALETTE ───────────────────────────────────────────────────────────
const COLORS = {
  primary:  "#074994",
  secondary:"#3067A6",
  light:    "#ACC2DB",
  bg:       "#E6E6EB",
  error:    "#900909",
  warning:  "#FFAA00",
  success:  "#16a34a",
  white:    "#ffffff",
  textDark: "#0f1f3d",
  textMid:  "#3a4a6b",
  textLight:"#6b7a99",
};

// ─── STEP DEFINITIONS ────────────────────────────────────────────────────────
const STEPS = [
  { id: "prechecks", label: "System Check", icon: "⚙️" },
  { id: "consent",   label: "Consent",      icon: "📋" },
  { id: "aadhaar",   label: "Aadhaar eKYC", icon: "🔐" },
  { id: "queue",     label: "Queue",        icon: "🕐" },
  { id: "live",      label: "Live Session", icon: "📹" },
  { id: "complete",  label: "Complete",     icon: "✅" },
];

const CONSENTS = [
  { id: "c1", text: "I consent to Video-based KYC as required by RBI regulations." },
  { id: "c2", text: "I allow the Bank/NBFC to record this video session for regulatory compliance and audit purposes." },
  { id: "c3", text: "I confirm that I am physically present and conducting this Video KYC of my own free will." },
  { id: "c4", text: "I consent to collection and processing of my biometric data (face image, liveness) for identity verification." },
  { id: "c5", text: "I confirm that there is no other person visible or audible in my surroundings during this session." },
  { id: "c6", text: "I consent to sharing of my location data for geo-tagging as required under RBI regulations." },
];

// Generate a random 6-char alphanumeric spoken code
function generateSpokenCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ApplicantVKYC() {
  const [step, setStep]                   = useState("prechecks");
  const [checks, setChecks]               = useState({ camera:"pending", microphone:"pending", internet:"pending", browser:"pending", location:"pending", liveness:"pending" });
  const [allChecksPass, setAllChecksPass] = useState(false);
  const [consents, setConsents]           = useState({});
  const [allConsented, setAllConsented]   = useState(false);
  const [aadhaarStatus, setAadhaarStatus] = useState(null);
  const [aadhaarLoading, setAadhaarLoading] = useState(false);
  const [otpSubStep, setOtpSubStep]         = useState("idle"); // idle | sending | sent | verifying | done
  const [otpValue, setOtpValue]             = useState("");
  const [mobileNumber, setMobileNumber]     = useState("");
  const [queuePos]                        = useState(4);
  const [waitMins]                        = useState(18);
  const [showSchedule, setShowSchedule]   = useState(false);
  const [selectedDate, setSelectedDate]   = useState(null);
  const [selectedSlot, setSelectedSlot]   = useState(null);
  const [appointmentBooked, setAppointmentBooked] = useState(null);

  // Live session
  const [liveSubStep, setLiveSubStep]     = useState("face"); // face | code | pan | waiting
  const [spokenCode]                      = useState(() => generateSpokenCode());
  const [codeConfirmed, setCodeConfirmed] = useState(false);
  const [panCaptured, setPanCaptured]     = useState(false);
  const [signatureCaptured, setSignatureCaptured] = useState(false);
  const [agentSignal, setAgentSignal]     = useState(null); // null | 'complete'
  const [referenceId, setReferenceId]     = useState(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [toast, setToast]                 = useState(null);

  // Pre-check liveness state
  const [livenessPreCheck, setLivenessPreCheck] = useState("idle"); // idle | opening | capturing | analysing | pass | fail
  const [livenessScore, setLivenessScore]       = useState(null);
  const [livenessFrame, setLivenessFrame]       = useState(null); // base64 captured frame
  const [livenessMethod]                        = useState("ISO-30107-3 Passive");

  const videoRef        = useRef(null);
  const streamRef       = useRef(null);
  const preCheckVideoRef = useRef(null);
  const preCheckStream  = useRef(null);

  // ── Toast ─────────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── System pre-checks ─────────────────────────────────────────────────────────
  useEffect(() => { if (step === "prechecks") runSystemChecks(); }, [step]);

  async function runSystemChecks() {
    await delay(400);
    setChecks(c => ({ ...c, browser: "checking" }));
    await delay(600);
    setChecks(c => ({ ...c, browser: !!navigator.mediaDevices && !!window.RTCPeerConnection ? "pass" : "fail" }));

    setChecks(c => ({ ...c, internet: "checking" }));
    await delay(700);
    setChecks(c => ({ ...c, internet: "pass" }));

    setChecks(c => ({ ...c, camera: "checking" }));
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach(t => t.stop());
      setChecks(c => ({ ...c, camera: "pass" }));
    } catch { setChecks(c => ({ ...c, camera: "fail" })); }

    setChecks(c => ({ ...c, microphone: "checking" }));
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      setChecks(c => ({ ...c, microphone: "pass" }));
    } catch { setChecks(c => ({ ...c, microphone: "fail" })); }

    setChecks(c => ({ ...c, location: "checking" }));
    try {
      await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
      setChecks(c => ({ ...c, location: "pass" }));
    } catch { setChecks(c => ({ ...c, location: "warn" })); }

    // Trigger liveness pre-check automatically after device checks
    setChecks(c => ({ ...c, liveness: "checking" }));
    await runLivenessPreCheck();
    setAllChecksPass(true);
  }

  // ── Pre-check Liveness ───────────────────────────────────────────────────────
  async function runLivenessPreCheck() {
    setLivenessPreCheck("opening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:"user", width:640, height:480 }, audio: false });
      preCheckStream.current = stream;
      if (preCheckVideoRef.current) {
        preCheckVideoRef.current.srcObject = stream;
        await preCheckVideoRef.current.play();
      }
      setLivenessPreCheck("capturing");
      await delay(3000); // 3s passive capture window

      // Capture frame from video
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d");
      if (preCheckVideoRef.current) ctx.drawImage(preCheckVideoRef.current, 0, 0);
      const frame = canvas.toDataURL("image/jpeg", 0.85);
      setLivenessFrame(frame);

      // Stop stream
      stream.getTracks().forEach(t => t.stop());
      preCheckStream.current = null;

      setLivenessPreCheck("analysing");
      await delay(2200); // Simulate SDK analysis (replace with real liveness SDK call)

      // Simulate result — score between 88–99 for pass, <70 for fail
      const score = Math.floor(Math.random() * 12) + 88; // 88-99 = pass in demo
      setLivenessScore(score);
      setLivenessPreCheck(score >= 75 ? "pass" : "fail");
      setChecks(c => ({ ...c, liveness: score >= 75 ? "pass" : "fail" }));
    } catch (e) {
      setLivenessPreCheck("fail");
      setChecks(c => ({ ...c, liveness: "fail" }));
    }
  }

  // ── Consent ───────────────────────────────────────────────────────────────────
  useEffect(() => { setAllConsented(CONSENTS.every(c => consents[c.id])); }, [consents]);

  // ── Aadhaar ───────────────────────────────────────────────────────────────────
  async function checkAadhaar(forceExpired = false) {
    setAadhaarLoading(true);
    setOtpSubStep("idle");
    setOtpValue("");
    await delay(2000);
    // In production: call POST /v1/vcip/aadhaar/verify-date
    // Toggle forceExpired=true to demo the expired OTP flow
    setAadhaarStatus(forceExpired ? "expired" : "valid");
    setAadhaarLoading(false);
  }

  async function sendOtp() {
    if (!mobileNumber || mobileNumber.length < 10) return;
    setOtpSubStep("sending");
    await delay(1500);
    setOtpSubStep("sent");
  }

  async function verifyOtp() {
    if (otpValue.length < 6) return;
    setOtpSubStep("verifying");
    await delay(2000);
    setOtpSubStep("done");
  }

  // ── Camera ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (step === "live") {
      startCamera();
      return () => stopCamera();
    }
  }, [step]);

  // Attach stream to video element when both are ready
  useEffect(() => {
    if (step === "live" && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 1280, height: 720 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      showToast("Camera access denied. Please allow camera permissions.", "error");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  // ── Session timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== "live") return;
    const t = setInterval(() => setSessionDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [step]);

  // ── Simulate agent progression (replace with WebSocket in production) ─────────
  useEffect(() => {
    if (step !== "live") return;

    // 5s → agent moves to spoken code step
    const t1 = setTimeout(() => setLiveSubStep("code"), 5000);
    // 13s → agent confirms code, moves to PAN display
    const t2 = setTimeout(() => { setCodeConfirmed(true); setLiveSubStep("pan"); }, 13000);
    // 21s → agent captures PAN, moves to signature
    const t3 = setTimeout(() => {
      setPanCaptured(true);
      setLiveSubStep("signature");
      showToast("Agent has captured your PAN card ✓", "success");
    }, 21000);
    // 29s → agent captures signature, moves to waiting
    const t4 = setTimeout(() => {
      setSignatureCaptured(true);
      setLiveSubStep("waiting");
      showToast("Agent has captured your signature ✓", "success");
    }, 29000);
    // 35s → agent submits, triggers completion
    const t5 = setTimeout(() => {
      const ref = "VKP-" + Math.random().toString(36).substr(2, 8).toUpperCase();
      setReferenceId(ref);
      setAgentSignal("complete");
      showToast("KYC completed! Disconnecting session…", "success");
      setTimeout(() => { stopCamera(); setStep("complete"); }, 2500);
    }, 35000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, [step]);

  // ── Slot helpers ──────────────────────────────────────────────────────────────
  function getNextWorkingDays(n) {
    const days = []; const d = new Date();
    while (days.length < n) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
    }
    return days;
  }
  function getTimeSlots() {
    return ["09:00","09:30","10:00","10:30","11:00","11:30","14:00","14:30","15:00","15:30","16:00"];
  }
  async function bookAppointment() {
    if (!selectedDate || !selectedSlot) { showToast("Please select a date and time slot", "error"); return; }
    await delay(1000);
    const aptId = "APT-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    setAppointmentBooked({ id: aptId, date: selectedDate, slot: selectedSlot });
    showToast(`Appointment confirmed! ID: ${aptId}`, "success");
  }

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      <div style={styles.bgMesh} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logoArea}>
            <div style={styles.logoMark}>
              <span style={{ color: COLORS.white, fontWeight: 800, fontSize: 18 }}>V</span>
              <span style={{ color: COLORS.warning, fontWeight: 800, fontSize: 18 }}>KYC</span>
            </div>
            <div>
              <div style={styles.logoTitle}>Video KYC</div>
              <div style={styles.logoSub}>RBI Regulated Video KYC</div>
            </div>
          </div>
          <div style={styles.secBadge}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <span style={{ fontSize: 11, color: COLORS.light }}>256-bit Encrypted Session</span>
          </div>
        </div>
      </header>

      {/* Progress */}
      <div style={styles.progressWrap}>
        <div style={styles.progressInner}>
          {STEPS.map((s, i) => {
            const idx = STEPS.findIndex(x => x.id === step);
            const isDone = i < idx, isActive = i === idx;
            return (
              <div key={s.id} style={styles.stepWrap}>
                <div style={{ ...styles.stepCircle, background: isDone ? COLORS.success : isActive ? COLORS.primary : COLORS.light, border: isActive ? `3px solid ${COLORS.warning}` : "3px solid transparent", transform: isActive ? "scale(1.15)" : "scale(1)", transition: "all 0.3s" }}>
                  {isDone ? "✓" : s.icon}
                </div>
                <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? COLORS.primary : isDone ? COLORS.success : COLORS.textLight, marginTop: 4, textAlign: "center", maxWidth: 64 }}>
                  {s.label}
                </div>
                {i < STEPS.length - 1 && <div style={{ ...styles.stepLine, background: isDone ? COLORS.success : COLORS.light }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main style={styles.main}>
        <div style={styles.card}>
          {step === "prechecks" && <PrechecksStep checks={checks} allPass={allChecksPass} livenessPreCheck={livenessPreCheck} livenessScore={livenessScore} preCheckVideoRef={preCheckVideoRef} onNext={() => setStep("consent")} />}
          {step === "consent"   && <ConsentStep consents={consents} setConsents={setConsents} allConsented={allConsented} onNext={() => { setStep("aadhaar"); checkAadhaar(); }} />}
          {step === "aadhaar"   && <AadhaarStep loading={aadhaarLoading} status={aadhaarStatus} onProceed={() => setStep("queue")} otpSubStep={otpSubStep} otpValue={otpValue} setOtpValue={setOtpValue} mobileNumber={mobileNumber} setMobileNumber={setMobileNumber} onSendOtp={sendOtp} onVerifyOtp={verifyOtp} onSimulateExpired={() => checkAadhaar(true)} />}
          {step === "queue"     && <QueueStep queuePos={queuePos} waitMins={waitMins} showSchedule={showSchedule} setShowSchedule={setShowSchedule} selectedDate={selectedDate} setSelectedDate={setSelectedDate} selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot} appointmentBooked={appointmentBooked} onBook={bookAppointment} onJoinNow={() => setStep("live")} getNextWorkingDays={getNextWorkingDays} getTimeSlots={getTimeSlots} />}
          {step === "live"      && <LiveSessionStep videoRef={videoRef} liveSubStep={liveSubStep} spokenCode={spokenCode} codeConfirmed={codeConfirmed} panCaptured={panCaptured} signatureCaptured={signatureCaptured} agentSignal={agentSignal} sessionDuration={sessionDuration} fmtTime={fmtTime} />}
          {step === "complete"  && <CompleteStep referenceId={referenceId} />}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ ...styles.toast, background: toast.type === "error" ? COLORS.error : toast.type === "success" ? COLORS.success : COLORS.primary }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── STEP: PRE-CHECKS ─────────────────────────────────────────────────────────
function PrechecksStep({ checks, allPass, livenessPreCheck, livenessScore, preCheckVideoRef, onNext }) {
  const items = [
    { id: "browser",    label: "Modern Browser (WebRTC Support)", icon: "🌐" },
    { id: "internet",   label: "Internet Connectivity",           icon: "📶" },
    { id: "camera",     label: "Camera Access",                   icon: "📷" },
    { id: "microphone", label: "Microphone Access",               icon: "🎤" },
    { id: "location",   label: "Location Permission",             icon: "📍" },
  ];

  const livenessStageLabel = {
    idle: "Waiting…", opening: "Opening camera…", capturing: "Capturing your face…",
    analysing: "Analysing…", pass: "Liveness Confirmed", fail: "Liveness Failed",
  }[livenessPreCheck] || "";

  const livenessColor = livenessPreCheck === "pass" ? COLORS.success : livenessPreCheck === "fail" ? COLORS.error : COLORS.secondary;

  return (
    <div>
      <StepHeader icon="⚙️" title="System Check & Prerequisites" subtitle="We're verifying your device is ready for Video KYC" />
      <div style={styles.noticeBox}>
        <div style={styles.noticeTitle}>📋 Before You Begin — Please Ensure:</div>
        <div style={styles.noticeList}>
          {["🪪  Keep your PAN card ready (physically in hand)", "💡  You are in a well-lit room with a plain background", "🔇  No other person is visible or audible on screen", "📵  No background noise is present", "👤  Only YOU should be visible in the camera frame", "🎤  You will be asked to say a random code aloud — speak clearly"].map((t, i) => <div key={i} style={styles.noticeItem}>{t}</div>)}
        </div>
      </div>

      {/* Liveness pre-check camera + status */}
      <div style={{ marginTop: 20, background: COLORS.bg, borderRadius: 12, padding: 16 }}>
        <div style={styles.sectionTitle}>Face Liveness Pre-check</div>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Live camera preview */}
          <div style={{ position: "relative", width: 200, height: 160, background: "#111", borderRadius: 10, overflow: "hidden", border: `2px solid ${livenessColor}`, flexShrink: 0 }}>
            <video ref={preCheckVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {/* Face oval overlay */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 90, height: 115, border: `2px dashed ${COLORS.warning}`, borderRadius: "50%", pointerEvents: "none" }} />
            {(livenessPreCheck === "pass" || livenessPreCheck === "fail") && (
              <div style={{ position: "absolute", inset: 0, background: livenessPreCheck === "pass" ? "rgba(22,163,74,0.7)" : "rgba(144,9,9,0.7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
                {livenessPreCheck === "pass" ? "✅" : "❌"}
              </div>
            )}
          </div>
          {/* Status panel */}
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: livenessColor, marginBottom: 8 }}>{livenessStageLabel}</div>
            {(livenessPreCheck === "capturing" || livenessPreCheck === "analysing") && (
              <div style={{ fontSize: 12, color: COLORS.textMid, lineHeight: 1.6, marginBottom: 10 }}>
                {livenessPreCheck === "capturing" ? "Please look straight at the camera. Keep still. Do not blink rapidly." : "Running liveness analysis on captured frames…"}
              </div>
            )}
            {/* Progress bar */}
            <div style={{ height: 6, background: COLORS.light, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", borderRadius: 3, background: livenessColor, transition: "width 0.5s", width: { idle:"0%", opening:"15%", capturing:"45%", analysing:"80%", pass:"100%", fail:"100%" }[livenessPreCheck] || "0%" }} />
            </div>
            {livenessPreCheck === "pass" && livenessScore && (
              <div style={{ fontSize: 12, color: COLORS.success, fontWeight: 600 }}>
                Score: <strong>{livenessScore}%</strong> &nbsp;·&nbsp; Method: ISO 30107-3 Passive<br />
                <span style={{ fontSize: 11, color: COLORS.textLight }}>Result will be shared with the KYC officer</span>
              </div>
            )}
            {livenessPreCheck === "fail" && (
              <div style={{ fontSize: 12, color: COLORS.error, fontWeight: 600, lineHeight: 1.5 }}>
                Liveness check failed. Please ensure you are in a well-lit environment with only your face visible and try again.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={styles.sectionTitle}>System Configuration Checks</div>
        <div style={styles.checkGrid}>
          {items.map(item => (
            <div key={item.id} style={styles.checkRow}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: COLORS.textMid }}>{item.label}</span>
              <CheckBadge status={checks[item.id]} />
            </div>
          ))}
          <div style={styles.checkRow}>
            <span style={{ fontSize: 20 }}>👁</span>
            <span style={{ flex: 1, fontSize: 13, color: COLORS.textMid }}>Face Liveness Pre-check</span>
            <CheckBadge status={checks.liveness || "pending"} />
          </div>
        </div>
      </div>
      <button style={{ ...styles.btnPrimary, opacity: allPass ? 1 : 0.5, cursor: allPass ? "pointer" : "not-allowed" }} disabled={!allPass} onClick={onNext}>
        All Checks Passed — Continue →
      </button>
    </div>
  );
}

// ─── STEP: CONSENT ────────────────────────────────────────────────────────────
function ConsentStep({ consents, setConsents, allConsented, onNext }) {
  return (
    <div>
      <StepHeader icon="📋" title="Consent for Video KYC" subtitle="Please read and accept all consents to proceed with your Video KYC" />
      <div style={styles.consentList}>
        {CONSENTS.map(c => (
          <div key={c.id} style={{ ...styles.consentItem, background: consents[c.id] ? "#f0fdf4" : COLORS.white, borderColor: consents[c.id] ? COLORS.success : COLORS.light }}>
            <input type="checkbox" checked={!!consents[c.id]} onChange={e => setConsents(p => ({ ...p, [c.id]: e.target.checked }))} style={{ width: 18, height: 18, accentColor: COLORS.primary, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: COLORS.textMid, lineHeight: 1.5 }}>{c.text}</span>
          </div>
        ))}
      </div>
      <div style={styles.rbiFooter}>By accepting, you confirm that this session will be recorded and stored as required by RBI regulations.</div>
      <button style={{ ...styles.btnPrimary, opacity: allConsented ? 1 : 0.5, cursor: allConsented ? "pointer" : "not-allowed" }} disabled={!allConsented} onClick={onNext}>Accept All & Continue →</button>
    </div>
  );
}

// ─── STEP: AADHAAR ────────────────────────────────────────────────────────────
function AadhaarStep({ loading, status, onProceed, otpSubStep, otpValue, setOtpValue, mobileNumber, setMobileNumber, onSendOtp, onVerifyOtp, onSimulateExpired }) {
  return (
    <div>
      <StepHeader icon="🔐" title="Aadhaar eKYC Verification" subtitle="Verifying your Aadhaar eKYC status as required by RBI regulations" />
      <div style={styles.aadhaarCard}>

        {/* Loading */}
        {loading && (
          <div style={styles.loadingArea}>
            <div style={styles.spinner} />
            <div style={{ marginTop: 16, color: COLORS.textMid, fontSize: 14 }}>Checking Aadhaar eKYC status…</div>
          </div>
        )}

        {/* Valid — proceed */}
        {!loading && status === "valid" && (
          <div style={styles.aadhaarValid}>
            <div style={{ fontSize: 48 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.success, marginTop: 12 }}>Aadhaar Verification Valid</div>
            <div style={{ fontSize: 13, color: COLORS.textMid, marginTop: 8 }}>Your Aadhaar verification is up to date. You may proceed with Video KYC.</div>
            <button style={{ ...styles.btnPrimary, marginTop: 24 }} onClick={onProceed}>Proceed to Queue →</button>
            {/* Demo toggle — remove in production */}
            <button style={{ ...styles.btnOutline, marginTop: 8, fontSize: 12, opacity: 0.6 }} onClick={onSimulateExpired}>
              🔁 Demo: Simulate Expired eKYC
            </button>
          </div>
        )}

        {/* Expired — OTP flow */}
        {!loading && status === "expired" && (
          <div>
            {/* Step indicator */}
            <div style={styles.otpStepBar}>
              {["Verification Required", "Enter Mobile", "Enter OTP", "Verified"].map((lbl, i) => {
                const stepIdx = { idle:0, sending:1, sent:2, verifying:2, done:3 }[otpSubStep] ?? 0;
                const done = i < stepIdx, active = i === stepIdx;
                return (
                  <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1 }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background: done?COLORS.success:active?COLORS.primary:COLORS.light, color:COLORS.white, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700 }}>
                      {done ? "✓" : i+1}
                    </div>
                    <div style={{ fontSize:10, color:active?COLORS.primary:done?COLORS.success:COLORS.textLight, marginTop:4, textAlign:"center", fontWeight: active?700:400 }}>{lbl}</div>
                  </div>
                );
              })}
            </div>

            {/* Sub-step: idle — explain */}
            {otpSubStep === "idle" && (
              <div style={styles.aadhaarExpired}>
                <div style={{ fontSize: 48 }}>⚠️</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.warning, marginTop: 12 }}>Fresh Verification Required</div>
                <div style={{ fontSize: 13, color: COLORS.textMid, marginTop: 8, lineHeight: 1.7 }}>
                  Your Aadhaar verification needs to be refreshed before you can proceed.<br />
                  We will send a one-time password (OTP) to your Aadhaar-linked mobile number.
                </div>
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, marginBottom: 8 }}>Enter your Aadhaar-linked mobile number</div>
                  <div style={{ display:"flex", gap:10 }}>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="10-digit mobile number"
                      value={mobileNumber}
                      onChange={e => setMobileNumber(e.target.value.replace(/\D/g,""))}
                      style={styles.otpInput}
                    />
                    <button
                      style={{ ...styles.btnPrimary, marginTop:0, width:"auto", padding:"0 20px", opacity: mobileNumber.length===10?1:0.5 }}
                      disabled={mobileNumber.length !== 10}
                      onClick={onSendOtp}
                    >
                      Send OTP
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-step: sending OTP */}
            {otpSubStep === "sending" && (
              <div style={styles.loadingArea}>
                <div style={styles.spinner} />
                <div style={{ marginTop: 14, color: COLORS.textMid, fontSize: 14 }}>Sending OTP to +91 ****{mobileNumber.slice(-4)}…</div>
              </div>
            )}

            {/* Sub-step: OTP sent — enter OTP */}
            {(otpSubStep === "sent" || otpSubStep === "verifying") && (
              <div style={styles.aadhaarValid}>
                <div style={{ fontSize: 40 }}>📱</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.primary, marginTop: 12 }}>OTP Sent</div>
                <div style={{ fontSize: 13, color: COLORS.textMid, marginTop: 6, lineHeight: 1.6 }}>
                  A 6-digit OTP has been sent to your Aadhaar-linked mobile ending in <strong>****{mobileNumber.slice(-4)}</strong>.<br />
                  Please enter it below.
                </div>
                <div style={{ marginTop: 20, display:"flex", gap:10, justifyContent:"center" }}>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otpValue}
                    onChange={e => setOtpValue(e.target.value.replace(/\D/g,""))}
                    style={{ ...styles.otpInput, textAlign:"center", fontSize:20, letterSpacing:8, width:180 }}
                  />
                </div>
                <button
                  style={{ ...styles.btnPrimary, marginTop: 16, opacity: otpValue.length===6&&otpSubStep!=="verifying"?1:0.5 }}
                  disabled={otpValue.length !== 6 || otpSubStep === "verifying"}
                  onClick={onVerifyOtp}
                >
                  {otpSubStep === "verifying" ? "⏳ Verifying…" : "Verify OTP →"}
                </button>
                <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 12 }}>
                  Didn't receive OTP? <span style={{ color: COLORS.primary, cursor:"pointer", fontWeight:600 }} onClick={onSendOtp}>Resend</span>
                </div>
              </div>
            )}

            {/* Sub-step: done */}
            {otpSubStep === "done" && (
              <div style={styles.aadhaarValid}>
                <div style={{ fontSize: 48 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.success, marginTop: 12 }}>Aadhaar Verified Successfully!</div>
                <div style={{ fontSize: 13, color: COLORS.textMid, marginTop: 8 }}>Your Aadhaar has been verified. You may now proceed with Video KYC.</div>
                <button style={{ ...styles.btnPrimary, marginTop: 24 }} onClick={onProceed}>Proceed to Queue →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STEP: QUEUE ──────────────────────────────────────────────────────────────
function QueueStep({ queuePos, waitMins, showSchedule, setShowSchedule, selectedDate, setSelectedDate, selectedSlot, setSelectedSlot, appointmentBooked, onBook, onJoinNow, getNextWorkingDays, getTimeSlots }) {
  const days = getNextWorkingDays(7);
  const slots = getTimeSlots();
  const headerIcon     = appointmentBooked ? "✅" : showSchedule ? "📅" : "🕐";
  const headerTitle    = appointmentBooked ? "Appointment Confirmed" : showSchedule ? "Schedule Appointment" : "Queue Status";
  const headerSubtitle = appointmentBooked ? "Your Video KYC appointment has been booked successfully" : showSchedule ? "Choose a convenient date and time for your Video KYC" : "Your current position in the Video KYC queue";
  return (
    <div>
      <StepHeader icon={headerIcon} title={headerTitle} subtitle={headerSubtitle} />
      {!appointmentBooked && !showSchedule && (
        <>
          <div style={styles.queueCard}>
            <div style={styles.queueBig}>{queuePos}</div>
            <div style={styles.queueLabel}>Your Queue Position</div>
            <div style={styles.queueWait}>⏱️ Estimated wait: <strong>{waitMins} minutes</strong></div>
            <div style={styles.queueMsg}>An agent will be with you shortly. Keep your camera and microphone ready, and have your PAN card in hand.</div>
          </div>
          <div style={styles.queueActions}>
            <button style={styles.btnPrimary} onClick={onJoinNow}>📹 Join Live Session Now</button>
            <button style={styles.btnOutline} onClick={() => setShowSchedule(true)}>📅 Schedule Appointment Later</button>
          </div>
        </>
      )}
      {showSchedule && !appointmentBooked && (
        <div style={styles.scheduleArea}>
          <div style={styles.sectionTitle}>Select a Date</div>
          <div style={styles.dateGrid}>
            {days.map(d => { const ds = d.toISOString().split("T")[0]; const label = d.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" }); return <div key={ds} style={{ ...styles.dateChip, background: selectedDate===ds?COLORS.primary:COLORS.white, color: selectedDate===ds?COLORS.white:COLORS.textDark, border:`2px solid ${selectedDate===ds?COLORS.primary:COLORS.light}` }} onClick={() => setSelectedDate(ds)}>{label}</div>; })}
          </div>
          {selectedDate && (<><div style={{ ...styles.sectionTitle, marginTop:20 }}>Select a Time Slot</div><div style={styles.slotGrid}>{slots.map(s => <div key={s} style={{ ...styles.slotChip, background:selectedSlot===s?COLORS.primary:COLORS.white, color:selectedSlot===s?COLORS.white:COLORS.textDark, border:`2px solid ${selectedSlot===s?COLORS.primary:COLORS.light}` }} onClick={() => setSelectedSlot(s)}>{s}</div>)}</div></>)}
          <div style={{ display:"flex", gap:12, marginTop:24 }}>
            <button style={{ ...styles.btnOutline, flex:1 }} onClick={() => setShowSchedule(false)}>← Back</button>
            <button style={{ ...styles.btnPrimary, flex:2, opacity:selectedDate&&selectedSlot?1:0.5 }} disabled={!selectedDate||!selectedSlot} onClick={onBook}>Confirm Appointment →</button>
          </div>
        </div>
      )}
      {appointmentBooked && (
        <div style={styles.aptConfirmed}>
          <div style={{ fontSize:40 }}>📅</div>
          <div style={styles.aptTitle}>Appointment Confirmed!</div>
          <div style={styles.aptId}>ID: {appointmentBooked.id}</div>
          <div style={styles.aptDetails}>
            <div>📆 {new Date(appointmentBooked.date+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
            <div>🕐 {appointmentBooked.slot}</div>
          </div>
          <div style={styles.aptNote}>You will receive an SMS/WhatsApp reminder before your scheduled time. Please be ready with your PAN card.</div>
        </div>
      )}
    </div>
  );
}

// ─── STEP: LIVE SESSION ───────────────────────────────────────────────────────
function LiveSessionStep({ videoRef, liveSubStep, spokenCode, codeConfirmed, panCaptured, signatureCaptured, agentSignal, sessionDuration, fmtTime }) {
  const subLabel = { face:"Face Alignment", code:"Spoken Code Verification", pan:"PAN Card Display", signature:"Signature Capture", waiting:"Awaiting Agent Submission" }[liveSubStep] || "";

  return (
    <div>
      <StepHeader icon="📹" title="Live Video Session" subtitle="You are connected with a KYC officer. Please follow the on-screen guidance." />

      {/* Session bar */}
      <div style={styles.sessionBar}>
        <div style={styles.recBadgeInline}><span style={styles.recDot} />LIVE</div>
        <div style={{ fontSize:13, color:COLORS.textMid, fontWeight:600 }}>Session: <span style={{ color:COLORS.primary }}>{fmtTime(sessionDuration)}</span></div>
        <div style={{ fontSize:12, color:COLORS.textLight }}>Step: <strong style={{ color:COLORS.primary }}>{subLabel}</strong></div>
      </div>

      <div style={styles.videoArea}>
        {/* Camera feed */}
        <div style={styles.videoFrame}>
          <video ref={videoRef} autoPlay muted playsInline style={styles.videoEl} />

          {/* Face oval — always shown */}
          <div style={styles.faceOval} />

          {/* PAN frame — only during pan sub-step */}
          {liveSubStep === "pan" && (
            <div style={styles.panFrameOverlay}>
              <div style={styles.panFrameLabel}>Show PAN Card Here</div>
            </div>
          )}

          {/* Disconnecting overlay */}
          {agentSignal === "complete" && (
            <div style={styles.disconnectOverlay}>
              <div style={{ fontSize:40 }}>✅</div>
              <div style={{ fontSize:16, fontWeight:700, color:COLORS.white, marginTop:8 }}>KYC Completed!</div>
              <div style={{ fontSize:12, color:COLORS.light, marginTop:4 }}>Disconnecting session…</div>
            </div>
          )}
        </div>

        {/* Instruction panel */}
        <div style={styles.instructionPanel}>

          {/* FACE sub-step */}
          {liveSubStep === "face" && (
            <>
              <div style={styles.instrTitle}>📸 Face Alignment</div>
              <div style={styles.instrBox}>
                {["👤 Place your face within the oval guide","💡 Ensure good lighting on your face","👁 Look directly at the camera","🚫 Keep only your face in the frame"].map((t,i)=><div key={i} style={styles.instrItem}>{t}</div>)}
              </div>
              <div style={styles.passiveBadge}>🔄 Liveness check is running automatically — no action needed from you</div>
              <div style={styles.agentNote}>An officer is watching and verifying your identity. Please hold still and look at the camera.</div>
            </>
          )}

          {/* CODE sub-step */}
          {liveSubStep === "code" && (
            <>
              <div style={styles.instrTitle}>🎤 Spoken Code Verification</div>
              <div style={styles.instrSubtitle}>Please say the following code clearly and loudly, one character at a time:</div>
              <div style={styles.spokenCodeBox}>
                {spokenCode.split("").map((ch, i) => <span key={i} style={styles.spokenCodeChar}>{ch}</span>)}
              </div>
              <div style={styles.instrBox}>
                {["🎤 Say each character clearly and slowly","🔊 Ensure no background noise","🔁 The officer may ask you to repeat if unclear"].map((t,i)=><div key={i} style={styles.instrItem}>{t}</div>)}
              </div>
              {codeConfirmed
                ? <div style={styles.codeConfirmedBadge}>✅ Code verified by officer!</div>
                : <div style={styles.passiveBadge}>⏳ Waiting for officer to confirm the spoken code…</div>
              }
            </>
          )}

          {/* PAN sub-step */}
          {liveSubStep === "pan" && (
            <>
              <div style={styles.instrTitle}>🪪 PAN Card Display</div>
              <div style={styles.instrSubtitle}>Hold your PAN card within the dashed yellow frame shown on camera.</div>
              <div style={styles.instrBox}>
                {["🪪 Hold the card flat and steady","💡 Ensure all text is clearly readable","📐 Align within the yellow dashed frame","🚫 Do not cover any part of the card","📸 The officer will capture the image — no action needed from you"].map((t,i)=><div key={i} style={styles.instrItem}>{t}</div>)}
              </div>
              {panCaptured
                ? <div style={styles.codeConfirmedBadge}>✅ PAN card captured by officer!</div>
                : <div style={styles.passiveBadge}>⏳ Waiting for officer to capture PAN card image…</div>
              }
            </>
          )}

          {/* SIGNATURE sub-step */}
          {liveSubStep === "signature" && (
            <>
              <div style={styles.instrTitle}>✍️ Signature on Paper</div>
              <div style={styles.instrSubtitle}>Please sign your name on a blank white paper and hold it clearly to the camera.</div>
              <div style={styles.instrBox}>
                {["✍️ Sign on a blank white sheet of paper","💡 Ensure your signature is clearly visible","📄 Hold the paper flat and steady to the camera","🚫 Do not cover the signature with your fingers","📸 The officer will capture it — no action needed from you"].map((t,i)=><div key={i} style={styles.instrItem}>{t}</div>)}
              </div>
              {signatureCaptured
                ? <div style={styles.codeConfirmedBadge}>✅ Signature captured by officer!</div>
                : <div style={styles.passiveBadge}>⏳ Waiting for officer to capture your signature…</div>
              }
            </>
          )}

          {/* WAITING sub-step */}
          {liveSubStep === "waiting" && (
            <>
              <div style={styles.instrTitle}>⏳ Awaiting Submission</div>
              <div style={styles.instrSubtitle}>The officer is reviewing your details and will submit your KYC shortly.</div>
              <div style={styles.waitingCard}>
                <div style={{ fontSize:36, marginBottom:8 }}>🔍</div>
                <div style={{ fontSize:14, fontWeight:600, color:COLORS.primary }}>Officer is reviewing your information</div>
                <div style={{ fontSize:12, color:COLORS.textLight, marginTop:8, lineHeight:1.6 }}>Please stay connected. Do not close this window. The call will disconnect automatically once your KYC is complete.</div>
              </div>
              <div style={styles.checklistDone}>
                <div style={styles.doneItem}>✅ Face &amp; Liveness Verified</div>
                <div style={styles.doneItem}>✅ Spoken Code Confirmed</div>
                <div style={styles.doneItem}>✅ PAN Card Captured by Officer</div>
                <div style={styles.doneItem}>✅ Signature Captured by Officer</div>
                <div style={{ ...styles.doneItem, color:COLORS.warning, background:"#fef9c3" }}>⏳ Officer Submission Pending</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STEP: COMPLETE ───────────────────────────────────────────────────────────
function CompleteStep({ referenceId }) {
  const ref = referenceId || ("VKP-" + Math.random().toString(36).substr(2, 8).toUpperCase());
  return (
    <div style={styles.completeArea}>
      <div style={{ fontSize:72, marginBottom:16 }}>🎉</div>
      <div style={styles.completeTitle}>Video KYC Completed!</div>
      <div style={styles.completeSub}>Your Video KYC has been successfully verified and submitted by the officer. The session has been closed.</div>
      <div style={styles.completeRef}>Reference ID: <strong>{ref}</strong></div>
      <div style={styles.completeNote}>📱 You will receive an SMS notification once your KYC is approved.<br />Typical processing time: 2–4 business hours.</div>
      <div style={styles.rbiFooter}>This Video KYC was conducted in compliance with RBI regulations. The session recording is stored securely.</div>
    </div>
  );
}

// ─── SHARED ───────────────────────────────────────────────────────────────────
function StepHeader({ icon, title, subtitle }) {
  return (
    <div style={styles.stepHeader}>
      <div style={styles.stepIcon}>{icon}</div>
      <div>
        <h2 style={styles.stepTitle}>{title}</h2>
        <p style={styles.stepSubtitle}>{subtitle}</p>
      </div>
    </div>
  );
}

function CheckBadge({ status }) {
  const map = { pending:{bg:COLORS.bg,color:COLORS.textLight,label:"Pending"}, checking:{bg:"#dbeafe",color:COLORS.secondary,label:"Checking…"}, pass:{bg:"#dcfce7",color:COLORS.success,label:"✓ Pass"}, fail:{bg:"#fee2e2",color:COLORS.error,label:"✗ Fail"}, warn:{bg:"#fef3c7",color:COLORS.warning,label:"⚠ Warning"} };
  const s = map[status] || map.pending;
  return <span style={{ padding:"3px 10px", borderRadius:12, fontSize:11, fontWeight:700, background:s.bg, color:s.color, minWidth:80, textAlign:"center" }}>{s.label}</span>;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  root:{ minHeight:"100vh", background:COLORS.bg, fontFamily:"'Segoe UI','Helvetica Neue',sans-serif", color:COLORS.textDark, position:"relative", paddingBottom:40 },
  bgMesh:{ position:"fixed", inset:0, background:`radial-gradient(ellipse at 20% 0%, ${COLORS.light}40 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, ${COLORS.secondary}20 0%, transparent 50%)`, pointerEvents:"none", zIndex:0 },
  header:{ background:COLORS.primary, position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 12px rgba(7,73,148,0.3)" },
  headerInner:{ maxWidth:760, margin:"0 auto", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" },
  logoArea:{ display:"flex", alignItems:"center", gap:12 },
  logoMark:{ width:40, height:40, borderRadius:10, background:COLORS.secondary, display:"flex", alignItems:"center", justifyContent:"center", gap:1 },
  logoTitle:{ fontSize:16, fontWeight:800, color:COLORS.white, letterSpacing:0.5 },
  logoSub:{ fontSize:10, color:COLORS.light, letterSpacing:0.5 },
  secBadge:{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.08)", padding:"6px 12px", borderRadius:20 },
  progressWrap:{ background:COLORS.white, borderBottom:`1px solid ${COLORS.light}`, position:"sticky", top:64, zIndex:90, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  progressInner:{ maxWidth:760, margin:"0 auto", padding:"14px 20px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", position:"relative" },
  stepWrap:{ display:"flex", flexDirection:"column", alignItems:"center", position:"relative", flex:1 },
  stepCircle:{ width:36, height:36, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:COLORS.white, fontWeight:700, zIndex:1 },
  stepLine:{ position:"absolute", top:18, left:"50%", width:"100%", height:2, zIndex:0 },
  main:{ maxWidth:760, margin:"0 auto", padding:"24px 20px", position:"relative", zIndex:1 },
  card:{ background:COLORS.white, borderRadius:16, padding:"28px 24px", boxShadow:"0 4px 24px rgba(7,73,148,0.10)" },
  stepHeader:{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:24, paddingBottom:20, borderBottom:`1px solid ${COLORS.light}` },
  stepIcon:{ fontSize:36, lineHeight:1 },
  stepTitle:{ fontSize:20, fontWeight:800, color:COLORS.primary, margin:0 },
  stepSubtitle:{ fontSize:13, color:COLORS.textLight, margin:"4px 0 0", lineHeight:1.5 },
  sectionTitle:{ fontSize:13, fontWeight:700, color:COLORS.primary, textTransform:"uppercase", letterSpacing:0.8, marginBottom:12 },
  noticeBox:{ background:`${COLORS.primary}08`, border:`1px solid ${COLORS.light}`, borderRadius:12, padding:"16px 20px" },
  noticeTitle:{ fontSize:13, fontWeight:700, color:COLORS.primary, marginBottom:12 },
  noticeList:{ display:"flex", flexDirection:"column", gap:8 },
  noticeItem:{ fontSize:13, color:COLORS.textMid, lineHeight:1.4 },
  checkGrid:{ display:"flex", flexDirection:"column", gap:8 },
  checkRow:{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:COLORS.bg, borderRadius:8 },
  consentList:{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 },
  consentItem:{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", borderRadius:10, border:"1px solid", transition:"all 0.2s" },
  aadhaarCard:{ background:COLORS.bg, borderRadius:12, padding:24, minHeight:200 },
  loadingArea:{ display:"flex", flexDirection:"column", alignItems:"center", padding:"40px 0" },
  spinner:{ width:40, height:40, border:`4px solid ${COLORS.light}`, borderTop:`4px solid ${COLORS.primary}`, borderRadius:"50%", animation:"spin 1s linear infinite" },
  aadhaarValid:{ textAlign:"center", padding:"20px 0" },
  aadhaarExpired:{ textAlign:"center", padding:"20px 0" },
  queueCard:{ background:`linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, borderRadius:16, padding:"32px 24px", textAlign:"center", color:COLORS.white, marginBottom:24 },
  queueBig:{ fontSize:72, fontWeight:900, color:COLORS.white, lineHeight:1 },
  queueLabel:{ fontSize:14, color:COLORS.light, marginTop:8, letterSpacing:0.5 },
  queueWait:{ fontSize:16, color:COLORS.white, marginTop:16, fontWeight:600 },
  queueMsg:{ fontSize:13, color:COLORS.light, marginTop:12, lineHeight:1.6, maxWidth:380, margin:"12px auto 0" },
  queueActions:{ display:"flex", flexDirection:"column", gap:12 },
  scheduleArea:{ marginTop:8 },
  dateGrid:{ display:"flex", flexWrap:"wrap", gap:8 },
  dateChip:{ padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", transition:"all 0.2s" },
  slotGrid:{ display:"flex", flexWrap:"wrap", gap:8 },
  slotChip:{ padding:"8px 16px", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", transition:"all 0.2s" },
  aptConfirmed:{ textAlign:"center", padding:"24px 0" },
  aptTitle:{ fontSize:22, fontWeight:800, color:COLORS.success, marginTop:12 },
  aptId:{ fontSize:13, color:COLORS.textLight, marginTop:8 },
  aptDetails:{ display:"flex", justifyContent:"center", gap:24, marginTop:16, fontSize:15, fontWeight:600, color:COLORS.textDark },
  aptNote:{ fontSize:13, color:COLORS.textMid, marginTop:20, padding:"12px 16px", background:COLORS.bg, borderRadius:10, lineHeight:1.6 },
  // Live session
  sessionBar:{ display:"flex", alignItems:"center", gap:20, padding:"10px 16px", background:COLORS.bg, borderRadius:10, marginBottom:20, flexWrap:"wrap" },
  recBadgeInline:{ display:"flex", alignItems:"center", gap:6, background:COLORS.error, color:COLORS.white, fontSize:11, fontWeight:800, padding:"4px 10px", borderRadius:6, letterSpacing:1 },
  recDot:{ width:7, height:7, borderRadius:"50%", background:COLORS.white, animation:"blink 1s infinite" },
  videoArea:{ display:"flex", gap:20, flexWrap:"wrap" },
  videoFrame:{ position:"relative", flex:"0 0 320px", height:260, background:"#000", borderRadius:12, overflow:"hidden", border:`3px solid ${COLORS.primary}` },
  videoEl:{ width:"100%", height:"100%", objectFit:"cover" },
  faceOval:{ position:"absolute", top:"40%", left:"50%", transform:"translate(-50%, -50%)", width:140, height:180, border:`3px dashed ${COLORS.warning}`, borderRadius:"50%", pointerEvents:"none" },
  panFrameOverlay:{ position:"absolute", bottom:"12%", left:"50%", transform:"translateX(-50%)", width:250, height:155, border:`3px dashed ${COLORS.warning}`, borderRadius:8, display:"flex", alignItems:"flex-end", justifyContent:"center", paddingBottom:6 },
  panFrameLabel:{ background:"rgba(255,170,0,0.9)", color:COLORS.textDark, fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:4 },
  disconnectOverlay:{ position:"absolute", inset:0, background:"rgba(7,73,148,0.90)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" },
  instructionPanel:{ flex:1, minWidth:220 },
  instrTitle:{ fontSize:16, fontWeight:800, color:COLORS.primary, marginBottom:8 },
  instrSubtitle:{ fontSize:13, color:COLORS.textMid, marginBottom:14, lineHeight:1.5 },
  instrBox:{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 },
  instrItem:{ fontSize:13, color:COLORS.textMid, padding:"8px 12px", background:COLORS.bg, borderRadius:8, lineHeight:1.4 },
  passiveBadge:{ fontSize:12, color:COLORS.secondary, background:"#dbeafe", padding:"10px 14px", borderRadius:8, fontWeight:600, lineHeight:1.5, marginBottom:12 },
  agentNote:{ fontSize:12, color:COLORS.textLight, lineHeight:1.5 },
  spokenCodeBox:{ display:"flex", gap:8, justifyContent:"center", margin:"20px 0", flexWrap:"wrap" },
  spokenCodeChar:{ width:44, height:52, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:COLORS.primary, background:`${COLORS.primary}12`, border:`2px solid ${COLORS.light}`, borderRadius:10, fontFamily:"monospace" },
  codeConfirmedBadge:{ fontSize:14, fontWeight:700, color:COLORS.success, background:"#dcfce7", padding:"10px 16px", borderRadius:8, textAlign:"center", marginTop:8 },
  waitingCard:{ background:`${COLORS.primary}08`, border:`1px solid ${COLORS.light}`, borderRadius:12, padding:"24px 20px", textAlign:"center", marginBottom:16 },
  checklistDone:{ display:"flex", flexDirection:"column", gap:8 },
  doneItem:{ fontSize:13, fontWeight:600, color:COLORS.success, padding:"8px 12px", background:"#f0fdf4", borderRadius:8 },
  completeArea:{ textAlign:"center", padding:"24px 16px" },
  completeTitle:{ fontSize:28, fontWeight:900, color:COLORS.primary, marginBottom:12 },
  completeSub:{ fontSize:15, color:COLORS.textMid, lineHeight:1.6, marginBottom:20 },
  completeRef:{ background:`${COLORS.primary}10`, border:`1px solid ${COLORS.light}`, borderRadius:10, padding:"14px 20px", fontSize:16, color:COLORS.primary, marginBottom:20, display:"inline-block" },
  completeNote:{ fontSize:13, color:COLORS.textMid, padding:"14px 20px", background:COLORS.bg, borderRadius:10, lineHeight:1.8, marginBottom:20 },
  rbiFooter:{ fontSize:11, color:COLORS.textLight, lineHeight:1.6, padding:"12px 16px", borderTop:`1px solid ${COLORS.light}`, marginTop:12 },
  btnPrimary:{ width:"100%", padding:"14px 24px", background:`linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, color:COLORS.white, border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", marginTop:16, transition:"transform 0.15s, box-shadow 0.15s", boxShadow:`0 4px 14px ${COLORS.primary}50` },
  btnOutline:{ width:"100%", padding:"13px 24px", background:COLORS.white, color:COLORS.primary, border:`2px solid ${COLORS.primary}`, borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", marginTop:8, transition:"all 0.15s" },
  btnWarning:{ width:"100%", padding:"14px 24px", background:`linear-gradient(135deg, ${COLORS.warning}, #e69900)`, color:COLORS.textDark, border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", marginTop:16 },
  toast:{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", color:COLORS.white, padding:"12px 28px", borderRadius:24, fontSize:13, fontWeight:600, zIndex:9999, boxShadow:"0 4px 20px rgba(0,0,0,0.25)", whiteSpace:"nowrap", maxWidth:"90vw" },
  otpStepBar:{ display:"flex", alignItems:"flex-start", gap:8, padding:"16px 8px 20px", borderBottom:`1px solid ${COLORS.light}`, marginBottom:20 },
  otpInput:{ flex:1, padding:"12px 14px", border:`2px solid ${COLORS.light}`, borderRadius:10, fontSize:15, color:COLORS.textDark, outline:"none", fontFamily:"inherit" },
};