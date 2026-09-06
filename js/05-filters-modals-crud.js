// ═══════════════════════════════════════════════════════════════
function filterWO(status) {
  ST.filterStatus = status; ST.filterType = ''; ST.filterPriority = '';
  navigateTo('wo-list');
  const el = document.getElementById('filterStatus'); if (el) el.value = status;
}
function filterByType(type) {
  ST.filterType = type; ST.filterStatus = ''; ST.filterPriority = '';
  navigateTo('wo-list');
  const el = document.getElementById('filterType'); if (el) el.value = type;
  renderWOList();
}
function filterByPriority(pri) {
  ST.filterPriority = pri; ST.filterStatus = ''; ST.filterType = '';
  navigateTo('wo-list');
  const el = document.getElementById('filterPriority'); if (el) el.value = pri;
  renderWOList();
}

// ═══════════════════════════════════════════════════════════════
// MODALS: OPEN / CLOSE
// ═══════════════════════════════════════════════════════════════
function openModal(type, id) {
  if (type === 'wo') {
    const wo = id ? WO.workorders.find(w => w.id === id) : null;
    document.getElementById('modal-wo-title').textContent = id ? '✏ Edit Work Order' : '+ Buat Work Order';
    document.getElementById('wo-id').value    = id || '';
    document.getElementById('wo-title').value = wo?.title    || '';
    document.getElementById('wo-type').value  = wo?.type     || 'Troubleshooting';
    document.getElementById('wo-priority').value  = wo?.priority || 'Medium';
    document.getElementById('wo-due').value   = wo?.dueDate  || '';
    document.getElementById('wo-est').value   = wo?.estHours || '';
    document.getElementById('wo-notes').value = wo?.notes    || '';
    // Requestor fields — auto-fill dari session jika buat baru
    document.getElementById('wo-requestor').value      = wo?.requestorName || (SESSION?.nama || '');
    document.getElementById('wo-requestor-dept').value = wo?.requestorDept || '';
    // Clear errors
    document.getElementById('e-wo-title').textContent     = '';
    document.getElementById('e-wo-unit').textContent      = '';
    document.getElementById('e-wo-area').textContent      = '';
    document.getElementById('e-wo-requestor').textContent = '';
    WO_BEFORE_FILES = [];
    const _bp = document.getElementById('wo-before-preview'); if (_bp) _bp.innerHTML = '';
    const _bi = document.getElementById('wo-before-photos'); if (_bi) _bi.value = '';

    // Pastikan EQUIP_DB sudah terisi — fetch jika masih kosong
    const _fillWODropdowns = () => {
      populateSel('wo-unit', EQUIP_DB.units||[], 'id', 'name', '— Pilih Unit —', wo?.unitId||'');
      if (wo?.unitId) {
        const areas = (EQUIP_DB.areas||[]).filter(a => a.unitId === wo.unitId);
        populateSel('wo-area', areas, 'id', 'name', '— Pilih Area —', wo?.areaId||'');
      } else {
        populateSel('wo-area', [], 'id', 'name', '— Pilih Unit dulu —', '');
      }
    };
    if (EQUIP_DB.units && EQUIP_DB.units.length > 0) {
      _fillWODropdowns();
    } else {
      // Data belum ada — fetch dari API lalu isi dropdown
      populateSel('wo-unit', [], 'id', 'name', '— Memuat data... —', '');
      fetch(CFG.equipDbApi + '?fn=read', { mode: 'cors', signal: AbortSignal.timeout(10000) })
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.data) {
            if (d.data.units)     EQUIP_DB.units     = d.data.units;
            if (d.data.areas)     EQUIP_DB.areas     = d.data.areas;
            if (d.data.equipment) EQUIP_DB.equipment = d.data.equipment;
            if (d.data.parts)     EQUIP_DB.parts     = d.data.parts;
            localStorage.setItem(CFG.equipDbKey, JSON.stringify(EQUIP_DB));
          }
          _fillWODropdowns();
        })
        .catch(() => {
          populateSel('wo-unit', [], 'id', 'name', '— Gagal memuat, coba lagi —', '');
        });
    }
    // Equipment: filter by areaId dulu, fallback unitId
    let _eq = EQUIP_DB.equipment || [];
    if (wo?.areaId) {
      const byArea = _eq.filter(e => e.areaId === wo.areaId);
      _eq = byArea.length ? byArea : _eq.filter(e => e.unitId === wo.unitId);
    } else if (wo?.unitId) {
      _eq = _eq.filter(e => e.unitId === wo.unitId);
    }
    populateSel('wo-equip', _eq, 'id', 'name', wo?.areaId ? '— Pilih Equipment (opsional) —' : '— Pilih Area dulu —', wo?.equipId||'');

    if (id && wo) {
      document.getElementById('wo-tag-preview').textContent = wo.id;
      document.getElementById('wo-tag').value = wo.id;
    } else {
      updateWOIdPreview();
    }
    document.getElementById('modal-wo').classList.add('open');
  }
  else if (type === 'tech') {
    const t = id ? WO.technicians.find(x => x.id === id) : null;
    document.getElementById('modal-tech-title').textContent = id ? '✏ Edit Technician' : '+ Add Technician';
    document.getElementById('tech-id').value     = id || '';
    document.getElementById('tech-tag').value    = id ? (t?.id || '') : ('TECH-' + String(WO.technicians.length + 1).padStart(3, '0'));
    document.getElementById('tech-name').value   = t?.name   || '';
    document.getElementById('tech-spec').value   = t?.spec   || 'Mechanical';
    document.getElementById('tech-shift').value  = t?.shift  || 'Shift 1';
    document.getElementById('tech-phone').value  = t?.phone  || '';
    document.getElementById('tech-status').value = t?.status || 'Active';
    document.getElementById('e-tech-name').textContent = '';
    document.getElementById('modal-tech').classList.add('open');
  }
  else if (type === 'checklist') {
    document.getElementById('cl-wo-id').value = id;
    document.getElementById('cl-text').value  = '';
    document.getElementById('cl-note').value  = '';
    document.getElementById('e-cl-text').textContent = '';
    document.getElementById('modal-checklist').classList.add('open');
  }
}

function closeModal(type, force) {
  if (type === 'wo' && !force) {
    const title = document.getElementById('wo-title')?.value?.trim();
    const editId = document.getElementById('wo-id')?.value;
    if (!editId && title) {
      if (!confirm('Form belum disimpan. Data akan hilang. Yakin tutup?')) return;
    }
  }
  document.getElementById('modal-' + type).classList.remove('open');
  if (type === 'note') {
    const ar = document.getElementById('assign-tech-row');
    if (ar) ar.style.display = 'none';
  }
}

function openAssignModal(woId) {
  if (SESSION?.role !== 'Maintenance') {
    toast('Hanya Maintenance yang dapat assign teknisi', 'error'); return;
  }
  // Open a small assign modal - reuse note modal with a special action
  document.getElementById('note-wo-id').value  = woId;
  document.getElementById('note-action').value = 'assign';
  document.getElementById('note-text').value   = '';
  document.getElementById('note-done-wrap').style.display = 'none';
  document.getElementById('modal-note-title').textContent = '👷 Assign Teknisi';
  document.getElementById('note-confirm-btn').textContent = 'ASSIGN';

  // Inject a tech picker inside modal body temporarily
  let assignRow = document.getElementById('assign-tech-row');
  if (!assignRow) {
    assignRow = document.createElement('div');
    assignRow.id = 'assign-tech-row';
    assignRow.className = 'fg';
    assignRow.style.marginBottom = '12px';
    assignRow.innerHTML = `<label class="flabel">Pilih Teknisi *</label>
      <select class="fsel2" id="assign-tech-id"><option value="">— Pilih Teknisi —</option></select>`;
    document.getElementById('note-done-wrap').parentNode.insertBefore(
      assignRow, document.getElementById('note-done-wrap'));
  }
  const sel = document.getElementById('assign-tech-id');
  sel.innerHTML = '<option value="">— Pilih Teknisi —</option>';
  const wo = WO.workorders.find(w => w.id === woId);
  WO.technicians.filter(t => t.status === 'Active').forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    if (wo && wo.techId === t.id) opt.selected = true;
    sel.appendChild(opt);
  });
  assignRow.style.display = '';
  document.getElementById('modal-note').classList.add('open');
}

function openNoteModal(woId, action) {
  const wo = WO.workorders.find(w => w.id === woId);
  document.getElementById('note-wo-id').value  = woId;
  document.getElementById('note-action').value = action;
  document.getElementById('note-text').value   = '';
  const isDone = action === 'done';
  const dw = document.getElementById('note-done-wrap');
  dw.style.display = isDone ? '' : 'none';
  document.getElementById('modal-note-title').textContent = isDone ? '✓ Selesaikan WO' : '📝 Tambah Catatan';
  document.getElementById('note-confirm-btn').textContent = isDone ? 'SELESAIKAN' : 'SIMPAN';

  if (isDone) {
    // Reset timeline fields
    document.getElementById('note-start-day').value  = '';
    document.getElementById('note-start-time').value = '';
    document.getElementById('note-end-day').value    = '';
    document.getElementById('note-end-time').value   = '';
    document.getElementById('note-duration').value   = '';
    document.getElementById('note-duration-calc').textContent = '';
    const _ap = document.getElementById('note-after-photos'); if (_ap) _ap.value = '';

    // Populate technician checkboxes (multi-select)
    const cbWrap = document.getElementById('note-tech-checkboxes');
    cbWrap.innerHTML = '';
    const preSelectedIds = (wo && wo.techIds && wo.techIds.length)
      ? wo.techIds
      : (wo && wo.techId ? [wo.techId] : []);
    WO.technicians.filter(t => t.status === 'Active').forEach(t => {
      const isChecked = preSelectedIds.includes(t.id);
      const div = document.createElement('label');
      div.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 10px;
        border-radius:7px;cursor:pointer;transition:background .12s;
        background:${isChecked ? 'rgba(74,158,63,.1)' : 'var(--bg2)'};
        border:1px solid ${isChecked ? 'rgba(74,158,63,.3)' : 'var(--border)'}`;
      div.innerHTML = `
        <input type="checkbox" value="${t.id}" ${isChecked ? 'checked' : ''}
          style="width:16px;height:16px;accent-color:var(--green);cursor:pointer;flex-shrink:0"
          onchange="onTechCheckboxChange(this,'${t.id}')"/>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500;color:var(--navy)">${esc(t.name)}</div>
          <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3);margin-top:1px">${esc(t.spec||'')} · ${esc(t.shift||'')}</div>
        </div>`;
      cbWrap.appendChild(div);
    });
    // Set hidden input dari default (CSV)
    document.getElementById('note-tech-id').value = preSelectedIds.join(',');

    // Auto-calculate duration on time change (use onchange to avoid stacking listeners)
    ['note-start-day','note-start-time','note-end-day','note-end-time'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onchange = calcTimelineDuration;
    });
  }
  document.getElementById('modal-note').classList.add('open');
}

function calcTimelineDuration() {
  const sd = document.getElementById('note-start-day').value;
  const st = document.getElementById('note-start-time').value;
  const ed = document.getElementById('note-end-day').value;
  const et = document.getElementById('note-end-time').value;
  const el = document.getElementById('note-duration-calc');
  if (!sd || !st || !ed || !et) { el.textContent = ''; return; }

  const startDt = new Date(`${sd}T${st}:00`);
  const endDt   = new Date(`${ed}T${et}:00`);

  if (isNaN(startDt) || isNaN(endDt)) { el.textContent = '⚠ Format tanggal/jam tidak valid'; return; }
  if (endDt <= startDt) {
    el.style.color = 'var(--red)';
    el.textContent = '⚠ Tanggal/jam selesai harus setelah mulai';
    document.getElementById('note-duration').value = '';
    return;
  }

  el.style.color = 'var(--teal)';
  const diffMs   = endDt - startDt;
  const diffMins = Math.round(diffMs / 60000);
  const days     = Math.floor(diffMins / (24 * 60));
  const hours    = Math.floor((diffMins % (24 * 60)) / 60);
  const mins     = diffMins % 60;
  const totalHours = (diffMs / 3600000).toFixed(2);

  let label = '→ Durasi: ';
  if (days > 0)   label += `${days} hari `;
  if (hours > 0)  label += `${hours} jam `;
  if (mins > 0)   label += `${mins} menit `;
  label += `(${totalHours} jam total)`;

  el.textContent = label;
  document.getElementById('note-duration').value = totalHours;
}

function confirmAction() {
  const woId     = document.getElementById('note-wo-id').value;
  const action   = document.getElementById('note-action').value;
  const noteText = document.getElementById('note-text').value.trim();
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;

  // ── Validasi wajib isi untuk aksi "done" ──
  if (action === 'done') {
    const startDayV  = document.getElementById('note-start-day').value;
    const startTimeV = document.getElementById('note-start-time').value;
    const endDayV    = document.getElementById('note-end-day').value;
    const endTimeV   = document.getElementById('note-end-time').value;
    const durationV  = parseFloat(document.getElementById('note-duration').value) || 0;
    const techIdsV   = (document.getElementById('note-tech-id').value || '').split(',').filter(Boolean);

    const missing = [];
    if (!startDayV)  missing.push('Tanggal Mulai');
    if (!startTimeV) missing.push('Jam Mulai');
    if (!endDayV)     missing.push('Tanggal Selesai');
    if (!endTimeV)    missing.push('Jam Selesai');
    if (!techIdsV.length) missing.push('Teknisi yang Menangani');
    if (durationV <= 0) missing.push('Durasi Aktual');

    if (missing.length) {
      toast('⚠ Lengkapi dulu: ' + missing.join(', '), 'error');
      return;
    }

    // Validasi tambahan: pastikan waktu selesai setelah waktu mulai
    const startDt = new Date(`${startDayV}T${startTimeV}:00`);
    const endDt   = new Date(`${endDayV}T${endTimeV}:00`);
    if (isNaN(startDt) || isNaN(endDt)) {
      toast('⚠ Format tanggal/jam tidak valid', 'error');
      return;
    }
    if (endDt <= startDt) {
      toast('⚠ Waktu selesai harus setelah waktu mulai', 'error');
      return;
    }
  }

  if (action === 'assign') {
    if (SESSION?.role !== 'Maintenance') { toast('Hanya Maintenance yang dapat assign teknisi', 'error'); closeModal('note'); return; }
    const techId = document.getElementById('assign-tech-id')?.value;
    if (!techId) { toast('Pilih teknisi dulu', 'error'); return; }
    const oldTech = wo.techId;
    wo.techId = techId;
    if (wo.status === 'Open') wo.status = 'In Progress';
    addAudit(wo, 'status', `${oldTech ? 'Re-assign' : 'Assigned'} → ${getTechName(techId)}`);
    // Hide assign row
    const ar = document.getElementById('assign-tech-row');
    if (ar) ar.style.display = 'none';
    saveLocal(); closeModal('note');
    toast('Teknisi berhasil di-assign', 'success');
    showDetail(woId); refreshAll(); syncUpsertWO(wo);
    return;
  }

  if (action === 'done') {
    const duration = parseFloat(document.getElementById('note-duration').value) || 0;
    const techIds  = (document.getElementById('note-tech-id').value || '').split(',').filter(Boolean);
    const startDay = document.getElementById('note-start-day').value;
    const startTime= document.getElementById('note-start-time').value;
    const endDay   = document.getElementById('note-end-day').value;
    const endTime  = document.getElementById('note-end-time').value;

    wo.actualHours = duration;
    if (techIds.length) {
      wo.techIds = techIds;
      wo.techId  = techIds[0]; // primary, untuk kompatibilitas tampilan lama
      const names = techIds.map(id => getTechName(id)).filter(Boolean).join(', ');
      addAudit(wo, 'status', `Teknisi yang menangani: ${names}`);
    }
    if (startDay && startTime) wo.startTime = `${fmtDate(startDay)} ${startTime}`;
    if (endDay   && endTime)   wo.endTime   = `${fmtDate(endDay)} ${endTime}`;

    let auditMsg = `Durasi aktual: ${duration} jam`;
    if (startDay && startTime) auditMsg += ` | Mulai: ${fmtDate(startDay)} ${startTime}`;
    if (endDay   && endTime)   auditMsg += ` | Selesai: ${fmtDate(endDay)} ${endTime}`;
    if (noteText) auditMsg += ` | Catatan: ${noteText}`;
    addAudit(wo, 'note', auditMsg);

    if (noteText) wo.closingNote = noteText;
    changeStatus(woId, 'Pending Verification', null);
    if (wo.equipId) pushRepairHistory(wo, noteText, duration);
    // Notif WA bahwa WO sudah selesai dikerjakan, menunggu verifikasi requestor
    sendWANotif('pending_verify', wo);
    const _afterInput = document.getElementById('note-after-photos');
    if (_afterInput && _afterInput.files.length) {
      uploadPhotoSet('After', woId, Array.from(_afterInput.files).slice(0,10)).then(() => {
        if (ST.page === 'detail' && CURRENT_DETAIL_WO_ID === woId) showDetail(woId);
      });
    }

  } else if (action === 'note') {
    changeStatus(woId, 'In Progress', null);
    if (noteText) {
      wo.notes = wo.notes ? wo.notes + '\n' + noteText : noteText;
      addAudit(wo, 'note', noteText);
    }
  } else {
    if (noteText) {
      wo.notes = wo.notes ? wo.notes + '\n' + noteText : noteText;
      addAudit(wo, 'note', noteText);
    }
  }

  saveLocal(); closeModal('note');
  toast('Tersimpan', 'success');
  showDetail(woId); refreshAll();
  syncUpsertWO(wo);
}

// ═══════════════════════════════════════════════════════════════
// SAVE / DELETE: WO
// ═══════════════════════════════════════════════════════════════
function saveWO() {
  const title         = document.getElementById('wo-title').value.trim();
  const unitId        = document.getElementById('wo-unit').value;
  const areaId        = document.getElementById('wo-area').value;
  const requestorName = document.getElementById('wo-requestor').value.trim();
  const editId        = document.getElementById('wo-id').value;

  // Validation
  let valid = true;
  if (!title) {
    document.getElementById('e-wo-title').textContent = 'Judul WO wajib diisi'; valid = false;
  } else { document.getElementById('e-wo-title').textContent = ''; }

  if (!requestorName) {
    document.getElementById('e-wo-requestor').textContent = 'Nama requestor wajib diisi'; valid = false;
  } else { document.getElementById('e-wo-requestor').textContent = ''; }

  if (!editId && !unitId) {
    document.getElementById('e-wo-unit').textContent = 'Unit wajib dipilih'; valid = false;
  } else { document.getElementById('e-wo-unit').textContent = ''; }

  if (!editId && !areaId) {
    document.getElementById('e-wo-area').textContent = 'Area wajib dipilih'; valid = false;
  } else { document.getElementById('e-wo-area').textContent = ''; }

  if (!valid) return;

  const equipId       = document.getElementById('wo-equip').value;
  const requestorDept = document.getElementById('wo-requestor-dept').value;
  const isNew         = !editId;
  let wo;

  if (editId) {
    wo = WO.workorders.find(w => w.id === editId);
    if (!wo) return;
    wo.title         = title;
    wo.type          = document.getElementById('wo-type').value;
    wo.priority      = document.getElementById('wo-priority').value;
    wo.equipId       = equipId;
    wo.dueDate       = document.getElementById('wo-due').value;
    wo.estHours      = parseFloat(document.getElementById('wo-est').value) || 0;
    wo.notes         = document.getElementById('wo-notes').value.trim();
    wo.requestorName = requestorName;
    wo.requestorDept = requestorDept;

    addAudit(wo, 'note', `WO diedit — Requestor: ${requestorName}${requestorDept ? ' ('+requestorDept+')' : ''}`);
    toast('WO diupdate', 'success');
  } else {
        const newId = generateWOId(unitId, areaId, equipId);
    wo = {
      id: newId, title,
      type:            document.getElementById('wo-type').value,
      status:          'Open',
      priority:        document.getElementById('wo-priority').value,
      equipId, techId: '', unitId, areaId,
      requestorName,
      requestorDept,
      createdBy:   SESSION?.userId || '',
      createdAt:   new Date().toISOString().split('T')[0],
      dueDate:     document.getElementById('wo-due').value,
      estHours:    parseFloat(document.getElementById('wo-est').value) || 0,
      actualHours: 0,
      notes:       document.getElementById('wo-notes').value.trim(),
      checklist: [], partsUsed: [], attachments: [], notesLog: [],
      audit: [{ ts: fmtTs(), type: 'create',
        msg: `WO dibuat oleh ${requestorName}${requestorDept ? ' ('+requestorDept+')' : ''}` }]
    };

    WO.workorders.push(wo);
    // Kirim notifikasi WA
    sendWANotif('new', wo);
    // Tampilkan ringkasan konfirmasi
    const unitName = (EQUIP_DB.units||[]).find(u=>u.id===wo.unitId)?.name || wo.unitId;
    const areaName = (EQUIP_DB.areas||[]).find(a=>a.id===wo.areaId)?.name || wo.areaId;
    toast(`✅ WO ${newId} dibuat!\n${wo.title}\n${unitName} › ${areaName}`, 'success');
    if (WO_BEFORE_FILES.length) {
      uploadPhotoSet('Before', wo.id, WO_BEFORE_FILES).then(() => {
        WO_BEFORE_FILES = [];
        if (ST.page === 'detail' && CURRENT_DETAIL_WO_ID === wo.id) showDetail(wo.id);
      });
    }
  }

  saveLocal(); closeModal('wo', true); refreshAll();
  syncUpsertWO(wo);
  // Hanya Admin & Maintenance yang auto-redirect ke detail
  // User biasa tetap di WO List — toast konfirmasi sudah cukup
  if (isNew && wo && SESSION && (SESSION.role === 'Admin' || SESSION.role === 'Maintenance')) {
    setTimeout(() => showDetail(wo.id), 300);
  }
}


// ── Copy WO ID to clipboard ──
function copyWOId(id, btn) {
  event.stopPropagation();
  navigator.clipboard.writeText(id).then(() => {
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '⎘'; btn.classList.remove('copied'); }, 1500);
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = id; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    btn.textContent = '✓'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '⎘'; btn.classList.remove('copied'); }, 1500);
  });
}

// ── Due date label with overdue/today highlight ──
function dueLabelHtml(dueDate, status) {
  if (!dueDate || status === 'Done' || status === 'Cancelled') {
    return dueDate ? `<span class="td-mono">${fmtDate(dueDate)}</span>` : '<span class="td-mono">—</span>';
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dueDate); due.setHours(0,0,0,0);
  const diff  = Math.round((due - today) / 86400000);
  if (diff < 0)  return `<span class="td-mono due-overdue">⚠ ${fmtDate(dueDate)}</span><br><span class="overdue-banner">${Math.abs(diff)} hari lewat</span>`;
  if (diff === 0) return `<span class="td-mono due-today">🔔 Hari Ini</span>`;
  if (diff <= 2)  return `<span class="td-mono due-today">${fmtDate(dueDate)}</span><br><span class="due-today-banner">${diff} hari lagi</span>`;
  return `<span class="td-mono">${fmtDate(dueDate)}</span>`;
}

// ── Quick status change dari table ──
function quickStatusChange(woId, newStatus) {
  event.stopPropagation();
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  const old = wo.status;
  wo.status = newStatus;
  addAudit(wo, 'status', `Status: ${old} → ${newStatus}`);
  saveLocal(); refreshAll(); syncUpsertWO(wo);
  toast(`WO ${woId}: ${old} → ${newStatus}`, 'success');
}

function generateWOId(unitId, areaId, equipId) {
  const unit  = (EQUIP_DB.units||[]).find(u => u.id === unitId);
  const area  = (EQUIP_DB.areas||[]).find(a => a.id === areaId);
  const equip = (EQUIP_DB.equipment||[]).find(e => e.id === equipId);
  const now   = new Date();
  const year  = now.getFullYear();
  const unitNameLC = (unit?.name || unitId || '').toLowerCase();
  const areaSlug = area ? area.name.replace(/\s+/g,'-').replace(/[^A-Za-z0-9\-]/g,'') : (areaId || 'NA');

  // ── Format khusus Unit Malang & Unit Lombok ──
  // UM/Area/Equipment/YYYY/MM/DD/seq (seq direset tiap bulan)
  // UL/Area/Equipment/YYYY/MM/DD/seq (seq direset tiap bulan)
  const isMalang = unitNameLC.includes('malang');
  const isLombok = unitNameLC.includes('lombok');
  if (isMalang || isLombok) {
    const prefix    = isMalang ? 'UM' : 'UL';
    const month     = String(now.getMonth() + 1).padStart(2, '0');
    const day       = String(now.getDate()).padStart(2, '0');
    const equipSlug = equip ? equip.name.replace(/\s+/g,'-').replace(/[^A-Za-z0-9\-]/g,'') : (equipId || 'NA');
    const existing = WO.workorders.filter(w => {
      if (!w.id) return false;
      const parts = w.id.split('/');
      return parts.length === 7 && parts[0] === prefix &&
        parts[3] === String(year) && parts[4] === month;
    });
    const seq = String(existing.length + 1).padStart(3, '0');
    return `${prefix}/${areaSlug}/${equipSlug}/${year}/${month}/${day}/${seq}`;
  }

  // ── Format default untuk unit lainnya (tidak berubah) ──
  const unitSlug = unit ? unit.id.replace(/[^A-Za-z0-9]/g,'') : (unitId || '').replace(/[^A-Za-z0-9]/g,'');
  const existing = WO.workorders.filter(w => {
    if (!w.id) return false;
    const parts = w.id.split('/');
    return parts.length === 4 && parts[0] === unitSlug && parseInt(parts[2]) === year;
  });
  const seq = String(existing.length + 1).padStart(3, '0');
  return `${unitSlug}/${areaSlug}/${year}/${seq}`;
}

function onWOUnitChange() {
  const unitId = document.getElementById('wo-unit').value;
  // Isi area hanya milik unit ini, kosongkan equipment
  const areas = unitId ? (EQUIP_DB.areas||[]).filter(a => a.unitId === unitId) : [];
  populateSel('wo-area',  areas, 'id', 'name', unitId ? '— Pilih Area —' : '— Pilih Unit dulu —', '');
  populateSel('wo-equip', [],    'id', 'name', '— Pilih Area dulu —', '');
  updateWOIdPreview();
}

// Dipanggil saat area berubah → isi equipment sesuai area
function onWOAreaChange() {
  const areaId = document.getElementById('wo-area').value;
  const unitId = document.getElementById('wo-unit').value;
  let eqList = EQUIP_DB.equipment || [];
  if (areaId) {
    // Filter by areaId jika equipment DB punya field areaId
    const byArea = eqList.filter(e => e.areaId === areaId);
    // Fallback: jika tidak ada yg match areaId, coba filter by unitId saja
    eqList = byArea.length ? byArea : eqList.filter(e => e.unitId === unitId);
  } else if (unitId) {
    eqList = eqList.filter(e => e.unitId === unitId);
  }
  populateSel('wo-equip', eqList, 'id', 'name', areaId ? '— Pilih Equipment (opsional) —' : '— Pilih Area dulu —', '');
  updateWOIdPreview();
}

function updateWOIdPreview() {
  const editId = document.getElementById('wo-id').value;
  if (editId) return;
  const unitId    = document.getElementById('wo-unit').value;
  const areaId    = document.getElementById('wo-area').value;
  const equipId   = document.getElementById('wo-equip')?.value || '';
  const previewEl = document.getElementById('wo-tag-preview');
  if (!previewEl) return;
  if (!unitId || !areaId) {
    previewEl.textContent = '— Pilih Unit & Area —';
    previewEl.style.color = 'var(--text3)';
    return;
  }
  const preview = generateWOId(unitId, areaId, equipId);
  previewEl.textContent = preview;
  previewEl.style.color = 'var(--accent)';
  document.getElementById('wo-tag').value = preview;
}

function deleteWO(id) {
  if (!confirm('Hapus Work Order ' + id + '?\n\nSemua data termasuk checklist dan parts akan dihapus.')) return;
  WO.workorders = WO.workorders.filter(w => w.id !== id);
  saveLocal(); refreshAll();
  toast('WO ' + id + ' dihapus', 'warn');
  if (ST.page === 'detail') navigateTo('wo-list');
  syncDeleteWO(id);
}

// ═══════════════════════════════════════════════════════════════
// SAVE / DELETE: TECHNICIAN
// ═══════════════════════════════════════════════════════════════
function saveTech() {
  const name = document.getElementById('tech-name').value.trim();
  if (!name) { document.getElementById('e-tech-name').textContent = 'Nama wajib diisi'; return; }
  document.getElementById('e-tech-name').textContent = '';
  const editId = document.getElementById('tech-id').value;
  const tagId  = document.getElementById('tech-tag').value;

  if (editId) {
    const t = WO.technicians.find(x => x.id === editId);
    if (t) {
      t.name = name; t.spec = document.getElementById('tech-spec').value;
      t.shift = document.getElementById('tech-shift').value;
      t.phone = document.getElementById('tech-phone').value.trim();
      t.status = document.getElementById('tech-status').value;
    }
    toast('Teknisi diupdate', 'success');
  } else {
    const newId = tagId || ('TECH-' + String(WO.technicians.length + 1).padStart(3, '0'));
    WO.technicians.push({ id:newId, name, spec:document.getElementById('tech-spec').value,
      shift:document.getElementById('tech-shift').value, phone:document.getElementById('tech-phone').value.trim(),
      status:document.getElementById('tech-status').value });
    toast('Teknisi ditambahkan', 'success');
  }
  saveLocal(); closeModal('tech'); renderTechnicians(); refreshCounts();
  syncUpsertTech(WO.technicians.find(t => t.name === name));
}

function deleteTech(id) {
  const inUse = WO.workorders.some(w => w.techId === id && ['Assigned','In Progress'].includes(w.status));
  if (inUse) { toast('Teknisi masih punya WO aktif, tidak bisa dihapus', 'error'); return; }
  if (!confirm('Hapus teknisi ini?')) return;
  WO.technicians = WO.technicians.filter(t => t.id !== id);
  saveLocal(); renderTechnicians(); refreshCounts();
  toast('Teknisi dihapus', 'warn');
}

// ═══════════════════════════════════════════════════════════════
// STATUS CHANGE
