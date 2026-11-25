import { isPlainObject } from '../../../util.js';
import { MAX_READ_CACHE_MAX_AGE_MS } from '../../../web-detection-util.js';
import { ruleLink } from './context.js';

/**
 * Errors on the `readCacheMaxAgeMs` setting, and on the values `conditionalChanges` patches give it:
 * `null`, or an integer from 0 to the cap.
 *
 * @param {Record<string, any> | undefined} settings - `webDetection` settings
 * @returns {string[]}
 */
export function readCacheMaxAgeMsErrors(settings) {
    if (!isPlainObject(settings)) return [];
    /** @type {string[]} */
    const errors = [];
    /**
     * @param {unknown} value
     * @param {string} label
     */
    const check = (value, label) => {
        if (value === null) return;
        if (!Number.isInteger(value) || /** @type {number} */ (value) < 0 || /** @type {number} */ (value) > MAX_READ_CACHE_MAX_AGE_MS)
            errors.push(
                `${label}: \`readCacheMaxAgeMs\` is null or an integer from 0 to ${MAX_READ_CACHE_MAX_AGE_MS}, and is ${JSON.stringify(value)}${ruleLink('featureSettings')}`,
            );
    };
    if ('readCacheMaxAgeMs' in settings) check(settings.readCacheMaxAgeMs, 'settings');
    (settings.conditionalChanges ?? []).forEach((/** @type {Record<string, any>} */ entry, /** @type {number} */ index) => {
        for (const operation of entry.patchSettings ?? []) {
            if (operation.path === '/readCacheMaxAgeMs' && (operation.op === 'add' || operation.op === 'replace'))
                check(operation.value, `conditionalChanges[${index}]`);
        }
    });
    return errors;
}
