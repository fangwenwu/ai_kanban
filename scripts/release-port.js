import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);

export function parsePidOutput(output) {
  return String(output)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function runCommand(command, args) {
  try {
    const result = await execFileAsync(command, args);
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message,
    };
  }
}

export async function releasePort(port, runner = runCommand) {
  const normalizedPort = Number(port);

  if (!Number.isInteger(normalizedPort) || normalizedPort <= 0) {
    throw new Error("端口号无效");
  }

  const lookup = await runner("lsof", ["-ti", `tcp:${normalizedPort}`]);

  if (lookup.code !== 0 && lookup.code !== 1) {
    throw new Error(lookup.stderr || `端口 ${normalizedPort} 查询失败`);
  }

  const pids = parsePidOutput(lookup.stdout);

  if (!pids.length) {
    return false;
  }

  const killResult = await runner("kill", ["-9", ...pids]);

  if (killResult.code !== 0) {
    throw new Error(killResult.stderr || `端口 ${normalizedPort} 释放失败`);
  }

  return true;
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  const port = process.argv[2];

  try {
    const released = await releasePort(port);
    if (released) {
      console.log(`已释放端口 ${port}`);
    } else {
      console.log(`端口 ${port} 未被占用`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "端口释放失败");
    process.exitCode = 1;
  }
}
