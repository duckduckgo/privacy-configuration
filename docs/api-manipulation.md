# API manipulation config

`apiManipulation` changes page-visible DOM APIs from Content Scope Scripts. Use raw `apiChanges` narrowly and prefer platform/domain scoping for targeted webcompat fixes.

## Raw descriptor targets

Raw descriptor changes default to `target: "own"`.

| `target` | Behavior |
| --- | --- |
| omitted / `"own"` | Only mutate an own descriptor on the target object. Inherited or missing properties are skipped. |
| `"existing"` | Mutate an own descriptor, or shadow-define a compatible inherited descriptor as an own property. Missing properties are skipped. |
| `"missing"` | Define a new own property only when absent from the target and its prototype chain. |

Use `target: "existing"` when intentionally targeting inherited DOM methods such as `MediaDevices.prototype.addEventListener` inherited from `EventTarget.prototype`.

`define: true` is deprecated and kept only as a compatibility alias for `target: "missing"`.

## Descriptor shapes

Use exactly one descriptor shape:

- accessor: `getterValue` and/or `setterValue`
- value: `value`

Do not mix `value` with `getterValue`/`setterValue`.
