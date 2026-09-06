// ═══════════════════════════════════════════════════════════════════
// TAMPILAN KHUSUS HANDPHONE
//
// File ini KHUSUS urusan tampilan di layar kecil — tidak menambah atau
// menghapus fitur apa pun. Dua hal yang ditangani di sini:
//
// 1. Progress WO defaultnya Card View di HP (bukan Table). Tabelnya
//    punya 10+ kolom (Tanggal, Judul, Requestor, Tipe, Prioritas,
//    Equipment, Unit, Teknisi, Status, Due) — walau bisa di-scroll ke
//    samping (lihat .tbl-wrap di css/main.css), itu tetap tidak "pas"
//    di layar HP. Card View menyusun 1 kolom penuh, jauh lebih pas.
//    Kalau user PERNAH pilih manual (toggle ⊞/☰), pilihan itu diingat
//    (localStorage) dan TIDAK ditimpa lagi oleh default ini.
//
// 2. Class `is-mobile` di <html> — disinkronkan tiap resize/putar
//    layar (di-debounce), dipakai css/mobile.css untuk aturan yang
//    butuh tahu ukuran layar secara eksplisit, bukan cuma via
//    @media query murni.
//
// PENTING soal urutan <script src> di index.html: file ini WAJIB
// dimuat SETELAH 01-state-init.js (butuh ST sudah ada) dan SEBELUM
// 19-bootstrap-start.js (karena itu yang memanggil init() pertama
// kali — render pertama harus sudah tahu default viewMode yang benar).
// ═══════════════════════════════════════════════════════════════════

const MOBILE_BREAKPOINT = 768;
const VIEW_MODE_PREF_KEY = 'wo_view_mode_pref';

function isMobileViewport() {
  return window.matchMedia('(max-width: ' + MOBILE_BREAKPOINT + 'px)').matches;
}

function applyMobileLayoutClass() {
  document.documentElement.classList.toggle('is-mobile', isMobileViewport());
}

// Simpan pilihan manual user (dipanggil dari toggleView() di
// 02-dashboard-wo-list.js) supaya default HP di bawah tidak menimpa
// lagi pilihan ini pada sesi/kunjungan berikutnya.
function rememberViewModePref(mode) {
  try { localStorage.setItem(VIEW_MODE_PREF_KEY, mode); } catch (e) {}
}

(function initMobileDefaults() {
  applyMobileLayoutClass();

  let savedPref = null;
  try { savedPref = localStorage.getItem(VIEW_MODE_PREF_KEY); } catch (e) {}

  if (savedPref === 'card' || savedPref === 'table') {
    // User pernah pilih manual — hormati pilihannya di device apa pun.
    ST.viewMode = savedPref;
  } else if (isMobileViewport()) {
    // Belum pernah pilih manual & sedang di layar HP → default Card View.
    ST.viewMode = 'card';
  }
})();

// Sinkronkan class is-mobile saat rotasi layar / resize (di-debounce
// 150ms). Sengaja TIDAK memaksa ulang ST.viewMode di sini — supaya
// kalau user sedang lihat Table View di tablet lalu diputar ke
// portrait, tampilannya tidak tiba-tiba berpindah sendiri di tengah
// sesi tanpa dia minta.
let _mobileResizeTimer = null;
window.addEventListener('resize', function () {
  clearTimeout(_mobileResizeTimer);
  _mobileResizeTimer = setTimeout(applyMobileLayoutClass, 150);
});
