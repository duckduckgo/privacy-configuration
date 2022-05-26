# DuckDuckGo Privacy Configuration

The configuration files within this repo are used by DuckDuckGo's Apps and Browser Extensions to control which privacy protections are enabled or disabled.

In some cases, privacy protections can cause conflicts that affect expected website functionality. Files in the `features` directory can be used to temporarily disable privacy protections or add exceptions for particular sites in order to restore expected site functionality.

All feature files contain an `exceptions` property which contains a list of sites on which a feature should be disabled to prevent breaking site functionality. Additionally there is an `overrides` directory which contains files that may add to these configurations for their respective platforms.
 
This repo also contains the code to build and deploy the configuration files.
 
These files (in the `generated` directory once buit) are served from: https://staticcdn.duckduckgo.com/trackerblocking/config/v2/...
 
**Deprecated Files**

Please note the files `trackers-unprotected-temporary.txt`, `trackers-whitelist-temporary.txt`, `protections.json`, `fingerprinting.json` in the `generated` directory are deprecated. These files are automatically generated and only used by legacy product versions.

## Contributing 
You may open an issue in this GitHub repo. We are not accepting outside pull requests in this repo at this time.

