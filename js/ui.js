// Shared constants, formatting helpers, modal and toast.
import { CONFIG } from './config.js';

export const POOL = 'HR';
export const HRS = CONFIG.hrsName;
// Filled from the database at start-up (setOrg); every module shares these same arrays.
export const DIVISIONS = [];
export const UNITS = [];
export const LOCATIONS = [POOL];

export function setOrg(divisions) {
  DIVISIONS.splice(0, DIVISIONS.length, ...divisions);
  UNITS.splice(0, UNITS.length, ...divisions.flatMap((d) => d.units));
  LOCATIONS.splice(1, LOCATIONS.length - 1, ...UNITS);
}
setOrg(CONFIG.divisions);

export function divisionOf(unit) {
  return DIVISIONS.find((d) => d.units.includes(unit)) || null;
}
export function unitFullLabel(unit) {
  const d = divisionOf(unit);
  return d ? `${d.name} · ${unit}` : unit;
}

export const MODE_LABEL = { online: 'Online', onsite: 'Onsite' };
export const INTERVIEW_STATUS = {
  requested: { label: `รอ ${CONFIG.hrsName} ยืนยันนัด`, color: '#FF7A3D', bg: '#FFF1E8', fg: '#7A2E00' },
  confirmed: { label: 'ยืนยันนัดแล้ว', color: '#5B3DF5', bg: '#5B3DF5', fg: '#FFFFFF' }
};
export function interviewerText(list) {
  return (list || []).map((p) => [p.name, [p.position, p.department].filter(Boolean).join(', ')].filter(Boolean).join(' — ')).join('; ');
}

export const DECISIONS = ['รอพิจารณา', 'เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว', 'ผ่านการพิจารณา', 'สำรอง', 'ไม่ผ่านการพิจารณา', 'อื่นๆ'];
// "อื่นๆ": HRS types the status itself; the text is stored in decisionNote and shown instead of "อื่นๆ".
export const OTHER = 'อื่นๆ';
export const decisionLabel = (c) => (c.decision === OTHER && c.decisionNote ? c.decisionNote : c.decision || 'รอพิจารณา');
// Statuses that keep the candidate's interview details ("ผ่านการพิจารณา" usually follows the interview;
// "อื่นๆ" is free text, so nothing is cleared on a guess).
export const KEEPS_INTERVIEW = ['เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว', 'ผ่านการพิจารณา', 'อื่นๆ'];
export const DECISION_STYLE = {
  'รอพิจารณา': { color: '#FFD84D', bg: '#FFF1C2', fg: '#5C4300' },
  'เรียกสัมภาษณ์': { color: '#C8F169', bg: '#E8FBC4', fg: '#2E4A00' },
  'นัดสัมภาษณ์แล้ว': { color: '#5B3DF5', bg: '#5B3DF5', fg: '#FFFFFF' },
  'ผ่านการพิจารณา': { color: '#1FAE6B', bg: '#CDEFDC', fg: '#0B4A2C' },
  'สำรอง': { color: '#8EC5FF', bg: '#DCE8FF', fg: '#1D3A7A' },
  'ไม่ผ่านการพิจารณา': { color: '#111111', bg: '#ECEBE7', fg: '#3D3C38' },
  'อื่นๆ': { color: '#FF8FBF', bg: '#FFE3EE', fg: '#6B1238' }
};
export const RECOMMENDATIONS = ['Strongly Recommend', 'Recommend', 'Consider', 'Review'];
// Stored in English (database and Excel keys); shown in Thai.
export const REC_LABEL = {
  'Strongly Recommend': 'แนะนำอย่างยิ่ง', Recommend: 'แนะนำ', Consider: 'ควรพิจารณา', Review: 'ทบทวน'
};
export const recLabel = (r) => REC_LABEL[r] || r || '';
// Comparison dimensions. HRS scores each 1–5; stored as candidates.scores (supabase/009_*.sql).
// source = what HRS reads in the resume (shown as the hover tip); aim = what the score tells you.
export const DIMENSIONS = [
  { key: 'exp', label: 'ประสบการณ์', full: 'ประสบการณ์',
    source: 'บริษัท ประเภทธุรกิจ ตำแหน่ง ระยะเวลา ขนาดงาน และขอบเขตความรับผิดชอบ',
    aim: 'เคยทำอะไร ในบริบทใด และรับผิดชอบระดับไหน' },
  { key: 'skill', label: 'ความรู้และทักษะ', full: 'ความรู้และทักษะ',
    source: 'ความรู้เฉพาะทาง โปรแกรม เครื่องมือ ระบบ ภาษา และตัวอย่างการใช้งาน',
    aim: 'มีทักษะอะไร และมีตัวอย่างใช้งานจริงรองรับแค่ไหน' },
  { key: 'result', label: 'ผลงาน', full: 'ผลงานและผลลัพธ์',
    source: 'โครงการ รางวัล บทบาทที่ลงมือทำ และผลลัพธ์ที่เป็นตัวเลขหรือคุณภาพ',
    aim: 'แยกหน้าที่ออกจากผลลัพธ์ และดูว่าเป็นผลงานของตนเองหรือของทีม' },
  { key: 'career', label: 'เส้นทางอาชีพ', full: 'เส้นทางอาชีพและการเปลี่ยนงาน',
    source: 'ลำดับงาน วันเริ่ม–สิ้นสุด การเลื่อนตำแหน่ง และเหตุผลย้ายงาน',
    aim: 'ทิศทางและความต่อเนื่องของอาชีพ และช่วงที่ต้องถามเพิ่ม' },
  { key: 'learn', label: 'การเรียนรู้', full: 'การศึกษาและการพัฒนาตนเอง',
    source: 'การศึกษา ใบอนุญาต ใบรับรอง หลักสูตรอบรม และการนำความรู้ไปใช้',
    aim: 'พื้นฐานและการเรียนรู้ต่อเนื่อง ไม่ตัดสินจากชื่อสถาบันหรือจำนวนใบประกาศ' },
  { key: 'trust', label: 'ความน่าเชื่อถือ', full: 'ความน่าเชื่อถือของข้อมูลใน Resume',
    source: 'ความสอดคล้องของวันที่ ตำแหน่ง ตัวเลข ผลงาน และหลักฐานใน Resume',
    aim: 'ข้อมูลครบ ชัด สอดคล้องแค่ไหน และข้อใดต้องยืนยัน ไม่ได้ตัดสินความซื่อสัตย์' },
  { key: 'tech', label: 'Tech & AI', full: 'การนำเทคโนโลยีและ AI มาใช้ในการทำงาน',
    source: 'เครื่องมือดิจิทัล ระบบอัตโนมัติ หรือ AI ที่ใช้กับงานจริง พร้อมบทบาทและผลลัพธ์',
    aim: 'นำเทคโนโลยีไปปรับปรุงงานได้จริงแค่ไหน มากกว่าแค่ใช้เครื่องมือเป็น' }
];
// Attributes for an element that shows this dimension's tip on hover, focus or tap.
export const dimTip = (d) => `data-tip="${esc(d.key)}" tabindex="0"`;
// A small "i" button placed after a dimension name.
export const dimInfo = (d) => `<span class="tip-i" role="button" aria-label="คำอธิบาย ${esc(d.full)}" ${dimTip(d)}>i</span>`;

// One floating tip for the whole app: works on HTML and SVG elements and is never
// clipped by scrolling containers. Mouse hover, keyboard focus and tap all open it.
let tipEl = null, tipFor = null;
function tipHTML(key) {
  const d = DIMENSIONS.find((x) => x.key === key);
  if (!d) return '';
  return `<span>${esc(d.source)}</span>`;
}
function showTip(target) {
  const html = tipHTML(target.getAttribute('data-tip'));
  if (!html) return;
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.id = 'app-tip';
    document.body.appendChild(tipEl);
  }
  tipFor = target;
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  target.setAttribute('aria-describedby', 'app-tip');
  const r = target.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
  const above = r.top - t.height - 10;
  const top = above >= 8 ? above : r.bottom + 10;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
  tipEl.classList.toggle('below', above < 8);
  tipEl.style.setProperty('--arrow', `${Math.max(14, Math.min(t.width - 14, r.left + r.width / 2 - left))}px`);
}
function hideTip() {
  if (tipEl) tipEl.hidden = true;
  if (tipFor) tipFor.removeAttribute('aria-describedby');
  tipFor = null;
}
export function initTips() {
  const at = (e) => e.target instanceof Element && e.target.closest('[data-tip]');
  document.addEventListener('mouseover', (e) => { const t = at(e); if (t && t !== tipFor) showTip(t); else if (!t && tipFor) hideTip(); });
  document.addEventListener('focusin', (e) => { const t = at(e); if (t) showTip(t); });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('click', (e) => { const t = at(e); if (t) showTip(t); else hideTip(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  addEventListener('scroll', hideTip, true);
  addEventListener('resize', hideTip);
}
// Keeps only known keys with a whole score 1–5.
export function cleanScores(s) {
  const out = {};
  for (const d of DIMENSIONS) {
    const v = Number(s && s[d.key]);
    if (s && s[d.key] !== '' && s[d.key] != null && Number.isInteger(v) && v >= 1 && v <= 5) out[d.key] = v;
  }
  return out;
}
// Candidate Score: the dimension scores as 0–1 (sum ÷ 5 × dimensions scored), null if none scored.
// All seven at 5 = 100%; a partly scored candidate is judged on what HRS has scored so far.
export function candScore(c) {
  const v = DIMENSIONS.map((d) => (c.scores || {})[d.key]).filter((x) => Number.isInteger(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / (5 * v.length) : null;
}
export const scoredDims = (c) => DIMENSIONS.filter((d) => Number.isInteger((c.scores || {})[d.key])).length;
// The next `count` Candidate IDs, continuing the pattern of the most recently added candidate:
// latest C030 -> C031, C032 … (same prefix, same zero padding, after the highest number in use).
export function nextCandidateIds(list, count = 1) {
  const parse = (id) => { const m = /^(.*?)(\d+)$/.exec(String(id || '').trim()); return m && { prefix: m[1], digits: m[2] }; };
  const latest = list.filter((c) => parse(c.id))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const base = latest ? parse(latest.id) : { prefix: 'C', digits: '000' };
  let n = Math.max(0, ...list.map((c) => parse(c.id)).filter((p) => p && p.prefix === base.prefix).map((p) => Number(p.digits)));
  const taken = new Set(list.map((c) => c.id));
  const out = [];
  while (out.length < count) {
    const id = base.prefix + String(++n).padStart(base.digits.length, '0');
    if (!taken.has(id)) out.push(id);
  }
  return out;
}
// Accepts the English key or its Thai label; returns the English key, or '' if neither.
export const recKey = (s) => {
  const t = String(s ?? '').trim();
  return RECOMMENDATIONS.find((r) => r.toLowerCase() === t.toLowerCase() || REC_LABEL[r] === t) || '';
};

const LOC_STYLE = [
  { color: '#FF7A3D', shape: '999px' },
  { color: '#5B3DF5', shape: '999px' },
  { color: '#2F9E44', shape: '12px 12px 0 0' },
  { color: '#1C7ED6', shape: '0 0 0 12px' },
  { color: '#111111', shape: '3px' }
];
export function locStyle(loc) {
  const i = LOCATIONS.indexOf(loc);
  return LOC_STYLE[i < 0 ? 0 : i % LOC_STYLE.length];
}
export function locLabel(loc) {
  return loc === POOL ? 'Candidate Pool' : loc;
}

// "New" = entered the system within CONFIG.newDays.
export function isNew(c) {
  return !!c.createdAt && Date.now() - new Date(c.createdAt).getTime() < CONFIG.newDays * 86400000;
}
export const NEW_BADGE = '<span class="new-badge">New</span>';
// Same badge pinned to the top-left corner of a card (the card is position: relative).
export const NEW_TAG = '<span class="new-badge new-tag">New</span>';

// Time left before a picked candidate returns to the Candidate Pool, or null.
// clock = "HH:MM:SS" counting down in hours; share = fraction of the window left.
export function holdLeft(c) {
  if (!c.holdUntil || c.decision !== 'รอพิจารณา') return null;
  const ms = new Date(c.holdUntil).getTime() - Date.now();
  const left = Math.max(0, ms);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const two = (n) => String(n).padStart(2, '0');
  return {
    ms, urgent: ms < 12 * 3600000,
    text: ms <= 0 ? 'หมดเวลาแล้ว' : h ? `${h} ชม. ${m} นาที` : `${m} นาที`,
    clock: `${two(h)}:${two(m)}:${two(s)}`,
    share: Math.min(1, left / (CONFIG.holdHours * 3600000))
  };
}

// Logo: back to the start page of this account with a full reload (fresh data).
export function goHome(hash) {
  history.replaceState(null, '', hash);
  location.reload();
}

const AVATARS = [
  { bg: '#5B3DF5', fg: '#FFFFFF', shape: '999px' },
  { bg: '#FF7A3D', fg: '#111111', shape: '26px 26px 8px 26px' },
  { bg: '#C8F169', fg: '#111111', shape: '999px' },
  { bg: '#111111', fg: '#FFFFFF', shape: '8px 26px 26px 26px' },
  { bg: '#8EC5FF', fg: '#111111', shape: '999px' },
  { bg: '#FFB3D1', fg: '#111111', shape: '26px 8px 26px 26px' },
  { bg: '#FFD84D', fg: '#111111', shape: '999px' }
];
export function avatarFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Only http(s) links may become an href: blocks javascript:, data: and similar.
export const isWebUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || '').trim());
export const safeUrl = (u) => (isWebUrl(u) ? String(u).trim() : '');

export function recommendationFor(c) {
  if (c.recommendation) return c.recommendation;
  const s = candScore(c);
  if (s == null) return '';
  return s >= 0.9 ? 'Strongly Recommend' : s >= 0.8 ? 'Recommend' : 'Consider';
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`;
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const t = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fmtDate(iso)} · ${t} น.`;
}
// ISO string -> value for <input type="datetime-local">
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function baht(n) {
  return n == null || n === '' ? '—' : Number(n).toLocaleString('th-TH') + ' ฿';
}
// Candidate Score scale, high to low: green ≥ 80, yellow ≥ 70, orange ≥ 50, red below.
// text = readable on white, fill = bar colour.
export function matchColor(m) {
  if (m == null) return { text: '#5F5E58', fill: '#CFCDC6' };
  if (m >= 0.8) return { text: '#2B8A3E', fill: '#40C057' };
  if (m >= 0.7) return { text: '#946200', fill: '#FAB005' };
  if (m >= 0.5) return { text: '#D9480F', fill: '#FD7E14' };
  return { text: '#C92A2A', fill: '#E03131' };
}
// Shown wherever dimension scores are entered or read.
export const SCORE_NOTE = 'คะแนนในแต่ละมิติมาจากการประเมิน Resume ของผู้สมัคร อาจจะไม่ได้สะท้อนคุณภาพจริงได้อย่างชัดเจน';
export const scoreNote = (cls = '') => `<p class="score-note ${cls}" role="note">${ICONS.info}<span>${SCORE_NOTE}</span></p>`;
// Pre-interview label (English on purpose), shown only once HRS has ticked Pre-interview.
export const preTag = (c) => (c.preInterviewed
  ? '<span class="pre-tag yes">Pre-interviewed</span>'
  : '');
// Who writes the comment shown to units (hrNote).
export const NOTE_FROM = 'Recruit';
// First n characters of s on one line, counting a Thai letter with its vowel/tone marks as one.
const graphemes = (s) => (typeof Intl !== 'undefined' && Intl.Segmenter
  ? Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(s), (g) => g.segment) : Array.from(s));
export function clip(s, n = 30) {
  const g = graphemes(String(s || '').replace(/\s+/g, ' ').trim());
  return g.length > n ? g.slice(0, n).join('').trimEnd() + '…' : g.join('');
}
export function pct(m) {
  return m == null ? '—' : Math.round(m * 100) + '%';
}

export const ICONS = {
  calendar: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  arrow: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  logout: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  search: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5F5E58" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  close: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  doc: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  info: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
  shield: '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B23C9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  bell: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  video: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/></svg>',
  pin: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  radar: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 6.5-3.5 10.5h-11L3 8.5z"/><path d="M12 7l4.5 3.3-1.7 5.2H9.2l-1.7-5.2z"/></svg>',
  trash: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  chevL: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  chevR: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  more: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  down: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  upload: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  download: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  refresh: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>'
};

export const LOGO = '<div class="logo-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>';

/* ---------- toast ---------- */
export function toast(message, { action, onAction, error = false, timeout = 6000 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.innerHTML = `<span>${esc(message)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '');
  root.appendChild(el);
  const remove = () => el.remove();
  if (action) el.querySelector('button').onclick = () => { remove(); onAction && onAction(); };
  import('./anim.js').then((a) => a.rise(el, 16));
  setTimeout(remove, timeout);
}

/* ---------- modal ---------- */
// Renders html into a dialog. `bind(dialogEl, close)` wires events. Returns close().
export function openModal(html, bind, { wide = false } = {}) {
  const root = document.getElementById('modal-root');
  const opener = document.activeElement;
  root.innerHTML = `<div class="modal-backdrop"><div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${html}</div></div>`;
  const backdrop = root.firstElementChild;
  const dialog = backdrop.firstElementChild;
  const close = () => {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    if (opener && opener.focus) opener.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = dialog.querySelectorAll('button, [href], input, select, textarea');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  bind && bind(dialog, close);
  const focusable = dialog.querySelector('input, select, textarea, button:not([data-close])');
  (focusable || dialog).focus();
  import('./anim.js').then((a) => a.pop(dialog));
  return close;
}

export function confirmDialog({ title, body, confirm = 'ยืนยัน', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const close = openModal(`
      <div class="modal-head"><h2 id="modal-title">${esc(title)}</h2></div>
      <p class="muted" style="font-size:15px;line-height:1.7">${esc(body)}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>ยกเลิก</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-dark'}" data-ok>${esc(confirm)}</button>
      </div>`, (dlg, closeFn) => {
      dlg.querySelector('[data-ok]').onclick = () => { done = true; closeFn(); resolve(true); };
      const obs = new MutationObserver(() => {
        if (!dlg.isConnected) { obs.disconnect(); if (!done) resolve(false); }
      });
      obs.observe(document.getElementById('modal-root'), { childList: true });
    });
    return close;
  });
}

export function errorMessage(e) {
  return (e && (e.message || e.error_description)) || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

// Overflow menu: one button that opens a short list of less-used actions, so pages show only the
// main action up front. Items keep their data-* attributes, so the views' click handlers still work.
// items: [{ label, attrs, icon, danger, href, for, sep }] — for makes a label for a file input; sep draws a divider.
export function menuHTML({ label = '', icon = ICONS.more, title = 'ตัวเลือกเพิ่มเติม', cls = 'btn btn-sm', align = 'right', items }) {
  const list = items.filter(Boolean).map((it) => {
    const inner = `${it.icon || ''}<span>${esc(it.label)}</span>`;
    const cl = `menu-item${it.danger ? ' danger' : ''}`;
    const el = it.href ? `<a class="${cl}" role="menuitem" href="${esc(it.href)}" ${it.attrs || ''}>${inner}</a>`
      : it.for ? `<label class="${cl}" role="menuitem" for="${esc(it.for)}" ${it.attrs || ''}>${inner}</label>`
      : `<button type="button" class="${cl}" role="menuitem" ${it.attrs || ''}>${inner}</button>`;
    return (it.sep ? '<hr class="menu-sep">' : '') + el;
  }).join('');
  return `<details class="menu menu-${align}"><summary class="${cls}" title="${esc(title)}" aria-label="${esc(label || title)}">${icon}${label ? `<span>${esc(label)}</span>` : ''}</summary><div class="menu-list" role="menu">${list}</div></details>`;
}
// One document listener closes open menus on an outside click, after choosing an item, or on Escape.
export function initMenus() {
  const closeAll = (keep) => document.querySelectorAll('details.menu[open]').forEach((d) => { if (d !== keep) d.open = false; });
  document.addEventListener('click', (e) => {
    const m = e.target instanceof Element && e.target.closest('details.menu');
    if (!m) return closeAll();
    closeAll(m);
    if (e.target.closest('.menu-item')) setTimeout(() => { m.open = false; }, 0);
  });
  // The list is placed with fixed coordinates so a scrolling table or card can't clip it;
  // it opens upwards when there is no room below. Scrolling closes it rather than leaving it adrift.
  document.addEventListener('toggle', (e) => {
    const m = e.target;
    if (!(m instanceof HTMLDetailsElement) || !m.classList.contains('menu') || !m.open) return;
    const list = m.querySelector('.menu-list');
    // Entrance animations leave transform: translateY(0) on rows and cards; a transformed ancestor
    // turns position:fixed into "relative to that ancestor" and the list lands off-screen.
    for (let a = m.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.transform !== 'none' || cs.filter !== 'none' || cs.willChange.includes('transform')) {
        a.style.transform = 'none'; a.style.filter = 'none'; a.style.willChange = 'auto';
      }
    }
    const r = m.querySelector('summary').getBoundingClientRect();
    list.style.cssText = 'position:fixed;visibility:hidden';
    const w = list.offsetWidth, h = list.offsetHeight;
    const left = m.classList.contains('menu-left') ? r.left : r.right - w;
    const up = r.bottom + 6 + h > innerHeight && r.top - 6 - h > 0;
    list.style.cssText = `position:fixed;left:${Math.max(8, Math.min(left, innerWidth - w - 8))}px;top:${up ? r.top - 6 - h : r.bottom + 6}px;right:auto;bottom:auto`;
  }, true);
  addEventListener('scroll', (e) => { if (!(e.target instanceof Element && e.target.closest('.menu-list'))) closeAll(); }, true);
  addEventListener('resize', () => closeAll());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const m = document.querySelector('details.menu[open]');
    if (m) { m.open = false; m.querySelector('summary').focus(); }
  });
}
