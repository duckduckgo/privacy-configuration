# Conditions

A condition is an expression in boolean position. Conditions appear in two places: a detector's `match`, which determines whether a run counts as a detection, and the condition of an `if`. They're built from the `text` and `element` conditions, which read the page, and the other expressions in [Expressions](expressions.md). `match` only depends on the page, so the same conditions give the same answer whichever trigger ran the detector and whatever the detector does with the result.

## Structure

Each object has one expression key, so to combine several conditions, wrap them in `all`, `any` or `none`. These blocks can nest at any level. An array is never an expression on its own. Under `text` or `element`, an array lists several bodies, which select the union of their items, and under `pattern`, `selector` and `xpath`, it lists alternatives. See [Arrays](expressions.md#arrays) for its other uses. An unknown key next to an operator key is a parse error ([Parse errors](failures.md#parse-errors)).

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

Two conditions read the page: [`text`](#text) and [`element`](#element). As a condition, each one holds when it selects at least one item. An invalid CSS selector or XPath expression is an error when it's evaluated ([Kinds](failures.md#kinds)).

## `text`

Matches when text on the page matches a pattern.

| Key | Value | Meaning |
|---|---|---|
| `pattern` | string or array | Regex patterns. An array is joined with `\|` into one case-insensitive RegExp, so all the alternatives are checked in one pass. |
| `selector` | string or array | CSS selectors whose elements' `textContent` is searched. Any matching element of any selector succeeds. |
| `xpath` | string or array | XPath expressions selecting the text to search ([XPath](sources.md#xpath)). |
| `xpathConfig` | `{chunkSize, chunkTail}` | Tunes `xpath` scanning ([XPath](sources.md#xpath)). |

The condition searches `body` only when it has neither `selector` nor `xpath`. When it has both, they're alternatives: the condition matches if either source matches, and `selector` is evaluated first.

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

The same phrases against rendered text only, so a copy inside a `<script>` doesn't match ([Rendered text](recipes.md#rendered-text)):

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
| `content` | A detached copy of the element contains text, embedded media, a form control, or an iframe that isn't hidden and whose `src` is neither empty nor `about:blank` | Layout-free: serialise and re-parse |

`content` checks whether an element has content and ignores visibility, so a filled but `display: none` element counts as present. It's meant for narrow, widget-specific selectors, because a subtree over 50,000 characters is reported as present without being parsed, and serialising the subtree on every run is slow on a broad selector such as `body`.

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

When a phrase alone is too common, combine a `text` condition with an `element` one under `all`, so both must hold.

See [Load state](recipes.md#load-state) for configs for loaded, broken and pending images, and failed stylesheets.

## Implementation

The sources live in C-S-S at [`web-detection/sources/`](https://github.com/duckduckgo/content-scope-scripts/tree/main/injected/src/features/web-detection/sources/), with config parsing in [`web-detection/compile/`](https://github.com/duckduckgo/content-scope-scripts/tree/main/injected/src/features/web-detection/compile/).

The authoritative types live in [`schema/features/web-detection.ts`](../../schema/features/web-detection.ts).
