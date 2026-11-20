# Conditions

A condition is an expression in boolean position: a detector's `match`, which determines whether a run counts as a detection, and the condition of an `if`. Its leaves are the `text` and `element` conditions, which read the page, and the other expressions in [Expressions](expressions.md). `match` is evaluated against the page alone: the same conditions give the same answer whichever trigger ran the detector and whatever the detector does with the result.

## Structure

An object holds one expression key, and `any`, `all` and `none` blocks nest recursively at any node, so `all` ANDs conditions. An array is never an expression: under `text` or `element` it holds several bodies, which select the union of their items, under `pattern`, `selector` and `xpath` it holds alternatives, and its other uses are in [Arrays](expressions.md#arrays). An unknown key beside an operator key is a parse error ([Validation](validation.md#expressions)).

```json
"match": {
  "all": [
    {"any": [
      {"text": {"pattern": ["adblocker", "disable"], "selector": [".adblock-modal"]}},
      {"text": {"pattern": ["disable your adblocker"]}}
    ]},
    {"element": {"selector": ".adwall-overlay", "visibility": "visible"}}
  ]
}
```

```
MATCH IF (
  (body text contains "disable your adblocker")
  OR
  (text within .adblock-modal contains "adblocker" OR "disable")
)
AND (a visible .adwall-overlay element exists)
```

Two conditions read the page: [`text`](#text) and [`element`](#element). In boolean position each holds when it selects at least one item. An invalid CSS selector or XPath expression is an error when evaluated ([Kinds](failures.md#kinds)).

## `text`

Matches when text on the page matches a pattern.

| Key | Value | Meaning |
|---|---|---|
| `pattern` | string or array | Regex patterns. An array is joined with `\|` into one case-insensitive RegExp, so alternatives cost one pass rather than one each. |
| `selector` | string or array | CSS selectors whose elements' `textContent` is searched. Any matching element of any selector succeeds. |
| `xpath` | string or array | XPath expressions selecting the text to search ([XPath](sources.md#xpath)). |
| `xpathConfig` | `{chunkSize, chunkTail}` | Tunes `xpath` scanning ([XPath](sources.md#xpath)). |

`body` is the implicit source only when the condition names neither `selector` nor `xpath`. Where both are given they are alternatives: the condition matches if either source matches, with `selector` evaluated first.

Matching is always case-insensitive.

Write patterns to tolerate the punctuation pages actually use. `.?` in place of an apostrophe (`couldn.?t`) matches both the straight and the curly form.

### Examples

Several phrasings of the same message, anywhere in the page:

```json
"match": {
    "text": {
        "pattern": [
            "ad ?block(er)? detected",
            "your ad ?blocker is on",
            "you('re| are| may be) using an ad blocker"
        ]
    }
}
```

A button reading exactly "allow ads". Anchoring the pattern and scoping it to `button` keeps the phrase from matching prose elsewhere on the page:

```json
"match": {
    "text": {
        "pattern": ["^\\s*allow ads\\s*$"],
        "selector": "button"
    }
}
```

The same phrases against rendered text only, so a copy inside a `<script>` does not match ([Rendered text](recipes.md#rendered-text)):

```json
"match": {
    "text": {
        "pattern": ["ad ?block(er)? detected", "disable your ad ?blocker"],
        "xpath": "//body//text()[not(ancestor::script) and not(ancestor::style) and not(ancestor::template) and not(ancestor::noscript)]"
    }
}
```

Wrapping any two of these in `any` makes them alternatives, as in [Structure](#structure).

## `element`

Matches when an element exists.

| Key | Value | Meaning |
|---|---|---|
| `selector` | string or array | CSS selectors. Any matching element of any selector succeeds. |
| `visibility` | `any` (default), `visible`, `hidden`, `content` | What counts as present. |

| `visibility` | Check | Cost |
|---|---|---|
| `any` | The element exists | One `querySelector` |
| `visible` | Box larger than 0.5px in both axes, `display` not `none`, `visibility` not `hidden`, opacity above 0.05 | Forces layout: `getComputedStyle` and `getBoundingClientRect` |
| `hidden` | The negation of `visible` | Forces layout |
| `content` | A detached copy of the element holds text, embedded media, a form control, or an iframe that is not hidden and whose `src` is neither empty nor `about:blank` | Layout-free: serialize and re-parse |

`content` checks whether an element has content and doesn't check visibility, so it treats a filled but `display: none` element as present. It suits narrow, widget-specific selectors: a subtree over 50,000 characters is reported present without being parsed, and serialising the subtree on every run is slow on a broad selector such as `body`.

### Examples

An overlay that is present in the DOM on every page and only shown when it applies:

```json
"match": {
    "element": {
        "selector": "#paywall-overlay",
        "visibility": "visible"
    }
}
```

A challenge widget, matched through either its container or the iframe inside it, with the layout-free check:

```json
"match": {
    "element": {
        "selector": [
            ".challenge-container:not(#challenge-wrapper)",
            ".challenge-container iframe",
            "iframe[src*='challenges.example.com/widget']"
        ],
        "visibility": "content"
    }
}
```

Combine an `element` condition with a `text` one under `all` where a phrase alone is too common, so both must hold.

Configs for images loaded, broken or pending, and for failed stylesheets, are in [Load state](recipes.md#load-state).

## Implementation

The sources live in C-S-S at [`web-detection/sources/`](https://github.com/duckduckgo/content-scope-scripts/tree/main/injected/src/features/web-detection/sources/), with config parsing in [`web-detection/compile/`](https://github.com/duckduckgo/content-scope-scripts/tree/main/injected/src/features/web-detection/compile/).

The authoritative types live in [`schema/features/web-detection.ts`](../../schema/features/web-detection.ts).
