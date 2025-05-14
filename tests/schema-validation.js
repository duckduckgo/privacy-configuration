const Ajv = require('ajv').default;
const ajv = new Ajv({ allowUnionTypes: true });
const schemaGenerator = require('ts-json-schema-generator');

function createGenerator() {
    try {
        const path = require('path').resolve(__dirname, '../schema/config.ts');
        return schemaGenerator.createGenerator({
            path
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
function getSchema(schemaName) {
    return createGenerator().createSchema(schemaName);
}

/**
 * Generate a validator for checking JSON objects against the named TS type
 * @param {import('../schema/config').ExportedSchemas} schemaName
 */
function createValidator(schemaName) {
    return ajv.compile(getSchema(schemaName));
}

function formatErrors(errors) {
    if (!Array.isArray(errors)) {
        return '';
    }

    return errors.map((item) => `${item.instancePath}: ${item.message}`).join(', ');
}

module.exports = {
    getSchema,
    createValidator,
    formatErrors,
};
