// Demo store: everything lives in this browser's localStorage. Passwords are not
// checked. Use only to try the workflow — never with real candidate data.
import { SEED_CANDIDATES, SEED_USERS } from './seed.js';
import { POOL, UNITS, HRS, MODE_LABEL, candScore } from '../ui.js';
import * as rules from './rules.js';
import { CONFIG } from '../config.js';

const KEY = 'candidate-pool-demo-v3';
const SESSION_KEY = 'candidate-pool-demo-session';


// Sample usage log for the last 30 days, so the "การใช้งาน" tab has something to show in the demo.
function sampleEvents() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const ids = SEED_CANDIDATES.map((c) => c.id);
  const who = [
    { userId: 'admin-hr', role: 'admin', unit: null, w: 1.4, acts: { login: 1, profile_view: 3, decision: 1, interview_set: 0.6, move: 0.5, candidate_add: 0.6, candidate_edit: 0.8, compare: 0.3, excel_export: 0.15, resume_import: 0.4 } },
    { userId: 'pjt-pd-1', role: 'pjt', unit: 'PJT-PD-1', w: 1.2, acts: { login: 1, profile_view: 2.5, pick: 0.6, return: 0.2, interview_request: 0.4, compare: 0.8 } },
    { userId: 'pjt-pd-2', role: 'pjt', unit: 'PJT-PD-2', w: 0.8, acts: { login: 0.8, profile_view: 1.6, pick: 0.4, return: 0.1, interview_request: 0.2, compare: 0.3 } },
    { userId: 'pjt-pd-3', role: 'pjt', unit: 'PJT-PD-3', w: 0.35, acts: { login: 0.5, profile_view: 0.8, pick: 0.15, interview_request: 0.05 } },
    { userId: 'pjt-pd-4', role: 'pjt', unit: 'PJT-PD-4', w: 0, acts: {} }
  ];
  const out = [];
  const day = 86400000, now = Date.now();
  for (let d = 30; d >= 1; d--) {
    const weekend = [0, 6].includes(new Date(now - d * day).getDay());
    for (const u of who) {
      if (weekend || rnd() > u.w) continue;
      for (const [action, rate] of Object.entries(u.acts)) {
        const n = Math.floor(rate * (0.5 + rnd() * 1.5) + rnd());
        for (let i = 0; i < n; i++) {
          const midnight = new Date(now - d * day); midnight.setHours(0, 0, 0, 0);
          const at = new Date(midnight.getTime() + (8.5 + rnd() * 9) * 3600000).toISOString();
          const withCand = !['login', 'compare', 'excel_export', 'resume_import'].includes(action);
          out.push({ at, userId: u.userId, role: u.role, unit: u.unit, action,
            candidateId: withCand ? ids[Math.floor(rnd() * ids.length)] : null,
            meta: action === 'compare' ? { count: 2 + Math.floor(rnd() * 3) } : {} });
        }
      }
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).map((e, i) => ({ id: i + 1, ...e }));
}
// Spread "entered the system" over the past weeks so a few sample rows show "New".
const fresh = () => ({
  candidates: structuredClone(SEED_CANDIDATES).map((c, i) => ({
    ...rules.CLEARED_INTERVIEW, holdUntil: null, ...c,
    createdAt: new Date(Date.now() - i * 1.5 * 86400000).toISOString()
  })),
  users: structuredClone(SEED_USERS),
  divisions: structuredClone(CONFIG.divisions),
  notifications: [],
  events: sampleEvents(),
  nextNotif: 1
});
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (!d.divisions) d.divisions = structuredClone(CONFIG.divisions);
      if (!d.events) d.events = sampleEvents();
      return d;
    }
  } catch (e) { /* storage blocked: fall through to fresh data */ }
  return fresh();
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* in-memory only */ }
}
const stamp = (c) => ({ ...c, updatedAt: new Date().toISOString() });

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
}
let session = readSession();

function requireSession(role) {
  if (!session) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const u = db.users.find((x) => x.id === session.userId);
  if (!u || !u.active) throw new Error('บัญชีนี้ถูกปิดใช้งาน');
  if (role && session.role !== role) throw new Error('ไม่มีสิทธิ์ทำรายการนี้');
  return session;
}
function find(id) {
  const c = db.candidates.find((x) => x.id === id);
  if (!c) throw new Error('ไม่พบผู้สมัคร ' + id);
  return c;
}
function put(next) {
  db.candidates = db.candidates.map((x) => (x.id === next.id ? stamp(next) : x));
  save();
  return next;
}
// recipient: 'HRS' or a unit code.
function notify(recipient, kind, c, title, body, link = '') {
  db.notifications.unshift({
    id: db.nextNotif++, recipient, kind, candidateId: c.id, title, body, link,
    createdAt: new Date().toISOString(), readAt: null
  });
  db.notifications = db.notifications.slice(0, 200);
}
const where = (c) => (c.interviewMode === 'onsite' ? `Onsite · ${c.interviewLocation}` : 'Online');

export const demoStore = {
  mode: 'demo',

  async listOrg() { return structuredClone(db.divisions); },
  async addDivision(name) {
    requireSession('admin');
    const clean = (name || '').trim();
    if (!clean) throw new Error('กรุณาระบุชื่อฝ่าย');
    if (db.divisions.some((d) => d.name === clean)) throw new Error(`มีฝ่ายชื่อ "${clean}" อยู่แล้ว`);
    db.divisions.push({ id: 'd' + Date.now(), name: clean, units: [] });
    save();
  },
  async renameDivision(id, name) {
    requireSession('admin');
    const clean = (name || '').trim();
    if (!clean) throw new Error('กรุณาระบุชื่อฝ่าย');
    if (db.divisions.some((d) => d.name === clean && d.id !== id)) throw new Error(`มีฝ่ายชื่อ "${clean}" อยู่แล้ว`);
    const d = db.divisions.find((x) => x.id === id);
    if (!d) throw new Error('ไม่พบฝ่ายนี้');
    d.name = clean;
    save();
  },
  async deleteDivision(id) {
    requireSession('admin');
    const d = db.divisions.find((x) => x.id === id);
    if (!d) throw new Error('ไม่พบฝ่ายนี้');
    if (d.units.length) throw new Error('ลบไม่ได้ เพราะฝ่ายนี้ยังมีแผนกอยู่');
    db.divisions = db.divisions.filter((x) => x.id !== id);
    save();
  },
  async updateUnit({ code, newCode, divisionId }) {
    requireSession('admin');
    const v = rules.validateUnitCode(newCode || code);
    const target = db.divisions.find((x) => x.id === divisionId);
    if (!target) throw new Error('ไม่พบฝ่ายนี้');
    if (v !== code && db.divisions.some((d) => d.units.includes(v))) throw new Error(`มีแผนก ${v} อยู่แล้ว`);
    db.divisions.forEach((d) => { d.units = d.units.filter((u) => u !== code); });
    target.units.push(v);
    if (v !== code) {
      const swap = (x) => (x === code ? v : x);
      db.candidates = db.candidates.map((c) => ({ ...c, location: swap(c.location), assignedBy: swap(c.assignedBy), requestedBy: swap(c.requestedBy) }));
      db.notifications = db.notifications.map((n) => ({ ...n, recipient: swap(n.recipient) }));
      db.users = db.users.map((u) => (u.unit === code ? { ...u, id: v.toLowerCase(), username: v.toLowerCase(), unit: v } : u));
    }
    save();
    return v;
  },
  async deleteUnit(code) {
    requireSession('admin');
    let n = 0;
    db.candidates = db.candidates.map((c) => {
      if (c.location !== code) return c.assignedBy === code ? { ...c, assignedBy: null } : c;
      n += 1;
      return stamp(rules.release(c));
    });
    db.divisions.forEach((d) => { d.units = d.units.filter((u) => u !== code); });
    db.users = db.users.filter((u) => u.unit !== code);
    db.notifications = db.notifications.filter((x) => x.recipient !== code);
    save();
    return n;
  },
  async addUnit({ code, divisionId, password }) {
    requireSession('admin');
    const v = rules.validateUnitCode(code);
    if (!password || password.length < CONFIG.minPasswordLength) throw new Error(`รหัสผ่านต้องมีอย่างน้อย ${CONFIG.minPasswordLength} ตัว`);
    if (db.divisions.some((d) => d.units.includes(v))) throw new Error(`มีแผนก ${v} อยู่แล้ว`);
    const d = db.divisions.find((x) => x.id === divisionId);
    if (!d) throw new Error('ไม่พบฝ่ายนี้');
    d.units.push(v);
    db.users.push({ id: v.toLowerCase(), username: v.toLowerCase(), role: 'pjt', unit: v, ownerName: '', active: true });
    save();
    return v;
  },

  async getSession() { return session; },

  async signIn({ role, unit }) {
    const expected = role === 'admin' ? 'admin-hr' : String(unit).toLowerCase();
    const u = db.users.find((x) => x.id === expected);
    if (!u) throw new Error('ไม่พบบัญชีนี้');
    if (!u.active) throw new Error(`บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อ ${HRS}`);
    session = { userId: u.id, username: u.username, role: u.role, unit: u.unit };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
    return session;
  },

  async signOut() {
    session = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  },

  // Visibility mirrors the server policy: HRS sees all, a unit sees the central pool and its own pool.
  async listCandidates() {
    const s = requireSession();
    // Same rule the server runs in release_expired_holds().
    const now = Date.now();
    db.candidates.filter((c) => rules.isExpired(c, now)).forEach((c) => {
      notify(c.location, 'hold_expired', c, `หมดเวลาพิจารณา ${c.id} ${c.name}`,
        `ครบ ${CONFIG.holdHours} ชม. โดยยังไม่ได้ตัดสินใจ ผู้สมัครถูกคืนเข้า Candidate Pool แล้ว`);
      put(rules.release(c));
    });
    const all = db.candidates.slice().sort((a, b) => (candScore(b) ?? -1) - (candScore(a) ?? -1));
    if (s.role === 'admin') return all.map((c) => ({ showSalary: false, ...c }));
    // Units never see email/phone, and see a salary only where HRS switched it on for that candidate.
    return all.filter((c) => c.location === POOL || c.location === s.unit)
      .map(({ email, phone, ...c }) => (c.showSalary ? c : { ...c, salaryCurrent: null, salaryExpected: null, showSalary: false }));
  },
  async setShowSalary(id, on) {
    requireSession('admin');
    db.candidates = db.candidates.map((x) => (x.id === id ? { ...x, showSalary: !!on } : x));
    save();
  },

  async pick(id) { const s = requireSession('pjt'); return put(rules.pjtPick(find(id), s.unit)); },
  async returnToPool(id) {
    const s = requireSession('pjt');
    const c = find(id);
    const next = put(rules.pjtReturn(c, s.unit));
    if (c.interviewStatus) notify('HRS', 'interview_cancelled', c, `${s.unit} คืน ${c.id} ${c.name} กลับ Candidate Pool`, 'นัดสัมภาษณ์ที่มีอยู่ถูกยกเลิก');
    save();
    return next;
  },
  async setDecision(id, decision, note) {
    const s = requireSession();
    const c = find(id);
    if (s.role === 'admin') return put(rules.adminDecide(c, decision, note));
    const next = put(rules.pjtDecide(c, s.unit, decision));
    if (c.interviewStatus && !next.interviewStatus) {
      notify('HRS', 'interview_cancelled', c, `${s.unit} ยกเลิกนัดสัมภาษณ์ ${c.id} ${c.name}`, `เปลี่ยนสถานะเป็น "${decision}"`);
      save();
    }
    return next;
  },
  async requestInterview(id, data) {
    const s = requireSession('pjt');
    const next = put(rules.pjtRequest(find(id), s.unit, data));
    notify('HRS', 'interview_requested', next, `${s.unit} ขอนัดสัมภาษณ์ ${next.id} ${next.name}`,
      `${rules.whenText(next.interviewAt)} · ${where(next)} · ผู้สัมภาษณ์ ${next.interviewers.length} คน`);
    save();
    return next;
  },

  // ---- HRS only ----
  async setInterview(id, data) {
    requireSession('admin');
    const next = put(rules.hrsSetInterview(find(id), data));
    if (next.location !== POOL) {
      notify(next.location, 'interview_confirmed', next, `${HRS} ยืนยันนัดสัมภาษณ์ ${next.id} ${next.name}`,
        `${rules.whenText(next.interviewAt)} · ${MODE_LABEL[next.interviewMode]}${next.interviewMode === 'onsite' ? ' · ' + next.interviewLocation : ''}${next.confirmNote ? ' · ' + next.confirmNote : ''}`,
        next.meetingLink);
      save();
    }
    return next;
  },
  async moveTo(id, location) {
    requireSession('admin');
    if (location !== POOL && !UNITS.includes(location)) throw new Error('ปลายทางไม่ถูกต้อง');
    return put(rules.adminMove(find(id), location));
  },
  async saveCandidate(record, isNew) {
    requireSession('admin');
    if (!record.id || !record.name) throw new Error('ต้องมี Candidate ID และชื่อ-นามสกุล');
    rules.assertDecision(record.decision);
    const exists = db.candidates.some((x) => x.id === record.id);
    if (isNew && exists) throw new Error(`Candidate ID ${record.id} มีอยู่แล้ว`);
    if (isNew) db.candidates.push(stamp({ ...rules.CLEARED_INTERVIEW, holdUntil: null, ...record, createdAt: new Date().toISOString() }));
    else put(record);
    save();
    return record;
  },
  async deleteCandidate(id) {
    requireSession('admin');
    db.candidates = db.candidates.filter((x) => x.id !== id);
    save();
  },
  async importCandidates(records) {
    requireSession('admin');
    const byId = new Map(db.candidates.map((c) => [c.id, c]));
    const now = new Date().toISOString();
    records.forEach((r) => {
      const old = byId.get(r.id);
      byId.set(r.id, stamp({ ...rules.CLEARED_INTERVIEW, holdUntil: null, createdAt: now, ...(old || {}), ...r }));
    });
    db.candidates = [...byId.values()];
    save();
    return records.length;
  },
  async listUsers() { requireSession('admin'); return db.users.slice(); },
  async setUserActive(id, active) {
    const s = requireSession('admin');
    if (id === s.userId && !active) throw new Error('ปิดใช้งานบัญชีที่กำลังใช้อยู่ไม่ได้');
    db.users = db.users.map((u) => (u.id === id ? { ...u, active } : u));
    save();
  },
  async updateUser(id, patch) {
    requireSession('admin');
    db.users = db.users.map((u) => (u.id === id ? { ...u, ...patch } : u));
    save();
  },
  async setPassword(user) {
    requireSession('admin');
    return 'โหมดสาธิตไม่ตรวจรหัสผ่าน จึงไม่ได้บันทึกรหัสผ่านของ ' + user.username;
  },

  // ---- notifications ----
  async listNotifications() {
    const s = requireSession();
    const me = s.role === 'admin' ? 'HRS' : s.unit;
    return db.notifications.filter((n) => n.recipient === me).slice(0, 50);
  },
  async markNotificationsRead(ids) {
    requireSession();
    const set = new Set(ids);
    const now = new Date().toISOString();
    db.notifications = db.notifications.map((n) => (set.has(n.id) && !n.readAt ? { ...n, readAt: now } : n));
    save();
  },


  // ---- usage log ----
  async logEvent({ action, candidateId = null, meta = {} }) {
    if (!session) return;
    const id = (db.events[0] ? db.events[0].id : 0) + 1;
    db.events.unshift({ id, at: new Date().toISOString(), userId: session.userId, role: session.role, unit: session.unit,
      action, candidateId, meta });
    db.events.length = Math.min(db.events.length, 5000);
    save();
  },
  async listEvents({ since } = {}) {
    requireSession('admin');
    return db.events.filter((e) => !since || e.at >= since);
  },
  async resetDemoData() { db = fresh(); save(); }
};
