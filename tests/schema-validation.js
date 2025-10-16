import Ajv from 'ajv';
import schemaGenerator from 'ts-json-schema-generator';
const ajv = new Ajv({ allowUnionTypes: true });

function createGenerator() {
    try {
        return schemaGenerator.createGenerator({
            path: './schema/config.ts',
            tsconfig: './tsconfig.json',
        });
    } catch (e) {
        console.error(e.diagnostic);
        throw e;
    }
}

/**
 * Generate the JSONSchema for the named TS type
 * @param {import('../schema/config').ExportedSchemas} schemaName
 */
export function getSchema(schemaName) {
    return createGenerator().createSchema(schemaName);
}

/**
 * Generate a validator for checking JSON objects against the named TS type
 * @param {import('../schema/config').ExportedSchemas} schemaName
 */
export function createValidator(schemaName) {
    return ajv.compile(getSchema(schemaName));
}

function formatParams(params) {
    if (params) {
        return Object.entries(params)
            .map(
                ([
                    key,
                    value,
                ]) => `${key}: ${value}`,
            )
            .join(',\n');
    }
    return '';
}

export function formatErrors(errors) {
    if (!Array.isArray(errors)) {
        return '';
    }

    return errors
        .map((item) => {
            const params = formatParams(item.params);
            return params ? `${item.instancePath}: ${params} - ${item.message}` : `${item.instancePath}: ${item.message}`;
        })
        .join(', ');
}

function validateElementHidingRulesOptimized(rules) {
    if (!Array.isArray(rules)) {
        return { valid: true };
    }

    const simpleRules = [];
    const complexRules = [];

    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];

        if (!rule.type) {
            return {
                valid: false,
                error: `Rule ${i}: Missing required 'type' property`,
            };
        }

        if (
            [
                'modify-style',
                'modify-attr',
            ].includes(rule.type)
        ) {
            complexRules.push({ rule, index: i });
        } else {
            simpleRules.push({ rule, index: i });
        }
    }

    const simpleValidation = validateSimpleRules(simpleRules);
    if (!simpleValidation.valid) return simpleValidation;

    const complexValidation = validateComplexRules(complexRules);
    if (!complexValidation.valid) return complexValidation;

    return { valid: true };
}

function validateSimpleRules(simpleRules) {
    for (const { rule, index } of simpleRules) {
        if (
            [
                'hide-empty',
                'hide',
                'closest-empty',
                'override',
            ].includes(rule.type)
        ) {
            if (!rule.selector) {
                return {
                    valid: false,
                    error: `Rule ${index}: ${rule.type} rules must have 'selector' property`,
                };
            }
        }
    }
    return { valid: true };
}

function validateComplexRules(complexRules) {
    for (const { rule, index } of complexRules) {
        if (rule.type === 'modify-style') {
            if (!rule.values || !Array.isArray(rule.values)) {
                return {
                    valid: false,
                    error: `Rule ${index}: modify-style rules must have 'values' array property`,
                };
            }
            for (let j = 0; j < rule.values.length; j++) {
                const value = rule.values[j];
                if (!value.property || !value.value) {
                    return {
                        valid: false,
                        error: `Rule ${index}, value ${j}: Style values must have 'property' and 'value' properties`,
                    };
                }
            }
        }

        if (rule.type === 'modify-attr') {
            if (!rule.values || !Array.isArray(rule.values)) {
                return {
                    valid: false,
                    error: `Rule ${index}: modify-attr rules must have 'values' array property`,
                };
            }
            for (let j = 0; j < rule.values.length; j++) {
                const value = rule.values[j];
                if (!value.attribute || !value.value) {
                    return {
                        valid: false,
                        error: `Rule ${index}, value ${j}: Attribute values must have 'attribute' and 'value' properties`,
                    };
                }
            }
        }
    }
    return { valid: true };
}

function validateElementHidingDomains(domains) {
    if (!Array.isArray(domains)) {
        return { valid: true };
    }

    for (let i = 0; i < domains.length; i++) {
        const domain = domains[i];

        if (!domain.domain) {
            return {
                valid: false,
                error: `Domain ${i}: Missing required 'domain' property`,
            };
        }

        if (typeof domain.domain !== 'string' && !Array.isArray(domain.domain)) {
            return {
                valid: false,
                error: `Domain ${i}: 'domain' must be string or array of strings`,
            };
        }

        if (domain.rules) {
            const rulesValidation = validateElementHidingRulesOptimized(domain.rules);
            if (!rulesValidation.valid) {
                return {
                    valid: false,
                    error: `Domain ${i}: ${rulesValidation.error}`,
                };
            }
        }
    }

    return { valid: true };
}

export function createHybridValidator(schemaName) {
    const basicValidator = createValidator(schemaName);

    return function validate(config) {
        const basicResult = basicValidator(config);
        if (!basicResult) {
            return false;
        }

        if (config.features?.elementHiding?.settings) {
            const settings = config.features.elementHiding.settings;

            if (settings.rules) {
                const rulesValidation = validateElementHidingRulesOptimized(settings.rules);
                if (!rulesValidation.valid) {
                    validate.errors = [
                        {
                            instancePath: '/features/elementHiding/settings/rules',
                            message: rulesValidation.error,
                            params: {},
                        },
                    ];
                    return false;
                }
            }

            if (settings.domains) {
                const domainsValidation = validateElementHidingDomains(settings.domains);
                if (!domainsValidation.valid) {
                    validate.errors = [
                        {
                            instancePath: '/features/elementHiding/settings/domains',
                            message: domainsValidation.error,
                            params: {},
                        },
                    ];
                    return false;
                }
            }
        }

        return true;
    };
}
