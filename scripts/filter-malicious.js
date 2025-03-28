const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch').default;
const crypto = require('crypto');

class ConfigProcessor {
    constructor(options = {}) {
        this.apiBaseUrl = options.apiBaseUrl || 'https://duckduckgo.com/api/protection/v2';
        this.outputPath = options.outputPath || 'generated/v4/';
        this.inputPath = options.inputPath || 'overrides/';
        this.defaultConfig = options.defaultConfig || 'features/malicious-site-protection.json';
        this.platforms = [
            { name: 'ios', configFile: 'ios-config.json', overrideFile: 'ios-override.json' },
            { name: 'macos', configFile: 'macos-config.json', overrideFile: 'macos-override.json' },
            { name: 'windows', configFile: 'windows-config.json', overrideFile: 'windows-override.json' },
            { name: 'android', configFile: 'android-config.json', overrideFile: 'android-override.json' },
        ];
    }

    generateHashPrefix(domain) {
        return crypto.createHash('sha256').update(domain).digest('hex').slice(0, 4);
    }

    async loadConfig(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error loading config ${filePath}:`, error.message);
            return null;
        }
    }

    async saveConfig(filePath, config) {
        try {
            await fs.writeFile(filePath, JSON.stringify(config, null, 4), 'utf8');
        } catch (error) {
            console.error(`Error saving config ${filePath}:`, error.message);
        }
    }

    /* 
        Is this domain still in our dataset? 
        If not, we can safely remove it from the config.
    */
    async checkDomainMatch(domain, platform) {
        const hashPrefix = this.generateHashPrefix(domain);
        const url = `${this.apiBaseUrl}/${platform}/matches?hashPrefix=${hashPrefix}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return false;

            const data = await response.json();
            return (data.matches || []).some((match) => match.hostname === domain);
        } catch (error) {
            console.error(`Domain check failed for ${domain}:`, error.message);
            return false;
        }
    }

    /*
        For each built configuration, check if any exceptions are no longer in our dataset.
        And update the local configs accordingly to remove them everywhere.
    */
    async processConfigurations() {
        let anyUpdates = false;
        const removedDomains = new Set();
        let prBody = `This PR removes stale exemptions from the malicious site protection feature. `;
        prBody += `Domains that are not longer in our dataset can be safely removed.\\n\\n`;
        prBody += `Removed domains:\\n`;

        for (const platform of this.platforms) {
            const configPath = path.join(this.outputPath, platform.configFile);
            const config = await this.loadConfig(configPath);

            if (!config?.features?.maliciousSiteProtection) {
                continue;
            }

            const exceptions = config.features.maliciousSiteProtection.exceptions || [];
            // Check for stale exceptions
            const [updatedExceptions, removedExceptions] = await this.getUpdatedExceptions(exceptions, platform.name);

            // Add removed domains to the PR body
            removedExceptions.forEach((exception) => {
                removedDomains.add(exception.domain);
            });

            // Update platform config if any exceptions were removed
            anyUpdates = (await this.updateOverrideConfig(updatedExceptions, platform)) || anyUpdates;

            // Update default config as well
            anyUpdates = (await this.updateDefaultConfig(updatedExceptions)) || anyUpdates;
        }

        if (!anyUpdates) {
            console.log('No updates were made to any configurations.');
            return;
        }

        removedDomains.forEach((domain) => {
            prBody += ` - ${domain}\\n`;
        });
        console.log(prBody);
    }

    /*
        Check if each exception domain is still in our dataset.
        If it is, add it to the updated exceptions.
    */
    async getUpdatedExceptions(exceptions, platformName) {
        const updatedExceptions = [];
        const removedExceptions = [];
        for (const exception of exceptions) {
            const inDataset = await this.checkDomainMatch(exception.domain, platformName);
            if (inDataset) {
                updatedExceptions.push(exception);
            } else {
                removedExceptions.push(exception);
            }
        }
        return [updatedExceptions, removedExceptions];
    }

    /*
        Update the platform override config with the removed exceptions.
    */
    async updateOverrideConfig(updatedExceptions, platform) {
        const overridePath = path.join(this.inputPath, platform.overrideFile);
        const overrideConfig = await this.loadConfig(overridePath);
        if (overrideConfig?.features?.maliciousSiteProtection?.exceptions) {
            const updatedOverrideExceptions = overrideConfig.features.maliciousSiteProtection.exceptions.filter((exception) => {
                return updatedExceptions.some((updated) => updated.domain === exception.domain);
            });
            if (updatedOverrideExceptions.length !== overrideConfig.features.maliciousSiteProtection.exceptions.length) {
                overrideConfig.features.maliciousSiteProtection.exceptions = updatedOverrideExceptions;
                await this.saveConfig(overridePath, overrideConfig);
                return true;
            }
        }
        return false;
    }

    /*
        Update the default config with the removed exceptions.
    */
    async updateDefaultConfig(updatedExceptions) {
        const defaultConfig = await this.loadConfig(this.defaultConfig);
        if (defaultConfig?.exceptions) {
            const updatedDefaultExceptions = defaultConfig.exceptions.filter((exception) => {
                return updatedExceptions.some((updated) => updated.domain === exception.domain);
            });
            if (updatedDefaultExceptions.length !== defaultConfig.exceptions.length) {
                defaultConfig.exceptions = updatedDefaultExceptions;
                await this.saveConfig(this.defaultConfig, defaultConfig);
                return true;
            }
        }
        return false;
    }
}

async function main() {
    const processor = new ConfigProcessor();
    await processor.processConfigurations();
}

main().catch(console.error);