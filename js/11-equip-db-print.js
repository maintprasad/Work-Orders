// ═══════════════════════════════════════════════════════════════
async function pullEquipDB() {
  try {
    const r = await fetch(CFG.equipDbApi + '?fn=read', { mode: 'cors' });
    const d = await r.json();
    if (d.ok && d.data) {
      EQUIP_DB.units     = d.data.units     || [];
      EQUIP_DB.areas     = d.data.areas     || [];
      EQUIP_DB.equipment = d.data.equipment || [];
      EQUIP_DB.parts     = d.data.parts     || [];
      const cached = JSON.parse(localStorage.getItem(CFG.equipDbKey) || '{}');
      Object.assign(cached, EQUIP_DB);
      localStorage.setItem(CFG.equipDbKey, JSON.stringify(cached));
      setText('syncStatus', 'Data Equipment DB dimuat dari API');
    }
  } catch {
    setText('syncStatus', 'Mode offline — tidak bisa load Equipment DB');
  }
}

// ═══════════════════════════════════════════════════════════════
// CETAK PDF SINGLE WO — Format mengikuti TEMPLATE_WO (F-MTC-01.01)
// ═══════════════════════════════════════════════════════════════

// Logo base64 — diambil dari <img> yang sudah ada di halaman
function getLogoBase64() {
  const imgs = document.querySelectorAll('img');
  for (const img of imgs) {
    if (img.src && img.src.startsWith('data:image/png;base64,') && img.src.length > 500) {
      return img.src; // sudah format data:image/png;base64,...
    }
  }
  return '';
}

// ── Bangun section lampiran foto (Before/After/Verification) untuk form cetak WO ──
function printPhotoAttachmentSection(wo) {
  const photos = wo.photos || { before: [], after: [], verification: [] };
  const CATS = [
    { key: 'before',       label: 'BEFORE',       color: '#2b6cb8' },
    { key: 'after',        label: 'AFTER',        color: '#4a9e3f' },
    { key: 'verification', label: 'VERIFICATION', color: '#b88ff7' },
  ];

  // Gabungkan semua foto jadi satu list mengalir, tiap foto bawa label kategorinya sendiri
  // — tidak ada lagi kotak kosong karena tidak dipaksa 3 kotak per kategori.
  const allPhotos = [];
  CATS.forEach(cat => {
    (photos[cat.key] || []).forEach((p, i) => {
      allPhotos.push({ ...p, catLabel: cat.label, catColor: cat.color, seq: i + 1 });
    });
  });

  if (!allPhotos.length) return '';

  const cellsArr = allPhotos.map(p => {
    const imgUrl = p.id ? `https://lh3.googleusercontent.com/d/${p.id}=w400` : (p.url || '');
    return `<td style="width:33.3%;padding:5pt;text-align:center;vertical-align:top;border:.5pt solid #ddd">
      <div style="font-size:6.5pt;font-weight:700;color:#fff;background:${p.catColor};display:inline-block;padding:1pt 7pt;border-radius:3pt;margin-bottom:3pt;letter-spacing:.03em">${p.catLabel}</div>
      <img src="${imgUrl}" style="width:100%;max-height:120pt;object-fit:cover;border:.5pt solid #ccc;border-radius:3pt;display:block;margin:3pt 0"/>
      <div style="font-size:6.5pt;color:#555">Foto ${p.seq}${p.addedBy ? ' — ' + p.addedBy : ''}</div>
      ${p.addedAt ? `<div style="font-size:6pt;color:#999">${p.addedAt}</div>` : ''}
    </td>`;
  });

  const rows = [];
  for (let i = 0; i < cellsArr.length; i += 3) {
    rows.push(`<tr>${cellsArr.slice(i, i + 3).join('')}</tr>`);
  }

  return `
    <div style="margin-top:10pt;page-break-inside:avoid">
      <div class="print-section-title" style="margin-top:8pt">Lampiran Foto Dokumentasi (${allPhotos.length} foto)</div>
      <table style="width:100%;border-collapse:collapse;border:.5pt solid #ddd">
        ${rows.join('')}
      </table>
    </div>`;
}

function printSingleWO(woId) {
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;

  const now      = new Date();
  const nowStr   = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const nowTime  = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  // ── Data WO ──
  const equipName  = getEquipName(wo.equipId) || '—';
  const unitName   = wo.unitId  ? getUnitName(wo.unitId)  : '—';
  const areaName   = wo.areaId  ? getAreaName(wo.areaId)  : '—';
  const techNames  = getTechNamesStr(wo) || '—';
  const reqName    = wo.requestorName || '—';
  const reqDept    = wo.requestorDept || '';
  const logoSrc    = getLogoBase64();

  // ── Department checkboxes (cocokkan ke area/dept requestor) ──
  const depts = ['Dryer', 'Processing', 'Office', 'WH', 'Maintenance'];
  function deptCheck(label) {
    const match = (reqDept + ' ' + areaName + ' ' + unitName).toLowerCase();
    return match.includes(label.toLowerCase())
      ? '&#9745;' // ☑
      : '&#9744;'; // ☐
  }

  // ── Jenis Pekerjaan (dari type WO) ──
  const isElectrical  = wo.type === 'Troubleshooting';
  const isMechanical  = wo.type === 'Improvement' || wo.type === 'Fabrication/Modification';

  // ── Maintenance Job Clarification ──
  const isBM    = wo.type === 'Troubleshooting';
  const isPM    = false; // PM tidak ada di list type WO ini
  const isOther = wo.type === 'Fabrication/Modification';

  // ── Priority checkboxes ──
  const pHigh   = wo.priority === 'High'   || wo.priority === 'Critical' ? '&#9745;' : '&#9744;';
  const pMedium = wo.priority === 'Medium' ? '&#9745;' : '&#9744;';
  const pLow    = wo.priority === 'Low'    ? '&#9745;' : '&#9744;';

  // ── Status checkboxes ──
  const sDone     = wo.status === 'Done'                    ? '&#9745;' : '&#9744;';
  const sPostpone = wo.status === 'Cancelled'               ? '&#9745;' : '&#9744;';

  // ── Parts table ──
  const partsRows = (() => {
    const rows = (wo.partsUsed || []).map(p => `
      <tr>
        <td style="border:1pt solid #333;padding:3pt 5pt;font-size:9pt">${esc(p.name)}</td>
        <td style="border:1pt solid #333;padding:3pt 5pt;font-size:9pt;text-align:center">${p.qty} ${p.uom || 'pcs'}</td>
      </tr>`).join('');
    // Minimal 3 baris kosong
    const emptyCount = Math.max(0, 3 - (wo.partsUsed || []).length);
    const emptyRows = Array(emptyCount).fill(`
      <tr>
        <td style="border:1pt solid #333;padding:1.5pt 4pt;font-size:9pt">&nbsp;</td>
        <td style="border:1pt solid #333;padding:1.5pt 4pt;font-size:9pt">&nbsp;</td>
      </tr>`).join('');
    return rows + emptyRows;
  })();

  // ── Worktime table ──
  const startParts = wo.startTime ? wo.startTime.split(' ') : [];
  const endParts   = wo.endTime   ? wo.endTime.split(' ')   : [];
  const startDate  = startParts.length >= 3 ? startParts.slice(0, -1).join(' ') : (wo.startTime || '');
  const startTime  = startParts.length >= 1 ? startParts[startParts.length - 1] : '';
  const endDate    = endParts.length >= 3   ? endParts.slice(0, -1).join(' ')   : (wo.endTime   || '');
  const endTime2   = endParts.length >= 1   ? endParts[endParts.length - 1]     : '';

  // ── Checklist area condition ──
  // Kita pakai field closingNote sebagai "Action by Technician"
  const actionByTech = wo.closingNote || wo.notes || '';

  // ── Tanggal WO dibuat ──
  const woDate = wo.createdAt ? new Date(wo.createdAt).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric'
  }) : '—';

  // ── Logo img tag ──
  const logoTag = logoSrc
    ? `<img src="${logoSrc}" style="height:45pt;width:auto;object-fit:contain;display:block"/>`
    : `<div style="font-size:14pt;font-weight:700;color:#1a3a6b">PT PRASAD SEEDS INDONESIA</div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>WO ${esc(wo.id)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    font-size: 9pt;
    color: #000;
    background: #fff;
  }
  @page {
    size: A4 portrait;
    margin: 10mm 10mm 8mm 10mm;
  }
  .page {
    width: 100%;
    padding: 0;
    page-break-inside: avoid;
  }

  /* ── HEADER ── */
  .header-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5pt solid #333;
    margin-bottom: 0;
  }
  .header-table td, .header-table th {
    padding: 2pt 4pt;
    vertical-align: middle;
    font-size: 9pt;
  }
  .header-logo-cell {
    width: 80pt;
    text-align: center;
    border-right: 1.5pt solid #333;
    padding: 4pt;
  }
  .header-title-cell {
    text-align: center;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 3pt;
    color: #1a3a6b;
    border-right: 1.5pt solid #333;
  }
  .header-meta-cell {
    width: 130pt;
    font-size: 8pt;
    padding: 2pt 6pt;
  }
  .header-meta-cell table {
    width: 100%;
    border-collapse: collapse;
  }
  .header-meta-cell td {
    padding: 1pt 2pt;
    font-size: 8.5pt;
    white-space: nowrap;
  }
  .form-no-label {
    color: #555;
    font-size: 7.5pt;
  }

  /* ── SECTION LABELS ── */
  .section-row {
    border: 1pt solid #333;
    border-top: none;
  }
  .field-table {
    width: 100%;
    border-collapse: collapse;
  }
  .field-table td {
    padding: 2pt 4pt;
    font-size: 9pt;
    vertical-align: top;
  }

  /* ── CHECKBOX ── */
  .cb { font-size: 10pt; }

  /* ── JOB / ACTION AREA — kunci utama: height tetap, tidak pakai min-height ── */
  .job-area {
    width: 100%;
    border-collapse: collapse;
    border: 1pt solid #333;
    border-top: none;
    table-layout: fixed;
    page-break-inside: avoid;
  }
  .job-area td {
    padding: 4pt 5pt;
    font-size: 9pt;
    vertical-align: top;
    /* TIDAK ada height/min-height — biarkan konten yang menentukan tinggi */
  }
  .job-header {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5pt;
    color: #1a3a6b;
    border-bottom: 1pt solid #ccc;
    padding-bottom: 2pt;
    margin-bottom: 3pt;
  }
  .job-content {
    font-size: 9pt;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: hidden;
  }

  /* ── PRIORITY / STATUS ── */
  .ps-table {
    width: 100%;
    border-collapse: collapse;
  }
  .ps-table td {
    padding: 0pt 3pt;
    font-size: 9pt;
    line-height: 1.3;
  }
  .ps-label {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5pt;
    color: #1a3a6b;
    border-bottom: 1pt solid #ccc;
    padding-bottom: 1pt;
    margin-bottom: 2pt;
  }

  /* ── PARTS & WORKTIME ── */
  .bottom-table {
    width: 100%;
    border-collapse: collapse;
    border: 1pt solid #333;
    border-top: none;
    page-break-inside: avoid;
  }
  .bottom-table > tbody > tr > td {
    vertical-align: top;
    padding: 3pt 5pt;
    font-size: 9pt;
  }
  .parts-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 2pt;
  }
  .parts-table th {
    background: #eef3ee;
    border: 1pt solid #333;
    padding: 2pt 4pt;
    font-size: 8pt;
    text-align: center;
  }
  .parts-table td {
    border: 1pt solid #333;
    padding: 2pt 4pt;
    font-size: 9pt;
    height: 14pt;         /* fixed row height — tidak terlalu tinggi */
  }
  .worktime-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 2pt;
  }
  .worktime-table th {
    background: #eef3ee;
    border: 1pt solid #333;
    padding: 2pt 4pt;
    font-size: 8pt;
    text-align: center;
  }
  .worktime-table td {
    border: 1pt solid #333;
    padding: 2pt 4pt;
    font-size: 9pt;
    height: 14pt;
  }

  /* ── CONDITION CHECKLIST ── */
  .condition-table {
    width: 100%;
    border-collapse: collapse;
    border: 1pt solid #333;
    border-top: none;
    page-break-inside: avoid;
  }
  .condition-table td {
    padding: 2pt 5pt;
    font-size: 8.5pt;
    border-bottom: .5pt solid #ddd;
    line-height: 1.4;
  }

  /* ── SIGNATURE — compact ── */
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1pt solid #333;
    border-top: none;
    table-layout: fixed;
    page-break-inside: avoid;
  }
  .sig-table td {
    border-right: 1pt solid #333;
    padding: 3pt 4pt;
    font-size: 8pt;
    vertical-align: top;
    text-align: center;
    width: 20%;
  }
  .sig-table td:last-child { border-right: none; }
  .sig-role {
    font-size: 7.5pt;
    color: #555;
    margin-bottom: 1pt;
  }
  .sig-name-line {
    border-top: 1pt solid #333;
    margin: 22pt 4pt 2pt;  /* dikecilkan dari 30pt → 22pt */
  }
  .sig-detail {
    font-size: 7.5pt;
    text-align: left;
    margin-top: 1pt;
  }
  .sig-detail table { width: 100%; border-collapse: collapse; }
  .sig-detail td { padding: 0pt 0; font-size: 7.5pt; border: none; line-height: 1.5; }

  /* ── FOOTER NOTE ── */
  .footer-note {
    border: 1pt solid #333;
    border-top: none;
    padding: 2pt 5pt;
    font-size: 7pt;
    color: #555;
    display: flex;
    justify-content: space-between;
  }
  .wo-id-watermark {
    text-align: center;
    font-size: 6.5pt;
    color: #aaa;
    margin-top: 2pt;
    font-family: 'Courier New', monospace;
  }
</style>
</head>
<body>
<div class="page">

  <!-- ══════════ HEADER ══════════ -->
  <table class="header-table">
    <tr>
      <td class="header-logo-cell" rowspan="2">
        ${logoTag}
        <div style="font-size:7pt;color:#555;margin-top:2pt">PT Prasad Seeds Indonesia</div>
      </td>
      <td class="header-title-cell" rowspan="2">WORK ORDER</td>
      <td class="header-meta-cell">
        <table>
          <tr><td class="form-no-label">Form No</td><td>:</td><td style="font-weight:700">F-MTC-01.01</td></tr>
          <tr><td class="form-no-label">Rev. No</td><td>:</td><td>0</td></tr>
          <tr><td class="form-no-label">Date</td><td>:</td><td>${esc(woDate)}</td></tr>
          <tr><td class="form-no-label">WO No.</td><td>:</td><td style="font-weight:700;color:#1a3a6b">${esc(wo.id)}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ══════════ DIAJUKAN / DEPT ══════════ -->
  <table class="field-table section-row" style="border-collapse:collapse;border:1pt solid #333;border-top:none">
    <tr>
      <td style="width:40%;border-right:1pt solid #333;padding:3pt 5pt">
        <span style="color:#555">Diajukan Oleh&nbsp;&nbsp;:</span>
        <strong>${esc(reqName)}</strong>
      </td>
      <td style="padding:3pt 5pt">
        <span style="color:#555">Departement&nbsp;&nbsp;:</span>
        <span class="cb">${deptCheck('Dryer')}</span> Dryer&nbsp;&nbsp;
        <span class="cb">${deptCheck('Processing')}</span> Processing&nbsp;&nbsp;
        <span class="cb">${deptCheck('Office')}</span> Office&nbsp;&nbsp;
        <span class="cb">${deptCheck('WH')}</span> WH&nbsp;&nbsp;
        <span class="cb">${deptCheck('Maintenance')}</span> Maintenance
        ${reqDept ? `<span style="margin-left:6pt;font-size:8pt;color:#1a3a6b">(${esc(reqDept)})</span>` : ''}
      </td>
    </tr>
  </table>

  <!-- ══════════ MESIN / KODE / POST BUDGET ══════════ -->
  <table class="field-table" style="border-collapse:collapse;border:1pt solid #333;border-top:none;width:100%">
    <tr>
      <td style="width:48%;border-right:1pt solid #333;padding:3pt 5pt">
        <span style="color:#555">Nama Mesin&nbsp;&nbsp;:</span>
        <strong>${esc(equipName)}</strong>
      </td>
      <td style="padding:3pt 5pt">
        <span style="color:#555">Part Cost</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:
        <span style="font-family:'Courier New',monospace;font-size:8pt">
          ${(wo.partsUsed||[]).length ? '(lihat daftar parts)' : '—'}
        </span>
        &nbsp;&nbsp; IDR
      </td>
    </tr>
    <tr>
      <td style="border-right:1pt solid #333;padding:3pt 5pt;border-top:.5pt solid #ddd">
        <span style="color:#555">Kode Mesin&nbsp;&nbsp;&nbsp;:</span>
        ${esc(wo.equipId || '—')}
      </td>
      <td style="padding:3pt 5pt;border-top:.5pt solid #ddd">
        <span style="color:#555">Manpower Cost&nbsp;:</span>
        ${wo.actualHours ? `${wo.actualHours} jam` : '—'}
        &nbsp;&nbsp; IDR
      </td>
    </tr>
    <tr>
      <td style="border-right:1pt solid #333;padding:3pt 5pt;border-top:.5pt solid #ddd">
        <span style="color:#555">Post Budget&nbsp;&nbsp;:</span>
        <span class="cb">&#9744;</span> Equipment&nbsp;&nbsp;
        <span class="cb">&#9744;</span> Supply&nbsp;&nbsp;
        <span class="cb">&#9744;</span> Building
      </td>
      <td style="padding:3pt 5pt;border-top:.5pt solid #ddd">
        <span style="color:#555">Total Cost&nbsp;&nbsp;&nbsp;&nbsp;:</span>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; IDR
      </td>
    </tr>
  </table>

  <!-- ══════════ JOB CLARIFICATION ══════════ -->
  <table class="field-table" style="border-collapse:collapse;border:1pt solid #333;border-top:none;width:100%">
    <tr>
      <td style="padding:3pt 5pt">
        <span style="color:#555;font-size:8.5pt">Maintenance Job Clarification&nbsp;:</span>&nbsp;&nbsp;
        <span class="cb">${isPM ? '&#9745;' : '&#9744;'}</span> PM&nbsp;&nbsp;
        <span class="cb">${isBM ? '&#9745;' : '&#9744;'}</span> BM&nbsp;&nbsp;
        <span class="cb">&#9744;</span> Setting&nbsp;&nbsp;
        <span class="cb">${isOther ? '&#9745;' : '&#9744;'}</span> Other
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <span style="color:#555">Jenis Pekerjaan&nbsp;:</span>&nbsp;&nbsp;
        <span class="cb">${isElectrical ? '&#9745;' : '&#9744;'}</span> Electrical&nbsp;&nbsp;
        <span class="cb">${isMechanical ? '&#9745;' : '&#9744;'}</span> Mech&nbsp;&nbsp;
        <span class="cb">&#9744;</span> Civil&nbsp;&nbsp;
        <span class="cb">&#9744;</span> Lain2
      </td>
    </tr>
  </table>

  <!-- ══════════ JOB ASKED / ACTION BY TECH / PRIORITY+STATUS ══════════ -->
  <table class="job-area">
    <tr>
      <td style="width:45%;border-right:1pt solid #333;vertical-align:top;padding:4pt 6pt">
        <div class="job-header">Job that asked</div>
        <div class="job-content">${esc(wo.title)}${wo.notes ? '\n\n' + esc(wo.notes.substring(0, 200)) : ''}</div>
      </td>
      <td style="width:38%;border-right:1pt solid #333;vertical-align:top;padding:4pt 6pt">
        <div class="job-header">Action by Technician</div>
        <div class="job-content">${esc(actionByTech) || '&nbsp;'}</div>
      </td>
      <td style="width:17%;vertical-align:top;padding:4pt 6pt">
        <div class="ps-label">Job Priority</div>
        <table class="ps-table">
          <tr><td class="cb">${pHigh}</td><td>High</td></tr>
          <tr><td class="cb">${pMedium}</td><td>Medium</td></tr>
          <tr><td class="cb">${pLow}</td><td>Low</td></tr>
        </table>
        <div class="ps-label" style="margin-top:6pt">Job Status</div>
        <table class="ps-table">
          <tr><td class="cb">${sDone}</td><td>Done</td></tr>
          <tr><td class="cb">${sPostpone}</td><td>Postpone</td></tr>
        </table>
        ${wo.actualHours ? `
        <div style="margin-top:6pt;font-size:7.5pt;color:#555">
          Breakdown: ${wo.actualHours} jam
        </div>` : ''}
      </td>
    </tr>
  </table>

  <!-- ══════════ NEEDED PARTS & WORKTIME ══════════ -->
  <table class="bottom-table">
    <tr>
      <td style="width:50%;border-right:1pt solid #333;vertical-align:top">
        <div style="font-size:8pt;font-weight:700;color:#1a3a6b;margin-bottom:3pt">Needed Parts</div>
        <table class="parts-table">
          <thead>
            <tr>
              <th style="width:75%;text-align:left;padding:2pt 4pt">Part Name</th>
              <th style="width:25%">Qty</th>
            </tr>
          </thead>
          <tbody>${partsRows}</tbody>
        </table>
      </td>
      <td style="width:50%;vertical-align:top">
        <div style="font-size:8pt;font-weight:700;color:#1a3a6b;margin-bottom:3pt">Tech Worktime</div>
        <table class="worktime-table">
          <thead>
            <tr>
              <th>Technician</th>
              <th>Start</th>
              <th>Stop</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:3pt 4pt;font-size:9pt">${esc(techNames)}</td>
              <td style="padding:3pt 4pt;font-size:8.5pt;text-align:center;white-space:nowrap">
                ${wo.startTime ? esc(wo.startTime) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}
              </td>
              <td style="padding:3pt 4pt;font-size:8.5pt;text-align:center;white-space:nowrap">
                ${wo.endTime ? esc(wo.endTime) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}
              </td>
            </tr>
            <tr>
              <td style="border-top:1pt solid #333;padding:2pt 4pt;font-size:8pt;color:#555" colspan="3">
                Worktime Total:
                <strong>${wo.actualHours ? wo.actualHours + ' jam' : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top:8pt;font-size:7.5pt;color:#555">
          Postpone Reasons:
          <div style="border-bottom:1pt solid #ccc;min-height:18pt;margin-top:2pt;font-size:9pt">
            ${wo.status === 'Cancelled' && wo.notes ? esc(wo.notes.substring(0,100)) : '&nbsp;'}
          </div>
        </div>
      </td>
    </tr>
  </table>

  <!-- ══════════ CONDITION OF THE AREA ══════════ -->
  <table class="condition-table">
    <tr>
      <td colspan="3" style="padding:2pt 5pt;font-size:8pt;font-weight:700;color:#1a3a6b;border-bottom:1pt solid #333">
        Condition of the area before handover :
      </td>
    </tr>
    <tr>
      <td style="width:80%;padding:2pt 5pt;font-size:8.5pt">1.&nbsp; Machine is clean from oil and grease residues.</td>
      <td style="padding:2pt 5pt;white-space:nowrap"><span class="cb">&#9744;</span> Ya</td>
      <td style="padding:2pt 5pt;white-space:nowrap"><span class="cb">&#9744;</span> Tidak</td>
    </tr>
    <tr>
      <td style="padding:2pt 5pt;font-size:8.5pt">2.&nbsp; No tools or old parts left.</td>
      <td style="padding:2pt 5pt;white-space:nowrap"><span class="cb">&#9744;</span> Ya</td>
      <td style="padding:2pt 5pt;white-space:nowrap"><span class="cb">&#9744;</span> Tidak</td>
    </tr>
    <tr>
      <td style="padding:2pt 5pt;font-size:8.5pt">3.&nbsp; Machine Safe to Operate</td>
      <td style="padding:2pt 5pt;white-space:nowrap"><span class="cb">&#9744;</span> Ya</td>
      <td style="padding:2pt 5pt;white-space:nowrap"><span class="cb">&#9744;</span> Tidak</td>
    </tr>
  </table>

  ${printPhotoAttachmentSection(wo)}

  <!-- ══════════ SIGNATURE ══════════ -->
  <table class="sig-table">
    <tr>
      <td>
        <div class="sig-role">Proposed By :</div>
        <div style="font-size:8pt;color:#1a3a6b">User Incharge</div>
        <div class="sig-name-line"></div>
        <div class="sig-detail">
          <table>
            <tr><td>Name</td><td>:</td><td>${esc(reqName)}</td></tr>
            <tr><td>Date</td><td>:</td><td>${esc(woDate)}</td></tr>
            <tr><td>Time</td><td>:</td><td>&nbsp;</td></tr>
          </table>
        </div>
      </td>
      <td>
        <div class="sig-role">Accepted By :</div>
        <div style="font-size:8pt;color:#1a3a6b">Maintenance Dept.</div>
        <div class="sig-name-line"></div>
        <div class="sig-detail">
          <table>
            <tr><td>Name</td><td>:</td><td>&nbsp;</td></tr>
            <tr><td>Date</td><td>:</td><td>&nbsp;</td></tr>
            <tr><td>Time</td><td>:</td><td>&nbsp;</td></tr>
          </table>
        </div>
      </td>
      <td>
        <div class="sig-role">Job Finished By :</div>
        <div style="font-size:8pt;color:#1a3a6b">Maintenance Dept.</div>
        <div class="sig-name-line"></div>
        <div class="sig-detail">
          <table>
            <tr><td>Name</td><td>:</td><td>${esc(techNames.split(',')[0].trim())}</td></tr>
            <tr><td>Date</td><td>:</td><td>${wo.endTime ? esc(endDate) : '&nbsp;'}</td></tr>
            <tr><td>Time</td><td>:</td><td>${wo.endTime ? esc(endTime2) : '&nbsp;'}</td></tr>
          </table>
        </div>
      </td>
      <td>
        <div class="sig-role">Review By :</div>
        <div style="font-size:8pt;color:#1a3a6b">Plant Eng. / Maint. Mgr</div>
        <div class="sig-name-line"></div>
        <div class="sig-detail">
          <table>
            <tr><td>Name</td><td>:</td><td>&nbsp;</td></tr>
            <tr><td>Date</td><td>:</td><td>&nbsp;</td></tr>
            <tr><td>Time</td><td>:</td><td>&nbsp;</td></tr>
          </table>
        </div>
      </td>
      <td>
        <div class="sig-role">Approved By :</div>
        <div style="font-size:8pt;color:#1a3a6b">User Incharge</div>
        <div class="sig-name-line"></div>
        <div class="sig-detail">
          <table>
            <tr><td>Name</td><td>:</td><td>&nbsp;</td></tr>
            <tr><td>Date</td><td>:</td><td>&nbsp;</td></tr>
            <tr><td>Time</td><td>:</td><td>&nbsp;</td></tr>
          </table>
        </div>
      </td>
    </tr>
  </table>

  <!-- ══════════ FOOTER ══════════ -->
  <div class="footer-note">
    <span>White Sheet : Maintenance</span>
    <span>Red Sheet : Plant (Once the work finished)</span>
    <span>Yellow Sheet : Plant (hold by person submitted WO)</span>
  </div>
  <div class="wo-id-watermark">
    Dicetak dari sistem WO digital · ${esc(wo.id)} · ${nowStr} ${nowTime} · oleh ${esc(SESSION?.nama||'—')}
  </div>

</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    toast('Popup diblokir browser. Aktifkan popup untuk cetak WO.', 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  toast(`🖨 Membuka form cetak WO ${wo.id}...`, 'success');
}

async function pushRepairHistory(wo, techNote, actualHours) {
  if (!wo.equipId) return;
  const equip    = (EQUIP_DB.equipment||[]).find(e => e.id === wo.equipId);
  const tech     = getTechName(wo.techId);
  const partsStr = (wo.partsUsed||[]).map(p => `${p.name} x${p.qty}`).join(', ');
  const row = {
    id:          `RH-${wo.id}-${Date.now()}`,
    equipId:     wo.equipId,
    equipName:   equip?.name || wo.equipId,
    woId:        wo.id,
    woType:      wo.type,
    woTitle:     wo.title,
    techName:    tech,
    createdAt:   wo.createdAt,
    completedAt: new Date().toISOString().split('T')[0],
    estHours:    wo.estHours   || 0,
    actualHours: actualHours  || wo.actualHours || 0,
    partsUsed:   partsStr,
    notes:       techNote || wo.notes || '',
    priority:    wo.priority,
  };
  try {
    const body = JSON.stringify({ fn: 'upsert', sheet: 'EQ_REPAIR_HISTORY', row, token: SESSION?.token || '' });
    const url  = CFG.equipDbApi + '?fn=upsert&_body=' + encodeURIComponent(body);
    await fetch(url, { mode: 'cors' });
    toast(`History perbaikan ${wo.equipId} disimpan ✓`, 'success');
  } catch {}
}

async function loadEquipHistory(equipId) {
  const containerId = `equip-history-${equipId}`;
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px 0;font-size:12px;color:var(--text3)"><div class="spinner"></div> Memuat history...</div>';
  try {
    const localHistory = WO.workorders
      .filter(w => w.equipId === equipId)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    let apiHistory = [];
    try {
      const r = await fetch(CFG.equipDbApi + '?fn=read', { mode: 'cors' });
      const d = await r.json();
      if (d.ok && d.data && d.data.repairHistory) {
        apiHistory = (d.data.repairHistory || []).filter(h => h.equipId === equipId);
      }
    } catch {}
    renderEquipHistory(el, equipId, localHistory, apiHistory);
  } catch(e) {
    el.innerHTML = `<div style="font-size:12px;color:var(--red);padding:8px 0">Gagal memuat: ${e.message}</div>`;
  }
}

function renderEquipHistory(el, equipId, localWOs, apiRows) {
  if (!localWOs.length && !apiRows.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:12px 0">Belum ada history perbaikan.</div>';
    return;
  }
  const done      = localWOs.filter(w => w.status === 'Done').length;
  const total     = localWOs.length;
  const corrective = localWOs.filter(w => w.type === 'Troubleshooting').length;
  const avgHours  = done ? (localWOs.filter(w=>w.status==='Done').reduce((s,w)=>s+(w.actualHours||0),0)/done).toFixed(1) : '—';

  let html = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
    ${[['Total WO','var(--blue)',total],['Selesai','var(--green)',done],['Corrective Maint.','var(--red)',corrective],['Avg Jam','var(--accent)',avgHours]].map(([lbl,clr,val])=>`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px 12px">
      <div style="font-size:9px;font-family:'IBM Plex Mono',monospace;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">${lbl}</div>
      <div style="font-size:18px;font-weight:700;color:${clr}">${val}</div>
    </div>`).join('')}
  </div>`;

  const seenWo = new Set();
  const allRows = [];
  apiRows.forEach(r => {
    seenWo.add(r.woId);
    allRows.push({ src:'api', woId:r.woId, title:r.woTitle, type:r.woType, status:'Done',
      createdAt:r.createdAt, completedAt:r.completedAt, tech:r.techName,
      actualHours:r.actualHours, partsUsed:r.partsUsed, notes:r.notes, priority:r.priority });
  });
  localWOs.forEach(w => {
    if (!seenWo.has(w.id)) {
      allRows.push({ src:'local', woId:w.id, title:w.title, type:w.type, status:w.status,
        createdAt:w.createdAt, completedAt:'', tech:getTechName(w.techId),
        actualHours:w.actualHours||0,
        partsUsed:(w.partsUsed||[]).map(p=>`${p.name} x${p.qty}`).join(', '),
        notes:w.notes, priority:w.priority });
    }
  });
  allRows.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  const pColor = {Critical:'var(--red)',High:'var(--orange)',Medium:'var(--accent)',Low:'var(--text3)'};
  html += allRows.map(r => `
    <div style="border:1px solid var(--border);border-left:3px solid ${pColor[r.priority]||'var(--border)'};border-radius:7px;padding:12px 14px;margin-bottom:8px;background:var(--bg3)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
            <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--accent)">${esc(r.woId)}</span>
            ${badgeType(r.type)} ${badgeStatus(r.status)}
          </div>
          <div style="font-size:13px;font-weight:600">${esc(r.title)}</div>
        </div>
        ${r.src==='local' ? `<span style="font-size:9px;color:var(--text3);font-family:'IBM Plex Mono',monospace;border:1px solid var(--border);padding:1px 5px;border-radius:3px">LOCAL</span>` : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--text2)">
        <span>👷 ${esc(r.tech||'—')}</span>
        <span>📅 ${r.createdAt||'—'}</span>
        ${r.completedAt ? `<span>✓ ${r.completedAt}</span>` : ''}
        ${r.actualHours ? `<span>⏱ ${r.actualHours} jam</span>` : ''}
      </div>
      ${r.partsUsed ? `<div style="margin-top:8px;font-size:11px;color:var(--text3)">🔩 ${esc(r.partsUsed)}</div>` : ''}
      ${r.notes ? `<div style="margin-top:6px;font-size:11px;color:var(--text3);font-style:italic">"${esc(r.notes)}"</div>` : ''}
    </div>`).join('');

  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// AUTH SYSTEM — Login, Session, Role
