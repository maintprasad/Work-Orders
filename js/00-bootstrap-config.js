// ═══════════════════════════════════════════════════════════════
// MOBILE ZOOM LOCK — blokir pinch-zoom & double-tap zoom di HP
// ═══════════════════════════════════════════════════════════════
document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
document.addEventListener('gestureend', function(e) { e.preventDefault(); });
let _lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
  const now = Date.now();
  if (now - _lastTouchEnd <= 300) e.preventDefault();
  _lastTouchEnd = now;
}, { passive: false });
document.addEventListener('touchmove', function(e) {
  if (e.touches && e.touches.length > 1) e.preventDefault();
}, { passive: false });

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const CFG = {
  apiUrl:          'https://script.google.com/macros/s/AKfycbw6AOeGhZ-KMVudXzUfjM6p8DdPPPU0FPMjRIy7GdIKoAe9YIIokpE6inXlfEqWBgGsWg/exec',
  equipDbApi:      'https://script.google.com/macros/s/AKfycbyw_FZzkyoptG-JAsdltk0ZWVvVWZjTaWu0nGqn2SUxxVlGFCXbPA9_83C4070m5jOs/exec',
  // URL backend MaintWare (Warehouse) — WAJIB sama dengan konstanta API_URL
  // di file HTML MaintWare, supaya Parts Picker baca stok live & benar-benar
  // mengurangi stok asli di sheet ITEMS_DB milik MaintWare.
  maintwareApiUrl: 'https://script.google.com/macros/s/AKfycbxWC3esNUKacXKDx1cGqzrtaaH0vKW4pbsVV6_zmUj5jSXBTP2aZLJ73X6M9vW9W3ro/exec',
  storageKey:      'wo_data_v1',
  equipDbKey:      'edb_data',
  itemsDbKey:      'items_db_cache',
};

// ═══════════════════════════════════════════════════════════════
// LOGIN PREFETCH — mulai ambil data user di BACKGROUND begitu file
// ini dieksekusi (sebelum user sempat klik tombol MASUK). Dengan ini,
// saat user selesai mengetik username & password, data kemungkinan
// besar sudah tersedia sehingga proses login terasa instan.
// Timeout dinaikkan + diberi 1x retry karena GAS butuh 15–25 detik
// saat cold start (lihat juga PULL.backoff di bagian pullAllFromAPI).
// ═══════════════════════════════════════════════════════════════
let LOGIN_PREFETCH_PROMISE = null;

function fetchUsersFromServer(timeoutMs) {
  // fn=get_users: endpoint RINGAN yang HANYA membaca sheet WO_USERS
  // (tidak scan seluruh WO/equipment/parts seperti fn=read), jadi
  // proses buka halaman login jauh lebih cepat. fn=login sekarang
  // WAJIB username+password (dipakai untuk login sungguhan, bukan
  // prefetch), jadi tidak boleh dipakai di sini lagi.
  return fetch(CFG.apiUrl + '?fn=get_users', {
    mode: 'cors',
    signal: AbortSignal.timeout(timeoutMs),
  }).then(r => r.json());
}

async function startLoginPrefetch() {
  try {
    const d = await fetchUsersFromServer(20000); // percobaan 1: 20 detik
    if (d.ok && d.data && Array.isArray(d.data.users) && d.data.users.length) {
      saveUsers(d.data.users);
      return { users: d.data.users, online: true };
    }
    return { users: loadUsers(), online: false };
  } catch (e1) {
    try {
      const d2 = await fetchUsersFromServer(25000); // retry: 25 detik (GAS cold start)
      if (d2.ok && d2.data && Array.isArray(d2.data.users) && d2.data.users.length) {
        saveUsers(d2.data.users);
        return { users: d2.data.users, online: true };
      }
      return { users: loadUsers(), online: false };
    } catch (e2) {
      return { users: loadUsers(), online: false };
    }
  }
}

// Catatan (versi split-file): pemanggilan startLoginPrefetch() dipindah ke
// awal js/12-auth.js — karena fungsi itu butuh loadUsers()/saveUsers() yang
// baru didefinisikan di file tersebut. Kalau dipanggil di sini (file
// paling awal) dan koneksi internet gagal SANGAT cepat (mis. offline),
// bagian catch-nya bisa error "loadUsers is not defined" sebelum file
// 12-auth.js sempat ke-load. Di kondisi normal (fetch ke Google Apps
// Script), delay loading beberapa file JS lokal ini tidak berasa sama
// sekali dibanding waktu network fetch-nya sendiri.

// ═══════════════════════════════════════════════════════════════
