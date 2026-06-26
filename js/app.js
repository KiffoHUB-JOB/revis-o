import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyBCs5ejfGOx394Pl4-T-DZfLD6pQd3Iii4",
  authDomain: "revisao-espacada-77fa7.firebaseapp.com",
  projectId: "revisao-espacada-77fa7",
  storageBucket: "revisao-espacada-77fa7.firebasestorage.app",
  messagingSenderId: "89128217118",
  appId: "1:89128217118:web:67085481d0be2b6ab2dc0f"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Firestore com cache offline persistente (IndexedDB) — funciona sem internet
// e sincroniza entre abas. Fallback p/ memória caso o IndexedDB não esteja disponível.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn('Cache offline indisponível, usando Firestore padrão:', e);
  db = initializeFirestore(app, {});
}


const STAGES = [
  { days: 1,   label: 'Novo' },
  { days: 7,   label: 'Aprendendo' },
  { days: 14,  label: 'Consolidando' },
  { days: 30,  label: 'Reforçando' },
  { days: 60,  label: 'Avançado' },
  { days: 120, label: 'Dominando' }
];
// Paleta por categoria de conquista
const ACH_CATS = {
  materias: { c1:'#6FE3C0', c2:'#2FB389', glow:'rgba(63,201,160,.42)', glowStrong:'rgba(63,201,160,.7)',  tint:'rgba(63,201,160,.13)' },
  streak:   { c1:'#FFC062', c2:'#FF6F5B', glow:'rgba(255,130,80,.46)', glowStrong:'rgba(255,130,80,.75)', tint:'rgba(255,130,80,.13)' },
  reviews:  { c1:'#9B7BFF', c2:'#7C5CFC', glow:'rgba(124,92,252,.42)', glowStrong:'rgba(124,92,252,.72)', tint:'rgba(124,92,252,.13)' },
  dominio:  { c1:'#F6D26B', c2:'#D99A1C', glow:'rgba(224,168,30,.46)', glowStrong:'rgba(224,168,30,.78)', tint:'rgba(224,168,30,.14)' }
};
// Conquistas desbloqueáveis (value+target alimentam a barra de progresso; persistem uma vez obtidas)
const ACHIEVEMENTS = [
  { id:'primeira-materia', cat:'materias', tier:1, tierMax:2, icon:'ti-seeding', title:'Primeiros passos', desc:'Adicione sua 1ª matéria', target:1,   value:s=>s.materiasCount },
  { id:'colecionador',     cat:'materias', tier:2, tierMax:2, icon:'ti-books',   title:'Colecionador',     desc:'Tenha 10 matérias',      target:10,  value:s=>s.materiasCount },
  { id:'streak-3',  cat:'streak', tier:1, tierMax:3, icon:'ti-flame',  title:'Esquentando', desc:'3 dias de sequência',  target:3,  unit:'dias', value:s=>s.streak },
  { id:'streak-7',  cat:'streak', tier:2, tierMax:3, icon:'ti-flame',  title:'Em chamas',   desc:'7 dias de sequência',  target:7,  unit:'dias', value:s=>s.streak },
  { id:'streak-30', cat:'streak', tier:3, tierMax:3, icon:'ti-flame',  title:'Imparável',   desc:'30 dias de sequência', target:30, unit:'dias', value:s=>s.streak },
  { id:'reviews-10',  cat:'reviews', tier:1, tierMax:3, icon:'ti-checks', title:'Aquecendo',   desc:'10 revisões feitas',  target:10,  value:s=>s.totalReviews },
  { id:'reviews-100', cat:'reviews', tier:2, tierMax:3, icon:'ti-medal',  title:'Centenário',  desc:'100 revisões feitas', target:100, value:s=>s.totalReviews },
  { id:'reviews-500', cat:'reviews', tier:3, tierMax:3, icon:'ti-trophy', title:'Maratonista', desc:'500 revisões feitas', target:500, value:s=>s.totalReviews },
  { id:'dominou-1', cat:'dominio', tier:1, tierMax:2, icon:'ti-crown', title:'Mestre',  desc:'Domine uma matéria', target:1, value:s=>s.dominadas },
  { id:'dominou-5', cat:'dominio', tier:2, tierMax:2, icon:'ti-crown', title:'Erudito', desc:'Domine 5 matérias',  target:5, value:s=>s.dominadas }
];
const HISTORY_RETENTION_DAYS = 365; // mantém só 1 ano de histórico agregado
const REVIEW_LOG_LIMIT = 1000;       // mantém as últimas 1000 revisões com timestamp
const TAB_STORAGE_KEY = 'revisao-tab';
const VALID_TABS = ['hoje', 'materias', 'stats'];
let mode = 'nova';
let chartInstance = null;
let activeTab = 'hoje';
let currentUser = null;
let saveTimeout = null;
let dataLoaded = false;
let saveInProgress = false;
let pendingSave = false;
let currentSavePromise = Promise.resolve();
let filterText = '';
let sortBy = 'next';
const pendingActions = new Set(); // ids com ação em andamento (previne duplo clique)


const EMPTY_DATA = () => ({ materias: [], reviewed_today: [], last_day: '', streak: 0, last_streak_day: '', history: {}, review_log: [], achievements: [] });
let data = EMPTY_DATA();


function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function addDays(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function isDateString(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + 'T12:00:00').getTime()); }
function fmtDate(s) { if (!isDateString(s)) return '—'; const [, m, d] = s.split('-'); return `${d}/${m}`; }
function daysBetween(a, b) {
  if (!isDateString(a) || !isDateString(b)) return 0;
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((db - da) / 86400000);
}
function relativeDate(dateStr) {
  if (!isDateString(dateStr)) return { text: '—', cls: '' };
  const diff = daysBetween(today(), dateStr);
  if (diff < 0) {
    const n = Math.abs(diff);
    return { text: `atrasada ${n} dia${n !== 1 ? 's' : ''}`, cls: 'urgent' };
  }
  if (diff === 0) return { text: 'hoje', cls: 'urgent' };
  if (diff === 1) return { text: 'amanhã', cls: 'soon' };
  if (diff <= 3) return { text: `em ${diff} dias`, cls: 'soon' };
  if (diff <= 14) return { text: `em ${diff} dias`, cls: '' };
  return { text: fmtDate(dateStr), cls: '' };
}
function clampInteger(value, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : min; }
function safeText(value, maxLength) { return typeof value === 'string' ? value.slice(0, maxLength) : ''; }
function normalizeName(value) {
  return safeText(value, 80)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
function createMateriaId() {
  return globalThis.crypto?.randomUUID?.() || `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function normalizeId(value) {
  const id = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : '';
}
function pruneHistory(history) {
  const cutoff = addDays(today(), -HISTORY_RETENTION_DAYS);
  const pruned = {};
  for (const [date, count] of Object.entries(history)) {
    if (date >= cutoff) pruned[date] = count;
  }
  return pruned;
}
function pruneReviewLog(log) {
  if (!Array.isArray(log)) return [];
  // mantém só as últimas REVIEW_LOG_LIMIT entradas, ordenadas por timestamp asc
  const sorted = [...log].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return sorted.slice(-REVIEW_LOG_LIMIT);
}
function generateUniqueId(usedIds) {
  for (let tries = 0; tries < 10; tries++) {
    const id = createMateriaId();
    if (!usedIds.has(id)) return id;
  }
  // fallback ultra improvável
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}-${usedIds.size}`;
}
function normalizeData(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const usedIds = new Set();
  const materias = [];
  const rawMaterias = Array.isArray(source.materias) ? source.materias : [];


  for (const item of rawMaterias.slice(0, 1000)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const name = safeText(item.name, 80).trim().replace(/\s+/g, ' ');
    if (!name) continue;
    let id = normalizeId(item.id);
    if (!id || usedIds.has(id)) id = generateUniqueId(usedIds);
    usedIds.add(id);
    materias.push({
      id,
      name,
      note: safeText(item.note, 4000),
      stage: clampInteger(item.stage, 0, STAGES.length - 1),
      next_review: isDateString(item.next_review) ? item.next_review : today(),
      created: isDateString(item.created) ? item.created : today(),
      last_reviewed: isDateString(item.last_reviewed) ? item.last_reviewed : null
    });
  }


  const reviewed_today = [...new Set(
    (Array.isArray(source.reviewed_today) ? source.reviewed_today : [])
      .map(normalizeId)
      .filter(id => id && usedIds.has(id))
  )];
  let history = {};
  if (source.history && typeof source.history === 'object' && !Array.isArray(source.history)) {
    for (const [date, count] of Object.entries(source.history)) {
      if (isDateString(date)) history[date] = clampInteger(count, 0, 100000);
    }
  }
  history = pruneHistory(history);


  // normaliza review_log
  const rawLog = Array.isArray(source.review_log) ? source.review_log : [];
  const review_log = pruneReviewLog(rawLog.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const id = normalizeId(entry.id);
    const ts = Number(entry.ts);
    const action = entry.action === 'forgot' ? 'forgot' : 'done';
    if (!id || !Number.isFinite(ts)) return [];
    return [{ id, ts: Math.floor(ts), action }];
  }));


  // normaliza achievements (mantém só ids conhecidos)
  const validAchIds = new Set(ACHIEVEMENTS.map(a => a.id));
  const achievements = Array.isArray(source.achievements)
    ? [...new Set(source.achievements.filter(id => validAchIds.has(id)))]
    : [];


  return {
    materias,
    reviewed_today,
    last_day: isDateString(source.last_day) ? source.last_day : '',
    streak: clampInteger(source.streak, 0, 100000),
    last_streak_day: isDateString(source.last_streak_day) ? source.last_streak_day : '',
    history,
    review_log,
    achievements
  };
}
function dataSnapshot() { return JSON.parse(JSON.stringify(data)); }
function setSavingIndicator(message, isError = false) {
  const indicator = document.getElementById('saving-indicator');
  indicator.classList.toggle('error', isError);
  indicator.classList.add('show');
  indicator.textContent = message;
}
function hideSavingIndicator() {
  const indicator = document.getElementById('saving-indicator');
  indicator.classList.remove('show', 'error');
  indicator.innerHTML = '<i class="ti ti-cloud" aria-hidden="true"></i> Salvando...';
}


// ---- TOAST ----
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const iconMap = { success: 'ti-check', error: 'ti-alert-circle', info: 'ti-info-circle' };
  toast.innerHTML = `<i class="ti ${iconMap[type] || iconMap.info}" aria-hidden="true"></i><span></span>`;
  toast.querySelector('span').textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}


// ---- MODAL DE CONFIRMAÇÃO ----
function showConfirm(title, message, { okText = 'Confirmar', cancelText = 'Cancelar', danger = true } = {}) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    okBtn.classList.toggle('btn-danger', danger);
    okBtn.classList.toggle('btn-primary', !danger);
    modal.classList.add('show');


    const cleanup = result => {
      modal.classList.remove('show');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = e => { if (e.target === modal) cleanup(false); };
    const onKey = e => { if (e.key === 'Escape') cleanup(false); };


    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    okBtn.focus();
  });
}


// ---- FIREBASE AUTH ----
window.loginGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) { showToast('Erro ao entrar: ' + e.message, 'error', 4000); }
};


window.logout = async () => {
  try {
    await flushSave();
    await signOut(auth);
  } catch (e) {
    console.error('Erro ao sair:', e);
    showToast('Não foi possível encerrar a sessão. Tente novamente.', 'error', 4000);
  }
};


onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    dataLoaded = false;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('loading-screen').style.display = 'flex';
    document.getElementById('user-bar').style.display = 'none';


    await loadFromFirestore();


    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    document.getElementById('user-bar').style.display = 'flex';
    document.getElementById('user-name').textContent = user.displayName || user.email;


    checkDayReset();
    checkAchievements({ celebrate: false }); // backfill silencioso de quem já cumpria os requisitos
    window.showTab(readInitialTab());
  } else {
    currentUser = null;
    dataLoaded = false;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('user-bar').style.display = 'none';
  }
});


// ---- FIRESTORE ----
async function loadFromFirestore() {
  try {
    const ref = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(ref);
    data = snap.exists() ? normalizeData(snap.data()) : EMPTY_DATA();
  } catch (e) {
    console.error('Erro ao carregar:', e);
    data = EMPTY_DATA();
    showToast('Não foi possível carregar seus dados. Verifique sua conexão.', 'error', 5000);
  } finally {
    dataLoaded = true;
  }
}


function saveToFirestore() {
  if (saveInProgress) return currentSavePromise;
  if (!pendingSave || !currentUser || !dataLoaded) return Promise.resolve();


  const uid = currentUser.uid;
  saveInProgress = true;
  setSavingIndicator('Salvando...');


  currentSavePromise = (async () => {
    let failed = false;
    try {
      while (pendingSave && currentUser?.uid === uid) {
        pendingSave = false;
        await setDoc(doc(db, 'users', uid), dataSnapshot());
      }
    } catch (e) {
      failed = true;
      console.error('Erro ao salvar:', e);
      setSavingIndicator('Erro ao salvar', true);
      window.setTimeout(hideSavingIndicator, 3500);
    } finally {
      saveInProgress = false;
      if (!failed && !pendingSave) hideSavingIndicator();
      // se sobrou pendingSave (ex: chegou mudança durante o save), dispara de novo
      if (pendingSave && currentUser?.uid === uid) void saveToFirestore();
    }
  })();


  return currentSavePromise;
}
function scheduleSave({ immediate = false } = {}) {
  if (!dataLoaded || !currentUser) return;
  pendingSave = true;
  clearTimeout(saveTimeout);
  if (immediate) {
    saveTimeout = null;
    void saveToFirestore();
  } else {
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      void saveToFirestore();
    }, 800);
  }
}


async function flushSave() {
  clearTimeout(saveTimeout);
  saveTimeout = null;
  if (!dataLoaded || !currentUser) return;
  pendingSave = true;
  await saveToFirestore();
}
function checkDayReset() {
  if (data.last_day !== today()) {
    data.reviewed_today = [];
    data.last_day = today();
    reconcileStreak();
    // limpa histórico antigo no virar do dia
    data.history = pruneHistory(data.history);
    scheduleSave();
  }
}


// Fonte de verdade do streak: ele só continua "vivo" se a última revisão
// foi hoje ou ontem. Caso contrário foi quebrado e zera. Retorna true se mudou.
function reconcileStreak() {
  const t = today();
  const yesterday = addDays(t, -1);
  if (data.streak > 0 && data.last_streak_day && data.last_streak_day !== t && data.last_streak_day !== yesterday) {
    data.streak = 0;
    return true;
  }
  return false;
}


// ---- LÓGICA DO APP ----
window.setMode = m => {
  mode = m;
  document.getElementById('btn-nova').classList.toggle('active', m === 'nova');
  document.getElementById('btn-rev').classList.toggle('active', m === 'revisando');
  document.getElementById('mode-hint').textContent = m === 'nova'
    ? 'Estudei hoje pela primeira vez — próxima revisão amanhã.'
    : 'Estou revisando hoje — aparece na lista para marcar como feita.';
};


function showInputError(message) {
  const errEl = document.getElementById('input-error');
  document.getElementById('input-error-text').textContent = message;
  errEl.classList.add('show');
}
function hideInputError() {
  document.getElementById('input-error').classList.remove('show');
}


window.addMateria = () => {
  const nameRaw = document.getElementById('input-name').value.trim().replace(/\s+/g, ' ');
  const note = document.getElementById('input-note').value.trim().slice(0, 4000);


  if (!nameRaw) {
    showInputError('Digite um nome para a matéria.');
    document.getElementById('input-name').focus();
    return;
  }


  if (data.materias.some(m => normalizeName(m.name) === normalizeName(nameRaw))) {
    showInputError('Já existe uma matéria com esse nome.');
    return;
  }


  hideInputError();
  data.materias.push({
    id: generateUniqueId(new Set(data.materias.map(m => m.id))),
    name: nameRaw.slice(0, 80),
    note,
    stage: 0,
    next_review: mode === 'nova' ? addDays(today(), STAGES[0].days) : today(),
    created: today(),
    last_reviewed: mode === 'nova' ? today() : null
  });
  scheduleSave();
  document.getElementById('input-name').value = '';
  document.getElementById('input-note').value = '';
  showToast(`"${nameRaw}" adicionada`, 'success', 2000);
  renderActive();
};


document.getElementById('input-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    window.addMateria();
  }
});
document.getElementById('input-name').addEventListener('input', hideInputError);


document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  // bloqueia visualmente clique duplo enquanto a ação roda
  if (action === 'done' || action === 'forgot' || action === 'snooze') button.disabled = true;
  if (action === 'done') window.markDone(id);
  if (action === 'forgot') window.markForgot(id);
  if (action === 'snooze') window.snooze(id);
  if (action === 'delete') window.deleteMateria(id);
  if (action === 'edit-name') window.editName(id);
});
document.addEventListener('input', event => {
  const target = event.target;
  if (target.matches('textarea[data-action="save-note"]')) window.saveNote(target.dataset.id, target.value);
});


function registerReview(id, action) {
  if (data.reviewed_today.includes(id)) return false;
  data.reviewed_today.push(id);
  const date = today();
  data.history[date] = (data.history[date] || 0) + 1;
  // adiciona entrada com timestamp ao log (circular)
  data.review_log.push({ id, ts: Date.now(), action });
  if (data.review_log.length > REVIEW_LOG_LIMIT) {
    data.review_log = data.review_log.slice(-REVIEW_LOG_LIMIT);
  }
  updateStreak();
  return true;
}


window.markDone = id => {
  id = String(id);
  if (pendingActions.has(id)) return;
  const m = data.materias.find(x => x.id === id);
  if (!m || data.reviewed_today.includes(id)) return;
  pendingActions.add(id);
  m.stage = Math.min(m.stage + 1, STAGES.length - 1);
  m.last_reviewed = today();
  m.next_review = addDays(today(), STAGES[m.stage].days);
  registerReview(id, 'done');
  checkAchievements({ celebrate: true });
  scheduleSave();
  renderActive();
  pendingActions.delete(id);
};


window.markForgot = id => {
  id = String(id);
  if (pendingActions.has(id)) return;
  const m = data.materias.find(x => x.id === id);
  if (!m || data.reviewed_today.includes(id)) return;
  pendingActions.add(id);
  m.stage = Math.max(m.stage - 1, 0);
  m.last_reviewed = today();
  m.next_review = addDays(today(), 1);
  registerReview(id, 'forgot');
  checkAchievements({ celebrate: true });
  scheduleSave();
  renderActive();
  pendingActions.delete(id);
};


// Adiar: empurra a próxima revisão para amanhã sem contar como revisão
// (não mexe na etapa, no streak nem no histórico).
window.snooze = id => {
  id = String(id);
  if (pendingActions.has(id)) return;
  const m = data.materias.find(x => x.id === id);
  if (!m || data.reviewed_today.includes(id)) return;
  pendingActions.add(id);
  m.next_review = addDays(today(), 1);
  scheduleSave();
  showToast(`"${m.name}" adiada para amanhã`, 'info', 2000);
  renderActive();
  pendingActions.delete(id);
};


function updateStreak() {
  const t = today();
  if (data.last_streak_day === t) return;
  const yesterday = addDays(t, -1);
  // se a última revisão foi ontem, continua a sequência; senão, recomeça do 1
  if (data.last_streak_day === yesterday) {
    data.streak += 1;
  } else {
    data.streak = 1;
  }
  data.last_streak_day = t;
}


// ---- CONQUISTAS ----
function computeStats() {
  return {
    materiasCount: data.materias.length,
    totalReviews: Object.values(data.history).reduce((a, b) => a + (b || 0), 0),
    streak: data.streak || 0,
    dominadas: data.materias.filter(m => m.stage >= STAGES.length - 1).length
  };
}


// Avalia as conquistas; desbloqueia novas e (opcionalmente) celebra com o modal.
function checkAchievements({ celebrate = false } = {}) {
  const stats = computeStats();
  const unlocked = new Set(data.achievements);
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && a.value(stats) >= a.target) {
      unlocked.add(a.id);
      newly.push(a);
    }
  }
  if (newly.length) {
    // mantém na ordem canônica de ACHIEVEMENTS
    data.achievements = ACHIEVEMENTS.filter(a => unlocked.has(a.id)).map(a => a.id);
    scheduleSave();
    if (celebrate) {
      newly.forEach(a => enqueueAchievement(a)); // modal animado em vez do toast
    }
    if (activeTab === 'stats') renderAchievements();
  }
  return newly;
}


window.deleteMateria = async id => {
  id = String(id);
  const m = data.materias.find(x => x.id === id);
  if (!m) return;
  const ok = await showConfirm(
    'Remover matéria',
    `Remover "${m.name}"? Essa ação não pode ser desfeita.`,
    { okText: 'Remover', danger: true }
  );
  if (!ok) return;
  data.materias = data.materias.filter(x => x.id !== id);
  data.reviewed_today = data.reviewed_today.filter(x => x !== id);
  scheduleSave();
  showToast(`"${m.name}" removida`, 'info', 2000);
  renderActive();
};


window.saveNote = (id, value) => {
  const m = data.materias.find(x => x.id === String(id));
  if (!m) return;
  const note = safeText(value, 4000);
  if (m.note === note) return;
  m.note = note;
  scheduleSave();
};


// Edição inline do nome: troca o título por um input; salva no Enter/blur, cancela no Esc.
window.editName = id => {
  id = String(id);
  const m = data.materias.find(x => x.id === id);
  if (!m) return;
  const nameEl = document.getElementById('name-' + id);
  if (!nameEl || nameEl.tagName === 'INPUT') return;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 80;
  input.value = m.name;
  input.className = 'name-edit-input';
  input.id = 'name-' + id;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let settled = false;
  const commit = save => {
    if (settled) return;
    settled = true;
    if (save) {
      const newName = input.value.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (newName && newName !== m.name) {
        const dup = data.materias.some(x => x.id !== id && normalizeName(x.name) === normalizeName(newName));
        if (dup) {
          showToast('Já existe uma matéria com esse nome.', 'error', 2500);
        } else {
          m.name = newName;
          scheduleSave();
          showToast('Nome atualizado', 'success', 1500);
        }
      }
    }
    renderMaterias();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  });
  input.addEventListener('blur', () => commit(true));
};


window.exportar = () => {
  const blob = new Blob([JSON.stringify(dataSnapshot(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'revisao_espacada.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('Backup exportado', 'success', 2000);
};


window.importar = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('O arquivo é muito grande. Limite de 2 MB.', 'error', 4000);
    return;
  }


  // confirmação antes de sobrescrever
  const hasData = data.materias.length > 0;
  if (hasData) {
    const ok = await showConfirm(
      'Importar dados',
      `Isso vai substituir suas ${data.materias.length} matéria(s) atuais pelo conteúdo do arquivo. Considera exportar um backup antes. Continuar?`,
      { okText: 'Importar', danger: true }
    );
    if (!ok) return;
  }


  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!imported || !Array.isArray(imported.materias)) throw new Error('Arquivo inválido');
      data = normalizeData(imported);
      scheduleSave({ immediate: true });
      renderActive();
      showToast(`${data.materias.length} matéria(s) importadas`, 'success', 2500);
    } catch (error) {
      console.error('Erro ao importar:', error);
      showToast('Arquivo inválido ou corrompido.', 'error', 4000);
    }
  };
  reader.onerror = () => showToast('Não foi possível ler o arquivo.', 'error', 4000);
  reader.readAsText(file);
};


function stageLabel(s) {
  return STAGES[clampInteger(s, 0, STAGES.length - 1)].label;
}


function renderStreak() {
  if (reconcileStreak()) scheduleSave();
  const s = data.streak || 0;
  const hasToday = data.reviewed_today.length > 0;
  document.getElementById('streak-banner').innerHTML =
    `<div style="width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-flame" style="font-size:30px;color:#FFD166" aria-hidden="true"></i></div>
     <div><div><span class="streak-num">${s}</span> <span style="font-weight:600">dia${s !== 1 ? 's' : ''} de sequência</span></div>
     <div style="font-size:13px;color:#EBE4FF;margin-top:2px">${hasToday ? 'Você já estudou hoje — que orgulho! 💜' : 'Que tal revisar algo agora? Vai por mim 🌟'}</div></div>`;
}


function renderDue() {
  const t = today();
  const due = data.materias.filter(m => m.next_review <= t && !data.reviewed_today.includes(m.id));
  const done = data.materias.filter(m => data.reviewed_today.includes(m.id));
  const ok = data.materias.filter(m => m.next_review > t && !data.reviewed_today.includes(m.id));
  // ordena due: mais atrasadas primeiro
  due.sort((a, b) => a.next_review.localeCompare(b.next_review));
  document.getElementById('s-due').textContent = due.length;
  document.getElementById('s-done').textContent = done.length;
  document.getElementById('s-ok').textContent = ok.length;
  document.getElementById('s-total').textContent = data.materias.length;


  document.getElementById('due-list').innerHTML = due.length === 0
    ? '<div class="empty">Nenhuma matéria para revisar hoje 🎉</div>'
    : due.map(m => {
        const id = escapeHTML(m.id);
        const name = escapeHTML(m.name);
        const note = escapeHTML(m.note);
        const overdueDays = daysBetween(m.next_review, t);
        const tag = overdueDays > 0
          ? `<span class="tag tag-overdue">atrasada ${overdueDays} dia${overdueDays !== 1 ? 's' : ''}</span>`
          : `<span class="tag tag-due">revisar hoje</span>`;
        return `
          <div class="row">
            <div class="row-left">
              <div>
                <div class="row-name">${name}</div>
                <div class="row-meta">${stageLabel(m.stage)} · ${tag}</div>
                ${m.note ? `<div class="mat-note">${note}</div>` : ''}
              </div>
            </div>
            <div class="row-actions">
              <button class="snooze-btn" data-action="snooze" data-id="${id}" title="Adiar para amanhã" aria-label="Adiar ${name} para amanhã"><i class="ti ti-calendar-plus" aria-hidden="true"></i></button>
              <button class="forget-btn" data-action="forgot" data-id="${id}" title="Não lembrei" aria-label="Não lembrei de ${name}"><i class="ti ti-x" aria-hidden="true"></i></button>
              <button class="check-btn" data-action="done" data-id="${id}" title="Lembrei" aria-label="Lembrei de ${name}"><i class="ti ti-check" aria-hidden="true"></i></button>
            </div>
          </div>`;
      }).join('');


  // ordena "em dia" por próxima revisão (mais próximas primeiro)
  ok.sort((a, b) => a.next_review.localeCompare(b.next_review));
  const okAll = [...done, ...ok];
  document.getElementById('ok-list').innerHTML = okAll.length === 0
    ? '<div class="empty">Adicione matérias na aba "Matérias"</div>'
    : okAll.map(m => {
        const isDone = data.reviewed_today.includes(m.id);
        const id = escapeHTML(m.id);
        const name = escapeHTML(m.name);
        const rel = relativeDate(m.next_review);
        return `
          <div class="row">
            <div class="row-left">
              <button class="check-btn ${isDone ? 'done' : ''}" ${isDone ? 'disabled' : `data-action="done" data-id="${id}"`} aria-label="${name}">
                <i class="ti ti-check" aria-hidden="true"></i>
              </button>
              <div>
                <div class="row-name">${name}</div>
                <div class="row-meta">${stageLabel(m.stage)} · <span class="relative-date ${rel.cls}">${rel.text}</span></div>
              </div>
            </div>
            ${isDone ? '<span class="tag tag-ok">revisada</span>' : ''}
          </div>`;
      }).join('');
}


function renderMaterias() {
  const prog = STAGES.length - 1;
  const search = normalizeName(filterText);
  let list = data.materias;


  if (search) {
    list = list.filter(m => normalizeName(m.name).includes(search) || normalizeName(m.note).includes(search));
  }


  list = [...list].sort((a, b) => {
    switch (sortBy) {
      case 'name': return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      case 'stage': return b.stage - a.stage || a.name.localeCompare(b.name);
      case 'created': return (b.created || '').localeCompare(a.created || '');
      case 'next':
      default: return (a.next_review || '').localeCompare(b.next_review || '');
    }
  });


  const total = data.materias.length;
  const countEl = document.getElementById('filter-count');
  if (total === 0) {
    countEl.textContent = '';
  } else if (search) {
    countEl.textContent = `${list.length} de ${total} matérias`;
  } else {
    countEl.textContent = `${total} matéria${total !== 1 ? 's' : ''}`;
  }


  document.getElementById('mat-list').innerHTML = total === 0
    ? '<div class="empty">Nenhuma matéria cadastrada ainda.</div>'
    : list.length === 0
      ? '<div class="empty">Nenhuma matéria encontrada.</div>'
      : list.map(m => {
          const id = escapeHTML(m.id);
          const name = escapeHTML(m.name);
          const note = escapeHTML(m.note || '');
          const rel = relativeDate(m.next_review);
          return `
            <div class="mat-row">
              <div style="flex:1;min-width:0">
                <div class="row-name" id="name-${id}">${name}</div>
                <div style="font-size:12px;color:var(--muted);margin-top:3px">${stageLabel(m.stage)} · etapa ${m.stage + 1}/${STAGES.length} · <span class="relative-date ${rel.cls}">${rel.text}</span></div>
                <div class="prog-bg" style="max-width:220px"><div class="prog" style="width:${Math.round((m.stage / prog) * 100)}%"></div></div>
                <textarea class="note-area" placeholder="Anotação..." maxlength="4000" data-action="save-note" data-id="${id}">${note}</textarea>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                <button class="btn" data-action="edit-name" data-id="${id}" aria-label="Renomear ${name}" title="Renomear matéria" style="padding:10px 12px"><i class="ti ti-pencil" aria-hidden="true"></i></button>
                <button class="btn btn-danger" data-action="delete" data-id="${id}" aria-label="Excluir ${name}" title="Excluir matéria"><i class="ti ti-trash" aria-hidden="true"></i></button>
              </div>
            </div>`;
        }).join('');
}


function tsToDateStr(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


function renderHeatmap() {
  const WEEKS = 26;
  const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const t = today();
  const tDow = new Date(t + 'T12:00:00').getDay();   // 0=Dom
  const end = addDays(t, 6 - tDow);                   // sábado da semana atual
  let start = addDays(end, -(WEEKS * 7 - 1));
  const sDow = new Date(start + 'T12:00:00').getDay();
  start = addDays(start, -sDow);                      // recua até o domingo

  // quebra lembrei/esqueci por dia, a partir do review_log (enriquece o tooltip)
  const breakdown = {};
  for (const e of data.review_log || []) {
    const ds = tsToDateStr(e.ts);
    (breakdown[ds] || (breakdown[ds] = { done: 0, forgot: 0 }))[e.action === 'forgot' ? 'forgot' : 'done']++;
  }

  const levelFor = c => (c <= 0 ? 0 : c <= 1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4);

  const totalDays = daysBetween(start, end) + 1;
  const nCols = Math.ceil(totalDays / 7);
  const colFirstMonth = [];
  const cells = [];

  for (let i = 0; i < totalDays; i++) {
    const d = addDays(start, i);
    const col = Math.floor(i / 7);
    if (i % 7 === 0) colFirstMonth[col] = new Date(d + 'T12:00:00').getMonth();
    const isFuture = d > t;
    const count = isFuture ? 0 : (data.history[d] || 0);
    let title = '';
    if (!isFuture) {
      if (count === 0) {
        title = `Nenhuma revisão · ${fmtDate(d)}`;
      } else {
        title = `${count} revis${count !== 1 ? 'ões' : 'ão'} · ${fmtDate(d)}`;
        const b = breakdown[d];
        if (b && (b.done + b.forgot) > 0) title += ` (${b.done} lembrei · ${b.forgot} esqueci)`;
      }
    }
    const cls = isFuture ? 'future' : `l${levelFor(count)}`;
    cells.push(`<div class="heat-cell ${cls}"${title ? ` title="${escapeHTML(title)}"` : ''}></div>`);
  }

  // rótulo só no início de cada mês, e apenas se ele ocupar ≥3 colunas
  // (evita meses "stub" nas bordas se sobreporem ao vizinho)
  let monthsHTML = '';
  let c = 0;
  while (c < nCols) {
    const m = colFirstMonth[c];
    let c2 = c + 1;
    while (c2 < nCols && colFirstMonth[c2] === m) c2++;
    const run = c2 - c;
    for (let k = c; k < c2; k++) {
      monthsHTML += `<div>${k === c && run >= 3 && m != null ? MONTHS_PT[m] : ''}</div>`;
    }
    c = c2;
  }
  const monthsEl = document.getElementById('heat-months');
  monthsEl.style.gridTemplateColumns = `repeat(${nCols}, 13px)`;
  monthsEl.innerHTML = monthsHTML;

  const dayLabels = ['', 'seg', '', 'qua', '', 'sex', ''];
  document.getElementById('heat-daylabels').innerHTML = dayLabels.map(l => `<span>${l}</span>`).join('');

  document.getElementById('heat-grid').innerHTML = cells.join('');
}


function renderCalendar() {
  document.getElementById('cal-grid').innerHTML = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today(), i);
    const count = data.materias.filter(m => m.next_review === d).length;
    return `<div class="cal-day${d === today() ? ' today' : ''}${count > 0 ? ' has-due' : ''}">
      <div class="cal-date">${fmtDate(d)}</div>
      <div class="cal-count">${count > 0 ? count + ' rev' : '—'}</div>
    </div>`;
  }).join('');
}


function renderChart() {
  const labels = [], values = [];
  for (let i = 27; i >= 0; i--) {
    const d = addDays(today(), -i);
    labels.push(fmtDate(d));
    values.push(data.history[d] || 0);
  }
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const tickColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#9A93B0';
  chartInstance = new Chart(document.getElementById('chart-week'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Revisões', data: values, backgroundColor: '#7C5CFC', borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }, grid: { display: false } },
        y: { ticks: { color: tickColor, stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(140,133,160,.16)' }, beginAtZero: true }
      }
    }
  });
}


function renderAchievements() {
  const unlocked = new Set(data.achievements);
  const stats = computeStats();
  const count = ACHIEVEMENTS.filter(a => unlocked.has(a.id)).length;
  document.getElementById('ach-count').textContent = `${count}/${ACHIEVEMENTS.length}`;
  document.getElementById('ach-grid').innerHTML = ACHIEVEMENTS.map(a => {
    const c = ACH_CATS[a.cat];
    const on = unlocked.has(a.id);
    const cur = a.value(stats);
    const pct = Math.max(6, Math.min(100, Math.round((cur / a.target) * 100)));
    const vars = `--c1:${c.c1};--c2:${c.c2};--glow:${c.glow};--tint:${c.tint}`;
    let stars = '';
    for (let i = 1; i <= a.tierMax; i++) {
      const sOn = i <= a.tier;
      stars += `<i class="ti ${sOn ? 'ti-star-filled' : 'ti-star'}" style="color:${sOn ? c.c2 : 'var(--faint)'};opacity:${sOn ? 1 : .5}" aria-hidden="true"></i>`;
    }
    const coin = on
      ? `<div class="badge-coin"><span class="sheen"></span><i class="ti ${a.icon}" aria-hidden="true"></i></div><div class="badge-seal"><span><i class="ti ti-check" aria-hidden="true"></i></span></div>`
      : `<div class="badge-coin"><i class="ti ti-lock" aria-hidden="true"></i></div>`;
    const footer = on
      ? `<div class="badge-done"><i class="ti ti-circle-check-filled" aria-hidden="true"></i> Conquistada</div>`
      : `<div class="badge-prog"><div class="track"><div class="fill" style="width:${pct}%"></div></div><div class="lbl">${Math.min(cur, a.target)} / ${a.target}${a.unit ? ' ' + a.unit : ''}</div></div>`;
    return `<div class="badge ${on ? 'on' : 'off'}" style="${vars}" title="${escapeHTML(a.desc)}">
      <div class="badge-med">${coin}</div>
      <div class="badge-t">${escapeHTML(a.title)}</div>
      <div class="badge-stars">${stars}</div>
      <div class="badge-d">${escapeHTML(a.desc)}</div>
      ${footer}
    </div>`;
  }).join('');
}


// ---- CELEBRAÇÃO DE DESBLOQUEIO ----
let _achQueue = [], _achShowing = false;
function enqueueAchievement(a) { _achQueue.push(a); if (!_achShowing) _nextAchievement(); }
function _nextAchievement() {
  if (!_achQueue.length) { _achShowing = false; return; }
  _achShowing = true;
  const a = _achQueue.shift();
  const c = ACH_CATS[a.cat];
  const vars = `--c1:${c.c1};--c2:${c.c2};--glow:${c.glow};--glowstrong:${c.glowStrong}`;
  const colors = ['#FF6F5B','#FFC062','#7C5CFC','#4FCBA4','#FF8FB1','#F6D26B','#9B7BFF'];
  let confetti = '';
  for (let i = 0; i < 18; i++) {
    const left = 5 + (i * 5.1) % 90, delay = (i % 7) * 0.09, dur = 1.7 + (i % 4) * 0.3, size = i % 3 === 0 ? 9 : 6;
    confetti += `<span style="left:${left}%;width:${size}px;height:${size + 2}px;background:${colors[i % colors.length]};animation-duration:${dur}s;animation-delay:${delay}s"></span>`;
  }
  const el = document.createElement('div');
  el.className = 'ach-modal';
  el.innerHTML = `<div class="ach-modal-card" style="${vars}">
    <div class="ach-confetti">${confetti}</div>
    <div class="ach-rays-wrap"><div class="ach-rays"></div><div class="ach-medal"><i class="ti ${a.icon}" aria-hidden="true"></i></div></div>
    <div class="ach-modal-eyebrow" style="color:${c.c2}">Conquista desbloqueada</div>
    <div class="ach-modal-title">${escapeHTML(a.title)}</div>
    <div class="ach-modal-desc">${escapeHTML(a.desc)}</div>
    <button class="ach-modal-btn" type="button">Continuar</button>
  </div>`;
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); _nextAchievement(); };
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.querySelector('.ach-modal-card').addEventListener('click', e => e.stopPropagation());
  el.querySelector('.ach-modal-btn').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
}


window.showTab = tab => {
  if (!VALID_TABS.includes(tab)) tab = 'hoje';
  VALID_TABS.forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', VALID_TABS[i] === tab);
  });
  // move a pílula deslizante
  const idx = VALID_TABS.indexOf(tab);
  const pill = document.querySelector('.tab-pill');
  if (pill) pill.style.transform = `translateX(${idx * 100}%)`;
  activeTab = tab;
  // persiste + atualiza URL pra suportar back/forward do browser
  try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch {}
  if (location.hash !== '#' + tab) {
    history.replaceState(null, '', '#' + tab);
  }
  renderActive();
};


function readInitialTab() {
  const fromHash = location.hash.replace('#', '');
  if (VALID_TABS.includes(fromHash)) return fromHash;
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (VALID_TABS.includes(saved)) return saved;
  } catch {}
  return 'hoje';
}


// reage ao back/forward
window.addEventListener('hashchange', () => {
  const tab = location.hash.replace('#', '');
  if (VALID_TABS.includes(tab) && tab !== activeTab) window.showTab(tab);
});


// handlers do filtro/sort (debounce simples na busca)
let searchTimeout = null;
document.getElementById('filter-search').addEventListener('input', e => {
  const value = e.target.value;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filterText = value;
    if (activeTab === 'materias') renderMaterias();
  }, 150);
});
document.getElementById('filter-sort').addEventListener('change', e => {
  sortBy = e.target.value;
  if (activeTab === 'materias') renderMaterias();
});


function renderActive() {
  if (activeTab === 'hoje') { renderStreak(); renderDue(); }
  else if (activeTab === 'materias') { renderMaterias(); }
  else if (activeTab === 'stats') { renderHeatmap(); renderCalendar(); renderChart(); renderAchievements(); }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('Falha ao registrar o Service Worker:', err);
      });
    });
  }
