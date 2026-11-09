// Supabase store: real sign-in and shared data.
// Permissions are enforced server-side by row-level security and the functions
// in supabase/*.sql; the checks here only give friendlier messages.
import { CONFIG, accountEmail } from '../config.js';
import { validateInterview, validateUnitCode, decisionNote } from './rules.js';
import { loadLib } from '../cdn.js';
import { candScore, KEEPS_INTERVIEW } from '../ui.js';

let client = null;
let profile = null;

async function sb() {
  if (client) return client;
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
    throw new Error('ยังไม่ได้ตั้งค่า supabaseUrl และ supabaseAnonKey ใน js/config.js');
  }
  const { createClient } = await loadLib('supabase');
  client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  return client;
}

const fromRow = (r) => ({
  id: r.id, name: r.name, position: r.position, age: r.age, experience: r.experience,
  education: r.education, company: r.company, cvUrl: r.cv_url,
  match: r.hr_match == null ? null : Number(r.hr_match), prescreenDate: r.prescreen_date,
  recommendation: r.recommendation, hrNote: r.hr_note, decision: r.decision === 'ไม่พิจารณา' ? 'ไม่ผ่านการพิจารณา' : r.decision, decisionNote: r.decision_note || '',
  interviewAt: r.interview_at, interviewMode: r.interview_mode, interviewStatus: r.interview_status,
  interviewers: Array.isArray(r.interviewers) ? r.interviewers : [],
  interviewLocation: r.interview_location || '', meetingLink: r.meeting_link || '',
  projectName: r.project_name || '', remark: r.remark || '',
  requestedBy: r.interview_requested_by, requestedAt: r.interview_requested_at,
  confirmedAt: r.interview_confirmed_at, confirmNote: r.interview_confirm_note || '',
  location: r.location, assignedBy: r.assigned_by, updatedAt: r.updated_at,
  createdAt: r.created_at, holdUntil: r.hold_until,
  scores: r.scores && typeof r.scores === 'object' ? r.scores : {},
  preInterviewed: !!r.pre_interviewed
});
// created_at and hold_until are managed by the database (default + trigger), never sent.
// Salaries live in candidate_salaries (see supabase/007_salary_visibility.sql).
const toRow = (c) => ({
  id: c.id, name: c.name, position: c.position || null, age: c.age ?? null,
  experience: c.experience ?? null, education: c.education || null, company: c.company || null,
  cv_url: c.cvUrl || null,
  hr_match: c.match ?? null, prescreen_date: c.prescreenDate || null,
  recommendation: c.recommendation || null, hr_note: c.hrNote || null,
  decision: c.decision || 'รอพิจารณา', decision_note: c.decision === 'อื่นๆ' ? c.decisionNote || null : null,
  interview_at: c.interviewAt || null, interview_mode: c.interviewMode || null,
  interview_status: c.interviewStatus || null, interviewers: c.interviewers || [],
  interview_location: c.interviewLocation || null, meeting_link: c.meetingLink || null,
  project_name: c.projectName || null, remark: c.remark || null,
  interview_requested_by: c.requestedBy || null, interview_requested_at: c.requestedAt || null,
  interview_confirmed_at: c.confirmedAt || null, interview_confirm_note: c.confirmNote || null,
  location: c.location || 'HR', assigned_by: c.assignedBy || null,
  // Sent only when the record carries scores, so a workbook without score columns keeps them.
  ...(c.scores ? { scores: c.scores } : {}),
  // Likewise pre_interviewed: only when the record says (form, or a sheet with that column).
  ...(typeof c.preInterviewed === 'boolean' ? { pre_interviewed: c.preInterviewed } : {})
});
// show_salary is sent only when the record carries it (the HRS form), so an Excel
// import never changes who may see a salary.
const toSalaryRow = (c) => ({
  candidate_id: c.id, salary_current: c.salaryCurrent ?? null, salary_expected: c.salaryExpected ?? null,
  ...(typeof c.showSalary === 'boolean' ? { show_salary: c.showSalary } : {})
});
// Email and phone live in candidate_contacts, readable by HRS only (011_candidate_contacts.sql).
// Written only when the record carries them, so an Excel sheet without those columns keeps them.
const hasContact = (c) => 'email' in c || 'phone' in c;
const toContactRow = (c) => ({ candidate_id: c.id, email: c.email || null, phone: c.phone || null });
const CLEAR_INTERVIEW_ROW = {
  interview_at: null, interview_mode: null, interview_status: null, interviewers: [],
  interview_location: null, meeting_link: null, project_name: null, remark: null,
  interview_requested_by: null, interview_requested_at: null,
  interview_confirmed_at: null, interview_confirm_note: null
};

const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// Candidates already downloaded by this account, kept between page reloads of the list.
const SYNC_OVERLAP_MS = 60000;
const cache = { rows: new Map(), since: null, sal: new Map(), salSince: null };
const later = (a, b) => (!a || b > a ? b : a);
function remember(r) {
  cache.rows.set(r.id, fromRow(r));
  cache.since = later(cache.since, r.updated_at);
}
function rememberSalary(r) {
  cache.sal.set(r.candidate_id, { salaryCurrent: r.salary_current, salaryExpected: r.salary_expected, showSalary: r.show_salary });
  cache.salSince = later(cache.salSince, r.updated_at);
}
const forget = () => { cache.rows.clear(); cache.since = null; cache.sal.clear(); cache.salSince = null; };
const sinceWithOverlap = (iso) => new Date(new Date(iso).getTime() - SYNC_OVERLAP_MS).toISOString();

async function loadProfile() {
  const c = await sb();
  const { data: { user } } = await c.auth.getUser();
  if (!user) { profile = null; return null; }
  const p = check(await c.from('profiles').select('*').eq('id', user.id).maybeSingle());
  profile = p;
  return p;
}

// Accounts are shown by name (hrs, pjt-pd-1 …), never by their internal email.
const accountName = (p) => (p.role === 'admin' ? CONFIG.hrsName.toLowerCase() : String(p.unit).toLowerCase());
const isAdmin = () => profile && profile.role === 'admin';

export const supabaseStore = {
  mode: 'supabase',

  // ฝ่าย › แผนก list. Readable before sign-in (the login page needs it).
  // Falls back to config.js until supabase/005_divisions.sql has been run.
  async listOrg() {
    const c = await sb();
    const [d, u] = await Promise.all([
      c.from('divisions').select('id,name,sort').order('sort').order('name'),
      c.from('units').select('code,division_id,sort').order('sort').order('code')
    ]);
    if (d.error || u.error) return CONFIG.divisions;
    return d.data.map((x) => ({ id: x.id, name: x.name, units: u.data.filter((y) => y.division_id === x.id).map((y) => y.code) }));
  },
  async addDivision(name) {
    const c = await sb();
    const clean = (name || '').trim();
    if (!clean) throw new Error('กรุณาระบุชื่อฝ่าย');
    const { error } = await c.from('divisions').insert({ name: clean });
    if (error) throw new Error(error.code === '23505' ? `มีฝ่ายชื่อ "${clean}" อยู่แล้ว` : error.message);
  },
  async renameDivision(id, name) {
    const c = await sb();
    const clean = (name || '').trim();
    if (!clean) throw new Error('กรุณาระบุชื่อฝ่าย');
    const { data, error } = await c.from('divisions').update({ name: clean }).eq('id', id).select('id');
    if (error) throw new Error(error.code === '23505' ? `มีฝ่ายชื่อ "${clean}" อยู่แล้ว` : error.message);
    if (!data.length) throw new Error('ไม่พบฝ่ายนี้ หรือไม่มีสิทธิ์แก้ไข');
  },
  // The units foreign key stops a ฝ่าย that still has แผนก from being deleted.
  async deleteDivision(id) {
    const c = await sb();
    const { data, error } = await c.from('divisions').delete().eq('id', id).select('id');
    if (error) throw new Error(error.code === '23503' ? 'ลบไม่ได้ เพราะฝ่ายนี้ยังมีแผนกอยู่' : error.message);
    if (!data.length) throw new Error('ลบไม่สำเร็จ กรุณารัน supabase/007_salary_visibility.sql ก่อน');
  },
  // Move a unit to another ฝ่าย and/or give it a new code (renames its account and pool).
  async updateUnit({ code, newCode, divisionId }) {
    const c = await sb();
    const v = validateUnitCode(newCode || code);
    return check(await c.rpc('admin_update_unit', { p_code: code, p_new_code: v, p_division: divisionId }));
  },
  // Returns how many candidates went back to the Candidate Pool.
  async deleteUnit(code) {
    const c = await sb();
    return check(await c.rpc('admin_delete_unit', { p_code: code }));
  },
  // Creates the unit, its login account and its profile in one server function.
  async addUnit({ code, divisionId, password }) {
    const c = await sb();
    const v = validateUnitCode(code);
    if (!password || password.length < CONFIG.minPasswordLength) throw new Error(`รหัสผ่านต้องมีอย่างน้อย ${CONFIG.minPasswordLength} ตัว`);
    check(await c.rpc('admin_create_unit', { p_code: v, p_division: divisionId, p_password: password }));
    return v;
  },

  async getSession() {
    const c = await sb();
    const { data } = await c.auth.getSession();
    if (!data.session) return null;
    const p = profile || await loadProfile();
    if (!p || !p.active) return null;
    return { userId: p.id, username: accountName(p), role: p.role, unit: p.unit };
  },

  async signIn({ role, unit, password }) {
    const c = await sb();
    if (role !== 'admin' && !unit) throw new Error('กรุณาเลือกแผนก');
    const email = accountEmail(role, unit);
    if (!password) throw new Error('กรุณาใส่รหัสผ่าน');
    forget();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error('รหัสผ่านไม่ถูกต้อง');
    const p = await loadProfile();
    const fail = async (msg) => { await c.auth.signOut(); profile = null; throw new Error(msg); };
    if (!p) return fail(`บัญชีนี้ยังไม่ได้กำหนดสิทธิ์ กรุณาติดต่อ ${CONFIG.hrsName}`);
    if (!p.active) return fail(`บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อ ${CONFIG.hrsName}`);
    return { userId: p.id, username: accountName(p), role: p.role, unit: p.unit };
  },

  async signOut() { const c = await sb(); profile = null; forget(); await c.auth.signOut(); },

  // Downloads full rows only for candidates changed since the last load; for the
  // rest it fetches just the ids still visible to this account, so deleted rows
  // and candidates taken by another unit drop out of the cached list.
  async listCandidates() {
    const c = await sb();
    // Return candidates whose 72-hour decision window has passed (no cron needed:
    // every page load runs it). Failure here must not block the list.
    try { await c.rpc('release_expired_holds'); } catch (e) { /* ignore */ }
    if (!cache.rows.size) {
      check(await c.from('candidates').select('*')).forEach(remember);
    } else {
      // Look back a little so a write committed just after the last load is not missed.
      const [ids, changed] = await Promise.all([
        c.from('candidates').select('id'),
        c.from('candidates').select('*').gt('updated_at', sinceWithOverlap(cache.since))
      ]);
      const visible = new Set(check(ids).map((r) => r.id));
      for (const id of cache.rows.keys()) if (!visible.has(id)) cache.rows.delete(id);
      check(changed).forEach(remember);
    }
    // Salaries: a unit receives only the rows HRS marked show_salary. The id list
    // drops salaries HRS has hidden again since the last load.
    const cols = 'candidate_id,salary_current,salary_expected,show_salary,updated_at';
    const [ids, changed] = await Promise.all([
      c.from('candidate_salaries').select('candidate_id'),
      cache.salSince
        ? c.from('candidate_salaries').select(cols).gt('updated_at', sinceWithOverlap(cache.salSince))
        : c.from('candidate_salaries').select(cols)
    ]);
    if (!ids.error && !changed.error) {
      const shown = new Set(ids.data.map((r) => r.candidate_id));
      for (const id of cache.sal.keys()) if (!shown.has(id)) cache.sal.delete(id);
      changed.data.forEach(rememberSalary);
    }
    const none = { salaryCurrent: null, salaryExpected: null, showSalary: false };
    // Contacts: HRS only (a แผนก account would get no rows anyway). Small table, loaded whole.
    const contacts = new Map();
    if (isAdmin()) {
      const r = await c.from('candidate_contacts').select('candidate_id,email,phone');
      if (!r.error) r.data.forEach((x) => contacts.set(x.candidate_id, { email: x.email || '', phone: x.phone || '' }));
    }
    return [...cache.rows.values()]
      .map((r) => ({ ...r, ...(cache.sal.get(r.id) || none), ...(contacts.get(r.id) || {}) }))
      .sort((a, b) => (candScore(b) ?? -1) - (candScore(a) ?? -1));
  },

  // HRS: let units see (or stop seeing) one candidate's salary.
  async setShowSalary(id, on) {
    const c = await sb();
    check(await c.from('candidate_salaries').upsert({ candidate_id: id, show_salary: !!on }, { onConflict: 'candidate_id' }));
  },

  async pick(id) { const c = await sb(); return fromRow(check(await c.rpc('pjt_pick', { p_id: id }))); },
  async returnToPool(id) { const c = await sb(); return fromRow(check(await c.rpc('pjt_return', { p_id: id }))); },
  async setDecision(id, decision, note) {
    const c = await sb();
    if (isAdmin()) {
      const keep = KEEPS_INTERVIEW.includes(decision);
      return fromRow(check(await c.from('candidates').update({ decision, decision_note: decisionNote(decision, note), ...(keep ? {} : CLEAR_INTERVIEW_ROW) }).eq('id', id).select().single()));
    }
    return fromRow(check(await c.rpc('pjt_set_decision', { p_id: id, p_decision: decision })));
  },
  async requestInterview(id, data) {
    const c = await sb();
    const v = validateInterview(data);
    return fromRow(check(await c.rpc('pjt_request_interview', {
      p_id: id, p_at: v.interviewAt, p_mode: v.interviewMode, p_interviewers: v.interviewers,
      p_location: v.interviewLocation || null, p_project: v.projectName || null, p_note: v.remark || null
    })));
  },

  // ---- HRS only (rejected by RLS / function checks for everyone else) ----
  async setInterview(id, data) {
    const c = await sb();
    const v = validateInterview(data, { requireLink: true });
    return fromRow(check(await c.rpc('admin_set_interview', {
      p_id: id, p_at: v.interviewAt, p_mode: v.interviewMode, p_interviewers: v.interviewers,
      p_location: v.interviewLocation || null, p_link: v.meetingLink || null,
      p_project: v.projectName || null, p_note: v.remark || null, p_confirm_note: v.confirmNote || null
    })));
  },
  async moveTo(id, location) {
    const c = await sb();
    return fromRow(check(await c.from('candidates').update({
      location, decision: 'รอพิจารณา', ...CLEAR_INTERVIEW_ROW, assigned_by: location === 'HR' ? null : 'HR'
    }).eq('id', id).select().single()));
  },
  async saveCandidate(record, isNew) {
    const c = await sb();
    const q = isNew ? c.from('candidates').insert(toRow(record)) : c.from('candidates').update(toRow(record)).eq('id', record.id);
    const { error } = await q;
    if (error) throw new Error(error.code === '23505' ? `Candidate ID ${record.id} มีอยู่แล้ว` : error.message);
    check(await c.from('candidate_salaries').upsert(toSalaryRow(record), { onConflict: 'candidate_id' }));
    if (hasContact(record)) check(await c.from('candidate_contacts').upsert(toContactRow(record), { onConflict: 'candidate_id' }));
    return record;
  },
  async deleteCandidate(id) { const c = await sb(); check(await c.from('candidates').delete().eq('id', id)); },
  async importCandidates(records) {
    const c = await sb();
    check(await c.from('candidates').upsert(records.map(toRow), { onConflict: 'id' }));
    check(await c.from('candidate_salaries').upsert(records.map(toSalaryRow), { onConflict: 'candidate_id' }));
    const withContact = records.filter(hasContact);
    if (withContact.length) check(await c.from('candidate_contacts').upsert(withContact.map(toContactRow), { onConflict: 'candidate_id' }));
    return records.length;
  },
  async listUsers() {
    const c = await sb();
    return check(await c.from('profiles').select('*').order('role').order('unit')).map((p) => ({
      id: p.id, username: accountName(p), role: p.role, unit: p.unit, ownerName: p.owner_name || '', active: p.active
    }));
  },
  async setUserActive(id, active) {
    const c = await sb();
    if (profile && id === profile.id && !active) throw new Error('ปิดใช้งานบัญชีที่กำลังใช้อยู่ไม่ได้');
    check(await c.from('profiles').update({ active }).eq('id', id));
  },
  async updateUser(id, patch) {
    const c = await sb();
    check(await c.from('profiles').update({ owner_name: patch.ownerName }).eq('id', id));
  },
  // Runs public.admin_set_password, which re-checks that the caller is an active HRS account.
  async setPassword(user, password) {
    const c = await sb();
    check(await c.rpc('admin_set_password', { p_user: user.id, p_password: password }));
    return 'ตั้งรหัสผ่านใหม่ให้ ' + user.username + ' แล้ว';
  },

  // ---- notifications (RLS shows each account only its own) ----
  async listNotifications() {
    const c = await sb();
    return check(await c.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)).map((n) => ({
      id: n.id, recipient: n.recipient, kind: n.kind, candidateId: n.candidate_id,
      title: n.title, body: n.body, link: n.link, createdAt: n.created_at, readAt: n.read_at
    }));
  },
  async markNotificationsRead(ids) {
    if (!ids.length) return;
    const c = await sb();
    check(await c.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids));
  }
};
