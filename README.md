# JS Event Loop Exercises

Hands-on exercises for understanding how the JavaScript event loop actually
schedules work, checked in a real browser rather than by reading about it.
There is one exercise so far; more will be added here.

## Exercise 1 — Non-blocking Chunk Processor

Process a large array without freezing the UI.

```js
await processChunked(items, fn, {
  chunkSize: 1000,
  yieldStrategy: 'macro',   // 'micro' | 'macro' | 'raf' | 'idle'
  onProgress: (done, total) => { ... },
  signal: controller.signal,
});
```

- Splits `items` into chunks and runs `fn` on each element
- Releases the main thread between chunks according to `yieldStrategy`
- Reports `onProgress(done, total)` after every chunk
- Cancellable mid-flight via `AbortSignal` (rejects with `AbortError`)
- Throws on an unknown `yieldStrategy` before processing anything

**Files:** [`index.js`](index.js) — implementation · [`index.html`](index.html) — live test harness · [`index.test.js`](index.test.js) — Node tests

### Running it

Open `index.html` in a browser (or run `npm start` to serve the folder). Hammer the **Click me**
button while it runs — the click counter is the entire test. It only moves if
the main thread is genuinely being released.

| Strategy | Clicks received | Progress | Cancel button |
| --- | --- | --- | --- |
| `macro` | > 0 | steps along | works |
| `micro` | 0 | only 100% at the end | dead |
| `raf` | > 0, smooth | ~60 times/sec | works |
| `idle` | > 0 | erratic | works |

`idle` uses `requestIdleCallback`, which Safari does not have; there it falls
back to a macrotask, so it behaves like `macro`.

### Tests

`npm test` runs the Node tests (Node 18+) for results, progress, cancellation and
argument checks. They cover `micro`, `macro` and `idle`; `raf` needs a browser, so
it is only checked by hand with the harness above.

### Why `micro` freezes and `macro` doesn't

One turn of the event loop looks like this:

```
run one macrotask
  → drain the ENTIRE microtask queue (until empty)
  → render (style / layout / paint)
```

`await Promise.resolve()` queues a **microtask**. The queue has to drain
completely before the browser is allowed to render — but every chunk pushes
another microtask onto it, so it never drains. All 2,000 chunks (the harness default: 2,000,000
items, chunks of 1,000) run inside a single event loop turn. The browser starves: no paint, no input handling. There
is an `await`, but it never yields the thread.

`setTimeout(res, 0)` queues a **macrotask**, which ends the current turn. The
browser gets to paint and flush queued clicks before the next chunk starts.

> Microtasks yield to other JavaScript. Macrotasks yield to the browser.
> Only the second one saves your UI.

`raf` resolves right before each paint (~60/sec) — slower overall than `macro`,
but progress updates land exactly once per frame, so it looks smoothest. `idle`
runs only when the browser has spare time: maximum courtesy, unpredictable
latency.

### Where cancellation is checked

The abort check sits *after* the `await`, not before. While a chunk is running
synchronously nothing else on the page can execute — the cancel handler is stuck
in the queue. The only moment `aborted` can flip is during the yield, so that is
the only place worth checking. Which is also why **cancel does nothing under
`micro`**: a second, independent proof that it never releases the thread.

### Worth trying

Run `macro` with `chunkSize: 10`. Total time explodes — browsers clamp nested
`setTimeout(0)` to about 4ms, so the default 2,000,000 items become 200,000
chunks and about 800 seconds of pure waiting (an estimate from the clamp, not a
measured number; try a smaller item count to see it quickly). Yielding too often
costs more than the work itself.

## License

[MIT](LICENSE)
