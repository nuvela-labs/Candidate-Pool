// แผนก workspace: own pool (request interviews, return), the Candidate Pool (pick),
// candidate profiles, interview calendar, comparison and notifications.
import {
  esc, ICONS, LOGO, POOL, HRS, MODE_LABEL, avatarFor, recommendationFor, recLabel, unitFullLabel,
  fmtDate, fmtDateTime, baht, pct, toast, confirmDialog, errorMessage, isNew, NEW_BADGE, NEW_TAG, holdLeft, safeUrl, goHome, matchColor, candScore, clip, NOTE_FROM, preTag, menuHTML
} from '../ui.js';
import { CONFIG } from '../config.js';
import * as anim from '../anim.js';
import { newFilterState, positionsOf, applyFilters, groupByPosition, filterBarHTML, updateFilter } from '../filters.js';
import { openInterviewForm, showInterviewDetail } from '../interview.js';
import { calendarHTML, monthStart, shiftMonth } from '../calendar.js';
import { openCompare } from '../compare.js';
import { bellHTML, openNotifications, watchNotifications } from '../notify.js';
import { openProfile } from '../profile.js';

// Units only request interviews or send candidates back; ผ่านการพิจารณา / สำรอง / ไม่ผ่านการพิจารณา / อื่นๆ set by
// HRS still get a chip, but only when some candidate has them.
const FILTERS = ['all', 'รอพิจารณา', 'เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว'];
const HRS_ONLY_FILTERS = ['ผ่านการพิจารณา', 'สำรอง', 'ไม่ผ่านการพิจารณา', 'อื่นๆ'];

export function mountPjt(root, { store, session, signOut, onCleanup }) {
  const unit = session.unit;
  const st = {
    list: [], notifs: [], view: 'mine', filter: 'all', q: '', loading: true, error: '', animate: true,
    month: monthStart(), f: newFilterState()
  };

  async function reload({ animate = false } = {}) {
    try { st.list = await store.listCandidates(); st.error = ''; }
    catch (e) { st.error = errorMessage(e); }
    // Listing may have released expired holds, which creates notifications.
    try { st.notifs = await store.listNotifications(); } catch (e) { /* keep previous */ }
    st.loading = false;
    st.animate = animate;
    render();
  }

  const mine = () => st.list.filter((c) => c.location === unit);
  const pool = () => st.list.filter((c) => c.location === POOL);
  const byId = (id) => st.list.find((c) => c.id === id);

  function interviewBlock(c) {
    if (c.interviewStatus === 'requested') {
      return `<div class="interview-box requested">
        <span style="display:flex;flex-direction:column;gap:2px">
          <strong style="font-size:15px">รอ ${esc(HRS)} ยืนยันนัด</strong>
          <span>${esc(fmtDateTime(c.interviewAt))} · ${esc(MODE_LABEL[c.interviewMode])} · ผู้สัมภาษณ์ ${(c.interviewers || []).length} คน</span>
        </span>
        <button type="button" class="btn btn-sm" data-request="${esc(c.id)}">แก้ไขคำขอ</button>
      </div>`;
    }
    if (c.interviewStatus === 'confirmed') {
      return `<div class="interview-box confirmed">
        <span style="display:flex;flex-direction:column;gap:4px;min-width:0">
          <strong style="font-size:15px">ยืนยันนัดแล้ว · ${esc(fmtDateTime(c.interviewAt))}</strong>
          <span>${c.interviewMode === 'online'
            ? (safeUrl(c.meetingLink) ? `${ICONS.video} <a href="${esc(safeUrl(c.meetingLink))}" target="_blank" rel="noopener noreferrer">เข้าห้องสัมภาษณ์ Online</a>` : 'Online')
            : `${ICONS.pin} ${esc(c.interviewLocation || 'Onsite')}`}</span>
        </span>
        <button type="button" class="btn btn-sm" data-detail="${esc(c.id)}">รายละเอียด</button>
      </div>`;
    }
    return '';
  }

  // Live countdown (hours:minutes:seconds) for candidates this unit picked and has
  // not decided on yet; the ticker below updates [data-hold] every second.
  function holdBlock(c) {
    const h = holdLeft(c);
    if (!h) return '';
    return `<div class="hold${h.urgent ? ' urgent' : ''}" data-hold-box title="เด้งกลับ Candidate Pool ${esc(fmtDateTime(c.holdUntil))} · กด นัดสัมภาษณ์ เพื่อหยุดเวลา">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>
      <strong class="mono" data-hold="${esc(c.holdUntil)}" aria-label="เหลือเวลาก่อนเด้งกลับ Candidate Pool ${esc(h.text)}">${esc(h.clock)}</strong>
    </div>`;
  }
  // HRS decides per candidate; the server sends no salary for the others.
  const showSalary = (c) => !!c.showSalary;

  // Card shows the first 30 characters of the comment; the profile (click the card) shows all of it.
  const noteText = (c) => `<span class="note-label">ความเห็นจาก ${NOTE_FROM}</span><p title="${esc(c.hrNote || '')}">${esc(c.hrNote ? clip(c.hrNote, 30) : 'ยังไม่มีความเห็น')}</p>`;

  function candidateCard(c) {
    const av = avatarFor(c.id);
    const rec = recommendationFor(c);
    const m = candScore(c) ?? 0;
    const mc = matchColor(candScore(c));
    const recStyle = rec === 'Strongly Recommend' ? 'background:#111;color:#fff' : rec === 'Recommend' ? 'background:#E4DDFF;color:#2A1A8C' : 'background:#ECEBE7;color:#3D3C38';
    return `
    <article class="card" data-card="${esc(c.id)}">
      ${isNew(c) ? NEW_TAG : ''}
      <div class="card-head">
        <span class="avatar" aria-hidden="true" style="border-radius:${av.shape};background:${av.bg};color:${av.fg}">${esc(c.name.charAt(0))}</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <span class="card-id">${esc(c.id)} · Prescreen ${esc(fmtDate(c.prescreenDate))}</span>
          <h2><button type="button" class="name-btn" data-profile="${esc(c.id)}">${esc(c.name)}</button></h2>
          <span class="muted" style="font-size:15px">${esc(c.position || '—')} · ${esc(c.experience ?? '—')} ปี · อายุ ${esc(c.age ?? '—')}</span>
          <span class="card-tags">${preTag(c)}</span>
        </div>
        <div class="match"><strong style="color:${mc.text}">${pct(candScore(c))}</strong><span>Candidate Score</span></div>
      </div>
      ${holdBlock(c)}
      <div class="bar" aria-hidden="true"><div data-grow style="width:${Math.round(m * 100)}%;background:${mc.fill}"></div></div>
      <dl class="facts">
        <div><dt>บริษัทล่าสุด</dt><dd>${esc(c.company || '—')}</dd></div>
        <div><dt>การศึกษา</dt><dd>${esc(c.education || '—')}</dd></div>
        ${showSalary(c) ? `
        <div><dt>เงินเดือนปัจจุบัน</dt><dd>${baht(c.salaryCurrent)}</dd></div>
        <div><dt>เงินเดือนคาดหวัง</dt><dd>${baht(c.salaryExpected)}</dd></div>` : ''}
      </dl>
      <div class="note">
        ${rec ? `<span class="pill" style="align-self:flex-start;${recStyle}">${esc(recLabel(rec))}</span>` : ''}
        ${noteText(c)}
      </div>
      ${interviewBlock(c)}
      <div class="card-actions">
        ${c.interviewStatus ? '' : `<button type="button" class="btn btn-dark" data-request="${esc(c.id)}"><span style="color:#C8F169;display:flex">${ICONS.calendar}</span>นัดสัมภาษณ์</button>`}
        ${menuHTML({ title: `ตัวเลือกเพิ่มเติม ${c.id}`, label: c.interviewStatus ? 'ตัวเลือก' : '', cls: c.interviewStatus ? 'btn' : 'btn icon-only', align: 'right', items: [
          { label: 'เปรียบเทียบกับคนอื่น', icon: ICONS.radar, attrs: `data-compare="${esc(c.id)}"` },
          safeUrl(c.cvUrl) ? { label: 'เปิด CV', icon: ICONS.doc, href: safeUrl(c.cvUrl), attrs: 'target="_blank" rel="noopener noreferrer"' } : null,
          { label: 'ส่งคืน Candidate Pool', icon: ICONS.back, attrs: `data-return="${esc(c.id)}"`, sep: true }
        ] })}
      </div>
      <div class="card-foot">
        <span class="muted" style="font-size:13px">${c.assignedBy === unit ? 'คุณเลือกจาก Candidate Pool' : `${esc(HRS)} ส่งเข้า Pool นี้`}</span>
      </div>
    </article>`;
  }

  function poolCard(c) {
    const av = avatarFor(c.id);
    return `
    <article class="card" data-card="${esc(c.id)}" style="gap:16px">
      ${isNew(c) ? NEW_TAG : ''}
      <div class="card-head">
        <span class="avatar" aria-hidden="true" style="border-radius:${av.shape};background:${av.bg};color:${av.fg}">${esc(c.name.charAt(0))}</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <span class="card-id">${esc(c.id)} · Prescreen ${esc(fmtDate(c.prescreenDate))}</span>
          <h2><button type="button" class="name-btn" data-profile="${esc(c.id)}">${esc(c.name)}</button></h2>
          <span class="muted" style="font-size:15px">${esc(c.position || '—')} · ${esc(c.experience ?? '—')} ปี${showSalary(c) ? ` · คาดหวัง ${baht(c.salaryExpected)}` : ''}</span>
          <span class="card-tags">${preTag(c)}</span>
        </div>
        <div class="match"><strong style="font-size:26px;color:${matchColor(candScore(c)).text}">${pct(candScore(c))}</strong><span>Candidate Score</span></div>
      </div>
      <div class="note">${noteText(c)}</div>
      <div class="card-bottom" style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn icon-only" data-compare="${esc(c.id)}" title="เปรียบเทียบกับคนอื่น" aria-label="เปรียบเทียบ ${esc(c.id)} กับคนอื่น">${ICONS.radar}</button>
        <button type="button" class="btn btn-dark" style="flex:1" data-pick="${esc(c.id)}"><span style="color:#C8F169;display:flex">${ICONS.plus}</span>เลือกเข้า Pool ของ ${esc(unit)}</button>
      </div>
    </article>`;
  }

  const groupsHTML = (list, card, label) => groupByPosition(list, st.f.group).map(([pos, items]) => `
    <section class="group" aria-label="${esc(pos || label)}">
      ${pos ? `<h3 class="group-title">${esc(pos)} <span class="count">${items.length}</span>${items.some(isNew) ? ` ${NEW_BADGE}` : ''}</h3>` : ''}
      <div class="card-grid">${items.map(card).join('')}</div>
    </section>`).join('');

  const searchBox = () => `
    <div class="search">
      <label for="pjt-search" class="sr-only">ค้นหาผู้สมัคร</label>${ICONS.search}
      <input id="pjt-search" class="input" type="search" placeholder="ค้นหาชื่อ, ID หรือตำแหน่ง" value="${esc(st.q)}">
    </div>`;
  const emptyState = (title, sub) => `
    <div class="empty"><span aria-hidden="true" style="width:64px;height:64px;border-radius:64px 64px 0 0;background:#C8F169"></span>
    <p style="font-size:16px;font-weight:600">${esc(title)}</p><p class="muted" style="font-size:14px">${esc(sub)}</p></div>`;

  function render() {
    const m = mine();
    const p = pool();
    const count = (fn) => m.filter(fn).length;
    const kpis = [
      { label: 'รอพิจารณา', v: count((c) => c.decision === 'รอพิจารณา'), bg: '#FFD84D', fg: '#111', deco: '#fff', shape: '999px' },
      { label: `รอ ${HRS} ยืนยันนัด`, v: count((c) => c.interviewStatus === 'requested'), bg: '#FF7A3D', fg: '#111', deco: '#FFB3D1', shape: '88px 0 0 0' },
      { label: 'นัดสัมภาษณ์แล้ว', v: count((c) => c.interviewStatus === 'confirmed'), bg: '#5B3DF5', fg: '#fff', deco: '#C8F169', shape: '999px' },
      { label: 'ทั้งหมดใน Pool', v: m.length, bg: '#8EC5FF', fg: '#111', deco: '#111', shape: '0 88px 0 0' }
    ];
    const chips = [...FILTERS, ...HRS_ONLY_FILTERS.filter((f) => count((c) => c.decision === f) || st.filter === f)];
    const q = st.q.trim().toLowerCase();
    const matchQ = (c) => !q || `${c.id} ${c.name} ${c.position}`.toLowerCase().includes(q);
    const shownMine = applyFilters(m, st.f).filter((c) => (st.filter === 'all' || c.decision === st.filter) && matchQ(c));
    const shownPool = applyFilters(p, st.f).filter(matchQ);
    const V = st.view;
    const bar = filterBarHTML(st.f, positionsOf(V === 'mine' ? m : p), { prefix: 'pf', dirty: !!st.q || (V === 'mine' && st.filter !== 'all') });
    const HEAD = {
      mine: [`Pool ของ ${unit}`, `ขอนัดสัมภาษณ์ภายใน ${CONFIG.holdHours} ชม. หลังดึงเข้า Pool หรือส่งคืน Candidate Pool`],
      market: ['Candidate Pool', `ผู้สมัครที่ ${HRS} คัดกรองแล้วและยังไม่อยู่ใน Pool ของแผนกใด`],
      calendar: ['ปฏิทินสัมภาษณ์', `นัดสัมภาษณ์ของ ${unit} ทั้งที่รอยืนยันและยืนยันแล้ว`]
    };

    root.innerHTML = `
    <header class="topbar">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <a href="#/pjt" class="logo" data-home title="กลับหน้าหลักและรีเฟรช">${LOGO}<span>Candidate Pool</span></a>
        <span class="unit-badge">${esc(unitFullLabel(unit))}</span>
      </div>
      <div class="account-bar" style="margin:0">
        <a class="btn btn-sm btn-ghost" href="guide.html" target="_blank" rel="noopener" data-guide title="คู่มือการใช้งาน (เปิดแท็บใหม่)">${ICONS.doc} คู่มือ</a>
        ${bellHTML(st.notifs)}
        <span class="account-name"><span class="avatar-sm" aria-hidden="true">${esc((session.username || 'U').charAt(0).toUpperCase())}</span>${esc(session.username)}</span>
        <button type="button" class="btn btn-sm btn-ghost" data-signout title="ออกจากระบบ">${ICONS.logout} ออกจากระบบ</button>
      </div>
    </header>
    <main class="page">
      <section class="page-head" aria-labelledby="page-title">
        <div style="display:flex;flex-direction:column;gap:10px;flex:1 1 520px;min-width:0" data-enter>
          <h1 id="page-title">${esc(HEAD[V][0])}</h1>
          <p class="muted" style="font-size:16px">${esc(HEAD[V][1])}</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${V !== 'calendar' ? `<button type="button" class="btn btn-sm" data-compare-open>${ICONS.radar} เปรียบเทียบผู้สมัคร</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost icon-only" data-refresh title="รีเฟรช" aria-label="รีเฟรช">${ICONS.refresh}</button>
        </div>
      </section>

      <div class="view-switch" role="group" aria-label="มุมมอง">
        <button type="button" data-view="mine" aria-pressed="${V === 'mine'}"><span class="dot" style="background:#5B3DF5;width:12px;height:12px" aria-hidden="true"></span>Pool ของ ${esc(unit)} <span class="count">${m.length}</span></button>
        <button type="button" data-view="market" aria-pressed="${V === 'market'}"><span class="dot" style="background:#FF7A3D;width:12px;height:12px;border-radius:12px 12px 0 0" aria-hidden="true"></span>Candidate Pool <span class="count">${p.length}</span></button>
        <button type="button" data-view="calendar" aria-pressed="${V === 'calendar'}">${ICONS.calendar} ปฏิทิน <span class="count">${m.filter((c) => c.interviewStatus).length}</span></button>
      </div>

      ${st.error ? `<div class="error-box" role="alert">${esc(st.error)}</div>` : ''}
      ${st.loading ? '<div class="loading" style="min-height:200px"><div class="spinner" role="img" aria-label="กำลังโหลด"></div></div>'
        : V === 'calendar' ? calendarHTML(st.month, m)
        : V === 'mine' ? `
        <section class="kpis" aria-label="สรุปสถานะ">
          ${kpis.map((k) => `<div class="kpi" style="background:${k.bg};color:${k.fg}"><span class="kpi-label">${esc(k.label)}</span><span class="kpi-value" data-count data-value="${k.v}">${k.v}</span><span class="kpi-deco" aria-hidden="true" style="border-radius:${k.shape};background:${k.deco}"></span></div>`).join('')}
        </section>
        <div class="toolbar">
          <div class="chip-row" role="group" aria-label="กรองตามสถานะ">
            ${chips.map((f) => {
              const n = f === 'all' ? m.length : count((c) => c.decision === f);
              return `<button type="button" class="chip" data-filter="${esc(f)}" aria-pressed="${st.filter === f}">${f === 'all' ? 'ทั้งหมด' : esc(f)} · ${n}</button>`;
            }).join('')}
          </div>
          ${searchBox()}
        </div>
        ${bar}
        ${shownMine.length ? groupsHTML(shownMine, candidateCard, 'ผู้สมัครใน Pool')
          : emptyState(m.length ? 'ไม่มีผู้สมัครในมุมมองนี้' : 'ยังไม่มีผู้สมัครใน Pool ของคุณ', m.length ? 'ลองเปลี่ยนตัวกรองหรือคำค้นหา' : 'ไปที่แท็บ Candidate Pool เพื่อเลือกผู้สมัคร')}`
        : `
        <div class="info-box">${ICONS.info}<p>คุณเลือกผู้สมัครได้เฉพาะเข้า <strong>Pool ของ ${esc(unit)}</strong> หลังเลือกแล้วมีเวลาพิจารณา <strong>${CONFIG.holdHours} ชม.</strong> ถ้ายังไม่ตัดสินใจ ผู้สมัครจะกลับเข้า Candidate Pool อัตโนมัติ การย้ายไปแผนกอื่นทำได้โดย ${esc(HRS)}</p></div>
        <div class="toolbar"><span></span>${searchBox()}</div>
        ${bar}
        ${shownPool.length ? groupsHTML(shownPool, poolCard, 'Candidate Pool')
          : emptyState(p.length ? 'ไม่มีผู้สมัครตามตัวกรองนี้' : 'Candidate Pool ยังไม่มีผู้สมัครที่ว่างอยู่', p.length ? 'ลองเปลี่ยนตัวกรองหรือคำค้นหา' : `เมื่อ ${HRS} เพิ่มผู้สมัครใหม่ จะแสดงที่นี่`)}`}
    </main>`;

    if (st.animate && !st.loading) {
      anim.enter(root.querySelectorAll('[data-enter]'));
      anim.pop(root.querySelectorAll('.kpi'), { step: 60 });
      anim.countUp(root.querySelectorAll('[data-count]'));
      anim.enter(root.querySelectorAll('.card, .panel'), { step: 50, start: 120 });
      anim.grow(root.querySelectorAll('[data-grow]'), 40);
      anim.pop(root.querySelectorAll('.cal-event'), { step: 20, start: 200 });
      st.animate = false;
    }
  }

  async function run(action, okMsg, opts) {
    try { await action(); await reload(); if (okMsg) toast(okMsg, opts); }
    catch (e) { toast(errorMessage(e), { error: true }); await reload(); }
  }

  const requestForm = (c) => openInterviewForm(c, {
    onSubmit: async (data) => {
      await store.requestInterview(c.id, data);
      await reload();
      toast(`ส่งคำขอนัดสัมภาษณ์ ${c.id} ถึง ${HRS} แล้ว`);
    }
  });
  const detail = (c) => showInterviewDetail(c, {
    actions: [{ id: 'change', label: c.interviewStatus === 'confirmed' ? 'ขอเปลี่ยนนัด' : 'แก้ไขคำขอ' }],
    onAction: () => requestForm(c)
  });
  const visibleForCompare = () => [...mine(), ...pool()];

  root.onclick = async (e) => {
    const t = (sel) => e.target.closest(sel);
    let el;
    if (t('[data-guide]')) store.track('guide_open'); // the link still opens the guide
    if ((el = t('[data-signout]'))) return signOut();
    if ((el = t('[data-home]'))) { e.preventDefault(); return goHome('#/pjt'); }
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
    if ((el = t('[data-refresh]'))) { anim.press(el); return reload({ animate: true }); }
    // Salary axes appear only when at least one candidate's salary is shown to this unit.
    if ((el = t('[data-compare-open]'))) return openCompare(visibleForCompare(), [], { pos: st.f.pos });
    if ((el = t('[data-compare]'))) return openCompare(visibleForCompare(), [el.dataset.compare]);
    if ((el = t('[data-view]'))) { st.view = el.dataset.view; st.q = ''; st.animate = true; return render(); }
    if ((el = t('[data-filter]'))) { st.filter = el.dataset.filter; st.animate = true; return render(); }
    if ((el = t('[data-cal]'))) {
      const a = el.dataset.cal;
      st.month = a === 'today' ? monthStart() : shiftMonth(st.month, a === 'prev' ? -1 : 1);
      st.animate = true;
      return render();
    }
    if ((el = t('[data-event]')) || (el = t('[data-detail]'))) return detail(byId(el.dataset.event || el.dataset.detail));
    if ((el = t('[data-request]'))) return requestForm(byId(el.dataset.request));
    if ((el = t('[data-pick]'))) return pickCandidate(byId(el.dataset.pick));
    if ((el = t('[data-return]'))) return returnCandidate(byId(el.dataset.return));
    if ((el = t('[data-f-group]'))) { st.f.group = !st.f.group; st.animate = true; return render(); }
    if ((el = t('[data-f-clear]'))) {
      st.f = newFilterState(); st.q = ''; st.filter = 'all'; st.animate = true;
      render();
      toast('ล้างตัวกรองแล้ว');
      return;
    }
    // Anywhere else on a card (or its name) opens the profile.
    if ((el = t('[data-profile]')) || (!t('button, a, input, select, label, details') && (el = t('[data-card]')))) {
      return profile(byId(el.dataset.profile || el.dataset.card));
    }
  };

  const cardOf = (c) => root.querySelector(`[data-card="${CSS.escape(c.id)}"]`);
  const leaveThen = (c, go) => { const card = cardOf(c); return card ? anim.leave(card, go) : go(); };

  function pickCandidate(c) {
    return leaveThen(c, () => run(() => store.pick(c.id), `เลือก ${c.id} ${c.name} เข้า Pool ของ ${unit} แล้ว · มีเวลาพิจารณา ${CONFIG.holdHours} ชม.`, {
      action: 'เลิกทำ', onAction: () => run(() => store.returnToPool(c.id), `คืน ${c.id} กลับ Candidate Pool แล้ว`)
    }));
  }
  async function returnCandidate(c) {
    const ok = await confirmDialog({
      title: `ส่งคืน ${c.name} กลับ Candidate Pool?`,
      body: `ผู้สมัครจะออกจาก Pool ของคุณ และแผนกอื่นเลือกได้ นัดสัมภาษณ์ของคุณจะถูกล้าง${c.interviewStatus ? ` (${HRS} จะได้รับการแจ้งเตือน)` : ''}`,
      confirm: 'ส่งคืน Candidate Pool'
    });
    if (!ok) return;
    return leaveThen(c, () => run(() => store.returnToPool(c.id), `ส่ง ${c.id} ${c.name} กลับ Candidate Pool แล้ว`));
  }

  // Profile popup with the actions that fit where the candidate is.
  function profile(c) {
    if (!c) return;
    const compareAct = { id: 'compare', label: 'เทียบ', icon: ICONS.radar };
    const actions = c.location === POOL
      ? [compareAct, { id: 'pick', label: `เลือกเข้า Pool ของ ${unit}`, primary: true }]
      : [compareAct, { id: 'return', label: 'ส่งคืน Candidate Pool' },
        c.interviewStatus
          ? { id: 'detail', label: c.interviewStatus === 'confirmed' ? 'ดูนัด / ขอเปลี่ยนนัด' : 'แก้ไขคำขอนัด', primary: true }
          : { id: 'request', label: 'นัดสัมภาษณ์', primary: true }];
    openProfile(c, {
      actions,
      showSalary: showSalary(c),
      onAction: (id) => {
        if (id === 'compare') return openCompare(visibleForCompare(), [c.id]);
        if (id === 'pick') return pickCandidate(c);
        if (id === 'return') return returnCandidate(c);
        if (id === 'detail') return detail(c);
        if (id === 'request') return requestForm(c);
      }
    });
  }
  root.onchange = (e) => {
    if (updateFilter(st.f, e.target)) {
      const id = e.target.id;
      st.animate = true;
      render();
      const back = root.querySelector('#' + id);
      if (back) back.focus();
    }
  };
  // Keep countdowns ticking every second without re-rendering the page.
  // Each deadline triggers at most one reload, which lets the server release it.
  const reloadedFor = new Set();
  const ticker = setInterval(() => {
    let expired = false;
    root.querySelectorAll('[data-hold]').forEach((el) => {
      const h = holdLeft({ holdUntil: el.dataset.hold, decision: 'รอพิจารณา' });
      el.textContent = h.clock;
      el.setAttribute('aria-label', 'เหลือเวลาก่อนเด้งกลับ Candidate Pool ' + h.text);
      el.closest('[data-hold-box]').classList.toggle('urgent', h.urgent);
      if (h.ms <= 0 && !reloadedFor.has(el.dataset.hold)) { reloadedFor.add(el.dataset.hold); expired = true; }
    });
    if (expired) reload();
  }, 1000);
  root.oninput = (e) => {
    if (e.target.id === 'pjt-search') {
      st.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const s = root.querySelector('#pjt-search');
      s.focus(); s.setSelectionRange(pos, pos);
    }
  };
  window.onfocus = () => { if (!document.getElementById('modal-root').children.length) reload(); };
  const stopNotifs = watchNotifications(store, (list) => {
    const grew = list.some((n) => n.kind === 'hold_expired' && !n.readAt && !st.notifs.some((o) => o.id === n.id));
    st.notifs = list;
    if (grew && !st.loading) return reload();
    const bell = root.querySelector('[data-bell]');
    if (bell) bell.outerHTML = bellHTML(list);
  });
  onCleanup(() => { stopNotifs(); clearInterval(ticker); });

  render();
  reload({ animate: true });
}
