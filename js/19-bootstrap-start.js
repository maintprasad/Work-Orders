if (checkSession()) {
  document.getElementById('login-screen').style.display = 'none';
  if (needsUnitSelector(SESSION.role) && !SESSION.selectedUnit) {
    showUnitSelector();
  } else {
    if (SESSION.selectedUnit) {
      if (SESSION.role !== 'Admin' && SESSION.role !== 'SPV') {
        applySimpleMode();
      } else {
        addUnitPill(SESSION.selectedUnitName || '');
      }
    }
    applyRoleUI();
    init();
  }
  // Wire print modal filter changes → update count
  ['print-date-from','print-date-to','print-filter-unit','print-filter-status','print-filter-priority'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updatePrintCount);
  });
}
// else: login screen stays visible, user must login
