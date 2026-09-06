// COMPARISON PAGE
// ═══════════════════════════════════════════════════════════════

let _cmpChartInstance = null;

function initComparisonYearDropdown() {
  const sel = document.getElementById('cmp-year');
  if (!sel) return;
  const years = new Set();
  const nowYear = new Date().getFullYear();
  years.add(nowYear);
  WO.workorders.forEach(w => {
    const y = new Date(w.createdAt).getFullYear();
    if (!isNaN(y)) years.add(y);
  });
  const sorted = [...years].sort((a,b) => b - a);
  const cur = sel.value || String(nowYear);
  sel.innerHTML = sorted.map(y =>
    `<option value="${y}" ${String(y) === cur ? 'selected' : ''}>${y}</option>`
  ).join('');

  // Default dropdown Unit di Comparison ikut unit yang dipilih saat login —
  // hanya sekali (flag _cmpUnitDefaulted) supaya tidak menimpa pilihan manual user
  const unitSel = document.getElementById('cmp-unit');
  if (unitSel && SESSION?.selectedUnit && !unitSel.dataset.defaulted) {
    const matchedUnit = (EQUIP_DB.units || []).find(u => {
      const n = u.id.toLowerCase().replace(/[\s\-_]/g,'');
      const name = u.name.toLowerCase();
      if (SESSION.selectedUnit === 'unit1') return n.includes('unit1') || name.includes('unit 1') || name.includes('unit1');
      if (SESSION.selectedUnit === 'unit2') return n.includes('unit2') || name.includes('unit 2') || name.includes('unit2');
      return false;
    });
    if (matchedUnit) {
      const opt = [...unitSel.options].find(o => o.value === matchedUnit.id);
      if (opt) unitSel.value = matchedUnit.id;
    }
    unitSel.dataset.defaulted = '1';
  }
}

function getComparisonData() {
  const year    = parseInt(document.getElementById('cmp-year')?.value) || new Date().getFullYear();
  const view    = document.getElementById('cmp-view')?.value || 'monthly';
  const MONTHS  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const selectedUnit = document.getElementById('cmp-unit')?.value || 'all';
const all = selectedUnit === 'all'
  ? WO.workorders
  : WO.workorders.filter(w => w.unitId === selectedUnit);

  if (view === 'monthly') {
    const periods = MONTHS.map((label, idx) => {
      const month = idx; // 0-based
      const inList  = all.filter(w => {
        const d = new Date(w.createdAt);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const doneList = all.filter(w => {
        if (w.status !== 'Done') return false;
        // Gunakan doneAt jika ada, fallback ke createdAt untuk estimasi
        const dRef = w.doneAt || w.createdAt;
        const d = new Date(dRef);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const highPri = inList.filter(w => w.priority === 'High' || w.priority === 'Critical').length;
      const avgH    = (() => {
        const d2 = doneList.filter(w => parseFloat(w.actualHours) > 0);
        if (!d2.length) return null;
        return (d2.reduce((s,w) => s + parseFloat(w.actualHours||0), 0) / d2.length).toFixed(1);
      })();
      return {
        label,
        dateLabel: null,
        monthIdx: idx,
        year,
        masuk:        inList.length,
        selesai:      doneList.length,
        backlog:      inList.filter(w => w.status === 'Open' || w.status === 'In Progress').length,
        open:         inList.filter(w => w.status === 'Open' || w.status === 'In Progress').length,
        pendingVerif: inList.filter(w => w.status === 'Pending Verification').length,
        cancelled:    inList.filter(w => w.status === 'Cancelled').length,
        rejected:     inList.filter(w => w.status === 'Rejected').length,
        highPri,
        avgHours: avgH,
      };
    });
    return { periods, year, view };

  } else if (view === 'weekly-month') {
    // Weekly dalam bulan tertentu — tampilkan semua minggu di bulan itu
    const selectedMonth = parseInt(document.getElementById('cmp-month-filter')?.value ?? new Date().getMonth());
    const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    // Cari semua minggu yang bersinggungan dengan bulan ini
    const firstDay = new Date(year, selectedMonth, 1);
    const lastDay  = new Date(year, selectedMonth + 1, 0);
    const weeksInMonth = new Set();
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      weeksInMonth.add(getWeekNumber(new Date(d)));
    }

    const weeksMap = {};
    [...weeksInMonth].forEach(wk => {
      weeksMap[wk] = { masuk:0, selesai:0, backlog:0, pendingVerif:0, cancelled:0, rejected:0, highPri:0, hours:[] };
    });

    all.forEach(w => {
      const d = new Date(w.createdAt);
      if (d.getFullYear() !== year) return;
      const wk = getWeekNumber(d);
      if (!weeksMap[wk]) return; // di luar bulan yang dipilih
      weeksMap[wk].masuk++;
      if (w.status === 'Done') weeksMap[wk].selesai++;
      if (w.status === 'Open' || w.status === 'In Progress') weeksMap[wk].backlog++;
      if (w.status === 'Pending Verification') weeksMap[wk].pendingVerif++;
      if (w.status === 'Cancelled') weeksMap[wk].cancelled++;
      if (w.status === 'Rejected') weeksMap[wk].rejected++;
      if (w.priority === 'High' || w.priority === 'Critical') weeksMap[wk].highPri++;
      if (parseFloat(w.actualHours) > 0) weeksMap[wk].hours.push(parseFloat(w.actualHours));
    });

    const periods = [...weeksInMonth].sort((a,b) => a-b).map((wk, idx) => {
      const r = weeksMap[wk];
      const avgH = r.hours.length ? (r.hours.reduce((a,b)=>a+b,0)/r.hours.length).toFixed(1) : null;
      const range = getWeekDateRange(year, wk);
      return {
        label: `Minggu ${idx+1}`,
        dateLabel: range.label,
        weekNum: wk,
        monthIdx: selectedMonth,
        monthName: MONTHS_ID[selectedMonth],
        year,
        masuk: r.masuk, selesai: r.selesai, backlog: r.backlog,
        open: r.backlog, pendingVerif: r.pendingVerif, cancelled: r.cancelled, rejected: r.rejected,
        highPri: r.highPri, avgHours: avgH,
      };
    });
    return { periods, year, view, monthName: MONTHS_ID[selectedMonth] };

  } else {
    // Weekly semua — 53 minggu, tampilkan hanya minggu yang ada data
    const weeksMap = {};
    all.forEach(w => {
      const d = new Date(w.createdAt);
      if (d.getFullYear() !== year) return;
      const wk = getWeekNumber(d);
      if (!weeksMap[wk]) weeksMap[wk] = { label: 'W'+wk, masuk:0, selesai:0, backlog:0, pendingVerif:0, cancelled:0, rejected:0, highPri:0, hours:[], count:0 };
      weeksMap[wk].masuk++;
      if (w.status === 'Done') weeksMap[wk].selesai++;
      if (w.status === 'Open' || w.status === 'In Progress') weeksMap[wk].backlog++;
      if (w.status === 'Pending Verification') weeksMap[wk].pendingVerif++;
      if (w.status === 'Cancelled') weeksMap[wk].cancelled++;
      if (w.status === 'Rejected') weeksMap[wk].rejected++;
      if (w.priority === 'High' || w.priority === 'Critical') weeksMap[wk].highPri++;
      if (parseFloat(w.actualHours) > 0) weeksMap[wk].hours.push(parseFloat(w.actualHours));
    });
    const periods = Object.keys(weeksMap).sort((a,b) => a-b).map(wk => {
      const r = weeksMap[wk];
      const avgH = r.hours.length ? (r.hours.reduce((a,b)=>a+b,0)/r.hours.length).toFixed(1) : null;
      const range = getWeekDateRange(year, parseInt(wk));
      return {
        label: `W${wk}`,
        dateLabel: range.label,
        weekNum: parseInt(wk),
        year,
        masuk: r.masuk, selesai: r.selesai, backlog: r.backlog,
        open: r.backlog, pendingVerif: r.pendingVerif, cancelled: r.cancelled, rejected: r.rejected,
        highPri: r.highPri, avgHours: avgH,
      };
    });
    return { periods, year, view };
  }
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function getWeekDateRange(year, weekNum) {
  // Cari Senin pertama minggu ke-weekNum di tahun year
  const jan4 = new Date(Date.UTC(year, 0, 4)); // 4 Jan selalu di W1
  const dayOfWeek = jan4.getUTCDay() || 7;
  const w1Monday = new Date(jan4);
  w1Monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));
  const monday = new Date(w1Monday);
  monday.setUTCDate(w1Monday.getUTCDate() + (weekNum - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = d => d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return { monday, sunday, label: `${fmt(monday)}–${fmt(sunday)}` };
}

function onCmpViewChange() {
  const view = document.getElementById('cmp-view')?.value;
  const monthFilter = document.getElementById('cmp-month-filter');
  if (monthFilter) {
    monthFilter.style.display = view === 'weekly-month' ? '' : 'none';
  }
  renderComparison();
}

function renderComparison() {
  initComparisonYearDropdown();
  const mf = document.getElementById('cmp-month-filter');
  if (mf && !mf.dataset.initialized) {
    mf.value = String(new Date().getMonth());
    mf.dataset.initialized = '1';
  }
  const { periods, year } = getComparisonData();

  const totalMasuk  = periods.reduce((s,p) => s+p.masuk,   0);
  const totalDone   = periods.reduce((s,p) => s+p.selesai, 0);
  const rate        = totalMasuk ? Math.round(totalDone / totalMasuk * 100) : 0;
  const selectedUnit = document.getElementById('cmp-unit')?.value || 'all';
  const filteredWO = selectedUnit === 'all'
    ? WO.workorders
    : WO.workorders.filter(w => w.unitId === selectedUnit);
  const backlog = filteredWO.filter(w =>
    w.status === 'Pending Verification' &&
    new Date(w.createdAt).getFullYear() <= year
  ).length;

  setText('cmp-total-in',   totalMasuk);
  setText('cmp-total-done', totalDone);
  setText('cmp-avg-rate',   rate + '%');
  setText('cmp-backlog',    backlog);

  // ── Chart utama ──
  drawComparisonChart(periods);

  // ── Grafik Distribusi Tipe ──
  renderTypeDistributionChart(filteredWO);

  // ── Tabel ──
  const tbody = document.getElementById('cmp-tbody');
  if (!tbody) return;

  let cumulativeBacklog = 0;
  const maxMasuk = Math.max(...periods.map(x => x.masuk), 1);

  tbody.innerHTML = periods.map((p, rowIdx) => {
    cumulativeBacklog += (p.masuk - p.selesai);
    const cr      = p.masuk ? Math.round(p.selesai / p.masuk * 100) : 0;
    const crColor = cr >= 80 ? 'var(--green2)' : cr >= 50 ? '#c07020' : cr > 0 ? 'var(--red)' : 'var(--text3)';
    const bl      = Math.max(0, cumulativeBacklog);

    const periodeCell = p.dateLabel
      ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:var(--navy)">${esc(p.label)}</div>
         <div style="font-size:10px;color:var(--text3);margin-top:2px;white-space:nowrap">${esc(p.dateLabel)}</div>`
      : `<span style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600">${esc(p.label)}</span>`;

    return `<tr class="cmp-row-clickable" data-row-idx="${rowIdx}"
      style="cursor:pointer;transition:background .12s"
      title="Klik untuk lihat detail WO ${p.label}">
      <td>${periodeCell}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:700;color:var(--blue)">${p.masuk}</span>
          <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;width:60px">
            <div style="height:100%;border-radius:3px;background:#2b6cb8;width:${Math.min(100,Math.round(p.masuk/maxMasuk*100))}%"></div>
          </div>
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:700;color:var(--green2)">${p.selesai}</span>
          <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;width:60px">
            <div style="height:100%;border-radius:3px;background:#4a9e3f;width:${Math.min(100,Math.round(p.selesai/maxMasuk*100))}%"></div>
          </div>
        </div>
      </td>
      <td>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:700;color:${crColor}">
          ${p.masuk ? cr + '%' : '—'}
        </span>
        ${p.masuk ? `<div style="height:4px;background:var(--bg3);border-radius:2px;margin-top:4px;width:60px">
          <div style="height:100%;border-radius:2px;background:${crColor};width:${cr}%"></div>
        </div>` : ''}
      </td>
      <td>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;color:${bl > 0 ? 'var(--orange)' : 'var(--text3)'}">
          ${bl > 0 ? bl : '—'}
        </span>
      </td>
      <td>
        <span style="font-size:12px;color:${p.highPri > 0 ? 'var(--red)' : 'var(--text3)'}">
          ${p.highPri > 0 ? '🔴 ' + p.highPri : '—'}
        </span>
      </td>
      <td>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--text2)">
          ${p.avgHours ? p.avgHours + ' jam' : '—'}
        </span>
      </td>
    </tr>`;
  }).join('');

  tbody.onclick = function(e) {
    const row = e.target.closest('tr.cmp-row-clickable');
    if (!row) return;
    const idx = parseInt(row.dataset.rowIdx);
    if (!isNaN(idx)) openCmpDetailModal(periods[idx]);
  };
}

// ── Render grafik distribusi tipe WO ──
function renderTypeDistributionChart(woList) {
  const TYPE_CONFIG = [
    { key: 'Troubleshooting',          color: '#fb8c3a', icon: '🔧' },
    { key: 'Improvement',              color: '#4a9e3f', icon: '📈' },
    { key: 'Fabrication/Modification', color: '#e91e8c', icon: '🔩' },
  ];

  const total = woList.length || 1;
  const counts = TYPE_CONFIG.map(t => ({
    ...t,
    count: woList.filter(w => w.type === t.key).length,
    wos:   woList.filter(w => w.type === t.key),
  }));
  const maxCount = Math.max(...counts.map(c => c.count), 1);

  // Cek apakah container sudah ada, kalau belum inject setelah chart utama
  let container = document.getElementById('cmp-type-dist-section');
  if (!container) {
    const chartPanel = document.querySelector('#page-comparison .detail-panel');
    if (!chartPanel) return;
    container = document.createElement('div');
    container.id = 'cmp-type-dist-section';
    container.className = 'detail-panel';
    container.style.marginBottom = '20px';
    chartPanel.after(container);
  }

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;color:var(--navy)">📊 Distribusi per Tipe WO</div>
      <span style="font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace">${woList.length} total WO</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
      ${counts.map(t => {
        const pct = Math.round(t.count / total * 100);
        const doneCount = t.wos.filter(w => w.status === 'Done').length;
        const doneRate  = t.count ? Math.round(doneCount / t.count * 100) : 0;
        return `
          <div class="cmp-type-card" data-type="${esc(t.key)}"
            style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);
            padding:14px 16px;cursor:pointer;transition:all .15s;position:relative;overflow:hidden;
            border-left:4px solid ${t.color}"
            onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow)';this.style.borderColor='${t.color}'"
            onmouseout="this.style.transform='';this.style.boxShadow='';this.style.borderColor='${t.color}'"
            onclick="openTypeWOModal('${esc(t.key)}')">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
              <div>
                <div style="font-size:18px;margin-bottom:4px">${t.icon}</div>
                <div style="font-size:12px;font-weight:600;color:var(--navy);line-height:1.3">${esc(t.key)}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:28px;font-weight:700;line-height:1;color:${t.color}">${t.count}</div>
                <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3)">${pct}% dari total</div>
              </div>
            </div>
            <div style="height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:8px">
              <div style="height:100%;border-radius:3px;background:${t.color};width:${Math.round(t.count/maxCount*100)}%;transition:width .5s"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3)">
              <span>✅ Selesai: <strong style="color:var(--green2)">${doneCount}</strong></span>
              <span>Rate: <strong style="color:${doneRate>=70?'var(--green2)':doneRate>=40?'#c07020':'var(--red)'}">${t.count?doneRate+'%':'—'}</strong></span>
            </div>
            <div style="position:absolute;bottom:8px;right:10px;font-size:10px;color:var(--text3);
              font-family:'IBM Plex Mono',monospace;opacity:.6">klik untuk detail →</div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── Modal daftar WO berdasarkan tipe ──
function openTypeWOModal(type) {
  const TYPE_COLOR = {
    'Troubleshooting':          '#fb8c3a',
    'Improvement':              '#4a9e3f',
    'Fabrication/Modification': '#e91e8c',
  };
  const TYPE_ICON = {
    'Troubleshooting':          '🔧',
    'Improvement':              '📈',
    'Fabrication/Modification': '🔩',
  };

  const selectedUnit = document.getElementById('cmp-unit')?.value || 'all';
  const year = parseInt(document.getElementById('cmp-year')?.value) || new Date().getFullYear();

  let baseList = selectedUnit === 'all'
    ? WO.workorders
    : WO.workorders.filter(w => w.unitId === selectedUnit);

  // Filter hanya tahun yang dipilih
  baseList = baseList.filter(w => new Date(w.createdAt).getFullYear() === year);

  const woList = baseList.filter(w => w.type === type)
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  const color   = TYPE_COLOR[type] || 'var(--accent)';
  const icon    = TYPE_ICON[type]  || '📋';
  const done    = woList.filter(w => w.status === 'Done').length;
  const open    = woList.filter(w => w.status === 'Open' || w.status === 'In Progress').length;
  const rate    = woList.length ? Math.round(done / woList.length * 100) : 0;

  const woRows = woList.length === 0
    ? `<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">
         Tidak ada WO tipe ini di tahun ${year}
       </div>`
    : woList.map(w => {
        const tech = getTechName(w.techId) || '—';
        const pColor = {Critical:'var(--red)',High:'var(--orange)',Medium:'var(--accent)',Low:'var(--text3)'};
        return `<div style="display:flex;align-items:center;justify-content:space-between;
          padding:10px 14px;border-bottom:1px solid var(--border);gap:10px;cursor:pointer;
          transition:background .1s"
          onmouseover="this.style.background='var(--green-light)'"
          onmouseout="this.style.background=''"
          data-wo-id="${esc(w.id)}"
          onclick="document.getElementById('modal-type-wo').classList.remove('open');setTimeout(()=>showDetail(this.dataset.woId),150)">
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:${color};font-weight:700">${esc(w.id)}</span>
              ${badgeStatus(w.status)}
              ${badgePriority(w.priority)}
            </div>
            <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.title)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:'IBM Plex Mono',monospace">
              👤 ${esc(w.requestorName||'—')}
              ${w.requestorDept?' · '+esc(w.requestorDept):''}
              &nbsp;·&nbsp; 👷 ${esc(tech)}
              &nbsp;·&nbsp; 📅 ${fmtDate(w.createdAt)}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${w.actualHours
              ? `<div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--teal)">⏱ ${w.actualHours} jam</div>`
              : w.dueDate
              ? `<div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--text3)">📅 ${fmtDate(w.dueDate)}</div>`
              : ''}
          </div>
        </div>`;
      }).join('');

  // Buat atau reuse modal
  let modal = document.getElementById('modal-type-wo');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-type-wo';
    modal.style.cssText = `display:none;position:fixed;inset:0;background:rgba(26,58,107,.45);
      backdrop-filter:blur(3px);z-index:500;align-items:center;justify-content:center;padding:20px`;
    modal.innerHTML = `<div id="modal-type-wo-inner"
      style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;
      width:100%;max-width:640px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;
      box-shadow:0 20px 60px rgba(26,58,107,.25)"></div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    document.body.appendChild(modal);
  }

  document.getElementById('modal-type-wo-inner').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
      background:var(--navy);border-bottom:3px solid ${color};flex-shrink:0">
      <div>
        <div style="font-size:15px;font-weight:700;color:#fff">${icon} ${esc(type)}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);font-family:'IBM Plex Mono',monospace;margin-top:2px">
          Tahun ${year}${selectedUnit !== 'all' ? ' · ' + (selectedUnit === 'unit1' ? 'Unit 1' : 'Unit 2') : ''}
        </div>
      </div>
      <button id="modal-type-wo-close"
        style="background:none;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);
        width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid var(--border);flex-shrink:0">
      ${[
        ['Total WO', woList.length, color],
        ['Selesai',  done,          'var(--green2)'],
        ['Rate',     rate+'%',      rate>=70?'var(--green2)':rate>=40?'#c07020':'var(--red)'],
      ].map(([lbl,val,clr]) => `
        <div style="padding:12px 16px;text-align:center;border-right:1px solid var(--border)">
          <div style="font-size:22px;font-weight:700;color:${clr};line-height:1">${val}</div>
          <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3);margin-top:3px;text-transform:uppercase;letter-spacing:.06em">${lbl}</div>
        </div>`).join('')}
    </div>
    <div style="overflow-y:auto;flex:1">
      ${woRows}
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);background:var(--bg3);flex-shrink:0;
      font-size:11px;color:var(--text3);font-family:'IBM Plex Mono',monospace;text-align:center">
      Klik WO untuk melihat detail lengkap
    </div>`;

  modal.style.display = 'flex';

  document.getElementById('modal-type-wo-close').addEventListener('click', () => {
    modal.style.display = 'none';
  });
}

function drawComparisonChart(periods) {
  const canvas = document.getElementById('cmp-chart');
  if (!canvas) return;

  // Destroy existing chart
  if (_cmpChartInstance) {
    _cmpChartInstance.destroy();
    _cmpChartInstance = null;
  }

  // Load Chart.js jika belum ada
  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    s.onload = () => _buildChart(canvas, periods);
    document.head.appendChild(s);
  } else {
    _buildChart(canvas, periods);
  }
}

function _buildChart(canvas, periods) {
  const labels = periods.map(p => p.label);

  const SERIES = [
    { key: 'masuk',        label: 'WO Masuk',            color: '#2b6cb8' },
    { key: 'selesai',      label: 'WO Selesai',          color: '#4a9e3f' },
    { key: 'open',         label: 'WO Open',             color: '#fb8c3a' },
    { key: 'pendingVerif', label: 'Pending Verifikasi',  color: '#b88ff7' },
    { key: 'cancelled',    label: 'Cancelled',           color: '#8891a8' },
    { key: 'rejected',     label: 'Rejected',            color: '#c0392b' },
  ];

  const datasets = SERIES.map(s => ({
    label: s.label,
    data: periods.map(p => p[s.key] || 0),
    backgroundColor: s.color + 'BF', // ~75% opacity
    borderColor: s.color,
    borderWidth: 1.5,
    borderRadius: 4,
  }));

  const ctx = canvas.getContext('2d');
  _cmpChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { family: "'IBM Plex Mono', monospace", size: 10.5 },
            color: '#3a5a3a',
            padding: 14,
            boxWidth: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} WO`,
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx === undefined) return [];
              const p  = periods[idx];
              const cr = p.masuk ? Math.round(p.selesai / p.masuk * 100) : 0;
              return [`Completion Rate: ${p.masuk ? cr + '%' : '—'}`];
            },
          },
          backgroundColor: '#1a3a6b',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,.85)',
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: "'IBM Plex Mono', monospace", size: 12 },
          bodyFont:  { family: "'IBM Plex Mono', monospace", size: 11 },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(212,224,212,0.4)' },
          ticks: { font: { family: "'IBM Plex Mono', monospace", size: 11 }, color: '#7a9a7a' },
        },
        y: {
          position: 'left',
          beginAtZero: true,
          grid: { color: 'rgba(212,224,212,0.4)' },
          ticks: {
            font: { family: "'IBM Plex Mono', monospace", size: 11 },
            color: '#7a9a7a',
            stepSize: 1,
            precision: 0,
          },
          title: { display: true, text: 'Jumlah WO', font: { size: 11 }, color: '#7a9a7a' },
        },
      },
    },
  });
}
// ═══════════════════════════════════════════════════════════════
// COMPARISON DETAIL MODAL
// ═══════════════════════════════════════════════════════════════

function openCmpDetailModal(period) {
  // Kumpulkan WO yang masuk dan selesai di periode ini
  const view = document.getElementById('cmp-view')?.value || 'monthly';
  const year = period.year || new Date().getFullYear();

  let woMasuk  = [];
  let woSelesai = [];

  if (view === 'weekly' && period.weekNum) {
    const range = getWeekDateRange(year, period.weekNum);
    const mon = range.monday;
    const sun = range.sunday;
    woMasuk = WO.workorders.filter(w => {
      const d = new Date(w.createdAt + 'T00:00:00Z');
      return d >= mon && d <= new Date(sun.getTime() + 86399999);
    });
    woSelesai = WO.workorders.filter(w => {
      if (w.status !== 'Done') return false;
      const d = new Date((w.doneAt || w.createdAt) + 'T00:00:00Z');
      return d >= mon && d <= new Date(sun.getTime() + 86399999);
    });
  } else {
    // monthly
    const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const mIdx = period.monthIdx !== undefined ? period.monthIdx : MONTHS.indexOf(period.label);
    woMasuk = WO.workorders.filter(w => {
      const d = new Date(w.createdAt);
      return d.getFullYear() === year && d.getMonth() === mIdx;
    });
    woSelesai = WO.workorders.filter(w => {
      if (w.status !== 'Done') return false;
      const d = new Date(w.doneAt || w.createdAt);
      return d.getFullYear() === year && d.getMonth() === mIdx;
    });
  }

  const cr = woMasuk.length ? Math.round(woSelesai.length / woMasuk.length * 100) : 0;
  const backlog = woMasuk.filter(w => w.status === 'Open' || w.status === 'In Progress').length;
  const totalHours = woSelesai.reduce((s, w) => s + parseFloat(w.actualHours || 0), 0);
  const avgHours = woSelesai.length ? (totalHours / woSelesai.length).toFixed(1) : '—';

  const periodeTitle = period.dateLabel
    ? `${period.label} &nbsp;<span style="font-size:12px;font-weight:400;color:rgba(255,255,255,.65)">${period.dateLabel}</span>`
    : period.label;

  const woRowHtml = (list, highlight) => list.length === 0
    ? `<div style="padding:12px 0;text-align:center;font-size:12px;color:var(--text3)">Tidak ada WO</div>`
    : list.map(w => {
        const tech = getTechName(w.techId) || '—';
        const pColor = {Critical:'var(--red)',High:'var(--orange)',Medium:'var(--accent)',Low:'var(--text3)'};
        return `<div style="display:flex;align-items:center;justify-content:space-between;
          padding:9px 12px;border-bottom:1px solid var(--border);gap:8px;cursor:pointer;
          transition:background .1s" onmouseover="this.style.background='var(--green-light)'"
          onmouseout="this.style.background=''"
          onclick="document.getElementById('modal-cmp-detail').classList.remove('open');setTimeout(()=>showDetail('${esc(w.id)}'),150)">
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--accent);font-weight:700">${esc(w.id)}</span>
              ${badgeStatus(w.status)}
              <span style="width:8px;height:8px;border-radius:50%;background:${pColor[w.priority]||'var(--text3)'};display:inline-block;flex-shrink:0" title="${w.priority}"></span>
            </div>
            <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px">${esc(w.title)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:'IBM Plex Mono',monospace">
              👤 ${esc(w.requestorName||'—')}
              ${w.requestorDept ? ' · '+esc(w.requestorDept) : ''}
              &nbsp;·&nbsp; 👷 ${esc(tech)}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:10px;color:var(--text3);font-family:'IBM Plex Mono',monospace">${fmtDate(w.createdAt)}</div>
            ${w.actualHours ? `<div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--teal);margin-top:2px">⏱ ${w.actualHours} jam</div>` : ''}
          </div>
        </div>`;
      }).join('');

  // Build modal HTML
  const modalHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
      background:var(--navy);border-bottom:2px solid var(--green);flex-shrink:0">
      <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;color:#fff">
        📊 Detail Periode — ${periodeTitle}
      </div>
      <button id="cmp-detail-close-btn"
        style="background:none;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);
        width:26px;height:26px;border-radius:5px;cursor:pointer;font-size:16px;display:flex;
        align-items:center;justify-content:center">✕</button>
    </div>
    <div style="padding:16px 18px;overflow-y:auto;flex:1">
      <!-- KPI mini -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
        ${[
          ['WO Masuk',   woMasuk.length,   'var(--blue)'],
          ['WO Selesai', woSelesai.length, 'var(--green2)'],
          ['Completion', cr+'%',           cr>=80?'var(--green2)':cr>=50?'#c07020':'var(--red)'],
          ['Backlog',    backlog,          backlog>0?'var(--orange)':'var(--text3)'],
        ].map(([lbl,val,clr]) => `
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:${clr};line-height:1">${val}</div>
            <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3);margin-top:4px;text-transform:uppercase;letter-spacing:.07em">${lbl}</div>
          </div>`).join('')}
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:2px solid var(--border);margin-bottom:14px">
        <button id="cmp-dtab-masuk" onclick="switchCmpTab('masuk')"
          style="background:none;border:none;border-bottom:2px solid var(--green);margin-bottom:-2px;
          color:var(--navy);font-size:13px;padding:8px 16px;cursor:pointer;font-weight:600;
          font-family:'IBM Plex Sans',sans-serif">
          📥 WO Masuk (${woMasuk.length})
        </button>
        <button id="cmp-dtab-selesai" onclick="switchCmpTab('selesai')"
          style="background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;
          color:var(--text3);font-size:13px;padding:8px 16px;cursor:pointer;
          font-family:'IBM Plex Sans',sans-serif">
          ✅ WO Selesai (${woSelesai.length})
        </button>
      </div>

      <div id="cmp-dtab-content-masuk" style="display:block">
        ${woRowHtml(woMasuk, 'blue')}
      </div>
      <div id="cmp-dtab-content-selesai" style="display:none">
        ${woRowHtml(woSelesai, 'green')}
      </div>

      ${avgHours !== '—' ? `
      <div style="margin-top:14px;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);
        border-radius:7px;font-size:12px;color:var(--text2);font-family:'IBM Plex Mono',monospace">
        ⏱ Rata-rata durasi aktual WO selesai: <strong style="color:var(--teal)">${avgHours} jam</strong>
        &nbsp;·&nbsp; Total: <strong>${totalHours.toFixed(1)} jam</strong>
      </div>` : ''}
    </div>`;

  // Inject ke modal container
  let modal = document.getElementById('modal-cmp-detail');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-cmp-detail';
    modal.style.cssText = `display:none;position:fixed;inset:0;background:rgba(26,58,107,.45);
      backdrop-filter:blur(3px);z-index:500;align-items:center;justify-content:center;padding:20px`;
    modal.innerHTML = `<div id="modal-cmp-detail-inner"
      style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;
      width:100%;max-width:600px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;
      box-shadow:0 20px 60px rgba(26,58,107,.25)"></div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }

  document.getElementById('modal-cmp-detail-inner').innerHTML = modalHtml;
  modal.style.display = 'flex';
  modal.classList.add('open');

  // Re-attach close button setiap kali modal dibuka
  // (innerHTML replace membuat onclick lama tidak valid)
  document.getElementById('cmp-detail-close-btn').addEventListener('click', function() {
    modal.style.display = 'none';
    modal.classList.remove('open');
  });
}

function switchCmpTab(tab) {
  ['masuk','selesai'].forEach(t => {
    const btn  = document.getElementById('cmp-dtab-' + t);
    const cont = document.getElementById('cmp-dtab-content-' + t);
    if (!btn || !cont) return;
    const isActive = t === tab;
    cont.style.display = isActive ? 'block' : 'none';
    btn.style.borderBottomColor = isActive ? 'var(--green)' : 'transparent';
    btn.style.color  = isActive ? 'var(--navy)' : 'var(--text3)';
    btn.style.fontWeight = isActive ? '600' : '400';
  });
}

async function exportComparisonPDF() {
  const { periods, year } = getComparisonData();
  const view   = document.getElementById('cmp-view')?.value || 'monthly';
  const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const selectedMonth = parseInt(document.getElementById('cmp-month-filter')?.value ?? 0);
  const nowStr = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  const nowTime = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});

  const totalMasuk  = periods.reduce((s,p) => s+p.masuk,   0);
  const totalDone   = periods.reduce((s,p) => s+p.selesai, 0);
  const rate        = totalMasuk ? Math.round(totalDone / totalMasuk * 100) : 0;
  let cum = 0;
  const backlogFinal = periods.reduce((_, p) => {
    cum += (p.masuk - p.selesai); return Math.max(0, cum);
  }, 0);

  const periodeLabel = view === 'weekly-month'
    ? `Mingguan — ${MONTHS_ID[selectedMonth]} ${year}`
    : view === 'weekly'
    ? `Mingguan — Seluruh Tahun ${year}`
    : `Bulanan — Tahun ${year}`;

  const crColor = r => r >= 80 ? '#155724' : r >= 50 ? '#856404' : '#721c24';
  const crBg    = r => r >= 80 ? '#d4edda' : r >= 50 ? '#fff3cd' : '#f8d7da';

  const tableRows = periods.map((p, i) => {
    let cum2 = 0;
    for (let j = 0; j <= i; j++) cum2 += periods[j].masuk - periods[j].selesai;
    const bl = Math.max(0, cum2);
    const cr = p.masuk ? Math.round(p.selesai / p.masuk * 100) : 0;
    return `<tr style="${i%2===0?'background:#f5f8f5':'background:#fff'}">
      <td><strong>${esc(p.label)}</strong>${p.dateLabel ? `<br><span style="font-size:7pt;color:#888">${esc(p.dateLabel)}</span>` : ''}</td>
      <td style="text-align:center;font-weight:700;color:#2b6cb8">${p.masuk}</td>
      <td style="text-align:center;font-weight:700;color:#3a8a30">${p.selesai}</td>
      <td style="text-align:center">
        ${p.masuk ? `<span style="background:${crBg(cr)};color:${crColor(cr)};padding:1pt 6pt;border-radius:4pt;font-weight:700">${cr}%</span>` : '—'}
      </td>
      <td style="text-align:center;color:${bl>0?'#c07020':'#888'};font-weight:${bl>0?'700':'400'}">${bl>0?bl:'—'}</td>
      <td style="text-align:center;color:${p.highPri>0?'#c0392b':'#888'}">${p.highPri>0?p.highPri:'—'}</td>
      <td style="text-align:center;color:#555">${p.avgHours ? p.avgHours+' jam' : '—'}</td>
    </tr>`;
  }).join('');

  // Coba capture chart sebagai gambar
  let chartImgTag = '';
  try {
    const canvas = document.getElementById('cmp-chart');
    if (canvas) {
      const imgData = canvas.toDataURL('image/png');
      chartImgTag = `<img src="${imgData}" style="width:100%;max-height:280pt;object-fit:contain;border:1pt solid #ddd;border-radius:4pt;display:block;margin-bottom:14pt"/>`;
    }
  } catch(e) { /* canvas cross-origin atau belum render */ }

  const html = `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"/>
  <title>WO Comparison — ${periodeLabel}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11pt;color:#222;background:#fff;padding:15mm 12mm}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5pt solid #1a3a6b;padding-bottom:10pt;margin-bottom:14pt}
    .company{font-size:15pt;font-weight:700;color:#1a3a6b}
    .doc-title{font-size:11pt;color:#3a5a3a;margin-top:3pt}
    .meta{text-align:right;font-size:9pt;color:#555;line-height:1.7}
    .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8pt;margin-bottom:14pt}
    .kpi-card{border:1pt solid #ccc;border-radius:5pt;padding:10pt;text-align:center;background:#f9f9f9}
    .kpi-val{font-size:20pt;font-weight:700;color:#1a3a6b;line-height:1}
    .kpi-lbl{font-size:7.5pt;color:#666;text-transform:uppercase;letter-spacing:.05em;margin-top:3pt}
    .section-title{font-size:10pt;font-weight:700;color:#1a3a6b;text-transform:uppercase;
      letter-spacing:.06em;border-left:3pt solid #4a9e3f;padding-left:6pt;margin:12pt 0 7pt}
    table{width:100%;border-collapse:collapse;font-size:9pt}
    thead th{background:#1a3a6b;color:#fff;padding:5pt 6pt;text-align:left;font-size:8pt;
      letter-spacing:.04em;text-transform:uppercase}
    tbody td{padding:4.5pt 6pt;border:.5pt solid #ddd;vertical-align:middle}
    tbody tr:last-child td{border-bottom:1.5pt solid #1a3a6b}
    .footer{margin-top:16pt;border-top:.5pt solid #ccc;padding-top:6pt;
      font-size:8pt;color:#888;display:flex;justify-content:space-between}
    @page{margin:15mm 12mm;size:A4 landscape}
  </style>
  </head><body>
  <div class="header">
    <div>
      <div class="company">PT PRASAD SEEDS INDONESIA</div>
      <div class="doc-title">Laporan Perbandingan WO Masuk vs Selesai</div>
      <div style="font-size:9pt;color:#3a5a3a;margin-top:4pt">Periode: <strong>${esc(periodeLabel)}</strong></div>
    </div>
    <div class="meta">
      Dicetak: ${nowStr} ${nowTime}<br>
      Operator: ${esc(SESSION?.nama||'—')} (${esc(SESSION?.role||'—')})<br>
      Total Masuk: <strong>${totalMasuk}</strong> | Selesai: <strong>${totalDone}</strong>
    </div>
  </div>

  <div class="kpi">
    <div class="kpi-card"><div class="kpi-val">${totalMasuk}</div><div class="kpi-lbl">Total WO Masuk</div></div>
    <div class="kpi-card"><div class="kpi-val">${totalDone}</div><div class="kpi-lbl">Total Selesai</div></div>
    <div class="kpi-card"><div class="kpi-val" style="color:${crColor(rate)}">${rate}%</div><div class="kpi-lbl">Completion Rate</div></div>
    <div class="kpi-card"><div class="kpi-val" style="color:${backlogFinal>0?'#c07020':'#3a8a30'}">${backlogFinal}</div><div class="kpi-lbl">WO Tertunda</div></div>
  </div>

  ${chartImgTag ? `<div class="section-title">Grafik Perbandingan</div>${chartImgTag}` : ''}

  <div class="section-title">Tabel Detail per Periode</div>
  <table>
    <thead><tr>
      <th>Periode</th><th>WO Masuk</th><th>WO Selesai</th>
      <th>Completion Rate</th><th>Tertunda</th><th>High Priority</th><th>Avg Durasi</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="footer">
    <div>PT Prasad Seeds Indonesia — Sistem Work Order Maintenance</div>
    <div>Dicetak: ${nowStr} ${nowTime} oleh ${esc(SESSION?.nama||'—')}</div>
  </div>
  </body></html>`;

  // Buka di tab baru lalu print
  const win = window.open('', '_blank', 'width=1100,height=700');
  if (!win) { toast('Popup diblokir browser. Aktifkan popup untuk export PDF.', 'error'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  toast('📄 Open PDF...', 'success');
}

