// Sign-in: choose ฝ่าย, then แผนก (or HRS), then type the password.
import { esc, ICONS, LOGO, HRS, DIVISIONS, errorMessage } from '../ui.js';
import * as anim from '../anim.js';

const HRS_ID = 'hrs';
const LAST_KEY = 'candidate-pool-last-login';

const TILES = `
  <div class="tile" style="background:#5B3DF5"><span style="width:58%;height:58%;border-radius:999px;background:#C8F169"></span></div>
  <div class="tile" style="background:#C8F169;align-items:flex-end"><span style="width:76%;height:38%;border-radius:999px 999px 0 0;background:#FF7A3D"></span></div>
  <div class="tile" style="background:#111"><span class="ring" style="width:52%;height:52%;border-radius:999px;border:10px solid #FFB3D1;border-right-color:transparent"></span></div>
  <div class="tile" style="background:#FF7A3D;align-items:flex-end;justify-content:flex-end"><span style="width:70%;height:70%;border-radius:100% 0 0 0;background:#FFB3D1"></span></div>
  <div class="tile" style="background:#fff;gap:8px"><span style="width:14px;height:14px;border-radius:999px;background:#111"></span><span style="width:14px;height:14px;border-radius:999px;background:#5B3DF5"></span><span style="width:14px;height:14px;border-radius:999px;background:#FF7A3D"></span></div>
  <div class="tile" style="background:#8EC5FF"><span style="width:64%;height:28%;border-radius:999px;background:#111"></span></div>
  <div class="tile" style="background:#FFD84D"><span style="width:56%;height:56%;border-radius:999px;background:#fff;display:flex;align-items:center;justify-content:center"><span style="width:40%;height:40%;border-radius:999px;background:#111"></span></span></div>
  <div class="tile" style="background:#FFB3D1;align-items:flex-start;justify-content:flex-start"><span style="width:70%;height:70%;border-radius:0 0 100% 0;background:#5B3DF5"></span></div>`;

// A ฝ่าย with no แผนก yet has no account to sign in with.
const loginDivisions = () => DIVISIONS.filter((d) => d.units.length);

function lastChoice() {
  const list = loginDivisions();
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    if (v && (v.division === HRS_ID || list.some((d) => d.id === v.division))) return v;
  } catch (e) { /* ignore */ }
  return list.length ? { division: list[0].id, unit: list[0].units[0] } : { division: HRS_ID, unit: null };
}

export function mountLogin(root, { store, go }) {
  const st = { ...lastChoice(), error: '', busy: false, first: true };

  const division = () => DIVISIONS.find((d) => d.id === st.division);
  const isHrs = () => st.division === HRS_ID;
  const accountLabel = () => (isHrs() ? HRS : `${division().name} · ${st.unit}`);

  function render() {
    const d = division();
    if (d && !d.units.includes(st.unit)) st.unit = d.units[0];
    root.innerHTML = `
    <div class="login">
      <header class="login-head">
        <div class="logo">${LOGO}<span>Candidate Pool</span></div>
        <p class="muted" style="font-size:15px">มีปัญหาในการเข้าสู่ระบบ? ติดต่อ ${esc(HRS)}</p>
      </header>
      <main class="login-main">
        <section class="hero" aria-labelledby="hero-title">
          <span class="eyebrow" data-enter><span class="dot" style="background:#5B3DF5;width:8px;height:8px"></span>ตลาดกลางผู้สมัคร สำหรับ Line Manager</span>
          <h1 id="hero-title" data-enter>คัดคนที่ใช่<br>ให้งานมีคุณภาพ</h1>
          <p class="hero-lead" data-enter>เลือกผู้สมัครจาก Candidate Pool ที่ ${esc(HRS)} คัดกรองแล้ว เข้า Pool ของแผนกคุณ เปรียบเทียบ ตัดสินใจ และนัดสัมภาษณ์ได้ในที่เดียว</p>
          <div class="shapes" aria-hidden="true">
            <div class="shape-grid">${TILES}</div>
            <div class="float-chip" data-float style="left:6%;top:-26px">
              <span class="avatar" style="width:40px;height:40px;font-size:16px;border-radius:999px;background:#5B3DF5;color:#fff">✓</span>
              <span style="display:flex;flex-direction:column"><strong>ผ่านการคัดกรองโดย ${esc(HRS)}</strong><span class="muted" style="font-size:13px">พร้อมให้แผนกเลือก</span></span>
            </div>
            <div class="float-chip dark" data-float style="right:4%;bottom:-22px"><span style="color:#C8F169;display:flex">${ICONS.calendar}</span><strong style="font-weight:600">นัดสัมภาษณ์ Online / Onsite</strong></div>
          </div>
        </section>

        <section class="login-card" aria-labelledby="login-title">
          <div style="display:flex;flex-direction:column;gap:6px">
            <h2 id="login-title" style="font-size:30px;font-weight:700">เข้าสู่ระบบ</h2>
            <p class="muted" style="font-size:15px">เลือกฝ่ายและแผนกของคุณ แล้วใส่รหัสผ่าน</p>
          </div>
          <form data-form style="display:flex;flex-direction:column;gap:16px" novalidate>
            <div class="field">
              <label for="sel-div">ฝ่าย</label>
              <select id="sel-div" class="input" data-division>
                ${loginDivisions().map((x) => `<option value="${esc(x.id)}" ${x.id === st.division ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
                <option value="${HRS_ID}" ${isHrs() ? 'selected' : ''}>${esc(HRS)}</option>
              </select>
            </div>
            <div data-swap>
            ${isHrs()
              ? `<div class="info-box" style="font-size:14px">${ICONS.shield}<span>สำหรับทีม ${esc(HRS)}: ส่งผู้สมัครเข้า Pool ของทุกแผนก ดึงกลับ ยืนยันนัดสัมภาษณ์ และจัดการบัญชีผู้ใช้</span></div>`
              : `<div class="field">
                  <label for="sel-unit">แผนก</label>
                  <select id="sel-unit" class="input" data-unit>
                    ${d.units.map((u) => `<option value="${esc(u)}" ${u === st.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}
                  </select>
                </div>`}
            </div>
            <input type="hidden" name="username" autocomplete="username" value="${esc(isHrs() ? HRS.toLowerCase() : st.unit.toLowerCase())}">
            <div class="field">
              <label for="login-pass">รหัสผ่านของ ${esc(accountLabel())}</label>
              <input id="login-pass" class="input" name="password" type="password" autocomplete="current-password" ${store.mode === 'demo' ? '' : 'required'}>
            </div>
            ${st.error ? `<div class="error-box" role="alert">${esc(st.error)}</div>` : ''}
            <button type="submit" class="btn btn-dark btn-block" style="min-height:56px;font-size:16px" ${st.busy ? 'disabled' : ''}>
              ${st.busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'} ${ICONS.arrow}
            </button>
          </form>
          ${store.mode === 'demo'
            ? '<p class="demo-banner"><strong>โหมดสาธิต:</strong> ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น และไม่ตรวจรหัสผ่าน ห้ามใช้กับข้อมูลผู้สมัครจริง</p>'
            : `<p class="muted" style="font-size:13px;line-height:1.6;text-align:center">${isHrs() ? `เฉพาะบัญชี ${esc(HRS)} เท่านั้น` : 'แต่ละแผนกเลือกผู้สมัครได้เฉพาะเข้า Pool ของแผนกตนเอง'}</p>`}
        </section>
      </main>
      <footer class="login-foot">
        <a class="btn btn-sm" href="guide.html" target="_blank" rel="noopener" title="เปิดคู่มือในแท็บใหม่">${ICONS.doc} คู่มือการใช้งาน</a>
      </footer>
    </div>`;

    if (st.first) {
      st.first = false;
      anim.enter(root.querySelectorAll('[data-enter]'), { step: 80 });
      anim.pop(root.querySelectorAll('.tile'), { step: 60, from: 'center', start: 200 });
      anim.enter(root.querySelector('.login-card'), { start: 200, y: 32 });
    }
    root.querySelectorAll('[data-float]').forEach((el, i) => anim.float(el, { delay: i * 900 }));
    anim.spin(root.querySelector('.ring'));
  }

  root.onchange = (e) => {
    if (e.target.matches('[data-division]')) {
      st.division = e.target.value; st.error = '';
      const d = division();
      if (d) st.unit = d.units[0];
      render();
      anim.switchIn(root.querySelector('[data-swap]'));
      root.querySelector('#sel-div').focus();
    } else if (e.target.matches('[data-unit]')) {
      st.unit = e.target.value; st.error = '';
      render();
      root.querySelector('#sel-unit').focus();
    }
  };

  root.onsubmit = async (e) => {
    e.preventDefault();
    const password = e.target.password.value;
    anim.press(e.target.querySelector('[type=submit]'));
    st.busy = true; st.error = ''; render();
    try {
      const role = isHrs() ? 'admin' : 'pjt';
      await store.signIn({ role, unit: st.unit, password });
      try { localStorage.setItem(LAST_KEY, JSON.stringify({ division: st.division, unit: st.unit })); } catch (ex) { /* ignore */ }
      go(role === 'admin' ? '#/admin' : '#/pjt');
    } catch (err) {
      st.busy = false; st.error = errorMessage(err); render();
      root.querySelector('#login-pass').focus();
    }
  };
  render();
}
