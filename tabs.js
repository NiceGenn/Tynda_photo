/* Переключение вкладок. Кнопка помечается data-tab, панель — data-panel. */
(function () {
  function show(name) {
    document.querySelectorAll('#tabs .tab').forEach((b) => {
      const selected = b.dataset.tab === name;
      b.classList.toggle('active', selected);
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[data-panel]').forEach((p) => {
      p.hidden = p.dataset.panel !== name;
    });
    document.dispatchEvent(new CustomEvent('tabshow', { detail: name }));
  }

  document.querySelectorAll('#tabs .tab').forEach((btn) => {
    const panel = document.querySelector(`[data-panel="${btn.dataset.tab}"]`);
    const panelId = panel.id || `tab-${btn.dataset.tab}`;
    panel.id = panelId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-button-${btn.dataset.tab}`);
    btn.id = `tab-button-${btn.dataset.tab}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', panelId);
    btn.addEventListener('click', () => show(btn.dataset.tab));
    btn.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...document.querySelectorAll('#tabs .tab')];
      const index = tabs.indexOf(btn);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      show(tabs[next].dataset.tab);
      tabs[next].focus();
    });
  });

  window.showTab = show;
  const first = document.querySelector('#tabs .tab.active') || document.querySelector('#tabs .tab');
  if (first) show(first.dataset.tab);
})();
