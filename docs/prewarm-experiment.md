# Prepared-session experiment · 30 October 2026

Historical development measurements; aggregate results are retained here without private request text or project identifiers.

A representative unconstrained-optimization visualization took 3m 41s. Its saved events showed global Superpowers/frontend skill reads and a helper-document read. Almost all elapsed time was inside Codex (221.47 of 221.53 seconds), rather than server preparation, validation or saving.

The prototype prepares a task-free conversation once, then forks it with the [official CLI's `codex exec fork` command](https://learn.chatgpt.com/docs/cli/reference). The seed contains the static visualization contract and helper quick start, with no example solution or user problem. Each child gets its own session and disposable input directory. Global skills/project instructions and unrelated plugins/MCP servers are suppressed only for these child processes. Authentication, model, effort, provider and service-tier settings remain inherited.

## First observations

Same exact request, model and effort overrides omitted in all cases; no saved-match reuse or service-tier override:

| Execution | User-request time | Generated response bytes | Final source bytes | Shell calls |
| --- | ---: | ---: | ---: | ---: |
| Earlier ordinary run | 221.53 s | 22,822 | 29,145 | 4 recorded completions |
| Minimal environment, cold session | 147.56 s | 21,063 | 20,322 | 0 |
| Minimal environment, prepared fork | 109.70 s | 14,162 | 20,568 | 0 |

Prepared-fork setup took **4.68 s**, before its request timer started. Including that one-time setup gives 114.38 s. The observed request-time reduction was 25.7% relative to minimal cold and 50.5% relative to the earlier run.

These are **single samples**, run sequentially, with the ordinary run collected earlier. They do not establish a stable speedup or isolate the contribution of preinitialization. The prepared result used vendored helper code and generated fewer output tokens; outputs are different applications. Server cache state, service variability and generation choices are uncontrolled. Forking preserves conversation history; it does not remove those tokens or guarantee provider prompt-cache hits. Usage counters on resumed/forked sessions can include prior turns, so they are not exact incremental costs.

Both new applications passed JavaScript validation, rendered without browser runtime errors, updated readouts when a control changed, and showed no horizontal overflow at 390 px. The cold result had 16 controls and the prepared result 10; these checks do not establish equal feature scope or comprehensive mathematical correctness. Desktop/mobile screenshots and browser reports were saved.

A real follow-up to the prepared child changed its heading with a 360-byte patch in **9.95 s**, retaining the child's session ID. It read the authoritative current source and preserved the controls. The shared seed was not resumed or modified.

## Evidence and reproduction

Benchmark artifacts are generated under the ignored `.local/prewarm-benchmark/` directory. They can include requests, persistent projects, source, events, screenshots and follow-up records; do not publish them.

`npm run benchmark:prewarm` repeats the paired minimal-cold/prepared experiment using the real account. It consumes model usage and writes a separate timestamped directory. Use `VIZUALEARNER_PREWARM=0` to retain minimal execution without preparation, or `VIZUALEARNER_MINIMAL=0` to restore the original environment. Existing projects retain their history; test the clean prepared path with a **new visualization**.

After benchmarking, review replaced individual plugin/server disable flags with equivalent whole-table overrides so valid dotted configuration names also work. `codex debug prompt-input` confirmed the resulting prompt omitted the global skills catalog. A separate real fork using the final configuration built a compact unit circle in 32.44 s with no shell calls; its SVG updated when the Angle slider changed, without browser errors. Artifacts are in `.local/prewarm-final-smoke/`.

Verification: all 18 automated tests and both browser suites passed. Tests cover seed persistence, independent forks, child-only resume, minimal directory cleanup, model mismatch, missing/unsupported-fork fallback, and recovery after signing in. Review findings were fixed and rechecked. The restarted app returned HTTP 200 and reported its default seed ready through `/api/prepare`.
