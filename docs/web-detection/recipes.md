# Recipes

Configs for common measurements and detector shapes, built from [expressions](expressions.md), [sources](sources.md), [predicates](predicates.md), [payloads](payloads.md) and [actions](overview.md#actions).

## Counting and arithmetic

| Value | Config |
|---|---|
| Number of items | `{"element": {"selector": "img"}, "using": "length"}` ([`using`](expressions.md#using)) |
| Number of items passing a test | `{"element": {"selector": "img", "where": {"complete": false}}, "using": "length"}` |
| Number of items containing a match | `{"element": {"selector": ".card", "where": {"element": {"selector": "img", "root": {"self": {}}}}}, "using": "length"}` ([`self`](expressions.md#self)) |
| `-x` | `{"mul": [x, -1]}`, or a negative literal |
| `a − b` | `{"sum": [a, {"mul": [b, -1]}]}` |
| Smallest or largest item of a list `L` | `{"api": {"path": "Math.min.apply", "args": [null, L]}}` or `Math.max.apply`. Over no items, `Infinity` or `-Infinity`, which `Number.isFinite` tests ([Arguments](sources.md#arguments)) |
| Each item's value, capped | `"field": {"api": {"path": "Math.min", "args": [{"self": "naturalWidth"}, 2000]}}` ([`self`](expressions.md#self)) |
| First or last item of a list | `"using": {"path": "at", "args": [0]}`, or `[-1]`. On a list with no items, `undefined` |

The length of the first `h1`'s text:

```json
{"element": {"selector": "h1"}, "using": {"path": "at", "args": [0], "field": "textContent.length"}}
```

### Ratio

More than 70% of a page's images broken, on pages carrying at least five:

```json
{"if": {"element": {"selector": "img"}, "using": "length", "is": {"gte": 5}},
 "then": {"div": [
   {"element": {"selector": "img", "where": {"complete": true, "naturalWidth": 0, "currentSrc.length": {"gt": 0}}}, "using": "length"},
   {"element": {"selector": "img"}, "using": "length"}
 ], "is": {"gt": 0.7}},
 "else": false}
```

`if` counts the broken images only on pages with five images or more ([Evaluation](expressions.md#evaluation)). In `actions`, the image count is bound once with `define` and both places read it through `ref`. A ratio computed for a payload alone guards its denominator with [`if`](expressions.md#if).

## Rendered text

`textContent` includes the source of `<script>` elements, so a page carrying a target string in inline JSON or JS, `<script>{"text": "disable your adblocker"}</script>`, matches on it. Rendered text is the text nodes outside `script`, `style`, `template` and `noscript`. Selecting it needs each text node's ancestry, which an [XPath](sources.md#xpath) expression tests and a CSS selector cannot:

```
//body//text()[not(ancestor::script) and not(ancestor::style) and not(ancestor::template) and not(ancestor::noscript)]
```

The expression starting `//body//` reads the whole page. The same expression starting `.//` reads within [`root`](sources.md#root). In a document served as `application/xhtml+xml`, `//body//text()` selects nothing and `ancestor::script` matches no element. This form covers XHTML too:

```
//*[local-name()='body']//text()[not(ancestor::*[local-name()='script' or local-name()='style' or local-name()='template' or local-name()='noscript'])]
```

`\S` matches each non-whitespace character once, so the `length` of its matches is the number of non-whitespace characters. Here a page with fewer than 2000:

```json
{"text": {"xpath": "//body//text()[not(ancestor::script) and not(ancestor::style) and not(ancestor::template) and not(ancestor::noscript)]", "pattern": "\\S"}, "using": "length", "is": {"lt": 2000}}
```

`T(R)` below is `{"text": {"xpath": X, "pattern": "\\S", "root": R}}`, with `X` the expression starting `.//`:

| Value | Config |
|---|---|
| A phrase in rendered text | `{"text": {"xpath": "//body//text()[…]", "pattern": "disable your ad ?blocker"}}` |
| Text on the whole page | `{"text": {"xpath": "//body//text()[…]", "pattern": "\\S"}, "using": "length"}`, with no `root`. Text in `head`, such as `title`, is outside it |
| Text in one region | `{...T({"ref": "comments"}), "using": "length"}`, with `comments` the region, bound for its guard ([`root`](sources.md#root)) |
| Total text across regions | `T` over a `ref` to the regions' guard. A region inside another is counted once |
| Each item's text | `"field": {...T({"self": {}}), "using": "length"}` beside the item selector. An outer item's value includes its inner items' text |
| Smallest or largest item | `Math.min.apply` or `Math.max.apply` over each item's text ([Counting and arithmetic](#counting-and-arithmetic)) |
| A region with no text | `{"none": T({"ref": "comments"})}`, which stops at the first character |
| Items with no text | `"where": {"none": T({"self": {}})}` beside the item selector, with `"using": "length"` |

A text read per item walks each item's subtree. Where a cheaper test rules some items out, put the text read behind an `if` on that test. `textContent.length` is one, since it's 0 for an item with no text at all. CI warns on a per-item `text` with no `if` above it, which fails no check ([Sources in `where` and `field`](validation.md#sources-in-where-and-field)):

```
"field": {"if": {"self": "textContent.length", "is": {"gt": 0}}, "then": {...T({"self": {}}), "using": "length"}, "else": 0}
"where": {"if": {"self": "textContent.length", "is": {"gt": 0}}, "then": {"none": T({"self": {}})}, "else": true}
```

| Case | Behaviour |
|---|---|
| Visibility | The expression selects text in a `display: none` subtree too |
| Region absent | A `root` selecting nothing is an empty scope with no matches. A guard tells an absent region from an empty one ([`root`](sources.md#root)) |
| Nested regions | A root inside another is dropped, so its text counts once. Per item, through `"root": {"self": {}}`, an outer item's count includes its inner items' text |

## Words in the title

| Value | Config |
|---|---|
| Words in `document.title` | `{"api": {"path": "Array.from", "args": [{"api": {"path": "document.title.matchAll", "args": ["\\S+"]}}]}, "using": "length"}` |
| Words in the `title` element in `head` | `{"text": {"selector": "head > title", "pattern": "\\S+"}, "using": "length"}` |

`document.title` reads the first HTML `title` element anywhere in the document. The two differ on these pages:

| Page | `document.title` | `head > title` |
|---|---|---|
| A `title` after body content, which the parser leaves in `body` | Its words | 0 |
| Several `title` elements in `head` | The first one's words | The words of all of them |
| An SVG document | The words of the root `svg`'s `title` | 0 |

A bare `title` selector also selects the `title` tooltips of inline SVG. The `text` form reads no `api` name ([Allowed names](sources.md#allowed-names)).

## Load state

| Meaning | Source |
|---|---|
| Image loaded | `{"element": {"selector": "img", "where": {"complete": true, "naturalWidth": {"gt": 0}}}}` |
| Image broken | `{"element": {"selector": "img", "where": {"complete": true, "naturalWidth": 0, "currentSrc.length": {"gt": 0}}}}` |
| Image not yet loaded | `{"element": {"selector": "img", "where": {"complete": false}}}` |
| Stylesheet failed to load | `{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"initiatorType": "link", "responseStatus": {"gte": 400}}}}` |

| Recipe | Behaviour |
|---|---|
| Image loaded, image broken | A lazy image not yet requested is not `complete`, and passes neither |
| Image broken | `currentSrc` is empty for an `img` with no `src` or `srcset`, which the recipe excludes. An SVG image with no intrinsic size can report `naturalWidth === 0` after loading |
| Image recipes | An image blocked by our own protections reads the same as one that failed |
| Stylesheet failed to load | Chromium and Firefox give a stylesheet that failed with an error status an empty `sheet`, the same as an empty stylesheet, so the recipe reads the resource entry's `responseStatus`. Every fetch a `link` element starts has `initiatorType` `link`, so a failed `preload` or `prefetch` counts too. A stylesheet our own protections block counts only where the engine creates an entry with an error status for it. An engine without `responseStatus` counts 0 |

## Computed style

| Value | Config |
|---|---|
| One element's computed `position` | `{"api": {"path": "getComputedStyle", "args": [{"only": {"element": {"selector": "#banner"}}}]}, "using": "position"}` |
| Elements positioned `fixed` or `sticky` | `{"element": {"selector": "div", "where": {"api": {"path": "getComputedStyle", "args": [{"self": {}}]}, "using": "position", "is": {"in": ["fixed", "sticky"]}}}}` ([`self`](expressions.md#self)) |

`getComputedStyle` returns a `CSSStyleDeclaration`, which iterates its property names, so the `api` reading it is also a list ([`api`](sources.md#api)). Read a property through `using`, which reads it from the declaration. `field` would read it from each property name in turn, giving a list of `undefined`.

A property such as `position` resolves from style alone. A dimension such as `width` resolves through layout, so reading it forces layout.

## Performance timeline

The timeline's rules are in [Performance timeline](sources.md#performance-timeline).

```jsonc
// A load ending at 8 s or later
{"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "field": "loadEventEnd"}, "is": {"gte": 8000}}

// A first contentful paint before 1.8 s
{"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"], "field": "startTime"}, "is": {"lt": 1800}}

// The number of resources
{"api": {"path": "performance.getEntriesByType", "args": ["resource"]}, "using": "length"}

// The longest resource duration
{"api": {"path": "Math.max.apply", "args": [null, {"api": {"path": "performance.getEntriesByType", "args": ["resource"], "field": "duration"}}]}}

// The number of resources an img or CSS started that took over a second
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"duration": {"gt": 1000}, "initiatorType": {"in": ["img", "css"]}}}, "using": "length"}
```

### Several fields of the `navigation` entry

Bind the entry once with `only`, and read each field with `using`:

```json
{"define": {"navigation": {"only": {"api": {"path": "performance.getEntriesByType", "args": ["navigation"]}}}}}
{"ref": "navigation", "using": "loadEventEnd"}
{"ref": "navigation", "using": "responseStatus"}
```

### Load ended a while ago

The load event has ended, and ended at least 3 s before the read. A detector reading the page after it settles puts these in `match`, or in the condition of an `if` around the actions that need them ([Waiting for the page to settle](#waiting-for-the-page-to-settle)). `only` makes `loadEventEnd` a number, which a payload sends raw:

```json
{"all": [
  {"only": {"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "field": "loadEventEnd"}}, "is": {"gt": 0}},
  {"api": {"path": "performance.now", "args": []}, "is": {"gte": {"sum": [{"only": {"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "field": "loadEventEnd"}}}, 3000]}}}
]}
```

In `actions`, `loadEventEnd` is bound once with `define`, and both leaves read it through `ref`.

### First paint as a fallback

A page with no `first-contentful-paint` entry reads `first-paint` here, and each branch binds the time under its own name:

```json
{"if": {"api": {"path": "performance.getEntriesByName", "args": ["first-contentful-paint", "paint"]}, "using": "length", "is": {"gt": 0}},
 "then": {"define": {"fcp": {"only": {"api": {
   "path": "performance.getEntriesByName",
   "args": ["first-contentful-paint", "paint"],
   "field": "startTime"
 }}}}},
 "else": {"define": {"firstPaint": {"only": {"api": {"path": "performance.getEntriesByName", "args": ["first-paint", "paint"], "field": "startTime"}}}}}}
```

A payload reading `fcp` omits its key when `first-paint` was used, and a payload reading `firstPaint` reports the proxy under its own name. On a page with no `paint` entries, `only` in the `else` branch fails, so a detector running before first paint guards the whole read with an `if` over the `length` of the `paint` entries.

## Missing fields and throwing reads

| Test | Predicate |
|---|---|
| A field some engines lack, read as a non-match | `{"responseStatus": {"gte": 400}}` |
| A field some engines lack, read as a match | `{"responseStatus": {"any": [{"type": "undefined"}, {"gte": 400}]}}` |
| A property present on the item | `{"api": {"path": "Reflect.has", "args": [{"self": {}}, "responseStatus"]}}` in `where` ([Presence](predicates.md#presence)) |
| A read that may throw, read as a non-match | `{"cssRules": {"fails": false, "length": 0}}`. `fails` is tested before `length`, and its `false` stops the read ([Failure and type](predicates.md#failure-and-type)) |

A missing field reads `undefined`, and a comparison on `undefined` is `false`. On an engine without `responseStatus`, the first count reads 0 and the second counts every entry ([Failure and type](predicates.md#failure-and-type)):

```json
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"responseStatus": {"gte": 400}}}, "using": "length"}
{"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"responseStatus": {"any": [{"type": "undefined"}, {"gte": 400}]}}}, "using": "length"}
```

### A value in place of a throwing read

With `fails` in its condition, `if` gives a value in place of a failed read. On a page with a cross-origin stylesheet, `emptySheetsOr0` is 0. The condition and the branch each read the stylesheets:

```json
{"define": {"emptySheetsOr0": {
  "if": {"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length", "is": {"fails": false}},
  "then": {"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length"},
  "else": 0
}}}
```

A `define` of the read alone fails on that page.

### Either of two signals, one of which may throw

`fails` on the number of empty stylesheets lets the failed-stylesheet leaf decide on a page with a cross-origin stylesheet:

```json
{"any": [
  {"api": {"path": "performance.getEntriesByType", "args": ["resource"], "where": {"initiatorType": "link", "responseStatus": {"gte": 400}}}, "using": "length", "is": {"gt": 0}},
  {"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length", "is": {"fails": false, "gt": 0}}
]}
```

## Value tests

| Test | Predicate |
|---|---|
| One of several values | `{"initiatorType": {"in": ["img", "css"]}}` |
| None of several values | `{"initiatorType": {"none": {"in": ["img", "css"]}}}` |
| Not `null` | `{"sheet": {"none": null}}` |
| Two properties of one item | `{"responseEnd": {"gt": {"sum": [{"self": "startTime"}, 1000]}}}` |
| A number that may be `null` | `{"selectionStart": {"type": "number", "gt": 0}}` |
| A number that may be `NaN` or infinite | `{"duration": {"field": {"api": {"path": "Number.isFinite", "args": [{"self": {}}]}}, "is": true, "gt": 0}}` |
| `NaN` | `{"duration": {"field": {"api": {"path": "Number.isNaN", "args": [{"self": {}}]}}, "is": true}}` |
| `Infinity` | `{"duration": {"field": {"api": {"path": "Number.isFinite", "args": [{"self": {}}]}}, "is": false, "gt": 0}}`, or `{"duration": {"eq": {"ref": "infinity"}}}` with `infinity` bound to `{"api": "Infinity"}` by a `define` before the source ([Sources in `where` and `field`](validation.md#sources-in-where-and-field)) |
| A string or array that is not empty | `{"currentSrc.length": {"gt": 0}}` |
| A property named like a reserved key | `{"field": "text", "is": "Sign in"}`, or in `where`, `{"self": "text", "is": "Sign in"}` |

## JS builtins

JS builtins called through `api` give the values JSON does not write directly ([Arguments](sources.md#arguments)):

| Value | `api` |
|---|---|
| `L` with values added, or lists joined | `{...L, "using": {"path": "concat", "args": [100]}}`. `{"expr": [100], "using": {"path": "concat", "args": [L]}}` puts 100 first. Only `concat` through `using` gives a list `apply` takes ([Method calls](validation.md#method-calls)) |
| A list from an iterable that is not an array, such as `FontFaceSet` | `{"api": {"path": "Array.from", "args": [x]}}` |
| A constant object | `{"api": {"path": "JSON.parse", "args": ["{\"composed\": true}"]}}` |
| An object holding values read from the page | `{"api": {"path": "Object.fromEntries", "args": [{"expr": [{"expr": ["relativeTo", {"ref": "node"}]}]}]}}` |
| `undefined`, `NaN`, `Infinity` | `{"api": "undefined"}` |
| The words in a string, `\S+` runs: 0 for an empty or whitespace-only string | `Array.from` over the string's `matchAll`, with `"using": "length"` ([Words in the title](#words-in-the-title)) |

```json
{"api": {"path": "Math.max.apply", "args": [null, {"element": {"selector": "img", "field": "naturalWidth"}, "using": {"path": "concat", "args": [100]}}]}}
{"only": {"element": {"selector": "my-widget"}}, "using": {"path": "checkVisibility", "args": [{"api": {"path": "JSON.parse", "args": ["{\"checkOpacity\": true}"]}}]}}
```

The first is the widest image's natural width or 100 if larger, the second whether the widget is visible with opacity counted.

`matchAll` reads `RegExp.prototype` as the page leaves it ([Page code](predicates.md#page-code)).

## Detector shapes

### Doing something once

A detector with no `match` runs its `actions` on every run. An action inside an `if` on a detector name, which the same branch sets, runs once:

```json
{"if": {"none": [{"ref": "this.sent", "is": true}]},
 "then": {"fireEvent": {"type": "pageSize"}, "define": {"this.sent": true}}}
```

Before its first `define`, the name reads `undefined` ([Names](expressions.md#names)). `{"is": true}` does not hold for `undefined`, so `none` over it holds, and the branch runs on the first run.

| Name | Guards |
|---|---|
| `this.sent` | One action, such as the `fireEvent` of a detector that writes its breakage entry on every run |
| `this.finished` | The whole of `actions`, so a finished detector reads nothing more ([Finishing early](#finishing-early)) |

### A measurement on every page

Every run writes the raw value to breakage reports, and the event sends it bucketed once the load has ended ([Buckets](payloads.md#buckets)). The event is inside a [once guard](#doing-something-once):

```json
"actions": [
  {"define": {"loadTime": {"only": {"api": {
    "path": "performance.getEntriesByType",
    "args": ["navigation"],
    "field": "loadEventEnd"
  }}}}},
  {"breakageReportData": {"data": {"loadTime": {"value": {"ref": "loadTime"}}}}},
  {
    "if": {"all": [{"ref": "loadTime", "is": {"gt": 0}}, {"none": [{"ref": "this.sent", "is": true}]}]},
    "then": {
      "fireEvent": {
        "type": "pageLoadTime",
        "data": {
          "loadTime": {
            "value": {"ref": "loadTime"},
            "buckets": [{"name": "0-3s", "is": {"lt": 3000}}, {"name": "3-8s", "is": {"gte": 3000, "lt": 8000}}, {"name": "8s+", "is": {"gte": 8000}}]
          }
        }
      },
      "define": {"this.sent": true}
    }
  }
]
```

`loadEventEnd` is 0 until the load event fires, so a breakage report filed before then includes 0. For a `period` pixel, the event becomes a [chain](expressions.md#sequences) of [per-bucket events](payloads.md#per-bucket-events). A detector reporting only the final value takes `"match": {"only": {"api": {…, "field": "loadEventEnd"}}, "is": {"gt": 0}}`, writes and sends in `actions` with no `this.sent`, and is done once it fires.

### A measurement that keeps changing

A value that changes after the event is sent, such as the number of elements, is read again by every run, a breakage report's included:

```json
"actions": [
  {"define": {"elementCount": {"api": {"path": "document.getElementsByTagName", "args": ["*"]}, "using": "length"}}},
  {"breakageReportData": {"data": {"elementCount": {"value": {"ref": "elementCount"}}}}},
  {
    "if": {"none": [{"ref": "this.sent", "is": true}]},
    "then": {
      "fireEvent": {
        "type": "pageSize",
        "data": {
          "elementCount": {
            "value": {"ref": "elementCount"},
            "buckets": [{"name": "under100", "is": {"lt": 100}}, {"name": "100-1999", "is": {"gte": 100, "lt": 2000}}, {"name": "2000+", "is": {"gte": 2000}}]
          }
        }
      },
      "define": {"this.sent": true}
    }
  }
]
```

### A value read the same by every detector

A value fixed for the navigation, such as `loadEventEnd` once the load has ended or the document's `responseStatus`, is written by one detector that runs on the `breakageReport` trigger alone, so each report includes it once:

```json
"triggers": {"breakageReport": {"state": "enabled", "runConditions": {"context": {"top": true}}}},
"actions": [
  {"define": {"loadEventEnd": {"only": {"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "field": "loadEventEnd"}}}}},
  {"breakageReportData": {"data": {"loadEventEnd": {"value": {"ref": "loadEventEnd"}}}}}
]
```

Every other detector binds the value with `define` for its conditions and buckets, and leaves it out of its payloads. A value that changes while the page is open, such as rendered text length, stays in the payload of each detector that tests it.

### Waiting for the page to settle

`match` holds once the load event ended at least 3 s before the read ([Load ended a while ago](#load-ended-a-while-ago)) and an image is broken. The `if` counts the images only once the page has settled:

```json
"match": {
  "if": {"all": [
    {"only": {"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "field": "loadEventEnd"}}, "is": {"gt": 0}},
    {"api": {"path": "performance.now", "args": []}, "is": {"gte": {"sum": [{"only": {"api": {"path": "performance.getEntriesByType", "args": ["navigation"], "field": "loadEventEnd"}}}, 3000]}}}
  ]},
  "then": {"element": {"selector": "img", "where": {"complete": true, "naturalWidth": 0, "currentSrc.length": {"gt": 0}}}, "using": "length", "is": {"gte": 1}},
  "else": false
},
"actions": {"fireEvent": {"type": "brokenImages"}, "breakageReportData": {}}
```

### Finishing early

A detector with no `match` keeps running on every trigger. One that has an answer later reads would not change, or that reads a page it must not, puts its body inside a [once guard](#doing-something-once) on `this.finished`, and binds the name once it is finished:

| Finished when | Config |
|---|---|
| The page is one it must not read, `U` | `[{"define": {"this.finished": U}}, {"if": {"none": [{"ref": "this.finished", "is": true}]}, "then": [...]}]`, all inside the outer `if` |
| A value is final, `F` | `{"define": {"this.finished": F}}`, last in the outer `if`'s `then` |
| The detection is made | `"define": {"this.finished": true}` beside the detecting actions |

Here a page with a password field:

```jsonc
"actions": {
  "if": {"none": [{"ref": "this.finished", "is": true}]},
  "then": [
    {"define": {"this.finished": {"element": {"selector": "input[type=password]"}, "using": "length", "is": {"gt": 0}}}},
    {"if": {"none": [{"ref": "this.finished", "is": true}]}, "then": [/* the detector's reads and actions */]}
  ]
}
```

After it finishes, each run reads one name. A detector that detects once folds the page it must not read into `match`, `"match": {"any": [U, D]}`, with its actions inside `{"if": D, "then": …}`.

### A weak signal and a strong one

Each signal is inside a once guard on its own name, and the strong one finishes the detector:

```json
"actions": {
  "if": {"none": [{"ref": "this.confirmed", "is": true}]},
  "then": [
    {"if": {"all": [{"none": [{"ref": "this.suspected", "is": true}]}, {"text": {"pattern": "disable your ad ?blocker"}}]},
     "then": {"fireEvent": {"type": "adwall_suspected"}, "define": {"this.suspected": true}}},
    {"if": {"element": {"selector": [".adblock-wall", "#adblock-overlay"], "visibility": "visible"}},
     "then": {"fireEvent": {"type": "adwall_confirmed"}, "breakageReportData": {}, "define": {"this.confirmed": true}}}
  ]
}
```

### Counting reads

A detector name, set to 0 on the first run, counts the runs in which a condition holds. Every run counts, a breakage report's included. Here an overlay visible on two reads:

```json
"actions": {
  "if": {"none": [{"ref": "this.finished", "is": true}]},
  "then": [
    {"if": {"ref": "this.visibleReads", "is": {"type": "undefined"}}, "then": {"define": {"this.visibleReads": 0}}},
    {"if": {"element": {"selector": "#overlay", "visibility": "visible"}},
     "then": {"define": {"this.visibleReads": {"sum": [{"ref": "this.visibleReads"}, 1]}}}},
    {"if": {"ref": "this.visibleReads", "is": {"gte": 2}},
     "then": {"fireEvent": {"type": "overlay_persistent"}, "breakageReportData": {}, "define": {"this.finished": true}}}
  ]
}
```

### Held for a duration

A detector name records the time of the first read that sees a condition, and a later read compares the time with it. Here an overlay still visible 10 s after a read first saw it. A read that does not see it clears the time:

```json
"actions": {
  "if": {"none": [{"ref": "this.finished", "is": true}]},
  "then": {
    "if": {"element": {"selector": "#overlay", "visibility": "visible"}},
    "then": [
      {"if": {"ref": "this.firstSeen", "is": {"type": ["undefined", "null"]}},
       "then": {"define": {"this.firstSeen": {"api": {"path": "performance.now", "args": []}}}}},
      {"if": {"api": {"path": "performance.now", "args": []}, "is": {"gte": {"sum": [{"ref": "this.firstSeen"}, 10000]}}},
       "then": {"fireEvent": {"type": "overlay_held"}, "breakageReportData": {}, "define": {"this.finished": true}}}
    ],
    "else": {"define": {"this.firstSeen": null}}
  }
}
```

The duration is known to the spacing of the reads: a condition first seen at one read held for at least the time since it, and at most the time since the read before it. Timers fire late, so a bound equal to the spacing between two `intervalMs` offsets can miss by a few milliseconds. Set it below the spacing.

### Two reads in a row

A detector name holds the previous read, and a condition tests the current read and the stored one. The last element stores the current value on every run. Here a count of at least 8 on two consecutive reads:

```json
"actions": {
  "if": {"none": [{"ref": "this.finished", "is": true}]},
  "then": [
    {"define": {"count": {"element": {"selector": ".placeholder"}, "using": "length"}}},
    {"if": {"all": [
       {"ref": "this.lastCount", "is": {"type": "number", "gte": 8}},
       {"ref": "count", "is": {"gte": 8}}
     ]},
     "then": {"fireEvent": {"type": "count_confirmed"}, "breakageReportData": {}, "define": {"this.finished": true}}},
    {"define": {"this.lastCount": {"ref": "count"}}}
  ]
}
```

On the first run `this.lastCount` reads `undefined`, which `"type": "number"` excludes. A breakage report's run is one of the reads, so the read before a scheduled one can be a report's. A pair of offsets 200 ms apart, `[5000, 5200]`, re-reads shortly after the first read.

### Releasing a held list

A detector name keeps its value until a later `define` of the name, and a list keeps every item it selected, elements included. Where later runs need only a count or a field, hold that: `{"define": {"this.placeholders": {"element": {"selector": ".placeholder"}, "using": "length"}}}`.

Where a later run reads the items, define the name as `null` in the run that reads them last. Here the overlays the first read sees, whose text each later read tests. A detector that is done runs no more, so the release goes next to `"this.finished": true`:

```json
"actions": {
  "if": {"none": [{"ref": "this.finished", "is": true}]},
  "then": [
    {"if": {"none": [{"ref": "this.watching", "is": true}]},
     "then": {"define": {"this.watching": true, "this.overlays": {"element": {"selector": ".overlay"}}}}},
    {"if": {"text": {"pattern": "ad ?block", "root": {"ref": "this.overlays"}}},
     "then": {"fireEvent": {"type": "overlay_adblock"}, "breakageReportData": {}, "define": {"this.finished": true, "this.overlays": null}}}
  ]
}
```

### Largest over reads

`Math.max` over the stored value and the current read keeps the largest. Here the largest element count across reads every 500 ms up to 4 s, `intervalMs: [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000]`:

```json
"actions": [
  {"if": {"ref": "this.maxElements", "is": {"type": "undefined"}}, "then": {"define": {"this.maxElements": 0}}},
  {"define": {"this.maxElements": {"api": {"path": "Math.max", "args": [
     {"ref": "this.maxElements"},
     {"api": {"path": "document.getElementsByTagName", "args": ["*"]}, "using": "length"}
   ]}}}}
]
```

`Math.max` of `undefined` and a number is `NaN`, so the first element sets 0 before the first read.

### Counting unreadable pages

A predicate testing the value with `fails` holds on a failed read. Here `match` holds on a page whose stylesheets cannot be read, as on one with three empty stylesheets or more, and `actions` sends which. A comparison on a failed value fails, so the second entry tests `fails` ahead of `gte` ([Failure and type](predicates.md#failure-and-type)):

```json
"match": {"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length", "is": {"any": [{"fails": true}, {"fails": false, "gte": 3}]}},
"actions": {
  "if": {"api": {"path": "document.styleSheets", "where": {"cssRules.length": 0}}, "using": "length", "is": {"fails": true}},
  "then": {"fireEvent": {"type": "emptySheets_unreadable"}},
  "else": {"fireEvent": {"type": "emptySheets_many"}}
}
```
