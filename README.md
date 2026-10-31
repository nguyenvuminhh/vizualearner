# vizualearner

The full **vizualearner** app. See it. Understand it.

Describe a mathematical question, attach reference material, and explore an interactive visualization built by your installed Codex CLI. Follow up to change the same project; conversations, source files and earlier versions stay together on your computer.

This repository contains **only the app**. The public demo website is a separate repository.

## Clone, then start

Install [Node.js 22 or later](https://nodejs.org/) (npm is included), clone this repository, and run:

```sh
git clone https://github.com/nguyenvuminhh/vizualearner.git
cd vizualearner
npm start
```

**That is the only app startup command.** On a fresh clone, it installs the locked runtime dependencies automatically, then starts the local app. Open **http://127.0.0.1:3210**. Keep the terminal open; Ctrl+C stops it. Later starts reuse the installed dependencies. An internet connection is needed for the first installation and for AI generation.

The included interactive example works without a Codex login. You can also run `sh start.sh` on Linux or open `start.command` on macOS. This is a Node app, not a signed native installer.

## Enable your own AI generations

The integration has been tested with Codex CLI **0.160.0**. Install and sign in to [Codex CLI](https://learn.chatgpt.com/docs/cli):

```sh
npm install -g @openai/codex
codex login
```

Then use **Check connection again** in the app. Each user uses their own installed CLI, account and provider configuration. No developer API key or account credentials are included. Your own provider charges and usage limits apply. By default, the app makes AI calls only when you request a generation. Advanced users can opt into background preparation with `MATH_LAB_PREWARM=1`; this consumes account usage at startup.

Supported platforms: **macOS and Linux**. On Windows, use **WSL** and run the commands there. Native Windows startup is not currently supported.

## Use it

- Open the included gradient-descent example and change the learning rate, curvature or starting point.
- Choose **New Visualization** and describe an idea or attach your notes. The app creates an independent project.
- Ask follow-up questions to update the same visualization. Use **Source** to inspect/download generated files.
- Reopen previous projects, conversations and revisions. Use **Local workspace** to choose where your projects are saved.

Generated mathematics can be wrong. Verify equations, assumptions and numerical results independently.

## Local files and privacy

By default, `.local/workspace` holds projects, source revisions, conversations and attachments. An external workspace can be selected in the app. Back up your workspaces and preserve `.local` when updating the app. Each workspace can be opened by one app process at a time. After a forced termination, allow 10 seconds for its ownership lease to expire before restarting.

The app binds to loopback and is intended for one local user. Do not expose its ports publicly. During a generation, prompts, relevant source and attachments are sent through your configured Codex provider. Generated visualizations run in a sandboxed frame on a separate local origin. Local project/account data and dependencies are excluded from Git.

## Development

```sh
npm ci                           # install development dependencies
npm test                         # API/unit/startup tests; fake CLI, no account usage
npx playwright install chromium   # one-time browser setup
npm run test:browser              # app and helper browser integration tests
npm run dev                      # server watcher; run npm ci first
```

After a fresh `npm start`, only runtime dependencies are installed; use `npm ci` before running browser tests. Runtime dependencies are locked in `package-lock.json`. See the [developer guide](docs/developer-guide.md) for architecture and performance details.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3210` | Local app port |
| `ARTIFACT_PORT` | `3211` | Separate visualization origin |
| `CODEX_BIN` | `codex` | Installed Codex executable |
| `MATH_LAB_STATE` | `.local` beside the app | App state directory |
| `MATH_LAB_PREWARM` | `0` | Set `1` to opt into background preparation; consumes account usage |
| `GENERATION_TIMEOUT_MS` | `900000` | AI generation timeout |

## Source and contributions

The public app repository is [nguyenvuminhh/vizualearner](https://github.com/nguyenvuminhh/vizualearner). See [release guidance](docs/PUBLISHING.md), [contribution guidance](CONTRIBUTING.md), and [security guidance](SECURITY.md).

## License

[MIT](LICENSE), copyright Vu Minh Nguyen. Codex CLI is installed separately; third-party packages retain their respective licenses.
