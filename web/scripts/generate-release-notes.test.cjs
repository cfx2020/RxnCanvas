const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const { generateReleaseNotes } = require("./generate-release-notes.cjs")

function repository(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-release-notes-"))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
  git("init", "--quiet", "--initial-branch=main")
  git("config", "user.name", "Release test")
  git("config", "user.email", "release@example.invalid")
  git("config", "commit.gpgsign", "false")
  const commit = (subject) => {
    git("commit", "--quiet", "--allow-empty", "-m", subject)
    return git("rev-parse", "HEAD")
  }
  const notes = (releases) => generateReleaseNotes({
    cwd, repository: "cfx2020/rxncanvas", tag: "v0.1.1-beta.1", releases,
  })
  return { git, commit, notes }
}

test("release notes include every change since the last published release, ignoring draft and failed tags", (t) => {
  const { git, commit, notes } = repository(t)
  commit("already released")
  git("tag", "v0.1.0-beta.12")
  const fix = commit("fix: preserve imported sources")
  git("tag", "v0.1.0-beta.13")
  const feature = commit("feat: add commit links")
  git("tag", "v0.1.1-beta.1")
  const body = notes([
    { tag_name: "v0.1.1-beta.1", draft: true },
    { tag_name: "v0.1.0-beta.13", draft: true },
    { tag_name: "v0.1.0-beta.12", draft: false, published_at: "2026-09-18T00:00:00Z" },
  ])
  assert.ok(body.includes(`preserve imported sources ([${fix.slice(0, 7)}](https://github.com/cfx2020/rxncanvas/commit/${fix}))`))
  assert.ok(body.includes(`/commit/${feature}`))
  assert.ok(body.indexOf(fix) < body.indexOf(feature))
  assert.ok(body.includes("/compare/v0.1.0-beta.12...v0.1.1-beta.1"))
  assert.ok(!body.includes("already released"))
  assert.ok(!body.includes("Downloads"))
})

test("the baseline must be a published ancestor and merged branch commits are included", (t) => {
  const { git, commit, notes } = repository(t)
  commit("base")
  git("tag", "v0.1.0-beta.12")
  git("checkout", "--quiet", "-b", "unrelated")
  commit("unrelated release")
  git("tag", "v0.2.0-beta.1")
  git("checkout", "--quiet", "main")
  git("checkout", "--quiet", "-b", "feature")
  const feature = commit("feat: branch change")
  git("checkout", "--quiet", "main")
  git("merge", "--quiet", "--no-ff", "feature", "-m", "Merge feature")
  git("tag", "v0.1.1-beta.1")
  const body = notes([
    { tag_name: "v0.2.0-beta.1", draft: false, published_at: "2026-10-01T00:00:00Z" },
    { tag_name: "v0.1.0-beta.12", draft: false, published_at: "2026-09-18T00:00:00Z" },
  ])
  assert.ok(body.includes(`/commit/${feature}`))
  assert.ok(!body.includes("unrelated release"))
  assert.ok(!body.includes("Merge feature"))
  assert.ok(body.includes("/compare/v0.1.0-beta.12...v0.1.1-beta.1"))
})

test("a first release lists all commits and treats commit subjects as plain text", (t) => {
  const { git, commit, notes } = repository(t)
  const sha = commit("fix: [label](https://example.invalid) <script> *text* `code` $(touch SHOULD_NOT_EXIST)")
  git("tag", "v0.1.1-beta.1")
  const body = notes([])
  assert.ok(body.includes("\\[label\\]\\(https://example.invalid\\) \\<script\\> \\*text\\* \\`code\\`"))
  assert.ok(body.includes(`/commit/${sha}`))
  assert.ok(!body.includes("/compare/"))
})

test("missing release history fails instead of silently including older changes", (t) => {
  const { git, commit, notes } = repository(t)
  commit("change")
  git("tag", "v0.1.1-beta.1")
  assert.throws(() => notes([
    { tag_name: "v0.1.0-beta.12", draft: false, published_at: "2026-09-18T00:00:00Z" },
  ]), /v0\.1\.0-beta\.12/)
})
