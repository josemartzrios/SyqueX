# Merge Dev to Main Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `dev` branch into `main` and synchronize both remote and local `main` branches.

**Architecture:** Use GitHub CLI (`gh`) to create and merge a Pull Request from `dev` to `main`, ensuring all changes are synchronized across environments.

**Tech Stack:** Git, GitHub CLI (gh)

---

### Task 1: Verify Dev State and Tests

**Files:**
- N/A

- [ ] **Step 1: Run tests on dev branch**

Run: `npm test` (or the project's test command)
Expected: PASS

- [ ] **Step 2: Ensure branch is pushed**

Run: `git push origin dev`
Expected: "Everything up-to-date"

---

### Task 2: Create and Merge PR

**Files:**
- N/A

- [ ] **Step 1: Create Pull Request**

Run: `gh pr create --base main --head dev --title "Merge dev into main" --body "Merging latest developments from dev branch."`
Expected: PR URL returned

- [ ] **Step 2: Merge Pull Request**

Run: `gh pr merge --merge --delete-branch=false` (Keep dev branch)
Expected: PR merged successfully

---

### Task 3: Sync Local Main

**Files:**
- N/A

- [ ] **Step 1: Checkout main**

Run: `git checkout main`
Expected: Switched to branch 'main'

- [ ] **Step 2: Pull latest changes**

Run: `git pull origin main`
Expected: Updates applied to local main

- [ ] **Step 3: Run tests on main**

Run: `npm test`
Expected: PASS

---

### Task 4: Final Verification

- [ ] **Step 1: Check git status**

Run: `git status`
Expected: On branch main, up to date with origin/main, clean working tree.
