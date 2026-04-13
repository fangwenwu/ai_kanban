import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("frontend instruments config uses 513100 instead of 513300", async () => {
  const content = await readFile(
    new URL("../src/instruments.ts", import.meta.url),
    "utf8",
  );

  assert.match(content, /symbol:\s*"513100"/);
  assert.doesNotMatch(content, /symbol:\s*"513300"/);
});

test("frontend instruments config includes the new ETF symbols", async () => {
  const content = await readFile(
    new URL("../src/instruments.ts", import.meta.url),
    "utf8",
  );

  assert.match(content, /symbol:\s*"513350"/);
  assert.match(content, /symbol:\s*"159326"/);
});
