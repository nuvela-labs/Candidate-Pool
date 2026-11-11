// HRS "การใช้งาน" tab: what each account does in Candidate Pool, from the usage log
// (store.track / supabase/014_usage_log.sql). Read-only; nothing here changes candidates.
import { esc, HRS, UNITS, unitFullLabel, fmtDateTime } from '../ui.js';

// Every action the log records, in the order the breakdown lists them.
export const USAGE_ACTIONS = {
  login: 'เข้าสู่ระบบ',
  visit: 'กลับมาใช้งาน (ยังไม่ได้ออกจากระบบ)',
  profile_view: 'เปิดดูข้อมูลผู้สมัคร',
  pick: 'เลือกผู้สมัครเข้า Pool',
  return: 'คืนผู้สมัครกลับ Candidate Pool',
  interview_request: 'ขอนัดสัมภาษณ์',
  interview_set: `ยืนยัน / แก้ไขนัดสัมภาษณ์ (${HRS})`,
  compare: 'เปรียบเทียบผู้สมัคร',
  decision: 'เปลี่ยน Executive Decision',
  move: `ย้ายผู้สมัคร (${HRS})`,
  candidate_add: 'เพิ่มผู้สมัคร',
  candidate_edit: 'แก้ไขข้อมูลผู้สมัคร',
  candidate_delete: 'ลบผู้สมัคร',
  resume_import: 'อ่าน Resume ด้วย Claude',
  excel_import: 'นำเข้า Excel',
  excel_export: 'ส่งออก Excel',
  guide_open: 'เปิดคู่มือการใช้งาน'
};
export const USAGE_PERIODS = [7, 30, 90];

const DAY = 86400000;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const usageSince = (days) => new Date(startOfDay(Date.now()) - (days - 1) * DAY).toISOString();
const accountOf = (e) => (e.role === 'admin' ? HRS : e.unit || '—');
const isEntry = (e) => e.action === 'login' || e.action === 'visit';
const label = (a) => USAGE_ACTIONS[a] || a;
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const shortDate = (t) => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

// Per-account table columns: [action(s), header].
const COLS = [
  [['login', 'visit'], 'เข้าใช้งาน'],
  [['pick'], 'เลือกเข้า Pool'],
  [['return'], 'คืนกลับ'],
  [['interview_request', 'interview_set'], 'นัดสัมภาษณ์'],
  [['compare'], 'เปรียบเทียบ'],
  [['profile_view'], 'ดูข้อมูลผู้สมัคร'],
  [['decision'], 'เปลี่ยนสถานะ']
];

export function usageHTML(u) {
  if (u.loading) return '<div class="loading" style="min-height:200px"><div class="spinner" role="img" aria-label="กำลังโหลด"></div></div>';
  const filterBar = `
    <div class="usage-bar">
      <div class="seg" role="group" aria-label="รูปแบบการแสดงผล">${[['all', 'รวมทุกบัญชี'], ['split', 'แยกตามบัญชี / PJT']].map(([m, l]) => `<button type="button" data-usage-mode="${m}" aria-pressed="${u.mode === m}">${l}</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="ช่วงเวลา">${USAGE_PERIODS.map((d) => `<button type="button" class="seg-btn" data-usage-days="${d}" aria-pressed="${u.days === d}">${d} วัน</button>`).join('')}</div>
      <label class="sr-only" for="usage-acct">บัญชี</label>
      <select id="usage-acct" class="input usage-acct" data-usage-acct>
        <option value="">ทุกบัญชี</option>
        ${[HRS, ...UNITS].map((a) => `<option value="${esc(a)}" ${u.acct === a ? 'selected' : ''}>${esc(a === HRS ? a : unitFullLabel(a))}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-sm" data-usage-csv ${u.events.length ? '' : 'disabled'}>ดาวน์โหลด CSV</button>
    </div>`;
  if (u.error) return `${filterBar}<div class="error-box" role="alert">${esc(u.error)}</div>`;

  const ev = u.acct ? u.events.filter((e) => accountOf(e) === u.acct) : u.events;
  const count = (acts) => ev.filter((e) => acts.includes(e.action)).length;
  const accounts = [HRS, ...UNITS];
  const activeAccts = new Set(ev.filter(isEntry).map(accountOf));
  if (u.mode === 'split') return filterBar + splitHTML(u, ev, accounts.filter((a) => !u.acct || a === u.acct));

  const kpis = [
    { label: 'ครั้งที่เข้าใช้งาน', v: count(['login', 'visit']), sub: `${activeAccts.size} จาก ${u.acct ? 1 : accounts.length} บัญชีเข้ามาใช้งาน`, bg: '#C8F169', fg: '#111' },
    { label: 'เลือกผู้สมัครเข้า Pool', v: count(['pick']), sub: `คืนกลับ ${count(['return'])} ครั้ง`, bg: '#FF7A3D', fg: '#111' },
    { label: 'นัดสัมภาษณ์', v: count(['interview_request']), sub: `${HRS} ยืนยัน / แก้ไขนัด ${count(['interview_set'])} ครั้ง`, bg: '#5B3DF5', fg: '#fff' },
    { label: 'เปรียบเทียบผู้สมัคร', v: count(['compare']), sub: `เปิดดูข้อมูลผู้สมัคร ${count(['profile_view'])} ครั้ง`, bg: '#8EC5FF', fg: '#111' }
  ];

  // Daily activity: one bar per day in the period, all actions together.
  const start = startOfDay(Date.now()) - (u.days - 1) * DAY;
  const days = Array.from({ length: u.days }, (_, i) => start + i * DAY);
  const perDay = new Map(days.map((d) => [dayKey(d), { total: 0, entries: 0 }]));
  ev.forEach((e) => { const p = perDay.get(dayKey(e.at)); if (p) { p.total++; if (isEntry(e)) p.entries++; } });
  const maxDay = Math.max(1, ...[...perDay.values()].map((p) => p.total));
  const every = u.days <= 7 ? 1 : u.days <= 30 ? 5 : 15;

  // Per account.
  const rows = accounts.filter((a) => !u.acct || a === u.acct).map((a) => {
    const mine = ev.filter((e) => accountOf(e) === a);
    return { a, total: mine.length, cells: COLS.map(([acts]) => mine.filter((e) => acts.includes(e.action)).length), last: mine.reduce((m, e) => (e.at > m ? e.at : m), '') };
  }).sort((x, y) => y.total - x.total);

  // Breakdown by action.
  const byAction = Object.keys(USAGE_ACTIONS).map((a) => ({ a, n: count([a]) })).filter((x) => x.n);
  const extra = [...new Set(ev.map((e) => e.action))].filter((a) => !USAGE_ACTIONS[a]).map((a) => ({ a, n: count([a]) }));
  const actions = [...byAction, ...extra].sort((x, y) => y.n - x.n);
  const maxAct = Math.max(1, ...actions.map((x) => x.n));

  const recent = ev.slice(0, 40);

  return `${filterBar}
    <section class="kpis" aria-label="ตัวเลขสรุปการใช้งาน">
      ${kpis.map((k) => `<div class="kpi" style="background:${k.bg};color:${k.fg}"><span class="kpi-label">${esc(k.label)}</span><span class="kpi-value">${k.v}</span><span class="kpi-sub">${esc(k.sub)}</span></div>`).join('')}
    </section>
    <section class="panel" aria-labelledby="u-daily">
      <h2 id="u-daily">กิจกรรมรายวัน · ${u.days} วันล่าสุด</h2>
      ${ev.length ? `<div class="daybars" role="img" aria-label="จำนวนการใช้งานต่อวัน สูงสุด ${maxDay} ครั้งต่อวัน">
        <div class="daybars-plot" style="--n:${u.days}">
          ${days.map((d) => { const p = perDay.get(dayKey(d)); return `<div class="daybar" title="${esc(shortDate(d))}: ${p.total} ครั้ง (เข้าใช้งาน ${p.entries})"><div style="height:${(p.total / maxDay * 100).toFixed(1)}%"></div></div>`; }).join('')}
        </div>
        <div class="daybars-axis" style="--n:${u.days}">${days.map((d, i) => `<span>${i % every === 0 || i === days.length - 1 ? esc(shortDate(d)) : ''}</span>`).join('')}</div>
      </div>
      <p class="muted" style="font-size:13px">สูงสุด ${maxDay} ครั้งต่อวัน · ชี้ที่แท่งเพื่อดูตัวเลขของวันนั้น</p>` : '<p class="muted">ยังไม่มีการใช้งานในช่วงนี้</p>'}
    </section>
    <section class="panel" aria-labelledby="u-acct">
      <h2 id="u-acct">แยกตามบัญชี</h2>
      <div style="overflow-x:auto"><table class="usage-table">
        <thead><tr><th scope="col">บัญชี</th>${COLS.map(([, h]) => `<th scope="col">${esc(h)}</th>`).join('')}<th scope="col">ใช้งานล่าสุด</th></tr></thead>
        <tbody>${rows.map((r) => `<tr${r.total ? '' : ' class="usage-idle"'}><th scope="row">${esc(r.a === HRS ? r.a : unitFullLabel(r.a))}</th>${r.cells.map((n) => `<td>${n || '<span class="muted">0</span>'}</td>`).join('')}<td>${r.last ? esc(fmtDateTime(r.last)) : '<span class="muted">ไม่มีการใช้งาน</span>'}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>
    <div class="panels">
      <section class="panel" aria-labelledby="u-act">
        <h2 id="u-act">ประเภทการใช้งาน</h2>
        ${actions.length ? actions.map(({ a, n }) => `<div class="hbar"><div style="display:flex;justify-content:space-between;gap:12px"><span style="font-weight:600">${esc(label(a))}</span><strong>${n}</strong></div><div class="hbar-track" aria-hidden="true"><div style="width:${Math.round(n / maxAct * 100)}%;background:#5B3DF5"></div></div></div>`).join('') : '<p class="muted">ยังไม่มีการใช้งานในช่วงนี้</p>'}
      </section>
      <section class="panel" aria-labelledby="u-recent">
        <h2 id="u-recent">กิจกรรมล่าสุด</h2>
        ${recent.length ? `<ul class="usage-log">${recent.map((e) => `<li><span class="usage-when">${esc(fmtDateTime(e.at))}</span><span><strong>${esc(accountOf(e))}</strong> ${esc(label(e.action))}${e.candidateId ? ` <span class="mono">${esc(e.candidateId)}</span>` : ''}${e.action === 'compare' && e.meta && e.meta.count ? ` ${e.meta.count} คน` : ''}${e.action === 'decision' && e.meta && e.meta.decision ? ` → ${esc(e.meta.decision)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">ยังไม่มีการใช้งานในช่วงนี้</p>'}
      </section>
    </div>`;
}

// "แยกตามบัญชี / PJT": one card per account (same scale on every card, so they compare
// at a glance), then every action × account in one table.
const CARD_STATS = [
  [['login', 'visit'], 'เข้าใช้งาน'],
  [['pick'], 'เลือกเข้า Pool'],
  [['interview_request', 'interview_set'], 'นัดสัมภาษณ์'],
  [['compare'], 'เปรียบเทียบ'],
  [['profile_view'], 'ดูข้อมูล'],
  [['return'], 'คืนกลับ']
];
function splitHTML(u, ev, accounts) {
  const start = startOfDay(Date.now()) - (u.days - 1) * DAY;
  const days = Array.from({ length: u.days }, (_, i) => start + i * DAY);
  const per = accounts.map((a) => {
    const mine = ev.filter((e) => accountOf(e) === a);
    const byDay = new Map(days.map((d) => [dayKey(d), 0]));
    mine.forEach((e) => { const k = dayKey(e.at); if (byDay.has(k)) byDay.set(k, byDay.get(k) + 1); });
    const activeDays = [...byDay.values()].filter(Boolean).length;
    return { a, mine, byDay, activeDays, last: mine.reduce((m, e) => (e.at > m ? e.at : m), '') };
  }).sort((x, y) => y.mine.length - x.mine.length);
  const maxDay = Math.max(1, ...per.flatMap((p) => [...p.byDay.values()]));
  const name = (a) => (a === HRS ? a : unitFullLabel(a));

  const cards = per.map((p) => `
    <article class="usage-card${p.mine.length ? '' : ' is-idle'}" aria-labelledby="uc-${esc(p.a)}">
      <header><h3 id="uc-${esc(p.a)}">${esc(name(p.a))}</h3>
        <span class="muted">${p.last ? `ล่าสุด ${esc(fmtDateTime(p.last))}` : 'ไม่มีการใช้งานในช่วงนี้'}</span></header>
      <dl class="usage-stats">${CARD_STATS.map(([acts, l]) => `<div><dt>${esc(l)}</dt><dd>${p.mine.filter((e) => acts.includes(e.action)).length}</dd></div>`).join('')}</dl>
      <div class="daybars-plot daybars-mini" style="--n:${u.days}" role="img" aria-label="${esc(name(p.a))}: ใช้งาน ${p.mine.length} ครั้ง ใน ${p.activeDays} จาก ${u.days} วัน">
        ${days.map((d) => { const n = p.byDay.get(dayKey(d)); return `<div class="daybar" title="${esc(shortDate(d))}: ${n} ครั้ง"><div style="height:${(n / maxDay * 100).toFixed(1)}%"></div></div>`; }).join('')}
      </div>
      <p class="muted" style="font-size:13px">ใช้งาน ${p.mine.length} ครั้ง · มีการใช้งาน ${p.activeDays} จาก ${u.days} วัน</p>
    </article>`).join('');

  // Action × account, with a light violet wash that grows with the count (numbers stay in ink).
  const acts = Object.keys(USAGE_ACTIONS).filter((a) => ev.some((e) => e.action === a));
  const cell = (n, max) => `<td style="background:rgba(91,61,245,${n ? (0.08 + 0.42 * n / max).toFixed(2) : 0})">${n || '<span class="muted">0</span>'}</td>`;
  const grid = acts.map((a) => ({ a, ns: per.map((p) => p.mine.filter((e) => e.action === a).length) }));
  const maxCell = Math.max(1, ...grid.flatMap((g) => g.ns));

  return `
    <section class="panel" aria-labelledby="u-cards">
      <h2 id="u-cards">แต่ละบัญชี · ${u.days} วันล่าสุด</h2>
      <p class="muted" style="font-size:13px">กราฟของทุกบัญชีใช้สเกลเดียวกัน (สูงสุด ${maxDay} ครั้งต่อวัน) จึงเทียบกันได้ทันที ชี้ที่แท่งเพื่อดูตัวเลขของวันนั้น</p>
      <div class="usage-cards">${cards}</div>
    </section>
    <section class="panel" aria-labelledby="u-matrix">
      <h2 id="u-matrix">การใช้งานแต่ละประเภท แยกตามบัญชี</h2>
      ${acts.length ? `<div style="overflow-x:auto"><table class="usage-table usage-matrix">
        <thead><tr><th scope="col">การใช้งาน</th>${per.map((p) => `<th scope="col">${esc(p.a)}</th>`).join('')}<th scope="col">รวม</th></tr></thead>
        <tbody>${grid.map((g) => `<tr><th scope="row">${esc(label(g.a))}</th>${g.ns.map((n) => cell(n, maxCell)).join('')}<td><strong>${g.ns.reduce((s, n) => s + n, 0)}</strong></td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">รวมทั้งหมด</th>${per.map((p) => `<td><strong>${p.mine.length}</strong></td>`).join('')}<td><strong>${ev.length}</strong></td></tr></tfoot>
      </table></div>` : '<p class="muted">ยังไม่มีการใช้งานในช่วงนี้</p>'}
    </section>`;
}

// CSV for deeper analysis in Excel (UTF-8 with BOM so Thai shows correctly).
export function downloadUsageCsv(events, days) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['วันเวลา', 'บัญชี', 'การใช้งาน', 'รหัสการใช้งาน', 'Candidate ID', 'รายละเอียด'].map(q).join(',')];
  events.forEach((e) => lines.push([
    new Date(e.at).toLocaleString('th-TH'), accountOf(e), label(e.action), e.action, e.candidateId || '',
    e.meta && Object.keys(e.meta).length ? JSON.stringify(e.meta) : ''
  ].map(q).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `candidate-pool-usage-${days}d.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
