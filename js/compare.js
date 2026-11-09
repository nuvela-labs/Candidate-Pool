// Side-by-side candidate comparison on a radar (spider) chart, up to 4 at once.
import { esc, ICONS, HRS, pct, openModal, isNew, NEW_BADGE, DIMENSIONS, dimTip, dimInfo, candScore, scoreNote } from './ui.js';
import * as anim from './anim.js';
import { positionsOf } from './filters.js';

const MAX = 4;
const COLORS = [
  { stroke: '#5B3DF5', dash: '' },
  { stroke: '#E8590C', dash: '7 4' },
  { stroke: '#2F9E44', dash: '2 4' },
  { stroke: '#1C7ED6', dash: '10 4 2 4' }
];
// Axes are the seven dimensions HRS scores 1–5 (see DIMENSIONS in ui.js).
// score() returns 1–5, or null when HRS has not scored that dimension yet.
const dims = DIMENSIONS.map((d) => ({ ...d, score: (c) => (c.scores || {})[d.key] ?? null }));
const scoredCount = (c) => dims.filter((d) => d.score(c) != null).length;

function radarSVG(picked) {
  const size = 380, cx = size / 2, cy = size / 2 + 6, R = 128;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / dims.length;
  const pt = (i, v) => [cx + Math.cos(angle(i)) * R * (v / 5), cy + Math.sin(angle(i)) * R * (v / 5)];
  const ring = (v) => dims.map((_, i) => pt(i, v).join(',')).join(' ');
  const labels = dims.map((d, i) => {
    const [x, y] = pt(i, 6.1);
    const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" class="radar-label" ${dimTip(d)}>${esc(d.label)}</text>`;
  }).join('');
  const shapes = picked.map((c, n) => {
    const col = COLORS[n];
    const pts = dims.map((d, i) => pt(i, d.score(c) ?? 0));
    return `<g class="radar-shape" style="transform-origin:${cx}px ${cy}px">
      <polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${col.stroke}" fill-opacity="0.12" stroke="${col.stroke}" stroke-width="2.5" stroke-dasharray="${col.dash}" stroke-linejoin="round"/>
      ${pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#fff" stroke="${col.stroke}" stroke-width="2"/>`).join('')}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size + 12}" class="radar" role="img" aria-label="กราฟใยแมงมุมเปรียบเทียบ ${esc(picked.map((c) => c.name).join(', '))}">
    ${[1, 2, 3, 4, 5].map((v) => `<polygon points="${ring(v)}" fill="none" stroke="#E2E0D9" stroke-width="1"/>`).join('')}
    ${dims.map((_, i) => { const [x, y] = pt(i, 5); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E2E0D9"/>`; }).join('')}
    ${[1, 3, 5].map((v) => `<text x="${cx + 4}" y="${(cy - R * v / 5 + 12).toFixed(1)}" class="radar-tick">${v}</text>`).join('')}
    ${shapes}
    ${labels}
  </svg>`;
}

// all: candidates to choose from; preselected: ids to start with;
// pos: starting position filter (a preselected candidate's position wins).
export function openCompare(all, preselected = [], { pos = 'all' } = {}) {
  let picked = preselected.filter((id) => all.some((c) => c.id === id)).slice(0, MAX);
  let q = '';
  const posOf = (c) => c.position || '(ไม่ระบุตำแหน่ง)';
  const first = all.find((c) => c.id === picked[0]);
  let posFilter = first ? posOf(first) : pos;

  openModal(`
    <div class="modal-head">
      <div style="display:flex;flex-direction:column;gap:4px">
        <h2 id="modal-title">เปรียบเทียบผู้สมัคร</h2>
        <p class="muted" style="font-size:15px">เลือกได้สูงสุด ${MAX} คน · คะแนนแต่ละมิติเต็ม 5 จาก ${esc(HRS)}</p>
      </div>
      <button type="button" class="icon-btn" data-close aria-label="ปิด">${ICONS.close}</button>
    </div>
    <div class="compare">
      <div class="compare-pick">
        <div class="field">
          <label for="cmp-pos">ประเภทตำแหน่ง</label>
          <select id="cmp-pos" class="input" style="min-height:44px;font-size:15px">
            <option value="all">ทุกตำแหน่ง</option>
            ${positionsOf(all).map((p) => `<option value="${esc(p)}" ${p === posFilter ? 'selected' : ''}>${esc(p)} (${all.filter((c) => posOf(c) === p).length})</option>`).join('')}
          </select>
        </div>
        <label for="cmp-q" class="sr-only">ค้นหาผู้สมัคร</label>
        <input id="cmp-q" class="input" type="search" placeholder="ค้นหาชื่อ, ID หรือตำแหน่ง" style="min-height:44px;font-size:15px">
        <div class="compare-list" data-list></div>
      </div>
      <div class="compare-chart" data-chart aria-live="polite"></div>
    </div>`, (dlg) => {
    const listEl = dlg.querySelector('[data-list]');
    const chartEl = dlg.querySelector('[data-chart]');

    const drawList = () => {
      const s = q.trim().toLowerCase();
      // Picked candidates stay listed even when the position filter changes.
      const rows = all.filter((c) => picked.includes(c.id) ||
        ((posFilter === 'all' || posOf(c) === posFilter) && (!s || `${c.id} ${c.name} ${c.position}`.toLowerCase().includes(s))));
      listEl.innerHTML = rows.map((c) => {
        const n = picked.indexOf(c.id);
        const full = n < 0 && picked.length >= MAX;
        return `<div class="compare-item${n >= 0 ? ' on' : ''}">
          <input type="checkbox" data-pick="${esc(c.id)}" aria-labelledby="cmp-n-${esc(c.id)}" ${n >= 0 ? 'checked' : ''} ${full ? 'disabled' : ''}>
          <span class="swatch" aria-hidden="true" style="background:${n >= 0 ? COLORS[n].stroke : 'transparent'}"></span>
          <span style="flex:1;display:flex;flex-direction:column;min-width:0"><strong id="cmp-n-${esc(c.id)}">${esc(c.name)}</strong><span class="muted" style="font-size:13px">${esc(c.id)} · ${esc(c.position || '')} · ${pct(candScore(c))}${scoredCount(c) ? '' : ' · ยังไม่มีคะแนน'}</span></span>
          ${isNew(c) ? NEW_BADGE : ''}
        </div>`;
      }).join('') || '<p class="muted" style="padding:12px">ไม่พบผู้สมัคร</p>';
    };

    const drawChart = () => {
      const sel = picked.map((id) => all.find((c) => c.id === id));
      if (!sel.length) {
        chartEl.innerHTML = `<div class="empty" style="background:var(--soft)">${ICONS.radar}<p style="font-weight:600">เลือกผู้สมัครจากรายการด้านซ้าย</p><p class="muted" style="font-size:14px">อย่างน้อย 2 คนเพื่อเปรียบเทียบ</p></div>`;
        return;
      }
      chartEl.innerHTML = `
        ${radarSVG(sel)}
        <ul class="compare-legend">${sel.map((c, n) => `<li><svg width="28" height="10" aria-hidden="true"><line x1="0" y1="5" x2="28" y2="5" stroke="${COLORS[n].stroke}" stroke-width="3" stroke-dasharray="${COLORS[n].dash}"/></svg>${esc(c.name)}</li>`).join('')}</ul>
        <div style="overflow-x:auto">
          <table class="compare-table">
            <thead><tr><th scope="col">มิติ</th>${sel.map((c, n) => `<th scope="col" style="color:${COLORS[n].stroke}">${esc(c.name.split(' ')[0])}</th>`).join('')}</tr></thead>
            <tbody>${dims.map((d) => {
              const scores = sel.map((c) => d.score(c));
              const best = Math.max(...scores.filter((v) => v != null));
              return `<tr><th scope="row">${esc(d.label)} ${dimInfo(d)}${d.full !== d.label ? `<span class="muted" style="display:block;font-size:12px;font-weight:500">${esc(d.full)}</span>` : ''}</th>${sel.map((c, n) => {
                const v = scores[n];
                return `<td${v != null && v === best && sel.length > 1 ? ' class="best"' : ''}><strong>${v == null ? '—' : v}</strong></td>`;
              }).join('')}</tr>`;
            }).join('')}
            <tr><th scope="row">คะแนนเฉลี่ย</th>${sel.map((c) => {
              const vals = dims.map((d) => d.score(c)).filter((v) => v != null);
              return `<td><strong>${vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'}</strong></td>`;
            }).join('')}</tr>
            <tr><th scope="row">Candidate Score</th>${sel.map((c) => `<td><strong>${pct(candScore(c))}</strong></td>`).join('')}</tr></tbody>
          </table>
        </div>
        ${sel.some((c) => scoredCount(c) < dims.length) ? `<p class="muted" style="font-size:13px">— คือมิติที่ ${esc(HRS)} ยังไม่ให้คะแนน (แสดงที่จุดกึ่งกลางกราฟ)</p>` : ''}
        ${scoreNote()}
        <p class="muted" style="font-size:12px">ตัวเลขสีเขียวคือคะแนนสูงสุดของมิตินั้น คะแนนเป็นตัวช่วยประกอบการตัดสินใจ ไม่ใช่ผลการประเมินสุดท้าย</p>`;
      anim.radar(chartEl.querySelectorAll('.radar-shape'));
    };

    dlg.querySelector('#cmp-q').addEventListener('input', (e) => { q = e.target.value; drawList(); });
    dlg.querySelector('#cmp-pos').addEventListener('change', (e) => { posFilter = e.target.value; drawList(); });
    listEl.addEventListener('change', (e) => {
      const id = e.target.dataset.pick;
      if (!id) return;
      picked = e.target.checked ? [...picked, id].slice(0, MAX) : picked.filter((x) => x !== id);
      drawList(); drawChart();
    });
    drawList(); drawChart();
  }, { wide: true });
}
