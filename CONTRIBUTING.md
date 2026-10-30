# Contributing

Use Node.js 22+ on macOS/Linux or WSL. Run `npm ci`, `npm test`, and `npx playwright install chromium`. Verify UI changes with `npm run test:browser`.

Keep the local app independent of the separate demo website. Preserve keyboard/touch controls, mathematical correctness, revision history and the product palette. Add meaningful tests for behavior changes.

Do not commit `.local`, Codex account/configuration files, attachments, chat logs, dependencies, `.env` files or machine-specific paths. The repository’s `.gitignore` excludes these by default.

Describe the user-visible change and tests in focused pull requests. Report security issues according to `SECURITY.md`.
