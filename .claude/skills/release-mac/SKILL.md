---
name: release-mac
description: Build the Kuro macOS app (arm64 + x64 DMGs) and ship it as a downloadable artifact via a GitHub Release. Use when the user asks to "ship a build", "release", "make a downloadable", "publish a mac build", or otherwise wants to produce and publish DMGs from this repo.
---

# Release Kuro for macOS

Builds both DMGs locally with `electron-builder`, then creates a GitHub Release tagged `v<version>` (from `package.json`) with the DMGs attached.

## Args

The user may pass:

- `--version <x.y.z>` — override the version. Default: read from `package.json`.
- `--draft` — create the release as a draft.
- `--notes-file <path>` — use an existing markdown file as release notes.
- `--bump <patch|minor|major>` — bump `package.json` version before building, commit the bump, and push.

If none are passed, use `package.json` version as-is and create a published release.

## Preflight

Run these in parallel before building:

1. `git status --porcelain` — warn (do not block) if the working tree is dirty; the build still works but the release will reflect uncommitted state.
2. `git rev-parse --abbrev-ref HEAD` — note the branch.
3. `node -p "require('./package.json').version"` — get version. Refer to as `$VERSION`.
4. `gh release view "v$VERSION"` — if a release with that tag already exists, STOP and ask the user whether to bump version, delete the existing release, or abort. Do not silently overwrite.
5. `gh auth status` — confirm `gh` is authenticated. If not, ask the user to run `gh auth login`.

If `--bump` was requested:

```sh
pnpm version <patch|minor|major> --no-git-tag-version
git add package.json
git commit -m "chore: bump version to v<new>"
git push
```

Then re-read the version from `package.json` and continue.

## Build

Single command. This takes ~3–5 minutes (downloads Electron binaries for both arches on a cold cache):

```sh
pnpm build:mac
```

When it finishes, verify both artifacts exist:

```sh
ls -lh release/Kuro-$VERSION-arm64.dmg release/Kuro-$VERSION.dmg
```

If either is missing, surface the build log tail and stop — do not proceed to publish a partial release.

## Release notes

Default notes (use unless `--notes-file` was given):

```markdown
Kuro v<VERSION> — macOS Electron AI code review workstation.

## Downloads

| Platform | File |
|---|---|
| Apple Silicon (M1/M2/M3/M4) | `Kuro-<VERSION>-arm64.dmg` |
| Intel | `Kuro-<VERSION>.dmg` |

## Install

These builds are **unsigned** (ad-hoc signature only), so macOS Gatekeeper will block them on first launch. To open:

1. Mount the DMG and drag `Kuro.app` to `/Applications`.
2. Right-click `Kuro.app` → **Open** → confirm.

If macOS still refuses with a "damaged" message, clear the quarantine attribute:

```sh
xattr -cr /Applications/Kuro.app
```

## Build info

- Commit: `<short-sha>`
- Branch: `<branch>`
- Requires macOS 11 (Big Sur) or later.
```

Substitute `<VERSION>`, `<short-sha>` (`git rev-parse --short HEAD`), and `<branch>` with real values.

## Publish

```sh
gh release create "v$VERSION" \
  release/Kuro-$VERSION-arm64.dmg \
  release/Kuro-$VERSION.dmg \
  --title "Kuro v$VERSION" \
  --notes-file <notes-path>   # or --notes "$NOTES" via heredoc
```

Add `--draft` if `--draft` was requested.

After the upload completes, report the release URL (the `gh` command prints it to stdout).

## Notes

- `release/` is in `.gitignore` — artifacts stay local.
- Builds are **unsigned**. If the user wants signed + notarized builds, they need a `Developer ID Application` cert in their keychain and `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` env vars set, then notarization can be enabled via the `--publish never` electron-builder flag and the `notarize` config block. That is out of scope for this skill — flag it but don't attempt unless the user asks.
- Do not run `pnpm version` with the default `--git-tag-version` behavior, since `gh release create` creates the tag from HEAD itself and a duplicate tag will fail the release.
- Never use `gh release delete` or any destructive git command without asking the user first.
