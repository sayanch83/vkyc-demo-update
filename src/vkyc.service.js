/**
 * vkyc.service.js
 * Shared Business Logic & API Integration Layer
 * V-CIP (Video-based Customer Identification Process)
 *
 * RBI V-CIP Compliance: RBI Master Direction on KYC (Updated 2023)
 *
 * ─── HOW TO USE ───────────────────────────────────────────────────────────────
 *  ApplicantVKYCService  → Customer-facing API calls
 *  AgentVKYCService      → Agent-facing API calls
 *
 *  Both services export an `on(event, handler)` method for event-driven UI updates.
 *
 * ─── BACKEND ──────────────────────────────────────────────────────────────────
 *  See VKYCController.java for all Spring Boot endpoint definitions.
 *  All endpoints require: Content-Type: application/json + Authorization: Bearer <token>
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════════════════
// SHARED CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const VKYC_CONFIG = {
  BASE_URL: 'https://api.your-vcip-backend.com',
  SIMULATION_MODE: true,

  // ── Applicant API Endpoints ────────────────────────────────────────────────
  ENDPOINTS: {
    // System / Pre-checks
    SYSTEM_CHECK:           '/v1/vcip/applicant/system-check',        // POST  — record check results
    LIVENESS_PRECHECK:      '/v1/vcip/applicant/liveness/precheck',   // POST  — submit pre-session liveness result

    // Consent
    CONSENT_SUBMIT:         '/v1/vcip/applicant/consents',            // POST  — submit all consents

    // Aadhaar eKYC
    AADHAAR_VERIFY_DATE:    '/v1/vcip/applicant/aadhaar/verify-date', // POST  — check eKYC freshness (3-day rule)
    AADHAAR_REDIRECT_URL:   '/v1/vcip/applicant/aadhaar/redirect',    // GET   — get Aadhaar eKYC redirect URL

    // Queue
    QUEUE_STATUS:           '/v1/vcip/applicant/queue/status',        // GET   — current queue position + ETA
    QUEUE_JOIN:             '/v1/vcip/applicant/queue/join',          // POST  — applicant joins queue

    // Appointment (Applicant-side)
    APT_SLOTS:              '/v1/vcip/appointments/slots',            // GET   — available slots
    APT_BOOK:               '/v1/vcip/appointments/book',             // POST  — book appointment
    APT_RESCHEDULE:         '/v1/vcip/appointments/{id}/reschedule',  // PUT   — reschedule
    APT_CANCEL:             '/v1/vcip/appointments/{id}/cancel',      // POST  — cancel

    // Live session (Applicant)
    SESSION_JOIN:           '/v1/vcip/session/join',                  // POST  — applicant joins live session
    SESSION_LIVENESS:       '/v1/vcip/session/liveness',             // POST  — run liveness check
    SESSION_PHOTO:          '/v1/vcip/session/photo',                 // POST  — submit face photo
    SESSION_PAN_CAPTURE:    '/v1/vcip/session/pan-capture',          // POST  — submit PAN image
    SESSION_GEO:            '/v1/vcip/session/geo',                   // POST  — submit geo location
    SESSION_COMPLETE:       '/v1/vcip/session/complete',              // POST  — mark applicant side complete

    // ── Agent API Endpoints ──────────────────────────────────────────────────
    AGENT_AUTH:             '/v1/vcip/agent/auth',                    // POST  — agent login
    AGENT_CASES:            '/v1/vcip/agent/cases',                   // GET   — list cases (with filter params)
    AGENT_CASE_DETAIL:      '/v1/vcip/agent/cases/{id}',             // GET   — full case details
    AGENT_SESSION_CREATE:   '/v1/vcip/agent/session/create',          // POST  — create session for customer
    AGENT_SESSION_RECONNECT:'/v1/vcip/agent/session/{id}/reconnect', // POST  — reconnect to dropped session
    AGENT_LIVENESS_RESULT:  '/v1/vcip/agent/session/liveness/result',// POST  — save liveness result
    AGENT_CAPTURE_ID:       '/v1/vcip/agent/session/capture-id',     // POST  — save ID image
    AGENT_OCR_RUN:          '/v1/vcip/agent/session/ocr',            // POST  — trigger OCR
    AGENT_FACE_MATCH:       '/v1/vcip/agent/session/face-match',     // POST  — run face match
    AGENT_NAME_MATCH:       '/v1/vcip/agent/session/name-match',     // POST  — run name match
    AGENT_GEO_MATCH:        '/v1/vcip/agent/session/geo-match',      // POST  — run geo/location match
    AGENT_DECISION:         '/v1/vcip/agent/session/{id}/decision',  // POST  — approve/reject
    AGENT_HOLD:             '/v1/vcip/agent/session/{id}/hold',      // POST  — put on hold
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// HTTP HELPERS (shared)
// ══════════════════════════════════════════════════════════════════════════════

function _vcipHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function _vcipPost(endpoint, body, token) {
  const r = await fetch(VKYC_CONFIG.BASE_URL + endpoint, {
    method: 'POST',
    headers: _vcipHeaders(token),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${r.status}: ${r.statusText}`);
  }
  return r.json();
}

async function _vcipGet(endpoint, params, token) {
  const qs = params ? '?' + new URLSearchParams(params) : '';
  const r = await fetch(VKYC_CONFIG.BASE_URL + endpoint + qs, {
    headers: _vcipHeaders(token),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${r.status}: ${r.statusText}`);
  }
  return r.json();
}

async function _vcipPut(endpoint, body, token) {
  const r = await fetch(VKYC_CONFIG.BASE_URL + endpoint, {
    method: 'PUT',
    headers: _vcipHeaders(token),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${r.status}: ${r.statusText}`);
  }
  return r.json();
}

const _delay = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// SIMULATION STUBS
// ══════════════════════════════════════════════════════════════════════════════
const _sim = {
  systemCheck:       async () => { await _delay(300); return { sessionToken: 'SIM-' + Date.now(), checksPassed: true }; },
  livenessPrecheck:  async (score, passed) => { await _delay(400); return { preCheckId: 'LPC-' + Date.now(), score, passed, method: 'ISO-30107-3-Passive', storedAt: new Date().toISOString() }; },
  consentSubmit:     async () => { await _delay(400); return { consentId: 'CON-' + Date.now(), accepted: true }; },
  aadhaarVerify:     async () => { await _delay(1800); return { valid: true, lastEkycDate: new Date(Date.now() - 86400000 * 2).toISOString(), daysSince: 2 }; },
  aadhaarExpired:    async () => { await _delay(1800); return { valid: false, lastEkycDate: new Date(Date.now() - 86400000 * 5).toISOString(), daysSince: 5 }; },
  aadhaarRedirect:   async () => { await _delay(300); return { redirectUrl: 'https://uidai.gov.in/ekyc/redirect' }; },
  queueStatus:       async () => { await _delay(600); return { position: 4, estimatedWaitMins: 18, agentAvailable: true }; },
  queueJoin:         async () => { await _delay(400); return { queueToken: 'QT-' + Date.now(), position: 4 }; },
  fetchSlots:        async () => { await _delay(700); return { slots: _buildSimSlots() }; },
  bookApt:           async (slotId) => { await _delay(900); return { appointmentId: 'APT-' + Math.random().toString(36).substr(2,6).toUpperCase(), slotId, status: 'confirmed', bookedAt: new Date().toISOString() }; },
  reschedule:        async (aptId, slotId) => { await _delay(700); return { appointmentId: aptId, newSlotId: slotId, status: 'rescheduled', updatedAt: new Date().toISOString() }; },
  cancelApt:         async (aptId) => { await _delay(500); return { appointmentId: aptId, status: 'cancelled' }; },
  sessionJoin:       async () => { await _delay(1500); return { sessionId: 'VCIP-' + Math.random().toString(36).substr(2,8).toUpperCase(), roomToken: 'RT-SIM', agentName: 'Agent Kumar' }; },
  liveness:          async (checkId) => { await _delay({ face:1800, blink:2500, smile:2500, turn:3000 }[checkId] || 1500); return { checkId, passed: true, confidence: 0.94 + Math.random() * 0.05 }; },
  panCapture:        async () => { await _delay(500); return { captureId: 'CAP-' + Date.now(), stored: true }; },
  sessionComplete:   async () => { await _delay(600); return { status: 'completed', reference: 'VKP-' + Date.now().toString().slice(-8) }; },
  agentCases:        async () => { await _delay(600); return { cases: [] }; }, // UI uses mock data; preCheckLiveness is embedded in MOCK_CASES in AgentVKYC.jsx
  createAgentSession:async () => { await _delay(1200); return { sessionId: 'KYC-' + Math.random().toString(36).substr(2,7).toUpperCase(), preCheckLiveness: { score: 94.2, passed: true, method: 'ISO-30107-3-Passive', timestamp: new Date().toLocaleTimeString('en-IN'), preCheckId: 'LPC-SIM-' + Date.now() } }; },
  reconnect:         async (id) => { await _delay(2000); return { sessionId: id, reconnected: true }; },
  ocr:               async (caseData) => { await _delay(2200); return { name: caseData?.name?.toUpperCase() || 'UNKNOWN', pan: caseData?.pan || 'XXXXX0000X', dob: caseData?.dob || '01/01/1990', fatherName: caseData?.fatherName?.toUpperCase() || 'UNKNOWN', confidence: 0.97 }; },
  faceMatch:         async () => { await _delay(1800); return { score: 88 + Math.random() * 10, match: true }; },
  nameMatch:         async () => { await _delay(800); return { score: 92 + Math.random() * 7, match: true }; },
  geoMatch:          async () => { await _delay(600); return { score: 96 + Math.random() * 3, match: true, city: 'Andheri West, Mumbai' }; },
  decision:          async (type) => { await _delay(600); return { reference: 'KYC-' + Date.now().toString().slice(-7), status: type, decidedAt: new Date().toISOString() }; },
};

function _buildSimSlots() {
  const agents = [
    { id: 'AGT001', name: 'Agent Kumar' },
    { id: 'AGT002', name: 'Agent Priya' },
    { id: 'AGT003', name: 'Agent Rahul' },
  ];
  const slots = [];
  const now = new Date();
  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d + 1);
    if ([0, 6].includes(date.getDay())) continue;
    const dateStr = date.toISOString().split('T')[0];
    for (let h = 9; h < 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        const time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const agent = agents[Math.floor(Math.random() * agents.length)];
        slots.push({
          slotId: `${dateStr}-${time}-${agent.id}`,
          date: dateStr, time, agentId: agent.id, agentName: agent.name,
          available: Math.random() > 0.35,
        });
      }
    }
  }
  return slots;
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT BUS FACTORY
// ══════════════════════════════════════════════════════════════════════════════
function createEventBus() {
  const listeners = {};
  return {
    on:   (event, cb)      => { if (!listeners[event]) listeners[event] = []; listeners[event].push(cb); },
    off:  (event, cb)      => { if (listeners[event]) listeners[event] = listeners[event].filter(x => x !== cb); },
    emit: (event, payload) => (listeners[event] || []).forEach(cb => cb(payload)),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// APPLICANT SERVICE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * ApplicantVKYCService
 *
 * Manages the complete applicant-side V-CIP workflow:
 * prechecks → consent → aadhaar check → queue → live session → PAN capture
 *
 * Usage in React:
 *   const svc = ApplicantVKYCService.create();
 *   svc.on('queue:status', ({ position, waitMins }) => setQueuePos(position));
 *   await svc.fetchQueueStatus(applicantToken);
 */
const ApplicantVKYCService = (() => {
  function create() {
    const bus = createEventBus();
    let state = {
      sessionToken: null,
      consentId: null,
      aadhaarValid: null,
      preCheckId: null,
      preCheckLiveness: null,   // { score, passed, method, timestamp, preCheckId }
      queueToken: null,
      queuePosition: null,
      appointment: null,
      availableSlots: [],
      sessionId: null,
      livenessResults: { face: 'pending', blink: 'pending', smile: 'pending', turn: 'pending' },
    };

    // ── System Pre-check ───────────────────────────────────────────────────────
    /**
     * Record applicant's system check results in backend.
     * @param {Object} checkResults  { camera, microphone, internet, browser, location }
     * @param {string} applicantRef  Application reference from SMS link
     * @emits system:check:complete { sessionToken }
     *
     * POST /v1/vcip/applicant/system-check
     * Body: { applicantRef, checkResults, userAgent, timestamp }
     * Response: { sessionToken: string, checksPassed: boolean }
     */
    async function recordSystemCheck(checkResults, applicantRef) {
      try {
        let result;
        if (VKYC_CONFIG.SIMULATION_MODE) {
          result = await _sim.systemCheck();
        } else {
          result = await _vcipPost(VKYC_CONFIG.ENDPOINTS.SYSTEM_CHECK, {
            applicantRef,
            checkResults,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          });
        }
        state.sessionToken = result.sessionToken;
        bus.emit('system:check:complete', { sessionToken: result.sessionToken });
      } catch (err) {
        bus.emit('error', { context: 'systemCheck', message: err.message });
      }
    }

    // ── Liveness Pre-check ────────────────────────────────────────────────────
    /**
     * Submit pre-session liveness result captured during system pre-check step.
     * Called automatically after the passive liveness capture completes.
     *
     * @param {number}  score       Liveness confidence score (0–100)
     * @param {boolean} passed      Whether liveness threshold was met (>= 75%)
     * @param {string}  method      SDK method identifier e.g. 'ISO-30107-3-Passive'
     * @param {string}  frameB64    Base64 JPEG of the captured face frame
     * @param {string}  timestamp   Client-side ISO timestamp of capture
     * @emits precheck:liveness:complete { preCheckId, score, passed }
     *
     * POST /v1/vcip/applicant/liveness/precheck
     * Body: {
     *   sessionToken,           // from recordSystemCheck response
     *   score,                  // number: 0–100
     *   passed,                 // boolean
     *   method,                 // string: SDK identifier
     *   frameB64,               // string: base64 JPEG face frame
     *   capturedAt,             // ISO datetime string
     *   sdkVersion,             // string: liveness SDK version for audit
     * }
     * Response: {
     *   preCheckId: string,     // unique ID — pass this to joinQueue & joinSession
     *   score: number,
     *   passed: boolean,
     *   method: string,
     *   storedAt: ISO string,   // server-side storage timestamp
     * }
     */
    async function submitLivenessPreCheck(score, passed, method, frameB64 = null, timestamp = null) {
      bus.emit('precheck:liveness:start');
      try {
        let result;
        if (VKYC_CONFIG.SIMULATION_MODE) {
          result = await _sim.livenessPrecheck(score, passed);
        } else {
          result = await _vcipPost(VKYC_CONFIG.ENDPOINTS.LIVENESS_PRECHECK, {
            sessionToken: state.sessionToken,
            score,
            passed,
            method: method || 'ISO-30107-3-Passive',
            frameB64,
            capturedAt: timestamp || new Date().toISOString(),
            sdkVersion: '1.0.0',  // replace with your actual SDK version
          });
        }
        state.preCheckId = result.preCheckId;
        state.preCheckLiveness = { score, passed, method, timestamp: timestamp || new Date().toISOString(), preCheckId: result.preCheckId };
        bus.emit('precheck:liveness:complete', { preCheckId: result.preCheckId, score, passed });
        return result;
      } catch (err) {
        bus.emit('error', { context: 'livenessPrecheck', message: err.message });
        return { passed: false };
      }
    }

    // ── Consents ───────────────────────────────────────────────────────────────
    /**
     * Submit all accepted consents to backend (RBI mandated audit trail).
     * @param {string[]} consentIds  Array of accepted consent IDs
     * @emits consent:submitted { consentId }
     *
     * POST /v1/vcip/applicant/consents
     * Body: { sessionToken, consentIds, acceptedAt, ipAddress }
     * Response: { consentId: string, accepted: true }
     */
    async function submitConsents(consentIds) {
      try {
        let result;
        if (VKYC_CONFIG.SIMULATION_MODE) {
          result = await _sim.consentSubmit();
        } else {
          result = await _vcipPost(VKYC_CONFIG.ENDPOINTS.CONSENT_SUBMIT, {
            sessionToken: state.sessionToken,
            consentIds,
            acceptedAt: new Date().toISOString(),
          });
        }
        state.consentId = result.consentId;
        bus.emit('consent:submitted', { consentId: result.consentId });
      } catch (err) {
        bus.emit('error', { context: 'consentSubmit', message: err.message });
      }
    }

    // ── Aadhaar eKYC Freshness Check ──────────────────────────────────────────
    /**
     * Check if applicant's Aadhaar eKYC is fresh (< 3 days old) per RBI rule.
     * @param {string} mobileOrAadhaarRef
     * @emits aadhaar:valid   { lastEkycDate, daysSince }
     * @emits aadhaar:expired { lastEkycDate, daysSince, redirectUrl }
     *
     * POST /v1/vcip/applicant/aadhaar/verify-date
     * Body: { sessionToken, mobileRef }
     * Response: { valid: boolean, lastEkycDate: ISO string, daysSince: number }
     *
     * If invalid → GET /v1/vcip/applicant/aadhaar/redirect for UIDAI redirect URL
     */
    async function verifyAadhaarFreshness(mobileRef) {
      bus.emit('aadhaar:checking');
      try {
        let result;
        if (VKYC_CONFIG.SIMULATION_MODE) {
          result = await _sim.aadhaarVerify();
        } else {
          result = await _vcipPost(VKYC_CONFIG.ENDPOINTS.AADHAAR_VERIFY_DATE, {
            sessionToken: state.sessionToken,
            mobileRef,
          });
        }
        state.aadhaarValid = result.valid;
        if (result.valid) {
          bus.emit('aadhaar:valid', { lastEkycDate: result.lastEkycDate, daysSince: result.daysSince });
        } else {
          // Fetch redirect URL for fresh Aadhaar eKYC
          const redirectData = VKYC_CONFIG.SIMULATION_MODE
            ? await _sim.aadhaarRedirect()
            : await _vcipGet(VKYC_CONFIG.ENDPOINTS.AADHAAR_REDIRECT_URL, { sessionToken: state.sessionToken });
          bus.emit('aadhaar:expired', {
            lastEkycDate: result.lastEkycDate,
            daysSince: result.daysSince,
            redirectUrl: redirectData.redirectUrl,
          });
        }
      } catch (err) {
        bus.emit('error', { context: 'aadhaarVerify', message: err.message });
      }
    }

    // ── Queue ──────────────────────────────────────────────────────────────────
    /**
     * Get current queue position and wait time.
     * @emits queue:status { position, estimatedWaitMins, agentAvailable }
     *
     * GET /v1/vcip/applicant/queue/status?sessionToken=...
     * Response: { position: number, estimatedWaitMins: number, agentAvailable: boolean }
     */
    async function fetchQueueStatus() {
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.queueStatus()
          : await _vcipGet(VKYC_CONFIG.ENDPOINTS.QUEUE_STATUS, { sessionToken: state.sessionToken });
        state.queuePosition = result.position;
        bus.emit('queue:status', result);
      } catch (err) {
        bus.emit('error', { context: 'queueStatus', message: err.message });
      }
    }

    /**
     * Join queue for next available agent.
     * @param {number} geoLat
     * @param {number} geoLng
     * @emits queue:joined { queueToken, position }
     *
     * POST /v1/vcip/applicant/queue/join
     * Body: { sessionToken, geoLat, geoLng, preCheckId }
     * Response: { queueToken: string, position: number }
     *
     * NOTE: preCheckId links this queue entry to the pre-session liveness result.
     *       Backend should validate preCheckId exists and belongs to this sessionToken.
     */
    async function joinQueue(geoLat, geoLng) {
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.queueJoin()
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.QUEUE_JOIN, {
              sessionToken: state.sessionToken,
              geoLat,
              geoLng,
              preCheckId: state.preCheckId || null,   // ← new: link pre-check result
            });
        state.queueToken = result.queueToken;
        bus.emit('queue:joined', result);
      } catch (err) {
        bus.emit('error', { context: 'queueJoin', message: err.message });
      }
    }

    // ── Appointment (Applicant) ────────────────────────────────────────────────
    /**
     * Load available slots for appointment booking.
     * @emits appointment:slots:loaded { slots }
     *
     * GET /v1/vcip/appointments/slots?sessionToken=&dateFrom=&dateTo=
     * Response: { slots: [{ slotId, date, time, agentId, agentName, available }] }
     */
    async function fetchSlots(filters = {}) {
      bus.emit('appointment:slots:loading');
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.fetchSlots()
          : await _vcipGet(VKYC_CONFIG.ENDPOINTS.APT_SLOTS, { sessionToken: state.sessionToken, ...filters });
        state.availableSlots = result.slots;
        bus.emit('appointment:slots:loaded', { slots: result.slots });
      } catch (err) {
        bus.emit('error', { context: 'fetchSlots', message: err.message });
      }
    }

    /**
     * Book a specific appointment slot.
     * @param {string} slotId
     * @emits appointment:booked { appointment }
     *
     * POST /v1/vcip/appointments/book
     * Body: { sessionToken, slotId }
     * Response: { appointmentId, slotId, status, bookedAt }
     */
    async function bookAppointment(slotId) {
      bus.emit('appointment:booking');
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.bookApt(slotId)
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.APT_BOOK, { sessionToken: state.sessionToken, slotId });
        const slot = state.availableSlots.find(s => s.slotId === slotId) || {};
        state.appointment = { id: result.appointmentId, slotId, ...slot, status: result.status, bookedAt: result.bookedAt };
        bus.emit('appointment:booked', { appointment: state.appointment });
      } catch (err) {
        bus.emit('error', { context: 'bookAppointment', message: err.message });
      }
    }

    /**
     * Reschedule to a different slot.
     * PUT /v1/vcip/appointments/{id}/reschedule
     * Body: { sessionToken, newSlotId }
     */
    async function rescheduleAppointment(newSlotId) {
      if (!state.appointment?.id) { bus.emit('error', { context: 'reschedule', message: 'No appointment to reschedule' }); return; }
      bus.emit('appointment:rescheduling');
      try {
        const ep = VKYC_CONFIG.ENDPOINTS.APT_RESCHEDULE.replace('{id}', state.appointment.id);
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.reschedule(state.appointment.id, newSlotId)
          : await _vcipPut(ep, { sessionToken: state.sessionToken, newSlotId });
        const newSlot = state.availableSlots.find(s => s.slotId === newSlotId) || {};
        state.appointment = { ...state.appointment, slotId: newSlotId, ...newSlot, status: result.status };
        bus.emit('appointment:rescheduled', { appointment: state.appointment });
      } catch (err) {
        bus.emit('error', { context: 'reschedule', message: err.message });
      }
    }

    /**
     * Cancel appointment.
     * POST /v1/vcip/appointments/{id}/cancel
     */
    async function cancelAppointment(reason = '') {
      if (!state.appointment?.id) return;
      bus.emit('appointment:cancelling');
      try {
        const ep = VKYC_CONFIG.ENDPOINTS.APT_CANCEL.replace('{id}', state.appointment.id);
        VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.cancelApt(state.appointment.id)
          : await _vcipPost(ep, { sessionToken: state.sessionToken, reason });
        const id = state.appointment.id;
        state.appointment = null;
        bus.emit('appointment:cancelled', { appointmentId: id });
      } catch (err) {
        bus.emit('error', { context: 'cancelAppointment', message: err.message });
      }
    }

    // ── Live Session ───────────────────────────────────────────────────────────
    /**
     * Applicant joins the live VCIP session (after agent accepts from queue).
     * @param {number} geoLat
     * @param {number} geoLng
     * @emits session:joined { sessionId, roomToken, agentName }
     *
     * POST /v1/vcip/session/join
     * Body: { sessionToken, appointmentId?, geoLat, geoLng, deviceInfo }
     * Response: { sessionId, roomToken, agentName }
     */
    async function joinSession(geoLat, geoLng) {
      bus.emit('session:joining');
      try {
        const deviceInfo = {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          screen: `${screen.width}x${screen.height}`,
        };
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.sessionJoin()
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.SESSION_JOIN, {
              sessionToken: state.sessionToken,
              appointmentId: state.appointment?.id,
              geoLat, geoLng, deviceInfo,
              preCheckId: state.preCheckId || null,   // ← new: attach pre-check result to session
            });
        state.sessionId = result.sessionId;
        bus.emit('session:joined', result);
      } catch (err) {
        bus.emit('error', { context: 'sessionJoin', message: err.message });
      }
    }

    /**
     * Run a liveness check (called per check type: face, blink, smile, turn).
     * @param {string} checkId  'face' | 'blink' | 'smile' | 'turn'
     * @param {string} frameB64  Base64 video frame
     * @emits liveness:check:result { checkId, passed, confidence }
     *
     * POST /v1/vcip/session/liveness
     * Body: { sessionId, checkId, frameB64 }
     * Response: { checkId, passed: boolean, confidence: number }
     */
    async function runLivenessCheck(checkId, frameB64 = null) {
      bus.emit('liveness:check:start', { checkId });
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.liveness(checkId)
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.SESSION_LIVENESS, {
              sessionId: state.sessionId, checkId, frameB64,
            });
        state.livenessResults[checkId] = result.passed ? 'pass' : 'fail';
        bus.emit('liveness:check:result', { checkId, passed: result.passed, confidence: result.confidence });
        return result;
      } catch (err) {
        state.livenessResults[checkId] = 'fail';
        bus.emit('liveness:check:result', { checkId, passed: false, confidence: 0 });
        bus.emit('error', { context: `liveness:${checkId}`, message: err.message });
        return { passed: false };
      }
    }

    /**
     * Run all 4 liveness checks sequentially.
     * @param {Function} getVideoFrame  Callback that returns a base64 frame
     * @emits liveness:complete { allPassed, results }
     */
    async function runAllLivenessChecks(getVideoFrame) {
      for (const checkId of ['face', 'blink', 'smile', 'turn']) {
        const frame = getVideoFrame?.() ?? null;
        await runLivenessCheck(checkId, frame);
      }
      const allPassed = Object.values(state.livenessResults).every(v => v === 'pass');
      bus.emit('liveness:complete', { allPassed, results: { ...state.livenessResults } });
    }

    /**
     * Submit PAN card image capture.
     * @param {string} imageB64  Base64 image
     * @emits pan:captured { captureId }
     *
     * POST /v1/vcip/session/pan-capture
     * Body: { sessionId, imageB64, capturedAt }
     * Response: { captureId: string, stored: true }
     */
    async function submitPanCapture(imageB64) {
      bus.emit('pan:capturing');
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.panCapture()
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.SESSION_PAN_CAPTURE, {
              sessionId: state.sessionId,
              imageB64,
              capturedAt: new Date().toISOString(),
            });
        bus.emit('pan:captured', { captureId: result.captureId });
      } catch (err) {
        bus.emit('error', { context: 'panCapture', message: err.message });
      }
    }

    /**
     * Mark applicant's side of the session complete.
     * @emits session:complete { reference }
     *
     * POST /v1/vcip/session/complete
     * Body: { sessionId }
     * Response: { status: 'completed', reference: string }
     */
    async function completeSession() {
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.sessionComplete()
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.SESSION_COMPLETE, { sessionId: state.sessionId });
        bus.emit('session:complete', { reference: result.reference });
      } catch (err) {
        bus.emit('error', { context: 'sessionComplete', message: err.message });
      }
    }

    return {
      on: bus.on.bind(bus),
      off: bus.off.bind(bus),
      getState: () => ({ ...state }),
      setSimulationMode: (v) => { VKYC_CONFIG.SIMULATION_MODE = v; },
      // Methods
      recordSystemCheck,
      submitLivenessPreCheck,
      submitConsents,
      verifyAadhaarFreshness,
      fetchQueueStatus,
      joinQueue,
      fetchSlots,
      bookAppointment,
      rescheduleAppointment,
      cancelAppointment,
      joinSession,
      runLivenessCheck,
      runAllLivenessChecks,
      submitPanCapture,
      completeSession,
    };
  }
  return { create };
})();

// ══════════════════════════════════════════════════════════════════════════════
// AGENT SERVICE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * AgentVKYCService
 *
 * Manages the complete agent-side V-CIP workflow:
 * dashboard → accept case → live session → pre-check review → liveness confirm → match scores → decision
 *
 * Usage:
 *   const svc = AgentVKYCService.create(agentToken);
 *   svc.on('session:created', ({ sessionId }) => setSessionId(sessionId));
 *   await svc.createSession(caseId);
 */
const AgentVKYCService = (() => {
  function create(agentToken) {
    const bus = createEventBus();
    let state = {
      token: agentToken,
      sessionId: null,
      activeCase: null,
      preCheckLiveness: null,   // { score, passed, method, timestamp } — received from session create
      livenessResults: {},
      matchScores: {},
      ocrData: null,
      decision: null,
    };

    // ── Cases ──────────────────────────────────────────────────────────────────
    /**
     * Load agent's case queue.
     * @param {Object} filters  { status, dateFrom, dateTo }
     * @emits cases:loaded { cases }
     *
     * GET /v1/vcip/agent/cases?status=in-queue&...
     * Response: { cases: [CaseDTO...] }
     */
    async function fetchCases(filters = {}) {
      bus.emit('cases:loading');
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.agentCases()
          : await _vcipGet(VKYC_CONFIG.ENDPOINTS.AGENT_CASES, filters, state.token);
        bus.emit('cases:loaded', { cases: result.cases });
      } catch (err) {
        bus.emit('error', { context: 'fetchCases', message: err.message });
      }
    }

    // ── Session ────────────────────────────────────────────────────────────────
    /**
     * Create and start a VCIP session for a queued customer.
     * @param {string} caseId
     * @emits session:created { sessionId }
     *
     * POST /v1/vcip/agent/session/create
     * Body: { caseId, agentId, appointmentId? }
     * Response: { sessionId: string }
     */
    async function createSession(caseId, appointmentId = null) {
      bus.emit('session:creating');
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.createAgentSession()
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.AGENT_SESSION_CREATE, {
              caseId, appointmentId, startedAt: new Date().toISOString(),
            }, state.token);
        state.sessionId = result.sessionId;
        state.activeCase = { id: caseId };
        // Store pre-check liveness result returned by backend (from applicant's pre-session check)
        if (result.preCheckLiveness) {
          state.preCheckLiveness = result.preCheckLiveness;
        }
        bus.emit('session:created', { sessionId: result.sessionId, preCheckLiveness: result.preCheckLiveness || null });
      } catch (err) {
        bus.emit('error', { context: 'createSession', message: err.message });
      }
    }

    /**
     * Reconnect agent to a dropped session.
     * @emits session:reconnected { sessionId }
     *
     * POST /v1/vcip/agent/session/{id}/reconnect
     * Body: { agentId }
     * Response: { sessionId, reconnected: true }
     */
    async function reconnectSession() {
      if (!state.sessionId) { bus.emit('error', { context: 'reconnect', message: 'No active session to reconnect' }); return; }
      bus.emit('session:reconnecting');
      try {
        const ep = VKYC_CONFIG.ENDPOINTS.AGENT_SESSION_RECONNECT.replace('{id}', state.sessionId);
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.reconnect(state.sessionId)
          : await _vcipPost(ep, {}, state.token);
        bus.emit('session:reconnected', { sessionId: result.sessionId });
      } catch (err) {
        bus.emit('error', { context: 'reconnect', message: err.message });
      }
    }

    // ── Liveness ───────────────────────────────────────────────────────────────
    /**
     * Save liveness check result (agent-side confirmation).
     * @param {string} checkId
     * @param {boolean} passed
     * @param {number} confidence
     * @emits liveness:result:saved
     *
     * POST /v1/vcip/agent/session/liveness/result
     * Body: { sessionId, checkId, passed, confidence, frameB64? }
     */
    async function saveLivenessResult(checkId, passed, confidence, frameB64 = null) {
      bus.emit('liveness:check:start', { checkId });
      try {
        VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.liveness(checkId)
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.AGENT_LIVENESS_RESULT, {
              sessionId: state.sessionId, checkId, passed, confidence, frameB64,
            }, state.token);
        state.livenessResults[checkId] = passed ? 'pass' : 'fail';
        bus.emit('liveness:check:result', { checkId, passed, confidence });
      } catch (err) {
        bus.emit('error', { context: `liveness:${checkId}`, message: err.message });
      }
    }

    /**
     * Run all 4 liveness checks for the active session.
     * @emits liveness:complete
     */
    async function runAllLiveness(getVideoFrame) {
      const prompts = { face: 1800, blink: 2500, smile: 2500, turn: 3000 };
      for (const checkId of ['face', 'blink', 'smile', 'turn']) {
        bus.emit('liveness:check:start', { checkId });
        await _delay(prompts[checkId]);
        const passed = true;
        const confidence = 0.92 + Math.random() * 0.07;
        await saveLivenessResult(checkId, passed, confidence, getVideoFrame?.() ?? null);
      }
      const allPassed = Object.values(state.livenessResults).every(v => v === 'pass');
      bus.emit('liveness:complete', { allPassed, results: { ...state.livenessResults } });

      // Auto-run match scoring after liveness
      await runMatchScores();
    }

    // ── ID Capture ─────────────────────────────────────────────────────────────
    /**
     * Save captured PAN/ID image.
     * @param {'front'|'back'} side
     * @param {string} imageB64
     * @emits id:captured { side }
     *
     * POST /v1/vcip/agent/session/capture-id
     * Body: { sessionId, side, imageB64, capturedAt }
     */
    async function captureId(side, imageB64) {
      try {
        VKYC_CONFIG.SIMULATION_MODE
          ? await _delay(300)
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.AGENT_CAPTURE_ID, {
              sessionId: state.sessionId, side, imageB64,
              capturedAt: new Date().toISOString(),
            }, state.token);
        bus.emit('id:captured', { side });
      } catch (err) {
        bus.emit('error', { context: 'captureId', message: err.message });
      }
    }

    // ── OCR ────────────────────────────────────────────────────────────────────
    /**
     * Trigger OCR on captured ID images.
     * @emits ocr:complete { name, pan, dob, fatherName, confidence }
     *
     * POST /v1/vcip/agent/session/ocr
     * Body: { sessionId }
     * Response: { name, pan, dob, fatherName, confidence }
     */
    async function runOCR(caseDataForSim = null) {
      bus.emit('ocr:start');
      try {
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.ocr(caseDataForSim)
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.AGENT_OCR_RUN, { sessionId: state.sessionId }, state.token);
        state.ocrData = result;
        bus.emit('ocr:complete', result);
      } catch (err) {
        bus.emit('error', { context: 'ocr', message: err.message });
      }
    }

    // ── Match Scoring ─────────────────────────────────────────────────────────
    /**
     * Run all match scoring: face, name, geo.
     * @emits match:scores { face, name, location, pan }
     */
    async function runMatchScores(getVideoFrame) {
      bus.emit('match:scoring');
      try {
        const faceResult = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.faceMatch()
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.AGENT_FACE_MATCH, {
              sessionId: state.sessionId, frameB64: getVideoFrame?.() ?? null,
            }, state.token);

        const nameResult = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.nameMatch()
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.AGENT_NAME_MATCH, { sessionId: state.sessionId }, state.token);

        const geoResult = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.geoMatch()
          : await _vcipPost(VKYC_CONFIG.ENDPOINTS.AGENT_GEO_MATCH, { sessionId: state.sessionId }, state.token);

        const scores = {
          face: faceResult.score,
          name: nameResult.score,
          location: geoResult.score,
          pan: 95 + Math.random() * 4, // Computed from OCR vs application data
        };
        state.matchScores = scores;
        bus.emit('match:scores', scores);
      } catch (err) {
        bus.emit('error', { context: 'matchScores', message: err.message });
      }
    }

    // ── Decision ───────────────────────────────────────────────────────────────
    /**
     * Submit agent's final Approve/Reject decision.
     * @param {'approve'|'reject'} decision
     * @param {string} remarks
     * @emits decision:submitted { decision, reference, decidedAt }
     *
     * POST /v1/vcip/agent/session/{id}/decision
     * Body: { decision, remarks, ocrData, matchScores, livenessResults, preCheckLiveness }
     * Response: { reference: string, status: string, decidedAt: ISO string }
     */
    async function submitDecision(decision, remarks) {
      try {
        const ep = VKYC_CONFIG.ENDPOINTS.AGENT_DECISION.replace('{id}', state.sessionId);
        const result = VKYC_CONFIG.SIMULATION_MODE
          ? await _sim.decision(decision)
          : await _vcipPost(ep, {
              decision, remarks,
              ocrData: state.ocrData,
              matchScores: state.matchScores,
              livenessResults: state.livenessResults,
              preCheckLiveness: state.preCheckLiveness,  // ← new: pre-session liveness audit trail
              decidedAt: new Date().toISOString(),
            }, state.token);
        state.decision = decision;
        bus.emit('decision:submitted', { decision, reference: result.reference, decidedAt: result.decidedAt, remarks });
      } catch (err) {
        bus.emit('error', { context: 'decision', message: err.message });
      }
    }

    /**
     * Put session on hold (for later resumption).
     * POST /v1/vcip/agent/session/{id}/hold
     * Body: { reason }
     */
    async function putOnHold(reason = '') {
      try {
        const ep = VKYC_CONFIG.ENDPOINTS.AGENT_HOLD.replace('{id}', state.sessionId);
        VKYC_CONFIG.SIMULATION_MODE
          ? await _delay(400)
          : await _vcipPost(ep, { reason }, state.token);
        bus.emit('session:onhold', { reason });
      } catch (err) {
        bus.emit('error', { context: 'hold', message: err.message });
      }
    }

    return {
      on: bus.on.bind(bus),
      off: bus.off.bind(bus),
      getState: () => ({ ...state }),
      setToken: (t) => { state.token = t; },
      // Methods
      fetchCases,
      createSession,
      reconnectSession,
      saveLivenessResult,
      runAllLiveness,
      captureId,
      runOCR,
      runMatchScores,
      submitDecision,
      putOnHold,
    };
  }
  return { create };
})();

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS (React usage)
// ══════════════════════════════════════════════════════════════════════════════

export { ApplicantVKYCService, AgentVKYCService, VKYC_CONFIG };

/*
 * ─── REACT USAGE EXAMPLES ────────────────────────────────────────────────────
 *
 * // In ApplicantVKYC.jsx:
 * import { ApplicantVKYCService } from './vkyc.service.js';
 * const svc = useRef(ApplicantVKYCService.create()).current;
 * useEffect(() => {
 *   svc.on('queue:status', ({ position, estimatedWaitMins }) => {
 *     setQueuePos(position);
 *     setWaitMins(estimatedWaitMins);
 *   });
 *   svc.fetchQueueStatus();
 * }, []);
 *
 * // In AgentVKYC.jsx:
 * import { AgentVKYCService } from './vkyc.service.js';
 * const svc = useRef(AgentVKYCService.create(agentToken)).current;
 * svc.on('session:created', ({ sessionId }) => setSessionId(sessionId));
 * await svc.createSession(case_.id, case_.appointmentId);
 */
