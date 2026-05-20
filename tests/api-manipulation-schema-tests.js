import { expect } from 'chai';
import { createValidator, formatErrors } from './schema-validation.js';

function createConfig(apiChange) {
    return {
        readme: 'apiManipulation schema test',
        version: 1,
        unprotectedTemporary: [],
        features: {
            apiManipulation: {
                state: 'enabled',
                exceptions: [],
                hash: '',
                settings: {
                    apiChanges: {
                        'Navigator.prototype.testAPI': apiChange,
                    },
                },
            },
        },
    };
}

describe('ApiManipulation schema tests', () => {
    const validate = createValidator('CurrentGenericConfig');

    it('accepts value descriptors with explicit descriptor targets', () => {
        const config = createConfig({
            type: 'descriptor',
            target: 'existing',
            value: {
                type: 'function',
                functionName: 'noop',
            },
        });
        expect(validate(config)).to.equal(true, formatErrors(validate.errors));
    });

    it('accepts accessor descriptors with getterValue and setterValue', () => {
        const config = createConfig({
            type: 'descriptor',
            getterValue: {
                type: 'undefined',
            },
            setterValue: {
                type: 'function',
                functionName: 'noop',
            },
        });
        expect(validate(config)).to.equal(true, formatErrors(validate.errors));
    });

    it('accepts service area settings', () => {
        const config = createConfig({
            type: 'descriptor',
            getterValue: {
                type: 'undefined',
            },
        });
        config.features.apiManipulation.settings.serviceAreas = {
            mediaDevicesDeviceChangeEvents: 'enabled',
        };
        expect(validate(config)).to.equal(true, formatErrors(validate.errors));
    });

    it('rejects mixed accessor and value descriptor shapes', () => {
        const config = createConfig({
            type: 'descriptor',
            getterValue: {
                type: 'undefined',
            },
            value: {
                type: 'function',
                functionName: 'noop',
            },
        });
        expect(validate(config)).to.equal(false);
    });

    it('rejects descriptors without getterValue, setterValue, or value', () => {
        const config = createConfig({
            type: 'descriptor',
        });
        expect(validate(config)).to.equal(false);
    });

    it('rejects descriptors that mix target with deprecated define', () => {
        const config = createConfig({
            type: 'descriptor',
            target: 'missing',
            define: true,
            value: {
                type: 'function',
                functionName: 'noop',
            },
        });
        expect(validate(config)).to.equal(false);
    });
});
