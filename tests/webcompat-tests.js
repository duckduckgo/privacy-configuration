const expect = require('chai').expect;
const fs = require('fs');
const { createValidator, formatErrors } = require('./schema-validation');
const validateRoot = createValidator('WebCompatSettings');

const platforms = ['macos', 'ios', 'android'];
const latestConfigs = platforms.map((plat) => {
    return {
        name: `v4/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v4/${plat}-config.json`)),
    };
});

for (const config of latestConfigs) {
    describe(`validates the config settings for ${config.name}`, () => {
        it('should have valid webCompat setting', () => {
            const actual = validateRoot(config.body.features.webCompat.settings);
            expect(actual).to.be.equal(true, formatErrors(validateRoot.errors));
        });
    });
}
