const { execFileSync, spawnSync } = require("node:child_process")

const releaseTagPattern = /^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/

function generateReleaseNotes({ repository, tag, releases, cwd = process.cwd() }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !releaseTagPattern.test(tag)) {
    throw new Error("A GitHub owner/repository and a version tag are required")
  }
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trimEnd()
  const target = `refs/tags/${tag}`
  git("rev-parse", "--verify", `${target}^{commit}`)
  if (git("rev-parse", "--is-shallow-repository") === "true") {
    throw new Error("Release notes require full Git history (checkout fetch-depth: 0)")
  }
  const published = releases
    .filter((release) => !release.draft && release.tag_name !== tag && releaseTagPattern.test(release.tag_name))
    .sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at))
  const previous = published.find((release) => {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", `refs/tags/${release.tag_name}`, target], { cwd, encoding: "utf8" })
    if (result.error) throw result.error
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`Cannot resolve published release ${release.tag_name}: ${result.stderr.trim()}`)
    }
    return result.status === 0
  })
  const range = previous ? `refs/tags/${previous.tag_name}..${target}` : target
  const log = git("log", "--no-merges", "--reverse", "--format=%H%x00%s", range, "--")
  const baseUrl = `https://github.com/${repository}`
  const changes = log ? log.split("\n").map((entry) => {
    const [sha, subject] = entry.split("\0")
    const text = subject.replace(/[\\`*_[\]<>()]/g, "\\$&")
    return `- ${text} ([${sha.slice(0, 7)}](${baseUrl}/commit/${sha}))`
  }) : ["此版本没有新增提交。"]
  const comparison = previous
    ? `\n[完整变更：${previous.tag_name} → ${tag}](${baseUrl}/compare/${previous.tag_name}...${tag})\n`
    : ""
  return `## 本次更新\n\n${changes.join("\n")}\n${comparison}`
}

if (require.main === module) {
  const repository = process.env.GITHUB_REPOSITORY
  const releases = JSON.parse(execFileSync("gh", [
    "api", "--paginate", "--slurp", `repos/${repository}/releases?per_page=100`,
  ], { encoding: "utf8" })).flat()
  process.stdout.write(generateReleaseNotes({ repository, tag: process.env.GITHUB_REF_NAME, releases }))
}

module.exports = { generateReleaseNotes }
