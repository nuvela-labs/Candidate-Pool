// Import from / export to the existing Candidate Marketplace workbook layout.
// SheetJS is loaded only when an admin imports or exports.
import { POOL, UNITS, DECISIONS, OTHER, decisionLabel, DIMENSIONS, cleanScores, candScore, nextCandidateIds, recKey, recLabel, locLabel, interviewerText, safeUrl } from './ui.js';
import { loadLib } from './cdn.js';

const loadXLSX = () => loadLib('xlsx').catch(() => {
  throw new Error('โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
});

const scoreHeader = (d) => `คะแนน ${d.label}`;

// Header text in the workbook -> field. Several sheets use different labels for the same thing.
const HEADERS = {
  'candidate id': 'id', 'ชื่อ-นามสกุล': 'name', 'ตำแหน่ง': 'position', 'อายุ': 'age',
  'ประสบการณ์รวม (ปี)': 'experience', 'การศึกษา': 'education',
  'recume/cv': 'companyOrCv', 'resume/cv': 'companyOrCv', 'บริษัทล่าสุด': 'company',
  'เงินเดือนปัจจุบัน': 'salaryCurrent', 'เงินเดือนคาดหวัง': 'salaryExpected', 'hr match %': 'match',
  'pre-interview': 'pre', 'pre interview': 'pre',
  'email': 'email', 'อีเมล': 'email', 'เบอร์โทรศัพท์': 'phone', 'เบอร์โทร': 'phone', 'โทรศัพท์': 'phone',
  'วันที่ precreen': 'prescreenDate', 'วันที่ prescreen': 'prescreenDate', 'วันที่รับใบสมัคร': 'prescreenDate',
  'hr recommendation': 'recOrNote', 'hr highlight': 'hrNote', 'executive decision': 'decision',
  'วัน/เวลา ที่ต้องการนัดสัมภาษณ์': 'interviewAt', 'ชื่อผู้สัมภาษณ์': 'interviewer',
  'หน่วยงาน/โครงการ': 'destination', 'ชื่อโครงการ': 'projectName', 'หมายเหตุ': 'remark',
  // One column per comparison dimension, e.g. "คะแนน ผลงาน".
  ...Object.fromEntries(DIMENSIONS.map((d) => [scoreHeader(d).toLowerCase(), 'score:' + d.key]))
};

// A phone typed as a number loses its leading 0 in Excel (0812345678 -> 812345678): put it back.
const phoneText = (v) => (typeof v === 'number' && /^[1-9]\d{7,8}$/.test(String(v)) ? '0' + v : String(v ?? '').trim());
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
function excelDate(v, withTime) {
  if (v === '' || v == null) return null;
  let d;
  if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400000));
  else { d = new Date(v); if (isNaN(d)) return null; }
  if (withTime) {
    // Serial dates carry no timezone: treat them as local wall-clock time.
    if (typeof v === 'number') d = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return d.toISOString();
  }
  return d.toISOString().slice(0, 10);
}

function locationFor(sheetName) {
  if (sheetName === 'Candidate Database') return POOL;
  const u = UNITS.find((x) => x.toUpperCase() === sheetName.trim().toUpperCase());
  return u || null;
}

// existing: candidates already in the system, used to number rows that have no Candidate ID.
export async function parseWorkbook(file, existing = []) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const meta = (wb.Workbook && wb.Workbook.Sheets) || [];
  const result = { records: [], duplicates: [], skipped: 0, sheets: [] };
  const seen = new Map();

  let names = wb.SheetNames.filter((n, i) => !(meta[i] && meta[i].Hidden) && locationFor(n));
  if (!names.length) names = [wb.SheetNames[0]];

  for (const name of names) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
    const hIdx = rows.findIndex((r) => r.some((c) => String(c).trim().toLowerCase() === 'candidate id'));
    if (hIdx < 0) continue;
    const fields = rows[hIdx].map((h) => HEADERS[String(h).trim().toLowerCase()] || null);
    const sheetLoc = locationFor(name) || POOL;
    // Without score columns the sheet leaves existing scores alone.
    const hasScores = fields.some((f) => f && f.startsWith('score:'));
    // Likewise, contacts are written only when the sheet has an email or phone column.
    const hasContacts = fields.includes('email') || fields.includes('phone');
    const hasPre = fields.includes('pre');
    let count = 0;
    for (const r of rows.slice(hIdx + 1)) {
      const raw = {};
      fields.forEach((f, i) => { if (f) raw[f] = r[i]; });
      const id = String(raw.id ?? '').trim();
      const nameVal = String(raw.name ?? '').trim();
      if (!id && !nameVal) continue;
      if (!nameVal) { result.skipped++; continue; }

      const rec = String(raw.recOrNote ?? '').trim();
      const cv = String(raw.companyOrCv ?? '').trim();
      let match = num(raw.match);
      if (match != null && match > 1) match = match / 100;
      const dest = String(raw.destination ?? '').trim();
      // A destination chosen in the workbook but never moved by the macro is applied now.
      let location = sheetLoc;
      if (/^return to hr$/i.test(dest)) location = POOL;
      else if (UNITS.includes(dest.toUpperCase())) location = dest.toUpperCase();
      // A status outside the list is HRS's own wording (exported from "อื่นๆ"), so it comes back as อื่นๆ.
      const rawDecision = String(raw.decision ?? '').trim().replace(/^ไม่พิจารณา$/, 'ไม่ผ่านการพิจารณา');
      const known = DECISIONS.includes(rawDecision) && rawDecision !== OTHER;
      const decision = known ? rawDecision : rawDecision ? OTHER : 'รอพิจารณา';
      const decisionNote = decision === OTHER ? rawDecision.slice(0, 60) : null;

      const record = {
        id, name: nameVal,
        position: String(raw.position ?? '').trim(),
        age: num(raw.age), experience: num(raw.experience),
        education: String(raw.education ?? '').trim(),
        company: String(raw.company ?? (/^https?:/i.test(cv) ? '' : cv)).trim(),
        cvUrl: safeUrl(cv),
        salaryCurrent: num(raw.salaryCurrent), salaryExpected: num(raw.salaryExpected), match,
        prescreenDate: excelDate(raw.prescreenDate, false),
        recommendation: recKey(rec),
        hrNote: String(raw.hrNote ?? (recKey(rec) ? '' : rec)).trim(),
        decision, decisionNote,
        interviewAt: excelDate(raw.interviewAt, true),
        // The workbook has one free-text interviewer cell; position/ฝ่าย are filled in later.
        interviewers: String(raw.interviewer ?? '').trim() ? [{ name: String(raw.interviewer).trim(), position: '', department: '' }] : [],
        interviewStatus: excelDate(raw.interviewAt, true) ? (decision === 'นัดสัมภาษณ์แล้ว' ? 'confirmed' : 'requested') : null,
        interviewMode: excelDate(raw.interviewAt, true) ? 'onsite' : null,
        projectName: String(raw.projectName ?? '').trim(),
        remark: String(raw.remark ?? '').trim(),
        location, assignedBy: location === POOL ? null : 'HR',
        ...(hasPre ? { preInterviewed: /^(yes|y|true|1|ใช่|แล้ว|✓|✔)$/i.test(String(raw.pre ?? '').trim()) } : {}),
        ...(hasContacts ? { email: String(raw.email ?? '').trim(), phone: phoneText(raw.phone) } : {}),
        ...(hasScores ? { scores: cleanScores(Object.fromEntries(DIMENSIONS.map((d) => [d.key, raw['score:' + d.key]]))) } : {})
      };
      if (id && seen.has(id)) { result.duplicates.push(`${id} (${seen.get(id)} และ ${name})`); continue; }
      if (id) seen.set(id, name);

      result.records.push(record);
      count++;
    }
    result.sheets.push({ name, count });
  }
  // Rows without a Candidate ID get the next IDs in sequence, in the order they appear in the file.
  const auto = result.records.filter((r) => !r.id);
  const ids = nextCandidateIds([...existing, ...result.records.filter((r) => r.id)], auto.length);
  auto.forEach((r, i) => { r.id = ids[i]; });
  result.autoIds = ids;
  return result;
}

export async function exportWorkbook(candidates) {
  const XLSX = await loadXLSX();
  const rows = candidates.map((c) => ({
    'Candidate ID': c.id, 'ชื่อ-นามสกุล': c.name, 'ตำแหน่ง': c.position, 'อายุ': c.age,
    'ประสบการณ์รวม (ปี)': c.experience, 'การศึกษา': c.education, 'บริษัทล่าสุด': c.company,
    'Pre-interview': c.preInterviewed ? 'Yes' : 'No', 'Email': c.email || '', 'เบอร์โทรศัพท์': c.phone || '',
    'Resume/CV': c.cvUrl, 'เงินเดือนปัจจุบัน': c.salaryCurrent, 'เงินเดือนคาดหวัง': c.salaryExpected,
    'Candidate Score %': candScore(c) == null ? '' : Math.round(candScore(c) * 100), 'วันที่ Prescreen': c.prescreenDate, 'HR Recommendation': recLabel(c.recommendation),
    'HR Highlight': c.hrNote, 'Executive Decision': decisionLabel(c),
    'วัน/เวลา ที่ต้องการนัดสัมภาษณ์': c.interviewAt ? new Date(c.interviewAt).toLocaleString('th-TH') : '',
    'สถานะนัด': c.interviewStatus === 'confirmed' ? 'ยืนยันแล้ว' : c.interviewStatus === 'requested' ? 'รอยืนยัน' : '',
    'รูปแบบ': c.interviewMode === 'online' ? 'Online' : c.interviewMode === 'onsite' ? 'Onsite' : '',
    'สถานที่ / ลิงก์': c.interviewMode === 'online' ? c.meetingLink : c.interviewLocation,
    'ชื่อผู้สัมภาษณ์': interviewerText(c.interviewers), 'หน่วยงาน/โครงการ': locLabel(c.location),
    'ชื่อโครงการ': c.projectName, 'หมายเหตุ': c.remark,
    ...Object.fromEntries(DIMENSIONS.map((d) => [scoreHeader(d), (c.scores || {})[d.key] ?? '']))
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Candidates');
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  XLSX.writeFile(wb, `candidate-pool-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.xlsx`);
}
