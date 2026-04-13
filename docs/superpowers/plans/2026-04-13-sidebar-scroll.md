# Sidebar Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the left market dashboard directory scroll independently on desktop while preserving the current mobile layout.

**Architecture:** Keep the existing Vue component structure and only adjust shared layout CSS in `src/style.css`. The desktop layout becomes a viewport-bounded two-column shell where `.sidebar` and `.content-shell` each manage their own vertical overflow, while the mobile breakpoint restores the current document flow.

**Tech Stack:** Vue 3, TypeScript, Vite, CSS

---

### Task 1: Convert the desktop shell to independent column scrolling

**Files:**
- Modify: `src/style.css`
- Verify: `src/App.vue`

- [ ] **Step 1: Update the desktop layout container**

```css
.app-layout {
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
}
```

- [ ] **Step 2: Make the sidebar scroll within its own height**

```css
.sidebar {
  top: 24px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}
```

- [ ] **Step 3: Make the right content area the main desktop content scroller**

```css
.content-shell {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
```

- [ ] **Step 4: Restore natural flow under the mobile breakpoint**

```css
@media (max-width: 820px) {
  .app-layout {
    height: auto;
    min-height: 0;
    overflow: visible;
  }

  .sidebar {
    position: static;
    max-height: none;
    overflow: visible;
  }

  .content-shell {
    min-height: auto;
    overflow: visible;
  }
}
```

- [ ] **Step 5: Verify project health**

Run: `npm run build`
Expected: build succeeds without new type or style-related errors
