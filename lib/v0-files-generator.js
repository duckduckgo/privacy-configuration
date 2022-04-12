import fs from 'fs'
import constants from './constants.js'

const unprotectedDomains = new Set()

export function addExceptionsToUnprotected (exceptions) {
    for (const exception of exceptions) {
        unprotectedDomains.add(exception.domain)
    }
    return exceptions.map((obj) => obj.domain)
}

export function generateLegacyFiles (platformConfigs) {
    const legacyTextDomains = [...unprotectedDomains].join('\n')
    fs.writeFileSync(`${constants.GENERATED_DIR}/trackers-unprotected-temporary.txt`, legacyTextDomains)
    fs.writeFileSync(`${constants.GENERATED_DIR}/trackers-whitelist-temporary.txt`, legacyTextDomains)
    const legacyNaming = {
        fingerprintingCanvas: 'canvas',
        trackingCookies3p: 'cookie',
        fingerprintingAudio: 'audio',
        fingerprintingTemporaryStorage: 'temporary-storage',
        referrer: 'referrer',
        fingerprintingBattery: 'battery',
        fingerprintingScreenSize: 'screen-size',
        fingerprintingHardware: 'hardware',
        floc: 'floc',
        gpc: 'gpc',
        autofill: 'autofill'
    }
    const protections = {}
    for (const key in legacyNaming) {
        const feature = platformConfigs.extension.features[key]
        const legacyConfig = {
            enabled: feature.state === 'enabled',
            sites: feature.exceptions.map((obj) => obj.domain),
            scripts: []
        }
        protections[legacyNaming[key]] = legacyConfig
    }
    fs.writeFileSync(`${constants.GENERATED_DIR}/protections.json`, JSON.stringify(protections, null, 4))
    fs.writeFileSync(`${constants.GENERATED_DIR}/fingerprinting.json`, JSON.stringify(protections, null, 4))
}
