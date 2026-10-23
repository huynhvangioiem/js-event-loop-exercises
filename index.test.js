const test = require("node:test");
const assert = require("node:assert/strict");
const { processChunked } = require("./index.js");

const items = Array.from({ length: 25 }, (_, i) => i);
const double = (n) => n * 2;

test("returns fn results in order", async () => {
    const out = await processChunked(items, double, { chunkSize: 10 });
    assert.deepEqual(out, items.map(double));
});

test("passes the index to fn", async () => {
    const out = await processChunked(["a", "b", "c"], (item, i) => item + i, { chunkSize: 2 });
    assert.deepEqual(out, ["a0", "b1", "c2"]);
});

test("reports progress after every chunk, clamping the last one", async () => {
    const calls = [];
    await processChunked(items, double, {
        chunkSize: 10,
        onProgress: (done, total) => calls.push([done, total]),
    });
    assert.deepEqual(calls, [[10, 25], [20, 25], [25, 25]]);
});

test("handles an empty array", async () => {
    const calls = [];
    const out = await processChunked([], double, { onProgress: (...a) => calls.push(a) });
    assert.deepEqual(out, []);
    assert.deepEqual(calls, []);
});

for (const yieldStrategy of ["micro", "macro", "idle"]) {
    test(`'${yieldStrategy}' completes`, async () => {
        const out = await processChunked(items, double, { chunkSize: 10, yieldStrategy });
        assert.equal(out.length, items.length);
    });
}

test("rejects with AbortError when already aborted, processing nothing", async () => {
    let ran = 0;
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        processChunked(items, () => ran++, { signal: controller.signal }),
        { name: "AbortError" }
    );
    assert.equal(ran, 0);
});

test("aborting mid-flight stops at the next yield", async () => {
    const controller = new AbortController();
    let chunks = 0;
    await assert.rejects(
        processChunked(items, double, {
            chunkSize: 5,
            signal: controller.signal,
            onProgress: () => {
                if (++chunks === 2) controller.abort();
            },
        }),
        { name: "AbortError" }
    );
    assert.equal(chunks, 2);
});

test("rejects an unknown yieldStrategy before processing anything", async () => {
    let ran = 0;
    await assert.rejects(
        processChunked(items, () => ran++, { yieldStrategy: "nope" }),
        /Unknown yieldStrategy: nope/
    );
    assert.equal(ran, 0);
});
