// ═══════════════════════════════════════════════════════════════

function renderAdminPanel() {
  const btn = document.getElementById('btn-gen-ppt');
  if (btn) {
    const total = WO.workorders.length;
    btn.title = `Generate PPT dari ${total} Work Order`;
  }
}

// ═══════════════════════════════════════════════════════════════
// EQUIPMENT HISTORY ADMIN PAGE
// ═══════════════════════════════════════════════════════════════

function getEHABaseData() {
  // Kumpulkan semua WO Done yang punya equipId
  return WO.workorders.filter(w => w.status === 'Done' && w.equipId);
}

function onEHAUnitChange() {
  const unitId  = document.getElementById('eha-unit')?.value || '';
  const areaSel = document.getElementById('eha-area');
  const eqSel   = document.getElementById('eha-equip');
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
  if (eqSel) {
    eqSel.innerHTML = '<option value="">Semua Equipment</option>';
    const eqs = unitId
      ? (EQUIP_DB.equipment || []).filter(e => e.unitId === unitId)
      : (EQUIP_DB.equipment || []);
    eqs.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = e.name;
      eqSel.appendChild(opt);
    });
  }
  renderEHAPage();
}

function resetEHAFilter() {
  ['eha-unit','eha-area','eha-equip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const s = document.getElementById('eha-search');
  if (s) s.value = '';
  onEHAUnitChange();
  renderEHAPage();
}

function renderEHAPage() {
  // Populate filter dropdowns (unit)
  const unitSel = document.getElementById('eha-unit');
  if (unitSel && unitSel.children.length <= 1) {
    (EQUIP_DB.units || []).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id; opt.textContent = u.name;
      unitSel.appendChild(opt);
    });
  }

  const fUnit  = document.getElementById('eha-unit')?.value  || '';
  const fArea  = document.getElementById('eha-area')?.value  || '';
  const fEquip = document.getElementById('eha-equip')?.value || '';
  const fQ     = (document.getElementById('eha-search')?.value || '').toLowerCase();
  const hasFilter = fUnit || fArea || fEquip || fQ;

  const resetBtn = document.getElementById('eha-reset-btn');
  if (resetBtn) resetBtn.style.display = hasFilter ? '' : 'none';

  // Filter WO base
  let baseWOs = getEHABaseData();

  if (fUnit) {
    const areaIds = (EQUIP_DB.areas || []).filter(a => a.unitId === fUnit).map(a => a.id);
    const eqIds   = (EQUIP_DB.equipment || []).filter(e => e.unitId === fUnit).map(e => e.id);
    baseWOs = baseWOs.filter(w => eqIds.includes(w.equipId));
  }
  if (fArea) {
    const eqIds = (EQUIP_DB.equipment || []).filter(e => e.areaId === fArea).map(e => e.id);
    baseWOs = baseWOs.filter(w => eqIds.includes(w.equipId));
  }
  if (fEquip) {
    baseWOs = baseWOs.filter(w => w.equipId === fEquip);
  }
  if (fQ) {
    baseWOs = baseWOs.filter(w => {
      const tech   = getTechNamesStr(w).toLowerCase();
      const title  = (w.title || '').toLowerCase();
      const parts  = (w.partsUsed || []).map(p => p.name).join(' ').toLowerCase();
      const equip  = getEquipName(w.equipId).toLowerCase();
      return tech.includes(fQ) || title.includes(fQ) || parts.includes(fQ) || equip.includes(fQ);
    });
  }

  // Group by equipId
  const equipMap = {};
  baseWOs.forEach(w => {
    if (!equipMap[w.equipId]) {
      const eq     = (EQUIP_DB.equipment || []).find(e => e.id === w.equipId);
      const area   = (EQUIP_DB.areas     || []).find(a => a.id === (eq?.areaId || w.areaId));
      const unit   = (EQUIP_DB.units     || []).find(u => u.id === (eq?.unitId || w.unitId));
      equipMap[w.equipId] = {
        equipId:   w.equipId,
        equipName: getEquipName(w.equipId) || w.equipId,
        areaName:  area?.name  || getAreaName(w.areaId) || '—',
        unitName:  unit?.name  || getUnitName(w.unitId) || '—',
        wos: [],
      };
    }
    equipMap[w.equipId].wos.push(w);
  });

  const equipList = Object.values(equipMap).sort((a, b) => {
    // Sort by unit → area → equipName
    const uCmp = a.unitName.localeCompare(b.unitName);
    if (uCmp !== 0) return uCmp;
    const aCmp = a.areaName.localeCompare(b.areaName);
    if (aCmp !== 0) return aCmp;
    return a.equipName.localeCompare(b.equipName);
  });

  // Update stat cards
  const totalEquip  = equipList.length;
  const totalRepair = baseWOs.length;
  const totalParts  = baseWOs.reduce((s, w) => s + (w.partsUsed||[]).reduce((ps,p) => ps+(p.qty||0), 0), 0);
  const hoursArr    = baseWOs.filter(w => parseFloat(w.actualHours) > 0).map(w => parseFloat(w.actualHours));
  const avgHours    = hoursArr.length ? (hoursArr.reduce((a,b) => a+b, 0) / hoursArr.length).toFixed(1) + ' jam' : '—';

  setText('eha-total-equip',   totalEquip);
  setText('eha-total-repairs', totalRepair);
  setText('eha-total-parts',   totalParts);
  setText('eha-avg-hours',     avgHours);

  // Render list
  const container = document.getElementById('eha-equip-list');
  if (!container) return;

  if (!equipList.length) {
    container.innerHTML = `<div class="empty">
      <div class="empty-ico">🔧</div>
      <div class="empty-msg">${hasFilter ? 'Tidak ada equipment history yang cocok dengan filter' : 'Belum ada equipment yang memiliki history perbaikan'}</div>
    </div>`;
    return;
  }

  container.innerHTML = equipList.map((eq, idx) => {
    const repCount   = eq.wos.length;
    const lastRepair = eq.wos.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const totalPartsEq = eq.wos.reduce((s,w) => s+(w.partsUsed||[]).reduce((ps,p)=>ps+(p.qty||0),0), 0);
    const hoursEq    = eq.wos.filter(w => parseFloat(w.actualHours)>0).map(w=>parseFloat(w.actualHours));
    const avgHoursEq = hoursEq.length ? (hoursEq.reduce((a,b)=>a+b,0)/hoursEq.length).toFixed(1)+' jam' : '—';

    const tableRows = eq.wos
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((w, i) => {
        const techNames = getTechNamesStr(w) || '—';
        const partsStr  = (w.partsUsed || []).length
          ? (w.partsUsed || []).map(p => `${esc(p.name)} ×${p.qty}`).join(', ')
          : '—';
        const activity  = w.title || '—';
        const closingNote = w.closingNote ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;font-style:italic">"${esc(w.closingNote.substring(0,80))}"</div>` : '';
        return `<tr style="${i%2===0?'background:var(--bg3)':'background:var(--bg2)'}">
          <td style="text-align:center;font-size:12px;font-family:'IBM Plex Mono',monospace;color:var(--text3)">${i+1}</td>
          <td>
            <div style="font-size:12px;font-weight:600;color:var(--navy)">${fmtDate(w.createdAt)}</div>
            ${w.endTime ? `<div style="font-size:10px;color:var(--text3);font-family:'IBM Plex Mono',monospace;margin-top:2px">✓ ${esc(w.endTime)}</div>` : ''}
          </td>
          <td>
            <div style="font-size:12px;font-weight:500">${esc(activity)}</div>
            <div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">${badgeType(w.type)}</div>
            ${closingNote}
          </td>
          <td>
            <div style="font-size:12px;color:${(w.partsUsed||[]).length?'var(--text)':'var(--text3)'}">${partsStr}</div>
            ${(w.partsUsed||[]).length ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${(w.partsUsed||[]).length} item</div>` : ''}
          </td>
          <td>
            <div style="font-size:12px;font-weight:500;color:var(--navy)">${esc(techNames)}</div>
            ${w.actualHours ? `<div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--teal);margin-top:2px">⏱ ${w.actualHours} jam</div>` : ''}
          </td>
          <td>
            <div style="display:flex;gap:4px;align-items:center">
              <a href="#" onclick="event.preventDefault();showDetail('${esc(w.id)}')" 
                style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--accent);font-weight:600;text-decoration:none"
                title="Lihat detail WO">${esc(w.id)}</a>
            </div>
          </td>
        </tr>`;
      }).join('');

    const eqId = `eha-acc-${idx}`;
    return `<div class="detail-panel" style="margin-bottom:14px;overflow:hidden">
      <!-- Header accordion -->
      <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0 10px;border-bottom:1px solid var(--border);margin-bottom:12px"
        onclick="toggleEHAAccordion('${eqId}')">
        <div style="display:flex;align-items:flex-start;gap:14px;flex:1;min-width:0">
          <div style="font-size:24px;flex-shrink:0">⚙</div>
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:700;color:var(--navy)">${esc(eq.equipName)}</div>
            <div style="font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace;margin-top:3px">
              🏭 ${esc(eq.unitName)} &nbsp;›&nbsp; 📍 ${esc(eq.areaName)}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;flex-shrink:0">
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:700;color:var(--red)">${repCount}</div>
            <div style="font-size:9px;font-family:'IBM Plex Mono',monospace;color:var(--text3)">PERBAIKAN</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:14px;font-weight:600;color:var(--accent)">${totalPartsEq}</div>
            <div style="font-size:9px;font-family:'IBM Plex Mono',monospace;color:var(--text3)">PARTS</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:14px;font-weight:600;color:var(--teal)">${avgHoursEq}</div>
            <div style="font-size:9px;font-family:'IBM Plex Mono',monospace;color:var(--text3)">AVG DURASI</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-ghost" style="font-size:11px;padding:5px 10px;white-space:nowrap"
              onclick="event.stopPropagation();downloadEHAExcel('${esc(eq.equipId)}','${esc(eq.equipName)}','${esc(eq.unitName)}','${esc(eq.areaName)}')"
              title="Download history equipment ini sebagai Excel">
              📥 Excel
            </button>
            <button class="btn-sm" id="${eqId}-toggle" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px">▼</button>
          </div>
        </div>
      </div>

      <!-- Tabel history -->
      <div id="${eqId}" style="overflow:hidden;transition:max-height .3s ease">
        <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3);margin-bottom:8px">
          Terakhir diperbaiki: <strong>${fmtDate(lastRepair.createdAt)}</strong>
        </div>
        <div style="overflow-x:auto">
          <table class="data-table" style="min-width:700px">
            <thead>
              <tr>
                <th style="width:40px">No</th>
                <th>Tanggal Perbaikan</th>
                <th>Aktivitas / Keluhan</th>
                <th>Parts yang Diganti</th>
                <th>PIC Teknisi</th>
                <th>WO ID</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleEHAAccordion(id) {
  const el  = document.getElementById(id);
  const btn = document.getElementById(id + '-toggle');
  if (!el) return;
  const isOpen = el.style.maxHeight !== '0px' && el.style.maxHeight !== '';
  if (isOpen) {
    el.style.maxHeight = '0px';
    el.style.overflow  = 'hidden';
    if (btn) btn.textContent = '▶';
  } else {
    el.style.maxHeight = el.scrollHeight + 'px';
    el.style.overflow  = 'visible';
    if (btn) btn.textContent = '▼';
  }
}

// ═══════════════════════════════════════════════════════════════
// MTTR / MTBF — Mean Time To Repair & Mean Time Between Failures
// ═══════════════════════════════════════════════════════════════

// Format durasi jam desimal → "X hari Y jam Z menit" (atau "Y jam Z menit" jika < 24 jam)
function formatDurationHM(hoursDecimal) {
  if (hoursDecimal === null || hoursDecimal === undefined || isNaN(hoursDecimal) || hoursDecimal <= 0) return '—';
  const totalMinutes = Math.round(hoursDecimal * 60);
  const days  = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const mins  = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(days + ' hari');
  if (days > 0 || hours > 0) parts.push(hours + ' jam');
  parts.push(mins + ' menit');
  return parts.join(' ');
}

// Hitung MTTR & MTBF per equipment dari seluruh WO Done yang punya equipId
function computeMTTRMTBF() {
  const doneWOs = WO.workorders.filter(w => w.equipId && w.status === 'Done');
  const map = {};

  doneWOs.forEach(w => {
    if (!map[w.equipId]) {
      const eq     = (EQUIP_DB.equipment || []).find(e => e.id === w.equipId);
      const unitId = eq?.unitId || w.unitId || '';
      const areaId = eq?.areaId || w.areaId || '';
      map[w.equipId] = {
        equipId:   w.equipId,
        equipName: getEquipName(w.equipId) || w.equipId,
        unitId, areaId,
        unitName: unitId ? getUnitName(unitId) : '—',
        areaName: areaId ? getAreaName(areaId) : '—',
        repairs:  [],
      };
    }
    map[w.equipId].repairs.push({
      hours:     parseFloat(w.actualHours) || 0,
      createdAt: w.createdAt,
    });
  });

  return Object.values(map).map(eq => {
    // MTTR: rata-rata durasi pengerjaan (actualHours) semua WO Done equipment ini
    const sorted   = eq.repairs.slice().sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    const hoursArr = sorted.map(r => r.hours).filter(h => h > 0);
    const mttrHours = hoursArr.length ? hoursArr.reduce((a,b) => a+b, 0) / hoursArr.length : null;

    // MTBF: rata-rata jarak waktu antar WO berurutan (WO ke-1→ke-2, ke-2→ke-3, dst) per equipment
    let mtbfHours = null;
    if (sorted.length >= 2) {
      const intervals = [];
      for (let i = 1; i < sorted.length; i++) {
        const diffH = (new Date(sorted[i].createdAt) - new Date(sorted[i-1].createdAt)) / 3600000;
        if (diffH > 0) intervals.push(diffH);
      }
      if (intervals.length) mtbfHours = intervals.reduce((a,b) => a+b, 0) / intervals.length;
    }

    return { ...eq, repairCount: sorted.length, mttrHours, mtbfHours };
  }).sort((a,b) => {
    const uCmp = (a.unitName||'').localeCompare(b.unitName||'');
    if (uCmp !== 0) return uCmp;
    const aCmp = (a.areaName||'').localeCompare(b.areaName||'');
    if (aCmp !== 0) return aCmp;
    return (a.equipName||'').localeCompare(b.equipName||'');
  });
}

function onMTBFUnitChange() {
  const unitId  = document.getElementById('mtbf-unit')?.value || '';
  const areaSel = document.getElementById('mtbf-area');
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
  renderMTTRMTBFPage();
}

function resetMTBFFilter() {
  ['mtbf-unit','mtbf-area'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const s = document.getElementById('mtbf-search');
  if (s) s.value = '';
  onMTBFUnitChange();
  renderMTTRMTBFPage();
}

function renderMTTRMTBFPage() {
  const unitSel = document.getElementById('mtbf-unit');
  if (unitSel && unitSel.children.length <= 1) {
    (EQUIP_DB.units || []).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id; opt.textContent = u.name;
      unitSel.appendChild(opt);
    });
  }

  const fUnit = document.getElementById('mtbf-unit')?.value || '';
  const fArea = document.getElementById('mtbf-area')?.value || '';
  const fQ    = (document.getElementById('mtbf-search')?.value || '').toLowerCase();
  const hasFilter = fUnit || fArea || fQ;

  const resetBtn = document.getElementById('mtbf-reset-btn');
  if (resetBtn) resetBtn.style.display = hasFilter ? '' : 'none';

  let list = computeMTTRMTBF();
  if (fUnit) list = list.filter(e => e.unitId === fUnit);
  if (fArea) list = list.filter(e => e.areaId === fArea);
  if (fQ)    list = list.filter(e => e.equipName.toLowerCase().includes(fQ));

  // Summary cards
  const mttrVals = list.map(e => e.mttrHours).filter(v => v !== null && v > 0);
  const mtbfVals = list.map(e => e.mtbfHours).filter(v => v !== null && v > 0);
  const avgMttr  = mttrVals.length ? mttrVals.reduce((a,b)=>a+b,0) / mttrVals.length : null;
  const avgMtbf  = mtbfVals.length ? mtbfVals.reduce((a,b)=>a+b,0) / mtbfVals.length : null;

  setText('mtbf-total-equip',  list.length);
  setText('mtbf-avg-mttr',     formatDurationHM(avgMttr));
  setText('mtbf-avg-mtbf',     formatDurationHM(avgMtbf));
  setText('mtbf-repeat-count', list.filter(e => e.repairCount >= 2).length);

  const tbody = document.getElementById('mtbf-tbody');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState('⏱', hasFilter ? 'Tidak ada equipment yang cocok dengan filter' : 'Belum ada equipment dengan history perbaikan Done')}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(e => {
    const mttrColor = e.mttrHours ? (e.mttrHours <= 4 ? 'var(--green2)' : e.mttrHours <= 12 ? '#c07020' : 'var(--red)') : 'var(--text3)';
    const mtbfColor = e.mtbfHours ? (e.mtbfHours >= 720 ? 'var(--green2)' : e.mtbfHours >= 168 ? '#c07020' : 'var(--red)') : 'var(--text3)';
    const mtbfCell = e.repairCount >= 2
      ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:${mtbfColor};font-weight:600">${formatDurationHM(e.mtbfHours)}</span>`
      : `<span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text3)">— (perlu ≥2x)</span>`;
    return `<tr>
      <td><span style="font-weight:500">${esc(e.equipName)}</span></td>
      <td><span class="td-mono" style="font-size:11px">${esc(e.unitName)}</span></td>
      <td><span style="font-size:12px;color:var(--text2)">${esc(e.areaName)}</span></td>
      <td><span class="td-mono">${e.repairCount}</span></td>
      <td><span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:${mttrColor};font-weight:600">${formatDurationHM(e.mttrHours)}</span></td>
      <td>${mtbfCell}</td>
    </tr>`;
  }).join('');
}

async function downloadEHAExcel(equipId, equipName, unitName, areaName) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  try {
    // Load ExcelJS dari CDN kalau belum ada
    if (typeof ExcelJS === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    const wos = WO.workorders
      .filter(w => w.status === 'Done' && w.equipId === equipId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (!wos.length) {
      toast('Tidak ada history untuk equipment ini', 'error');
      return;
    }

    const nowStr  = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    const nowTime = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});

    const wb    = new ExcelJS.Workbook();
    wb.creator  = SESSION?.nama || 'WO System';
    wb.created  = new Date();
    const sheet = wb.addWorksheet('Equipment History', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ showGridLines: false }],
    });

    const NAVY  = 'FF1A3A6B';
    const GREEN = 'FF4A9E3F';
    const WHITE = 'FFFFFFFF';
    const LIGHT = 'FFEEF3EE';
    const TEXT3 = 'FF7A9A7A';
    const NAVY2 = 'FF0D2240';

    // ── Lebar kolom ──
    sheet.getColumn(1).width = 6;   // No
    sheet.getColumn(2).width = 18;  // Tanggal
    sheet.getColumn(3).width = 38;  // Aktivitas
    sheet.getColumn(4).width = 30;  // Parts
    sheet.getColumn(5).width = 22;  // Teknisi
    sheet.getColumn(6).width = 14;  // Durasi
    sheet.getColumn(7).width = 16;  // WO ID

    let r = 1;

    // ── Header dokumen ──
    sheet.mergeCells(`A${r}:G${r}`);
    sheet.getCell(`A${r}`).value = 'PT PRASAD SEEDS INDONESIA';
    sheet.getCell(`A${r}`).font  = { bold:true, size:14, color:{ argb:NAVY } };
    r++;

    sheet.mergeCells(`A${r}:G${r}`);
    sheet.getCell(`A${r}`).value = 'Laporan History Perbaikan Equipment — Departemen Maintenance';
    sheet.getCell(`A${r}`).font  = { italic:true, size:11, color:{ argb:'FF3A5A3A' } };
    r++;

    sheet.mergeCells(`A${r}:G${r}`);
    sheet.getCell(`A${r}`).value = `Equipment: ${equipName}  |  Unit: ${unitName}  |  Area: ${areaName}`;
    sheet.getCell(`A${r}`).font  = { bold:true, size:10, color:{ argb:NAVY } };
    r++;

    sheet.mergeCells(`A${r}:G${r}`);
    sheet.getCell(`A${r}`).value = `Dicetak: ${nowStr} ${nowTime}  |  Operator: ${SESSION?.nama||'—'} (${SESSION?.role||'—'})  |  Total Perbaikan: ${wos.length}`;
    sheet.getCell(`A${r}`).font  = { size:8.5, color:{ argb:TEXT3 } };
    r += 1;

    // ── Divider ──
    for (let c = 1; c <= 7; c++) {
      sheet.getCell(r, c).border = { bottom:{ style:'medium', color:{ argb:GREEN } } };
    }
    r++;

    // ── Summary KPI ──
    const totalPartsCount = wos.reduce((s,w) => s+(w.partsUsed||[]).reduce((ps,p)=>ps+(p.qty||0),0), 0);
    const hoursArr = wos.filter(w=>parseFloat(w.actualHours)>0).map(w=>parseFloat(w.actualHours));
    const avgH     = hoursArr.length ? (hoursArr.reduce((a,b)=>a+b,0)/hoursArr.length).toFixed(1) : '—';
    const totalH   = hoursArr.length ? hoursArr.reduce((a,b)=>a+b,0).toFixed(1) : '—';

    const kpis = [
      ['Total Perbaikan', wos.length],
      ['Total Parts Diganti', totalPartsCount],
      ['Rata-rata Durasi', avgH + ' jam'],
      ['Total Jam Kerja', totalH + ' jam'],
    ];
    kpis.forEach((k, i) => {
      const col = i + 1;
      const cellVal = sheet.getCell(r, col);
      const cellLbl = sheet.getCell(r+1, col);
      cellVal.value = k[1];
      cellVal.font  = { bold:true, size:18, color:{ argb:NAVY } };
      cellVal.alignment = { horizontal:'center' };
      cellVal.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:LIGHT } };
      cellLbl.value = k[0];
      cellLbl.font  = { size:8, color:{ argb:TEXT3 } };
      cellLbl.alignment = { horizontal:'center' };
      cellLbl.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:LIGHT } };
    });
    // Merge kolom 5-7 jadi catatan
    sheet.mergeCells(`E${r}:G${r}`);
    sheet.getCell(`E${r}`).value = `Perbaikan pertama: ${fmtDate(wos[0]?.createdAt)}`;
    sheet.getCell(`E${r}`).font  = { size:10, color:{ argb:'FF3A5A3A' } };
    sheet.getCell(`E${r}`).alignment = { horizontal:'center', vertical:'middle' };
    sheet.getCell(`E${r}`).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:LIGHT } };
    sheet.mergeCells(`E${r+1}:G${r+1}`);
    sheet.getCell(`E${r+1}`).value = `Perbaikan terakhir: ${fmtDate(wos[wos.length-1]?.createdAt)}`;
    sheet.getCell(`E${r+1}`).font  = { size:10, color:{ argb:'FF3A5A3A' } };
    sheet.getCell(`E${r+1}`).alignment = { horizontal:'center', vertical:'middle' };
    sheet.getCell(`E${r+1}`).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:LIGHT } };
    r += 3;

    // ── Header tabel ──
    const headers = ['No', 'Tanggal Perbaikan', 'Aktivitas yang Dilakukan', 'Parts yang Diganti', 'PIC Teknisi', 'Durasi Aktual', 'WO ID'];
    const headerRow = sheet.getRow(r);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font  = { bold:true, color:{ argb:WHITE }, size:10 };
      cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:NAVY } };
      cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
      cell.border = { bottom:{ style:'medium', color:{ argb:GREEN } } };
    });
    sheet.getRow(r).height = 24;
    r++;

    // ── Baris data ──
    wos.forEach((w, idx) => {
      const techNames = getTechNamesStr(w) || '—';
      const partsArr  = (w.partsUsed || []);
      const partsStr  = partsArr.length
        ? partsArr.map(p => `${p.name} ×${p.qty}`).join('\n')
        : '—';
      const activityStr = w.title + (w.closingNote ? '\n[' + w.closingNote.substring(0,120) + ']' : '');
      const tanggalStr  = fmtDate(w.createdAt) + (w.endTime ? '\nSelesai: ' + w.endTime : '');

      const row = sheet.getRow(r);
      const isEven = idx % 2 === 0;
      const bgColor = isEven ? LIGHT : WHITE;

      const rowData = [
        idx + 1,
        tanggalStr,
        activityStr,
        partsStr,
        techNames,
        w.actualHours ? w.actualHours + ' jam' : '—',
        w.id,
      ];

      rowData.forEach((val, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = val;
        cell.font  = { size:10 };
        cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:bgColor } };
        cell.alignment = { wrapText:true, vertical:'top', horizontal: ci===0 ? 'center' : 'left' };
        cell.border = { bottom:{ style:'hair', color:{ argb:'FFD4E0D4' } } };
      });

      // Warnai baris jika banyak perbaikan (>= 3 WO = peringatan)
      if (partsArr.length >= 3) {
        row.getCell(4).font = { size:10, color:{ argb:'FFC0392B' }, bold:true };
      }

      // Tinggi baris menyesuaikan konten
      const lineCount = Math.max(
        partsArr.length || 1,
        (activityStr.match(/\n/g)||[]).length + 1,
        (tanggalStr.match(/\n/g)||[]).length + 1
      );
      row.height = Math.max(20, lineCount * 16);
      r++;
    });

    // ── Total row ──
    const totalRow = sheet.getRow(r);
    sheet.mergeCells(`A${r}:B${r}`);
    totalRow.getCell(1).value = 'TOTAL';
    totalRow.getCell(1).font  = { bold:true, color:{ argb:WHITE }, size:10 };
    totalRow.getCell(1).fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:NAVY2 } };
    totalRow.getCell(1).alignment = { horizontal:'center' };

    const totalPartsStr = `${totalPartsCount} item spare part dari ${wos.length} perbaikan`;
    sheet.mergeCells(`D${r}:D${r}`);
    totalRow.getCell(4).value = totalPartsStr;
    totalRow.getCell(4).font  = { bold:true, color:{ argb:WHITE }, size:10 };
    totalRow.getCell(4).fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:NAVY2 } };

    totalRow.getCell(6).value = totalH !== '—' ? totalH + ' jam total' : '—';
    totalRow.getCell(6).font  = { bold:true, color:{ argb:WHITE }, size:10 };
    totalRow.getCell(6).fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:NAVY2 } };
    totalRow.getCell(6).alignment = { horizontal:'center' };

    [1,2,3,4,5,6,7].forEach(ci => {
      const cell = totalRow.getCell(ci);
      if (!cell.fill.fgColor) {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:NAVY2 } };
      }
      cell.font = cell.font || {};
      cell.font.color = { argb:WHITE };
    });
    r += 2;

    // ── Footer ──
    sheet.mergeCells(`A${r}:G${r}`);
    sheet.getCell(`A${r}`).value = `PT Prasad Seeds Indonesia — Sistem Work Order Maintenance | Dicetak: ${nowStr} ${nowTime} oleh ${SESSION?.nama||'—'}`;
    sheet.getCell(`A${r}`).font  = { size:7.5, color:{ argb:TEXT3 }, italic:true };

    // ── Trigger download ──
    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type:'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const safeName = equipName.replace(/[^A-Za-z0-9\-_]/g, '_');
    a.download = `History_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);

    toast(`✅ Excel history ${equipName} berhasil didownload`, 'success');
  } catch(e) {
    console.error('Download EHA Excel error:', e);
    toast('❌ Gagal download: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 Excel'; }
  }
}

// ── Generate Executive PPT ──
async function generateExecutivePPT() {
  const btn = document.getElementById('btn-gen-ppt');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

  try {
    // Kumpulkan data
    const all = WO.workorders;
    const now = new Date();
    const nowStr = now.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
    const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

    // Helper stats per unit
    function getUnitStats(unitKeyword) {
      const unitObj = (EQUIP_DB.units||[]).find(u => {
        const n = u.name.toLowerCase();
        return unitKeyword === 'unit1'
          ? (n.includes('unit 1') || n.includes('unit1') || (n.includes('unit') && n.includes('1') && !n.includes('2')))
          : (n.includes('unit 2') || n.includes('unit2') || (n.includes('unit') && n.includes('2') && !n.includes('1')));
      });
      const list = unitObj
        ? all.filter(w => w.unitId === unitObj.id)
        : all.filter(w => {
            if (!w.unitId) return false;
            const n = w.unitId.toLowerCase().replace(/[\s]/g,'');
            return unitKeyword === 'unit1' ? n.includes('unit1') : n.includes('unit2');
          });
      const done    = list.filter(w => w.status === 'Done').length;
      const open    = list.filter(w => w.status === 'Open' || w.status === 'In Progress').length;
      const high    = list.filter(w => w.priority === 'High' || w.priority === 'Critical').length;
      const rate    = list.length ? Math.round(done / list.length * 100) : 0;
      const avgHrs  = (() => {
        const d = list.filter(w => w.status === 'Done' && parseFloat(w.actualHours) > 0);
        if (!d.length) return 0;
        return +(d.reduce((s,w) => s + parseFloat(w.actualHours||0), 0) / d.length).toFixed(1);
      })();
      // Top 5 equipment bermasalah
      const equipCount = {};
      list.forEach(w => {
        if (!w.equipId) return;
        const n = getEquipName(w.equipId) || w.equipId;
        equipCount[n] = (equipCount[n]||0) + 1;
      });
      const topEquip = Object.entries(equipCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
      // WO per type
      const troubleshoot = list.filter(w => w.type === 'Troubleshooting').length;
      const improvement  = list.filter(w => w.type === 'Improvement').length;
      const fabrication  = list.filter(w => w.type === 'Fabrication/Modification').length;
      return { list, done, open, high, rate, avgHrs, topEquip, troubleshoot, improvement, fabrication, name: unitObj?.name || (unitKeyword === 'unit1' ? 'Unit 1' : 'Unit 2') };
    }

    // Monthly trend (12 bulan terakhir atau tahun ini)
    const year = now.getFullYear();
    const monthlyData = MONTHS.map((label, idx) => {
      const masuk   = all.filter(w => { const d = new Date(w.createdAt); return d.getFullYear()===year && d.getMonth()===idx; }).length;
      const selesai = all.filter(w => { if (w.status!=='Done') return false; const d = new Date(w.createdAt); return d.getFullYear()===year && d.getMonth()===idx; }).length;
      return { label, masuk, selesai };
    });

    const totalAll   = all.length;
    const doneAll    = all.filter(w => w.status === 'Done').length;
    const openAll    = all.filter(w => w.status === 'Open' || w.status === 'In Progress').length;
    const rateAll    = totalAll ? Math.round(doneAll / totalAll * 100) : 0;
    const highAll    = all.filter(w => w.priority === 'High' || w.priority === 'Critical').length;
    const avgHrsAll  = (() => {
      const d = all.filter(w => w.status === 'Done' && parseFloat(w.actualHours) > 0);
      if (!d.length) return 0;
      return +(d.reduce((s,w)=>s+parseFloat(w.actualHours||0),0)/d.length).toFixed(1);
    })();

    const u1 = getUnitStats('unit1');
    const u2 = getUnitStats('unit2');

    // ── Build PPT menggunakan pptxgenjs via script worker ──
    // Karena kita di browser, gunakan metode generate di JS murni lalu trigger download
    await buildAndDownloadPPT({
      nowStr, year, MONTHS, monthlyData,
      totalAll, doneAll, openAll, rateAll, highAll, avgHrsAll,
      u1, u2, operator: SESSION?.nama || 'Admin',
    });

    toast('✅ PPT berhasil di-generate & didownload', 'success');
  } catch(e) {
    console.error('PPT error:', e);
    toast('❌ Gagal generate PPT: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Download PPT'; }
  }
}

// ── Build PPT di browser via PptxGenJS CDN ──
async function buildAndDownloadPPT(d) {
  // Load PptxGenJS dari CDN kalau belum ada
  if (typeof PptxGenJS === 'undefined') {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/pptxgenjs@3.11.0/dist/pptxgen.bundle.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const pres = new PptxGenJS();
  pres.layout  = 'LAYOUT_16x9';
  pres.author  = 'PT Prasad Seeds Indonesia';
  pres.title   = 'Executive Report — Work Order Maintenance';
  pres.subject = `Laporan ${d.year}`;

  // ── Palette ──
  const C = {
    navy:    '1A3A6B',
    green:   '3DAA4C',
    green2:  '2A8A3A',
    teal:    '2A7A5A',
    orange:  'FB8C3A',
    red:     'C0392B',
    blue:    '2979C0',
    white:   'FFFFFF',
    bg:      'F4F7F4',
    text:    '1A2A1A',
    text2:   '3A5A3A',
    muted:   '7A9A7A',
    border:  'D4E0D4',
  };

  // ────────────────────────────────────────────────────────────
  // SLIDE 1 — COVER
  // ────────────────────────────────────────────────────────────
  const s1 = pres.addSlide();
  s1.background = { color: C.navy };

  // Accent block kiri
  s1.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.18, h:5.625, fill:{ color: C.green } });

  // Decorative circles
  s1.addShape(pres.shapes.OVAL, { x:7.8, y:-0.5, w:3.2, h:3.2, fill:{ color: 'FFFFFF', transparency:92 }, line:{ color: C.white, width:0 } });
  s1.addShape(pres.shapes.OVAL, { x:8.5, y:3.0,  w:2.0, h:2.0, fill:{ color: C.green,  transparency:80 }, line:{ color: C.white, width:0 } });

  // Company tag
  s1.addText('PT PRASAD SEEDS INDONESIA', {
    x:0.45, y:0.55, w:7, h:0.38,
    fontSize:9, bold:true, color:'6FCF6F', fontFace:'Calibri', charSpacing:4,
  });

  // Dept tag
  s1.addText('MAINTENANCE & ENGINEERING DEPARTMENT', {
    x:0.45, y:0.88, w:7, h:0.3,
    fontSize:8, color:C.muted, fontFace:'Calibri', charSpacing:2,
  });

  // Main title
  s1.addText('EXECUTIVE REPORT', {
    x:0.45, y:1.55, w:8.5, h:0.85,
    fontSize:44, bold:true, color:C.white, fontFace:'Calibri',
  });
  s1.addText('Work Order — Maintenance System', {
    x:0.45, y:2.32, w:8, h:0.55,
    fontSize:22, color:'CADCFC', fontFace:'Calibri',
  });

  // Divider
  s1.addShape(pres.shapes.RECTANGLE, { x:0.45, y:3.05, w:2.5, h:0.04, fill:{ color: C.green } });

  // Period + Operator
  s1.addText(`Tahun ${d.year}  ·  Per ${d.nowStr}`, {
    x:0.45, y:3.25, w:7, h:0.35,
    fontSize:12, color:'CADCFC', fontFace:'Calibri',
  });
  s1.addText(`Dibuat oleh: ${d.operator}`, {
    x:0.45, y:3.60, w:5, h:0.3,
    fontSize:10, color:C.muted, fontFace:'Calibri',
  });

  // Bottom bar
  s1.addShape(pres.shapes.RECTANGLE, { x:0, y:5.15, w:10, h:0.475, fill:{ color: C.green } });
  s1.addText('CONFIDENTIAL — INTERNAL USE ONLY', {
    x:0, y:5.15, w:10, h:0.475,
    fontSize:9, bold:true, color:C.white, align:'center', valign:'middle', fontFace:'Calibri', charSpacing:3,
  });

  // ────────────────────────────────────────────────────────────
  // SLIDE 2 — EXECUTIVE SUMMARY
  // ────────────────────────────────────────────────────────────
  const s2 = pres.addSlide();
  s2.background = { color: C.bg };

  // Header bar
  s2.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.72, fill:{ color: C.navy } });
  s2.addText('EXECUTIVE SUMMARY', {
    x:0.4, y:0, w:7, h:0.72,
    fontSize:18, bold:true, color:C.white, valign:'middle', fontFace:'Calibri', charSpacing:2,
  });
  s2.addText(`Tahun ${d.year}`, {
    x:7.5, y:0, w:2.1, h:0.72,
    fontSize:11, color:'CADCFC', valign:'middle', align:'right', fontFace:'Calibri',
  });

  // KPI cards — row 1 (4 cards)
  const kpiCards = [
    { label:'Total WO',         val: String(d.totalAll),   sub:'Work Order dibuat',  col: C.blue,   ico:'📋' },
    { label:'WO Selesai',       val: String(d.doneAll),    sub:'Status Done',        col: C.green,  ico:'✅' },
    { label:'Completion Rate',  val: d.rateAll + '%',      sub:'dari total WO',      col: d.rateAll>=70 ? C.green : C.orange, ico:'📈' },
    { label:'WO Tertunda',    val: String(d.openAll),    sub:'Open / In Progress', col: d.openAll>5 ? C.red : C.orange, ico:'⚠' },
  ];

  kpiCards.forEach((k, i) => {
    const x = 0.3 + i * 2.38;
    s2.addShape(pres.shapes.RECTANGLE, {
      x, y:0.88, w:2.18, h:1.42,
      fill:{ color: C.white },
      shadow:{ type:'outer', blur:6, offset:2, angle:135, color:'000000', opacity:0.08 },
    });
    // Top accent
    s2.addShape(pres.shapes.RECTANGLE, { x, y:0.88, w:2.18, h:0.055, fill:{ color: k.col } });
    s2.addText(k.ico, { x: x+0.08, y:0.95, w:0.45, h:0.45, fontSize:18 });
    s2.addText(k.val, {
      x, y:1.30, w:2.18, h:0.62,
      fontSize:32, bold:true, color:k.col, align:'center', fontFace:'Calibri',
    });
    s2.addText(k.label, {
      x, y:1.88, w:2.18, h:0.24,
      fontSize:9.5, bold:true, color:C.navy, align:'center', fontFace:'Calibri', charSpacing:0.5,
    });
    s2.addText(k.sub, {
      x, y:2.10, w:2.18, h:0.20,
      fontSize:8, color:C.muted, align:'center', fontFace:'Calibri',
    });
  });

  // Row 2 cards — avg hours + high priority
  const kpi2 = [
    { label:'Avg Durasi (Done)', val: d.avgHrsAll ? d.avgHrsAll + ' jam' : '—', sub:'rata-rata per WO selesai', col: C.teal, ico:'⏱' },
    { label:'High / Critical',   val: String(d.highAll),  sub:'WO prioritas tinggi',  col: d.highAll>3 ? C.red : C.orange, ico:'🔴' },
  ];
  kpi2.forEach((k, i) => {
    const x = 0.3 + i * 4.75;
    s2.addShape(pres.shapes.RECTANGLE, {
      x, y:2.45, w:4.55, h:1.1,
      fill:{ color: C.white },
      shadow:{ type:'outer', blur:5, offset:2, angle:135, color:'000000', opacity:0.07 },
    });
    s2.addShape(pres.shapes.RECTANGLE, { x, y:2.45, w:4.55, h:0.05, fill:{ color: k.col } });
    s2.addText(k.ico + '  ' + k.val, {
      x, y:2.55, w:4.55, h:0.55,
      fontSize:26, bold:true, color:k.col, align:'center', fontFace:'Calibri',
    });
    s2.addText(k.label + '  ·  ' + k.sub, {
      x, y:3.08, w:4.55, h:0.22,
      fontSize:9, color:C.muted, align:'center', fontFace:'Calibri',
    });
  });

  // Highlight notes
  const highlights = [
    `Total ${d.totalAll} WO masuk sepanjang tahun ${d.year} dari seluruh unit.`,
    `Completion rate ${d.rateAll}% — ${d.rateAll >= 80 ? '✅ target tercapai' : d.rateAll >= 60 ? '⚠ perlu peningkatan' : '❌ perlu perhatian serius'}.`,
    `Unit 1: ${d.u1.list.length} WO · ${d.u1.rate}% selesai  |  Unit 2: ${d.u2.list.length} WO · ${d.u2.rate}% selesai.`,
    `${d.highAll} WO berkategori High/Critical — perlu monitoring ketat.`,
  ];
  s2.addShape(pres.shapes.RECTANGLE, { x:0.3, y:3.75, w:9.4, h:1.6, fill:{ color: C.navy, transparency:6 } });
  s2.addText('Key Highlights', { x:0.5, y:3.82, w:4, h:0.3, fontSize:9.5, bold:true, color: C.green, fontFace:'Calibri', charSpacing:1 });
  s2.addText(highlights.map((t,i) => ({ text: t, options:{ bullet:true, breakLine: i<highlights.length-1, fontSize:9.5, color:C.text, fontFace:'Calibri' } })),
    { x:0.5, y:4.10, w:9.1, h:1.1 });

  // Footer
  s2.addText(`PT Prasad Seeds Indonesia  ·  Maintenance & Engineering  ·  ${d.nowStr}`, {
    x:0, y:5.35, w:10, h:0.27, fontSize:7.5, color:C.muted, align:'center', fontFace:'Calibri',
  });

  // ────────────────────────────────────────────────────────────
  // SLIDE 3 — GRAFIK WO MASUK VS SELESAI
  // ────────────────────────────────────────────────────────────
  const s3 = pres.addSlide();
  s3.background = { color: C.bg };

  s3.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.72, fill:{ color: C.navy } });
  s3.addText('GRAFIK PENYELESAIAN WORK ORDER', {
    x:0.4, y:0, w:7.5, h:0.72,
    fontSize:17, bold:true, color:C.white, valign:'middle', fontFace:'Calibri', charSpacing:2,
  });
  s3.addText(`Trend Bulanan ${d.year}`, {
    x:7.3, y:0, w:2.3, h:0.72,
    fontSize:10, color:'CADCFC', valign:'middle', align:'right', fontFace:'Calibri',
  });

  // Combo chart: grouped bar (masuk+selesai) + line completion rate
  const masukVals   = d.monthlyData.map(m => m.masuk);
  const selesaiVals = d.monthlyData.map(m => m.selesai);
  const rateVals    = d.monthlyData.map(m => m.masuk ? Math.round(m.selesai/m.masuk*100) : 0);
  const labels      = d.MONTHS;

  s3.addChart(
    [
      { type: pres.charts.BAR,  data: [{ name:'WO Masuk',   labels, values: masukVals }],   options:{ chartColors:[ C.blue ],  barDir:'col', barGrouping:'clustered' } },
      { type: pres.charts.BAR,  data: [{ name:'WO Selesai', labels, values: selesaiVals }],  options:{ chartColors:[ C.green ], barDir:'col', barGrouping:'clustered' } },
      { type: pres.charts.LINE, data: [{ name:'Rate (%)',   labels, values: rateVals }],     options:{ chartColors:[ C.orange ], lineSize:2.5, lineSmooth:true, secondaryValAxis:true, secondaryCatAxis:true } },
    ],
    {
      x:0.4, y:0.88, w:9.2, h:3.6,
      chartArea:{ fill:{ color: C.white }, roundedCorners:true },
      catAxisLabelColor: C.muted,
      valAxisLabelColor: C.muted,
      valGridLine:{ color:'E2E8F0', size:0.5 },
      catGridLine:{ style:'none' },
      showLegend:true, legendPos:'b',
      showTitle:false,
      valAxes:[
        { showValAxisTitle:true, valAxisTitle:'Jumlah WO',       valAxisTitleColor: C.text2 },
        { showValAxisTitle:true, valAxisTitle:'Completion Rate (%)', valAxisTitleColor: C.orange },
      ],
      catAxes:[{ catAxisTitle:'' },{ catAxisHidden:true }],
    }
  );

  // Summary strip bawah chart
  const totalMasuk = d.monthlyData.reduce((s,m)=>s+m.masuk,0);
  const totalSel   = d.monthlyData.reduce((s,m)=>s+m.selesai,0);
  const peakMonth  = d.monthlyData.reduce((best,m) => m.masuk > best.masuk ? m : best, d.monthlyData[0]);
  const stripItems = [
    ['📥 Total Masuk', String(totalMasuk)],
    ['✅ Total Selesai', String(totalSel)],
    ['📈 Rate Tahunan', totalMasuk ? Math.round(totalSel/totalMasuk*100)+'%' : '—'],
    ['🔺 Bulan Tertinggi', peakMonth.label + ' (' + peakMonth.masuk + ')'],
  ];
  stripItems.forEach(([lbl, val], i) => {
    const x = 0.4 + i * 2.32;
    s3.addShape(pres.shapes.RECTANGLE, { x, y:4.62, w:2.18, h:0.78, fill:{ color: C.navy } });
    s3.addText(val, { x, y:4.66, w:2.18, h:0.38, fontSize:18, bold:true, color:C.green, align:'center', fontFace:'Calibri' });
    s3.addText(lbl, { x, y:5.02, w:2.18, h:0.24, fontSize:8,  color:'CADCFC',   align:'center', fontFace:'Calibri' });
  });

  s3.addText(`PT Prasad Seeds Indonesia  ·  ${d.nowStr}`, {
    x:0, y:5.38, w:10, h:0.24, fontSize:7, color:C.muted, align:'center', fontFace:'Calibri',
  });

  // ────────────────────────────────────────────────────────────
  // SLIDE 4 — SUMMARY UNIT 1
  // ────────────────────────────────────────────────────────────
  function buildUnitSlide(pres, unitData, unitLabel, accentColor) {
    const sl = pres.addSlide();
    sl.background = { color: C.bg };

    // Header
    sl.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.72, fill:{ color: C.navy } });
    sl.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.28, h:0.72, fill:{ color: accentColor } });
    sl.addText('SUMMARY ' + unitLabel.toUpperCase(), {
      x:0.45, y:0, w:7, h:0.72,
      fontSize:17, bold:true, color:C.white, valign:'middle', fontFace:'Calibri', charSpacing:2,
    });
    sl.addText(unitData.name, {
      x:6.5, y:0, w:3.1, h:0.72,
      fontSize:10, color:'CADCFC', valign:'middle', align:'right', fontFace:'Calibri',
    });

    // KPI row
    const uKpi = [
      { label:'Total WO',        val: String(unitData.list.length), col: C.blue  },
      { label:'Selesai',         val: String(unitData.done),         col: C.green },
      { label:'Rate',            val: unitData.rate + '%',           col: unitData.rate>=70 ? C.green : C.orange },
      { label:'Open/In Prog',    val: String(unitData.open),         col: unitData.open>5 ? C.red : C.orange },
      { label:'High Priority',   val: String(unitData.high),         col: unitData.high>2 ? C.red : C.teal },
    ];
    uKpi.forEach((k, i) => {
      const x = 0.28 + i * 1.9;
      sl.addShape(pres.shapes.RECTANGLE, {
        x, y:0.85, w:1.78, h:1.18,
        fill:{ color: C.white },
        shadow:{ type:'outer', blur:5, offset:2, angle:135, color:'000000', opacity:0.08 },
      });
      sl.addShape(pres.shapes.RECTANGLE, { x, y:0.85, w:1.78, h:0.05, fill:{ color: k.col } });
      sl.addText(k.val, {
        x, y:0.95, w:1.78, h:0.6,
        fontSize:28, bold:true, color:k.col, align:'center', fontFace:'Calibri',
      });
      sl.addText(k.label, {
        x, y:1.55, w:1.78, h:0.24,
        fontSize:8.5, color:C.navy, align:'center', fontFace:'Calibri',
      });
    });

    // Left: Pie chart (type distribution)
    sl.addChart(pres.charts.DOUGHNUT, [{
      name: 'Tipe WO', labels: ['Troubleshooting','Improvement','Fabrication/Mod'],
      values: [ unitData.troubleshoot, unitData.improvement, unitData.fabrication ],
    }], {
      x:0.3, y:2.18, w:3.5, h:2.85,
      chartColors:[ C.orange, C.blue, 'E91E8C' ],
      chartArea:{ fill:{ color: C.white }, roundedCorners:true },
      showLegend:true, legendPos:'b',
      showLabel:true, showPercent:true,
      dataLabelColor:C.white, dataLabelFontSize:10,
      holeSize:48,
      showTitle:true, title:'Distribusi Tipe WO', titleFontSize:10, titleColor:C.navy,
    });

    // Right: Bar chart top equipment atau area
    const topEqLabels = unitData.topEquip.length ? unitData.topEquip.map(([n]) => n.length>14 ? n.slice(0,14)+'…' : n) : ['—'];
    const topEqVals   = unitData.topEquip.length ? unitData.topEquip.map(([,v]) => v) : [0];

    sl.addChart(pres.charts.BAR, [{
      name:'Jumlah WO', labels: topEqLabels, values: topEqVals,
    }], {
      x:3.95, y:2.18, w:5.75, h:2.85,
      barDir:'bar',
      chartColors:[ accentColor ],
      chartArea:{ fill:{ color: C.white }, roundedCorners:true },
      catAxisLabelColor: C.muted,
      valAxisLabelColor: C.muted,
      valGridLine:{ color:'E2E8F0', size:0.5 },
      catGridLine:{ style:'none' },
      showValue:true, dataLabelColor:C.white, dataLabelFontSize:9,
      showLegend:false,
      showTitle:true, title:'Top Equipment Bermasalah', titleFontSize:10, titleColor:C.navy,
    });

    // Footer
    sl.addText(`PT Prasad Seeds Indonesia  ·  Maintenance & Engineering  ·  ${d.nowStr}`, {
      x:0, y:5.38, w:10, h:0.24, fontSize:7, color:C.muted, align:'center', fontFace:'Calibri',
    });

    return sl;
  }

  buildUnitSlide(pres, d.u1, 'Unit 1', C.green);
  buildUnitSlide(pres, d.u2, 'Unit 2', C.blue);

  // ── Trigger download ──
  const fileName = `WO_Executive_Report_${d.year}_${d.nowStr.replace(/\s/g,'_')}.pptx`;
  await pres.writeFile({ fileName });
}
// ═══════════════════════════════════════════════════════════════

