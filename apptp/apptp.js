const fs = require('fs')
const path = require('path');

const LISTS_DIR = path.join(__dirname, `allowlists`)

function generateAppTPConfig(generated_dir) {
    // Get base file
    let baseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, `apptp.json`)))

    // Grab all exception lists
    const jsonListNames = fs.readdirSync(LISTS_DIR)
    for (const jsonList of jsonListNames) {
        const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
        const configKey = jsonList.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, function (g) { return g[1].toUpperCase() })

        delete listData._meta
        baseConfig.lists[configKey] = listData
    }
    console.log(baseConfig)
    fs.writeFileSync(`${generated_dir}/v2/apptp-config.json`, JSON.stringify(baseConfig, null, 4))
}

module.exports = {
    generateAppTPConfig: generateAppTPConfig
}
