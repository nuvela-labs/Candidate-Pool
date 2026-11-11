import { CONFIG } from '../config.js';
import { demoStore } from './demo.js';
import { supabaseStore } from './supabase.js';

const base = CONFIG.mode === 'supabase' ? supabaseStore : demoStore;

// Usage log for HRS's "การใช้งาน" tab: each successful action below is recorded with the
// account that did it. Logging runs after the action and never blocks or breaks it.
const AFTER = {
  signIn: () => ({ action: 'login' }),
  pick: ([id]) => ({ action: 'pick', candidateId: id }),
  returnToPool: ([id]) => ({ action: 'return', candidateId: id }),
  setDecision: ([id, decision]) => ({ action: 'decision', candidateId: id, meta: { decision } }),
  requestInterview: ([id]) => ({ action: 'interview_request', candidateId: id }),
  setInterview: ([id]) => ({ action: 'interview_set', candidateId: id }),
  moveTo: ([id, to]) => ({ action: 'move', candidateId: id, meta: { to } }),
  saveCandidate: ([rec, isNew]) => ({ action: isNew ? 'candidate_add' : 'candidate_edit', candidateId: rec.id }),
  deleteCandidate: ([id]) => ({ action: 'candidate_delete', candidateId: id }),
  importCandidates: ([records]) => ({ action: 'excel_import', meta: { count: (records || []).length } })
};
const VISIT_KEY = 'candidate-pool-visit-logged';

function track(action, { candidateId = null, meta = {} } = {}) {
  try { Promise.resolve(base.logEvent({ action, candidateId, meta })).catch(() => {}); } catch (e) { /* never block */ }
}

export const store = { ...base, track };
for (const [name, describe] of Object.entries(AFTER)) {
  store[name] = async (...args) => {
    const result = await base[name](...args);
    const ev = describe(args, result);
    track(ev.action, ev);
    // A sign-in already counts as this tab's visit.
    if (name === 'signIn') { try { sessionStorage.setItem(VISIT_KEY, '1'); } catch (e) { /* ignore */ } }
    return result;
  };
}

// Accounts that stay signed in never pass through signIn, so the first page load of each
// browser tab with an open session is recorded as a "visit".
store.trackVisit = () => {
  try {
    if (sessionStorage.getItem(VISIT_KEY)) return;
    sessionStorage.setItem(VISIT_KEY, '1');
  } catch (e) { return; }
  track('visit');
};
const signOut = store.signOut;
store.signOut = async (...a) => {
  try { sessionStorage.removeItem(VISIT_KEY); } catch (e) { /* ignore */ }
  return signOut(...a);
};
