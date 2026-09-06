// ═══════════════════════════════════════════════════════════════
// AUTH SYSTEM — Login, Session, Role
// ═══════════════════════════════════════════════════════════════

const AUTH_KEY  = 'wo_session_v1';
const USERS_KEY = 'wo_users_v1';
const NOTIF_KEY = 'wo_notif_v1';

// Mulai prefetch data user di background (lihat catatan di js/00-bootstrap-config.js).
// Dipindah ke sini karena butuh loadUsers()/saveUsers() yang ada di bawah.
LOGIN_PREFETCH_PROMISE = startLoginPrefetch();

// ── Password hash (btoa-based) — dipakai hanya untuk verifikasi ──
// Password di Sheets ditulis plain text, HTML hash saat verifikasi
function hashPassword(pw) {
  return btoa(unescape(encodeURIComponent(pw + ':wo_salt_2025')));
}
function verifyPassword(pw, storedValue) {
  // Password selalu plain text — konsisten antara form HTML dan input manual Sheets
  if (!storedValue) return false;
  return pw === storedValue;
}

// ── Toggle password visibility ──
function toggleLoginPassVis() {
  const inp = document.getElementById('li-pass');
  const btn = document.getElementById('li-pass-eye');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}
function toggleUserPassVis() {
  const inp = document.getElementById('u-password');
  const btn = document.getElementById('u-pass-eye');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

let SESSION = null;

// ── mergeUsersFromSheets — update cache lokal dari data Sheets ──
function mergeUsersFromSheets(sheetUsers) {
  if (!sheetUsers || !sheetUsers.length) return;
  saveUsers(sheetUsers);
}

// ── seedDefaultUsersToSheets — buat user admin default jika Sheets kosong ──
async function seedDefaultUsersToSheets() {
  const existing = loadUsers();
  if (existing.length) return;
  const defaultAdmin = {
    id: 'USR-001', username: 'admin', nama: 'Administrator',
    role: 'Admin', jabatan: 'System Admin', whatsapp: '', status: 'Active', password: 'admin123',
  };
  saveUsers([defaultAdmin]);
  try {
    await _fetchSilent(CFG.apiUrl, { fn: 'upsert', sheet: 'WO_USERS', row: defaultAdmin });
  } catch (e) {
    console.warn('[seedDefaultUsers] Gagal kirim ke Sheets:', e.message);
  }
}

// ── loadUsers — selalu ambil dari localStorage (diisi saat login dari Sheets) ──
function loadUsers() {
  const stored = localStorage.getItem(USERS_KEY);
  if (stored) { try { return JSON.parse(stored); } catch {} }
  return [];
}

// ── saveUsers — simpan cache lokal dari Sheets ──
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadNotifSettings() {
  const stored = localStorage.getItem(NOTIF_KEY);
  if (stored) { try { return JSON.parse(stored); } catch {} }
  return { woBaru:true, woDone:true, woStatus:false, provider:'fonnte', apiKey:'' };
}
function saveNotifSettingsLocal(s) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(s));
}

// ── UNIT SELECTION ──
let SELECTED_UNIT = null; // 'unit1' | 'unit2'

function showUnitSelector() {
  document.getElementById('unit-selector-overlay').style.display = 'flex';
  const greeting = SESSION ? `Selamat datang, ${SESSION.nama} (${SESSION.role})` : 'Pilih unit untuk melanjutkan';
  setText('unit-sel-greeting', greeting);
}

function selectUnit(unitId, unitName) {
  SELECTED_UNIT = unitId;
  document.getElementById('unit-selector-overlay').style.display = 'none';
  SESSION.selectedUnit = unitId;
  SESSION.selectedUnitName = unitName;
  localStorage.setItem(AUTH_KEY, JSON.stringify(SESSION));
  // Simple mode hanya untuk User & Maintenance, bukan Admin/SPV
  if (SESSION.role !== 'Admin' && SESSION.role !== 'SPV') {
    applySimpleMode();
  } else {
    // Admin/SPV: cukup tambah unit pill di topbar, tampilan tetap full
    addUnitPill(unitName);
  }
  applyRoleUI();
  init();
}

function addUnitPill(unitName) {
  if (document.getElementById('unit-pill')) return;
  const brand = document.querySelector('.brand');
  if (!brand || !unitName) return;
  const pill = document.createElement('span');
  pill.style.cssText = 'background:rgba(74,158,63,.2);color:#6fcf6f;font-family:"IBM Plex Mono",monospace;font-size:10px;padding:2px 8px;border-radius:10px;border:1px solid rgba(74,158,63,.3);cursor:pointer';
  pill.textContent = unitName;
  pill.id = 'unit-pill';
  pill.title = 'Klik untuk ganti unit';
  pill.onclick = () => {
    // Reset unit dan tampilkan selector lagi
    SESSION.selectedUnit = null;
    SESSION.selectedUnitName = null;
    localStorage.setItem(AUTH_KEY, JSON.stringify(SESSION));
    pill.remove();
    document.body.classList.remove('simple-mode');
    showUnitSelector();
  };
  brand.appendChild(pill);
}

function applySimpleMode() {
  document.body.classList.add('simple-mode');
  addUnitPill(SESSION?.selectedUnitName || '');
}

// Cek apakah role perlu unit selector
// DINONAKTIFKAN: filter unit otomatis tidak dipakai lagi — selalu false
function needsUnitSelector(role) {
  return false;
}

// ── LOGIN — data user diambil dari Google Sheets, fallback ke cache lokal ──
async function doLogin() {
  const username = document.getElementById('li-user').value.trim().toLowerCase();
  const password = document.getElementById('li-pass').value;
  const errEl    = document.getElementById('login-err');
  const loginBtn = document.querySelector('.login-btn');

  if (!username || !password) { errEl.textContent = 'Username dan password wajib diisi'; return; }

  errEl.style.color = '';
  errEl.textContent = '';
  loginBtn.disabled = true;

  let elapsed = 0;
  loginBtn.textContent = 'Menghubungkan...';
  const tickTimer = setInterval(() => {
    elapsed++;
    loginBtn.textContent = elapsed < 8 ? 'Menghubungkan...' : `Menghubungkan... (${elapsed}s)`;
  }, 1000);

  // SATU kali round trip: fn=login sekaligus memvalidasi username+password
  // DAN mengembalikan token sesi. Tidak lagi menunggu prefetch daftar
  // user (fn=get_users) lebih dulu — itu penyebab login lama/kadang gagal
  // karena dulu perlu 2-3x bolak-balik ke GAS sebelum sesi terbentuk.
  let tokData = null;
  try {
    const tokResp = await fetch(
      apiBase() + '?fn=login&username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password),
      { mode: 'cors', signal: AbortSignal.timeout(25000) }
    );
    tokData = await tokResp.json();
  } catch (e) {
    console.warn('[doLogin] fn=login gagal, coba fallback offline:', e.message);
  }

  clearInterval(tickTimer);
  loginBtn.textContent = 'MASUK →';
  loginBtn.disabled = false;

  // ── Berhasil login online ──
  if (tokData && tokData.success && tokData.token && tokData.user) {
    const u = tokData.user;
    SESSION = { userId:u.id, username:u.username, nama:u.nama, role:u.role, jabatan:u.jabatan||'', token: tokData.token };
    localStorage.setItem(AUTH_KEY, JSON.stringify(SESSION));
    // Simpan salinan ringan (tanpa password) untuk fallback offline nanti
    const cached = loadUsers().filter(x => x.id !== u.id);
    cached.push({ ...u, status: 'Active' });
    saveUsers(cached);

    document.getElementById('login-screen').style.display = 'none';
    if (needsUnitSelector(SESSION.role)) { showUnitSelector(); }
    else { applyRoleUI(); init(); }
    return;
  }

  // ── Online tapi ditolak backend (salah username/password) ──
  if (tokData && tokData.message) {
    errEl.textContent = '⚠ ' + tokData.message;
    document.getElementById('li-pass').value = '';
    return;
  }

  // ── Server tidak terjangkau sama sekali → fallback offline dari cache ──
  const users = loadUsers();
  if (!users.length) {
    errEl.textContent = '⚠ Tidak dapat terhubung ke server dan belum ada data tersimpan. Periksa koneksi internet, lalu coba lagi.';
    return;
  }
  errEl.style.color = 'var(--accent)';
  errEl.textContent = '⚠ Mode offline — menggunakan data tersimpan';
  const user = users.find(u => u.username && u.username.toLowerCase() === username && u.status === 'Active');
  if (!user) {
    errEl.style.color = '';
    errEl.textContent = '⚠ Username tidak ditemukan (offline)';
    return;
  }
  SESSION = { userId:user.id, username:user.username, nama:user.nama, role:user.role, jabatan:user.jabatan||'', token:'' };
  localStorage.setItem(AUTH_KEY, JSON.stringify(SESSION));
  document.getElementById('login-screen').style.display = 'none';
  if (needsUnitSelector(SESSION.role)) { showUnitSelector(); }
  else { applyRoleUI(); init(); }
}

function doLogout() {
  if (!confirm('Yakin ingin keluar?')) return;
  SESSION = null;
  SELECTED_UNIT = null;
  localStorage.removeItem(AUTH_KEY);
  document.body.classList.remove('simple-mode');
  document.getElementById('unit-selector-overlay').style.display = 'none';
  // Sembunyikan UI sensitif secara instan sebelum reload
  try {
    document.getElementById('user-badge').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('filter-section').style.display = 'none';
    const mt = document.getElementById('maintenance-tools-section');
    if (mt) mt.style.display = 'none';
    document.getElementById('topnav-admin').style.display = 'none';
    // Tampilkan login screen kembali
    document.getElementById('login-screen').style.display = '';
  } catch {}
  location.reload();
}

function checkSession() {
  const stored = localStorage.getItem(AUTH_KEY);
  if (!stored) return false;
  try {
    SESSION = JSON.parse(stored);
    const prevToken = SESSION?.token || ''; // simpan token lama sebelum SESSION di-rebuild

    // PENTING: sesi tanpa token tidak akan pernah bisa upsert/delete/write —
    // backend selalu menolaknya via requireAuth(). Ini terjadi pada sesi lama
    // (sebelum fitur token auth ada) atau saat login terakhir gagal ambil
    // token (mis. API sedang offline). Daripada dibiarkan retry sync selamanya
    // tanpa pernah berhasil, paksa logout supaya user login ulang dan dapat
    // token yang valid.
    if (!prevToken) {
      localStorage.removeItem(AUTH_KEY);
      SESSION = null;
      return false;
    }

    // Bersihkan sisa pilihan unit lama — fitur unit selector dinonaktifkan
    if (SESSION && SESSION.selectedUnit) {
      delete SESSION.selectedUnit;
      delete SESSION.selectedUnitName;
      localStorage.setItem(AUTH_KEY, JSON.stringify(SESSION));
    }
    const users = loadUsers();
    // Jika cache users masih kosong (baru clear storage), tetap izinkan session
    // dengan data yang tersimpan di AUTH_KEY — akan divalidasi saat aksi berikutnya
    if (!users.length) {
      // Session ada tapi users belum ada di cache — izinkan masuk, fetch akan update
      if (SESSION && SESSION.userId && SESSION.username) return true;
      return false;
    }
    const user = users.find(u => u.id === SESSION.userId && u.status === 'Active');
    if (user) {
      SESSION = { userId:user.id, username:user.username, nama:user.nama, role:user.role, jabatan:user.jabatan||'', token: prevToken };
      return true;
    }
    // User tidak ditemukan di cache — session mungkin sudah expired atau dihapus admin
    // Jangan langsung reject: mungkin cache belum ter-update. Tetap izinkan dengan session lama.
    if (SESSION && SESSION.userId) return true;
  } catch {}
  SESSION = null;
  return false;
}

// ── APPLY ROLE UI ──
function applyRoleUI() {
  if (!SESSION) return;
  const role = SESSION.role;
  // Inject style untuk blokir tombol tandai selesai bagi non-Maintenance di simple mode
  const styleId = 'simple-mode-style';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  // Show user badge in topbar
  const badge = document.getElementById('user-badge');
  const logoutBtn = document.getElementById('logout-btn');
  badge.style.display = 'flex';
  logoutBtn.style.display = '';
  document.getElementById('user-avatar').textContent = SESSION.nama.charAt(0).toUpperCase();
  document.getElementById('user-display-name').textContent = SESSION.nama;
  document.getElementById('user-display-role').textContent = role + (SESSION.jabatan ? ' · ' + SESSION.jabatan : '');

  // Show/hide menu sections
  const adminSection = document.getElementById('admin-section');
  const filterSection = document.getElementById('filter-section');
  const topnavAdmin = document.getElementById('topnav-admin');

  if (role === 'Admin') {
    adminSection.style.display = '';
    filterSection.style.display = '';
    if (topnavAdmin) {
      topnavAdmin.style.display = '';
      topnavAdmin.onclick = () => navigateTo('admin-panel');
    }
    const mnavAdmin = document.getElementById('mnav-admin');
    if (mnavAdmin) {
      mnavAdmin.style.display = '';
      mnavAdmin.onclick = () => navigateTo('admin-panel');
    }
  } else if (role === 'Maintenance') {
    adminSection.style.display = 'none';
    filterSection.style.display = 'none';
    const maintTools = document.getElementById('maintenance-tools-section');
    if (maintTools) maintTools.style.display = 'none';
    if (topnavAdmin) topnavAdmin.style.display = 'none';
    const mnavAdmin = document.getElementById('mnav-admin');
    if (mnavAdmin) mnavAdmin.style.display = 'none';
  } else {
    // User biasa
    adminSection.style.display = 'none';
    filterSection.style.display = 'none';
    if (topnavAdmin) topnavAdmin.style.display = 'none';
    const mnavAdmin = document.getElementById('mnav-admin');
    if (mnavAdmin) mnavAdmin.style.display = 'none';
  }

  // Default landing page
  if (role === 'Admin' || role === 'Maintenance') {
    navigateTo('wo-list');
  } else {
    navigateTo('wo-list');
  }
}

// ── getVisibleWO — filter WO berdasarkan role ──
function getVisibleWO() {
  const all = WO.workorders;
  if (!SESSION) return [];

  let list = all;

  // Filter berdasarkan unit yang dipilih — berlaku SEMUA role termasuk Admin
  if (SESSION.selectedUnit) {
    const unitId = SESSION.selectedUnit;
    // Cari unit yang cocok dari EQUIP_DB
    const matchedUnit = (EQUIP_DB.units || []).find(u => {
      const normalized = u.id.toLowerCase().replace(/[\s\-_]/g,'');
      const uName      = u.name.toLowerCase();
      if (unitId === 'unit1') return normalized.includes('unit1') || uName.includes('unit 1') || uName.includes('unit1') || (uName.includes('unit') && uName.includes('1'));
      if (unitId === 'unit2') return normalized.includes('unit2') || uName.includes('unit 2') || uName.includes('unit2') || (uName.includes('unit') && uName.includes('2'));
      return false;
    });

    if (matchedUnit) {
      list = list.filter(w => w.unitId === matchedUnit.id);
    } else {
      // Fallback string match pada unitId field WO
      const keywords = unitId === 'unit1' ? ['unit1','unit-1','unit_1'] : ['unit2','unit-2','unit_2'];
      list = list.filter(w => {
        if (!w.unitId) return false;
        const n = w.unitId.toLowerCase().replace(/[\s]/g,'');
        return keywords.some(k => n.includes(k));
      });
    }
  }

  // Role User: filter hanya WO milik sendiri (dari list yang sudah difilter unit)
  if (SESSION.role === 'User') {
    return list.filter(w => w.createdBy === SESSION.userId || w.requestorName === SESSION.nama);
  }

  return list; // Admin, SPV, Maintenance: semua WO di unit yang dipilih
}

// ═══════════════════════════════════════════════════════════════
// ADMIN PANEL
