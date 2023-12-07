const fs = require('fs')
const Constants = require('../constants')
const parseArgs = require('minimist')
const chalk = require('chalk')

if (!fs.existsSync(Constants.GENERATED_DIR) || fs.readdirSync(Constants.GENERATED_DIR).length === 0) {
    console.error(chalk.red('Error: Generated directory is empty. Please run `node index.js` first.'))
    process.exit(1)
}

const args = parseArgs(process.argv.slice(2))

if (args._.includes('help')) {
    console.log('Usage: node scripts/feature-info.js -p <platform> -f <feature> -v <version> -e')
    console.log('  This script will display the state of features in the conifg')
    console.log('  All flags are optional')
    console.log('  The latest config version will be used if no version is specified')
    console.log('  If no platform is specified, all platforms will be listed')
    console.log('  If no feature is specified, all features will be listed')
    console.log('  If -e is specified, the script will also display the exceptions for each feature')
    process.exit(0)
}

const checkPlatform = args.p
const checkFeature = args.f
const showExceptions = args.e
let version = args.v
if (version === undefined) {
    version = Constants.CURRENT_CONFIG_VERSION
} else {
    if (typeof version === 'string' && version.startsWith('v')) {
        version = parseInt(version.split('v')[1])
    }
}

console.log('Config Version:', chalk.bold(`v${version}`))

const directories = fs.readdirSync(Constants.GENERATED_DIR)
const dir = directories.find(dir => dir === `v${version}`)

if (dir === undefined) {
    console.error(chalk.red('Error: Version', chalk.bold(`v${version}`), 'not found'))
    process.exit(1)
}

const files = fs.readdirSync(`${Constants.GENERATED_DIR}/${dir}`)
files.forEach(file => {
    if (checkPlatform !== undefined && !file.startsWith(checkPlatform)) {
        return
    }

    const platformName = file.startsWith('extension') ? file.split('-')[1] : file.split('-')[0]
    console.log('Platform: ' + chalk.bold(`${platformName}`))

    const jsonContent = JSON.parse(fs.readFileSync(`${Constants.GENERATED_DIR}/${dir}/${file}`, 'utf8'))
    Object.keys(jsonContent.features).forEach(feature => {
        if (checkFeature !== undefined && feature !== checkFeature) {
            return
        }

        const featureState = jsonContent.features[feature].state
        if (featureState !== 'disabled') {
            console.log(`  - ${feature}: ` + chalk.green.bold(`${featureState}`))
        } else {
            console.log(`  - ${feature}: ` + chalk.red.bold(`${featureState}`))
        }

        if (jsonContent.features[feature].features !== undefined) {
            console.log('    Sub-Features:')

            const subFeatures = jsonContent.features[feature].features
            Object.keys(subFeatures).forEach(subFeature => {
                const subFeatureState = subFeatures[subFeature].state
                if (subFeatureState !== 'disabled') {
                    console.log(`    - ${subFeature}: ` + chalk.green.bold(`${subFeatureState}`))
                } else {
                    console.log(`    - ${subFeature}: ` + chalk.red.bold(`${subFeatureState}`))
                }
            })
        }

        if (showExceptions) {
            console.log('    Exceptions:')
            const featureExceptions = jsonContent.features[feature].exceptions
            if (featureExceptions !== undefined) {
                featureExceptions.forEach(exception => {
                    console.log(`      - ${exception.domain}`)
                })
            }
        }
    })
})
