const Ajv = require('ajv').default
const ajv = new Ajv()
const createGenerator = require('ts-json-schema-generator').createGenerator

const fullSchemaGenerator = createGenerator({
    path: './schema/config.d.ts'
})

/**
 * Generate the JSONSchema for the named TS type
 * @param {import('../schema/config').SupportedSchemas} schemaName
 */
function getSchema (schemaName) {
    return fullSchemaGenerator.createSchema(schemaName)
}

/**
 * Generate a validator for checking JSON objects against the named TS type
 * @param {import('../schema/config').SupportedSchemas} schemaName
 */
function createValidator (schemaName) {
    return ajv.compile(getSchema(schemaName))
}

function formatErrors (errors) {
    if (!Array.isArray(errors)) {
        return ''
    }

    return errors.map(item => `${item.instancePath}: ${item.message}`).join(', ')
}

module.exports = {
    getSchema,
    createValidator,
    formatErrors
}
