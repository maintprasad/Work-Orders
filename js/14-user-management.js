function renderUserManagement() {
  if (!SESSION || SESSION.role !== 'Admin') { toast('Akses ditolak', 'error'); return; }
  const users = loadUsers();
  const tbody = document.getElementById('user-tbody');
  const roleBadge = {
    Admin: `<span style="background:rgba(240,180,41,.12);color:var(--accent);font-family:'IBM Plex Mono',monospace;font-size:10px;padding:2px 7px;border-radius:4px">Admin</span>`,
    Maintenance: `<span style="background:rgba(45,212,191,.1);color:var(--teal);font-family:'IBM Plex Mono',monospace;font-size:10px;padding:2px 7px;border-radius:4px">Maintenance</span>`,
    User: `<span style="background:rgba(91,156,246,.1);color:var(--blue);font-family:'IBM Plex Mono',monospace;font-size:10px;padding:2px 7px;border-radius:4px">User</span>`,
  };
  if (!users.length) { tbody.innerHTML = `<tr><td colspan="8">${emptyState('👥','Belum ada user')}</td></tr>`; return; }
  tbody.innerHTML = users.map(u => `<tr>
    <td><span class="td-code">${esc(u.username)}</span></td>
    <td><span style="font-weight:500">${esc(u.nama)}</span></td>
    <td>${roleBadge[u.role] || u.role}</td>
    <td><span style="font-size:12px;color:var(--text2)">${esc(u.jabatan||'—')}</span></td>
    <td><span class="td-mono">${esc(u.whatsapp||'—')}</span></td>
    <td><span style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:${u.password?'var(--green)':'var(--red)'}">${u.password ? '✓ Set' : '✕ Belum'}</span></td>
    <td><span style="font-size:12px;color:${u.status==='Active'?'var(--green)':'var(--red)'}">${esc(u.status)}</span></td>
    <td><div class="tbl-actions">
      <button class="btn-icon" onclick="openUserModal('${u.id}')" title="Edit">✏</button>
      <button class="btn-icon del" onclick="deleteUser('${u.id}')" title="Hapus">✕</button>
    </div></td>
  </tr>`).join('');
}

function openUserModal(userId) {
  if (!SESSION || SESSION.role !== 'Admin') return;
  const users = loadUsers();
  const u = userId ? users.find(x => x.id === userId) : null;

  document.getElementById('modal-user-title').textContent = u ? '✏ Edit User' : '+ Add User';
  document.getElementById('user-edit-id').value  = u?.id || '';
  document.getElementById('u-username').value    = u?.username || '';
  document.getElementById('u-nama').value        = u?.nama    || '';
  document.getElementById('u-password').value    = '';
  document.getElementById('u-role').value        = u?.role    || 'User';
  document.getElementById('u-whatsapp').value    = u?.whatsapp || '';
  document.getElementById('u-status').value      = u?.status  || 'Active';

  // Jabatan — berlaku semua role
  const jabatan = u?.jabatan || '';
  const stdJabatan = ['Manager','SPV','Leader','Crew','Staff'];
  if (jabatan && !stdJabatan.includes(jabatan)) {
    document.getElementById('u-jabatan-sel').value = 'custom';
    document.getElementById('u-jabatan-custom').value = jabatan;
    document.getElementById('u-jabatan-custom-wrap').style.display = '';
  } else {
    document.getElementById('u-jabatan-sel').value = jabatan || '';
    document.getElementById('u-jabatan-custom-wrap').style.display = 'none';
  }

  // Clear errors
  ['e-u-username','e-u-nama','e-u-password'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '';
  });
  onUserRoleChange();
  document.getElementById('modal-user').classList.add('open');
}

function onUserRoleChange() {
  // Jabatan ditampilkan untuk semua role (bukan hanya Maintenance)
  document.getElementById('u-jabatan-wrap').style.display = '';
  document.getElementById('u-jabatan-custom-wrap').style.display = 'none';
  // Reset jabatan selection saat role berubah
  const jabatanSel = document.getElementById('u-jabatan-sel');
  if (jabatanSel && jabatanSel.value === '') jabatanSel.value = '';
}

function onJabatanSelChange() {
  const val = document.getElementById('u-jabatan-sel').value;
  document.getElementById('u-jabatan-custom-wrap').style.display = val === 'custom' ? '' : 'none';
}

function saveUser() {
  if (!SESSION || SESSION.role !== 'Admin') return;
  const editId   = document.getElementById('user-edit-id').value;
  const username = document.getElementById('u-username').value.trim().toLowerCase();
  const nama     = document.getElementById('u-nama').value.trim();
  const password = document.getElementById('u-password').value;
  const role     = document.getElementById('u-role').value;
  const whatsapp = document.getElementById('u-whatsapp').value.trim();
  const status   = document.getElementById('u-status').value;

  // Jabatan — berlaku untuk semua role
  const jabatanSel = document.getElementById('u-jabatan-sel').value;
  const jabatan = jabatanSel === 'custom'
    ? document.getElementById('u-jabatan-custom').value.trim()
    : jabatanSel;

  // Validation
  let valid = true;
  if (!username) { document.getElementById('e-u-username').textContent = 'Username wajib diisi'; valid = false; }
  else document.getElementById('e-u-username').textContent = '';
  if (!nama) { document.getElementById('e-u-nama').textContent = 'Nama wajib diisi'; valid = false; }
  else document.getElementById('e-u-nama').textContent = '';
  if (!editId && !password) { document.getElementById('e-u-password').textContent = 'Password wajib untuk user baru'; valid = false; }
  else if (password && password.length < 6) { document.getElementById('e-u-password').textContent = 'Min 6 karakter'; valid = false; }
  else document.getElementById('e-u-password').textContent = '';
  if (!valid) return;

  const users = loadUsers();
  // Check duplicate username
  const dup = users.find(u => u.username === username && u.id !== editId);
  if (dup) { document.getElementById('e-u-username').textContent = 'Username sudah dipakai'; return; }

  if (editId) {
    const idx = users.findIndex(u => u.id === editId);
    if (idx === -1) return;
    users[idx].username = username;
    users[idx].nama     = nama;
    users[idx].role     = role;
    users[idx].jabatan  = jabatan;
    users[idx].whatsapp = whatsapp;
    users[idx].status   = status;
    if (password) users[idx].password = password; // simpan plain text ke Sheets
        saveUsers(users);
    closeModal('user');
    renderUserManagement();
    toast('User diupdate', 'success');
    syncUserToSheets(users[idx]).then(res => {
      if (!res.ok) toast('⚠ Update user tersimpan lokal, gagal sync ke Sheets: ' + res.message, 'error');
    });
  } else {
    const newUser = {
      id: 'U-' + Date.now(),
      username, nama, role, jabatan, whatsapp, status,
      password: password // plain text, konsisten dengan input manual di Sheets
    };
    users.push(newUser);
    saveUsers(users);
    closeModal('user');
    renderUserManagement();
        toast('User ' + nama + ' ditambahkan — menyinkronkan ke server...', 'success');
    // Sync dengan feedback lebih jelas + pesan error asli untuk diagnosis
    syncUserToSheets(newUser).then(res => {
      if (res.ok) {
        toast('✓ User ' + nama + ' berhasil disinkron ke Sheets', 'success');
      } else {
        toast('⚠ User tersimpan lokal, gagal sync ke Sheets: ' + res.message, 'error');
      }
    });
  }
}

function deleteUser(userId) {
  if (!SESSION || SESSION.role !== 'Admin') return;
  if (userId === SESSION.userId) { toast('Tidak bisa hapus akun sendiri', 'error'); return; }
  const users = loadUsers();
  const target = users.find(u => u.id === userId);
  if (!target) return;
  if (!confirm(`Hapus user "${target.nama}" (${target.username})?`)) return;
  saveUsers(users.filter(u => u.id !== userId));
  // Sync delete ke backend (Sheets atau SQL, sesuai CFG.backend)
  try { _fetchSilent(apiBase(), { fn:'delete', sheet:'WO_USERS', id: userId }); } catch {}
  renderUserManagement();
  toast('User dihapus', 'warn');
}

// Sync user ke backend (Sheets atau SQL, sesuai CFG.backend).
// Return true jika berhasil, false jika gagal.
//
// Catatan mode SQL: endpoint upsert generik SENGAJA membuang field
// `password` (lihat sql-backend/functions.php) supaya tidak ada jalur
// yang menyimpan password mentah ke database — makanya password
// dikirim TERPISAH lewat fn=set_password, yang meng-hash-nya di server
// (password_hash). Di mode Sheets, perilaku lama (password plain text
// ikut di baris yang sama) tetap dipertahankan persis seperti sebelumnya.
async function syncUserToSheets(user, _isRetry) {
  const row = {
    id:       user.id,
    username: user.username,
    nama:     user.nama,
    role:     user.role,
    jabatan:  user.jabatan  || '',
    whatsapp: user.whatsapp || '',
    status:   user.status,
  };
  try {
    if (CFG.backend === 'sql') {
      await _fetchSilent(apiBase(), { fn: 'upsert', sheet: 'WO_USERS', row });
      if (user.password) {
        await _fetchSilent(apiBase(), { fn: 'set_password', id: user.id, password: user.password, token: SESSION?.token || '' });
      }
    } else {
      row.password = user.password || ''; // plain text, disimpan di Sheets (perilaku lama)
      await _fetchSilent(CFG.apiUrl, { fn: 'upsert', sheet: 'WO_USERS', row });
    }
    return { ok: true };
  } catch(e) {
    const msg = e?.message || 'Error tidak diketahui';
    console.warn('[syncUserToSheets] Gagal:', msg);

    // Token sesi expired/kosong — coba refresh diam-diam lalu ulangi sekali
    if (/token/i.test(msg) && !_isRetry) {
      const refreshed = await refreshSessionToken();
      if (refreshed) return syncUserToSheets(user, true);
    }
    return { ok: false, message: msg };
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION SETTINGS
