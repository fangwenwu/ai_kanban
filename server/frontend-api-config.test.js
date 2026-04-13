import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("frontend should not hardcode localhost api host", async () => {
  const appContent = await readFile(
    new URL("../src/App.vue", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(appContent, /http:\/\/localhost:3000\/api\//);
});

test("vite dev server should proxy /api requests to backend", async () => {
  const viteContent = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(viteContent, /proxy\s*:\s*\{/);
  assert.match(viteContent, /"\/api"|\'\/api\'/);
  assert.match(viteContent, /3000/);
});
