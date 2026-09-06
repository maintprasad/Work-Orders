// ═══════════════════════════════════════════════════════════════
function renderTechnicians() {
  const tbody = document.getElementById('tech-tbody');
  if (!WO.technicians.length) { tbody.innerHTML = `<tr><td colspan="7">${emptyState('👷','Belum ada teknisi')}</td></tr>`; return; }
  tbody.innerHTML = WO.technicians.map(t => {
    const activeWo = WO.workorders.filter(w => w.techId === t.id && ['Assigned','In Progress'].includes(w.status)).length;
    const totalWo  = WO.workorders.filter(w => w.techId === t.id).length;
    return `<tr>
      <td><span class="td-code">${esc(t.id)}</span></td>
      <td><span style="font-weight:500">${esc(t.name)}</span></td>
      <td><span class="badge" style="background:rgba(45,212,191,.1);color:var(--teal)">${esc(t.spec)}</span></td>
      <td><span style="font-size:12px;color:var(--text2)">${esc(t.shift)}</span></td>
      <td><span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:${activeWo > 0 ? 'var(--accent)' : 'var(--text3)'}">${activeWo}</span></td>
      <td><span class="td-mono">${totalWo}</span></td>
      <td><div class="tbl-actions">
        <button class="btn-icon" onclick="openModal('tech','${t.id}')" title="Edit">✏</button>
        <button class="btn-icon del" onclick="deleteTech('${t.id}')" title="Hapus">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// RENDER: REPORTS
// ═══════════════════════════════════════════════════════════════
function renderReports() {
  const all   = WO.workorders;
  const done  = all.filter(w => w.status === 'Done');
  const total = all.length || 1;
  const rate  = Math.round(done.length / total * 100);
  const avgDays = done.length ? (done.reduce((s, w) => {
    const d1 = new Date(w.createdAt), d2 = new Date();
    return s + Math.max(0, (d2-d1)/(1000*60*60*24));
  }, 0) / done.length).toFixed(1) : 0;
  const totalParts = all.reduce((s,w) => s + (w.partsUsed||[]).reduce((ps,p) => ps+p.qty,0), 0);

  setText('rep-total',   all.length);
  setText('rep-rate',    rate + '%');
  setText('rep-avgdays', avgDays);
  setText('rep-parts',   totalParts);

  const renderBar = (items, colors) => items.map(([label, count]) => {
    const pct = Math.round(count / (total || 1) * 100);
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px">
        <span style="color:var(--text2)">${label}</span>
        <span style="font-family:'IBM Plex Mono',monospace;color:var(--text3)">${count}</span>
      </div>
      <div style="height:6px;background:var(--bg3);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${colors[label]||'var(--accent)'};border-radius:4px;transition:width .5s"></div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('rep-by-type').innerHTML = renderBar(
    ['Troubleshooting','Improvement','Fabrication/Modification','Preventive Maintenance','Corrective Maintenance','Monitoring','Inspection']
      .map(t => [t, all.filter(w=>w.type===t).length]),
    {
      'Troubleshooting':        'var(--orange)',
      'Improvement':            'var(--purple)',
      'Fabrication/Modification': '#e91e8c',
      'Preventive Maintenance': 'var(--blue)',
      'Corrective Maintenance': 'var(--red)',
      'Monitoring':             'var(--teal)',
      'Inspection':             'var(--green)',
    }
  );
  document.getElementById('rep-by-priority').innerHTML = renderBar(
    ['High','Medium','Low'].map(p => [p, all.filter(w=>w.priority===p).length]),
    {High:'var(--orange)',Medium:'var(--accent)',Low:'var(--text3)'}
  );
  document.getElementById('rep-by-status').innerHTML = renderBar(
    ['Open','In Progress','Done','Cancelled'].map(s => [s, all.filter(w=>w.status===s).length]),
    {Open:'var(--blue)','In Progress':'var(--accent)',Done:'var(--green)',Cancelled:'var(--red)'}
  );
}

// ═══════════════════════════════════════════════════════════════
// FILTERS
