/* Переключение вкладок. Кнопка помечается data-tab, панель — data-panel. */
(function () {
  function show(name) {
    document.querySelectorAll('#tabs .tab').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('[data-panel]').forEach((p) => {
      p.hidden = p.dataset.panel !== name;
    });
    document.dispatchEvent(new CustomEvent('tabshow', { detail: name }));
  }

  document.querySelectorAll('#tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => show(btn.dataset.tab));
  });

  window.showTab = show;
  const first = document.querySelector('#tabs .tab.active') || document.querySelector('#tabs .tab');
  if (first) show(first.dataset.tab);
})();
