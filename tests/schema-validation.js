const Ajv = require('ajv').default;
const ajv = new Ajv();
const schemaGenerator = require('ts-json-schema-generator');

function createGenerator() {
    try {
        return schemaGenerator.createGenerator({
            path: './schema/config.d.ts',
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
