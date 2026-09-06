// ═══════════════════════════════════════════════════════════════
function renderDashboard() {
  const all = WO.workorders;
  const now = new Date();
  const thisMonth = all.filter(w => {
    const d = new Date(w.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const doneThisMonth = thisMonth.filter(w => w.status === 'Done').length;
  const total = all.length || 1;
  const done  = all.filter(w => w.status === 'Done').length;
  const rate  = Math.round(done / total * 100);

  setText('s-total',      all.length);
  setText('s-done-month', doneThisMonth);
  setText('s-done-rate',  rate + '% completion rate');
  setText('s-open',       all.filter(w => w.status === 'Open').length);
  setText('s-pending-verif', all.filter(w => w.status === 'Pending Verification').length);
  setText('s-rejected',      all.filter(w => w.status === 'Rejected').length);

  renderDashboardUnitCards(all);

  const recent = [...all].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  const el = document.getElementById('dash-recent-wo');
  if (!recent.length) { el.innerHTML = emptyState('📋', 'Belum ada Work Order'); return; }
  el.innerHTML = `<div class="tbl-wrap"><table class="data-table"><thead><tr>
    <th>WO ID</th><th>Judul</th><th>Requestor</th><th>Tipe</th><th>Prioritas</th><th>Status</th><th>Due</th>
  </tr></thead><tbody>${recent.map(w => woTableRow(w, false)).join('')}</tbody></table></div>`;
}

// ── Kartu ringkasan WO per Unit di Dashboard ──
function findUnitIdByKeyword(keyword) {
  const u = (EQUIP_DB.units || []).find(x => {
    const n = (x.name || '').toLowerCase();
    return keyword === 'unit1'
      ? (n.includes('unit 1') || n.includes('unit1') || (n.includes('unit') && n.includes('1') && !n.includes('2')))
      : (n.includes('unit 2') || n.includes('unit2') || (n.includes('unit') && n.includes('2') && !n.includes('1')));
  });
  return u ? u.id : null;
}

function renderDashboardUnitCards(all) {
  const wrap = document.getElementById('dash-unit-cards');
  if (!wrap) return;

  const u1Id = findUnitIdByKeyword('unit1');
  const u2Id = findUnitIdByKeyword('unit2');

  function statsFor(uid) {
    const list = uid ? all.filter(w => w.unitId === uid) : [];
    const done = list.filter(w => w.status === 'Done').length;
    const open = list.filter(w => w.status === 'Open').length;
    const rate = list.length ? Math.round(done / list.length * 100) : 0;
    return { total: list.length, done, open, rate };
  }
  const s1 = statsFor(u1Id);
  const s2 = statsFor(u2Id);
  const u1Name = u1Id ? getUnitName(u1Id) : 'Unit 1';
  const u2Name = u2Id ? getUnitName(u2Id) : 'Unit 2';

  wrap.innerHTML = `
    <div class="stat-card c-teal" onclick="filterByUnitDashboard('${u1Id||''}')">
      <div class="stat-lbl">🏭 ${esc(u1Name)}</div>
      <div class="stat-val">${s1.total}</div>
      <div class="stat-sub">${s1.done} selesai · ${s1.open} open · ${s1.total ? s1.rate+'%' : '—'} rate</div>
    </div>
    <div class="stat-card c-purple" onclick="filterByUnitDashboard('${u2Id||''}')">
      <div class="stat-lbl">🏗 ${esc(u2Name)}</div>
      <div class="stat-val">${s2.total}</div>
      <div class="stat-sub">${s2.done} selesai · ${s2.open} open · ${s2.total ? s2.rate+'%' : '—'} rate</div>
    </div>`;
}

function filterByUnitDashboard(unitId) {
  if (!unitId) { toast('Data unit belum tersedia', 'error'); return; }
  ST.filterUnit = unitId; ST.filterStatus = ''; ST.filterType = ''; ST.filterPriority = '';
  navigateTo('wo-list');
  const el = document.getElementById('filterUnit'); if (el) el.value = unitId;
  renderWOList();
}

// ═══════════════════════════════════════════════════════════════
// ── PAGINATION: batasi render tabel/card 20 baris per halaman ──
//
// Ada 2 mode:
//  1. Mode NORMAL (ST.fastPageMode = false) — WO.workorders sudah berisi
//     SEMUA WO (dari cache localStorage atau hasil pullAllFromAPI penuh).
//     Di sini pagination cuma slice array yang sudah ada di memori.
//  2. Mode FAST (ST.fastPageMode = true) — dipakai HANYA saat belum ada
//     cache sama sekali (device/browser baru). WO.workorders sengaja
//     cuma diisi 20 baris hasil fn=read_wo_page dari backend (baca
//     sheet bulanan yang relevan saja, bukan semua), supaya user lihat
//     data dalam hitungan detik alih-alih menunggu fn=read penuh yang
//     scan 1500+ baris. Begitu fn=read penuh selesai (lihat
//     pullAllFromAPI di 01-state-init.js), mode ini otomatis dimatikan.
//  Selama mode FAST aktif, search/filter DINONAKTIFKAN dulu (data yang
//  ada baru 20 baris, hasil filter bisa salah/kurang) — tampilkan pesan
//  "memuat data lengkap" sampai fn=read penuh selesai.
const WO_LIST_PAGE_SIZE = 20;
let _woListLastFilterSig = null;
let WO_FAST = { total: 0 };

// Ambil 1 halaman WO langsung dari server (fn=read_wo_page) — dipakai
// saat belum ada data sama sekali di memori/cache.
async function loadWOPageFast(page) {
  try {
    const r = await fetch(
      apiBase() + '?fn=read_wo_page&page=' + page + '&pageSize=' + WO_LIST_PAGE_SIZE,
      { mode: 'cors', signal: AbortSignal.timeout(20000) }
    );
    const d = await r.json();
    if (d.ok && Array.isArray(d.rows)) {
      WO.workorders = d.rows.map(normalizeWOFromSheets);
      WO_FAST.total = d.total || 0;
      ST.fastPageMode = true;
      ST.woPage = page;
      if (ST.page === 'wo-list') renderWOList();
    }
  } catch (e) {
    console.warn('[loadWOPageFast] gagal, menunggu sinkronisasi penuh:', e.message);
  }
}

function woListHasActiveFilter() {
  const q      = document.getElementById('woSearch')?.value || '';
  const fields = ['filterStatus','filterType','filterPriority','filterUnit','filterArea','filterRequestor','filterTechnician'];
  return !!(q || fields.some(id => document.getElementById(id)?.value));
}

function goToWOPage(page) {
  ST.woPage = page;
  if (ST.fastPageMode && !woListHasActiveFilter()) {
    loadWOPageFast(page); // ambil halaman ini langsung dari server
  } else {
    renderWOList();
  }
  document.getElementById('wo-list-container')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function woListPagerHtml(totalItems, totalPages) {
  if (totalPages <= 1) return '';
  const p = ST.woPage;
  return `
    <div class="wo-pager">
      <button type="button" class="btn-ghost wo-pager-btn wo-pager-prev" ${p <= 1 ? 'disabled' : ''} onclick="goToWOPage(${p - 1})">‹ Previous</button>
      <span class="wo-pager-info">Halaman ${p} dari ${totalPages}</span>
      <button type="button" class="btn-ghost wo-pager-btn wo-pager-next" ${p >= totalPages ? 'disabled' : ''} onclick="goToWOPage(${p + 1})">Next ›</button>
    </div>`;
}

function renderWOList() {
  populateFilterDropdowns();

  // Sinkronkan label tombol toggle dengan ST.viewMode yang sedang aktif
  // (perlu ini karena viewMode bisa di-set dari luar toggleView(), misal
  // default Card View di HP dari js/01b-mobile.js).
  const viewBtn = document.getElementById('viewToggleBtn');
  if (viewBtn) viewBtn.textContent = ST.viewMode === 'card' ? '☰ Table View' : '⊞ Card View';

  const q       = (document.getElementById('woSearch')?.value || '').toLowerCase();
  const fStatus = document.getElementById('filterStatus')?.value || ST.filterStatus;
  const fType   = document.getElementById('filterType')?.value   || ST.filterType;
  const fPri    = document.getElementById('filterPriority')?.value || ST.filterPriority;
  const fUnit   = document.getElementById('filterUnit')?.value      || ST.filterUnit      || '';
  const fArea   = document.getElementById('filterArea')?.value      || ST.filterArea      || '';
  const fReq    = document.getElementById('filterRequestor')?.value || ST.filterRequestor || '';
  const fTech   = document.getElementById('filterTechnician')?.value|| ST.filterTechnician|| '';

  // Reset ke halaman 1 setiap kali kombinasi filter/pencarian berubah
  const _sig = JSON.stringify([q, fStatus, fType, fPri, fUnit, fArea, fReq, fTech]);
  if (_sig !== _woListLastFilterSig) {
    ST.woPage = 1;
    _woListLastFilterSig = _sig;
  }
  if (!ST.woPage || ST.woPage < 1) ST.woPage = 1;

  const hasFilter = q || fStatus || fType || fPri || fUnit || fArea || fReq || fTech;
  const resetBtn = document.getElementById('btnResetFilter');
  if (resetBtn) resetBtn.style.display = hasFilter ? '' : 'none';

  // Mode FAST + user mulai search/filter → data yang ada baru 1 halaman (20
  // baris), belum cukup untuk difilter dengan benar. Tampilkan status
  // "memuat" dan HENTIKAN di sini — begitu fn=read penuh selesai (lihat
  // pullAllFromAPI), ST.fastPageMode jadi false dan renderWOList() jalan
  // lagi otomatis dengan data lengkap, lalu filter ini otomatis terpakai.
  if (ST.fastPageMode && hasFilter) {
    setText('wo-count-label', 'Memuat seluruh data WO untuk pencarian/filter…');
    const c = document.getElementById('wo-list-container');
    if (c) c.innerHTML = emptyState('⏳', 'Sedang mengambil seluruh data WO dari server — pencarian & filter aktif otomatis begitu selesai.');
    return;
  }

  let list = getVisibleWO().filter(w => {
    try {
      const wId    = (w.id    || '').toLowerCase();
      const wTitle = (w.title || '').toLowerCase();
      const matchQ  = !q || wId.includes(q) || wTitle.includes(q)
                        || (w.requestorName||'').toLowerCase().includes(q)
                        || (w.requestorDept||'').toLowerCase().includes(q)
                        || (getEquipName(w.equipId)||'').toLowerCase().includes(q)
                        || (getTechName(w.techId)||'').toLowerCase().includes(q);
      const activeStatuses = ['Open','In Progress','Pending Verification','Rejected'];
      const matchSt   = !fStatus || (fStatus === 'active' ? activeStatuses.includes(w.status) : w.status === fStatus);
      const matchTy   = !fType   || w.type     === fType;
      const matchPr   = !fPri    || w.priority === fPri;
      const matchUnit = !fUnit   || w.unitId   === fUnit;
      const matchArea = !fArea   || w.areaId   === fArea;
      const matchReq  = !fReq    || (w.requestorName||'').toLowerCase().includes(fReq.toLowerCase());
      const matchTech = !fTech   || w.techId   === fTech;
      return matchQ && matchSt && matchTy && matchPr && matchUnit && matchArea && matchReq && matchTech;
    } catch(e) {
      console.warn('[renderWOList] Skip WO error:', w?.id, e.message);
      return false;
    }
  });

  list = list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Mode FAST (tanpa filter): WO.workorders memang SENGAJA cuma berisi
  // 1 halaman dari server, jadi `list` di sini SUDAH pas 1 halaman —
  // total & totalPages pakai angka asli (WO_FAST.total) dari server,
  // bukan dari list.length yang cuma 20.
  const isFastUnfiltered = ST.fastPageMode && !hasFilter;
  const totalItems = isFastUnfiltered ? WO_FAST.total : list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / WO_LIST_PAGE_SIZE));
  if (ST.woPage > totalPages) ST.woPage = totalPages;
  const pageStart = (ST.woPage - 1) * WO_LIST_PAGE_SIZE;
  const pageList  = isFastUnfiltered ? list : list.slice(pageStart, pageStart + WO_LIST_PAGE_SIZE);

  setText('wo-count-label', totalItems
    ? `Menampilkan ${pageStart + 1}–${Math.min(pageStart + WO_LIST_PAGE_SIZE, totalItems)} dari ${totalItems} work order`
    : '0 work order');
  const container = document.getElementById('wo-list-container');

  if (!totalItems) {
    container.innerHTML = hasFilter
      ? emptyState('🔍', 'Tidak ada WO yang cocok dengan filter')
      : `<div class="empty">
          <div class="empty-ico">📋</div>
          <div class="empty-msg" style="margin-bottom:16px">Belum ada Work Order</div>
          <button class="btn-primary" onclick="openModal('wo',null)" style="font-size:13px;padding:10px 24px">
            + Buat WO Pertama
          </button>
        </div>`;
    return;
  }

  const pagerHtml = woListPagerHtml(totalItems, totalPages);

  if (ST.viewMode === 'card') {
    // FIX: tidak ada onclick di dalam woCard(), semua ditangani attachCardEvents()
    container.innerHTML = `<div class="wo-board">${pageList.map(w => woCard(w)).join('')}</div>${pagerHtml}`;
    attachCardEvents();
  } else {
    // FIX: tidak ada onclick di dalam woTableRow(), semua ditangani attachTableEvents()
    container.innerHTML = `<div class="tbl-wrap"><table class="data-table"><thead><tr>
      <th>Tanggal</th><th>Judul</th><th>Requestor</th><th>Tipe</th><th>Prioritas</th><th>Equipment</th><th>Unit</th><th>Teknisi</th><th>Status</th><th>Due</th><th></th>
    </tr></thead><tbody>${pageList.map(w => woTableRow(w, true)).join('')}</tbody></table></div>${pagerHtml}`;
    attachTableEvents();
  }
}

// ── Populate dropdown filter Unit, Area, Teknisi dari data EQUIP_DB + WO ──
function populateFilterDropdowns() {
  // Unit
  const unitSel = document.getElementById('filterUnit');
  if (unitSel) {
    const curUnit = unitSel.value;
    unitSel.innerHTML = '<option value="">Semua Unit</option>';
    (EQUIP_DB.units || []).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id; opt.textContent = u.name;
      if (u.id === curUnit) opt.selected = true;
      unitSel.appendChild(opt);
    });
  }

  // Area — sesuai unit yang dipilih
  const areaSel = document.getElementById('filterArea');
  if (areaSel) {
    const curArea  = areaSel.value;
    const curUnit2 = document.getElementById('filterUnit')?.value || '';
    areaSel.innerHTML = '<option value="">Semua Area</option>';
    const areas = curUnit2
      ? (EQUIP_DB.areas || []).filter(a => a.unitId === curUnit2)
      : (EQUIP_DB.areas || []);
    areas.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name;
      if (a.id === curArea) opt.selected = true;
      areaSel.appendChild(opt);
    });
  }

  // Teknisi — dari WO.technicians yang Active
  const techSel = document.getElementById('filterTechnician');
  if (techSel) {
    const curTech = techSel.value;
    techSel.innerHTML = '<option value="">Semua Teknisi</option>';
    (WO.technicians || []).filter(t => t.status === 'Active' || !t.status).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      if (t.id === curTech) opt.selected = true;
      techSel.appendChild(opt);
    });
  }
}

// ── Saat unit filter berubah → refresh area dropdown lalu render ──
function onFilterUnitChange() {
  const unitId  = document.getElementById('filterUnit')?.value || '';
  const areaSel = document.getElementById('filterArea');
  if (areaSel) {
    areaSel.innerHTML = '<option value="">Semua Area</option>';
    const areas = unitId
      ? (EQUIP_DB.areas || []).filter(a => a.unitId === unitId)
      : (EQUIP_DB.areas || []);
    areas.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name;
      areaSel.appendChild(opt);
    });
  }
  renderWOList();
}

// ── Reset semua filter ke default ──
function resetAllFilters() {
  ['filterStatus','filterType','filterPriority','filterUnit','filterArea','filterTechnician'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const reqEl = document.getElementById('filterRequestor');
  if (reqEl) reqEl.value = '';
  const searchEl = document.getElementById('woSearch');
  if (searchEl) searchEl.value = '';
  ST.filterStatus = ''; ST.filterType = ''; ST.filterPriority = '';
  ST.filterUnit = ''; ST.filterArea = ''; ST.filterRequestor = ''; ST.filterTechnician = '';
  renderWOList();
}

function woTableRow(w, showActions = false) {
  const equip = getEquipName(w.equipId);
  const tech  = getTechNamesStr(w);
  const doneCount  = w.checklist?.filter(c => c.done).length || 0;
  const totalCount = w.checklist?.length || 0;
  const reqName = w.requestorName || '—';
  const reqDept = w.requestorDept || '';
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = w.dueDate ? new Date(w.dueDate) : null;
  if (due) due.setHours(0,0,0,0);
  const isOverdue  = due && due < today && w.status !== 'Done' && w.status !== 'Cancelled';
  const isDueToday = due && due.getTime() === today.getTime() && w.status !== 'Done' && w.status !== 'Cancelled';
  const rowBg = isOverdue ? 'background:rgba(192,57,43,.04)' : isDueToday ? 'background:rgba(251,140,58,.04)' : '';
  const nextStatuses = {Open:['Done','Cancelled'],Done:[],Cancelled:[]};
  const nextOpts = (nextStatuses[w.status]||[]).map(s => `<option value="${s}">${s}</option>`).join('');

  // Encode WO ID ke base64 untuk data attribute — hindari masalah karakter / ' "
  const woIdB64 = btoa(unescape(encodeURIComponent(w.id)));

  // Judul: wrap penuh di Dashboard (showActions=false), ellipsis 1 baris di WO List (showActions=true)
  const titleStyle = showActions
    ? 'font-weight:500;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
    : 'font-weight:500;white-space:normal;word-break:break-word;line-height:1.4';

  return `<tr class="wo-row" data-woid-b64="${woIdB64}" style="cursor:pointer;${rowBg}">
    <td>
      <div style="font-size:12px;font-weight:600;color:var(--navy);white-space:nowrap">${fmtDate(w.createdAt)}</div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);margin-top:2px">${esc(w.id)}</div>
    </td>
    <td>
      <div style="${titleStyle}">${esc(w.title)}</div>
      ${totalCount ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">✓ ${doneCount}/${totalCount} tasks</div>` : ''}
    </td>
    <td>
      <div style="font-size:12px;font-weight:500">${esc(reqName)}</div>
      ${reqDept ? `<div style="font-size:10px;color:var(--text3);margin-top:1px">${esc(reqDept)}</div>` : ''}
    </td>
    <td>${badgeType(w.type)}</td>
    <td>${badgePriority(w.priority)}</td>
    ${showActions ? `
    <td><span style="font-size:12px;color:var(--text2)">${esc(equip||'—')}</span></td>
    <td><span class="td-mono" style="font-size:10px">${esc(w.unitId ? getUnitName(w.unitId) : '—')}</span></td>
    <td><span style="font-size:12px;color:var(--text2)">${esc(tech||'—')}</span></td>` : ''}
    <td>${badgeStatus(w.status)}</td>
    <td>${dueLabelHtml(w.dueDate, w.status)}</td>
    ${showActions ? `<td class="td-stopclick"><div class="tbl-actions">
      <button class="btn-icon view td-btn-detail" data-woid-b64="${woIdB64}" title="Detail">👁</button>
      <button class="btn-icon td-btn-edit" data-woid-b64="${woIdB64}" title="Edit">✏</button>
      <button class="btn-icon del td-btn-del" data-woid-b64="${woIdB64}" title="Hapus">✕</button>
    </div></td>` : ''}
  </tr>`;
}

   // Event delegation untuk tabel WO — menghindari masalah karakter / dalam WO ID
function attachTableEvents() {
  const container = document.getElementById('wo-list-container');
  if (!container) return;

  const fresh = container.cloneNode(true);
  container.parentNode.replaceChild(fresh, container);
  const el = document.getElementById('wo-list-container');

  el.addEventListener('click', function(e) {
    const copyBtn = e.target.closest('.copy-btn[data-copy]');
    if (copyBtn) {
      e.stopPropagation();
      const id = copyBtn.dataset.copy;
      navigator.clipboard.writeText(id).catch(() => {});
      copyBtn.textContent = '✓';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = '⎘'; copyBtn.classList.remove('copied'); }, 1500);
      return;
    }

    const detailBtn = e.target.closest('.td-btn-detail[data-woid-b64]');
    if (detailBtn) {
      e.stopPropagation();
      showDetail(decodeURIComponent(escape(atob(detailBtn.dataset.woidB64))));
      return;
    }

    const editBtn = e.target.closest('.td-btn-edit[data-woid-b64]');
    if (editBtn) {
      e.stopPropagation();
      openModal('wo', decodeURIComponent(escape(atob(editBtn.dataset.woidB64))));
      return;
    }

    const delBtn = e.target.closest('.td-btn-del[data-woid-b64]');
    if (delBtn) {
      e.stopPropagation();
      deleteWO(decodeURIComponent(escape(atob(delBtn.dataset.woidB64))));
      return;
    }

    if (e.target.closest('.td-stopclick')) {
      e.stopPropagation();
      return;
    }

    const row = e.target.closest('tr.wo-row[data-woid-b64]');
    if (row) {
      showDetail(decodeURIComponent(escape(atob(row.dataset.woidB64))));
    }
  });

  el.addEventListener('change', function(e) {
    const sel = e.target.closest('.td-statussel[data-woid-b64]');
    if (sel && sel.value) {
      const woId = decodeURIComponent(escape(atob(sel.dataset.woidB64)));
      quickStatusChange(woId, sel.value);
      sel.value = '';
    }
  });
}

function attachCardEvents() {
  const container = document.getElementById('wo-list-container');
  if (!container) return;

  const fresh = container.cloneNode(true);
  container.parentNode.replaceChild(fresh, container);
  const el = document.getElementById('wo-list-container');

  el.addEventListener('click', function(e) {
    const copyBtn = e.target.closest('.copy-btn[data-copy]');
    if (copyBtn) {
      e.stopPropagation();
      const id = copyBtn.dataset.copy;
      navigator.clipboard.writeText(id).catch(() => {});
      copyBtn.textContent = '✓';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = '⎘'; copyBtn.classList.remove('copied'); }, 1500);
      return;
    }

    const editBtn = e.target.closest('.card-edit-btn[data-woid-b64]');
    if (editBtn) {
      e.stopPropagation();
      openModal('wo', decodeURIComponent(escape(atob(editBtn.dataset.woidB64))));
      return;
    }

    if (e.target.closest('.td-stopclick')) {
      e.stopPropagation();
      return;
    }

    const card = e.target.closest('.wo-card-clickable[data-woid-b64]');
    if (card) {
      showDetail(decodeURIComponent(escape(atob(card.dataset.woidB64))));
    }
  });
}

   
function woCard(w) {
  // FIX: encode WO ID ke base64 — aman dari karakter / ' " di onclick
  const woIdB64 = btoa(unescape(encodeURIComponent(w.id)));

  const pColor = {Critical:'var(--red)',High:'var(--orange)',Medium:'var(--accent)',Low:'var(--text3)'};
  const done  = w.checklist?.filter(c => c.done).length || 0;
  const total = w.checklist?.length || 0;
  const pct   = total ? Math.round(done / total * 100) : 0;
  const reqName = w.requestorName || '';
  const reqDept = w.requestorDept || '';
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = w.dueDate ? new Date(w.dueDate) : null;
  if (due) due.setHours(0,0,0,0);
  const isOverdue  = due && due < today && w.status !== 'Done' && w.status !== 'Cancelled';
  const isDueToday = due && due.getTime() === today.getTime() && w.status !== 'Done' && w.status !== 'Cancelled';
  const cardClass  = isOverdue ? ' overdue' : isDueToday ? ' due-today-card' : '';

  // FIX: TIDAK ada onclick="showDetail(...)" atau onclick="openModal(...)" di sini
  // Semua klik ditangani oleh attachCardEvents() via event delegation
  // WO ID disimpan di data-woid-b64, bukan di string onclick
  return `<div class="wo-card${cardClass} wo-card-clickable" data-woid-b64="${woIdB64}">
    <div class="wo-card-accent" style="background:${pColor[w.priority]||'var(--text3)'}"></div>
    <div class="wo-card-head">
      <span class="wo-card-id">${esc(w.id)}
        <button class="copy-btn td-stopclick" data-copy="${esc(w.id)}" title="Salin WO ID">⎘</button>
      </span>
      ${badgeStatus(w.status)}
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">${badgeType(w.type)} ${badgePriority(w.priority)}</div>
    <div class="wo-card-title">${esc(w.title)}</div>
    <div class="wo-card-meta">
      ${reqName ? `<div class="wo-meta-row"><span class="wo-meta-ico">👤</span><span style="color:var(--blue)">${esc(reqName)}${reqDept ? ' · ' + esc(reqDept) : ''}</span></div>` : ''}
      ${w.equipId ? `<div class="wo-meta-row"><span class="wo-meta-ico">⚙</span>${esc(getEquipName(w.equipId)||w.equipId)}</div>` : ''}
      ${(w.techIds&&w.techIds.length)||w.techId  ? `<div class="wo-meta-row"><span class="wo-meta-ico">👷</span>${esc(getTechNamesStr(w)||w.techId)}</div>`
                  : '<div class="wo-meta-row" style="color:var(--text3)"><span class="wo-meta-ico">👷</span>Belum ditugaskan</div>'}
      ${w.dueDate ? `<div class="wo-meta-row"><span class="wo-meta-ico">📅</span>${dueLabelHtml(w.dueDate, w.status)}</div>` : ''}
    </div>
    <div class="wo-card-foot">
      <div class="wo-checklist-bar">
        <span style="font-size:10px;font-family:'IBM Plex Mono',monospace">${done}/${total} tasks</span>
        <div class="checklist-mini"><div class="checklist-fill" style="width:${pct}%"></div></div>
        <span style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--green)">${pct}%</span>
      </div>
      <div class="td-stopclick" style="display:flex;gap:4px">
        <button class="btn-icon card-edit-btn td-stopclick" data-woid-b64="${woIdB64}" title="Edit" style="width:26px;height:26px;font-size:12px">✏</button>
      </div>
    </div>
  </div>`;
}

function toggleView() {
  ST.viewMode = ST.viewMode === 'card' ? 'table' : 'card';
  // Ingat pilihan manual user (lihat js/01b-mobile.js) supaya default
  // "paksa Card View di HP" tidak menimpa pilihan ini lagi nanti.
  if (typeof rememberViewModePref === 'function') rememberViewModePref(ST.viewMode);
  renderWOList(); // renderWOList() juga yang mengurus label tombolnya
}

// ═══════════════════════════════════════════════════════════════
// RENDER: DETAIL WO
