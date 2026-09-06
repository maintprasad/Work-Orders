// ═══════════════════════════════════════════════════════════════

function renderNotifSettings() {
  if (!SESSION || SESSION.role !== 'Admin') return;
  const s = loadNotifSettings();
  document.getElementById('notif-wo-baru').checked  = s.woBaru !== false;
  document.getElementById('notif-wo-done').checked  = s.woDone !== false;
  document.getElementById('notif-wo-status').checked = s.woStatus === true;
  document.getElementById('notif-bot-url').value    = s.botUrl   || '';
  document.getElementById('notif-bot-secret').value = s.botSecret || '';
  document.getElementById('notif-group-id').value   = s.groupId  || '';
  renderWARecipients();
}

function renderWAProviderFields() {
  const provider = document.getElementById('notif-provider')?.value;
  const el = document.getElementById('wa-provider-fields');
  if (!el) return;
  if (provider === 'wa.me') {
    el.innerHTML = `<div style="padding:10px 12px;background:rgba(240,180,41,.05);border:1px solid rgba(240,180,41,.2);border-radius:7px;font-size:12px;color:var(--accent)">
      Mode WA.me: link WhatsApp manual akan di-generate. Notifikasi tidak otomatis terkirim.</div>`;
  } else {
    el.innerHTML = `<div class="fg" style="margin-bottom:12px">
      <label class="flabel">API Token / Key</label>
      <input class="finput" id="notif-api-key" placeholder="Masukkan API token..."/>
    </div>`;
  }
}

function renderWARecipients() {
  const users = loadUsers().filter(u => u.status === 'Active');
  const el = document.getElementById('wa-recipient-list');
  if (!el) return;
  if (!users.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">Belum ada user aktif.</div>'; return; }
  el.innerHTML = users.map(u => `
    <div class="wa-entry">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${esc(u.nama)}</div>
        <div class="wa-num">${u.whatsapp ? '📱 ' + esc(u.whatsapp) : '<span style="color:var(--text3);font-size:11px">— belum ada nomor —</span>'}</div>
      </div>
      <span class="wa-role-tag">${esc(u.role)}</span>
    </div>`).join('');
}

function saveNotifSettings() {
  if (!SESSION || SESSION.role !== 'Admin') return;
  const s = {
    woBaru:    document.getElementById('notif-wo-baru').checked,
    woDone:    document.getElementById('notif-wo-done').checked,
    woStatus:  document.getElementById('notif-wo-status').checked,
    botUrl:    document.getElementById('notif-bot-url').value.trim().replace(/\/$/, ''),
    botSecret: document.getElementById('notif-bot-secret').value.trim(),
    groupId:   document.getElementById('notif-group-id').value.trim(),
  };
  saveNotifSettingsLocal(s);
  // Sync ke GAS (tanpa botSecret — secret disimpan di GAS Script Properties)
  try {
    _fetchSilent(CFG.apiUrl, { fn:'upsert', sheet:'WO_SETTINGS', row: {
      notif_wo_baru:  String(s.woBaru),
      notif_wo_done:  String(s.woDone),
      notif_wo_status:String(s.woStatus),
      bot_url:        s.botUrl,
      group_id:       s.groupId,
      // botSecret TIDAK dikirim ke Sheets — disimpan manual di GAS Script Properties
    }});
  } catch {}
  toast('Setting notifikasi disimpan', 'success');
}

// ── Test koneksi bot dari browser (opsional, via GAS proxy) ──
async function testBotConnection() {
  const resultEl = document.getElementById('bot-test-result');
  const botUrl = document.getElementById('notif-bot-url').value.trim().replace(/\/$/, '');
  if (!botUrl) { resultEl.innerHTML = '<span style="color:var(--red)">⚠ URL bot belum diisi</span>'; return; }
  resultEl.innerHTML = '<span style="color:var(--text3)">🔌 Mengecek koneksi...</span>';
  try {
    // Cek via GAS sebagai proxy (menghindari CORS)
    const r = await fetch(CFG.apiUrl + '?fn=ping_bot&url=' + encodeURIComponent(botUrl + '/health'), { mode:'cors' });
    const d = await r.json();
    if (d.ok && d.botReady) {
      resultEl.innerHTML = `<span style="color:var(--green)">✅ Bot online! Nomor: ${d.botNumber || '—'}</span>`;
    } else if (d.ok) {
      resultEl.innerHTML = `<span style="color:var(--accent)">⚠ Bot server ada tapi WA belum konek</span>`;
    } else {
      resultEl.innerHTML = `<span style="color:var(--red)">❌ ${d.message || 'Tidak bisa reach bot'}</span>`;
    }
  } catch(e) {
    resultEl.innerHTML = `<span style="color:var(--red)">❌ Error: ${e.message}</span>`;
  }
}

// ── sendWANotif — kirim via GAS → Bot Baileys ──
async function sendWANotif(type, wo) {
  const s = loadNotifSettings();
  if (type === 'new'    && !s.woBaru)  return;
  if (type === 'done'   && !s.woDone)  return;
  if (type === 'status' && !s.woStatus) return;
  if (!s.botUrl) return; // Bot URL belum diset

  // Kumpulkan nomor penerima dari users
  const users = loadUsers().filter(u => u.status === 'Active' && u.whatsapp);
  const targets = [];
  if (type === 'new' || type === 'done') {
    users.filter(u => u.role === 'Admin' || u.role === 'Maintenance')
      .forEach(u => { if (!targets.includes(u.whatsapp)) targets.push(u.whatsapp); });
    if (wo.createdBy) {
      const creator = users.find(u => u.id === wo.createdBy);
      if (creator?.whatsapp && !targets.includes(creator.whatsapp)) targets.push(creator.whatsapp);
    }
  }

  if (!targets.length && !s.groupId) return;

  const tech = getTechName(wo.techId) || wo.techName || '—';

  // Kirim via GAS sebagai proxy (GAS yang hit bot, bukan browser langsung)
  // Ini supaya botSecret tidak pernah ada di browser
  try {
    await _fetchSilent(CFG.apiUrl, {
      fn: 'notify_wa',
      type,
      woId:      wo.id,
      title:     wo.title,
      requestor: wo.requestorName || '—',
      dept:      wo.requestorDept || '',
      teknisi:   tech,
      priority:  wo.priority || '',
      duration:  wo.actualHours || '',
      targets,
      groupId:   s.groupId || '',
    });
    toast(`Notifikasi WA dikirim (${targets.length} orang)`, 'success');
  } catch(e) {
    console.warn('Notif WA gagal:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// PRINT — Cetak Laporan WO
