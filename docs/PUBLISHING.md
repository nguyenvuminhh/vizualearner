# Publish the app source when authorized

The repository root is `vizualearner/`. It contains the complete local app and no website. The website is maintained separately. Cloning this repo is sufficient to obtain the app; users only need Node.js 22+ and `npm start` to launch it. AI generation additionally requires their own installed, signed-in Codex CLI.

Before publication:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Review tracked/staged files and the draft MIT license. Never include `.local`, credentials, Codex configuration, local conversations or user attachments. Keep local workspaces backed up and excluded from source control.

When ready, create the public repo with the authenticated GitHub CLI, from this directory:

```sh
gh repo create vizualearner --public --source=. --remote=origin --push
```

That command publishes source. It has not been run during preparation. Once the repository exists, link to it from the separate website. Users can then clone its actual URL and run `npm start` inside the checkout. GitHub’s automatic source archive also contains just this app repository.

The included Verify workflow runs tests only. It does not publish releases or deploy anything. The app is a local loopback service; publish its source, not its server ports.
