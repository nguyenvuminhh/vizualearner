# Vizualearner updates

Requirements: replace the previous product name throughout app, generated examples and website; add persistent dark mode; publish saved Quicksort Studio to prepared website demos; display live Codex account limits; accept pasted images.

Implementation order:
- Rename tracked identifiers, configuration variables, helper paths and product copy consistently. Repair branding in saved local HTML and project data without deleting conversations.
- Add a theme initializer and accessible toggle. Default to OS theme, remember explicit choice. Apply dark styles to app and sandboxed visualizations through a host-injected stylesheet.
- Read Codex account/rateLimits/read through a bounded stdio app-server process; cache briefly, handle unsupported accounts truthfully, expose only rate-limit data. Display windows, remaining percentage, reset time and refresh action.
- Handle clipboard image files through existing attachment count/size validation, preserve plain-text paste.
- Copy only saved Quicksort source to website, write prepared sample conversation, extend build/routes/tests/documentation and sync app UI.
- Run app unit/browser/accessibility tests and website tests; inspect dark mode and Quicksort; deploy website and verify live routes.

Review focus: API accounts with no limits; hung/malformed RPC; quota refresh after generation; text paste and attachment overflow; sandbox dark contrast; demo transport makes no backend requests; no private conversation or attachment export.
