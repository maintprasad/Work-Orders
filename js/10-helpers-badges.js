// ═══════════════════════════════════════════════════════════════
// ── Parse checklist dari format Sheets → array object ──
function parseChecklistFromSheets(val) {
  if (Array.isArray(val)) return val;
  if (!val || val === '') return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  return String(val).split('|').map((item, idx) => {
    const s = item.trim();
    if (!s) return null;

    // [ ] = belum done, [✓] [√] [v] [x] dll = done
    const isDone = /^\[\s*[^\s\]]\s*\]/.test(s);

    // Hapus prefix [...] apapun isinya
    const rest = s.replace(/^\[.*?\]\s*/, '').trim();
    let text = rest, note = '';
    const noteIdx = rest.indexOf('::');
    if (noteIdx !== -1) {
      text = rest.slice(0, noteIdx).trim();
      note = rest.slice(noteIdx + 2).trim();
    }
    if (!text) return null;

    return { id: 'cl-' + idx + '-' + Date.now(), text, note, done: isDone };
  }).filter(Boolean);
}

// ── Parse attachments dari format Sheets (fileId|name|type|size ; ...) → array object ──
function parseAttachmentsFromSheets(val) {
  if (Array.isArray(val)) return val;
  if (!val || val === '') return [];
  try {
    const p = JSON.parse(val);
    if (Array.isArray(p)) return p;
  } catch {}
  return String(val).split(';').map(item => {
    const parts = item.trim().split('|');
    if (!parts[0]) return null;
    return { id: parts[0] || '', name: parts[1] || parts[0], type: parts[2] || 'doc', size: parts[3] || '' };
  }).filter(Boolean);
}
   
   function getEquipName(equipId) {
  if (!equipId) return '';
  return (EQUIP_DB.equipment||[]).find(e => e.id === equipId)?.name || equipId;
}
function getUnitName(unitId) {
  if (!unitId) return '—';
  return (EQUIP_DB.units||[]).find(x => x.id === unitId)?.name || unitId;
}
function getAreaName(areaId) {
  if (!areaId) return '—';
  return (EQUIP_DB.areas||[]).find(x => x.id === areaId)?.name || areaId;
}
function getTechName(techId) {
  if (!techId) return '';
  return WO.technicians.find(x => x.id === techId)?.name || techId;
}
function getTechNamesStr(wo) {
  if (!wo) return '';
  const ids = (wo.techIds && wo.techIds.length) ? wo.techIds : (wo.techId ? [wo.techId] : []);
  return ids.map(id => getTechName(id)).filter(Boolean).join(', ');
}
function badgeStatus(status) {
  const m = {Draft:'b-draft',Open:'b-open',Assigned:'b-assigned','In Progress':'b-inprogress','Pending Verification':'b-pending-verif',Rejected:'b-rejected',Done:'b-done',Cancelled:'b-cancelled'};
  const label = status === 'Done' ? 'Closed' : (status||'Draft');
  return `<span class="badge ${m[status]||'b-draft'}">${label}</span>`;
}
function badgeType(type) {
  const m = {
    'Troubleshooting':          'b-troubleshooting',
    'Improvement':              'b-improvement',
    'Fabrication/Modification': 'b-fabrication',
  };
  return `<span class="badge ${m[type]||'b-other'}">${type||'—'}</span>`;
}
function badgePriority(p) {
  const m = {Low:'b-low-p',Medium:'b-medium-p',High:'b-high-p',Critical:'b-critical-p'};
  return `<span class="badge ${m[p]||'b-medium-p'}">${p||'—'}</span>`;
}
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); }
  catch { return d; }
}
function fmtTs() {
  return new Date().toISOString().replace('T',' ').slice(0,16);
}
function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
function emptyState(ico, msg) {
  return `<div class="empty"><div class="empty-ico">${ico}</div><div class="empty-msg">${msg}</div></div>`;
}
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── DRIVE FILE HELPERS — universal builder dari File ID (BUKAN dari URL utuh) ──
function getDriveUrl(fileId) {
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : '#';
}
function getThumbnail(fileId) {
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}=w400` : '';
}
function getThumbnailFallback(fileId) {
  return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w400` : '';
}
function getDownloadUrl(fileId) {
  return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : '#';
}
function populateSel(selId, items, valKey, labelKey, placeholder, selected) {
  const el = document.getElementById(selId); if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valKey]; opt.textContent = item[labelKey];
    if (item[valKey] === selected) opt.selected = true;
    el.appendChild(opt);
  });
}
function toast(msg, type = 'info') {
  const container = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'toast-item ' + type;
  el.innerHTML = msg.replace(/\n/g, '<br>');
  container.appendChild(el);
  const duration = (msg.includes('\n') || msg.length > 60) ? 5000 : 3500;
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(() => el.remove(), 300); }, duration);
}
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebarBackdrop');
  if (sb.classList.contains('open')) { closeSidebar(); }
  else { sb.classList.add('open'); bd.classList.add('open'); document.body.style.overflow='hidden'; }
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════
// EQUIPMENT DB — Pull & History Integration
