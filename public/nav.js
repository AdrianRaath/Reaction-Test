/* ==========================================
   ReflexLab - Shared Nav (mobile tools menu)
   ========================================== */
(function () {
  'use strict';

  const btn = document.getElementById('nav-menu-btn');
  const menu = document.getElementById('nav-menu');
  if (!btn || !menu) return;

  function setOpen(open) {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }

  btn.addEventListener('click', () => {
    setOpen(menu.hidden);
  });

  // Close when clicking or tapping outside the menu and its button.
  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (!menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });

  // Close on Escape and return focus to the button.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      btn.focus();
    }
  });
})();
