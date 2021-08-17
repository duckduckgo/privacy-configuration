# DuckDuckGo Privacy Configuration

This repo hosts the configuration files used by DuckDuckGo's apps and Browser Extesnions to control which privacy features are enabled and disabled.
Additionally the configuration files contain exception lists where certain (or all) privacy protections are temporarily disabled due to site breakage issues
caused by our protections. The reasons for these exceptions are generally caused by cases where a website tightly integrates 3rd party trackers into 
their site's functionality. Reasons for these exceptions are inlcuded in these configuration files.

This repo also contains code to build and deploy the configuration files.

These files (in the `generated` directory) are served from: https://staticcdn.duckduckgo.com/trackerblocking/config/v1/...

**Adding unprotected entries**

To add a manual unprotected entry update the `tempUnprotectedDomains` of `exception-lists/trackers-unprotected-temporary.json`.

**Deprecated Files**

Please note the files `trackers-unprotected-temporary.txt, trackers-whitelist-temporary.txt, protections.json, fingerprinting.json` in the
`generated` directory are deprecated. These files are automatically generated and only used by legacy product versions.

## Contributing
You may open an issue in this GitHub repo or open a pull request.

