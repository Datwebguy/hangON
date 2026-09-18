(function () {
  const STORAGE_KEY = 'hangon-theme';
  
  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem(STORAGE_KEY, theme);
    updateButtons(theme);
  }

  function updateButtons(theme) {
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      const isLight = theme === 'light';
      btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
      btn.innerHTML = isLight 
        ? '<span class="theme-icon">Dark</span>' 
        : '<span class="theme-icon">Light</span>';
    });
  }

  // Initialize immediately before render
  const initialTheme = getPreferredTheme();
  if (initialTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
  };

  document.addEventListener('DOMContentLoaded', () => {
    updateButtons(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', window.toggleTheme);
    });
  });
})();
