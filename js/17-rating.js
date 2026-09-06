// ═══════════════════════════════════════════════════════════════

let RATING_CURRENT_STAR = 0;

// Helper dipanggil dari tombol di rating block (handle WO ID dengan karakter /)
function openRatingFromBlock() {
  const block = document.getElementById('wo-rating-block');
  if (block) openRatingModal(block.dataset.woId);
}

const RATING_LABELS = {
  1: '⛔ Sangat Kurang',
  2: '😕 Kurang Memuaskan',
  3: '😐 Cukup',
  4: '😊 Baik',
  5: '🌟 Sangat Baik!',
};

function openRatingModal(woId) {
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo || wo.status !== 'Done') return;

  RATING_CURRENT_STAR = wo.rating || 0;
  document.getElementById('rating-wo-id').value = woId;
  document.getElementById('rating-wo-label').textContent = `${wo.id} — ${wo.title}`;
  document.getElementById('rating-tech-label').textContent = getTechName(wo.techId) || '(Tidak ada teknisi)';
  document.getElementById('rating-comment').value = wo.ratingComment || '';
  renderStarInput(RATING_CURRENT_STAR);
  document.getElementById('modal-rating').classList.add('open');
}

function setRatingStar(val) {
  RATING_CURRENT_STAR = val;
  renderStarInput(val);
}

function renderStarInput(val) {
  const btns = document.querySelectorAll('#star-rating-input .star-btn');
  btns.forEach((btn, i) => {
    btn.classList.toggle('filled', i < val);
    btn.classList.toggle('active', i < val);
  });
  const lbl = document.getElementById('rating-star-label');
  if (lbl) lbl.textContent = val ? RATING_LABELS[val] : '— Pilih bintang —';
}

function submitRating() {
  const woId    = document.getElementById('rating-wo-id').value;
  const comment = document.getElementById('rating-comment').value.trim();
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;

  if (!RATING_CURRENT_STAR) {
    toast('Pilih bintang dulu (1–5)', 'error'); return;
  }

  const isEdit = !!wo.rating;
  wo.rating        = RATING_CURRENT_STAR;
  wo.ratingComment = comment;
  wo.ratedAt       = fmtTs();
  wo.ratedBy       = SESSION?.nama || '—';

  addAudit(wo, 'note', `Rating: ${RATING_CURRENT_STAR}⭐ ${RATING_LABELS[RATING_CURRENT_STAR]}${comment ? ' — ' + comment : ''}`);
  saveLocal();
  closeModal('rating');
  if (ST.page === 'detail') showDetail(woId);
  renderRatingPage();
  refreshAll();
  syncUpsertWO(wo);
  toast(`Rating ${RATING_CURRENT_STAR}⭐ tersimpan untuk ${getTechName(wo.techId) || 'Teknisi'}`, 'success');
}

// ── Render bintang (tampil, bukan input) ──
function starsHtml(val, total) {
  const filled = Math.round(val || 0);
  let s = '<span class="rating-display">';
  for (let i = 1; i <= 5; i++) s += `<span class="star ${i <= filled ? 'filled' : ''}">★</span>`;
  s += `<span class="rating-val">${val ? val.toFixed(1) : '—'}</span>`;
  if (total !== undefined) s += `<span class="rating-count">(${total}x)</span>`;
  s += '</span>';
  return s;
}

// ── Compute per-teknisi rating stats ──
function getTechRatingStats() {
  const stats = {}; // techId → { sum, count, wos[] }
  WO.workorders.forEach(wo => {
    if (wo.status !== 'Done' || !wo.rating || !wo.techId) return;
    if (!stats[wo.techId]) stats[wo.techId] = { sum: 0, count: 0, wos: [] };
    stats[wo.techId].sum   += wo.rating;
    stats[wo.techId].count += 1;
    stats[wo.techId].wos.push(wo);
  });
  return stats;
}

// ── Render halaman Rating ──
function renderRatingPage() {
  const allDone   = WO.workorders.filter(w => w.status === 'Done');
  const rated     = allDone.filter(w => w.rating);
  const allRatings = rated.map(w => w.rating);
  const avgAll    = allRatings.length
    ? (allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(2)
    : '—';
  const stats     = getTechRatingStats();
  const techCount = Object.keys(stats).length;

  // Summary cards
  const avgEl = document.getElementById('rating-avg-all');
  const woEl  = document.getElementById('rating-wo-rated');
  const tcEl  = document.getElementById('rating-tech-count');
  if (avgEl) avgEl.innerHTML = allRatings.length ? `${avgAll} <span style="font-size:18px">⭐</span>` : '—';
  if (woEl)  woEl.textContent  = `${rated.length} / ${allDone.length}`;
  if (tcEl)  tcEl.textContent  = techCount;

  // Leaderboard
  const lb = document.getElementById('rating-leaderboard');
  if (lb) {
    const sorted = Object.entries(stats)
      .map(([techId, s]) => ({
        techId, avg: s.sum / s.count, count: s.count, wos: s.wos,
        tech: WO.technicians.find(t => t.id === techId),
      }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);

    if (!sorted.length) {
      lb.innerHTML = '<div class="empty"><div class="empty-ico">⭐</div><div class="empty-msg">Belum ada WO yang diberi rating.</div></div>';
    } else {
      const rankEmoji = ['🥇','🥈','🥉'];
      lb.innerHTML = sorted.map((item, idx) => {
        const filledStars = Math.round(item.avg);
        const starsRow = Array.from({length:5},(_,i)=>`<span class="star ${i<filledStars?'filled':''}">★</span>`).join('');
        const maxAvg = sorted[0].avg;
        const barPct = maxAvg ? Math.round(item.avg / maxAvg * 100) : 0;
        return `<div class="lb-card">
          <div class="lb-rank ${idx < 3 ? 'r'+(idx+1) : ''}">${idx < 3 ? rankEmoji[idx] : '#'+(idx+1)}</div>
          <div class="lb-avatar">👷</div>
          <div class="lb-info">
            <div class="lb-name">${esc(item.tech?.name || item.techId)}</div>
            <div class="lb-meta">${esc(item.tech?.spec||'—')} · ${esc(item.tech?.shift||'—')} · ${item.count} WO dinilai</div>
            <div class="lb-stars">${starsRow}<span class="rating-count" style="margin-left:6px">${item.count}x penilaian</span></div>
          </div>
          <div class="lb-avg">${item.avg.toFixed(2)}<small>/ 5.00 ⭐</small></div>
          <div class="lb-bar" style="width:${barPct}%"></div>
        </div>`;
      }).join('');
    }
  }

  // Unrated list
  const ul = document.getElementById('rating-unrated-list');
  if (ul) {
    const unrated = allDone.filter(w => !w.rating && w.techId);
    if (!unrated.length) {
      ul.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">Semua WO selesai sudah dinilai ✓</div>';
    } else {
      ul.innerHTML = unrated.slice(0, 15).map(w => `
        <div style="border:1px solid var(--border);border-radius:7px;padding:10px 12px;margin-bottom:8px;background:var(--bg3)">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--accent)">${esc(w.id)}</div>
              <div style="font-size:12px;font-weight:500;margin-top:2px">${esc(w.title)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">👷 ${esc(getTechName(w.techId)||'—')}</div>
            </div>
            <button class="btn-sm success" data-wo-id="${esc(w.id)}" onclick="openRatingModal(this.dataset.woId)">⭐ Nilai</button>
          </div>
        </div>`).join('');
      if (unrated.length > 15) {
        ul.innerHTML += `<div style="font-size:11px;color:var(--text3);text-align:center;padding:6px">+${unrated.length - 15} WO lainnya</div>`;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH: showDetail — tambah tombol ⭐ Rating di WO Done
// ═══════════════════════════════════════════════════════════════
const _origShowDetail = showDetail;
showDetail = function(woId) {
  _origShowDetail(woId);

  setTimeout(() => {
    const wo = WO.workorders.find(w => w.id === woId);
    if (!wo || wo.status !== 'Done' || !wo.techId) return;

    const old = document.getElementById('wo-rating-block');
    if (old) old.remove();

    const actionArea = document.querySelector('.status-actions');
    if (!actionArea) return;

    const ratingBlock = document.createElement('div');
    ratingBlock.id = 'wo-rating-block';
    ratingBlock.style.cssText = 'margin-bottom:20px;padding:14px 16px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';

    // PENTING: simpan woId di dataset, BUKAN di onclick string
    ratingBlock.dataset.woId = woId;

    if (wo.rating) {
      const filledStars = Array.from({length:5}, (_,i) =>
        `<span style="font-size:18px;color:${i < wo.rating ? '#f5a623' : '#d4e0d4'}">★</span>`
      ).join('');
      ratingBlock.innerHTML = `
        <div>
          <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Rating Pengerjaan</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="display:flex;gap:2px">${filledStars}</div>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:700;color:var(--navy)">${wo.rating}.0 / 5.0</span>
            <span style="font-size:11px;color:var(--accent);font-weight:600">${RATING_LABELS[wo.rating]||''}</span>
          </div>
          ${wo.ratingComment ? `<div style="font-size:12px;color:var(--text3);margin-top:4px;font-style:italic">"${esc(wo.ratingComment)}"</div>` : ''}
          <div style="font-size:10px;color:var(--text3);margin-top:4px;font-family:'IBM Plex Mono',monospace">oleh ${esc(wo.ratedBy||'—')} · ${wo.ratedAt||''}</div>
        </div>
        <button class="btn-ghost rating-block-btn">✏ Ubah Rating</button>`;
    } else {
      ratingBlock.innerHTML = `
        <div>
          <div style="font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">Rating Pengerjaan</div>
          <div style="font-size:12px;color:var(--text3)">Belum ada penilaian untuk teknisi ini.</div>
        </div>
        <button class="btn-primary rating-block-btn">⭐ Beri Rating</button>`;
    }

    // PENTING: pakai addEventListener bukan onclick attribute
    // woId sudah tersimpan di ratingBlock.dataset.woId
    ratingBlock.querySelector('.rating-block-btn').addEventListener('click', function() {
      openRatingModal(ratingBlock.dataset.woId);
    });

    actionArea.after(ratingBlock);
  }, 50);
};
// ═══════════════════════════════════════════════════════════════
// PATCH: renderTechnicians — tambah kolom Avg Rating
// (fully replaces original — no need to call _orig)
// ═══════════════════════════════════════════════════════════════
renderTechnicians = function() {
  const tbody = document.getElementById('tech-tbody');
  const thead = document.querySelector('#page-technicians .data-table thead tr');

  // Fix header — set sekali, replace isinya agar tidak duplikat
  if (thead) {
    thead.innerHTML = `
      <th>ID</th><th>Nama</th><th>Spesialisasi</th><th>Shift</th>
      <th>WO Aktif</th><th>Total WO</th><th>Avg Rating</th><th>Actions</th>`;
  }

  const stats = getTechRatingStats();

  if (!WO.technicians.length) {
    tbody.innerHTML = `<tr><td colspan="8">${emptyState('👷','Belum ada teknisi')}</td></tr>`;
    return;
  }

  tbody.innerHTML = WO.technicians.map(t => {
    const activeWo = WO.workorders.filter(w => w.techId === t.id && ['Assigned','In Progress'].includes(w.status)).length;
    const totalWo  = WO.workorders.filter(w => w.techId === t.id).length;
    const s        = stats[t.id];
    const avg      = s ? (s.sum / s.count).toFixed(1) : null;
    const filled   = s ? Math.round(s.sum / s.count) : 0;
    const starsStr = Array.from({length:5}, (_,i) =>
      `<span style="font-size:12px;color:${i < filled ? '#f5a623' : '#d4e0d4'}">★</span>`
    ).join('');
    const ratingCell = s
      ? `<div style="display:flex;align-items:center;gap:3px">${starsStr}
           <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text2);margin-left:3px">${avg}</span>
         </div>
         <div style="font-size:10px;color:var(--text3);font-family:'IBM Plex Mono',monospace">${s.count}x penilaian</div>`
      : '<span style="font-size:11px;color:var(--text3)">—</span>';

    return `<tr>
      <td><span class="td-code">${esc(t.id)}</span></td>
      <td><span style="font-weight:500">${esc(t.name)}</span></td>
      <td><span class="badge" style="background:rgba(45,212,191,.1);color:var(--teal)">${esc(t.spec)}</span></td>
      <td><span style="font-size:12px;color:var(--text2)">${esc(t.shift)}</span></td>
      <td><span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:${activeWo > 0 ? 'var(--accent)' : 'var(--text3)'}">${activeWo}</span></td>
      <td><span class="td-mono">${totalWo}</span></td>
      <td>${ratingCell}</td>
      <td><div class="tbl-actions">
        <button class="btn-icon" onclick="openModal('tech','${t.id}')" title="Edit">✏</button>
        <button class="btn-icon del" onclick="deleteTech('${t.id}')" title="Hapus">✕</button>
      </div></td>
    </tr>`;
  }).join('');
};

// ── Hook renderRatingPage ke navigateTo ──
// (renderRatingPage dipanggil langsung dari navigateTo patch di original)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
