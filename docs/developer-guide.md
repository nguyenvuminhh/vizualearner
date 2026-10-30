# vizualearner

A local mathematics laboratory powered by your installed Codex CLI. Describe any mathematical problem, attach reference material, and explore a custom interactive visualization. Follow-up messages modify the same project. Every project has its own persistent conversation, source revisions, attachments, and Codex session.

## Run locally

Requires **Node.js 22+**. AI generation additionally requires an installed, signed-in **Codex CLI** supporting `exec`, `exec resume`, JSON events, and `--output-schema` (tested with 0.160.0).

```sh
cd vizualizer
npm start    # installs missing runtime dependencies automatically
```

Open **http://127.0.0.1:3210**. No separate API key is needed when using your existing Codex login. If Codex is missing, install it with `npm install -g @openai/codex`. Generation uses your configured Codex provider/account and its usage limits. The bundled example works immediately, offline, without invoking Codex.

### Prepared sessions and minimal working directories (prototype)

At startup, Math Lab prepares a task-free Codex conversation containing its output contract, sandbox constraints and helper API. This small real model call consumes account usage once per configuration fingerprint. The saved seed lives in `.local/prewarm/`; its Codex session stays in your normal Codex home. Each new project uses **`codex exec fork <seed-session-id>`**, producing an independent child conversation. Follow-ups resume that child's exact session. User problems and generated examples are never added to the shared seed.

Preparation runs in the background. Requests do not wait for it: if a matching seed isn't ready, generation starts cold. Seeds are keyed by model/effort, CLI version, global config, instructions, schema and execution overrides. The default settings warm automatically; `POST /api/prepare` with the normal local token and `{model,effort}` can prepare another selection explicitly. Missing sessions or an unsupported fork command fall back to a fresh session. Preparation failures leave ordinary generation available. Changing global config requires restarting the server.

Each invocation gets a disposable directory outside the app repository containing only its context manifest, helper reference, attachments, and, when relevant, authoritative source/history. Logs and output files remain in the normal persistent run directory. Invocation-only configuration suppresses global skill catalogs, bundled skills, project instruction discovery and unrelated plugins/MCP servers. Authentication, provider, model, effort and service-tier defaults remain inherited, and explicit selections still apply. Your global configuration file is never edited. This reduces irrelevant context; it is **not filesystem confinement**. The read-only sandbox and iframe restrictions still apply. Existing sessions can retain instructions already present in their history; start a new project to test the clean path.

Set `MATH_LAB_PREWARM=0` to disable prepared sessions while retaining minimal execution. Set `MATH_LAB_MINIMAL=0` to restore the previous execution environment (also disables preparation). Timing stats record `minimalEnvironment`, `prewarmed`, `seedSessionId`, `seedFallback` and `commandCount`. Seed setup duration is saved separately in `seed.json`.

Run `npm run benchmark:prewarm` for an opt-in, real-account comparison of minimal cold versus prepared-fork generation with the same prompt. It makes two generations plus a preparation call and saves timings/source under `.local/prewarm-benchmark/`. `BENCH_PROMPT` and `BENCH_ROOT` customize it. A prepared conversation avoids repeated orientation; it does not eliminate reasoning or output generation, and a speedup needs measurement.

## Explore

1. Try **Gradient descent, in motion**: drag the starting point, change the learning rate and curvature, and play or step through the iterations. Contours and the convergence trace update immediately. Steps outside `0 < α < 2/κ` are visibly flagged. The example uses the exact quadratic update `x ← (1−α)x`, `y ← (1−ακ)y`.
2. Click **New Visualization** to create an independent project and fresh conversation. Previous work is preserved. This is the normal way to start a separate conversation.
3. Describe your problem. Attach images, PDFs, text, CSV, or other supporting files with the paperclip or drag and drop. Limits: 8 files per message, 20 MB per file, 30,000 characters per message. PNG/JPEG/WebP images are passed directly to Codex; other files are read through its local file tools. Reading some formats, such as PDFs, depends on locally available extraction tools; the engine is instructed to disclose unreadable references.
4. Click **Visualize**, or press **⌘/Ctrl+Enter**. Generation can take several minutes. You can continue interacting with the last saved version while Codex works, switch projects, or cancel.
5. Send a follow-up to update the current visualization. **View conversation** restores all saved messages and attachment links. Mathematical explanations are generated only when requested.
6. Use **Source** to inspect and download any source file. The revision menu previews previous versions. Follow-ups always modify the latest version, even while an earlier revision is being previewed.
7. Use **Local workspace** at the bottom of the sidebar to browse to a directory or enter a new folder path. Newly entered folders are created automatically. Switch back to any previous workspace to reopen its projects. Workspace changes are blocked while generation is running; cancel or wait first.

Messages, responses, attachments, session IDs, and successful source revisions **save automatically**. Reopen the application and select an exploration to continue. The last selected project and unsent text drafts are also remembered in that browser. File attachments are persisted when the message is submitted.

Generation shows a live elapsed timer. Completed responses show **Worked for 2m 59s • 00:10**: total generation time followed by the local completion time. Timings include preparation and validation, are saved on each response and in `runs/<run-id>/timing.json`, and survive reopening. Failed and cancelled runs also retain their elapsed time. Older responses use saved request/response timestamps and show `~` to identify an estimate.

**Timing breakdown** separates preparation, Codex execution (including its local tools), validation, and source saving. Frame load is measured separately in the browser and saved as `revisions/<revision>/render.json`; it is not included in generation time and does not imply mathematical correctness. Codex-reported token totals, response size, and patch/full-source mode are also recorded. Token totals can include earlier turns in a resumed session, so they are not presented as exact per-response token consumption.

Use **Model** and **Effort** below the prompt to configure generation. Model suggestions come from your local Codex model cache; you can also enter a custom model ID. Known models show their advertised effort levels. Default options omit overrides and use Codex's current session/configuration defaults. Available models and effort support depend on your account/provider. Choices are remembered per exploration in the browser and saved in the project, submitted message, and run's `settings.json` when you send. You can change controls during generation for your next message; the active run keeps its original settings. Changing model or effort preserves the existing conversation and resumes its Codex session. Overrides use `--model` and `-c model_reasoning_effort=...` on both new and resumed runs, as described in the [official CLI configuration documentation](https://learn.chatgpt.com/docs/developer-settings).

**Reuse saved match** is optional and **off by default**. When explicitly enabled for a new project, an exact previous request with the same selected model/effort, no attachments, and a previously rendered source without reported runtime errors can be copied into a fresh independent conversation/codebase. It does not copy the other project's Codex session; the first follow-up starts this project's own session. The app labels reuse explicitly and records no Codex execution time. This helps repeats only and is not a solution to first-time generation latency.

## Storage

The default workspace is `.local/workspace`. Choose another location in the interface. Only the selected workspace path is stored in `.local/config.json`; there is no database.

```text
your-workspace/
  visualizations/
    <project-uuid>/
      project.json                # title, full conversation, attachments, session ID,
                                  # revision list, current-revision pointer, status
      attachments/                # original supporting files with unique filenames
      revisions/
        <revision-uuid>/source/
          index.html              # visualization entry point
          ...                     # JS, CSS, SVG, shaders, data, etc.
      runs/
        <run-uuid>/
          context.json            # small revision/hash manifest and recent summaries
          conversation.json       # full textual history, new/restored sessions only
          current-source/         # previous codebase used as context
          attachments/            # reference-material snapshot
          helper-docs.md          # optional browser helper API
          prompt.txt              # visualization and persistent-session instructions
          prompt-1.txt            # per-attempt prompts; recovery can add another
          schema.json
          events.jsonl            # raw Codex events, including tool results
          stderr.txt
          output.json             # structured response: complete files or targeted edits
          output-1.json           # per-attempt responses, including failed patches
          timing.json             # total, phase breakdown, CLI totals and response size
```

Copy the workspace to back it up. Generated source is ordinary, editable browser code. Self-contained HTML can be opened directly; projects with ES modules need a static HTTP server. CDN-based visualizations need an internet connection. Browser interaction state (slider values, animation position) resets when reopening; the code and conversation persist.

Codex's own session files remain in its normal local state directory, alongside the session ID saved in `project.json`. Follow-ups use **`codex exec resume <that-specific-session-id>`**, never `--last`. If that session is missing, the app starts a replacement session for the same project using its full saved conversation, source, and attachments. The replacement is recorded in the history. Moving a workspace to a machine without the original Codex session therefore preserves the project context.

## Architecture and boundaries

- A small Node/Express server manages the filesystem, uploads, and Codex subprocesses. A buildless HTML/CSS/JavaScript frontend keeps installation and maintenance simple.
- The engine asks Codex for structured browser-ready source. New visualizations return complete files. Follow-ups normally return only added/replaced files, exact find/replace edits, and explicit deletions. Edits must target the exact current revision and match once; omitted files remain unchanged. The app assembles a complete immutable codebase and validates it before publication. An ambiguous/stale patch triggers at most one full-file recovery attempt in the same session, with the same selected model and effort. Syntax errors preserve the previous source. The contract remains `index.html`, up to 100 files / 8 MB. No framework or mathematical subject is imposed; arbitrary host programs/build steps remain outside this MVP.
- Resumed sessions receive the latest instruction, a small source manifest with SHA-256 hashes, attachment paths and recent change summaries. Codex is asked to read only relevant current files rather than reread all history. New/restored sessions additionally receive the full textual conversation, without redundant raw source responses; current source is supplied separately. The original unabridged responses remain saved in `project.json` and run outputs. Each visualization retains one conversation, codebase and Codex session. Prompts and protocol live in `lib/protocol.js`; orchestration, context preparation and subprocess handling are separated into small modules.
- Optional versioned helpers provide responsive Canvas axes, tick labels, arrows, circles, coordinate conversion, synchronized range/number controls, animation and general styling utilities. Codex can request `helpers:["canvas","controls","theme"]`; the app copies their actual source/CSS into `mathlab/v3/` within the saved revision. Coordinate conversions support both `[x,y]` and `.x/.y`. Existing v1 and v2 assets remain intact. Helpers work offline and inside the sandbox, remain inspectable/downloadable, and impose no topic, framework or required layout. New sessions receive a concise helper API guide directly in their prompt; Codex can ignore it or combine helpers with other libraries.
- Brand-new projects are told their empty revision and complete request directly, avoiding mandatory context-file reads that repeat the same information. Restored conversations, current source and supporting attachments still receive appropriate file context. No model, reasoning-effort or service-tier change is made automatically.
- Generation uses a read-only Codex shell sandbox and noninteractive `never` approval policy. The app validates generated paths and writes only accepted source files. It does not execute generated programs on the host or install generated dependencies. Codex uses your account and model/provider settings; the default minimal mode excludes unrelated skills/plugins/MCP tools for that invocation. Its sandbox is not a separate user account or a guarantee that it cannot read other accessible files. Use a dedicated OS account/container if stronger agent isolation is required.
- Generated visualizations run on a **separate loopback origin** in a frame with `sandbox="allow-scripts"` and a matching server-side CSP. They cannot access the parent DOM, app cookies, local storage, app API responses, forms, popups, nested frames, or browser devices. API writes require a per-launch token and same-origin requests; Host checks protect against DNS rebinding. Source paths are checked against symlink escapes.
- Visualization fetch/XHR, workers, and service workers are disabled. Scripts and ESM can load from the explicit CDN allowlist (`cdn.jsdelivr.net`, `esm.sh`, `unpkg.com`); styles/fonts have a small allowlist too. This enables many libraries, but libraries requiring fetch-based data loading or workers need an alternative implementation. Approved CDN requests leave the machine. The interface discloses that submitted prompts, code and attachments are sent through Codex to its provider; files are not exclusively processed offline.
- A browser sandbox cannot guarantee generated mathematics is correct or prevent a visualization from consuming excessive CPU/GPU resources. The engine is instructed to check equations, domains, limiting cases, and numerical stability; generated results still warrant mathematical review. The bundled quadratic example has a numerical browser check.

Each successful generation writes an immutable revision before atomically replacing `project.json` and its current-revision pointer. Failed/cancelled generations keep the previous code and append an error to the conversation. Force-quit recovery marks unfinished projects as interrupted; session IDs and completed assistant responses are saved during generation. Raw events and run snapshots remain available for diagnosis. A project permits only one generation at a time; different projects may generate independently. A 15-minute timeout stops stalled processes, with process-group termination on macOS/Linux. Windows cancellation targets the CLI process.

The renderer adds a small error-reporting bridge to served HTML, leaving saved source untouched. Browser runtime errors appear in the app with details you can include in a follow-up repair request. Messages are accepted only from the active visualization frame.

Before publishing a revision, the app parses generated JavaScript files and executable inline HTML scripts with Acorn (using parse5 to identify scripts). Syntax errors reject the revision and preserve the previous visualization. This does not execute generated code on the host, and does not guarantee the absence of browser runtime errors or mathematical mistakes.

## Configuration

```sh
PORT=3310 ARTIFACT_PORT=3311 npm start
CODEX_BIN=/absolute/path/to/codex npm start
GENERATION_TIMEOUT_MS=1200000 npm start
MATH_LAB_STATE=/absolute/path/to/app-state npm start
```

The two ports must differ. Both bind to `127.0.0.1`; this is a local single-user application, not a public server. `CODEX_BIN` is an executable path, not a shell command or argument string. Model/provider selection follows the local Codex configuration.

If connection detection fails, open the help button and select **Check connection again**. A missing executable requires installing Codex or setting `CODEX_BIN`, then restarting the app. For generation errors, open the conversation and inspect the corresponding `runs/` folder. After correcting the cause, send a follow-up such as “Retry my last request.”

## Verification

```sh
npm test
npx playwright install chromium   # once, if Chromium is not already installed
npm run test:browser
```

The API tests use a clearly separated fake CLI fixture and cover generation, targeted edits, stale/ambiguous patch recovery, lean context and complete history restoration, unchanged model/effort overrides, session isolation, source serving, attachments, cancellation/failure/restart recovery, timing, authorization and path safety. Browser tests cover interactive mathematics, live timers/reopening, phase and frame-load measurements, uploads, follow-up patches, source inspection, mobile layout, and the optional helpers' canvas, controls, animation, ESM/CSS loading and persistence inside the sandbox.

An opt-in test exercises **your real installed Codex CLI** and consumes model usage:

```sh
node test/real-codex.mjs
```

It generates an interactive unit circle, resumes its original session for a modification, checks the generated control in Chromium, and saves the result under `.local/real-codex-check`.

An isolated real-CLI comparison on the same KKT heading edit measured 148.6 seconds / 30,214 response bytes with the old full-source protocol, versus 11.2 seconds / 374 response bytes with the incremental protocol. Both produced exactly the requested source change. Model and effort overrides were identical (none); no Fast mode was used. This is one sequential sample, with resumed-session caching and provider variability, not a general speed guarantee. The local comparison is saved in `.local/bench/comparison.json` when present. New complex visualizations can still take substantially longer than small edits.

For the subsequent **fresh-generation** comparison across linear algebra, probability and Fourier analysis, including quality checks, the held-out helper bug and measurement limits, see [performance results](performance.md). The observed improvements were 13–21%, with first builds still around two minutes. These measurements are deliberately separate from the one-line-edit benchmark.

Codex automation reference: [official non-interactive mode documentation](https://developers.openai.com/codex/noninteractive).

### Product colors

The app, bundled dashboard, plot helpers v3 and AI generation instructions share the profile’s cool blue-gray and blue palette. App colors are named tokens in `public/theme.css`; Canvas helpers export `palette` for chart drawing. Keep semantic green, amber and red for success, warnings and errors.
