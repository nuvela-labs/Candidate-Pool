// Business rules shared by both stores. The Supabase store enforces the same
// rules again on the server (supabase/*.sql); these keep demo mode honest.
import { POOL, DECISIONS, KEEPS_INTERVIEW, OTHER, HRS } from '../ui.js';
import { CONFIG } from '../config.js';

export const CLEARED_INTERVIEW = {
  interviewAt: null, interviewMode: null, interviewStatus: null, interviewers: [],
  interviewLocation: '', meetingLink: '', projectName: '', remark: '',
  requestedBy: null, requestedAt: null, confirmedAt: null, confirmNote: ''
};
const MODES = ['online', 'onsite'];

// An interview can only be booked for a time still ahead of now.
export const PAST_MSG = 'วันและเวลานี้ผ่านไปแล้ว กรุณาเลือกวันและเวลาที่ยังไม่ถึง';
export const isPast = (at) => new Date(at).getTime() <= Date.now();

// Unit codes become account names and pool keys: upper-case letters, digits, hyphen.
export function validateUnitCode(code) {
  const v = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(v)) throw new Error('รหัสแผนกใช้ได้เฉพาะ A–Z, 0–9 และ - ยาว 2–20 ตัว เช่น ENG-01');
  if (v === POOL) throw new Error('ใช้รหัส HR เป็นรหัสแผนกไม่ได้');
  return v;
}

export function assertDecision(decision) {
  if (!DECISIONS.includes(decision)) throw new Error('สถานะไม่ถูกต้อง: ' + decision);
}

// Interview data from the form, checked the same way for units and HRS.
export function validateInterview(s, { requireLink = false } = {}) {
  if (!s.interviewAt) throw new Error('กรุณาระบุวันและเวลาสัมภาษณ์');
  if (isPast(s.interviewAt)) throw new Error(PAST_MSG);
  if (!MODES.includes(s.interviewMode)) throw new Error('กรุณาเลือก Online หรือ Onsite');
  const people = (s.interviewers || []).filter((p) => p.name || p.position || p.department);
  if (!people.length) throw new Error('กรุณาระบุผู้สัมภาษณ์อย่างน้อย 1 คน');
  if (people.some((p) => !p.name || !p.position || !p.department)) {
    throw new Error('กรุณากรอกชื่อ-สกุล ตำแหน่ง และฝ่าย ของผู้สัมภาษณ์ให้ครบทุกคน');
  }
  if (s.interviewMode === 'onsite' && !s.interviewLocation) throw new Error('กรุณาระบุสถานที่สัมภาษณ์');
  if (requireLink && s.interviewMode === 'online' && !/^https?:\/\/[^\s]+$/i.test((s.meetingLink || '').trim())) {
    throw new Error('กรุณาใส่ลิงก์เข้าสัมภาษณ์ Online ที่ขึ้นต้นด้วย https://');
  }
  return { ...s, interviewers: people };
}

// A PJT may only act on candidates in its own pool, and pick only from the central pool.
export function pjtPick(c, unit) {
  if (c.location !== POOL) throw new Error(`${c.id} ไม่อยู่ใน Candidate Pool แล้ว อาจถูกแผนกอื่นเลือกไป`);
  return {
    ...c, ...CLEARED_INTERVIEW, location: unit, assignedBy: unit, decision: 'รอพิจารณา',
    holdUntil: new Date(Date.now() + CONFIG.holdHours * 3600000).toISOString()
  };
}
export function pjtReturn(c, unit) {
  if (c.location !== unit) throw new Error(`${c.id} ไม่ได้อยู่ใน Pool ของ ${unit}`);
  return { ...c, ...CLEARED_INTERVIEW, location: POOL, assignedBy: null, decision: 'รอพิจารณา', holdUntil: null };
}
// Any decision other than "รอพิจารณา" stops the 72-hour clock for good.
export function pjtDecide(c, unit, decision) {
  if (c.location !== unit) throw new Error(`${c.id} ไม่ได้อยู่ใน Pool ของ ${unit}`);
  assertDecision(decision);
  if (decision === 'นัดสัมภาษณ์แล้ว') throw new Error(`สถานะนี้ตั้งได้เมื่อ ${HRS} ยืนยันนัดเท่านั้น`);
  if (decision === OTHER) throw new Error(`สถานะนี้ตั้งได้โดย ${HRS} เท่านั้น`);
  return {
    ...c, ...(decision === 'เรียกสัมภาษณ์' ? {} : CLEARED_INTERVIEW), decision,
    holdUntil: decision === 'รอพิจารณา' ? c.holdUntil : null
  };
}
// Candidates still undecided after the hold go back to the Candidate Pool.
export function isExpired(c, now = Date.now()) {
  return c.holdUntil && c.decision === 'รอพิจารณา' && c.location !== POOL && new Date(c.holdUntil).getTime() <= now;
}
export function release(c) {
  return { ...c, ...CLEARED_INTERVIEW, location: POOL, assignedBy: null, decision: 'รอพิจารณา', holdUntil: null };
}
// The unit asks HRS to book an interview; HRS must confirm it.
export function pjtRequest(c, unit, s) {
  if (c.location !== unit) throw new Error(`${c.id} ไม่ได้อยู่ใน Pool ของ ${unit}`);
  const v = validateInterview(s);
  return {
    ...c, ...CLEARED_INTERVIEW, decision: 'เรียกสัมภาษณ์', interviewStatus: 'requested', holdUntil: null,
    interviewAt: v.interviewAt, interviewMode: v.interviewMode, interviewers: v.interviewers,
    interviewLocation: v.interviewMode === 'onsite' ? v.interviewLocation : '',
    projectName: v.projectName || '', remark: v.remark || '',
    requestedBy: unit, requestedAt: new Date().toISOString()
  };
}
// HRS books or confirms the interview (online needs a meeting link).
export function hrsSetInterview(c, s) {
  const v = validateInterview(s, { requireLink: true });
  return {
    ...c, decision: 'นัดสัมภาษณ์แล้ว', interviewStatus: 'confirmed', holdUntil: null,
    interviewAt: v.interviewAt, interviewMode: v.interviewMode, interviewers: v.interviewers,
    interviewLocation: v.interviewMode === 'onsite' ? v.interviewLocation : '',
    meetingLink: v.interviewMode === 'online' ? v.meetingLink : '',
    projectName: v.projectName || '', remark: v.remark || '', confirmNote: v.confirmNote || '',
    requestedBy: c.requestedBy || null, requestedAt: c.requestedAt || null,
    confirmedAt: new Date().toISOString()
  };
}
// HRS moves keep the record but reset the decision when the pool changes.
export function adminMove(c, location) {
  if (c.location === location) return c;
  return {
    ...c, ...CLEARED_INTERVIEW, location, decision: 'รอพิจารณา', holdUntil: null,
    assignedBy: location === POOL ? null : 'HR'
  };
}
// "อื่นๆ" needs the text HRS typed (1–60 characters); any other status drops that text.
export function decisionNote(decision, note) {
  if (decision !== OTHER) return null;
  const t = String(note || '').trim();
  if (!t) throw new Error('กรุณาพิมพ์สถานะ');
  if (t.length > 60) throw new Error('สถานะยาวได้ไม่เกิน 60 ตัวอักษร');
  return t;
}
export function adminDecide(c, decision, note) {
  assertDecision(decision);
  const keep = KEEPS_INTERVIEW.includes(decision);
  return { ...c, ...(keep ? {} : CLEARED_INTERVIEW), decision, decisionNote: decisionNote(decision, note), holdUntil: decision === 'รอพิจารณา' ? c.holdUntil : null };
}

// Notification text, shared so demo and server read the same.
const two = (n) => String(n).padStart(2, '0');
export function whenText(iso) {
  const d = new Date(iso);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear() + 543} ${two(d.getHours())}:${two(d.getMinutes())} น.`;
}
