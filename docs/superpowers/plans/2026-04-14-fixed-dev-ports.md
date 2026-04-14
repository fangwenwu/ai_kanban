# Fixed Dev Ports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the frontend and backend development servers to stable ports and always release those ports before startup.

**Architecture:** Reuse the existing `scripts/release-port.js` utility and wire it into npm lifecycle hooks so startup behavior stays outside business code. Keep the backend on `3000`, set Vite to `5173` with strict port behavior, and ensure both services run their respective pre-start release step whether started individually or through `npm run dev`.

**Tech Stack:** Node.js, npm scripts, Vite, Vue 3

---

### Task 1: Cover the new startup contract with tests

**Files:**
- Modify: `scripts/release-port.test.js`
- Modify: `server/frontend-api-config.test.js`

- [ ] **Step 1: Add a frontend config regression for fixed port**

```js
test("vite dev server uses fixed port 5173 with strictPort enabled", async () => {
  const viteContent = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(viteContent, /port:\s*5173/);
  assert.match(viteContent, /strictPort:\s*true/);
});
```

- [ ] **Step 2: Add a package.json regression for the frontend pre-start hook**

```js
test("package scripts release both frontend and backend ports before startup", async () => {
  const packageContent = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );

  assert.match(packageContent, /"predev:frontend"\s*:\s*"node scripts\/release-port\.js 5173"/);
  assert.match(packageContent, /"predev:backend"\s*:\s*"node scripts\/release-port\.js 3000"/);
});
```

- [ ] **Step 3: Run the focused tests and watch them fail first**

Run: `node --test server/frontend-api-config.test.js scripts/release-port.test.js`
Expected: FAIL because `vite.config.ts` and `package.json` do not yet fully implement the fixed-port startup contract

### Task 2: Implement fixed frontend port and startup hooks

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Fix the frontend dev server to port 5173**

```ts
server: {
  port: 5173,
  strictPort: true,
  proxy: {
    "/api": "http://localhost:3000",
  },
},
```

- [ ] **Step 2: Add the frontend pre-start hook while keeping the backend hook**

```json
"scripts": {
  "dev": "concurrently 'npm run dev:frontend' 'npm run dev:backend'",
  "predev:frontend": "node scripts/release-port.js 5173",
  "predev:backend": "node scripts/release-port.js 3000",
  "dev:frontend": "vite",
  "dev:backend": "node --watch server/index.js"
}
```

- [ ] **Step 3: Re-run the focused tests**

Run: `node --test server/frontend-api-config.test.js scripts/release-port.test.js`
Expected: PASS

### Task 3: Verify full project health and startup behavior

**Files:**
- Verify: `package.json`
- Verify: `vite.config.ts`
- Verify: `scripts/release-port.js`

- [ ] **Step 1: Run the full automated checks**

Run: `node --test server/*.test.js scripts/release-port.test.js`
Expected: PASS

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Manually verify startup behavior**

Run: `npm run dev`
Expected:
- frontend pre-start hook releases `5173`
- backend pre-start hook releases `3000`
- frontend starts at `http://localhost:5173`
- backend starts at `http://localhost:3000`
