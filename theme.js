(() => {
  let theme = 'dark';
  try { theme = localStorage.getItem('atri-review-theme') || 'dark'; } catch {}
  if (!['dark', 'light'].includes(theme)) theme = 'dark';
  document.documentElement.dataset.theme = theme;
  window.setReviewTheme = value => {
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('atri-review-theme', value); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = value === 'dark' ? '#14171b' : '#f5f6f8';
  };
})();
