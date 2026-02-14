# Content Scope Experiments Configuration

Guide for adding content scope experiments (C-S-S experiments) to privacy-remote-configuration override files. Use this when you need to test features with a subset of users before full deployment.

## When to Use
- Testing new features with limited user exposure
- A/B testing feature variations
- Gradual rollout of potentially breaking changes
- Validating feature behavior before full deployment

## Implementation Pattern

### 1. Define Experiment in contentScopeExperiments
```json
"contentScopeExperiments": {
    "state": "enabled",
    "features": {
        "yourExperimentName": {
            "state": "enabled",
            "rollout": {
                "steps": [
                    {
                        "percent": 10
                    }
                ]
            },
            "cohorts": [
                { "name": "control", "weight": 1 },
                { "name": "treatment", "weight": 1 }
            ]
        }
    }
}
```

### 2. Add Conditional Changes to Target Feature
```json
"targetFeature": {
    "state": "enabled",
    "settings": {
        "conditionalChanges": [
            {
                "condition": {
                    "experiment": { 
                        "experimentName": "yourExperimentName", 
                        "cohort": "treatment" 
                    }
                },
                "patchSettings": [
                    {
                        "op": "replace",
                        "path": "/settingName",
                        "value": true
                    }
                ]
            }
        ]
    }
}
```

## Key Rules
- Never add `patchSettings` to the experiment definition in `contentScopeExperiments`
- Always use `conditionalChanges` in the target feature's settings
- Use JSON Patch operations (`replace`, `add`, `remove`)
- Use JSON Pointer format for paths (e.g., `/settingName`)
- Start with small rollout percentages (5-10%)
- Test with a small rollout before expanding

## Example: Fingerprinting Canvas
```json
// Experiment definition
"contentScopeExperiments": {
    "state": "enabled",
    "features": {
        "fingerprintingCanvasAdditionalEnabledCheck": {
            "state": "enabled",
            "rollout": { "steps": [{ "percent": 10 }] },
            "cohorts": [
                { "name": "control", "weight": 1 },
                { "name": "treatment", "weight": 1 }
            ]
        }
    }
}

// Feature modification
"fingerprintingCanvas": {
    "state": "enabled",
    "settings": {
        "conditionalChanges": [
            {
                "condition": {
                    "experiment": { 
                        "experimentName": "fingerprintingCanvasAdditionalEnabledCheck", 
                        "cohort": "treatment" 
                    }
                },
                "patchSettings": [
                    {
                        "op": "replace",
                        "path": "/additionalEnabledCheck",
                        "value": true
                    }
                ]
            }
        ]
    }
}
```
