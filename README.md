# DuckDuckGo Privacy Configuration

The configuration files within this repo are used by DuckDuckGo's Apps and Browser Extensions and control which privacy protections are enabled or disabled.

In some cases, privacy protections can cause conflicts that affect expected website functionality. `features` can be used to temporarily disable privacy protections in order to restore expected site functionality.
 
This repo also contains code to build and deploy the configuration files.
 
These files (in the `generated` directory) are served from: https://staticcdn.duckduckgo.com/trackerblocking/config/v1/...
 
**Adding unprotected entries**

To add an unprotected entry manually, update the `exceptions` of `features/unprotected-temporary.json`.
 
**Deprecated Files**

Please note the files `trackers-unprotected-temporary.txt`, `trackers-whitelist-temporary.txt`, `protections.json`, `fingerprinting.json` in the `generated` directory are deprecated. These files are automatically generated and only used by legacy product versions.

## Contributing 
You may open an issue in this GitHub repo or open a pull request.

