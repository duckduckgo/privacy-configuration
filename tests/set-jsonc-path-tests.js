import { expect } from 'chai';
import { parseDotPath, parseJsonc, setJsoncAtPath } from '../scripts/set-jsonc-path.mjs';

describe('set-jsonc-path', () => {
    describe('parseDotPath', () => {
        it('returns an empty path for an empty string', () => {
            expect(parseDotPath('')).to.deep.equal([]);
        });

        it('parses property segments', () => {
            expect(parseDotPath('features.autofill.settings')).to.deep.equal([
                'features',
                'autofill',
                'settings',
            ]);
        });

        it('parses numeric segments as array indices', () => {
            expect(parseDotPath('exceptions.0.rules')).to.deep.equal([
                'exceptions',
                0,
                'rules',
            ]);
        });
    });

    describe('setJsoncAtPath', () => {
        const baseDocument = `{
    "_meta": {
        "description": "Explain the feature here."
    },
    "state": "disabled",
    "exceptions": []
}`;

        it('replaces a scalar value at the given path', () => {
            const result = setJsoncAtPath(baseDocument, 'state', '"enabled"');
            expect(parseJsonc(result, 'result').state).to.equal('enabled');
        });

        it('replaces an object at a nested path', () => {
            const document = `{
    "settings": {
        "foo": "bar"
    }
}`;
            const replacement = `{
    // updated config
    "foo": "baz"
}`;
            const result = setJsoncAtPath(document, 'settings', replacement);
            expect(parseJsonc(result, 'result').settings.foo).to.equal('baz');
        });

        it('replaces an array element by index', () => {
            const document = `{
    "exceptions": [
        { "domain": "a.com" },
        { "domain": "b.com" }
    ]
}`;
            const result = setJsoncAtPath(document, 'exceptions.1', '{ "domain": "c.com" }');
            expect(parseJsonc(result, 'result').exceptions[1].domain).to.equal('c.com');
        });

        it('preserves comments in the source file outside the replaced region', () => {
            const document = `{
    "settings": {
        "foo": "bar",
        // keep this source comment
        "patchSettings": []
    }
}`;
            const result = setJsoncAtPath(document, 'settings.foo', '"baz"');
            expect(result).to.include('// keep this source comment');
        });

        it('does not preserve comments in the stdin replacement input', () => {
            const document = `{
    "settings": {
        "extensionUrl": "https://example.com/old.crx"
    }
}`;
            const replacement = `{
    // updated today
    "extensionUrl": "https://example.com/new.crx"
}`;
            const result = setJsoncAtPath(document, 'settings', replacement);
            expect(result).not.to.include('// updated today');
            expect(parseJsonc(result, 'result').settings.extensionUrl).to.equal('https://example.com/new.crx');
        });

        it('throws when the path is not found', () => {
            expect(() => setJsoncAtPath(baseDocument, 'missing.path', '"x"')).to.throw('Path not found');
        });

        it('throws when stdin replacement is invalid JSONC', () => {
            expect(() => setJsoncAtPath(baseDocument, 'state', 'not json')).to.throw('Failed to parse stdin input');
        });

        it('throws when stdin replacement is empty', () => {
            expect(() => setJsoncAtPath(baseDocument, 'state', '   ')).to.throw('No JSONC data provided on stdin');
        });
    });
});
