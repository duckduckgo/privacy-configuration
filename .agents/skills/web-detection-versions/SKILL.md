---
name: web-detection-versions
description: Keep docs/web-detection/versions.md current - the capability table, the changelog and the platform versions table. Use when a C-S-S release changes web detection, when a platform ships a newer C-S-S, when docs gain a web detection capability, or when asked which app version a detector should be gated on.
---

# Updating web detection versions

[`docs/web-detection/versions.md`](../../../docs/web-detection/versions.md) has three parts, and a change to one usually needs the others:

| Part | Holds |
|---|---|
| Capabilities by C-S-S release | Each feature as the latest release supports it, and the first release that supports that form. Capabilities that are no longer supported only go in the changelog |
| Platform versions by C-S-S release | One row per changelog release, with the first app release on each platform that ships it |
| Changelog | One `### <version>` heading per release that changed what a detector can do or how it runs, newest first, with a `#### Breaking changes` heading where a detector written for one side fails or changes meaning on the other |

Keep the page free of shipped detector names and config values. Link each release to `https://github.com/duckduckgo/content-scope-scripts/releases/tag/<version>`.

## Find the releases that changed web detection

Use a full clone of content-scope-scripts (`git fetch --tags`). Diff the bare `X.Y.Z` release tags in version order:

```sh
P="injected/src/features/web-detection injected/src/features/web-detection.js injected/src/features/detector-perf.js injected/src/features/breakage-reporting.js injected/src/features/web-events.js"
prev=""
for t in $(git tag -l | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | sed -n '/^12\.40\.0$/,$p'); do
  [ -n "$prev" ] && s=$(git diff --shortstat "$prev" "$t" -- $P) && [ -n "$s" ] && echo "$prev -> $t:$s"
  prev=$t
done
```

Also check the `webDetection`, `webEvents` and `detectorPerf` entries in `injected/src/features.js`, which say which platforms load each feature.

- Never use `git tag --contains` or `git log` ranges for this. The bare tags are release commits on their own lineage, so none is an ancestor of `main`, and clones are often shallow.
- Some versions have no tag. Confirm a feature is absent at the preceding tag that exists.
- Read each diff. A release goes in the changelog when it changes config a detector can use, what a run does, or what results look like. Leave out releases that only change tests, comments, types or internals.
- For a changed feature, check what the older release does with config in the new shape, and what the newer release does with the old shape (parse error, ignored, or a different result). That's what goes under Breaking changes.

## Read each platform's C-S-S version

Read the pin at each release tag, never from a local checkout of a client's submodule, which can be months old.

| Platform | Release tags | Pin |
|---|---|---|
| iOS | `X.Y.Z+ios` in `duckduckgo/apple-browsers` | `exact:` in `SharedPackages/BrowserServicesKit/Package.swift`, and `content-scope-scripts` in `iOS/DuckDuckGo-iOS.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` |
| macOS | `X.Y.Z+macos` in `duckduckgo/apple-browsers` | The same `Package.swift`, and `macOS/DuckDuckGo-macOS.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` |
| Android | `5.N.M` in `duckduckgo/Android` | `content-scope-scripts#X` in `package.json` |
| Windows | `v0.N.M.0` in `duckduckgo/windows-browser` | The `submodules/content-scope-scripts` gitlink, matched to a C-S-S tag with `git ls-remote --tags` |
| Extension | `YYYY.M.D` in `duckduckgo/duckduckgo-privacy-extension` | `content-scope-scripts#X` in `package.json` |

Public repos can be read from `https://raw.githubusercontent.com/<repo>/<tag>/<path>` (encode `+` as `%2B`). Windows is private: fetch only its tags' commits and trees into a scratch repo, then read each gitlink:

```sh
git init -q --bare wb.git
git -C wb.git fetch -q --depth=1 --filter=blob:none https://github.com/duckduckgo/windows-browser.git 'refs/tags/v0.1*:refs/tags/v0.1*'
git -C wb.git ls-tree <tag> submodules/content-scope-scripts
```

A Windows gitlink can point at an untagged C-S-S commit, such as a rebuild after a release. Place it with the GitHub compare API against the neighbouring tags.

## Fill in a cell

- A cell is the first release whose pin is at or above the row's version, with no later release dropping back below it. A hotfix cut from an older base can ship an older C-S-S, so scan every release tag, hotfixes included, and take the current minimum.
- On iOS and macOS, `Package.swift` and the app's `Package.resolved` sometimes differ at a tag. Use the lower of the two, so a gate is never set before the release that ships the version.
- Android cells also give the integer remote config uses: major × 10,000,000 + minor × 10,000 + patch × 1,000.
- Write **not yet shipped** when no release tag includes the version.

## Check before handing over

- Each capability row's marker is in that release's tree and missing from the release before (or in a different shape, for a changed feature).
- Each platform cell's pin is at or above the row, and the previous release's pin is below it.
- Every changelog release has a platform row, and every row is a changelog release.
- Every feature the other web detection pages document has a capability row.
