const fs = require('fs')
const path = require('path')

const LISTS_DIR = path.join(__dirname, 'allowlists')

function generateAppTPConfig (generatedDir) {
    // Get base file
    const baseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'apptp.json')))

    // Add version
    baseConfig.version = Date.now()

    // Grab all exception lists
    const jsonListNames = fs.readdirSync(LISTS_DIR)
    for (const jsonList of jsonListNames) {
        const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
        const configKey = jsonList.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, function (g) { return g[1].toUpperCase() })

        delete listData._meta
        baseConfig.lists[configKey] = listData
    }
    fs.writeFileSync(`${generatedDir}/v2/apptp-config.json`, JSON.stringify(baseConfig, null, 4))
}

module.exports = {
    generateAppTPConfig: generateAppTPConfig
}
