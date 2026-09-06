// ═══════════════════════════════════════════════════════════════
function showDetail(woId) {
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  CURRENT_DETAIL_WO_ID = woId;
  navigateTo('detail');

  const STATUS_FLOW = ['Open', 'Pending Verification', 'Done'];
  const curIdx = STATUS_FLOW.indexOf(wo.status);
  const pColor = {Critical:'var(--red)',High:'var(--orange)',Medium:'var(--accent)',Low:'var(--text3)'};

  const doneCount  = wo.checklist?.filter(c => c.done).length || 0;
  const totalCount = wo.checklist?.length || 0;
  const pct        = totalCount ? Math.round(doneCount / totalCount * 100) : 0;
  const equip      = getEquipName(wo.equipId);
  const tech       = getTechNamesStr(wo);
  const reqName    = wo.requestorName || '—';
  const reqDept    = wo.requestorDept || '';

  const sfHtml = STATUS_FLOW.map((s, i) => {
    let cls = '';
    if (i < curIdx)  cls = 'done-step';
    if (i === curIdx) cls = 'current-step';
    return (i > 0 ? '<span class="sf-arrow">›</span>' : '') +
      `<span class="sf-step ${cls}">${i < curIdx ? '✓ ' : ''}${s}</span>`;
  }).join('');

  const actionBtns = (() => {
    const s    = wo.status;
    const role = SESSION?.role;
    const canClose = role === 'Admin' || role === 'Maintenance';
    const canMarkDone = role === 'Maintenance' || role === 'Admin';
    let primary = '';
    let danger  = '';
    if (s === 'Open' && canMarkDone)
      primary = `<button class="btn-action-primary" onclick="changeStatus('${woId}','Pending Verification','done')">✅ Tandai Selesai</button>`;
    if (s === 'Pending Verification') {
      const isRequestor = SESSION && (SESSION.nama === wo.requestorName || SESSION.userId === wo.createdBy);
      if (isRequestor) {
        primary = `<div style="background:rgba(74,158,63,.08);border:1px solid rgba(74,158,63,.25);border-radius:8px;padding:12px 16px;margin-bottom:4px">
          <div style="font-size:12px;color:var(--text2);margin-bottom:10px">⏳ Teknisi telah menyelesaikan WO ini. Silakan verifikasi pekerjaan sebelum menutup.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-action-primary" onclick="verifyAndClosWO('${woId}')">✔ Verifikasi & Tutup WO</button>
            <button class="btn-action-danger" onclick="openRejectModal('${woId}')">✕ Tolak Pekerjaan</button>
          </div>
        </div>`;
      } else {
        primary = `<div style="background:rgba(251,140,58,.07);border:1px solid rgba(251,140,58,.2);border-radius:8px;padding:12px 16px">
          <div style="font-size:12px;color:#c07020;font-weight:600;margin-bottom:4px">⏳ Menunggu Verifikasi Requestor</div>
          <div style="font-size:11px;color:var(--text3)">Menunggu konfirmasi dari <strong>${esc(wo.requestorName||'—')}</strong> untuk menutup WO ini.</div>
        </div>`;
      }
    }
    if (s === 'Rejected') {
      primary = `<div style="background:rgba(192,57,43,.07);border:1px solid rgba(192,57,43,.2);border-radius:8px;padding:12px 16px;margin-bottom:4px">
        <div style="font-size:12px;color:var(--red);font-weight:600;margin-bottom:4px">❌ Ditolak oleh Requestor</div>
        ${wo.rejectReason ? `<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Alasan: "${esc(wo.rejectReason)}"</div>` : ''}
        ${canMarkDone ? `<button class="btn-action-primary" onclick="changeStatus('${woId}','In Progress',null)">↺ Lanjutkan Pengerjaan</button>` : `<div style="font-size:11px;color:var(--text3)">Menunggu teknisi melanjutkan pengerjaan.</div>`}
      </div>`;
    }
    if (s !== 'Done' && s !== 'Cancelled' && s !== 'Pending Verification' && s !== 'Rejected' && canClose)
      danger = `<button class="btn-action-danger" onclick="changeStatus('${woId}','Cancelled','note')">✕ Batalkan WO</button>`;
    if (s === 'Pending Verification' && canClose)
      danger = `<button class="btn-action-danger" onclick="changeStatus('${woId}','Cancelled','note')">✕ Batalkan WO</button>`;
    if (s === 'Done' || s === 'Cancelled')
      primary = `<span style="font-size:12px;color:var(--text3);font-family:'IBM Plex Mono',monospace;padding:8px 0;display:block">WO telah ${s === 'Done' ? '✅ ditutup (Closed)' : '❌ dibatalkan'}</span>`;
    return primary + danger;
  })();

  const clHtml = (wo.checklist||[]).map(ci => `
    <div class="checklist-item" ${SESSION?.role !== 'User' ? `onclick="toggleChecklist('${woId}','${ci.id}')"` : ''} style="${SESSION?.role === 'User' ? 'cursor:default' : ''}">
      <div class="ci-cb ${ci.done ? 'checked' : ''}"></div>
      <div style="flex:1">
        <div class="ci-text ${ci.done ? 'checked' : ''}">${esc(ci.text)}</div>
        ${ci.note ? `<div class="ci-note">${esc(ci.note)}</div>` : ''}
      </div>
      ${SESSION?.role !== 'User' ? `<button class="btn-icon del" onclick="event.stopPropagation();deleteChecklist('${woId}','${ci.id}')"
  title="Hapus" style="width:22px;height:22px;font-size:11px">✕</button>` : ''}
    </div>`).join('');

  const puHtml = (wo.partsUsed||[]).length === 0
    ? '<div style="font-size:12px;color:var(--text3);padding:8px 0">Belum ada spare part yang digunakan.</div>'
    : `<div class="parts-used-list">${(wo.partsUsed||[]).map(pu => `
        <div class="pu-item">
          <div><div class="pu-name">${esc(pu.name)}</div><div class="pu-code">${esc(pu.partId)}</div></div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="pu-qty">×${pu.qty}</span>
            <button class="btn-icon del" onclick="removePart('${woId}','${pu.partId}')" style="width:22px;height:22px;font-size:11px">✕</button>
          </div>
        </div>`).join('')}</div>`;

  const auHtml = (wo.audit||[]).slice().reverse().map(a => `
    <div class="audit-item">
      <div class="audit-dot ${a.type}"></div>
      <div class="audit-body">
        <div class="audit-msg">${esc(a.msg)}</div>
        <div class="audit-ts">${a.ts}</div>
      </div>
    </div>`).join('');

  // Encode woId ke base64 untuk data attribute tombol cetak
  const woIdB64Print = btoa(unescape(encodeURIComponent(wo.id)));

  document.getElementById('detail-content').innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--accent)">${esc(wo.id)}</span>
          ${badgeType(wo.type)} ${badgePriority(wo.priority)} ${badgeStatus(wo.status)}
        </div>
        <div style="font-size:19px;font-weight:600;line-height:1.3;margin-bottom:8px">${esc(wo.title)}</div>
        <!-- Requestor chip di header detail -->
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="requestor-chip"><span class="rc-ico">👤</span>${esc(reqName)}${reqDept ? ' · ' + esc(reqDept) : ''}</span>
          ${wo.createdAt ? `<span style="font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace">📅 ${fmtDate(wo.createdAt)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-primary" data-woid-b64-print="${woIdB64Print}" id="btn-print-single-wo"
          style="background:var(--navy);font-size:11px;padding:7px 14px">
          🖨 Cetak WO
        </button>
        <button class="btn-ghost" onclick="openModal('wo','${wo.id}')">✏ Edit</button>
        <button class="btn-ghost" onclick="openNoteModal('${wo.id}','note')">📝 Catatan</button>
      </div>
    </div>

    <div class="status-flow">${sfHtml}</div>
    <div class="status-actions">${actionBtns}</div>

    <div class="detail-layout">
      <!-- LEFT PANEL -->
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="detail-panel">
          <div class="detail-panel-title">Detail WO</div>
          <!-- Requestor section di panel detail -->
          <div class="df">
            <label>Requestor</label>
            <span style="display:flex;align-items:center;gap:6px;margin-top:4px">
              <span style="font-size:13px;font-weight:500">${esc(reqName)}</span>
              ${reqDept ? `<span style="font-size:10px;font-family:'IBM Plex Mono',monospace;background:rgba(91,156,246,.1);color:var(--blue);padding:1px 6px;border-radius:4px;border:1px solid rgba(91,156,246,.2)">${esc(reqDept)}</span>` : ''}
            </span>
          </div>
          <hr class="divider"/>
          ${wo.unitId ? `<div class="df"><label>Unit / Area</label><span>${esc(getUnitName(wo.unitId))} <span style="color:var(--text3)">/ ${esc(getAreaName(wo.areaId))}</span></span></div>` : ''}
          <div class="df"><label>Equipment</label><span>${esc(equip || '— Tidak ada —')}</span></div>
          <div class="df"><label>Teknisi PIC</label><span>${esc(tech  || '— Belum ditugaskan —')}</span></div>
          <div class="df"><label>Dibuat</label><span>${fmtDate(wo.createdAt)}</span></div>
          <div class="df"><label>Target Selesai</label><span>${wo.dueDate ? fmtDate(wo.dueDate) : '—'}</span></div>
          <div class="df"><label>Estimasi Durasi</label><span>${wo.estHours ? wo.estHours + ' jam' : '—'}</span></div>
          <div class="df"><label>Durasi Aktual</label><span>${wo.actualHours ? wo.actualHours + ' jam' : '—'}</span></div>
          ${wo.startTime || wo.endTime ? `<div class="df"><label>Timeline Pengerjaan</label><span style="font-size:12px;color:var(--text2)">
            ${wo.startTime ? '▶ Mulai: ' + esc(wo.startTime) : ''}
            ${wo.startTime && wo.endTime ? '<br/>' : ''}
            ${wo.endTime ? '✓ Selesai: ' + esc(wo.endTime) : ''}
          </span></div>` : ''}
          ${wo.closingNote ? `<hr class="divider"><div class="df"><label>Catatan Penutupan</label><span style="white-space:pre-wrap;color:var(--text2)">${esc(wo.closingNote)}</span></div>` : ''}
          ${wo.notes ? `<hr class="divider"><div class="df"><label>Catatan</label><span style="white-space:pre-wrap;color:var(--text2)">${esc(wo.notes)}</span></div>` : ''}
        </div>

        <div class="detail-panel">
          <div class="detail-panel-title">Audit Trail</div>
          <div class="audit-list">${auHtml || '<div style="font-size:12px;color:var(--text3)">Belum ada riwayat.</div>'}</div>
        </div>
      </div>

      <!-- RIGHT PANEL (Tabs) -->
      <div>
        <div class="detail-tabs">
          <button class="dtab active" id="dtab-checklist" onclick="switchTab('checklist','${wo.id}')">✅ Checklist (${doneCount}/${totalCount})</button>
          <button class="dtab" id="dtab-parts" onclick="switchTab('parts','${wo.id}')">🔩 Parts Used</button>
          <button class="dtab" id="dtab-attach" onclick="switchTab('attach','${wo.id}')">📎 Lampiran</button>
          <button class="dtab" id="dtab-noteslog" onclick="switchTab('noteslog','${wo.id}')">📝 Catatan</button>
          <button class="dtab" id="dtab-photos" onclick="switchTab('photos','${wo.id}')">📷 Foto</button>
          ${wo.equipId ? `<button class="dtab" id="dtab-history" onclick="switchTab('history','${wo.id}')">📜 Hist. Equip</button>` : ''}
        </div>

        <!-- Tab: Checklist -->
        <div id="tab-checklist">
          <div class="checklist-wrap">
            <div class="checklist-header">
              <div style="font-size:13px;font-weight:600">Tasks & Checklist</div>
              <div class="checklist-progress">${doneCount}/${totalCount} — ${pct}%</div>
            </div>
            <div class="checklist-bar-wrap"><div class="checklist-bar-fill" style="width:${pct}%"></div></div>
            ${wo.status !== 'Done' && wo.status !== 'Cancelled' && SESSION?.role !== 'User'
  ? `<div class="add-checklist">
      <input type="text" id="quick-cl-${wo.id}" placeholder="Tambah task baru... (Enter)" onkeydown="if(event.key==='Enter')quickAddChecklist('${wo.id}')"/>
      <button class="btn-ghost" onclick="quickAddChecklist('${wo.id}')">+</button>
    </div>` : ''}
            ${clHtml || '<div class="empty" style="padding:20px"><div class="empty-msg">Belum ada task.</div></div>'}
          </div>
        </div>

        <!-- Tab: Parts -->
        <div id="tab-parts" style="display:none">
          <div class="checklist-wrap">
            <div class="checklist-header">
              <div style="font-size:13px;font-weight:600">Spare Parts Digunakan</div>
              ${wo.status !== 'Done' && wo.status !== 'Cancelled'
                ? `<button class="btn-sm success" onclick="openPartsPicker('${wo.id}')">+ Tambah Part</button>` : ''}
            </div>
            ${puHtml}
          </div>
        </div>

        <!-- Tab: Attachment -->
        <div id="tab-attach" style="display:none">
          <div class="checklist-wrap">
            <div class="checklist-header">
              <div style="font-size:13px;font-weight:600">Lampiran</div>
              <span style="font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace">${(wo.attachments||[]).length} file</span>
            </div>
            <div id="upload-progress-bar" class="upload-progress"><div class="upload-progress-fill" id="upload-progress-fill"></div></div>
            <div class="attach-grid">
              ${(wo.attachments||[]).map(a => `
                <div class="attach-wrap">
                  <a class="attach-card-link" href="${getDriveUrl(a.id)}" target="_blank" title="Buka ${esc(a.name)}">
                    ${a.type === 'image'
                      ? `<img src="" data-fid="${a.id||''}" alt="${esc(a.name)}" loading="lazy" class="ph-lazy"
                          style="width:100%;height:60px;object-fit:cover;border-radius:5px;margin-bottom:4px"/>`
                      : `<div class="attach-ico">${a.type === 'pdf' ? '📕' : a.type === 'video' ? '🎬' : '📄'}</div>`}
                    <div class="attach-name">${esc(a.name)}</div>
                    <div class="attach-size">${a.size||''}</div>
                    ${a.addedBy ? `<div class="attach-size" style="color:var(--text3)">oleh ${esc(a.addedBy)}</div>` : ''}
                  </a>
                  <div style="display:flex;gap:4px;margin-top:4px">
                    <a href="${getDownloadUrl(a.id)}" target="_blank" title="Download file"
                      style="font-size:10px;color:var(--accent);text-decoration:none">⬇ Download</a>
                  </div>
                  ${wo.status !== 'Done' && wo.status !== 'Cancelled'
                    ? `<button class="attach-del" onclick="deleteAttachment('${wo.id}','${a.id||''}','${esc(a.name)}')" title="Hapus lampiran">✕</button>`
                    : ''}
                </div>`).join('')}
              ${wo.status !== 'Done' && wo.status !== 'Cancelled' ? `
              <label class="attach-card attach-add" for="file-upload-${wo.id}" id="attach-upload-btn">
                <div class="attach-ico">＋</div>
                <div class="attach-name">Upload File</div>
                <div class="attach-size">.jpg, .pdf, .png</div>
              </label>
              <input type="file" id="file-upload-${wo.id}" accept="image/*,video/*,.pdf,.doc,.docx,.xlsx" style="display:none"
                onchange="handleAttachment(event,'${wo.id}')"/>` : ''}
            </div>
            ${!(wo.attachments||[]).length ? '<div style="font-size:12px;color:var(--text3);padding:12px 0;text-align:center">Belum ada lampiran. Klik + untuk upload.</div>' : ''}
          </div>
        </div>

        <!-- Tab: Catatan Log -->
        <div id="tab-noteslog" style="display:none">
          <div class="checklist-wrap">
            <div class="checklist-header">
              <div style="font-size:13px;font-weight:600">Catatan Lapangan</div>
              <span style="font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace">${(wo.notesLog||[]).length} catatan</span>
            </div>
            <div class="notes-log">
              ${(wo.notesLog||[]).length === 0
                ? '<div class="nl-empty">Belum ada catatan lapangan. Tambahkan catatan di bawah.</div>'
                : [...(wo.notesLog||[])].reverse().map(n => `
                  <div class="nl-item">
                    <div class="nl-header">
                      <span class="nl-author">👤 ${esc(n.author||'—')}</span>
                      <span class="nl-ts">${esc(n.ts||'')}</span>
                    </div>
                    <div class="nl-text">${esc(n.text)}</div>
                  </div>`).join('')}
            </div>
            ${wo.status !== 'Done' && wo.status !== 'Cancelled' ? `
            <div class="add-note-bar">
              <textarea class="ftextarea" id="note-input-${wo.id}" placeholder="Tulis catatan lapangan, temuan, atau update pengerjaan..."></textarea>
              <button class="btn-primary" onclick="addNoteToLog('${wo.id}')">TAMBAH</button>
            </div>` : `<div style="font-size:12px;color:var(--text3);margin-top:8px;font-family:'IBM Plex Mono',monospace">WO sudah ${wo.status} — catatan terkunci.</div>`}
          </div>
        </div>
        <div id="tab-photos" style="display:none">
          <div class="checklist-wrap">
            ${photoGalleryHtml(wo,'before','📷 Before Photos')}
            ${photoGalleryHtml(wo,'after','📷 After Photos')}
            ${photoGalleryHtml(wo,'verification','📷 Verification Photos')}
          </div>
        </div>

        ${wo.equipId ? `
        <div id="tab-history" style="display:none">
          <div class="checklist-wrap">
            <div class="checklist-header">
              <div style="font-size:13px;font-weight:600">📜 History Perbaikan — ${esc(getEquipName(wo.equipId))}</div>
              <button class="btn-sm" onclick="loadEquipHistory('${wo.equipId}')">↻ Refresh</button>
            </div>
            <div id="equip-history-${wo.equipId}" style="padding-top:8px">
              <div style="font-size:12px;color:var(--text3);padding:8px 0">Klik Refresh untuk memuat history...</div>
            </div>
          </div>
        </div>` : ''}
      </div>
    </div>`;
}

// ── Attach event listener tombol cetak WO di halaman detail ──
// Dipanggil setelah innerHTML showDetail di-inject
function attachDetailPrintBtn() {
  const btn = document.getElementById('btn-print-single-wo');
  if (!btn) return;
  btn.addEventListener('click', function() {
    const b64 = this.dataset.woidB64Print;
    if (b64) printSingleWO(decodeURIComponent(escape(atob(b64))));
  });
}

// ── Patch showDetail agar attachDetailPrintBtn terpanggil ──
const _origShowDetailForPrint = showDetail;
showDetail = function(woId) {
  _origShowDetailForPrint(woId);
  setTimeout(attachDetailPrintBtn, 60);
};

function switchTab(tab, woId) {
  const wo = WO.workorders.find(w => w.id === woId);
  const tabs = ['checklist','parts','attach','noteslog','photos'];
  if (wo && wo.equipId) tabs.push('history');
  tabs.forEach(t => {
    const el  = document.getElementById('tab-'+t);
    const btn = document.getElementById('dtab-'+t);
    if (el)  el.style.display = t === tab ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'history' && wo && wo.equipId) loadEquipHistory(wo.equipId);
  if (tab === 'photos') hydratePhotoThumbnails(document.getElementById('tab-photos'));
  if (tab === 'attach') hydratePhotoThumbnails(document.getElementById('tab-attach'));
}

// ═══════════════════════════════════════════════════════════════
// RENDER: TECHNICIANS
