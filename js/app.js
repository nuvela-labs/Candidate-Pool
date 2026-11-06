// Hash router with role guards. #/login, #/pjt (แผนก), #/admin (HRS).
import { store } from './data/store.js';
import { loadAnime } from './anim.js';
import { errorMessage, esc, setOrg, initTips, initMenus } from './ui.js';
import { mountLogin } from './views/login.js';
import { mountPjt } from './views/pjt.js';
import { mountAdmin } from './views/admin.js';

const root = document.getElementById('app');
let cleanup = null;

const homeFor = (s) => (s.role === 'admin' ? '#/admin' : '#/pjt');

async function route() {
  document.getElementById('modal-root').innerHTML = '';
  // Each view installs its own delegated handlers and timers; clear the previous view's.
  if (cleanup) { cleanup(); cleanup = null; }
  root.onclick = root.onchange = root.oninput = root.onsubmit = window.onfocus = null;
  let session = null;
  try {
    session = await store.getSession();
  } catch (e) {
    root.innerHTML = `<div class="loading"><div class="error-box" style="max-width:520px">${esc(errorMessage(e))}</div></div>`;
    return;
  }
  const ctx = {
    store, session,
    go: (h) => { if (location.hash === h) route(); else location.hash = h; },
    signOut: async () => { await store.signOut(); ctx.go('#/login'); },
    onCleanup: (fn) => { cleanup = fn; }
  };
  let hash = location.hash || '#/login';
  // #/signin (the user guide's button) always shows the sign-in page, even with a session open;
  // signing in there replaces that session.
  if (hash === '#/signin') { window.scrollTo(0, 0); return mountLogin(root, ctx); }
  if (!session) hash = '#/login';
  else if (hash !== homeFor(session)) hash = homeFor(session);
  if (location.hash !== hash) { location.replace(hash); return; }
  window.scrollTo(0, 0);

  if (hash === '#/pjt') return mountPjt(root, ctx);
  if (hash === '#/admin') return mountAdmin(root, ctx);
  return mountLogin(root, ctx);
}

async function start() {
  root.innerHTML = '<div class="loading"><div class="spinner" role="img" aria-label="กำลังโหลด"></div></div>';
  // ฝ่าย/แผนก come from the database; config.js stays as the fallback.
  await Promise.all([loadAnime(), store.listOrg().then(setOrg).catch(() => {})]);
  window.addEventListener('hashchange', route);
  initTips();
  initMenus();
  route();
}
start();
