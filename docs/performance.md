# First-time generation performance

Measured on 24 October 2026 using real Codex CLI calls. These are new projects, not edits to existing code. No saved visualization reuse was allowed. Every run began an independent conversation/session with no existing source. The benchmark kept identical model/effort overrides (both omitted), did not change local Codex configuration or enable Fast mode, and alternated variant order between topics.

The baseline had the optional helpers documented in a local file. The candidate additionally put a concise, **topic-independent helper API guide** directly in the first prompt, encouraging reuse of axes, resizing, controls, animation and styling rather than regenerating their source. Neither variant required a framework or mathematical topic template.

| Unseen topic | Baseline | Helper guide | Reduction | Response bytes, before → after |
| --- | ---: | ---: | ---: | ---: |
| Linear transformations | 158.6s | 138.0s | 13.0% | 20,471 → 16,449 |
| Central limit theorem | 157.4s | 132.6s | 15.8% | 21,421 → 17,654 |
| Fourier approximation | 154.7s | 122.7s | 20.7% | 17,505 → 16,010 |

These modest improvements do **not** establish that arbitrary first-time visualizations are now fast. In these tests, new builds still took roughly two minutes. There is only one sample per condition/topic; caching of shared prompt prefixes, model randomness and provider load are not controlled. This is not a statistically established general speedup. The earlier 149s → 11s heading-edit result measures incremental editing and must not be used as a first-build claim.

## Quality checks

All six paired outputs loaded without browser runtime errors and without observed horizontal overflow at 390px. The following representative checks were run through their actual browser controls, not by executing generated code on the host:

- Linear algebra: identity, rotation with no real eigenvectors, a defective matrix, zero matrix, diagonal determinant/trace, and visible plot changes. The guided version's interpolated mapping was also checked numerically.
- Probability: deterministic sample means and standardized values for uniform, exponential and Bernoulli distributions; a 1,000-sample mean/standard-deviation sanity check; source review of theoretical variances and histogram normalization.
- Fourier: square/sawtooth coefficients, Parseval RMS values at 1/5/20 terms, decreasing RMS error, and the plotted first square harmonic at π/2.

These are representative checks, not exhaustive mathematical correctness proofs. Desktop/mobile screenshots, source, events, per-run timing and numerical review records are preserved under the local benchmark directory.

## Separate direct-start check

A subsequent, previously unused complex-multiplication prompt tested the new direct-start path. A genuinely empty project now receives its empty revision and user request directly in the prompt instead of being told to reread the same context from files. Restored sessions and attachments still use file context as needed. That run made **zero shell/context-read commands**, but generation still took 113.8s. It is a single functional check, not a paired speed comparison.

It also caught a first-pass quality problem: the generated application expected `point.x`/`point.y`, while the original canvas helper returned arrays. This could silently hide vectors despite the absence of browser errors. The generic helper API was versioned to **v2**, supporting both array destructuring and named coordinates; v1 assets remain untouched. After updating only the helper import, the held-out application passed complex-product, magnitude, principal-angle, zero-argument and visible-vector checks. This repair is disclosed rather than counting the first output as a fully successful build.

## Reproduce

The real benchmark is opt-in and consumes Codex usage:

```sh
node test/first-build-benchmark.mjs
```

It runs three fresh topic pairs, never against the user's live workspace. Raw results default to `.local/first-build-benchmark/<timestamp>/`. `BENCH_ROOT` can resume a retained directory, `BENCH_CASES` selects case IDs, and `BENCH_VARIANTS` selects `baseline,guided`. For the fourth functional case:

```sh
BENCH_CASES=complex-product BENCH_VARIANTS=guided node test/first-build-benchmark.mjs
```

The runner records initial browser signals and explicitly leaves mathematical review pending. Absence of runtime errors or the presence of a canvas alone is not proof that a visualization is correct. The above numerical reviews were performed separately and saved alongside the results. The direct-start optimization and v2 API were added after the original paired experiment, so new runs need not reproduce its exact timings.
