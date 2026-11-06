# Rollouts and Experiments

`scripts/experiment.mjs` changes rollouts and runs content scope experiments; `--help` lists every option. Every command takes `--dry-run`, which prints the result and writes nothing. Run `npm test` after writing.

## Rollouts

A sub-feature's `rollout.steps[].percent` (0–100) enrols that share of users. Clients keep their enrolment and track each step they have processed, so a rollout changes only by appending a step:

```json
"rollout": { "steps": [{ "percent": 25 }, { "percent": 100 }] }
```

| Task | Command |
|---|---|
| Raise | `node scripts/experiment.mjs rollout <sub-feature> --parent <feature> --percent <p>` appends a step in every file that defines the sub-feature |
| Lower | The same with `--allow-decrease`. Only Android un-enrols users |
| Halt | Set the sub-feature's `state` to `disabled`; everyone enrolled loses it |

For how clients process rollouts, see [this Asana task](https://app.asana.com/0/1198194956794324/1204934761241565/f).

## Content scope experiments

An experiment is a sub-feature of `contentScopeExperiments`, a slot, with `cohorts` (`{ "name", "weight" }`, weights relative) and usually a rollout. A feature changes per cohort through a `conditionalChanges` entry with the condition `{ "experiment": { "experimentName": "<slot>", "cohort": "<cohort>" } }`. A whole C-S-S feature is switched per cohort through its `additionalCheck` setting, which the feature's schema must declare.

| Task | Command |
|---|---|
| Turn a feature on for a treatment cohort | `node scripts/experiment.mjs create auto --platforms android,ios,macos,windows --rollout 10 --enable-feature webDetection` |
| Change settings for one cohort | `node scripts/experiment.mjs create auto --platforms android,windows --patch treatment=patch.json` |
| Inspect | `node scripts/experiment.mjs status <slot>` |
| Raise the rollout | `node scripts/experiment.mjs rollout <slot> --percent 25` |
| Stop | `node scripts/experiment.mjs disable <slot>`; everyone gets production |
| Ship or clean up | `node scripts/experiment.mjs remove <slot>` deletes the slot and its conditional changes |

`create auto` picks an Android slot that no override and no past commit uses; in a shallow clone, run `git fetch --unshallow` first. It checks each cohort's result on every platform before writing.

Once an experiment is enabled with cohorts, start a new experiment rather than editing it. Don't change its cohorts or add a metric to it; a metric can be removed, or have its event renamed along with the detectors that fire it. Never give a new experiment a name used before. A change to a detector that fires a live metric's event changes what the metric measures mid-experiment, so tell the experiment owner.

With `--enable-feature`, every cohort except `control` runs the feature, and `--control` sets what control runs:

| `--control` | Control runs |
|---|---|
| `production` (default) | What users outside the experiment run |
| `enabled` | The feature |
| `disabled` | Nothing of the feature |

Where the feature is off in production, `create` turns it on in the override and switches it off through `additionalCheck` for everyone outside the enabled cohorts. `remove` leaves it on, which ships it. To abandon the experiment, `disable` it; when removing it later, set the feature's `state` back to `disabled` in the same change.

A `--patch` file names the feature and its JSON Patch. Use `add`: `replace` on a missing path changes nothing.

```json
{ "feature": "webDetection", "patchSettings": [{ "op": "add", "path": "/someSetting", "value": "enabled" }] }
```

### Web detection detector splits

`scripts/web-detection-experiment.mjs create` splits detectors into disjoint slices, one per treatment cohort (`treatment01`, `treatment02`, …):

| `--mode` | Treatment cohort | Control |
|---|---|---|
| `enable` | Auto-runs only its slice of the production detectors | No detectors |
| `disable` | Stops its slice of the production detectors | Production |
| `trial` | Adds its slice of the detectors not running in production | Production |

```sh
node scripts/web-detection-experiment.mjs create --mode disable --cohorts 4 --cohort-percent 5 --by group --dry-run
```

`--help` covers sizing (`--rollout`, `--control-percent`, `--cohort-percent`) and seeding. Use `experiment.mjs` to raise, stop or inspect the experiment, and `web-detection-experiment.mjs remove --experiment <slot>` to remove it.
