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

        it('keeps numeric segments as strings', () => {
            expect(parseDotPath('buckets.0.gte')).to.deep.equal([
                'buckets',
                '0',
                'gte',
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

        it('replaces a value at a numeric object key', () => {
            const document = `{
    "buckets": {
        "0": { "gte": 0, "lt": 1 }
    }
}`;
            const result = setJsoncAtPath(document, 'buckets.0.gte', '1');
            expect(parseJsonc(result, 'result').buckets['0'].gte).to.equal(1);
        });

        it('replaces a value at a hyphenated object key', () => {
            const document = `{
    "buckets": {
        "2-3": { "gte": 2, "lt": 4 }
    }
}`;
            const result = setJsoncAtPath(document, 'buckets.2-3.gte', '3');
            expect(parseJsonc(result, 'result').buckets['2-3'].gte).to.equal(3);
        });

        it('replaces a value in safariVersionMappings', () => {
            const document = `{
    "safariVersionMappings": {
        "26": "18_6"
    }
}`;
            const result = setJsoncAtPath(document, 'safariVersionMappings.26', '"18_7"');
            expect(parseJsonc(result, 'result').safariVersionMappings['26']).to.equal('18_7');
        });

        it('does not support array indices', () => {
            const document = `{
    "exceptions": [
        { "domain": "a.com" }
    ]
}`;
            expect(() => setJsoncAtPath(document, 'exceptions.0.domain', '"b.com"')).to.throw('Path not found');
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
