/**
 * Exercise 1: Non-blocking Chunk Processor
 *
 * Splits items into chunks and yields control back to the event loop between
 * chunks according to yieldStrategy, so the UI stays responsive while
 * processing a large array.
 *
 * @param {Array}    items   - the array to process
 * @param {Function} fn      - called for each element: (item, index) => any
 * @param {Object}   options
 * @param {number}   options.chunkSize      - elements per chunk (default 1000)
 * @param {'micro'|'macro'|'raf'|'idle'} options.yieldStrategy - how to yield the thread
 * @param {Function} options.onProgress     - (done, total) => void, called after each chunk
 * @param {AbortSignal} options.signal      - cancel mid-flight
 * @returns {Promise<Array>} the results of fn
 * @throws {DOMException} AbortError if the signal is aborted
 */
const YIELD_STRATEGIES = ["micro", "macro", "raf", "idle"];

async function processChunked(items, fn, options = {}) {
    const {
        chunkSize = 1000,
        yieldStrategy = "macro",
        onProgress,
        signal,
    } = options;

    // fail fast: a typo in yieldStrategy should not wait for the first chunk to surface
    if (!YIELD_STRATEGIES.includes(yieldStrategy)) {
        throw new Error(`Unknown yieldStrategy: ${yieldStrategy}`);
    }

    const total = items.length;
    const results = new Array(total); // preallocate so the array never resizes

    // already aborted before we started -> reject immediately, process nothing
    signal?.throwIfAborted();

    for (let start = 0; start < total; start += chunkSize) {
        const end = Math.min(start + chunkSize, total); // clamps the last partial chunk

        for (let i = start; i < end; i++) {
            results[i] = fn(items[i], i);
        }

        onProgress?.(end, total); // end == number of elements completed

        // no yield after the final chunk — it would cost a turn for nothing
        if (end < total) {
            await yieldTo(yieldStrategy);
            // the cancel handler can only run while we're yielding, so this is
            // the one moment `aborted` could have just flipped to true
            signal?.throwIfAborted();
        }
    }

    return results;
}

/**
 * Yields control back to the event loop.
 * This is where micro / macro / raf / idle actually differ.
 *
 *   micro -> microtask queue. The queue must drain fully before the browser
 *            renders, but every chunk pushes a new microtask onto it, so it
 *            never drains -> the browser starves and the UI freezes.
 *            There is an await, but it does NOT yield the thread.
 *   macro -> macrotask queue. The current event loop turn ends, so the browser
 *            gets to render and process input -> the UI can breathe.
 *   raf   -> resolves right before each paint, at most ~60 times/sec. Slower
 *            than macro, but progress updates exactly once per frame -> smoothest.
 *   idle  -> runs only when the browser is idle. Maximum courtesy to the UI,
 *            but can be delayed for a long time. Safari has no
 *            requestIdleCallback, so it falls back to a macrotask there.
 *
 * @param {'micro'|'macro'|'raf'|'idle'} strategy
 * @returns {Promise<void>}
 */
function yieldTo(strategy) {
    switch (strategy) {
        case "micro":
            return Promise.resolve();
        case "macro":
            return new Promise((res) => setTimeout(res, 0));
        case "raf":
            return new Promise((res) => requestAnimationFrame(() => res()));
        case "idle":
            return new Promise((res) =>
                typeof requestIdleCallback === "function"
                    ? requestIdleCallback(() => res())
                    : setTimeout(res, 0)
            );
        default:
            throw new Error(`Unknown yieldStrategy: ${strategy}`);
    }
}

// Works in both the browser and Node (if you want to write your own tests)
if (typeof module !== "undefined" && module.exports) {
    module.exports = { processChunked, yieldTo };
}
