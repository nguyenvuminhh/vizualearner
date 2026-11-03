(() => {
  const media = matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    let saved; try { saved = localStorage.getItem('vizualearner:theme'); } catch {}
    const theme = ['dark', 'light'].includes(saved) ? saved : media.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101722' : '#eef2f7');
  }
  // Preserve saved selections, drafts and settings from earlier app namespaces.
  try {
    for (const key of Object.keys(localStorage)) {
      const renamed = key.replace(/^[^:]+:(selected|draft|settings|use-saved-match)(?=:|$)/, 'vizualearner:$1');
      if (renamed !== key) {
        if (localStorage.getItem(renamed) === null) localStorage.setItem(renamed, localStorage.getItem(key));
        localStorage.removeItem(key);
      }
    }
  } catch {}
  apply(); media.addEventListener('change', apply);
  addEventListener('storage', event => { if (event.key === 'vizualearner:theme') apply(); });
})();
