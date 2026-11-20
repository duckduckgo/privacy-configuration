# Web detection versions

Which C-S-S release each web detection capability arrived in, and the earliest app version on each platform that includes that release. Use these to pick the version gate for a detector that needs a capability.

## Capabilities by C-S-S release

This table lists the core web detection features and the C-S-S release each one shipped in. To require a feature, use conditional changes to enable a detector only from the minimum version, or version-gate the whole web detection feature (see [Platform versions by C-S-S release](#platform-versions-by-c-s-s-release) for which version to use on each platform).

| Group | Capability | First C-S-S release |
|---|---|---|
| Match conditions | `text` (`pattern`, `selector`) | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `xpath` and `xpathConfig` on `text` | [16.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/16.5.0) |
| | `element` (`selector`) | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `element` `visibility`: `any`, `visible`, `hidden` | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `element` `visibility`: `content` | [15.16.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.16.0) |
| Match operators | Array as OR | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `any` / `all` / `none` blocks | [15.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.5.0) |
| Triggers | `breakageReport` | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `auto`, with `when.intervalMs` | [13.10.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.10.0) |
| | `runConditions` | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| Actions | `breakageReportData` | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| | `fireEvent` | [13.25.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.25.0) |
| Detector | `state` | [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) |
| Predicates | `type` names `function`, `symbol` and `bigint` | [22.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/22.0.0) |
| Related feature | `detectorPerf` timing | [17.7.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/17.7.0) |

Additional details:

- The core feature shipped in [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0), including the top-frame `runConditions` default, the `detected: 'error'` result, and dropping a detector whose group or name fails validation.
- `auto` shipped in [13.10.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.10.0), but its `when` key gained a default only in [13.25.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.25.0). On 13.10.0 through 13.24.0 an `auto` trigger without an explicit `when.intervalMs` throws.
- Before [15.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.5.0), an array is an OR one level deep: as the whole `match`, or as the value of `text` or `element`. From 15.5.0, arrays nest and combine with operator blocks at any depth, so a detector relying on nesting needs 15.5.0.
- Before [22.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/22.0.0), `function`, `symbol` and `bigint` are unknown type names, so a detector using them doesn't parse, and `"type": "object"` holds for a function.

## Platform versions by C-S-S release

For each C-S-S release above, this is the earliest app version on each platform that ships that release or a later one. Use it to pick the `minSupportedVersion` for a version gate.

| C-S-S release | iOS | macOS | Android | Windows | Extension |
|---|---|---|---|---|---|
| [12.40.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/12.40.0) | 7.208.0 | 1.178.0 | 5.266.0 (`52660000`) | 0.147.0 | 2026.4.28 |
| [13.10.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.10.0) | 7.210.0 | 1.180.0 | 5.268.0 (`52680000`) | 0.149.0 | 2026.4.28 |
| [13.25.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/13.25.0) | 7.212.0 | 1.182.0 | 5.271.0 (`52710000`) | 0.151.0 | 2026.4.28 |
| [15.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.5.0) | 7.227.0 | 1.197.0 | 5.286.0 (`52860000`) | 0.166.0 | not yet shipped |
| [15.16.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/15.16.0) | 7.231.0 | 1.201.0 | 5.290.0 (`52900000`) | 0.168.0 | not yet shipped |
| [16.5.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/16.5.0) | 7.234.0 | 1.203.0 | 5.292.0 (`52920000`) | 0.171.0 | not yet shipped |
| [17.7.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/17.7.0) | not yet shipped | not yet shipped | not yet shipped | not yet shipped | not yet shipped |
| [22.0.0](https://github.com/duckduckgo/content-scope-scripts/releases/tag/22.0.0) | not yet shipped | not yet shipped | not yet shipped | not yet shipped | not yet shipped |

Android is given in both forms: the release version, and the integer that remote config uses. Convert with major × 10,000,000 + minor × 10,000 + patch × 1,000, as Android's `versioning.gradle` does: 5.266.0 is `52660000`.

Reading the table:

- A cell is the first app release that ships that C-S-S version or a later one, so it may not ship that exact version. No platform pinned every C-S-S release, so the version actually shipped is usually higher (e.g., Windows 0.147.0 ships 13.1.0, and the extension's 2026.4.28 ships 13.34.0).
- **not yet shipped** means no released version of that platform includes a C-S-S release that new.
- The pinned C-S-S version doesn't always go up from one app release to the next. A hotfix cut from an older base can ship an older C-S-S than the release before it (e.g., Android 5.294.1 dropped back to 16.7.0 after 5.294.0 shipped 16.14.0). None of the rows above is affected, but a gate set from a neighbouring version can be. In that case, the table gives the _current_ minimum release that includes the C-S-S version, instead of the first release that ever shipped it.
