const fs = require('fs')
const path = require('path')
const jsonpatch = require('fast-json-patch')

function readJsonFile (filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function writeJsonFile (filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
}

function createPatch (sourceData, targetData) {
    return jsonpatch.compare(sourceData, targetData)
}

function dasherize (string) {
    return string.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()
}

function camelCase (string) {
    return string.replace(/-([a-z0-9])/g, g => g[1].toUpperCase())
}

async function main () {
    const sourceDir = 'generated/v2'
    const targetDir = 'features'
    const patchDir = 'patch_directory'

    if (!fs.existsSync(patchDir)) {
        fs.mkdirSync(patchDir, { recursive: true })
    }

    const features = {}
    const featureFiles = fs.readdirSync(targetDir).filter(file => file.endsWith('.json'))
    for (const featureFile of featureFiles) {
        features[camelCase(featureFile.slice(0, -5))] = readJsonFile(path.join(targetDir, featureFile))
    }
    const featurePatches = {}
    const platformEnding = '-config.json'
    const sourceFiles = fs.readdirSync(sourceDir).filter(file => file.endsWith(platformEnding))
    for (const sourceFile of sourceFiles) {
        const platform = sourceFile.slice(0, platformEnding.length * -1)
        const sourceData = readJsonFile(path.join(sourceDir, sourceFile))
        for (const [feature, data] of Object.entries(sourceData.features)) {
            delete data.hash
            if (!features[feature]) {
                console.error('Feature not found: ' + feature)
                continue
            }
            const targetData = JSON.parse(JSON.stringify(features[feature]))
            delete targetData._meta
            if (!('state' in targetData)) {
                targetData.state = 'disabled'
            }
            for (const exception of targetData.exceptions) {
                if ('reason' in exception) {
                    if (Array.isArray(exception.reason)) {
                        exception.reason = exception.reason.join(' ')
                        console.log(exception)
                    }
                }
            }
            const patch = createPatch(targetData, data)
            if (!featurePatches[feature]) {
                featurePatches[feature] = {}
            }
            if (patch.length === 0) continue
            featurePatches[feature][platform] = patch
        }
    }
    const overrideExtensions = [
        'extension-chrome',
        'extension-firefox',
        'extension-brave',
        'extension-edge',
        'extension-edg',
        'extension-bravemv3',
        'extension-chromemv3',
        'extension-safarimv3',
        'extension-edgmv3'
    ]
    const allPlatforms = [
        'android',
        'ios',
        'macos',
        'windows',
        'extension',
        ...overrideExtensions
    ]
    // Prune and clean data
    for (const [feature, data] of Object.entries(featurePatches)) {
        // Check if all platforms data matches
        const firstPlatform = Object.keys(allPlatforms)[0]
        const firstPlatformData = data[firstPlatform]
        let allMatches = true
        for (const platform of allPlatforms) {
            if (platform === firstPlatform) continue
            if (!data[platform] || JSON.stringify(data[platform]) !== JSON.stringify(firstPlatformData)) {
                allMatches = false
            }
        }
        if (allMatches) {
            featurePatches[feature] = {
                all: firstPlatformData
            }
        }

        for (const platform of allPlatforms) {
            if (!data[platform]) continue
            for (const patch of data[platform]) {
                if (patch.op === 'add' && patch.path.startsWith('/exceptions')) {
                    patch.path = '/exceptions/-'
                }
            }
            data[platform] = data[platform].filter(patch => {
                if (patch.op === 'replace' && patch.path.startsWith('/settings/allowlistedTrackers/')) {
                    return false
                }
                return true
            })
        }

        // Check override extensions have the same patch as extension
        for (const overrideExtension of overrideExtensions) {
            if (!data[overrideExtension]) continue
            // Check if patch is the same as extension
            const extensionPatch = data.extension
            if (!extensionPatch) continue
            const overrideExtensionPatch = data[overrideExtension]
            data[overrideExtension] = overrideExtensionPatch.filter(patch => {
                let patchExists = false
                for (const extensionPatchItem of extensionPatch) {
                    if (JSON.stringify(extensionPatchItem) === JSON.stringify(patch)) {
                        patchExists = true
                        break
                    }
                }
                return !patchExists
            })
          }

          for (const platform of allPlatforms) {
            if (!data[platform]) continue
            // Check if patch is empty
            if (data[platform].length === 0) {
              delete data[platform]
            }
          }

        // Check if patch exists for all platforms
        if (Object.keys(data).length === 0) {
          delete featurePatches[feature]
        }
    }
    writeJsonFile(path.join(patchDir, 'feature_patches.json'), featurePatches)

    for (const [feature, data] of Object.entries(featurePatches)) {
        const out = features[feature]
        out._patches = data
        writeJsonFile(path.join(targetDir, dasherize(feature) + '.json'), out)
    }
}

main()
