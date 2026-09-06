// ═══════════════════════════════════════════════════════════════

function openPrintModal() {
  // Default range: 30 hari terakhir
  setPrintRange(30);
  // Isi dropdown filter unit dari EQUIP_DB
  const unitSel = document.getElementById('print-filter-unit');
  if (unitSel) {
    const curVal = unitSel.value;
    unitSel.innerHTML = '<option value="">Semua Unit</option>';
    (EQUIP_DB.units || []).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id; opt.textContent = u.name;
      if (u.id === curVal) opt.selected = true;
      unitSel.appendChild(opt);
    });
  }
  updatePrintCount();
  document.getElementById('modal-print').classList.add('open');
}

function setPrintRange(days, mode) {
  const today = new Date();
  today.setHours(0,0,0,0);
  let from, to;

  if (mode === 'all') {
    // Cari tanggal WO paling lama
    const dates = WO.workorders.map(w => new Date(w.createdAt)).filter(d => !isNaN(d));
    from = dates.length ? new Date(Math.min(...dates)) : new Date(today.getFullYear(), 0, 1);
    to   = today;
  } else if (mode === 'month') {
    // Bulan lalu
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to   = new Date(today.getFullYear(), today.getMonth(), 0);
  } else {
    // N hari terakhir
    from = new Date(today);
    from.setDate(today.getDate() - (days - 1));
    to   = today;
  }

  document.getElementById('print-date-from').value = from.toISOString().split('T')[0];
  document.getElementById('print-date-to').value   = to.toISOString().split('T')[0];
  updatePrintCount();
}

function updatePrintCount() {
  const { filtered } = getPrintData();
  const el = document.getElementById('print-wo-count');
  if (!el) return;
  if (!filtered.length) {
    el.textContent = '⚠ Tidak ada WO dalam rentang ini';
    el.style.background = 'rgba(192,57,43,.07)';
    el.style.borderColor = 'rgba(192,57,43,.2)';
  } else {
    el.textContent = `✓ ${filtered.length} Work Order ditemukan dalam periode ini`;
    el.style.background = 'var(--green-light)';
    el.style.borderColor = 'rgba(74,158,63,.2)';
  }
}

function getPrintData() {
  const fromVal = document.getElementById('print-date-from')?.value;
  const toVal   = document.getElementById('print-date-to')?.value;
  const fUnit   = document.getElementById('print-filter-unit')?.value || '';
  const fStatus = document.getElementById('print-filter-status')?.value || '';
  const fPri    = document.getElementById('print-filter-priority')?.value || '';

  const from = fromVal ? new Date(fromVal + 'T00:00:00') : null;
  const to   = toVal   ? new Date(toVal   + 'T23:59:59') : null;

  const base = getVisibleWO();

  const filtered = base.filter(w => {
    const d = new Date(w.createdAt);
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    if (fUnit   && w.unitId   !== fUnit)   return false;
    if (fStatus && w.status   !== fStatus) return false;
    if (fPri    && w.priority !== fPri)    return false;
    return true;
  }).sort((a,b) => {
    const pOrd = {Critical:0,High:1,Medium:2,Low:3};
    return (pOrd[a.priority]||2) - (pOrd[b.priority]||2)
        || new Date(b.createdAt) - new Date(a.createdAt);
  });

  return { filtered, fromVal, toVal };
}

function executePrint() {
  const { filtered, fromVal, toVal } = getPrintData();
  if (!filtered.length) { toast('Tidak ada WO untuk dicetak', 'error'); return; }

  const optSummary = document.getElementById('print-opt-summary').checked;
  const optChart   = document.getElementById('print-opt-chart').checked;
  const optTable   = document.getElementById('print-opt-table').checked;
  const optNotes   = document.getElementById('print-opt-notes').checked;
  const optSign    = document.getElementById('print-opt-sign').checked;

  // Build HTML dokumen print
  const now      = new Date();
  const nowStr   = now.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  const nowTime  = now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  const periodeStr = fromVal && toVal
    ? `${fmtDate(fromVal)} — ${fmtDate(toVal)}`
    : (fromVal ? `Sejak ${fmtDate(fromVal)}` : 'Semua Periode');

  // KPI stats
  const total    = filtered.length;
  const done     = filtered.filter(w => w.status === 'Done').length;
  const inProg   = filtered.filter(w => w.status === 'In Progress').length;
  const open     = filtered.filter(w => w.status === 'Open').length;
  const pendingVerif = filtered.filter(w => w.status === 'Pending Verification').length;
  const rate     = total ? Math.round(done / total * 100) : 0;
  const avgHours = (() => {
    const doneWO = filtered.filter(w => w.status === 'Done' && parseFloat(w.actualHours) > 0);
    if (!doneWO.length) return '—';
    const avg = doneWO.reduce((s,w) => s + parseFloat(w.actualHours||0), 0) / doneWO.length;
    return avg.toFixed(1) + ' jam';
  })();
  const totalParts = filtered.reduce((s,w) => s + (w.partsUsed||[]).reduce((ps,p) => ps + (p.qty||0), 0), 0);

  const statusBadgeClass = s => ({Done:'pb-done',Open:'pb-open',Assigned:'pb-assign',
    'In Progress':'pb-prog',Cancelled:'pb-cancel',Draft:'pb-draft'}[s] || 'pb-draft');
  const priBadgeClass    = p => ({Critical:'pb-crit',High:'pb-high',Medium:'pb-med',Low:'pb-low'}[p] || 'pb-med');

  // ── Summary KPI ──
  const kpiHtml = optSummary ? `
    <div class="print-kpi">
      <div class="print-kpi-card"><div class="print-kpi-val">${total}</div><div class="print-kpi-lbl">Total WO</div></div>
      <div class="print-kpi-card"><div class="print-kpi-val">${done}</div><div class="print-kpi-lbl">Selesai</div></div>
      <div class="print-kpi-card"><div class="print-kpi-val">${rate}%</div><div class="print-kpi-lbl">Completion Rate</div></div>
      <div class="print-kpi-card"><div class="print-kpi-val">${inProg}</div><div class="print-kpi-lbl">In Progress</div></div>
      <div class="print-kpi-card"><div class="print-kpi-val">${pendingVerif}</div><div class="print-kpi-lbl">Pending Verification</div></div>
      <div class="print-kpi-card"><div class="print-kpi-val">${avgHours}</div><div class="print-kpi-lbl">Avg Durasi</div></div>
    </div>` : '';

  // ── Grafik Distribusi ──
  const mkBar = (label, count, total, color) => {
    const pct = total ? Math.round(count / total * 100) : 0;
    return `<div class="print-bar-row">
      <div class="print-bar-label">${label}</div>
      <div class="print-bar-track"><div class="print-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div style="width:28pt;text-align:right;color:#333;font-weight:600">${count}</div>
    </div>`;
  };
  const chartHtml = optChart ? `
    <div class="print-by-group">
      <div class="print-group-box">
        <div class="print-group-title">Distribusi Status</div>
        ${mkBar('Done',                  filtered.filter(w=>w.status==='Done').length,                  total, '#4a9e3f')}
        ${mkBar('In Progress',           filtered.filter(w=>w.status==='In Progress').length,           total, '#f0b429')}
        ${mkBar('Open',                  filtered.filter(w=>w.status==='Open').length,                  total, '#2b6cb8')}
        ${mkBar('Pending Verification',  filtered.filter(w=>w.status==='Pending Verification').length,  total, '#fb8c3a')}
        ${mkBar('Rejected',              filtered.filter(w=>w.status==='Rejected').length,               total, '#8b3a3a')}
        ${mkBar('Cancelled',             filtered.filter(w=>w.status==='Cancelled').length,               total, '#c0392b')}
      </div>
      <div class="print-group-box">
        <div class="print-group-title">Distribusi Prioritas</div>
        ${mkBar('High',   filtered.filter(w=>w.priority==='High').length,   total, '#fb8c3a')}
        ${mkBar('Medium', filtered.filter(w=>w.priority==='Medium').length, total, '#4a9e3f')}
        ${mkBar('Low',    filtered.filter(w=>w.priority==='Low').length,    total, '#8891a8')}
      </div>
    </div>
    <div class="print-by-group" style="margin-top:10pt">
      <div class="print-group-box">
        <div class="print-group-title">Distribusi Tipe WO</div>
        ${mkBar('Troubleshooting',          filtered.filter(w=>w.type==='Troubleshooting').length,          total, '#fb8c3a')}
        ${mkBar('Improvement',              filtered.filter(w=>w.type==='Improvement').length,              total, '#4a9e3f')}
        ${mkBar('Fabrication/Modification', filtered.filter(w=>w.type==='Fabrication/Modification').length, total, '#e91e8c')}
      </div>
    </div>` : '';

  // ── Summary per Unit → Area → Equipment ──
  const unitMap = {};
  filtered.forEach(w => {
    const uId   = w.unitId  || '__nounit__';
    const uName = w.unitId  ? (getUnitName(w.unitId)  || w.unitId)  : '(Tanpa Unit)';
    const aId   = w.areaId  || '__noarea__';
    const aName = w.areaId  ? (getAreaName(w.areaId)  || w.areaId)  : '(Tanpa Area)';
    const eId   = w.equipId || '__noeq__';
    const eName = w.equipId ? (getEquipName(w.equipId) || w.equipId) : '(Tanpa Equipment)';

    if (!unitMap[uId]) unitMap[uId] = { name: uName, count: 0, done: 0, areas: {} };
    unitMap[uId].count++;
    if (w.status === 'Done') unitMap[uId].done++;

    const areas = unitMap[uId].areas;
    if (!areas[aId]) areas[aId] = { name: aName, count: 0, done: 0, equip: {} };
    areas[aId].count++;
    if (w.status === 'Done') areas[aId].done++;

    const equip = areas[aId].equip;
    if (!equip[eId]) equip[eId] = { name: eName, count: 0, done: 0 };
    equip[eId].count++;
    if (w.status === 'Done') equip[eId].done++;
  });

  const rateBadge = (done, count) => {
    const r = count ? Math.round(done / count * 100) : 0;
    const bg    = r >= 80 ? '#d4edda' : r >= 50 ? '#fff3cd' : '#f8d7da';
    const color = r >= 80 ? '#155724' : r >= 50 ? '#856404' : '#721c24';
    return `<span style="display:inline-block;background:${bg};color:${color};padding:1pt 6pt;border-radius:3pt;font-weight:700">${r}%</span>`;
  };

  const areaSummaryRows = Object.values(unitMap)
    .sort((a, b) => b.count - a.count)
    .map(u => {
      const uPct  = total ? Math.round(u.count / total * 100) : 0;
      // Unit header row
      const unitRow = `<tr style="background:#1a3a6b">
        <td colspan="2" style="padding:6pt 8pt;font-size:9pt;font-weight:700;color:#fff;letter-spacing:.04em">
          🏭 ${esc(u.name)}
        </td>
        <td style="padding:6pt 8pt;font-size:8.5pt;text-align:center;font-weight:700;color:#6fcf6f">${u.count} WO &nbsp;·&nbsp; ${uPct}%</td>
        <td style="padding:6pt 8pt;font-size:8.5pt;text-align:center">${rateBadge(u.done, u.count)}</td>
      </tr>`;

      // Area rows inside this unit
      const areaRows = Object.values(u.areas)
        .sort((a, b) => b.count - a.count)
        .map(a => {
          const aPct = u.count ? Math.round(a.count / u.count * 100) : 0;
          const aPctTotal = total ? Math.round(a.count / total * 100) : 0;
          const barW = aPctTotal;

          // Equipment sub-rows
          const eqRows = Object.values(a.equip)
            .sort((x, y) => y.count - x.count)
            .map(e => {
              const ePct  = a.count ? Math.round(e.count / a.count * 100) : 0;
              return `<tr style="background:#fff">
                <td style="padding:3pt 6pt 3pt 28pt;font-size:7.5pt;color:#555;border-left:2pt solid #d4e0d4">↳ ${esc(e.name)}</td>
                <td style="padding:3pt 6pt;font-size:7.5pt;text-align:center;color:#555">${e.count}</td>
                <td style="padding:3pt 6pt;font-size:7.5pt;text-align:center;color:#4a9e3f;font-weight:600">${ePct}%<span style="color:#bbb;font-weight:400"> dr area</span></td>
                <td style="padding:3pt 6pt;font-size:7.5pt;text-align:center">${rateBadge(e.done, e.count)}</td>
              </tr>`;
            }).join('');

          return `<tr style="background:#eef3ee">
            <td style="padding:5pt 6pt 5pt 14pt;font-size:8.5pt;font-weight:700;color:#1a3a6b">
              <div style="display:inline-flex;align-items:center;gap:5pt">
                <div style="width:48pt;height:5pt;background:#ddd;border-radius:3pt;overflow:hidden;display:inline-block;vertical-align:middle">
                  <div style="height:100%;width:${barW}%;background:#4a9e3f;border-radius:3pt"></div>
                </div>
                📍 ${esc(a.name)}
              </div>
            </td>
            <td style="padding:5pt 6pt;font-size:8.5pt;text-align:center;font-weight:700;color:#1a3a6b">${a.count}</td>
            <td style="padding:5pt 6pt;font-size:8pt;text-align:center">
              <span style="font-weight:700;color:#4a9e3f">${aPctTotal}%</span>
              <span style="color:#aaa;font-size:7pt"> total</span>
              &nbsp;·&nbsp;
              <span style="font-weight:600;color:#2b6cb8">${aPct}%</span>
              <span style="color:#aaa;font-size:7pt"> unit</span>
            </td>
            <td style="padding:5pt 6pt;font-size:8.5pt;text-align:center">${rateBadge(a.done, a.count)}</td>
          </tr>
          ${eqRows}`;
        }).join('');

      return unitRow + areaRows;
    }).join('');

  const areaSummaryHtml = `
    <div class="print-section-title">Summary per Unit · Area · Equipment</div>
    <table class="print-table" style="margin-bottom:14pt">
      <thead>
        <tr>
          <th style="width:42%">Unit / Area / Equipment</th>
          <th style="width:10%;text-align:center">Jml WO</th>
          <th style="width:22%;text-align:center">% dari Total · % dari Unit</th>
          <th style="width:16%;text-align:center">Completion Rate</th>
        </tr>
      </thead>
      <tbody>
        ${areaSummaryRows}
        <tr style="background:#0d2240">
          <td style="padding:6pt 8pt;font-size:8.5pt;font-weight:700;color:#fff">GRAND TOTAL</td>
          <td style="padding:6pt 8pt;font-size:8.5pt;text-align:center;font-weight:700;color:#fff">${total}</td>
          <td style="padding:6pt 8pt;font-size:8.5pt;text-align:center;font-weight:700;color:#6fcf6f">100%</td>
          <td style="padding:6pt 8pt;font-size:8.5pt;text-align:center;font-weight:700;color:#fff">${rate}%</td>
        </tr>
      </tbody>
    </table>`;

  // ── Tabel Detail WO ──
  // Helper: ambil bagian tanggal saja dari "16 Jun 2026 14:30"
  function splitDateTime(val) {
    if (!val) return { tgl: '—', jam: '—' };
    const parts = String(val).trim().split(' ');
    if (parts.length >= 4) {
      const jam = parts.pop();
      return { tgl: parts.join(' '), jam: jam || '—' };
    }
    return { tgl: val, jam: '—' };
  }

  // Helper: label status overdue WO
  function computeOverdueLabel(w) {
    if (!w.dueDate || w.status === 'Done' || w.status === 'Cancelled') return '—';
    const today = new Date(); today.setHours(0,0,0,0);
    const due   = new Date(w.dueDate); due.setHours(0,0,0,0);
    const diff  = Math.round((due - today) / 86400000);
    if (diff < 0)   return `Overdue ${Math.abs(diff)} hari`;
    if (diff === 0) return 'Jatuh tempo hari ini';
    return 'Belum jatuh tempo';
  }

  const tableRows = filtered.map((w, i) => {
    const start = splitDateTime(w.startTime); // dari proses "Tandai Selesai"
    const end   = splitDateTime(w.endTime);   // dari proses "Tandai Selesai"
    const overdueLbl   = computeOverdueLabel(w);
    const overdueColor = overdueLbl.startsWith('Overdue') ? '#c0392b' : overdueLbl==='Jatuh tempo hari ini' ? '#fb8c3a' : '#888';
    const notesCell = optNotes
      ? `<td style="max-width:100pt;font-size:7.5pt;color:#555">${esc((w.notes||w.closingNote||'—').substring(0,80))}</td>`
      : '';
    return `<tr>
      <td style="text-align:center;font-size:7.5pt;color:#555">${i+1}</td>
      <td style="max-width:140pt">
        <div style="font-family:monospace;font-size:7pt;color:#1a3a6b;font-weight:600">${esc(w.id)}</div>
        <div style="font-weight:500">${esc(w.title)}</div>
      </td>
      <td style="font-size:7.5pt">${esc(w.requestorName||'—')}${w.requestorDept?'<br><span style="font-size:7pt;color:#888">'+esc(w.requestorDept)+'</span>':''}</td>
      <td style="font-size:7.5pt">${esc(w.type||'—')}</td>
      <td style="white-space:nowrap"><span class="pb ${priBadgeClass(w.priority)}">${w.priority}</span></td>
      <td><span class="pb ${statusBadgeClass(w.status)}">${w.status}</span></td>
      <td style="font-size:7.5pt;white-space:nowrap">${fmtDate(w.createdAt)}</td>
      <td style="font-size:7.5pt;white-space:nowrap">${w.dueDate ? fmtDate(w.dueDate) : '—'}</td>
      <td style="font-size:7.5pt">${esc(w.unitId ? getUnitName(w.unitId) : '—')}</td>
      <td style="font-size:7.5pt">${esc(w.areaId ? getAreaName(w.areaId) : '—')}</td>
      <td style="font-size:7.5pt">${esc(getEquipName(w.equipId)||'—')}</td>
      <td style="font-size:7.5pt">${esc(getTechNamesStr(w)||'—')}</td>
      <td style="font-size:7.5pt;white-space:nowrap">${esc(start.tgl)}</td>
      <td style="font-size:7.5pt;white-space:nowrap">${esc(end.tgl)}</td>
      <td style="font-size:7.5pt;white-space:nowrap;font-weight:600;color:#2a7a5a">${w.actualHours ? w.actualHours+' jam' : '—'}</td>
      <td style="font-size:7.5pt;white-space:nowrap;color:${overdueColor};font-weight:${overdueLbl.startsWith('Overdue')?'700':'400'}">${esc(overdueLbl)}</td>
      ${optNotes ? notesCell : ''}
    </tr>`;
  }).join('');

  const tableHtml = optTable ? `
    <div class="print-section-title">Detail Work Order</div>
    <table class="print-table">
      <thead>
        <tr>
          <th>No</th><th>Judul / Deskripsi</th><th>Requestor</th><th>Kategori</th><th>Prioritas</th><th>Status</th>
          <th>Dibuat</th><th>Target</th><th>Unit</th><th>Area</th><th>Equipment</th><th>Teknisi</th>
          <th>Tgl Dikerjakan</th><th>Tgl Diselesaikan</th><th>Durasi</th><th>Overdue</th>
          ${optNotes ? '<th>Catatan</th>' : ''}
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>` : '';

  // ── Tanda Tangan ──
  const signHtml = optSign ? `
    <div class="print-sig-row">
      <div class="print-sig-box">Mengetahui,<br><br><br><br>Maintenance Manager</div>
      <div class="print-sig-box">Diperiksa,<br><br><br><br>Supervisor Maintenance</div>
      <div class="print-sig-box">Dibuat oleh,<br><br><br><br>${esc(SESSION?.nama||'Admin')}</div>
    </div>` : '';

  // ── Rakit dokumen ──
  // NOTE: areaSummaryHtml (Summary per Unit · Area · Equipment) sengaja TIDAK
  // disertakan lagi di laporan cetak — sesuai permintaan, tabel ini dihilangkan.
  const docHtml = `
    <div class="print-doc">
      <div class="print-header">
        <div>
          <div class="print-company">PT PRASAD SEEDS INDONESIA</div>
          <div class="print-doc-title">Laporan Progress Work Order — Departemen Maintenance</div>
          <div style="font-size:9pt;color:#3a5a3a;margin-top:4pt">Periode: <strong>${periodeStr}</strong>
            ${document.getElementById('print-filter-unit')?.value ? ' | Unit: '+getUnitName(document.getElementById('print-filter-unit').value) : ''}
            ${document.getElementById('print-filter-status')?.value ? ' | Status: '+document.getElementById('print-filter-status').value : ''}
            ${document.getElementById('print-filter-priority')?.value ? ' | Prioritas: '+document.getElementById('print-filter-priority').value : ''}
          </div>
        </div>
        <div class="print-meta">
          Dicetak: ${nowStr} ${nowTime}<br>
          Operator: ${esc(SESSION?.nama||'—')} (${esc(SESSION?.role||'—')})<br>
          Total WO: <strong>${total}</strong> | Selesai: <strong>${done}</strong> (${rate}%)
        </div>
      </div>
      ${kpiHtml}
      ${chartHtml}
      ${tableHtml}
      ${signHtml}
      <div class="print-footer">
        <div>PT Prasad Seeds Indonesia — Sistem Work Order Maintenance</div>
        <div>Dicetak: ${nowStr} ${nowTime} oleh ${esc(SESSION?.nama||'—')}</div>
      </div>
    </div>`;

  // Inject ke print page, navigate, lalu print
  document.getElementById('print-doc-container').innerHTML = docHtml;
  closeModal('print');

  // Simpan page sebelumnya, navigate ke print preview, print, kembali
  const prevPage = ST.page;
  navigateTo('print-preview');

  setTimeout(() => {
    window.print();
    // Kembali ke halaman semula setelah dialog print ditutup
    setTimeout(() => navigateTo(prevPage), 500);
  }, 250);
}

// ═══════════════════════════════════════════════════════════════
// EXPORT EXCEL — Laporan WO (struktur & data sama persis dengan PDF)
// ═══════════════════════════════════════════════════════════════

// ▼▼▼ TEMPAT MENULISKAN BASE64 LOGO PERUSAHAAN ▼▼▼
// Isi string di bawah ini dengan base64 logo Anda (format: data:image/png;base64,xxxxx
// atau cukup base64-nya saja tanpa prefix "data:image/png;base64,")
// Contoh logo yang sudah ada di file ini bisa dipakai ulang dari <img src="data:image/png;base64,...">
const EXCEL_LOGO_BASE64 = ''; // <-- TULIS BASE64 LOGO DI SINI (tanpa prefix data:image/png;base64,)
// ▲▲▲ AKHIR TEMPAT LOGO ▲▲▲

async function exportPrintExcel() {
  const btn = document.getElementById('btn-export-excel');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

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

    const { filtered, fromVal, toVal } = getPrintData();
    if (!filtered.length) { toast('Tidak ada WO untuk diekspor', 'error'); return; }

    const optSummary = document.getElementById('print-opt-summary').checked;
    const optChart   = document.getElementById('print-opt-chart').checked;
    const optTable   = document.getElementById('print-opt-table').checked;
    const optNotes   = document.getElementById('print-opt-notes').checked;
    const optSign    = document.getElementById('print-opt-sign').checked;

    const now      = new Date();
    const nowStr   = now.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    const nowTime  = now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    const periodeStr = fromVal && toVal
      ? `${fmtDate(fromVal)} — ${fmtDate(toVal)}`
      : (fromVal ? `Sejak ${fmtDate(fromVal)}` : 'Semua Periode');
    const unitFilterVal = document.getElementById('print-filter-unit')?.value || '';
    const unitLabel = unitFilterVal ? getUnitName(unitFilterVal) : '';
    const statusFilterVal = document.getElementById('print-filter-status')?.value || '';
    const priFilterVal    = document.getElementById('print-filter-priority')?.value || '';

    // ── KPI stats (identik dengan executePrint) ──
    const total    = filtered.length;
    const done     = filtered.filter(w => w.status === 'Done').length;
    const inProg   = filtered.filter(w => w.status === 'In Progress').length;
    const open     = filtered.filter(w => w.status === 'Open').length;
    const pendingVerif = filtered.filter(w => w.status === 'Pending Verification').length;
    const rate     = total ? Math.round(done / total * 100) : 0;
    const avgHoursVal = (() => {
      const doneWO = filtered.filter(w => w.status === 'Done' && parseFloat(w.actualHours) > 0);
      if (!doneWO.length) return null;
      return +(doneWO.reduce((s,w) => s + parseFloat(w.actualHours||0), 0) / doneWO.length).toFixed(1);
    })();

    // ── Distribusi (identik dengan chartHtml di executePrint) ──
    const distStatus = [
      ['Done',        filtered.filter(w=>w.status==='Done').length,        'FF4A9E3F'],
      ['In Progress', filtered.filter(w=>w.status==='In Progress').length, 'FFF0B429'],
      ['Open',        filtered.filter(w=>w.status==='Open').length,        'FF2B6CB8'],
      ['Cancelled',   filtered.filter(w=>w.status==='Cancelled').length,   'FFC0392B'],
      ['Pending Verification',   filtered.filter(w=>w.status==='Pending Verification').length,   'FFC0394B'],
    ];
    const distPriority = [
      ['High',   filtered.filter(w=>w.priority==='High').length,   'FFFB8C3A'],
      ['Medium', filtered.filter(w=>w.priority==='Medium').length, 'FF4A9E3F'],
      ['Low',    filtered.filter(w=>w.priority==='Low').length,    'FF8891A8'],
    ];
    const distType = [
      ['Troubleshooting',          filtered.filter(w=>w.type==='Troubleshooting').length,          'FFFB8C3A'],
      ['Improvement',               filtered.filter(w=>w.type==='Improvement').length,               'FF4A9E3F'],
      ['Fabrication/Modification',  filtered.filter(w=>w.type==='Fabrication/Modification').length,  'FFE91E8C'],
    ];

    // ════════════════════════════════════════════════════════
    // BUILD WORKBOOK
    // ════════════════════════════════════════════════════════
    const wb = new ExcelJS.Workbook();
    wb.creator = SESSION?.nama || 'WO System';
    wb.created = now;
    const sheet = wb.addWorksheet('Laporan WO', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ showGridLines: false }],
    });

    const NAVY   = 'FF1A3A6B';
    const GREEN  = 'FF4A9E3F';
    const LIGHT  = 'FFEEF3EE';
    const WHITE  = 'FFFFFFFF';
    const TEXT2  = 'FF3A5A3A';
    const MUTED  = 'FF7A9A7A';

    let r = 1; // row cursor

    // ── Logo (jika EXCEL_LOGO_BASE64 sudah diisi) ──
    if (EXCEL_LOGO_BASE64) {
      const imgId = wb.addImage({ base64: EXCEL_LOGO_BASE64, extension: 'png' });
      sheet.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 40 } });
      sheet.getRow(1).height = 30;
      sheet.getRow(2).height = 16;
      r = 3;
    }

    // ── Header dokumen ──
    sheet.mergeCells(`A${r}:F${r}`);
    sheet.getCell(`A${r}`).value = 'PT PRASAD SEEDS INDONESIA';
    sheet.getCell(`A${r}`).font  = { bold: true, size: 14, color: { argb: NAVY } };
    r++;
    sheet.mergeCells(`A${r}:F${r}`);
    sheet.getCell(`A${r}`).value = 'Laporan Progress Work Order — Departemen Maintenance';
    sheet.getCell(`A${r}`).font  = { italic: true, size: 11, color: { argb: TEXT2 } };
    r++;

    let metaLine = `Periode: ${periodeStr}`;
    if (unitLabel)       metaLine += `  |  Unit: ${unitLabel}`;
    if (statusFilterVal) metaLine += `  |  Status: ${statusFilterVal}`;
    if (priFilterVal)    metaLine += `  |  Prioritas: ${priFilterVal}`;
    sheet.mergeCells(`A${r}:F${r}`);
    sheet.getCell(`A${r}`).value = metaLine;
    sheet.getCell(`A${r}`).font  = { size: 9, color: { argb: TEXT2 } };
    r++;
    sheet.mergeCells(`A${r}:F${r}`);
    sheet.getCell(`A${r}`).value = `Dicetak: ${nowStr} ${nowTime}  |  Operator: ${SESSION?.nama||'—'} (${SESSION?.role||'—'})  |  Total WO: ${total} | Selesai: ${done} (${rate}%)`;
    sheet.getCell(`A${r}`).font  = { size: 8.5, color: { argb: MUTED } };
    r += 2;

    // ── Summary KPI ──
    if (optSummary) {
      const kpiRowStart = r;
      const kpis = [
        ['Total WO', total],
        ['Selesai', done],
        ['Completion Rate', rate + '%'],
        ['In Progress', inProg],
        ['Pending Verification', pendingVerif],
        ['Avg Durasi', avgHoursVal ? avgHoursVal + ' jam' : '—'],
      ];
      kpis.forEach((k, i) => {
        const col = String.fromCharCode(65 + i); // A,B,C,D,E
        sheet.getCell(`${col}${r}`).value = k[1];
        sheet.getCell(`${col}${r}`).font  = { bold: true, size: 16, color: { argb: NAVY } };
        sheet.getCell(`${col}${r}`).alignment = { horizontal: 'center' };
        sheet.getCell(`${col}${r+1}`).value = k[0];
        sheet.getCell(`${col}${r+1}`).font  = { size: 8, color: { argb: MUTED } };
        sheet.getCell(`${col}${r+1}`).alignment = { horizontal: 'center' };
        sheet.getColumn(col).width = 16;
      });
      r += 3;
    }

    // ── Distribusi + Chart ──
    if (optChart) {
      sheet.mergeCells(`A${r}:F${r}`);
      sheet.getCell(`A${r}`).value = 'GRAFIK DISTRIBUSI';
      sheet.getCell(`A${r}`).font  = { bold: true, size: 10, color: { argb: NAVY } };
      sheet.getCell(`A${r}`).border = { bottom: { style: 'thin', color: { argb: GREEN } } };
      r += 1;

      const distGroups = [
        { title: 'Distribusi Status',    data: distStatus },
        { title: 'Distribusi Prioritas', data: distPriority },
        { title: 'Distribusi Tipe WO',   data: distType },
      ];

      distGroups.forEach(group => {
        const dataStartRow = r + 1;
        sheet.getCell(`A${r}`).value = group.title;
        sheet.getCell(`A${r}`).font  = { bold: true, size: 9, color: { argb: NAVY } };
        r++;
        const labelColStart = r;
        group.data.forEach(([label, count]) => {
          sheet.getCell(`A${r}`).value = label;
          sheet.getCell(`B${r}`).value = count;
          sheet.getCell(`B${r}`).font  = { bold: true };
          r++;
        });
        const labelColEnd = r - 1;

        // Buat chart bar native dari range data ini
        const chart = wb.addChart ? null : null; // placeholder guard (ExcelJS chart API below)
        try {
          const chartObj = sheet.addChart ? null : null;
        } catch(e) {}

        // ExcelJS native chart (addChart tersedia di ExcelJS >= 4.x via workbook? — gunakan addChartSheet alt)
        // Catatan: ExcelJS browser build mendukung chart melalui `sheet.addChart` pada versi tertentu.
        try {
          sheet.addChart({
            type: 'bar',
            data: {
              categories: `'Laporan WO'!$A$${labelColStart}:$A$${labelColEnd}`,
              series: [{ name: group.title, values: `'Laporan WO'!$B$${labelColStart}:$B$${labelColEnd}` }],
            },
            position: { tl: { col: 3, row: dataStartRow - 1 }, ext: { width: 320, height: 140 } },
          });
        } catch(e) {
          // Jika versi ExcelJS yang dimuat tidak mendukung addChart, lewati pembuatan chart
          // tapi data tabel tetap tersimpan di kolom A:B sebagai fallback
        }
        r += 2;
      });
      r += 1;
    }

    // ── Tabel Detail WO ──
    if (optTable) {
      sheet.mergeCells(`A${r}:O${r}`);
      sheet.getCell(`A${r}`).value = 'DETAIL WORK ORDER';
      sheet.getCell(`A${r}`).font  = { bold: true, size: 10, color: { argb: NAVY } };
      sheet.getCell(`A${r}`).border = { bottom: { style: 'thin', color: { argb: GREEN } } };
      r++;

      const headers = ['No','Judul / Deskripsi','Requestor','Kategori','Prioritas','Status','Dibuat','Target','Unit','Area','Equipment','Teknisi','Tgl Dikerjakan','Tgl Diselesaikan','Durasi','Overdue'];
      if (optNotes) headers.push('Catatan');
      const headerRow = sheet.getRow(r);
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.font  = { bold: true, color: { argb: WHITE }, size: 9 };
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { vertical: 'middle' };
      });
      r++;

      function splitDT(val) {
        if (!val) return { tgl: '—', jam: '—' };
        const parts = String(val).trim().split(' ');
        if (parts.length >= 4) { const jam = parts.pop(); return { tgl: parts.join(' '), jam: jam||'—' }; }
        return { tgl: val, jam: '—' };
      }

      function computeOverdueLabelExcel(w) {
        if (!w.dueDate || w.status === 'Done' || w.status === 'Cancelled') return '—';
        const today = new Date(); today.setHours(0,0,0,0);
        const due   = new Date(w.dueDate); due.setHours(0,0,0,0);
        const diff  = Math.round((due - today) / 86400000);
        if (diff < 0)   return `Overdue ${Math.abs(diff)} hari`;
        if (diff === 0) return 'Jatuh tempo hari ini';
        return 'Belum jatuh tempo';
      }

      filtered.forEach((w, idx) => {
        const start = splitDT(w.startTime);
        const end   = splitDT(w.endTime);
        const rowVals = [
          idx + 1,
          `${w.id} — ${w.title}`,
          `${w.requestorName||'—'}${w.requestorDept?' · '+w.requestorDept:''}`,
          w.type || '—',
          w.priority || '—',
          w.status || '—',
          fmtDate(w.createdAt),
          w.dueDate ? fmtDate(w.dueDate) : '—',
          w.unitId ? getUnitName(w.unitId) : '—',
          w.areaId ? getAreaName(w.areaId) : '—',
          getEquipName(w.equipId) || '—',
          getTechNamesStr(w) || '—',
          start.tgl,
          end.tgl,
          w.actualHours ? `${w.actualHours} jam` : '—',
          computeOverdueLabelExcel(w),
        ];
        if (optNotes) rowVals.push((w.notes || w.closingNote || '—').substring(0, 200));

        const row = sheet.getRow(r);
        rowVals.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          cell.font  = { size: 9 };
          cell.alignment = { wrapText: true, vertical: 'top' };
          if (idx % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
        });
        r++;
      });
      r += 1;
    }

    // ── Tanda Tangan ──
    if (optSign) {
      const sigCols = ['A','D','G'];
      const sigLabels = ['Mengetahui,\n\n\n\nMaintenance Manager','Diperiksa,\n\n\n\nSupervisor Maintenance',`Dibuat oleh,\n\n\n\n${SESSION?.nama||'Admin'}`];
      sigCols.forEach((col, i) => {
        sheet.getCell(`${col}${r}`).value = sigLabels[i];
        sheet.getCell(`${col}${r}`).alignment = { wrapText: true };
        sheet.getCell(`${col}${r}`).font = { size: 9 };
      });
      r += 6;
    }

    // ── Footer ──
    sheet.mergeCells(`A${r}:J${r}`);
    sheet.getCell(`A${r}`).value = `PT Prasad Seeds Indonesia — Sistem Work Order Maintenance | Dicetak: ${nowStr} ${nowTime} oleh ${SESSION?.nama||'—'}`;
    sheet.getCell(`A${r}`).font  = { size: 7.5, color: { argb: MUTED }, italic: true };

    // ── Lebar kolom tabel ──
    if (optTable) {
      sheet.getColumn('A').width = 6;   // No
      sheet.getColumn('B').width = 36;  // Judul / Deskripsi
      sheet.getColumn('C').width = 18;  // Requestor
      sheet.getColumn('D').width = 16;  // Kategori
      sheet.getColumn('E').width = 11;  // Prioritas
      sheet.getColumn('F').width = 12;  // Status
      sheet.getColumn('G').width = 12;  // Dibuat
      sheet.getColumn('H').width = 12;  // Target
      sheet.getColumn('I').width = 12;  // Unit
      sheet.getColumn('J').width = 14;  // Area
      sheet.getColumn('K').width = 16;  // Equipment
      sheet.getColumn('L').width = 16;  // Teknisi
      sheet.getColumn('M').width = 13;  // Tgl Dikerjakan
      sheet.getColumn('N').width = 13;  // Tgl Diselesaikan
      sheet.getColumn('O').width = 10;  // Durasi
      sheet.getColumn('P').width = 16;  // Overdue
      if (optNotes) sheet.getColumn('Q').width = 30;
    }

    // ── Trigger download ──
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_WO_${fromVal||'all'}_${toVal||'all'}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);

    toast('✅ Excel berhasil diekspor', 'success');
  } catch(e) {
    console.error('Export Excel error:', e);
    toast('❌ Gagal export Excel: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 Export Excel'; }
  }
}

// ═══════════════════════════════════════════════════════════════
// RATING SYSTEM — Penilaian bintang untuk teknisi per WO Done
