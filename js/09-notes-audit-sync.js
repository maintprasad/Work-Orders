// ═══════════════════════════════════════════════════════════════
function addNoteToLog(woId) {
  const el   = document.getElementById('note-input-' + woId);
  const text = el?.value.trim();
  if (!text) { toast('Tulis catatan dulu', 'error'); return; }
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  if (wo.status === 'Done' || wo.status === 'Cancelled') {
    toast('WO sudah ' + wo.status + ', catatan terkunci', 'error'); return;
  }
  wo.notesLog = wo.notesLog || [];
  wo.notesLog.push({
    id:     'nl-' + Date.now(),
    text,
    author: SESSION?.nama || '—',
    ts:     fmtTs(),
  });
  addAudit(wo, 'note', `Catatan: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
  saveLocal(); showDetail(woId);
  // Langsung switch ke tab catatan setelah simpan
  switchTab('noteslog', woId);
  syncUpsertWO(wo);
  toast('Catatan ditambahkan', 'success');
}

// ═══════════════════════════════════════════════════════════════
// AUDIT HELPER
// ═══════════════════════════════════════════════════════════════
function addAudit(wo, type, msg) {
  wo.audit = wo.audit || [];
  wo.audit.push({ ts: fmtTs(), type, msg });
}

const SYNC = {
  queue:       {},     // { woId: 'upsert'|'delete', techId: 'upsert' }
  timer:       null,
  debounceMs:  2000,   // gabungkan perubahan dalam 2 detik jadi 1 batch
  inFlight:    false,
  online:      true,
  pendingCount: 0,
  failCounts:  {},      // key -> berapa kali item ini gagal berturut-turut
  retryTimer:  null,
  _retryAttempt: 0,
  _tokenRefreshInFlight: false,
};

// Refresh token sesi secara diam-diam pakai kredensial yang sudah tersimpan
// di cache lokal (users di localStorage ikut menyimpan password, karena
// Sheets menyimpannya plain text). Dipanggil otomatis saat backend menolak
// upsert/delete karena token kosong/expired — supaya user TIDAK perlu
// login ulang manual di tengah sesi kerja yang panjang.
async function refreshSessionToken() {
  if (!SESSION || !SESSION.username) return false;
  const cachedUser = loadUsers().find(u => u.username === SESSION.username && u.status === 'Active');
  if (!cachedUser || !cachedUser.password) return false;
  try {
    const resp = await fetch(
      apiBase() + '?fn=login&username=' + encodeURIComponent(cachedUser.username) + '&password=' + encodeURIComponent(cachedUser.password),
      { mode: 'cors', signal: AbortSignal.timeout(15000) }
    );
    const data = await resp.json();
    if (data.success && data.token) {
      SESSION.token = data.token;
      localStorage.setItem(AUTH_KEY, JSON.stringify(SESSION));
      console.log('[refreshSessionToken] Token berhasil diperbarui otomatis');
      return true;
    }
  } catch (e) {
    console.warn('[refreshSessionToken] Gagal:', e.message);
  }
  return false;
}

// Backend bisa mengubah ID WO (tambah suffix -01, -02, dst) kalau nomor
// yang dikirim ternyata sudah dipakai WO lain — biasanya karena race antar
// user/device yang submit WO hampir bersamaan (generateWOId() di HTML cuma
// nebak dari data lokal, jadi bisa bentrok). Kalau itu terjadi, ID lokal
// HARUS disamakan dengan yang tersimpan di Sheets, supaya WO tetap tampil
// dengan benar di HTML — bukan nyangkut di ID lama yang sudah tidak valid.
function reconcileWOIdIfRenamed(sentId, finalId) {
  if (!finalId || finalId === sentId) return;
  const wo = WO.workorders.find(w => w.id === sentId);
  if (!wo) return;
  const oldId = wo.id;
  wo.id = finalId;
  addAudit(wo, 'note', `⚠ Nomor WO otomatis diubah karena bentrok: ${oldId} → ${finalId}`);
  saveLocal();
  toast(`⚠ WO ${oldId} diubah otomatis jadi ${finalId} (nomor bentrok dengan WO lain)`, 'warn');
  if (CURRENT_DETAIL_WO_ID === oldId) CURRENT_DETAIL_WO_ID = finalId;
  refreshAll();
  if (ST.page === 'wo-list') renderWOList();
  if (ST.page === 'detail' && CURRENT_DETAIL_WO_ID === finalId) showDetail(finalId);
}

// Tandai WO perlu di-sync (dipanggil setelah setiap perubahan)
function queueSyncWO(wo) {
  SYNC.queue['wo:' + wo.id] = { type: 'upsert_wo', data: woToRow(wo) };
  scheduleFlush();
}
function queueDeleteWO(id) {
  delete SYNC.queue['wo:' + id]; // batalkan upsert kalau ada
  SYNC.queue['del:' + id] = { type: 'delete_wo', id };
  scheduleFlush();
}
function queueSyncTech(tech) {
  if (!tech) return;
  SYNC.queue['tech:' + tech.id] = { type: 'upsert_tech', data: tech };
  scheduleFlush();
}

// Schedule flush dengan debounce
function scheduleFlush() {
  updateSyncBadge('pending');
  if (SYNC.timer) clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(flushQueue, SYNC.debounceMs);
}

// Proses semua item di queue — tiap item independen, supaya satu item
// yang terus gagal tidak menyandera item lain selamanya
async function flushQueue() {
  if (SYNC.inFlight || Object.keys(SYNC.queue).length === 0) return;
  SYNC.inFlight = true;
  updateSyncBadge('syncing');

  const batch = { ...SYNC.queue };
  SYNC.queue  = {};
  let anyFailed = false;

  try {
    for (const key of Object.keys(batch)) {
      const item = batch[key];
      try {
                if (item.type === 'upsert_wo') {
          const result = await _fetchSilent(apiBase(), { fn: 'upsert', sheet: 'WO_ORDERS', row: item.data });
          reconcileWOIdIfRenamed(item.data.id, result && result.id);
        } else if (item.type === 'delete_wo') {
          await _fetchSilent(apiBase(), { fn: 'delete', sheet: 'WO_ORDERS', id: item.id });
        } else if (item.type === 'upsert_tech') {
          await _fetchSilent(apiBase(), { fn: 'upsert', sheet: 'WO_TECHNICIANS', row: item.data });
        }
        // sukses — reset counter kegagalan item ini
        delete SYNC.failCounts[key];
      } catch (e) {
        anyFailed = true;
        const msg = e?.message || '';

        // Error auth (token kosong/expired) — coba refresh token secara
        // diam-diam dulu pakai kredensial yang sudah tersimpan di cache
        // lokal. Kalau berhasil, item dikembalikan ke antrean untuk dicoba
        // lagi otomatis dengan token baru (user tidak perlu login manual).
        // Hanya kalau refresh JUGA gagal, baru paksa logout.
        if (/token/i.test(msg)) {
          if (!SYNC._tokenRefreshInFlight) {
            SYNC._tokenRefreshInFlight = true;
            const refreshed = await refreshSessionToken();
            SYNC._tokenRefreshInFlight = false;
            if (refreshed) {
              SYNC.queue[key] = item;
              continue;
            }
          } else {
            // Refresh sedang diproses oleh item lain di batch ini —
            // masukkan lagi item ini, akan ikut dicoba di flush berikutnya
            SYNC.queue[key] = item;
            continue;
          }
          toast('⚠ Sesi login sudah tidak valid dan gagal diperbarui otomatis. Silakan login ulang.', 'error');
          setTimeout(() => { if (confirm('Sesi login expired. Login ulang sekarang?')) doLogout(); }, 300);
          continue;
        }

        const failCount = (SYNC.failCounts[key] || 0) + 1;
        SYNC.failCounts[key] = failCount;
        if (failCount >= 5) {
          // Item ini gagal berkali-kali (kemungkinan payload bermasalah).
          // Hentikan auto-retry item ini saja supaya tidak menyandera
          // item lain di queue selamanya, dan beri tahu user secara jelas
          // termasuk PESAN ERROR ASLI dari server supaya mudah didiagnosis.
          toast(`⚠ Gagal sync setelah ${failCount}x percobaan (${key}): ${msg || 'error tidak diketahui'}. Buka WO tersebut, edit sedikit, lalu simpan lagi.`, 'error');
        } else if (!(key in SYNC.queue)) {
          SYNC.queue[key] = item;
        }
      }
    }
    SYNC.online = !anyFailed;
    updateSyncBadge(anyFailed ? 'err' : 'ok');
  } finally {
    SYNC.inFlight = false;
    if (Object.keys(SYNC.queue).length > 0) {
      // Backoff bertingkat (8s, 13s, 20s, ... maks 60s) supaya tidak
      // terus membanjiri server yang sedang bermasalah
      SYNC._retryAttempt = anyFailed ? (SYNC._retryAttempt || 0) + 1 : 0;
      const delayMs = anyFailed
        ? Math.min(60000, 8000 * Math.pow(1.6, Math.min(SYNC._retryAttempt, 6)))
        : SYNC.debounceMs;
      if (SYNC.retryTimer) clearTimeout(SYNC.retryTimer);
      SYNC.retryTimer = setTimeout(flushQueue, delayMs);
    } else {
      SYNC._retryAttempt = 0;
    }
  }
}

// Update tampilan pill & status saat sync queue berjalan
function updateSyncBadge(state) {
  const pill    = document.getElementById('apiPill');
  const btn     = document.getElementById('syncBtn');
  const pending = Object.keys(SYNC.queue).length;

  if (state === 'pending') {
    // Jangan override pill saat sedang connecting ke API
    if (!PULL.inProgress) {
      pill.className   = 'api-pill warn';
      pill.textContent = '● ' + pending + ' pending';
    }
    setText('syncStatus', 'Ada perubahan belum tersimpan ke Sheets...');
  } else if (state === 'syncing') {
    if (!PULL.inProgress) {
      pill.className   = 'api-pill';
      pill.textContent = '↻ Syncing';
    }
    setText('syncStatus', 'Menyimpan ke Google Sheets...');
  } else if (state === 'ok') {
    // Hanya update pill jika API sudah connected (bukan sedang retry)
    if (!PULL.inProgress && PULL.retryCount === 0) {
      pill.className   = 'api-pill ok';
      pill.textContent = '✓ Tersimpan';
    }
    setText('syncStatus', 'Semua perubahan tersimpan · ' + new Date().toLocaleTimeString('id-ID'));
    if (btn) btn.disabled = false;
  } else if (state === 'err') {
    if (!PULL.inProgress) {
      pill.className   = 'api-pill err';
      pill.textContent = '✗ Retry...';
    }
    setText('syncStatus', 'Gagal sync, akan retry otomatis...');
  }
}

// Manual sync: cancel retry timer, flush queue, pull fresh
async function manualSync() {
  const btn = document.getElementById('syncBtn');
  if (btn) { btn.disabled = true; btn.style.animation = 'spin .7s linear infinite'; }

  // Batalkan retry otomatis yang sedang menunggu
  if (PULL.retryTimer) { clearTimeout(PULL.retryTimer); PULL.retryTimer = null; }
  PULL.inProgress  = false;
  PULL.retryCount  = 0;

  // Flush perubahan pending dulu
  if (SYNC.timer) { clearTimeout(SYNC.timer); SYNC.timer = null; }
  await flushQueue();

  // Pull data terbaru
  await pullAllFromAPI(false);

  if (btn) { btn.disabled = false; btn.style.animation = ''; }
}

// Internal: fire-and-forget fetch dengan timeout
async function _fetchSilent(url, body) {
  const controller = new AbortController();
  // Upsert/delete/write ke WO_ORDERS (terutama saat menutup/verifikasi WO
  // dengan checklist, foto, dan lampiran lengkap) bisa lebih lama diproses
  // GAS karena LockService + operasi sheet bulanan. 15 detik sering
  // keburu timeout padahal prosesnya masih jalan — dinaikkan jadi 45 detik
  // khusus untuk operasi tulis.
  const timeoutMs  = ['upsert','delete','write'].includes(body.fn) ? 45000 : 15000;
  const timeout    = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Auto-sisipkan token sesi untuk endpoint yang butuh requireAuth() di backend
    // (upsert/delete/write) — tanpa ini backend selalu menolak & sync macet "pending".
    const needsAuth  = ['upsert', 'delete', 'write'].includes(body.fn);
    const finalBody  = (needsAuth && !body.token)
      ? { ...body, token: SESSION?.token || '' }
      : body;
    const r = await fetch(url, {
      method:  'POST',
      mode:    'cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(finalBody),
      signal:  controller.signal,
    });
    const d = await r.json();
    if (!d.ok && !d.success) throw new Error(d.message || 'API error');
    return d;
  } finally {
    clearTimeout(timeout);
  }
}

// Sync semua WO (untuk manual full sync)
async function syncAllToSheets() {
  const rows = WO.workorders.map(w => woToRow(w));
  return _fetchSilent(CFG.apiUrl, { fn: 'write', data: { workorders: rows } });
}

function normalizeWOFromSheets(w) {
  if (!w) return w;
  function tryParseArr(val) {
  if (Array.isArray(val)) return val;
  if (!val || val === '') return [];
  const s = String(val).trim();
  if (!s) return [];
  // Format JSON array baru: [{"partId":"...","name":"...","qty":1}]
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p : [];
  } catch {}
  // Fallback format lama: "Bearing x2, Oil Filter x1"
  return s.split(',').map(item => {
    const m = item.trim().match(/^(.+?)\s+x(\d+)$/i);
    if (!m) return null;
    return { partId: '', name: m[1].trim(), qty: parseInt(m[2]) || 1, uom: 'pcs' };
  }).filter(Boolean);
}
  // Trim helper — hapus whitespace tersembunyi dari Sheets
  function t(val) { return (val || '').toString().trim(); }
  return {
    ...w,
    id:            t(w.id),
    title:         t(w.title),
    type:          t(w.type),
    status:        t(w.status)   || 'Open',
    priority:      t(w.priority) || 'Medium',
    equipId:       t(w.equipId),
    techId:        t(w.techId),
    techName:      t(w.techName),
    techIds:       t(w.techIds) ? t(w.techIds).split(',').filter(Boolean) : (t(w.techId) ? [t(w.techId)] : []),
    unitId:        t(w.unitId),
    areaId:        t(w.areaId),
    requestorName: t(w.requestorName),
    requestorDept: t(w.requestorDept),
    createdBy:     t(w.createdBy),
    createdAt:     t(w.createdAt),
    dueDate:       t(w.dueDate),
    notes:         t(w.notes),
    closingNote:   t(w.closingNote),
    estHours:      t(w.estHours),
    actualHours:   t(w.actualHours),
    startTime:     t(w.startTime),
    endTime:       t(w.endTime),
    checklist:     parseChecklistFromSheets(w.checklist),
    partsUsed:     tryParseArr(w.partsUsed),
    notesLog:      tryParseArr(w.notesLog),
    attachments:   parseAttachmentsFromSheets(w.attachments),
    photos: {
      before:       photosCellStrToArr(w.photosBefore),
      after:        photosCellStrToArr(w.photosAfter),
      verification: photosCellStrToArr(w.photosVerification),
    },
    checklistDone:  parseInt(w.checklistDone)  || 0,
    checklistTotal: parseInt(w.checklistTotal) || 0,
    partsCount:     parseInt(w.partsCount)     || 0,
  };
}

function woToRow(wo) {
  const checklistItems = (wo.checklist || []).map(c =>
    `[${c.done ? '✓' : ' '}] ${c.text}${c.note ? ' ::' + c.note : ''}`
  ).join(' | ');
  // Serialize notesLog sebagai ringkasan teks (max 500 char) untuk Sheets
  const notesLogSummary = (wo.notesLog || []).map(n => `[${n.ts}] ${n.author}: ${n.text}`).join('\n').substring(0, 1000);
  // Attachments: simpan nama + URL saja
  // HANYA File ID yang disimpan ke Sheets — format per item: fileId|name|type|size
  const attachList = (wo.attachments || []).map(a => `${a.id||''}|${a.name}|${a.type||'doc'}|${a.size||''}`).join(' ; ');

  return {
    id:             wo.id,
    title:          wo.title,
    type:           wo.type,
    status:         wo.status,
    priority:       wo.priority,
    equipId:        wo.equipId       || '',
    techId:         wo.techId        || '',
    techName:       getTechName(wo.techId) || '',
    techIds:        (wo.techIds||[]).join(','),
    techNames:      getTechNamesStr(wo),
    unitId:         wo.unitId        || '',
    areaId:         wo.areaId        || '',
    requestorName:  wo.requestorName || '',
    requestorDept:  wo.requestorDept || '',
    createdBy:      wo.createdBy     || '',
    createdAt:      wo.createdAt,
    dueDate:        wo.dueDate       || '',
    estHours:       wo.estHours      || 0,
    actualHours:    wo.actualHours   || 0,
    startTime:      wo.startTime     || '',
    endTime:        wo.endTime       || '',
    notes:          wo.notes         || '',
    closingNote:    wo.closingNote   || '',
    checklist:      checklistItems,
    checklistDone:  (wo.checklist  || []).filter(c => c.done).length,
    checklistTotal: (wo.checklist  || []).length,
    partsUsed:      JSON.stringify(wo.partsUsed || []),
    partsCount:     (wo.partsUsed  || []).length,
    notesLog:       notesLogSummary,
    attachments:    attachList,
    photosBefore:       photosArrToCellStr(wo.photos && wo.photos.before),
    photosAfter:        photosArrToCellStr(wo.photos && wo.photos.after),
    photosVerification: photosArrToCellStr(wo.photos && wo.photos.verification),
  };
}

// Bersihkan foto sebelum dikirim ke Sheets — buang entry pending/preview lokal
// supaya data mentah (base64 dataURL) tidak pernah tersimpan/terkirim ke server
function sanitizePhotosForSync(photos) {
  const p = photos || {};
  const clean = cat => (p[cat] || [])
    .filter(x => x && x.id && !x.pending)
    .map(x => ({ id: x.id, name: x.name, url: x.url, addedBy: x.addedBy, addedAt: x.addedAt }));
  return { before: clean('before'), after: clean('after'), verification: clean('verification') };
}

// Ubah array foto jadi string 1 sel berisi URL Drive utuh yang bisa langsung diklik
function photosArrToCellStr(arr) {
  return (arr || [])
    .filter(p => p && p.id && !p.pending)
    .map(p => `https://drive.google.com/file/d/${p.id}/view (${(p.name || p.id).replace(/[()]/g,'')})`)
    .join(' ; ');
}

// Parse balik — mendukung format URL baru DAN format lama (fileId|nama) untuk data lama
function photosCellStrToArr(str) {
  if (!str) return [];
  return String(str).split(';').map(item => {
    const s = item.trim();
    if (!s) return null;
    const urlMatch = s.match(/https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/);
    if (urlMatch) {
      const id = urlMatch[1];
      const nameMatch = s.match(/\(([^)]+)\)\s*$/);
      const name = nameMatch ? nameMatch[1] : id;
      return { id, name, url: getDriveUrl(id) };
    }
    // Fallback format lama: fileId|nama
    const parts = s.split('|');
    if (parts[0]) {
      const id = parts[0].trim();
      const name = (parts[1] || id).trim();
      return { id, name, url: getDriveUrl(id) };
    }
    return null;
  }).filter(Boolean);
}

// Backward-compat stubs (lama dipanggil langsung, sekarang pakai queue)
// Mirror ke WO_MIRROR DIHAPUS — sebelumnya setiap simpan WO melakukan
// 2x network call (WO_ORDERS + WO_MIRROR), menggandakan waktu submit
// dan closing WO. Kalau nanti butuh salinan data untuk monitoring,
// lakukan di sisi GAS (trigger onEdit/time-driven), bukan dobel call
// dari HTML.
function syncUpsertWO(wo)   { queueSyncWO(wo); }
function syncDeleteWO(id)   { queueDeleteWO(id); }
function syncUpsertTech(t)  { queueSyncTech(t); }

// ═══════════════════════════════════════════════════════════════
// HELPERS / BADGES
