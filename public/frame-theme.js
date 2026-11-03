// Works inside the opaque-origin visualization sandbox; only the host parent sets the theme.
(() => {
  const style = document.createElement('style');
  style.textContent = 'html[data-vizualearner-theme="dark"]{filter:invert(1) hue-rotate(180deg);background:#eef2f7;color-scheme:light}html[data-vizualearner-theme="dark"] :is(img,video){filter:invert(1) hue-rotate(180deg)}';
  document.head.append(style);
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'vizualearner-theme') return;
    if (['light', 'dark'].includes(event.data.theme)) document.documentElement.dataset.vizualearnerTheme = event.data.theme;
  });
})();
