// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PHOTO UPLOAD (Before / After / Verification)
// ═══════════════════════════════════════════════════════════════
function sanitizeFileToken(str) {
  return String(str||'').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'x';
}

function handleBeforePhotoSelect(event) {
  const files = Array.from(event.target.files).slice(0, 10);
  WO_BEFORE_FILES = files;
  const el = document.getElementById('wo-before-preview');
  if (!el) return;
  el.innerHTML = '';
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const div = document.createElement('div');
      div.className = 'photo-pending-item';
      div.innerHTML = `<img src="${e.target.result}" alt="${esc(file.name)}"/>`;
      el.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = e => res(e.target.result);
    reader.onerror = () => rej(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

async function handleGalleryPhotoUpload(event, woId, category) {
  const files = Array.from(event.target.files).slice(0, 10);
  event.target.value = '';
  if (!files.length) return;
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  await uploadPhotoSetOptimistic(categoryLabel, woId, files);
}

// ── Upload dengan preview instan: foto langsung terlihat begitu dipilih
//    (tersimpan ke localStorage dulu), baru diganti thumbnail asli setelah
//    selesai diupload ke Drive & disinkron ke Sheets ──
async function uploadPhotoSetOptimistic(category, woId, files) {
  if (!files || !files.length) return;
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  wo.photos = wo.photos || { before: [], after: [], verification: [] };
  const catKey = category.toLowerCase();
  if (!wo.photos[catKey]) wo.photos[catKey] = [];

  const uploaderName = sanitizeFileToken(SESSION?.nama || 'user');
  const idToken = sanitizeFileToken(woId);
  let seq = wo.photos[catKey].length;

  // ── FASE 1: preview lokal instan untuk semua file, simpan ke localStorage dulu ──
  const placeholders = [];
  for (const file of files) {
    let localPreview = '';
    try { localPreview = await readFileAsDataURL(file); } catch {}
    const tempId = 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const placeholder = {
      id: null, tempId, name: file.name, url: null,
      pending: true, localPreview,
      addedBy: SESSION?.nama || '—', addedAt: new Date().toISOString().split('T')[0],
    };
    wo.photos[catKey].push(placeholder);
    placeholders.push({ file, placeholder });
  }
  saveLocal(); // tersimpan lokal SEBELUM ada upload/sync ke server sama sekali
  if (ST.page === 'detail' && CURRENT_DETAIL_WO_ID === woId) {
    showDetail(woId);
    setTimeout(() => switchTab('photos', woId), 80);
  }

  // ── FASE 2: upload sungguhan ke Drive, satu per satu, ganti placeholder ──
  const failedFiles = [];
  for (const { file, placeholder } of placeholders) {
    seq++;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${category}-${idToken}-${uploaderName}-${String(seq).padStart(3,'0')}.${ext}`;
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = e => res(e.target.result.split(',')[1]);
        reader.onerror = () => rej(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });
      const resp = await fetch(CFG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          fn: 'upload_attachment', woId, fileName,
          mimeType: file.type || 'image/jpeg', base64Data: base64,
        }),
      });
      const result = await resp.json();
      const idx = wo.photos[catKey].findIndex(p => p.tempId === placeholder.tempId);
      if (result.ok) {
        if (idx > -1) {
          wo.photos[catKey][idx] = {
            id: result.fileId, name: fileName, url: result.url,
            addedBy: placeholder.addedBy, addedAt: placeholder.addedAt,
          };
        }
      } else {
        if (idx > -1) wo.photos[catKey].splice(idx, 1);
        failedFiles.push(fileName + ': ' + (result.message || 'gagal'));
      }
    } catch(e) {
      const idx = wo.photos[catKey].findIndex(p => p.tempId === placeholder.tempId);
      if (idx > -1) wo.photos[catKey].splice(idx, 1);
      failedFiles.push(file.name + ': ' + e.message);
    }
    saveLocal();
    if (ST.page === 'detail' && CURRENT_DETAIL_WO_ID === woId) {
      showDetail(woId);
      setTimeout(() => switchTab('photos', woId), 80);
    }
  }

  // ── FASE 3: baru sync final ke Google Sheets ──
  if (SYNC.timer) { clearTimeout(SYNC.timer); SYNC.timer = null; }
  syncUpsertWO(wo);
  await flushQueue();

  const successCount = files.length - failedFiles.length;
  if (successCount > 0) toast(`${successCount} foto ${category} berhasil diupload`, 'success');
  if (failedFiles.length > 0) toast(`⚠ ${failedFiles.length} foto gagal diupload:\n${failedFiles.slice(0,3).join('\n')}`, 'error');
}

// ── Ganti foto yang sudah ada (klik tombol 🔄 di thumbnail) ──
function triggerPhotoReplace(woId, category, idx) {
  const input = document.getElementById(`photo-replace-${category}-${woId}`);
  if (!input) return;
  input.dataset.replaceIdx = idx;
  input.click();
}

async function handleGalleryPhotoReplace(event, woId, category) {
  const idx = parseInt(event.target.dataset.replaceIdx);
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || isNaN(idx)) return;

  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  const catKey = category.toLowerCase();
  const list = wo.photos && wo.photos[catKey];
  if (!list || !list[idx]) return;

  const oldFileId = list[idx].id;

  // ── Preview instan di posisi yang sama ──
  let localPreview = '';
  try { localPreview = await readFileAsDataURL(file); } catch {}
  const tempId = 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  list[idx] = {
    id: null, tempId, name: file.name, url: null,
    pending: true, localPreview,
    addedBy: SESSION?.nama || '—', addedAt: new Date().toISOString().split('T')[0],
  };
  saveLocal();
  if (ST.page === 'detail' && CURRENT_DETAIL_WO_ID === woId) {
    showDetail(woId);
    setTimeout(() => switchTab('photos', woId), 80);
  }

  // ── Upload file baru ke Drive ──
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const uploaderName = sanitizeFileToken(SESSION?.nama || 'user');
  const idToken = sanitizeFileToken(woId);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `${categoryLabel}-${idToken}-${uploaderName}-REPLACE-${Date.now()}.${ext}`;

  try {
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = e => res(e.target.result.split(',')[1]);
      reader.onerror = () => rej(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });
    const resp = await fetch(CFG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        fn: 'upload_attachment', woId, fileName,
        mimeType: file.type || 'image/jpeg', base64Data: base64,
      }),
    });
    const result = await resp.json();
    const curIdx = list.findIndex(p => p.tempId === tempId);
    if (result.ok) {
      if (curIdx > -1) {
        list[curIdx] = {
          id: result.fileId, name: fileName, url: result.url,
          addedBy: SESSION?.nama || '—', addedAt: new Date().toISOString().split('T')[0],
        };
      }
      toast('✅ Foto berhasil diganti', 'success');
      if (oldFileId) {
        _fetchSilent(CFG.apiUrl, { fn: 'delete_attachment', fileId: oldFileId }).catch(() => {});
      }
    } else {
      if (curIdx > -1) list.splice(curIdx, 1);
      toast('❌ Gagal mengganti foto: ' + (result.message || 'error'), 'error');
    }
  } catch(e) {
    const curIdx = list.findIndex(p => p.tempId === tempId);
    if (curIdx > -1) list.splice(curIdx, 1);
    toast('❌ Gagal mengganti foto: ' + e.message, 'error');
  }

  saveLocal();
  if (SYNC.timer) { clearTimeout(SYNC.timer); SYNC.timer = null; }
  syncUpsertWO(wo);
  await flushQueue();
  if (ST.page === 'detail' && CURRENT_DETAIL_WO_ID === woId) {
    showDetail(woId);
    setTimeout(() => switchTab('photos', woId), 80);
  }
}

async function uploadPhotoSet(category, woId, files) {  
  if (!files || !files.length) return;
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  wo.photos = wo.photos || { before: [], after: [], verification: [] };
  const catKey = category.toLowerCase();
  if (!wo.photos[catKey]) wo.photos[catKey] = [];
  const uploaderName = sanitizeFileToken(SESSION?.nama || 'user');
  const idToken = sanitizeFileToken(woId);
  let seq = wo.photos[catKey].length;
  const failedFiles = [];

  for (const file of files) {
    seq++;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${category}-${idToken}-${uploaderName}-${String(seq).padStart(3,'0')}.${ext}`;
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = e => res(e.target.result.split(',')[1]);
        reader.onerror = () => rej(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });
      const resp = await fetch(CFG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          fn: 'upload_attachment', woId, fileName,
          mimeType: file.type || 'image/jpeg', base64Data: base64,
        }),
      });
      const result = await resp.json();
      if (result.ok) {
        wo.photos[catKey].push({
          id: result.fileId, name: fileName, url: result.url,
          addedBy: SESSION?.nama || '—', addedAt: new Date().toISOString().split('T')[0],
        });
      } else {
        failedFiles.push(fileName + ': ' + (result.message || 'gagal'));
        console.warn('Upload foto gagal:', fileName, result.message);
      }
    } catch(e) {
      failedFiles.push(fileName + ': ' + e.message);
      console.warn('Upload foto error:', fileName, e.message);
    }
  }
  saveLocal();
  syncUpsertWO(wo);
  const successCount = files.length - failedFiles.length;
  if (successCount > 0) {
    toast(`${successCount} foto ${category} berhasil diupload`, 'success');
  }
  if (failedFiles.length > 0) {
    toast(`⚠ ${failedFiles.length} foto gagal diupload:\n${failedFiles.slice(0,3).join('\n')}`, 'error');
  }
}

function photoGalleryHtml(wo, category, label) {
  const list = (wo.photos && wo.photos[category]) || [];
  const inputId = `photo-upload-${category}-${wo.id}`;
  const replaceInputId = `photo-replace-${category}-${wo.id}`;
  return `<div style="margin-bottom:18px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">${esc(label)} (${list.length})</div>
      <label for="${inputId}" style="font-size:11px;color:var(--accent);cursor:pointer;font-family:'IBM Plex Mono',monospace;border:1px solid var(--border);padding:3px 9px;border-radius:5px;transition:all .12s"
        onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--green-light)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.background='none'">
        ＋ Upload
      </label>
      <input type="file" id="${inputId}" accept="image/jpeg,image/jpg,image/png,image/webp" multiple style="display:none"
        onchange="handleGalleryPhotoUpload(event,'${wo.id}','${category}')"/>
    </div>
    <input type="file" id="${replaceInputId}" accept="image/jpeg,image/jpg,image/png,image/webp" style="display:none"
      onchange="handleGalleryPhotoReplace(event,'${wo.id}','${category}')"/>
    ${list.length ? `<div class="photo-thumb-grid">${list.map((p,i) => {
      const clickAttr = p.pending ? '' : `onclick="openPhotoViewer('${category}',${i})"`;
      const imgTag = p.pending
        ? `<img src="${p.localPreview||''}" loading="lazy" alt="${esc(p.name||'')}"/>`
        : `<img src="" loading="lazy" alt="${esc(p.name||'')}" data-fid="${p.id||''}" class="ph-lazy"/>`;
      return `
      <div class="photo-thumb" ${clickAttr}>
        ${imgTag}
        ${p.pending ? `
          <div style="position:absolute;inset:0;background:rgba(26,58,107,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
            <div class="spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div>
            <div style="font-size:9px;color:#fff;font-family:'IBM Plex Mono',monospace">Mengupload...</div>
          </div>` : `
          <button class="photo-replace-btn" title="Ganti foto ini" data-photo-idx="${i}"
            onclick="event.stopPropagation();triggerPhotoReplace('${wo.id}','${category}',${i})"
            style="position:absolute;top:3px;right:3px;background:rgba(26,58,107,.75);border:none;color:#fff;
              width:22px;height:22px;border-radius:5px;cursor:pointer;font-size:11px;display:flex;
              align-items:center;justify-content:center;opacity:0;transition:opacity .15s">🔄</button>`}
      </div>`;
    }).join('')}</div>`
      : '<div style="font-size:11px;color:var(--text3)">Belum ada foto.</div>'}
  </div>`;
}

function openPhotoViewer(category, idx) {
  const wo = WO.workorders.find(w => w.id === CURRENT_DETAIL_WO_ID);
  if (!wo || !wo.photos) return;
  const fullList = wo.photos[category] || [];
  if (!fullList.length) return;
  // Hanya sertakan foto yang sudah selesai diupload — bukan preview lokal
  const list = fullList.filter(p => p && p.id && !p.pending);
  if (!list.length) return;
  const clickedItem = fullList[idx];
  const newIdx = Math.max(0, list.findIndex(p => p === clickedItem));
  PV_STATE = { list, idx: newIdx, zoomed: false, category };
  renderPV();
  document.getElementById('modal-photo-viewer').classList.add('open');
}
async function renderPV() {
  const item = PV_STATE.list[PV_STATE.idx];
  if (!item) return;
  const imgEl = document.getElementById('pv-img');
  imgEl.src = IMG_CACHE[item.id] || '';
  imgEl.style.transform = 'scale(1)';
  imgEl.style.cursor = 'zoom-in';
  document.getElementById('pv-title').textContent = item.name || 'Foto';
  document.getElementById('pv-counter').textContent = `${PV_STATE.idx+1} / ${PV_STATE.list.length}`;
  const dl = document.getElementById('pv-download');
  dl.href = item.url;
  dl.setAttribute('download', item.name || 'photo.jpg');
  PV_STATE.zoomed = false;
  if (item.id && !IMG_CACHE[item.id]) {
    const uri = await loadImageDataURI(item.id);
    if (PV_STATE.list[PV_STATE.idx] === item) imgEl.src = uri || item.url;
  }
}
function pvNav(dir) {
  if (!PV_STATE.list.length) return;
  PV_STATE.idx = (PV_STATE.idx + dir + PV_STATE.list.length) % PV_STATE.list.length;
  renderPV();
}
function pvToggleZoom() {
  PV_STATE.zoomed = !PV_STATE.zoomed;
  const img = document.getElementById('pv-img');
  img.style.transform = PV_STATE.zoomed ? 'scale(1.8)' : 'scale(1)';
  img.style.cursor = PV_STATE.zoomed ? 'zoom-out' : 'zoom-in';
}
function closePhotoViewer() {
  document.getElementById('modal-photo-viewer').classList.remove('open');
}





async function handleAttachment(event, woId) {
  const file = event.target.files[0];
  if (!file) return;
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;

  // Reset input agar bisa upload file yang sama lagi nanti
  event.target.value = '';

  // Cek ukuran file max 25MB (video butuh lebih besar; Apps Script punya batas ~50MB per request termasuk overhead base64)
  const maxSize = file.type.startsWith('video') ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.size > maxSize) {
    const maxLabel = file.type.startsWith('video') ? '25MB' : '8MB';
    toast('File terlalu besar (max ' + maxLabel + ')', 'error'); return;
  }

  const size = file.size > 1024*1024
    ? (file.size/1024/1024).toFixed(1) + ' MB'
    : (file.size/1024).toFixed(0) + ' KB';

  // Tampilkan progress bar
  const progressBar  = document.getElementById('upload-progress-bar');
  const progressFill = document.getElementById('upload-progress-fill');
  if (progressBar)  { progressBar.style.display = 'block'; }
  if (progressFill) { progressFill.style.width  = '20%'; }

  // Disable tombol upload sementara
  const uploadBtn = document.getElementById('attach-upload-btn');
  if (uploadBtn) uploadBtn.style.opacity = '0.4';

  toast('⏫ Mengupload ' + file.name + ' ke Google Drive...', 'info');

  try {
    // Baca file sebagai base64
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = e => res(e.target.result.split(',')[1]);
      reader.onerror = () => rej(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });

    if (progressFill) progressFill.style.width = '60%';

    const controller = new AbortController();
    // Video butuh waktu lebih lama untuk upload — timeout 3 menit, file lain tetap 60 detik
    const timeoutMs = file.type.startsWith('video') ? 180000 : 60000;
    const timeout    = setTimeout(() => controller.abort(), timeoutMs);
    let result;
    try {
     
      const resp = await fetch(CFG.apiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' }, 
        body:    JSON.stringify({
          fn:         'upload_attachment',
          woId:       woId,
          fileName:   file.name,
          mimeType:   file.type || 'application/octet-stream',
          base64Data: base64,
        }),
        signal: controller.signal,
      });
      result = await resp.json();
    } finally {
      clearTimeout(timeout);
    }

    if (!result.ok) throw new Error(result.message || 'Upload gagal');

    if (progressFill) progressFill.style.width = '100%';

    // Simpan metadata ke WO — HANYA File ID yang disimpan (bukan URL Drive)
    // Preview/Download/Open dibentuk on-the-fly via getDriveUrl()/getThumbnail()/getDownloadUrl()
    wo.attachments = wo.attachments || [];
    wo.attachments.push({
      id:      result.fileId,
      name:    file.name,
      mime:    file.type || 'application/octet-stream',
      type:    file.type.startsWith('image') ? 'image'
              : file.type.startsWith('video') ? 'video'
              : file.type === 'application/pdf' ? 'pdf'
              : 'doc',
      size,
      addedAt: new Date().toISOString().split('T')[0],
      addedBy: SESSION?.nama || '—',
    });

    addAudit(wo, 'note', `Lampiran ditambahkan: ${file.name} (${size})`);
    saveLocal(); syncUpsertWO(wo);

    setTimeout(() => {
      if (progressBar) progressBar.style.display = 'none';
      if (uploadBtn)   uploadBtn.style.opacity   = '1';
      showDetail(woId);
      toast('✅ ' + file.name + ' berhasil diupload ke Drive', 'success');
    }, 500);

  } catch (e) {
    if (progressBar)  progressBar.style.display = 'none';
    if (uploadBtn)    uploadBtn.style.opacity   = '1';
    toast('❌ Upload gagal: ' + e.message, 'error');
    console.error('Attachment upload error:', e);
  }
}

async function deleteAttachmentFile(woId, fileId, fileName) {
  if (!confirm('Hapus lampiran "' + fileName + '"?')) return;
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;

 
  wo.attachments = (wo.attachments||[]).filter(a => a.id !== fileId);
  addAudit(wo, 'note', `Lampiran dihapus: ${fileName}`);
  saveLocal(); showDetail(woId); syncUpsertWO(wo);
  toast('Lampiran dihapus', 'warn');


  if (fileId) {
    try {
      await _fetchSilent(CFG.apiUrl, { fn: 'delete_attachment', fileId });
    } catch(e) {
      console.warn('Gagal hapus dari Drive:', e.message);
    }
  }
}

// Alias untuk onclick handler di HTML
function deleteAttachment(woId, fileId, fileName) {
  deleteAttachmentFile(woId, fileId, fileName);
}

// ═══════════════════════════════════════════════════════════════
// CATATAN LAPANGAN — Notes Log
