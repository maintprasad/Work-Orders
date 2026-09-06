// ═══════════════════════════════════════════════════════════════
// ── ITEMS_DB cache (sumber data spare part dari sheet ITEMS_DB) ──
let ITEMS_DB_CACHE = [];

function loadItemsDbCache() {
  try {
    const raw = localStorage.getItem(CFG.itemsDbKey);
    if (raw) ITEMS_DB_CACHE = JSON.parse(raw);
  } catch {}
}

function saveItemsDbCache(items) {
  ITEMS_DB_CACHE = items;
  localStorage.setItem(CFG.itemsDbKey, JSON.stringify(items));
}

// Map item dari ITEMS_DB ke format parts picker
function itemToPickerPart(item) {
  return {
    id:       item.itemCode || item.id   || '',
    name:     item.itemName || item.name || '',
    stock:    parseInt(item.stock)       || 0,
    minStock: parseInt(item.minStock)    || 0,
    uom:      item.uom      || item.unit || 'pcs',
  };
}

async function openPartsPicker(woId) {
  document.getElementById('pp-wo-id').value = woId;
  document.getElementById('pp-search').value = '';
  PP_SELECTED = { partId: null, qty: 1 };

  // Load cache dulu agar modal langsung muncul
  loadItemsDbCache();
  renderPartsPicker();
  document.getElementById('modal-parts-picker').classList.add('open');

  // Fetch fresh dari ITEMS_DB MaintWare di background
  try {
    const r = await fetch(CFG.maintwareApiUrl + '?action=getItems', {
      mode: 'cors', signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (d.success && Array.isArray(d.data)) {
      saveItemsDbCache(d.data);
      renderPartsPicker(); // refresh list dengan data terbaru
    }
  } catch(e) {
    console.warn('[PartsPicker] Gagal fetch ITEMS_DB dari MaintWare:', e.message);
    // Tetap tampilkan dari cache
  }
}

function renderPartsPicker() {
  const q    = (document.getElementById('pp-search')?.value || '').toLowerCase();
  const woId = document.getElementById('pp-wo-id').value;
  const wo   = WO.workorders.find(w => w.id === woId);
  const usedIds = (wo?.partsUsed || []).map(p => p.partId);

  // Sumber data: ITEMS_DB_CACHE, fallback ke EQUIP_DB.parts
  let rawItems = ITEMS_DB_CACHE.length
    ? ITEMS_DB_CACHE.map(itemToPickerPart)
    : (EQUIP_DB.parts || []).map(p => ({
        id: p.id, name: p.name,
        stock: parseInt(p.stock) || 0,
        minStock: parseInt(p.minStock) || 0,
        uom: p.uom || 'pcs', dept: '', area: '',
      }));

  let parts = rawItems.filter(p =>
    p.id && !usedIds.includes(p.id) &&
    (!q || p.name.toLowerCase().includes(q) ||
           p.id.toLowerCase().includes(q)   ||
           p.dept.toLowerCase().includes(q) ||
           p.area.toLowerCase().includes(q))
  );

  const el = document.getElementById('parts-picker-list');
  if (!parts.length) {
    el.innerHTML = ITEMS_DB_CACHE.length === 0
      ? '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">⏳ Memuat data dari Sheets...</div>'
      : '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">Tidak ada parts ditemukan</div>';
    return;
  }

  el.innerHTML = parts.map(p => {
    const s   = p.stock;
    const cls = s === 0 ? 'zero' : (s <= (p.minStock || 0) ? 'low' : 'ok');
    const isSel = PP_SELECTED.partId === p.id;
    return `<div class="pp-item ${isSel ? 'selected' : ''}" onclick="selectPart('${p.id}','${esc(p.name)}')">
      <div class="pp-info">
        <div class="pp-name">${esc(p.name)}</div>
        <div class="pp-code">${esc(p.id)} · Stok: <span class="pp-stock ${cls}">${s} ${p.uom}</span></div>
      </div>
      ${isSel ? `<div class="pp-qty-wrap" onclick="event.stopPropagation()">
        <button class="qty-btn" onclick="changeQty(-1)">−</button>
        <input class="qty-inp" id="pp-qty-inp" type="number" value="${PP_SELECTED.qty}" min="1" onchange="PP_SELECTED.qty=parseInt(this.value)||1"/>
        <button class="qty-btn" onclick="changeQty(1)">+</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function selectPart(partId, name) {
  PP_SELECTED = { partId, name, qty: 1 };
  renderPartsPicker();
}

function changeQty(delta) {
  PP_SELECTED.qty = Math.max(1, (PP_SELECTED.qty || 1) + delta);
  const el = document.getElementById('pp-qty-inp');
  if (el) el.value = PP_SELECTED.qty;
}

async function confirmPickPart() {
  const woId = document.getElementById('pp-wo-id').value;
  if (!PP_SELECTED.partId) { toast('Pilih part dulu', 'error'); return; }
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  const qty = parseInt(document.getElementById('pp-qty-inp')?.value) || PP_SELECTED.qty;

  // Cek stok dari cache
  const rawItem   = ITEMS_DB_CACHE.find(i => (i.itemCode || i.id) === PP_SELECTED.partId);
  const localPart = rawItem
    ? itemToPickerPart(rawItem)
    : (EQUIP_DB.parts || []).find(p => p.id === PP_SELECTED.partId);
  const curStock = parseInt(localPart?.stock ?? 0);

  if (curStock < qty) {
    toast(`Stok tidak cukup! Stok saat ini: ${curStock} ${localPart?.uom || 'pcs'}`, 'error');
    return;
  }

  const btn = event?.target;
  if (btn) btn.disabled = true;

  // ── Update stok ITEMS_DB milik MaintWare via GET + _body — pola ini
  //    sengaja mengikuti cara app MaintWare sendiri memanggil updateStock
  //    (menghindari isu CORS preflight khusus action ini di GAS) ──
  try {
    const stockBody = {
      action:    'updateStock',
      itemCode:  PP_SELECTED.partId,
      txType:    'OUT',
      quantity:  qty,
      pic:       SESSION?.nama || 'WO System',
      notes:     'WO: ' + woId + (wo.title ? ' — ' + wo.title : ''),
      woId:      woId,
      // Konteks unit/area/equipment dari WO, supaya pemakaian ini ikut
      // terhitung di dashboard Top Area / Top Equipment MaintWare
      unitId:    wo.unitId  || '',
      areaId:    wo.areaId  || '',
      equipId:   wo.equipId || '',
      unitName:  wo.unitId  ? (getUnitName(wo.unitId)   || '') : '',
      areaName:  wo.areaId  ? (getAreaName(wo.areaId)   || '') : '',
      equipName: wo.equipId ? (getEquipName(wo.equipId) || '') : '',
    };

    const url  = CFG.maintwareApiUrl + '?action=updateStock&_body=' + encodeURIComponent(JSON.stringify(stockBody));
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const result = await resp.json();

    if (!result.success) {
      toast('❌ MaintWare error: ' + (result.message || 'Gagal update stok'), 'error');
      if (btn) btn.disabled = false;
      return;
    }

    // Update cache lokal pakai stockAfter dari GAS MaintWare
    const newStock = String(result.stockAfter ?? Math.max(0, curStock - qty));
    if (rawItem)   { rawItem.stock   = newStock; saveItemsDbCache(ITEMS_DB_CACHE); }
    if (localPart) { localPart.stock = newStock; }

  } catch (e) {
    console.warn('[PartsPicker] Gagal update stok ke MaintWare:', e.message);
    toast('⚠ Gagal sinkron stok ke Warehouse (MaintWare). Cek koneksi / CFG.maintwareApiUrl.', 'error');
    // Optimistic update lokal saja — TIDAK mengubah stok asli di MaintWare
    const fallback = String(Math.max(0, curStock - qty));
    if (rawItem)   { rawItem.stock   = fallback; saveItemsDbCache(ITEMS_DB_CACHE); }
    if (localPart) { localPart.stock = fallback; }
  }

  // ── Tambah ke partsUsed WO ──
  wo.partsUsed.push({
    partId: PP_SELECTED.partId,
    name:   PP_SELECTED.name,
    qty,
    uom:    localPart?.uom || 'pcs',
  });
  addAudit(wo, 'parts', `Part diambil: ${PP_SELECTED.name} ×${qty}`);
  saveLocal();
  closeModal('parts-picker');
showDetail(woId);
setTimeout(() => switchTab('parts', woId), 100);
toast(`${PP_SELECTED.name} ×${qty} ditambahkan ke WO`, 'success');

  // Sync WO ke Sheets — force flush langsung, jangan tunggu debounce
  syncUpsertWO(wo);
  if (SYNC.timer) { clearTimeout(SYNC.timer); SYNC.timer = null; }
  setTimeout(() => flushQueue(), 200);

  if (btn) btn.disabled = false;
}

function removePart(woId, partId) {
  const wo = WO.workorders.find(w => w.id === woId);
  if (!wo) return;
  const p = wo.partsUsed.find(x => x.partId === partId);
  wo.partsUsed = wo.partsUsed.filter(x => x.partId !== partId);
  if (p) addAudit(wo, 'parts', `Part dihapus: ${p.name}`);
  saveLocal(); showDetail(woId); syncUpsertWO(wo);
}

// ═══════════════════════════════════════════════════════════════
// ATTACHMENTS — Upload ke Google Drive via GAS
