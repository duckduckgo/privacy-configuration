# Writing detectors

This guidance covers the actual writing of detectors: choosing where to place the detector, what conditions to use & tips on matching logic, how often to run the detector, etc.

The process for shipping a detector is covered in [shipping-a-detector.md](shipping-a-detector.md).

Note that if editing a detector in a way that substantially changes its behaviour or privacy properties, consider reviewing [shipping-a-detector.md](shipping-a-detector.md) and filing a [privacy triage](privacy-triage.md).

## Where a detector lives

Detectors live in [`features/web-detection.json`](../../../features/web-detection.json), under `settings.detectors.<group>.<detector>`. The group namespaces related detectors; the pair `<group>.<detector>` is the detector's ID everywhere else.

Both names must wholly match `^[a-zA-Z][a-zA-Z0-9_]*$`. CI refuses a name that doesn't, since C-S-S uses each name as config gives it.

## Choosing a group

Add to an existing group when the new detector finds the same class of problem: a language variant of a message that group already matches, or another vendor's implementation of the same obstacle. A new class of problem takes a new group.

## Writing match conditions

Work from the page. Open the case you are targeting, find the smallest wording or element that appears only when the problem does, and write the condition against that.

- **Match what the site ships, not what it composes.** A phrase or class name coming from the vendor is stable; wording assembled per locale needs a detector per language.
- **Scope and anchor before widening.** A pattern that misses is fixed by adding an alternative to the array. A pattern that also matches healthy pages inflates every number derived from it until it is narrowed.
- **Keep vendor names out of selectors.** A page can replace `querySelectorAll` and read what a detector asks for — Cloudflare challenges have gone into reload loops on finding their own name there. Write it with CSS character escapes instead: `".cf-t\\75 rnstile"` in JSON matches `.cf-turnstile`, where `\75` is `u` and the space after it closes the escape.

## Choosing a condition type

A detector matches on page text (`text`), on the presence of an element (`element`), or on a combination of the two. Every key and operator is in [Conditions](../conditions.md), and the limits of XPath in [XPath](../sources.md#xpath). A count, a measurement or a Web API value is read with the sources in [Sources](../sources.md) and tested with `is` ([Expressions](../expressions.md)).

`element` for vendor widgets, `text` for messages. Vendor widgets carry stable class names and iframe URLs; adwalls, CAPTCHAs and player errors carry stable phrases.

Within `text`, `xpath` is the source to use where a match on `<script>` source would be a false positive: page text includes script source, so a phrase in inline JSON or JS matches a page that showed the user nothing.

`xpath` selects by ancestry, not by layout, so a phrase inside a `display: none` subtree still matches. Where real visibility decides whether the problem is present, AND an `element` condition onto the same detector.

For CAPTCHA and anti-bot detectors use `visibility: "content"`. Forcing layout on a challenge element perturbs its anti-bot scoring and can send the challenge into a reload loop. The hermetic test suite cannot see this, so it is enforced in review: [`BUGBOT.md`](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/web-detection/sources/BUGBOT.md). Keep the selector narrow so `content` stays cheap ([Conditions](../conditions.md#element) describes what it costs on the page).

## Triggers and actions

A detector with `match` and `"actions": {"breakageReportData": {}}` is enabled, runs when a breakage report is submitted, runs in the top frame only, writes its entry to the report once `match` holds, and fires no event. Every detector has `actions`. [Overview](../overview.md) has the config model in full.

| To change | Add |
|---|---|
| Run on page load, not only on report submission | `triggers.auto`: `{ "state": "enabled", "when": { "intervalMs": [...] } }` |
| Run in subframes as well as the top frame | `runConditions` on the trigger |
| Emit an event | `fireEvent` in `actions`: `{ "type": "..." }` |
| Emit an event and stay out of breakage reports | `triggers.breakageReport`: `{ "state": "disabled" }`, since CI rejects a detector a breakage report runs that writes no breakage data |
| Send values with the event or the entry | `data` on the action ([Payloads](../payloads.md)) |
| Measure on every run rather than detect once | No `match`, with each event guarded by a detector name ([`match`](../overview.md#match)) |

A `runConditions` value **replaces** the top-frame default rather than merging with it. Setting `runConditions: {}` removes the frame restriction entirely.

### Tuning `auto` intervals

Each `intervalMs` value is one check, that many milliseconds after the detector starts, and checks don't repeat. Once a detector's `match` holds in a frame, its remaining checks are cancelled.

The intervals needed will depend on when the content is available to check.

- captchas take a while to complete & users are likely to engage with these rather than refresh, so their `auto` intervals should be longer than for content that appears immediately
- adwalls can appear early on & the user may refresh the page or interact with them quickly, so their `auto` intervals can be shorter than for captchas

## Naming events

Name the event after the *signal*, not the detector.

Where one signal is split across several detectors because the wording is per-locale, every one of them fires the same event name. A set of `<group>.generic_<lang>` detectors firing one event gives a pixel that counts the obstacle rather than the languages, so a new language needs no new pixel. Split the event name only where the pixel has to tell the parts apart — a per-region count, for instance, which is a question for the [privacy triage](privacy-triage.md).

Where each detector is its own signal, `<group>_<detector>` follows: one detector per vendor fires `<group>_<vendor>`, because the pixel has to separate the vendors.

## Testing

Run the detector against the page you are targeting in a debug build. Each auto run whose `match` holds or fails, and each auto run of a detector without `match`, sends a `webDetectionAutoRun` notification carrying the detector ID, the `match` result, each action's outcome and a timestamp ([Reporting](../failures.md#reporting)), which is the quickest way to confirm the conditions hold where you expect and stay quiet on a healthy page.

CI covers a new pattern or selector on an existing detector. Across every config it generates it checks group and detector names, the [conditions themselves](../validation.md#text-and-element-conditions), and that every `fireEvent.type` has a consumer ([shipping-a-detector.md](shipping-a-detector.md#the-consumer-cross-check)). Run it with `npm test`. It builds the generated configs before the tests read them.

A detector exercising framework behaviour that is not yet covered needs a fixture page under `content-scope-scripts/injected/integration-test/test-pages/web-detection/pages/` and a case in `web-detection.spec.js`. Run `npm run test-unit` and `npm run test-int` in `content-scope-scripts`.
