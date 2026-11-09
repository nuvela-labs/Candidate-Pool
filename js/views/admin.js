// HRS back office: overview + interview requests, full candidate pool control,
// interview calendar, users & permissions.
import {
  esc, ICONS, LOGO, POOL, HRS, LOCATIONS, DECISIONS, DECISION_STYLE, RECOMMENDATIONS, recLabel, DIMENSIONS, dimInfo, cleanScores, MODE_LABEL,
  INTERVIEW_STATUS, locStyle, locLabel, unitFullLabel, pct, fmtDateTime, toast, openModal,
  confirmDialog, errorMessage, isNew, NEW_BADGE, holdLeft, DIVISIONS, setOrg, isWebUrl, goHome, matchColor, candScore, NOTE_FROM, nextCandidateIds, preTag, scoreNote, menuHTML
} from '../ui.js';
import * as anim from '../anim.js';
import { newFilterState, positionsOf, applyFilters, groupByPosition, filterBarHTML, updateFilter } from '../filters.js';
import { CONFIG } from '../config.js';
import { openInterviewForm, showInterviewDetail } from '../interview.js';
import { calendarHTML, monthStart, shiftMonth } from '../calendar.js';
import { openCompare } from '../compare.js';
import { bellHTML, openNotifications, watchNotifications } from '../notify.js';
import { openProfile } from '../profile.js';
import { openResumeImport } from '../resume.js';

const TABS = [
  { key: 'overview', label: 'ภาพรวม', dot: '#C8F169', shape: '999px' },
  { key: 'pool', label: 'ผู้สมัครทั้งหมด', dot: '#FF7A3D', shape: '12px 12px 0 0' },
  { key: 'calendar', label: 'ปฏิทินสัมภาษณ์', dot: '#FFB3D1', shape: '0 0 0 12px' },
  { key: 'users', label: 'ผู้ใช้และสิทธิ์', dot: '#8EC5FF', shape: '3px' }
];
const HEAD = {
  overview: ['ภาพรวมระบบ', 'สรุปผู้สมัครทุก Pool และคำขอนัดสัมภาษณ์ที่รอยืนยัน'],
  pool: ['ผู้สมัครทั้งหมด', `ในฐานะ ${HRS} คุณส่งผู้สมัครเข้า Pool ของทุกแผนก ดึงกลับ Candidate Pool จัดนัด และแก้ไขสถานะได้ทุกรายการ`],
  calendar: ['ปฏิทินสัมภาษณ์', 'นัดสัมภาษณ์ของทุกแผนก คลิกที่นัดเพื่อดูรายละเอียดหรือยืนยัน'],
  users: ['ผู้ใช้และสิทธิ์', 'บัญชีเข้าสู่ระบบแยกตามแผนก แต่ละแผนกเลือกผู้สมัครได้เฉพาะเข้า Pool ของตนเอง']
};
const YES = 'background:#E8FBC4;color:#2E4A00';
const PART = 'background:#E4DDFF;color:#2A1A8C';
const NO = 'background:#ECEBE7;color:#3D3C38';
const PERMS = [
  ['ดูผู้สมัคร', 'ทุก Pool', YES, 'Candidate Pool + Pool ตนเอง', PART],
  ['เลือกผู้สมัครเข้า Pool', 'ส่งเข้า Pool ใดก็ได้', YES, 'เฉพาะ Pool ตนเอง (พิจารณาภายใน 72 ชม.)', PART],
  ['คืนผู้สมัครกลับ Candidate Pool', 'ทุก Pool', YES, 'เฉพาะ Pool ตนเอง', PART],
  ['ย้ายผู้สมัครข้าม Pool แผนก', 'ได้', YES, 'ไม่ได้', NO],
  ['Executive Decision (ทุกสถานะ)', 'ทุกรายการ', YES, 'ไม่ได้ (มีแค่ นัดสัมภาษณ์ / ส่งคืน)', NO],
  ['นัดสัมภาษณ์', 'จัดนัด / ยืนยันนัด + ส่งลิงก์', YES, 'ส่งคำขอนัด (เฉพาะ Pool ตนเอง)', PART],
  ['ปฏิทินสัมภาษณ์', 'ทุกแผนก', YES, 'เฉพาะแผนกตนเอง', PART],
  ['เปรียบเทียบผู้สมัคร', 'ทุก Pool', YES, 'Candidate Pool + Pool ตนเอง', PART],
  ['ดูเงินเดือนผู้สมัคร', 'ได้เสมอ', YES, `เฉพาะรายที่ ${HRS} เปิดให้เห็น (เริ่มต้น: ไม่เห็น)`, PART],
  ['เพิ่ม / แก้ไข / นำเข้าข้อมูลผู้สมัคร', 'ได้', YES, 'ไม่ได้', NO],
  ['จัดการฝ่าย แผนก บัญชีผู้ใช้และรหัสผ่าน', 'ได้', YES, 'ไม่ได้', NO]
];

export function mountAdmin(root, { store, session, signOut, onCleanup }) {
  const st = {
    tab: 'overview', list: [], users: [], notifs: [], loc: 'all', q: '', loading: true, error: '',
    animate: true, month: monthStart(), f: newFilterState(),
    sel: new Set() // candidate ids ticked on ผู้สมัครทั้งหมด, for bulk actions
  };

  async function reload({ animate = false } = {}) {
    try {
      const [list, users] = await Promise.all([store.listCandidates(), store.listUsers()]);
      st.list = list; st.users = users; st.error = '';
      const ids = new Set(list.map((c) => c.id));
      for (const id of st.sel) if (!ids.has(id)) st.sel.delete(id);
    } catch (e) { st.error = errorMessage(e); }
    try { st.notifs = await store.listNotifications(); } catch (e) { /* keep previous */ }
    st.loading = false;
    st.animate = animate;
    render();
  }
  const byId = (id) => st.list.find((c) => c.id === id);
  const requests = () => st.list.filter((c) => c.interviewStatus === 'requested')
    .sort((a, b) => new Date(a.interviewAt) - new Date(b.interviewAt));

  /* ---------- sections ---------- */
  function overview() {
    const L = st.list;
    const total = L.length;
    const inPool = L.filter((c) => c.location === POOL).length;
    const reqs = requests();
    const kpis = [
      { label: 'ผู้สมัครทั้งหมด', v: total, bg: '#fff', fg: '#111', deco: '#5B3DF5', shape: '999px' },
      { label: 'อยู่ใน Candidate Pool', v: inPool, bg: '#FFD84D', fg: '#111', deco: '#fff', shape: '88px 0 0 0' },
      { label: `ใหม่ (${CONFIG.newDays} วัน)`, v: L.filter(isNew).length, bg: '#C8F169', fg: '#111', deco: '#5B3DF5', shape: '0 0 88px 0' },
      { label: 'อยู่ใน Pool แผนก', v: total - inPool, bg: '#8EC5FF', fg: '#111', deco: '#111', shape: '0 88px 0 0' },
      { label: 'คำขอนัดรอยืนยัน', v: reqs.length, bg: '#FF7A3D', fg: '#111', deco: '#FFB3D1', shape: '999px' },
      { label: 'นัดสัมภาษณ์แล้ว', v: L.filter((c) => c.interviewStatus === 'confirmed').length, bg: '#5B3DF5', fg: '#fff', deco: '#C8F169', shape: '88px 0 0 0' }
    ];
    const locCounts = LOCATIONS.map((l) => ({ l, n: L.filter((c) => c.location === l).length }));
    const maxLoc = Math.max(1, ...locCounts.map((x) => x.n));
    const posMap = new Map();
    L.forEach((c) => posMap.set(c.position || '(ไม่ระบุ)', (posMap.get(c.position || '(ไม่ระบุ)') || 0) + 1));
    const pos = [...posMap.entries()].sort((a, b) => b[1] - a[1]);
    const maxPos = Math.max(1, ...pos.map((x) => x[1]));
    const decs = DECISIONS.map((d) => ({ d, n: L.filter((c) => c.decision === d).length }));
    const missing = L.filter((c) => !c.education || !c.company || !c.prescreenDate || candScore(c) == null);

    return `
    <section class="kpis" aria-label="ตัวเลขสรุป">
      ${kpis.map((k) => `<div class="kpi" style="background:${k.bg};color:${k.fg}"><span class="kpi-label">${esc(k.label)}</span><span class="kpi-value" data-count data-value="${k.v}">${k.v}</span><span class="kpi-deco" aria-hidden="true" style="border-radius:${k.shape};background:${k.deco}"></span></div>`).join('')}
    </section>
    <section class="panel" aria-labelledby="p-req">
      <h2 id="p-req">คำขอนัดสัมภาษณ์รอยืนยัน · ${reqs.length}</h2>
      ${reqs.length ? `<ul class="agenda">${reqs.map((c) => `<li class="agenda-item" style="cursor:default">
        <span class="agenda-date"><strong>${new Date(c.interviewAt).getDate()}</strong><span>${esc(fmtDateTime(c.interviewAt).split(' ')[1])}</span></span>
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <strong>${esc(c.id)} ${esc(c.name)} <span class="muted" style="font-weight:500">· ${esc(c.position || '')}</span></strong>
          <span class="muted" style="font-size:13px">${esc(c.requestedBy || c.location)} · ${esc(fmtDateTime(c.interviewAt))} · ${esc(MODE_LABEL[c.interviewMode])}${c.interviewMode === 'onsite' ? ' · ' + esc(c.interviewLocation) : ''} · ผู้สัมภาษณ์ ${(c.interviewers || []).length} คน</span>
        </span>
        <button type="button" class="btn btn-sm btn-violet" data-interview="${esc(c.id)}">ยืนยันนัด</button>
      </li>`).join('')}</ul>` : '<p class="muted">ไม่มีคำขอที่รอยืนยัน</p>'}
    </section>
    <div class="panels">
      <section class="panel" aria-labelledby="p-loc">
        <h2 id="p-loc">ผู้สมัครตาม Pool</h2>
        ${locCounts.map(({ l, n }) => `<div class="hbar"><div style="display:flex;justify-content:space-between"><span style="font-weight:600">${esc(l === POOL ? locLabel(l) : unitFullLabel(l))}</span><strong>${n} คน</strong></div><div class="hbar-track" aria-hidden="true"><div data-grow style="width:${Math.round(n / maxLoc * 100)}%;background:${locStyle(l).color}"></div></div></div>`).join('')}
      </section>
      <section class="panel" aria-labelledby="p-pos">
        <h2 id="p-pos">ผู้สมัครตามตำแหน่ง</h2>
        ${pos.map(([p, n]) => `<div style="display:grid;grid-template-columns:minmax(0,140px) minmax(0,1fr) 32px;gap:12px;align-items:center;font-size:14px"><span style="font-weight:600;overflow-wrap:anywhere">${esc(p)}</span><div class="hbar-track" aria-hidden="true"><div data-grow style="width:${Math.round(n / maxPos * 100)}%;background:#111"></div></div><strong style="text-align:right">${n}</strong></div>`).join('')}
      </section>
      <section class="panel" aria-labelledby="p-dec">
        <h2 id="p-dec">Executive Decision ทั้งระบบ</h2>
        <div class="stack" aria-hidden="true">${decs.filter((x) => x.n).map(({ d, n }) => `<div data-grow style="width:${(n / Math.max(1, total) * 100).toFixed(1)}%;background:${DECISION_STYLE[d].color}"></div>`).join('')}</div>
        <ul class="legend">${decs.map(({ d, n }) => `<li><span aria-hidden="true" style="width:14px;height:14px;border-radius:4px;border:1px solid #CFCDC6;background:${DECISION_STYLE[d].color}"></span>${esc(d)} <strong>${n}</strong></li>`).join('')}</ul>
      </section>
      <section class="panel" aria-labelledby="p-attn">
        <h2 id="p-attn">ข้อมูลไม่ครบ</h2>
        ${missing.length ? missing.slice(0, 6).map((c) => `
          <div class="warn-box">
            <span aria-hidden="true" style="width:36px;height:36px;flex:none;border-radius:36px 36px 0 36px;background:#FF7A3D"></span>
            <div style="flex:1;display:flex;flex-direction:column;gap:4px">
              <strong>${esc(c.id)} ${esc(c.name)}</strong>
              <span>ขาด: ${[!c.education && 'การศึกษา', !c.company && 'บริษัทล่าสุด', !c.prescreenDate && 'วันที่ Prescreen', candScore(c) == null && 'คะแนนรายมิติ'].filter(Boolean).join(', ')}</span>
            </div>
            <button type="button" class="btn btn-sm" data-edit="${esc(c.id)}">แก้ไข</button>
          </div>`).join('') + (missing.length > 6 ? `<p class="muted">และอีก ${missing.length - 6} รายการ</p>` : '')
          : '<p class="muted">ข้อมูลผู้สมัครครบทุกรายการ</p>'}
      </section>
    </div>`;
  }

  // Bar above the table while candidates are ticked: actions apply to every ticked candidate.
  function bulkBar(rows) {
    const n = st.sel.size;
    if (!n) return '';
    const hidden = [...st.sel].filter((id) => !rows.some((c) => c.id === id)).length;
    return `
    <div class="bulk-bar" role="region" aria-label="จัดการผู้สมัครที่เลือก">
      <strong>เลือกแล้ว ${n} คน</strong>${hidden ? `<span class="muted">(ไม่อยู่ในตัวกรองตอนนี้ ${hidden} คน)</span>` : ''}
      <div class="bulk-actions">
        <label class="sr-only" for="bulk-move">ส่งผู้สมัครที่เลือกเข้า Pool</label>
        <select id="bulk-move" class="table-select" data-bulk-move>
          <option value="">ส่งเข้า Pool…</option>
          ${LOCATIONS.map((l) => `<option value="${esc(l)}">${l === POOL ? 'ดึงกลับ Candidate Pool' : esc(unitFullLabel(l))}</option>`).join('')}
        </select>
        ${menuHTML({ label: 'จัดการอื่นๆ', icon: ICONS.down, items: [
          { label: n >= 2 && n <= 4 ? 'เปรียบเทียบ' : 'เปรียบเทียบ (เลือก 2–4 คน)', icon: ICONS.radar, attrs: `data-bulk="compare" ${n >= 2 && n <= 4 ? '' : 'disabled'}` },
          { label: 'ทำเครื่องหมาย Pre-interview แล้ว', attrs: 'data-bulk="pre"' },
          { label: 'ให้แผนกเห็นเงินเดือน', attrs: 'data-bulk="salary-on"', sep: true },
          { label: 'ซ่อนเงินเดือน', attrs: 'data-bulk="salary-off"' },
          { label: 'ส่งออก Excel', icon: ICONS.download, attrs: 'data-bulk="export"', sep: true },
          { label: 'ลบผู้สมัครที่เลือก', icon: ICONS.trash, attrs: 'data-bulk="delete"', danger: true, sep: true }
        ] })}
        <button type="button" class="btn btn-sm icon-only" data-bulk="clear" title="ยกเลิกการเลือก" aria-label="ยกเลิกการเลือก">${ICONS.close}</button>
      </div>
    </div>`;
  }
  // Runs one store call per ticked candidate, then reloads once.
  async function bulkRun(label, each, opts) {
    const ids = [...st.sel];
    let done = 0, failed = 0;
    for (const id of ids) {
      try { await each(byId(id)); done++; } catch (e) { failed++; }
    }
    st.sel.clear();
    await reload();
    toast(`${label} ${done} คนแล้ว${failed ? ` · ไม่สำเร็จ ${failed} คน` : ''}`, failed ? { error: true } : opts);
  }
  async function bulkAction(kind) {
    const picked = [...st.sel].map(byId).filter(Boolean);
    if (kind === 'clear') { st.sel.clear(); return render(); }
    if (kind === 'compare') return openCompare(st.list, picked.map((c) => c.id));
    if (kind === 'export') {
      try { const { exportWorkbook } = await import('../excel.js'); await exportWorkbook(picked); }
      catch (ex) { toast(errorMessage(ex), { error: true }); }
      return;
    }
    if (kind === 'pre') return bulkRun('ทำเครื่องหมาย Pre-interview', (c) => store.saveCandidate({ ...c, preInterviewed: true }, false));
    if (kind === 'salary-on' || kind === 'salary-off') {
      const on = kind === 'salary-on';
      return bulkRun(on ? 'ให้แผนกเห็นเงินเดือน' : 'ซ่อนเงินเดือน', (c) => store.setShowSalary(c.id, on));
    }
    if (kind === 'delete') {
      const ok = await confirmDialog({
        title: `ลบผู้สมัคร ${picked.length} คน?`,
        body: `${picked.slice(0, 5).map((c) => `${c.id} ${c.name}`).join(', ')}${picked.length > 5 ? ` และอีก ${picked.length - 5} คน` : ''} จะถูกลบถาวรและกู้คืนไม่ได้`,
        confirm: 'ลบถาวร', danger: true
      });
      if (ok) return bulkRun('ลบผู้สมัคร', (c) => store.deleteCandidate(c.id));
    }
  }
  async function bulkMove(to) {
    const picked = [...st.sel].map(byId).filter((c) => c && c.location !== to);
    if (!picked.length) { toast(`ผู้สมัครที่เลือกอยู่ที่ ${locLabel(to)} แล้ว`); return render(); }
    const ok = await confirmDialog({
      title: to === POOL ? `ดึง ${picked.length} คนกลับ Candidate Pool?` : `ส่ง ${picked.length} คนเข้า Pool ${to}?`,
      body: 'สถานะจะกลับเป็น "รอพิจารณา" และนัดสัมภาษณ์เดิมจะถูกยกเลิก', confirm: 'ย้าย'
    });
    if (!ok) return render();
    const from = new Map(picked.map((c) => [c.id, c.location]));
    st.sel = new Set(picked.map((c) => c.id));
    return bulkRun(to === POOL ? 'ดึงกลับ Candidate Pool' : `ส่งเข้า Pool ${to}`, (c) => store.moveTo(c.id, to), {
      action: 'เลิกทำ',
      onAction: () => { st.sel = new Set(from.keys()); bulkRun('ย้ายกลับที่เดิม', (c) => store.moveTo(c.id, from.get(c.id))); }
    });
  }

  // Candidates shown in the table with the current Pool chip, search and filters.
  const visibleRows = () => {
    const q = st.q.trim().toLowerCase();
    return applyFilters(st.list, st.f).filter((c) => (st.loc === 'all' || c.location === st.loc) &&
      (!q || `${c.id} ${c.name} ${c.position}`.toLowerCase().includes(q)));
  };

  function pool() {
    const rows = visibleRows();
    const chips = [['all', 'ทั้งหมด', st.list.length], ...LOCATIONS.map((l) => [l, locLabel(l), st.list.filter((c) => c.location === l).length])];
    const groups = groupByPosition(rows, st.f.group);
    return `
    <div class="toolbar">
      <div class="chip-row" role="group" aria-label="กรองตาม Pool">
        ${chips.map(([k, label, n]) => `<button type="button" class="chip" data-loc="${esc(k)}" aria-pressed="${st.loc === k}">${esc(label)} · ${n}</button>`).join('')}
      </div>
      <div class="search"><label for="adm-search" class="sr-only">ค้นหาผู้สมัคร</label>${ICONS.search}<input id="adm-search" class="input" type="search" placeholder="ค้นหาชื่อ, ID หรือตำแหน่ง" value="${esc(st.q)}"></div>
    </div>
    ${filterBarHTML(st.f, positionsOf(st.list), { prefix: 'af', dirty: !!st.q || st.loc !== 'all' })}
    ${bulkBar(rows)}
    <div class="table-wrap pool-wrap">
      <table class="pool-table">
        <thead><tr><th scope="col" class="pool-check"><label class="sr-only" for="sel-all">เลือกทั้งหมดที่แสดง</label><input type="checkbox" id="sel-all" data-sel-all ${rows.length && rows.every((c) => st.sel.has(c.id)) ? 'checked' : ''} title="เลือกทั้งหมดที่แสดง ${rows.length} คน"></th><th scope="col">ผู้สมัคร</th><th scope="col">Candidate Score</th><th scope="col">Executive Decision</th><th scope="col">นัดสัมภาษณ์</th><th scope="col">อยู่ที่</th><th scope="col"><span class="sr-only">จัดการ</span></th></tr></thead>
        <tbody>
          ${rows.length ? groups.map(([pos, items]) => (pos ? `<tr class="group-row"><th scope="rowgroup" colspan="7">${esc(pos)} <span class="count">${items.length}</span></th></tr>` : '') + items.map((c) => {
            const ds = DECISION_STYLE[c.decision] || DECISION_STYLE['รอพิจารณา'];
            const ls = locStyle(c.location);
            const ist = INTERVIEW_STATUS[c.interviewStatus];
            const hold = holdLeft(c);
            return `<tr data-row="${esc(c.id)}" title="คลิกเพื่อดูข้อมูลและจัดการ ${esc(c.id)}">
              <td class="pool-check" data-label="เลือก"><label class="sr-only" for="sel-${esc(c.id)}">เลือก ${esc(c.id)}</label><input type="checkbox" id="sel-${esc(c.id)}" data-sel="${esc(c.id)}" ${st.sel.has(c.id) ? 'checked' : ''}></td>
              <td class="pool-who">
                <button type="button" class="name-btn" data-profile="${esc(c.id)}">${esc(c.name)}</button>
                <span class="pool-sub"><span class="mono">${esc(c.id)}</span>${pos ? '' : ` · ${esc(c.position || '—')}`}${isNew(c) ? ` ${NEW_BADGE}` : ''} ${preTag(c)}${c.showSalary ? ' <span class="sal-tag" title="แผนกเห็นเงินเดือนของผู้สมัครคนนี้">฿ แผนกเห็นเงินเดือน</span>' : ''}</span>
              </td>
              <td data-label="Candidate Score" style="font-weight:700;color:${matchColor(candScore(c)).text}">${pct(candScore(c))}</td>
              <td data-label="Executive Decision"><label class="sr-only" for="dec-${esc(c.id)}">Executive Decision ของ ${esc(c.id)}</label><select id="dec-${esc(c.id)}" class="decision-select" data-decision="${esc(c.id)}" style="background-color:${ds.bg};color:${ds.fg}" title="เปลี่ยนสถานะ">
                ${DECISIONS.map((d) => `<option value="${esc(d)}" ${d === (c.decision || 'รอพิจารณา') ? 'selected' : ''}>${esc(d)}</option>`).join('')}
              </select></td>
              <td data-label="นัดสัมภาษณ์">${ist
                ? `<button type="button" class="pill" data-detail="${esc(c.id)}" style="border:0;cursor:pointer;background:${ist.bg};color:${ist.fg}">${esc(ist.label)}</button>`
                : ''}</td>
              <td data-label="อยู่ที่"><span style="display:inline-flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap"><span class="dot" style="background:${ls.color}" aria-hidden="true"></span>${esc(locLabel(c.location))}</span>
                ${hold ? `<span class="hold-mini${hold.urgent ? ' urgent' : ''}">เด้งกลับใน ${esc(hold.text)}</span>` : ''}</td>
              <td class="pool-edit">${menuHTML({ title: `จัดการ ${c.id}`, cls: 'btn btn-sm btn-ghost icon-only', items: [
                { label: 'แก้ไขข้อมูล', attrs: `data-edit="${esc(c.id)}"` },
                ist ? { label: 'ดูนัดสัมภาษณ์', icon: ICONS.calendar, attrs: `data-detail="${esc(c.id)}"` }
                  : { label: 'นัดสัมภาษณ์', icon: ICONS.calendar, attrs: `data-interview="${esc(c.id)}"` },
                { label: c.location === POOL ? 'ส่งเข้า Pool ส่วนงาน' : 'ย้าย / ดึงกลับ Candidate Pool', attrs: `data-move-form="${esc(c.id)}"` },
                { label: c.showSalary ? 'ซ่อนเงินเดือนจากแผนก' : 'ให้แผนกเห็นเงินเดือน', attrs: `data-salary="${esc(c.id)}"`, sep: true }
              ] })}</td>
            </tr>`;
          }).join('')).join('') : '<tr><td colspan="7" class="muted" style="padding:32px;text-align:center">ไม่พบผู้สมัครตามเงื่อนไข</td></tr>'}
        </tbody>
      </table>
    </div>`;
  }

  function users() {
    return `
    <div class="info-box">${ICONS.info}<p>ผู้ใช้เลือกฝ่าย แผนก แล้วใส่รหัสผ่านเพื่อเข้าระบบ หน้านี้ใช้เพิ่ม แก้ไข และลบฝ่ายและแผนก (แผนกใหม่ต้องตั้งรหัสผ่าน) เปิด/ปิดบัญชี ระบุชื่อผู้ถือบัญชี และตั้งรหัสผ่านใหม่ ส่วนการให้แผนกเห็นเงินเดือน ตั้งรายคนได้ที่หน้า ผู้สมัครทั้งหมด</p></div>
    <section class="panel" aria-labelledby="org-title">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
        <h2 id="org-title">ฝ่ายและแผนก</h2>
        <button type="button" class="btn btn-sm btn-dark" data-add-division>${ICONS.plus} เพิ่มฝ่าย</button>
      </div>
      <div class="org-list">
        ${DIVISIONS.map((d) => `
          <div class="org-division">
            <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
              <strong style="font-size:16px">${esc(d.name)} <span class="count">${d.units.length} แผนก</span></strong>
              <span style="display:flex;flex-wrap:wrap;gap:8px">
                <button type="button" class="btn btn-sm" data-add-unit="${esc(d.id)}">${ICONS.plus} เพิ่มแผนก</button>
                ${menuHTML({ title: `จัดการฝ่าย ${d.name}`, cls: 'btn btn-sm btn-ghost icon-only', items: [
                  { label: 'แก้ไขชื่อฝ่าย', attrs: `data-edit-division="${esc(d.id)}"` },
                  { label: d.units.length ? 'ลบฝ่าย (ต้องไม่มีแผนก)' : 'ลบฝ่าย', icon: ICONS.trash, danger: true, attrs: `data-del-division="${esc(d.id)}" ${d.units.length ? 'disabled' : ''}` }
                ] })}
              </span>
            </div>
            ${d.units.length ? `<ul class="unit-list">${d.units.map((u) => `
              <li class="unit-item">
                <span class="mono" style="font-weight:700">${esc(u)}</span>
                <span class="muted" style="font-size:13px">${st.list.filter((c) => c.location === u).length} คนใน Pool</span>
                <span style="margin-left:auto">
                  ${menuHTML({ title: `จัดการแผนก ${u}`, cls: 'btn btn-sm btn-ghost icon-only', items: [
                    { label: 'แก้ไขแผนก', attrs: `data-edit-unit="${esc(u)}"` },
                    { label: 'ลบแผนก', icon: ICONS.trash, danger: true, attrs: `data-del-unit="${esc(u)}"` }
                  ] })}
                </span>
              </li>`).join('')}</ul>`
              : '<span class="muted" style="font-size:14px">ยังไม่มีแผนก — ฝ่ายนี้จะแสดงในหน้าเข้าสู่ระบบเมื่อมีแผนกแรก</span>'}
          </div>`).join('')}
      </div>
    </section>
    <div class="table-wrap">
      <table style="min-width:880px">
        <thead><tr><th scope="col">บัญชี</th><th scope="col">ฝ่าย · แผนก</th><th scope="col">ผู้ถือบัญชี</th><th scope="col">ขอบเขตข้อมูล</th><th scope="col">สถานะ</th><th scope="col"><span class="sr-only">การจัดการ</span></th></tr></thead>
        <tbody>
          ${st.users.map((u) => {
            const loc = u.role === 'admin' ? POOL : u.unit;
            const ls = locStyle(loc);
            return `<tr data-row>
              <td class="mono" style="font-weight:600">${esc(u.username)}</td>
              <td><span style="display:inline-flex;align-items:center;gap:8px;font-weight:600"><span aria-hidden="true" style="width:12px;height:12px;border-radius:${ls.shape};background:${ls.color}"></span>${u.role === 'admin' ? esc(HRS) : esc(unitFullLabel(u.unit))}</span></td>
              <td><label class="sr-only" for="own-${esc(u.id)}">ผู้ถือบัญชี ${esc(u.username)}</label><input id="own-${esc(u.id)}" class="input" style="min-height:40px;font-size:14px" data-owner="${esc(u.id)}" value="${esc(u.ownerName)}" placeholder="ระบุชื่อ"></td>
              <td>${u.role === 'admin' ? 'ทุก Pool + จัดการบัญชี' : 'Candidate Pool + Pool ของ ' + esc(u.unit)}</td>
              <td><button type="button" class="switch" role="switch" aria-checked="${u.active}" aria-label="เปิดใช้งานบัญชี ${esc(u.username)}" data-active="${esc(u.id)}"><span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span>${u.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</button></td>
              <td style="text-align:right"><button type="button" class="btn btn-sm" data-reset="${esc(u.id)}">ตั้งรหัสผ่านใหม่</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <section class="panel" aria-labelledby="perm">
      <h2 id="perm">สิทธิ์การใช้งานตามประเภทบัญชี</h2>
      <div style="overflow-x:auto"><table style="min-width:560px">
        <thead><tr><th scope="col">การทำงาน</th><th scope="col">${esc(HRS)}</th><th scope="col">บัญชีแผนก</th></tr></thead>
        <tbody>${PERMS.map((p) => `<tr><th scope="row" style="padding:12px 16px">${esc(p[0])}</th><td><span class="pill" style="${p[2]}">${esc(p[1])}</span></td><td><span class="pill" style="${p[4]}">${esc(p[3])}</span></td></tr>`).join('')}</tbody>
      </table></div>
    </section>
    ${store.mode === 'demo' ? '<div><button type="button" class="btn btn-sm" data-reset-demo>ล้างข้อมูลสาธิตกลับเป็นค่าเริ่มต้น</button></div>' : ''}`;
  }

  function render() {
    const [title, sub] = HEAD[st.tab];
    const reqCount = requests().length;
    root.innerHTML = `
    <div class="admin">
      <aside class="sidebar">
        <a href="#/admin" class="logo" style="padding:0 8px" data-home title="กลับหน้าหลักและรีเฟรช">${LOGO}<span>Candidate Pool<span class="logo-sub">หลังบ้าน ${esc(HRS)}</span></span></a>
        <nav aria-label="เมนูหลังบ้าน">
          ${TABS.map((t) => `<button type="button" data-tab="${t.key}" ${st.tab === t.key ? 'aria-current="page"' : ''}><span aria-hidden="true" style="width:12px;height:12px;border-radius:${t.shape};background:${t.dot}"></span>${t.label}${t.key === 'overview' && reqCount ? `<span class="bell-count" style="position:static;margin-left:auto">${reqCount}</span>` : ''}</button>`).join('')}
        </nav>
      </aside>
      <main class="admin-main">
        <div class="account-bar">
          ${bellHTML(st.notifs)}
          <span class="account-name"><span class="avatar-sm" aria-hidden="true">${esc((session.username || 'H').charAt(0).toUpperCase())}</span>${esc(session.username)}</span>
          <button type="button" class="btn btn-sm btn-ghost" data-signout title="ออกจากระบบ">${ICONS.logout} ออกจากระบบ</button>
        </div>
        <div class="page-head">
          <div style="display:flex;flex-direction:column;gap:6px" data-enter>
            <h1 style="font-size:clamp(30px,3.4vw,44px)">${esc(title)}</h1>
            <p class="muted" style="font-size:15px">${esc(sub)}</p>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            ${st.tab === 'pool' ? `
              <input type="file" id="import-file" accept=".xlsx,.xlsm,.xls,.csv" data-import class="sr-only" tabindex="-1">
              ${menuHTML({ label: 'เครื่องมือ', icon: ICONS.down, cls: 'btn', items: [
                { label: 'เปรียบเทียบผู้สมัคร', icon: ICONS.radar, attrs: 'data-compare-open' },
                { label: 'นำเข้าจาก Excel', icon: ICONS.upload, for: 'import-file', sep: true },
                { label: 'ส่งออก Excel', icon: ICONS.download, attrs: 'data-export' },
                { label: 'ดาวน์โหลด Template นำเข้า', icon: ICONS.doc, href: 'templates/candidate-import-template.xlsx', attrs: 'download' }
              ] })}
              <button type="button" class="btn" data-resume>${ICONS.doc} นำเข้า Resume</button>
              <button type="button" class="btn btn-dark" data-add>${ICONS.plus} เพิ่มผู้สมัคร</button>` : `<button type="button" class="btn btn-sm btn-ghost icon-only" data-refresh title="รีเฟรช" aria-label="รีเฟรช">${ICONS.refresh}</button>`}
          </div>
        </div>
        ${st.error ? `<div class="error-box" role="alert">${esc(st.error)}</div>` : ''}
        <div data-section style="display:flex;flex-direction:column;gap:20px">
          ${st.loading ? '<div class="loading" style="min-height:200px"><div class="spinner" role="img" aria-label="กำลังโหลด"></div></div>'
            : st.tab === 'overview' ? overview() : st.tab === 'pool' ? pool()
            : st.tab === 'calendar' ? calendarHTML(st.month, st.list, { showUnit: true }) : users()}
        </div>
      </main>
    </div>`;

    if (st.animate && !st.loading) {
      anim.enter(root.querySelectorAll('[data-enter]'));
      anim.pop(root.querySelectorAll('.kpi'), { step: 60 });
      anim.countUp(root.querySelectorAll('[data-count]'));
      anim.enter(root.querySelectorAll('.panel, [data-row]'), { step: 30, start: 100, y: 16 });
      anim.grow(root.querySelectorAll('[data-grow]'));
      anim.pop(root.querySelectorAll('.cal-event'), { step: 20, start: 200 });
      st.animate = false;
    }
  }

  /* ---------- interviews ---------- */
  const interviewForm = (c) => openInterviewForm(c, {
    asHrs: true,
    onSubmit: async (data) => {
      await store.setInterview(c.id, data);
      await reload();
      toast(c.location === POOL ? `จัดนัด ${c.id} แล้ว` : `ยืนยันนัด ${c.id} และแจ้ง ${c.location} แล้ว`);
    }
  });
  const detail = (c) => showInterviewDetail(c, {
    actions: [{ id: 'edit', label: c.interviewStatus === 'requested' ? 'ยืนยันนัด' : 'แก้ไขนัด', primary: true }],
    onAction: () => interviewForm(c)
  });

  /* ---------- candidate form ---------- */
  // Must be filled before the candidate form saves (form field names).
  const REQUIRED_FIELDS = ['id', 'name', 'position', 'education', 'company', 'prescreenDate'];
  // draft = pre-filled values from a Resume read by Claude (see resume.js); new candidates only.
  function candidateForm(c, draft = null) {
    const isNew = !c;
    // A new candidate starts with the next ID in sequence (HRS may still change it).
    const v = c || { id: nextCandidateIds(st.list)[0], decision: 'รอพิจารณา', location: POOL, ...(draft ? draft.record : {}) };
    const f = (id, label, val, type = 'text', extra = '') =>
      `<div class="field ${extra}"><label for="cf-${id}">${label}</label><input id="cf-${id}" name="${id}" class="input" type="${type}" value="${esc(val ?? '')}" ${type === 'number' ? 'step="any"' : ''}></div>`;
    openModal(`
      <div class="modal-head">
        <h2 id="modal-title">${draft ? 'เพิ่มผู้สมัครจาก Resume' : isNew ? 'เพิ่มผู้สมัคร' : 'แก้ไข ' + esc(v.id)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="ปิด">${ICONS.close}</button>
      </div>
      <form data-cform class="form-grid" novalidate>
        <div class="field"><label for="cf-id">Candidate ID${isNew ? ' <span class="muted" style="font-weight:500">· รันอัตโนมัติ</span>' : ''}</label><input id="cf-id" name="id" class="input mono" value="${esc(v.id || '')}" ${isNew ? '' : 'readonly'} required></div>
        ${f('name', 'ชื่อ-นามสกุล', v.name)}
        ${f('position', 'ตำแหน่ง', v.position)}
        ${f('age', 'อายุ', v.age, 'number')}
        ${f('experience', 'ประสบการณ์รวม (ปี)', v.experience, 'number')}
        ${f('education', 'การศึกษา', v.education)}
        ${f('company', 'บริษัทล่าสุด', v.company)}
        ${f('email', `อีเมล <span class="hr-only">เห็นเฉพาะ ${esc(HRS)}</span>`, v.email, 'email')}
        ${f('phone', `เบอร์โทรศัพท์ <span class="hr-only">เห็นเฉพาะ ${esc(HRS)}</span>`, v.phone, 'tel')}
        ${f('cvUrl', 'ลิงก์ Resume / CV', v.cvUrl, 'url')}
        ${f('salaryCurrent', 'เงินเดือนปัจจุบัน', v.salaryCurrent, 'number')}
        ${f('salaryExpected', 'เงินเดือนคาดหวัง', v.salaryExpected, 'number')}
        <div class="span-2 pre-check"><input type="checkbox" id="cf-pre" name="preInterviewed" aria-labelledby="cf-pre-t" ${v.preInterviewed ? 'checked' : ''}><span id="cf-pre-t">Pre-interview แล้ว <span class="muted" style="font-weight:500">· การ์ดผู้สมัครจะแสดง "Pre-interviewed"</span></span></div>
        <div class="span-2" style="display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;min-height:44px"><input type="checkbox" id="cf-sal" name="showSalary" aria-labelledby="cf-sal-t" ${v.showSalary ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--violet)"><span id="cf-sal-t">ให้แผนกเห็นเงินเดือนของผู้สมัครรายนี้</span></div>
        ${f('prescreenDate', 'วันที่ Prescreen', v.prescreenDate, 'date')}
        <div class="field"><label for="cf-rec">HR Recommendation</label><select id="cf-rec" name="recommendation" class="input"><option value="">อัตโนมัติจาก Candidate Score</option>${RECOMMENDATIONS.map((r) => `<option value="${r}" ${r === v.recommendation ? 'selected' : ''}>${recLabel(r)}</option>`).join('')}</select></div>
        <div class="field"><label for="cf-loc">อยู่ที่ Pool</label><select id="cf-loc" name="location" class="input">${LOCATIONS.map((l) => `<option value="${esc(l)}" ${l === v.location ? 'selected' : ''}>${esc(locLabel(l))}</option>`).join('')}</select></div>
        <div class="field span-2"><label for="cf-note">ความเห็นจาก ${esc(NOTE_FROM)} (HR Highlight) <span class="muted" style="font-weight:500">· การ์ดแสดง 30 ตัวอักษรแรก</span></label><textarea id="cf-note" name="hrNote" class="input" rows="${draft ? 5 : 3}">${esc(v.hrNote || '')}</textarea></div>
        <fieldset class="span-2 score-set">
          <legend>คะแนนรายมิติ (1 ต่ำ – 5 สูง) ใช้คำนวณ Candidate Score และกราฟเปรียบเทียบ</legend>
          ${scoreNote('span-all')}
          ${DIMENSIONS.map((dm) => `<div class="field"><span style="display:flex;align-items:center;gap:6px"><label for="cf-s-${dm.key}">${esc(dm.full)}</label>${dimInfo(dm)}</span><select id="cf-s-${dm.key}" name="s_${dm.key}" class="input"><option value="">ยังไม่ให้คะแนน</option>${[5, 4, 3, 2, 1].map((x) => `<option ${(v.scores || {})[dm.key] === x ? 'selected' : ''}>${x}</option>`).join('')}</select>${draft && draft.reasons[dm.key] ? `<span class="ai-reason">Claude: ${esc(draft.reasons[dm.key])}</span>` : ''}</div>`).join('')}
        </fieldset>
        <div class="error-box span-2" data-err hidden role="alert"></div>
        <div class="modal-actions span-2" style="justify-content:space-between">
          ${isNew ? '<span></span>' : '<button type="button" class="btn btn-danger" data-delete>ลบผู้สมัคร</button>'}
          <span style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn" data-close>ยกเลิก</button><button type="submit" class="btn btn-dark">บันทึก</button></span>
        </div>
      </form>`, (dlg, close) => {
      const form = dlg.querySelector('[data-cform]');
      const err = dlg.querySelector('[data-err]');
      const n = (x) => (x === '' ? null : Number(x));
      // Empty required fields get a red asterisk on a save attempt; filling one clears its mark.
      const markMissing = () => {
        const miss = REQUIRED_FIELDS.filter((k) => !String(form.elements[k].value || '').trim());
        REQUIRED_FIELDS.forEach((k) => {
          const el = form.elements[k], m = miss.includes(k);
          el.closest('.field').classList.toggle('missing', m);
          el.toggleAttribute('aria-invalid', m);
        });
        return miss;
      };
      form.addEventListener('input', (e) => {
        const fld = e.target.closest('.field.missing');
        if (fld && String(e.target.value).trim()) { fld.classList.remove('missing'); e.target.removeAttribute('aria-invalid'); }
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const miss = markMissing();
        if (miss.length) {
          err.hidden = false; err.textContent = 'กรอกข้อมูลในช่องที่มีดอกจันสีแดงให้ครบก่อนบันทึก';
          form.elements[miss[0]].focus();
          return;
        }
        err.hidden = true;
        const d = Object.fromEntries(new FormData(form));
        const scores = cleanScores(Object.fromEntries(DIMENSIONS.map((dm) => [dm.key, d['s_' + dm.key]])));
        DIMENSIONS.forEach((dm) => delete d['s_' + dm.key]);
        const rec = {
          ...(c || {}), ...d,
          id: d.id.trim(), name: d.name.trim(),
          age: n(d.age), experience: n(d.experience), salaryCurrent: n(d.salaryCurrent), salaryExpected: n(d.salaryExpected),
          prescreenDate: d.prescreenDate || null,
          decision: (c && c.decision) || 'รอพิจารณา',
          showSalary: form.elements.showSalary.checked,
          preInterviewed: form.elements.preInterviewed.checked,
          scores,
          assignedBy: d.location === POOL ? null : (c && c.location === d.location ? c.assignedBy : 'HR')
        };
        if (!rec.id || !rec.name) { err.hidden = false; err.textContent = 'ต้องระบุ Candidate ID และชื่อ-นามสกุล'; return; }
        rec.email = (d.email || '').trim(); rec.phone = (d.phone || '').trim();
        if (rec.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) { err.hidden = false; err.textContent = 'รูปแบบอีเมลไม่ถูกต้อง'; form.elements.email.focus(); return; }
        rec.cvUrl = (d.cvUrl || '').trim();
        if (rec.cvUrl && !isWebUrl(rec.cvUrl)) { err.hidden = false; err.textContent = 'ลิงก์ Resume / CV ต้องขึ้นต้นด้วย https:// หรือ http://'; return; }
        try {
          await store.saveCandidate(rec, isNew);
          close(); await reload();
          toast(isNew ? `เพิ่ม ${rec.id} แล้ว` : `บันทึก ${rec.id} แล้ว`);
        } catch (ex) { err.hidden = false; err.textContent = errorMessage(ex); }
      };
      const del = dlg.querySelector('[data-delete]');
      if (del) del.onclick = async () => {
        close();
        const ok = await confirmDialog({ title: `ลบ ${v.id} ${v.name}?`, body: 'ข้อมูลผู้สมัครรายนี้จะถูกลบถาวรและกู้คืนไม่ได้', confirm: 'ลบถาวร', danger: true });
        if (!ok) return;
        try { await store.deleteCandidate(v.id); await reload(); toast(`ลบ ${v.id} แล้ว`); }
        catch (ex) { toast(errorMessage(ex), { error: true }); }
      };
    }, { wide: true });
  }

  function passwordForm(u) {
    const min = CONFIG.minPasswordLength;
    openModal(`
      <div class="modal-head">
        <div style="display:flex;flex-direction:column;gap:4px">
          <h2 id="modal-title">ตั้งรหัสผ่านใหม่</h2>
          <p class="muted" style="font-size:15px">บัญชี <span class="mono">${esc(u.username)}</span> · รหัสผ่านเดิมจะใช้ไม่ได้ทันที</p>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="ปิด">${ICONS.close}</button>
      </div>
      <form data-pw class="form-grid" novalidate>
        <div class="field span-2"><label for="pw1">รหัสผ่านใหม่ (อย่างน้อย ${min} ตัว)</label><input id="pw1" class="input" type="password" autocomplete="new-password" minlength="${min}" required></div>
        <div class="field span-2"><label for="pw2">พิมพ์รหัสผ่านใหม่อีกครั้ง</label><input id="pw2" class="input" type="password" autocomplete="new-password" required></div>
        <div class="error-box span-2" data-err hidden role="alert"></div>
        <div class="modal-actions span-2"><button type="button" class="btn" data-close>ยกเลิก</button><button type="submit" class="btn btn-dark">บันทึกรหัสผ่าน</button></div>
      </form>`, (dlg, close) => {
      dlg.querySelector('[data-pw]').onsubmit = async (e) => {
        e.preventDefault();
        const a = dlg.querySelector('#pw1').value, b = dlg.querySelector('#pw2').value;
        const err = dlg.querySelector('[data-err]');
        const fail = (m) => { err.hidden = false; err.textContent = m; };
        if (a.length < min) return fail(`รหัสผ่านต้องมีอย่างน้อย ${min} ตัว`);
        if (a !== b) return fail('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        try { const msg = await store.setPassword(u, a); close(); toast(msg); }
        catch (ex) { fail(errorMessage(ex)); }
      };
    });
  }

  // After the org changes, every view and the login page use the new list.
  async function refreshOrg() {
    try { setOrg(await store.listOrg()); } catch (e) { /* keep current */ }
    await reload();
  }

  // Add a ฝ่าย, or rename one when `d` is given.
  function divisionForm(d) {
    openModal(`
      <div class="modal-head"><h2 id="modal-title">${d ? 'แก้ไขชื่อฝ่าย' : 'เพิ่มฝ่ายใหม่'}</h2><button type="button" class="icon-btn" data-close aria-label="ปิด">${ICONS.close}</button></div>
      <form data-div class="form-grid" novalidate>
        <div class="field span-2"><label for="dv-name">ชื่อฝ่าย</label><input id="dv-name" class="input" placeholder="เช่น ฝ่ายวิศวกรรม" value="${esc(d ? d.name : '')}" required></div>
        <p class="muted span-2" style="font-size:14px">${d ? 'ชื่อใหม่จะแสดงในหน้าเข้าสู่ระบบทันที บัญชีและรหัสผ่านของแผนกไม่เปลี่ยน' : 'ฝ่ายใหม่จะแสดงในหน้าเข้าสู่ระบบเมื่อเพิ่มแผนกแรกแล้ว'}</p>
        <div class="error-box span-2" data-err hidden role="alert"></div>
        <div class="modal-actions span-2"><button type="button" class="btn" data-close>ยกเลิก</button><button type="submit" class="btn btn-dark">${d ? 'บันทึก' : 'เพิ่มฝ่าย'}</button></div>
      </form>`, (dlg, close) => {
      dlg.querySelector('[data-div]').onsubmit = async (e) => {
        e.preventDefault();
        const name = dlg.querySelector('#dv-name').value;
        const err = dlg.querySelector('[data-err]');
        try {
          if (d) await store.renameDivision(d.id, name); else await store.addDivision(name);
          close(); await refreshOrg(); toast(d ? `เปลี่ยนชื่อเป็น ${name.trim()} แล้ว` : `เพิ่ม${name.trim()}แล้ว`);
        } catch (ex) { err.hidden = false; err.textContent = errorMessage(ex); }
      };
    });
  }

  async function deleteDivision(d) {
    if (d.units.length) {
      toast(`ลบ${d.name}ไม่ได้ เพราะยังมี ${d.units.length} แผนก (${d.units.join(', ')})`, { error: true });
      return;
    }
    const ok = await confirmDialog({ title: `ลบ${d.name}?`, body: 'ฝ่ายนี้ยังไม่มีแผนก จึงลบได้โดยไม่กระทบบัญชีหรือผู้สมัคร', confirm: 'ลบฝ่าย', danger: true });
    if (!ok) return;
    try { await store.deleteDivision(d.id); await refreshOrg(); toast(`ลบ${d.name}แล้ว`); }
    catch (ex) { toast(errorMessage(ex), { error: true }); }
  }

  // Move a แผนก to another ฝ่าย and/or change its code.
  function unitEditForm(code) {
    const current = DIVISIONS.find((d) => d.units.includes(code));
    openModal(`
      <div class="modal-head"><h2 id="modal-title">แก้ไขแผนก ${esc(code)}</h2><button type="button" class="icon-btn" data-close aria-label="ปิด">${ICONS.close}</button></div>
      <form data-unit-edit class="form-grid" novalidate>
        <div class="field"><label for="ue-div">ฝ่าย</label><select id="ue-div" class="input">${DIVISIONS.map((d) => `<option value="${esc(d.id)}" ${current && d.id === current.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="ue-code">รหัสแผนก</label><input id="ue-code" class="input mono" value="${esc(code)}" autocomplete="off" style="text-transform:uppercase" required></div>
        <div class="warn-box span-2" style="font-size:14px">ถ้าเปลี่ยนรหัส ชื่อบัญชีเข้าสู่ระบบและชื่อ Pool จะเปลี่ยนตาม รหัสผ่านเดิมยังใช้ได้ ผู้สมัคร นัดสัมภาษณ์ และเวลา 72 ชม. ที่นับอยู่ย้ายไปด้วยทั้งหมด คนที่ล็อกอินแผนกนี้อยู่ต้องออกแล้วเข้าใหม่</div>
        <div class="error-box span-2" data-err hidden role="alert"></div>
        <div class="modal-actions span-2"><button type="button" class="btn" data-close>ยกเลิก</button><button type="submit" class="btn btn-dark">บันทึก</button></div>
      </form>`, (dlg, close) => {
      dlg.querySelector('[data-unit-edit]').onsubmit = async (e) => {
        e.preventDefault();
        const err = dlg.querySelector('[data-err]');
        const btn = e.target.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          const v = await store.updateUnit({ code, newCode: dlg.querySelector('#ue-code').value, divisionId: dlg.querySelector('#ue-div').value });
          close(); await refreshOrg(); toast(v === code ? `บันทึกแผนก ${code} แล้ว` : `เปลี่ยน ${code} เป็น ${v} แล้ว`);
        } catch (ex) { btn.disabled = false; err.hidden = false; err.textContent = errorMessage(ex); }
      };
    });
  }

  async function deleteUnit(code) {
    const n = st.list.filter((c) => c.location === code).length;
    const ok = await confirmDialog({
      title: `ลบแผนก ${code}?`,
      body: `บัญชีเข้าสู่ระบบ ${code.toLowerCase()} จะถูกลบ${n ? ` และผู้สมัคร ${n} คนใน Pool นี้จะกลับเข้า Candidate Pool (การตัดสินใจและนัดสัมภาษณ์ถูกล้าง)` : ''} ย้อนกลับไม่ได้`,
      confirm: 'ลบแผนก', danger: true
    });
    if (!ok) return;
    try { const back = await store.deleteUnit(code); await refreshOrg(); toast(`ลบแผนก ${code} แล้ว${back ? ` · คืนผู้สมัคร ${back} คนเข้า Candidate Pool` : ''}`); }
    catch (ex) { toast(errorMessage(ex), { error: true }); }
  }

  function unitForm(divisionId) {
    const min = CONFIG.minPasswordLength;
    openModal(`
      <div class="modal-head"><h2 id="modal-title">เพิ่มแผนกและบัญชีเข้าสู่ระบบ</h2><button type="button" class="icon-btn" data-close aria-label="ปิด">${ICONS.close}</button></div>
      <form data-unit-form class="form-grid" novalidate>
        <div class="field"><label for="un-div">ฝ่าย</label><select id="un-div" class="input">${DIVISIONS.map((d) => `<option value="${esc(d.id)}" ${d.id === divisionId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="un-code">รหัสแผนก</label><input id="un-code" class="input mono" placeholder="เช่น ENG-01" autocomplete="off" style="text-transform:uppercase" required></div>
        <div class="field"><label for="un-pw1">รหัสผ่าน (อย่างน้อย ${min} ตัว)</label><input id="un-pw1" class="input" type="password" autocomplete="new-password" minlength="${min}" required></div>
        <div class="field"><label for="un-pw2">พิมพ์รหัสผ่านอีกครั้ง</label><input id="un-pw2" class="input" type="password" autocomplete="new-password" required></div>
        <p class="muted span-2" style="font-size:14px">รหัสแผนกใช้เป็นชื่อบัญชีและชื่อ Pool ของแผนก ใช้ได้เฉพาะ A–Z, 0–9 และ - และเปลี่ยนภายหลังไม่ได้</p>
        <div class="error-box span-2" data-err hidden role="alert"></div>
        <div class="modal-actions span-2"><button type="button" class="btn" data-close>ยกเลิก</button><button type="submit" class="btn btn-dark">สร้างแผนกและบัญชี</button></div>
      </form>`, (dlg, close) => {
      dlg.querySelector('[data-unit-form]').onsubmit = async (e) => {
        e.preventDefault();
        const err = dlg.querySelector('[data-err]');
        const fail = (m) => { err.hidden = false; err.textContent = m; };
        const a = dlg.querySelector('#un-pw1').value, b = dlg.querySelector('#un-pw2').value;
        if (a.length < min) return fail(`รหัสผ่านต้องมีอย่างน้อย ${min} ตัว`);
        if (a !== b) return fail('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        const btn = e.target.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          const code = await store.addUnit({ code: dlg.querySelector('#un-code').value, divisionId: dlg.querySelector('#un-div').value, password: a });
          close(); await refreshOrg(); toast(`สร้างแผนก ${code} และบัญชีเข้าสู่ระบบแล้ว`);
        } catch (ex) { btn.disabled = false; fail(errorMessage(ex)); }
      };
    });
  }

  async function importFile(file) {
    let parsed;
    try {
      const { parseWorkbook } = await import('../excel.js');
      parsed = await parseWorkbook(file, st.list);
    } catch (e) { toast(errorMessage(e), { error: true }); return; }
    const existing = new Set(st.list.map((c) => c.id));
    const updates = parsed.records.filter((r) => existing.has(r.id)).length;
    const byLoc = LOCATIONS.map((l) => [l, parsed.records.filter((r) => r.location === l).length]).filter((x) => x[1]);
    openModal(`
      <div class="modal-head"><h2 id="modal-title">นำเข้าจาก ${esc(file.name)}</h2><button type="button" class="icon-btn" data-close aria-label="ปิด">${ICONS.close}</button></div>
      ${parsed.records.length ? `
        <p style="font-size:15px;line-height:1.7">พบผู้สมัคร <strong>${parsed.records.length}</strong> รายการ จากชีต ${parsed.sheets.map((s) => esc(s.name)).join(', ')} · เพิ่มใหม่ ${parsed.records.length - updates} · อัปเดตของเดิม ${updates}${parsed.autoIds.length ? ` · รัน Candidate ID ให้ ${parsed.autoIds.length} คน (${esc(parsed.autoIds[0])}${parsed.autoIds.length > 1 ? ` – ${esc(parsed.autoIds[parsed.autoIds.length - 1])}` : ''})` : ''}</p>
        <ul class="legend">${byLoc.map(([l, n]) => `<li><span class="dot" style="background:${locStyle(l).color}" aria-hidden="true"></span>${esc(locLabel(l))} <strong>${n}</strong></li>`).join('')}</ul>` : '<div class="error-box">ไม่พบแถวข้อมูลที่มีคอลัมน์ "Candidate ID" ในไฟล์นี้</div>'}
      ${parsed.duplicates.length ? `<div class="warn-box">พบ ID ซ้ำในไฟล์ ใช้แถวแรกที่พบและข้ามแถวที่ซ้ำ ${parsed.duplicates.length} แถว: ${esc([...new Set(parsed.duplicates)].join(', '))}</div>` : ''}
      ${parsed.skipped ? `<div class="warn-box">ข้าม ${parsed.skipped} แถวที่ไม่มีชื่อ-นามสกุล</div>` : ''}
      <p class="muted" style="font-size:14px">ผู้สมัครที่ในไฟล์เลือก "หน่วยงาน/โครงการ" ไว้แต่ยังไม่ถูกย้าย จะถูกนำเข้าไปที่ Pool ปลายทางนั้น</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>ยกเลิก</button>${parsed.records.length ? '<button type="button" class="btn btn-dark" data-ok>นำเข้า</button>' : ''}</div>`,
    (dlg, close) => {
      const ok = dlg.querySelector('[data-ok]');
      if (ok) ok.onclick = async () => {
        ok.disabled = true;
        try { const n = await store.importCandidates(parsed.records); close(); await reload({ animate: true }); toast(`นำเข้า ${n} รายการแล้ว`); }
        catch (e) { ok.disabled = false; toast(errorMessage(e), { error: true }); }
      };
    });
  }

  async function run(action, msg, opts) {
    try { const r = await action(); await reload(); if (msg) toast(typeof msg === 'function' ? msg(r) : msg, opts); }
    catch (e) { toast(errorMessage(e), { error: true }); await reload(); }
  }

  /* ---------- one candidate: popup with its actions ---------- */
  const moveCandidate = (c, to) => {
    const from = c.location;
    return run(() => store.moveTo(c.id, to), to === POOL ? `ดึง ${c.id} กลับ Candidate Pool แล้ว` : `ส่ง ${c.id} เข้า Pool ${to} แล้ว`, {
      action: 'เลิกทำ', onAction: () => run(() => store.moveTo(c.id, from), `ย้าย ${c.id} กลับ ${locLabel(from)} แล้ว`)
    });
  };
  function moveForm(c) {
    const targets = LOCATIONS.filter((l) => l !== c.location);
    openModal(`
      <div class="modal-head">
        <div style="display:flex;flex-direction:column;gap:4px">
          <h2 id="modal-title">ส่งเข้า Pool ส่วนงาน</h2>
          <p class="muted" style="font-size:15px">${esc(c.id)} · ${esc(c.name)} · ตอนนี้อยู่ที่ ${esc(locLabel(c.location))}</p>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="ปิด">${ICONS.close}</button>
      </div>
      <div class="field"><label for="mv-to">ย้ายไปที่</label>
        <select id="mv-to" class="input">${targets.map((l) => `<option value="${esc(l)}">${l === POOL ? 'ดึงกลับ Candidate Pool' : esc(unitFullLabel(l))}</option>`).join('')}</select></div>
      <p class="muted" style="font-size:14px">สถานะจะกลับเป็น "รอพิจารณา" และนัดสัมภาษณ์เดิมจะถูกยกเลิก</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>ยกเลิก</button><button type="button" class="btn btn-dark" data-ok>ย้าย</button></div>`, (dlg, close) => {
      dlg.querySelector('[data-ok]').addEventListener('click', () => { const to = dlg.querySelector('#mv-to').value; close(); moveCandidate(c, to); });
    });
  }
  function candidatePopup(c) {
    if (!c) return;
    openProfile(c, {
      showContact: true,
      actions: [
        { id: 'edit', label: 'แก้ไขข้อมูล' },
        { id: 'move', label: c.location === POOL ? 'ส่งเข้า Pool ส่วนงาน' : 'ย้าย / ดึงกลับ' },
        { id: 'interview', label: c.interviewStatus === 'requested' ? 'ยืนยันนัด' : c.interviewStatus ? 'ดูนัด' : 'นัดสัมภาษณ์', primary: true }
      ],
      onAction: (id) => (id === 'edit' ? candidateForm(c) : id === 'move' ? moveForm(c) : c.interviewStatus ? detail(c) : interviewForm(c))
    });
  }

  /* ---------- events ---------- */
  root.onclick = async (e) => {
    const t = (s) => e.target.closest(s);
    let el;
    if ((el = t('[data-signout]'))) return signOut();
    if ((el = t('[data-bell]'))) {
      const list = st.notifs;
      openNotifications(list, { onItem: (id) => { const c = byId(id); if (c && c.interviewStatus) detail(c); } });
      const unread = list.filter((n) => !n.readAt).map((n) => n.id);
      if (unread.length) {
        try { await store.markNotificationsRead(unread); } catch (ex) { /* retry next poll */ }
        st.notifs = list.map((n) => (unread.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n));
        const bell = root.querySelector('[data-bell]');
        if (bell) bell.outerHTML = bellHTML(st.notifs);
      }
      return;
    }
    if ((el = t('[data-tab]'))) { st.tab = el.dataset.tab; st.animate = true; return render(); }
    if ((el = t('[data-refresh]'))) return reload({ animate: true });
    if ((el = t('[data-loc]'))) { st.loc = el.dataset.loc; return render(); }
    if ((el = t('[data-cal]'))) {
      const a = el.dataset.cal;
      st.month = a === 'today' ? monthStart() : shiftMonth(st.month, a === 'prev' ? -1 : 1);
      st.animate = true;
      return render();
    }
    if ((el = t('[data-event]')) || (el = t('[data-detail]'))) return detail(byId(el.dataset.event || el.dataset.detail));
    if ((el = t('[data-interview]'))) return interviewForm(byId(el.dataset.interview));
    if ((el = t('[data-compare-open]'))) return openCompare(st.list, [], { pos: st.f.pos });
    if ((el = t('[data-f-group]'))) { st.f.group = !st.f.group; return render(); }
    if ((el = t('[data-f-clear]'))) { st.f = newFilterState(); st.q = ''; st.loc = 'all'; render(); toast('ล้างตัวกรองแล้ว'); return; }
    if ((el = t('[data-bulk]'))) return bulkAction(el.dataset.bulk);
    if ((el = t('[data-profile]'))) return candidatePopup(byId(el.dataset.profile));
    // A click anywhere on a candidate row (not on its own controls) opens the same popup.
    if ((el = t('tr[data-row]')) && el.dataset.row && !t('button, a, input, select, label, details')) return candidatePopup(byId(el.dataset.row));
    if ((el = t('[data-add]'))) return candidateForm(null);
    if ((el = t('[data-resume]'))) return openResumeImport({ positions: positionsOf(st.list), onDraft: (d) => candidateForm(null, d) });
    if ((el = t('[data-edit]'))) return candidateForm(byId(el.dataset.edit));
    if ((el = t('[data-move-form]'))) return moveForm(byId(el.dataset.moveForm));
    if ((el = t('[data-export]'))) {
      try { const { exportWorkbook } = await import('../excel.js'); await exportWorkbook(st.list); }
      catch (ex) { toast(errorMessage(ex), { error: true }); }
      return;
    }
    if ((el = t('[data-active]'))) {
      const u = st.users.find((x) => x.id === el.dataset.active);
      anim.press(el.querySelector('.switch-knob'));
      return run(() => store.setUserActive(u.id, !u.active), `${u.active ? 'ปิด' : 'เปิด'}ใช้งานบัญชี ${u.username} แล้ว`);
    }
    if ((el = t('[data-reset]'))) return passwordForm(st.users.find((x) => x.id === el.dataset.reset));
    if ((el = t('[data-add-division]'))) return divisionForm();
    if ((el = t('[data-edit-division]'))) return divisionForm(DIVISIONS.find((d) => d.id === el.dataset.editDivision));
    if ((el = t('[data-del-division]'))) return deleteDivision(DIVISIONS.find((d) => d.id === el.dataset.delDivision));
    if ((el = t('[data-edit-unit]'))) return unitEditForm(el.dataset.editUnit);
    if ((el = t('[data-del-unit]'))) return deleteUnit(el.dataset.delUnit);
    if ((el = t('[data-salary]'))) {
      const c = byId(el.dataset.salary);
      const on = !c.showSalary;
      anim.press(el.querySelector('.switch-knob'));
      return run(() => store.setShowSalary(c.id, on), on ? `แผนกเห็นเงินเดือนของ ${c.id} แล้ว` : `ซ่อนเงินเดือนของ ${c.id} แล้ว`);
    }
    if ((el = t('[data-home]'))) { e.preventDefault(); return goHome('#/admin'); }
    if ((el = t('[data-add-unit]'))) return unitForm(el.dataset.addUnit);
    if ((el = t('[data-reset-demo]'))) {
      const ok = await confirmDialog({ title: 'ล้างข้อมูลสาธิต?', body: 'ข้อมูลผู้สมัคร บัญชี และการแจ้งเตือนในเบราว์เซอร์นี้จะกลับเป็นค่าเริ่มต้น', confirm: 'ล้างข้อมูล' });
      if (ok) { await store.resetDemoData(); reload({ animate: true }); toast('ล้างข้อมูลสาธิตแล้ว'); }
    }
  };
  root.onchange = async (e) => {
    const el = e.target;
    if (el.dataset.sel) { el.checked ? st.sel.add(el.dataset.sel) : st.sel.delete(el.dataset.sel); return render(); }
    if (el.dataset.selAll !== undefined) { visibleRows().forEach((c) => (el.checked ? st.sel.add(c.id) : st.sel.delete(c.id))); return render(); }
    if (el.dataset.bulkMove !== undefined) { return el.value ? bulkMove(el.value) : undefined; }
    if (updateFilter(st.f, el)) {
      render();
      const back = root.querySelector('#' + el.id);
      if (back) back.focus();
      return;
    }
    if (el.dataset.decision) {
      const c = byId(el.dataset.decision), to = el.value;
      // Any status other than เรียกสัมภาษณ์ / นัดสัมภาษณ์แล้ว clears the candidate's interview, so ask first.
      if (c.interviewStatus && to !== 'เรียกสัมภาษณ์' && to !== 'นัดสัมภาษณ์แล้ว') {
        const ok = await confirmDialog({
          title: `เปลี่ยน ${c.id} เป็น "${to}"?`,
          body: 'นัดสัมภาษณ์ที่มีอยู่ของผู้สมัครคนนี้จะถูกยกเลิก', confirm: 'เปลี่ยนสถานะ'
        });
        if (!ok) return render();
      }
      return run(() => store.setDecision(c.id, to), `เปลี่ยนสถานะ ${c.id} เป็น "${to}" แล้ว`);
    }
    if (el.dataset.move && el.value) {
      const c = byId(el.dataset.move), to = el.value;
      const go = () => moveCandidate(c, to);
      return st.loc === 'all' ? go() : anim.leave(el.closest('tr'), go);
    }
    if (el.dataset.owner) {
      return run(() => store.updateUser(el.dataset.owner, { ownerName: el.value.trim() }), 'บันทึกชื่อผู้ถือบัญชีแล้ว');
    }
    if (el.dataset.import !== undefined && el.files && el.files[0]) {
      const file = el.files[0];
      el.value = '';
      importFile(file);
    }
  };
  root.oninput = (e) => {
    if (e.target.id === 'adm-search') {
      st.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const s = root.querySelector('#adm-search');
      s.focus(); s.setSelectionRange(pos, pos);
    }
  };
  root.onsubmit = null;
  onCleanup(watchNotifications(store, (list) => {
    const grew = list.filter((n) => !n.readAt).length > st.notifs.filter((n) => !n.readAt).length;
    st.notifs = list;
    // New requests change the overview list, so refresh data too.
    if (grew && !st.loading) reload();
    else { const bell = root.querySelector('[data-bell]'); if (bell) bell.outerHTML = bellHTML(list); }
  }));

  render();
  reload({ animate: true });
}
