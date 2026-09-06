// DATA STORE
// ═══════════════════════════════════════════════════════════════
let WO = { workorders: [], technicians: [] };
let EQUIP_DB = { units: [], areas: [], equipment: [], parts: [] };
let ST = { page: 'dashboard', viewMode: 'table', filterStatus: '', filterType: '', filterPriority: '', filterUnit: '', filterArea: '', filterRequestor: '', filterTechnician: '', fastPageMode: false, woPage: 1 };
let PP_SELECTED = { partId: null, qty: 1 };
let CURRENT_DETAIL_WO_ID = null;
let WO_BEFORE_FILES = [];
let PV_STATE = { list: [], idx: 0, zoomed: false, category: '' };
const IMG_CACHE = {}; // fileId -> data URI (cache di memori per sesi)

// Ambil gambar via proxy GAS (base64) — tidak bergantung sharing publik Drive
async function loadImageDataURI(fileId) {
  if (!fileId) return '';
  if (IMG_CACHE[fileId]) return IMG_CACHE[fileId];
  try {
    const r = await fetch(CFG.apiUrl + '?fn=get_thumbnail&id=' + encodeURIComponent(fileId), {
      mode: 'cors', signal: AbortSignal.timeout(20000),
    });
    const d = await r.json();
    if (d.ok && d.base64) {
      const uri = `data:${d.mimeType||'image/jpeg'};base64,${d.base64}`;
      IMG_CACHE[fileId] = uri;
      return uri;
    }
  } catch(e) {
    console.warn('[loadImageDataURI] gagal load', fileId, e.message);
  }
  return '';
}

// Isi semua <img class="ph-lazy" data-fid> yang belum di-hydrate di dalam scopeEl
async function hydratePhotoThumbnails(scopeEl) {
  if (!scopeEl) return;
  const imgs = scopeEl.querySelectorAll('img.ph-lazy[data-fid]:not([data-hydrated])');
  for (const img of imgs) {
    const fid = img.dataset.fid;
    if (!fid) continue;
    img.dataset.hydrated = '1';
    const uri = await loadImageDataURI(fid);
    if (uri) {
      img.src = uri;
    } else {
      const wrap = img.closest('.photo-thumb, .attach-card-link, .attach-wrap');
      if (wrap) wrap.style.opacity = '0.35';
      img.alt = '⚠ Gagal memuat gambar';
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function init() {
  history.replaceState({ page: 'wo-list' }, '', '#wo-list');
  // Load cache ITEMS_DB untuk parts picker
  loadItemsDbCache();

  // Load cached local data dulu supaya UI langsung muncul
  const saved = localStorage.getItem(CFG.storageKey);
  if (saved) {
    try { WO = JSON.parse(saved); } catch { WO = { workorders: [], technicians: [] }; }
  }

  // Load cached EquipDB
  const edb = localStorage.getItem(CFG.equipDbKey);
  if (edb) {
    try {
      const d = JSON.parse(edb);
      EQUIP_DB.units     = d.units     || [];
      EQUIP_DB.areas     = d.areas     || [];
      EQUIP_DB.equipment = d.equipment || [];
      EQUIP_DB.parts     = d.parts     || [];
    } catch {}
  }
window.addEventListener('beforeunload', function(e) {
  const pendingCount = Object.keys(SYNC.queue).length;
  if (pendingCount > 0 || SYNC.inFlight) {
    e.preventDefault();
    e.returnValue = 'Masih ada perubahan yang belum tersimpan ke server. Yakin ingin keluar?';
    return e.returnValue;
  }
});
  setupNav();

  // filterStatus default kosong = tampilkan semua WO
  const fsel = document.getElementById('filterStatus');
  if (fsel) fsel.value = '';
  navigateTo('wo-list');

  refreshAll();

  // Kalau belum ada cache WO sama sekali (device/browser baru, atau cache
  // baru dibersihkan) → tampilkan 20 WO pertama secepatnya dari server
  // (fn=read_wo_page, cuma baca sheet bulanan yang relevan) SEMENTARA
  // fn=read yang lengkap tetap jalan seperti biasa di background. Kalau
  // sudah ada cache, lewati ini — cache yang sudah tampil lebih cepat lagi.
  if (!WO.workorders || !WO.workorders.length) {
    loadWOPageFast(1);
  }

  // Selalu pull data terbaru dari API saat startup
  pullAllFromAPI();
}

// Pull semua data (WO + EquipDB + Users) dari Google Sheets saat startup
// Strategi: timeout 30s (GAS cold start bisa 15-25s), retry otomatis dengan backoff
const PULL = {
  retryTimer:   null,
  retryCount:   0,
  maxRetries:   5,
  backoff:      [8000, 15000, 25000, 40000, 60000], // ms antar retry
  inProgress:   false,
};

async function pullAllFromAPI(isRetry = false) {
  if (PULL.inProgress) return;       // hindari double-call
  PULL.inProgress = true;

  // Update status bar
  if (!isRetry) {
    PULL.retryCount = 0;
    setApiStatus('loading', 'Menghubungkan ke Google Sheets...');
  } else {
    setApiStatus('loading', `Mencoba ulang... (${PULL.retryCount}/${PULL.maxRetries})`);
  }

  try {
    // Timeout 30 detik — cukup untuk GAS cold start
    const r = await fetch(CFG.apiUrl + '?fn=read', {
      mode: 'cors',
      signal: AbortSignal.timeout(30000),
    });
    const d = await r.json();

    if (d.ok && d.data) {
      PULL.retryCount = 0;
      if (PULL.retryTimer) { clearTimeout(PULL.retryTimer); PULL.retryTimer = null; }

      // Data lengkap sudah datang — matikan mode fast-page (kalau sempat aktif)
      ST.fastPageMode = false;

      // Update WO data — normalisasi field array dari Sheets
      if (d.data.workorders)  WO.workorders  = d.data.workorders.map(normalizeWOFromSheets);
      if (d.data.technicians) WO.technicians = d.data.technicians;

      // Sync Users
      if (d.data.users && d.data.users.length) {
        mergeUsersFromSheets(d.data.users);
      } else if (d.data.users && d.data.users.length === 0) {
        await seedDefaultUsersToSheets();
      }

      // Refresh session dari users terbaru
      if (SESSION) {
        const freshUser = loadUsers().find(u => u.id === SESSION.userId && u.status === 'Active');
        if (freshUser) {
          SESSION = { userId:freshUser.id, username:freshUser.username,
            nama:freshUser.nama, role:freshUser.role, jabatan:freshUser.jabatan||'', token: SESSION.token || '' };
          localStorage.setItem(AUTH_KEY, JSON.stringify(SESSION));
          document.getElementById('user-display-name').textContent = SESSION.nama;
          document.getElementById('user-display-role').textContent =
            SESSION.role + (SESSION.jabatan ? ' · ' + SESSION.jabatan : '');
          document.getElementById('user-avatar').textContent = SESSION.nama.charAt(0).toUpperCase();
        }
      }

      // Update EquipDB
      if (d.data.units)     EQUIP_DB.units     = d.data.units;
      if (d.data.areas)     EQUIP_DB.areas     = d.data.areas;
      if (d.data.equipment) EQUIP_DB.equipment = d.data.equipment;
      if (d.data.parts)     EQUIP_DB.parts     = d.data.parts;

      // Cache ke localStorage
      saveLocal();
      localStorage.setItem(CFG.equipDbKey, JSON.stringify({
        units: EQUIP_DB.units, areas: EQUIP_DB.areas,
        equipment: EQUIP_DB.equipment, parts: EQUIP_DB.parts,
      }));

      refreshAll();
      if (ST.page === 'wo-list') renderWOList();

      const woCount   = WO.workorders.length;
      const techCount = WO.technicians.length;
      const userCount = loadUsers().length;
      setApiStatus('ok', `Tersinkron — ${woCount} WO, ${techCount} teknisi, ${userCount} user`);

    } else {
      throw new Error(d.message || 'Response tidak valid');
    }

  } catch (e) {
    // Render dari cache dulu agar UI tetap usable
    refreshAll();
    if (ST.page === 'wo-list') renderWOList();

    const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';

    if (PULL.retryCount < PULL.maxRetries) {
      const delayMs  = PULL.backoff[PULL.retryCount] || 60000;
      const delaySec = Math.round(delayMs / 1000);
      PULL.retryCount++;

      const reason = isTimeout ? 'GAS sedang warm-up' : 'Koneksi bermasalah';
      setApiStatus('warn', `${reason} — retry ${PULL.retryCount}/${PULL.maxRetries} dalam ${delaySec}s`);

      // Countdown di status bar
      let remaining = delaySec;
      const countdown = setInterval(() => {
        remaining--;
        if (remaining > 0) {
          setApiStatus('warn', `${reason} — retry ${PULL.retryCount}/${PULL.maxRetries} dalam ${remaining}s`);
        } else {
          clearInterval(countdown);
        }
      }, 1000);

      PULL.retryTimer = setTimeout(() => {
        clearInterval(countdown);
        PULL.inProgress = false;
        pullAllFromAPI(true);
      }, delayMs);

    } else {
      // Habis semua retry
      setApiStatus('err', 'Tidak bisa terhubung ke API. Klik ↻ untuk coba lagi.');
    }

  } finally {
    // Hanya reset inProgress jika tidak ada retry terjadwal
    if (!PULL.retryTimer) PULL.inProgress = false;
  }
}

function onTechCheckboxChange(el, techId) {
  const wrap   = document.getElementById('note-tech-checkboxes');
  const hidden = document.getElementById('note-tech-id');

  // Multi-select: tidak ada lagi uncheck checkbox lain
  const lbl = el.closest('label');
  if (lbl) {
    lbl.style.background  = el.checked ? 'rgba(74,158,63,.1)'   : 'var(--bg2)';
    lbl.style.borderColor = el.checked ? 'rgba(74,158,63,.3)'  : 'var(--border)';
  }

  // Kumpulkan semua checkbox yang tercentang → simpan sebagai CSV di hidden input
  const selectedIds = Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.value);
  hidden.value = selectedIds.join(',');
}

// Helper: update pill + syncStatus sekaligus
function setApiStatus(state, msg) {
  const pill = document.getElementById('apiPill');
  setText('syncStatus', msg);
  if (state === 'ok') {
    pill.className = 'api-pill ok';
    pill.textContent = '✓ API OK';
  } else if (state === 'warn') {
    pill.className = 'api-pill warn';
    pill.textContent = '⟳ Connecting';
  } else if (state === 'err') {
    pill.className = 'api-pill err';
    pill.textContent = '✗ Offline';
  } else {
    // loading
    pill.className = 'api-pill warn';
    pill.textContent = '● Loading';
  }
}

// pingAPI — sekarang hanya dipakai oleh manualSync, tidak dari pullAllFromAPI
async function pingAPI() {
  try {
    const r = await fetch(CFG.apiUrl + '?fn=ping', {
      mode: 'cors',
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    if (d.success || d.message) {
      document.getElementById('apiPill').className = 'api-pill ok';
      document.getElementById('apiPill').textContent = '✓ API OK';
    } else throw new Error();
  } catch {
    document.getElementById('apiPill').className = 'api-pill err';
    document.getElementById('apiPill').textContent = '✗ Offline';
  }
}

function setupNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.getAttribute('data-page')));
  });
}

// ── History API — supaya tombol Back HP tidak keluar dari browser ──
let _navFromPop = false;

window.addEventListener('popstate', function(e) {
  const page = e.state?.page;
  if (!page || !SESSION) return;
  _navFromPop = true;
  navigateTo(page);
  _navFromPop = false;
});

function navigateTo(page) {
  // Role access control
  if (!SESSION) return;
  const role = SESSION.role;
  const adminOnly = ['user-management','notif-settings','dashboard','technicians','reports','mttr-mtbf'];
  if (adminOnly.includes(page) && role !== 'Admin') {
    // Maintenance can also access dashboard, technicians, reports, rating
    const maintAllowed = ['dashboard','technicians','reports','rating'];
    if (role === 'Maintenance' && maintAllowed.includes(page)) {
      // allow through
    } else {
      toast('Akses ditolak untuk role ' + role, 'error'); return;
    }
  }

  // Push ke browser history supaya tombol Back HP berfungsi
  if (!_navFromPop && ST.page !== page) {
    history.pushState({ page }, '', '#' + page);
  }

  ST.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('[data-page]').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  document.querySelectorAll('[data-page="' + page + '"]').forEach(b => b.classList.add('active'));
  // BUG #11 fix: saat di halaman detail, tandai wo-list sebagai active di sidebar
  if (page === 'detail') {
    document.querySelectorAll('[data-page="wo-list"]').forEach(b => b.classList.add('active'));
  }
  closeSidebar();
  if (page === 'dashboard')        renderDashboard();
  if (page === 'wo-list') {
    const fsel = document.getElementById('filterStatus');
    if (fsel) fsel.value = ST.filterStatus;
    const fUnit = document.getElementById('filterUnit');
    if (fUnit) fUnit.value = ST.filterUnit || '';
    const fArea = document.getElementById('filterArea');
    if (fArea) fArea.value = ST.filterArea || '';
    const fTech = document.getElementById('filterTechnician');
    if (fTech) fTech.value = ST.filterTechnician || '';
    renderWOList();
  }
  if (page === 'technicians')      renderTechnicians();
  if (page === 'reports')          renderReports();
  if (page === 'rating')           renderRatingPage();
  if (page === 'comparison')       { initComparisonYearDropdown(); renderComparison(); }
  if (page === 'admin-panel')      renderAdminPanel();
  if (page === 'user-management')  renderUserManagement();
  if (page === 'notif-settings')   renderNotifSettings();
  if (page === 'equip-history-admin') renderEHAPage();
  if (page === 'mttr-mtbf')           renderMTTRMTBFPage();
}

function refreshAll() {
  refreshCounts();
  renderDashboard();
  if (ST.page === 'wo-list')     renderWOList();
  if (ST.page === 'technicians') renderTechnicians();
  if (ST.page === 'reports')     renderReports();
  if (ST.page === 'rating')      renderRatingPage();
}

function saveLocal() {
  localStorage.setItem(CFG.storageKey, JSON.stringify(WO));
}

function refreshCounts() {
  const all = getVisibleWO ? getVisibleWO() : WO.workorders;
  const cnt = s => all.filter(w => w.status === s).length;
  setText('cnt-all',        all.length);
  setText('cnt-open',       cnt('Open'));
  setText('cnt-inprogress', cnt('In Progress'));
  setText('cnt-done',       cnt('Done'));
  setText('cnt-tech',       WO.technicians.filter(t => t.status === 'Active').length);
}

// ═══════════════════════════════════════════════════════════════
// RENDER: DASHBOARD
