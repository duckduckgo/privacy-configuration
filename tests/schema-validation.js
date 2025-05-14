import Ajv from 'ajv';
import schemaGenerator from 'ts-json-schema-generator';
const ajv = new Ajv({ allowUnionTypes: true });

function createGenerator() {
    try {
        return schemaGenerator.createGenerator({
            path: './schema/config.ts',
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

export function formatErrors(errors) {
    if (!Array.isArray(errors)) {
        return '';
    }

    return errors.map((item) => `${item.instancePath}: ${item.message}`).join(', ');
}
