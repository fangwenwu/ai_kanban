import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parsePidOutput, releasePort } from "./release-port.js";

test("parsePidOutput returns trimmed pid list", () => {
  assert.deepEqual(parsePidOutput("123\n456\n\n"), ["123", "456"]);
});

test("releasePort skips kill when lsof finds no process", async () => {
  const calls = [];

  const released = await releasePort(3000, async (command, args) => {
    calls.push([command, args]);
    return {
      code: 1,
      stdout: "",
      stderr: "",
    };
  });

  assert.equal(released, false);
  assert.deepEqual(calls, [["lsof", ["-ti", "tcp:3000"]]]);
});

test("releasePort kills all pids returned by lsof", async () => {
  const calls = [];

  const released = await releasePort(3000, async (command, args) => {
    calls.push([command, args]);

    if (command === "lsof") {
      return {
        code: 0,
        stdout: "123\n456\n",
        stderr: "",
      };
    }

    return {
      code: 0,
      stdout: "",
      stderr: "",
    };
  });

  assert.equal(released, true);
  assert.deepEqual(calls, [
    ["lsof", ["-ti", "tcp:3000"]],
    ["kill", ["-9", "123", "456"]],
  ]);
});

test("package scripts release frontend and backend ports before startup", async () => {
  const packageContent = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );

  assert.match(
    packageContent,
    /"predev:frontend"\s*:\s*"node scripts\/release-port\.js 5173"/,
  );
  assert.match(
    packageContent,
    /"predev:backend"\s*:\s*"node scripts\/release-port\.js 3000"/,
  );
});
