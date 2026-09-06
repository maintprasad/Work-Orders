// ═══════════════════════════════════════════════════════════════
function verifyAndClosWO(woId) {
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  const isRequestor = SESSION && (SESSION.nama === wo.requestorName || SESSION.userId === wo.createdBy);
  if (!isRequestor) { toast('Hanya requestor WO yang bisa memverifikasi', 'error'); return; }
  openVerifyPhotoPicker(woId);
}

function openVerifyPhotoPicker(woId) {
  let input = document.getElementById('verify-photo-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file'; input.id = 'verify-photo-input'; input.multiple = true;
    input.accept = 'image/jpeg,image/jpg,image/png,image/webp';
    input.style.display = 'none';
    document.body.appendChild(input);
  }
  input.value = '';
  input.onchange = async function() {
    const files = Array.from(input.files).slice(0, 10);
    if (!files.length) { toast('Pilih minimal 1 foto verifikasi', 'error'); return; }
    const wo = WO.workorders.find(w => w.id === woId);
    if (!wo) return;
    if (!confirm(`Verifikasi bahwa pekerjaan pada WO "${wo.title}" sudah selesai dan sesuai?`)) return;
    wo.status = 'Done';
    addAudit(wo, 'status', `Diverifikasi & ditutup oleh requestor: ${SESSION.nama}`);
    saveLocal(); showDetail(woId); refreshAll();
    toast('✅ WO telah diverifikasi dan ditutup', 'success');
    sendWANotif('done', wo);
    // Upload foto verification DULU sampai selesai, baru sync WO — supaya data foto lengkap saat dikirim ke Sheets
        await uploadPhotoSet('Verification', woId, files);
    // Force flush langsung (bypass debounce) supaya tidak ada race dengan panggilan sync lain
    if (SYNC.timer) { clearTimeout(SYNC.timer); SYNC.timer = null; }
    syncUpsertWO(wo);
    await flushQueue();
    if (ST.page === 'detail' && CURRENT_DETAIL_WO_ID === woId) showDetail(woId);
  };
  input.click();
}

function openRejectModal(woId) {
  const reason = prompt('Alasan penolakan verifikasi WO ini:');
  if (reason === null) return;
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  if (!confirm('Yakin tolak WO ini dan kembalikan ke teknisi?')) return;
  wo.rejectReason = reason.trim();
  wo.status = 'Rejected';
  addAudit(wo, 'status', `Ditolak oleh requestor: ${SESSION?.nama||'—'}${reason ? ' — ' + reason : ''}`);
  saveLocal(); showDetail(woId); refreshAll();
  toast('WO ditolak, dikembalikan ke teknisi', 'warn');
  syncUpsertWO(wo);
}

function changeStatus(woId, newStatus, noteType) {
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  if (newStatus === 'Pending Verification' && noteType === 'done') { openNoteModal(woId, 'done'); return; }
  if (newStatus === 'Cancelled'            && noteType === 'note') { openNoteModal(woId, 'note'); return; }
  const old = wo.status;
  wo.status = newStatus;
  addAudit(wo, 'status', `Status ${old} → ${newStatus}`);
  saveLocal(); showDetail(woId); refreshAll();
  toast('Status WO → ' + newStatus, newStatus === 'Done' ? 'success' : 'info');
  syncUpsertWO(wo);
}

// ═══════════════════════════════════════════════════════════════
// CHECKLIST
// ═══════════════════════════════════════════════════════════════
function quickAddChecklist(woId) {
  const el   = document.getElementById('quick-cl-' + woId);
  const text = el?.value.trim();
  if (!text) return;
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  wo.checklist.push({ id: 'cl-' + Date.now(), text, note: '', done: false });
  addAudit(wo, 'checklist', `Task ditambahkan: "${text}"`);
  saveLocal(); el.value = ''; showDetail(woId); syncUpsertWO(wo);
}

function saveChecklist() {
  const woId = document.getElementById('cl-wo-id').value;
  const text = document.getElementById('cl-text').value.trim();
  if (!text) { document.getElementById('e-cl-text').textContent = 'Deskripsi task wajib diisi'; return; }
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  wo.checklist.push({ id: 'cl-' + Date.now(), text, note: document.getElementById('cl-note').value.trim(), done: false });
  addAudit(wo, 'checklist', `Task ditambahkan: "${text}"`);
  saveLocal(); closeModal('checklist'); showDetail(woId); syncUpsertWO(wo);
}

function toggleChecklist(woId, clId) {
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  const ci = wo.checklist.find(c => c.id === clId);
  if (!ci) return;
  ci.done = !ci.done;
  addAudit(wo, 'checklist', `Task "${ci.text}" ${ci.done ? 'selesai ✓' : 'dibuka kembali'}`);
  if (ci.done && wo.checklist.every(c => c.done) && wo.status === 'In Progress') {
    toast('Semua task selesai! Tandai WO sebagai Done?', 'warn');
  }
  saveLocal(); showDetail(woId); refreshAll(); syncUpsertWO(wo);
}

function deleteChecklist(woId, clId) {
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  const ci = wo.checklist.find(c => c.id === clId);
  wo.checklist = wo.checklist.filter(c => c.id !== clId);
  if (ci) addAudit(wo, 'checklist', `Task dihapus: "${ci.text}"`);
  saveLocal(); showDetail(woId); syncUpsertWO(wo);
}

// ═══════════════════════════════════════════════════════════════
// PARTS PICKER
