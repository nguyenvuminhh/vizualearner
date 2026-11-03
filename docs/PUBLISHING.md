# App source and releases

The repository root is `vizualearner/`. It contains the complete local app and no website. The website is maintained separately. Cloning this repo is sufficient to obtain the app; users only need Node.js 22+ and `npm start` to launch it. AI generation additionally requires their own installed, signed-in Codex CLI.

Before publishing an update:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Review tracked/staged files and the MIT license. Never include `.local`, credentials, Codex configuration, local conversations or user attachments. Keep local workspaces backed up and excluded from source control.

The test suite includes duplicate-launch/workspace ownership regressions and automated WCAG accessibility checks. CI runs on macOS and Linux. Codex CLI 0.160.0 was used for the real generation/resume smoke test; provider access and model compatibility still depend on the user's configuration. Background preparation is disabled unless `VIZUALEARNER_PREWARM=1` is explicitly set.

The public repository is [nguyenvuminhh/vizualearner](https://github.com/nguyenvuminhh/vizualearner). Publish reviewed updates with the authenticated GitHub CLI and Git. Keep the website source in its separate private repository. GitHub source archives contain only this app repository.

For the website, set its `config.json` app repository URL, run `npm test` and `npm run build:release`, then deploy only `dist/`. The release check rejects missing, inaccessible or empty public repositories. Verify HTTPS, routes and effective response headers on the chosen host before announcing the release.

The included Verify workflow runs tests only. It does not publish releases or deploy anything. The app is a local loopback service; publish its source, not its server ports.
