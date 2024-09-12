import Ajv from 'ajv'
import { createGenerator } from 'ts-json-schema-generator'
import path from 'path'
import fs from 'fs'

const repoRoot = process.cwd()
const ajv = new Ajv()

const platformSpecificSchemas = {
    'android-config.json': 'AndroidV4Config'
}

const v4configRoot = path.join(repoRoot, 'generated', 'v4')
for (const platformConfig of fs.readdirSync(v4configRoot)) {
    // create schema and validator for this config
    const schema = createGenerator({
        path: path.join(repoRoot, 'schema', 'config.d.ts')
    }).createSchema(platformSpecificSchemas[platformConfig] || 'GenericV4Config')
    const validate = ajv.compile(schema)
    const config = JSON.parse(fs.readFileSync(path.join(v4configRoot, platformConfig)))
    console.log('Checking', platformConfig)
    const result = validate(config)
    if (!result) {
        console.log(validate.errors)
        break
    } else {
        console.log('OK')
    }
}
