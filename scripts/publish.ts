import { $ } from "bun"
import packageJson from "../package.json"

const status = await $`git status -s`.arrayBuffer()
if (status.byteLength !== 0 && !process.env.FORCE) {
  throw new Error("git status is not empty, please commit or stash changes before publishing")
}

// OIDC is used in CI (GitHub Actions), NPM_TOKEN is fallback for local publishing
const useOidc = process.env.GITHUB_ACTIONS === "true"
if (!useOidc && !process.env.NPM_TOKEN) {
  throw new Error("NPM_TOKEN is not set in the environment. Set NPM_TOKEN for local publishing, or run in GitHub Actions for OIDC.")
}


const remoteVersion = await getRemoteVersion(packageJson.name)
const npmVersion = remoteVersion.split(".").map((str) => Number.parseInt(str))
const packageJsonVersion = packageJson.version.split(".").map((str) => Number.parseInt(str))

let version = npmVersion
if (packageJsonVersion[0] > npmVersion[0]) {
  version = packageJsonVersion
} else if (packageJsonVersion[1] > npmVersion[1]) {
  version[1] = packageJsonVersion[1]
  version[2] = packageJsonVersion[2]
} else if (packageJsonVersion[2] > npmVersion[2]) {
  version[2] = packageJsonVersion[2]
}

version[2]++
packageJson.version = version.join(".")

for (const [key, value] of Object.entries(packageJson.exports)) {
  (packageJson.exports as Record<string, unknown>)[key] = {
    import: value.import.replace("src", "dist").replace(".ts", ".js"),
    types: value.types.replace("src", "dist").replace(".ts", ".d.ts"),
  }
}

await $`echo ${JSON.stringify(packageJson, null, 2)} > package.json`
await $`bun run build`

// Publish to npm first - only create tag if publish succeeds
if (useOidc) {
  // OIDC provenance - no token needed, GitHub provides identity
  await $`npm publish --provenance --access public`
} else {
  // Classic NPM_TOKEN auth
  await Bun.write(".npmrc", `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`)
  await $`bun publish`
}

// Tag and push only after successful publish
// Check if tag already exists (e.g., from a previous failed run that was manually fixed)
const tagExists = await $`git tag -l "${packageJson.version}"`.text()
if (tagExists.trim()) {
  console.log(`Tag ${packageJson.version} already exists locally, pushing...`)
} else {
  await $`git tag "${packageJson.version}"`
}
await $`git push --tags`

async function getRemoteVersion(name: string) {
  const results = await fetch(`https://registry.npmjs.org/${name}`)
  const json = await results.json()

  if (json['error'] === 'Not found') {
    console.warn(`${name} not found on npm, using 0.0.0 as latest version`)
    return "0.0.0"
  } else if (!json["dist-tags"] || !json["dist-tags"].latest) {
    console.error(json)
    throw new Error(`${name} found on npm but no latest version`)
  }

  return json["dist-tags"].latest || "0.0.0"
}
