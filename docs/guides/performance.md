# Mobile performance

Target: correct chest openings and smooth roulette on iPhone X/11 and midrange Android. Measure the roulette and the preceding 3D opening separately.

## Runtime budget

CanvasRoulette draws a 164 CSS-pixel-high strip rather than a full-screen transparent surface. Size measurements occur on show, resize and DPR changes, not every animation frame. Only visible cards are drawn, and the world behind roulette/reward is paused. Card images and drawing surfaces are cached and released with their owner.

Rapier loads dynamically when physics is needed. This reduces initial application work but does not remove the physics download from the first scene that needs it. Pixel backgrounds reuse depth order instead of sorting per frame. Scene quality budgeting includes chest-triggered draws, and disposal releases contexts, canvas backing stores and owned geometry.

Preview cancellation avoids `AbortSignal.any()` so it does not require Safari 17.4. Explicit build targets include Safari 16, Chrome 107 and Firefox 104; transpilation alone does not provide missing browser APIs.

Presentation timing counts full elapsed visible time. Physics still uses bounded substeps, and hidden-tab time is excluded by the scheduler. The earlier `FrameTimeline` 100 ms clamp stretched a 2.5-second mine transition past a 15-second watchdog under slow frames. Removing that clamp fixed lost presentation time; 110 static ore crystals were also combined into one InstancedMesh.

## Reproducible browser probe

```sh
npm run perf:mobile
```

This builds production, starts preview, substitutes a test API and performs two openings per case across three Chromium profiles:

| Profile | CSS viewport | DPR | CPU slowdown |
|---|---|---|---|
| iPhone X | 375 × 812 | 3 | 4× |
| iPhone 11 | 414 × 896 | 2 | 4× |
| Android | 393 × 851 | 2.75 | 6× |

The runner disables `AbortSignal.any()`, checks the authoritative target, verifies no world WebGL draws behind roulette and no steady-spin DOM measurements, inspects canvas height, and records runtime/network errors, rAF intervals, p95, frames above 25 ms, long tasks and screenshots.

Outputs: `artifacts/mobile-performance/report.json` and adjacent PNGs. For a focused run:

```sh
PERF_PROFILES=iphone-x PERF_CYCLES=1 npm run perf:mobile -- artifacts/mobile-performance-quick deep-mine
npm run perf:mobile -- artifacts/mine-recheck deep-mine
```

The isolated `npm run preview:canvas` page exposes `canvasPreview.stats()` for strip-only measurements.

## Recorded evidence, 2026-10-22

The initial optimization build reduced the startup module from 5,509.30 KB to 1,178.53 KB (gzip 2,005.73 KB to 336.83 KB); the deferred Rapier module remained 4,332.82 KB (gzip 1,669.31 KB). These are historical build sizes, not a promise for subsequent revisions.

The 164-pixel strip reduces backing-store area by about 80% for the target portrait viewports at renderer DPR capped at two. This is surface arithmetic, not measured FPS or total GPU memory.

The original mobile run completed the other four case types but failed the mine transition watchdog. A supplied mine recheck after the timeline fix completed two cycles on all three emulated profiles, reporting about 60 rAF FPS and p95 16.7–16.8 ms during roulette. The associated code checks recorded 315 passing tests and a production build at that point. None of these historical counts is a fresh validation of the current tree.

Chromium viewport/CPU emulation does not reproduce Safari, mobile GPU bandwidth, Telegram WebView or thermal throttling. rAF cadence and CPU render-submission time do not measure completed GPU work. Physical-device smoothness remains unverified by those reports.

## Device acceptance

Use production HTTPS with normal motion and audio enabled. Test cold entry, ten repeated openings across all worlds, destruction, orientation change and background/resume during animation. Include Safari on the target iOS version and Telegram WebView if supported.

For a 60 Hz screen, target stable roulette frames around 16.7 ms. Record p95 and long frames separately from average FPS, as well as memory/context stability after repeated navigation. Review the 3D opening and destruction independently; a smooth roulette does not establish a smooth full cycle.
