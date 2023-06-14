# DuckDuckGo Privacy Configuration

The configuration files within this repo are used by DuckDuckGo's Apps and Browser Extensions to control which privacy protections are enabled or disabled.

In some cases, privacy protections can cause conflicts that affect expected website functionality. Files in the `features` directory can be used to temporarily disable privacy protections or add exceptions for particular sites in order to restore expected site functionality.

All feature files contain an `exceptions` property which contains a list of sites on which a feature should be disabled to prevent breaking site functionality. Additionally there is an `overrides` directory which contains files that may add to these configurations for their respective platforms.

This repo also contains the code to build and deploy the configuration files.
These files (in the `generated` directory once built) are served from
https://staticcdn.duckduckgo.com/trackerblocking/config/v2/...

Please see the [Related Resources](#Related-Resources) section for a list of
files used by each platform.

**Deprecated Files**

Please note the files `trackers-unprotected-temporary.txt`,
`trackers-whitelist-temporary.txt`, `protections.json`, and
`fingerprinting.json` in the `generated` directory, as well as `v1` config
files, are deprecated. These files are automatically generated and only used by
legacy product versions.

**Adding Unprotected Entries**

 Unprotected entries will disable all protections on a given site. This is only used in cases of severe web breakage where a root cause cannot be determined. To add an unprotected entry manually, update the `exceptions` of `features/unprotected-temporary.json`.

## Related Resources

- Apps and extensions using the privacy configuration:
  - [iOS app](https://github.com/duckduckgo/iOS)
    - [ios-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/ios-config.json)
  - [Android app](https://github.com/duckduckgo/Android)
    - [android-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/android-config.json)
  - [WebExtension](https://github.com/duckduckgo/duckduckgo-privacy-extension) (for Chrome, Firefox, Edge, Brave, and Opera)
    - [extension-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/extension-config.json)
    - [extension-chrome-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/extension-chrome-config.json)
    - [extension-firefox-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/extension-firefox-config.json)
    - [extension-edge-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/extension-edge-config.json)
    - [extension-brave-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/extension-brave-config.json)
  - [Safari extension](https://github.com/duckduckgo/privacy-essentials-safari)
    - The Safari extension has only partial remote configuration support, and uses
      [trackers-unprotected-temporary.txt](https://staticcdn.duckduckgo.com/trackerblocking/config/trackers-unprotected-temporary.txt)
  - Mac app (in beta, code not yet open source)
    - [macos-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/macos-config.json)
  - Windows app (in beta, code not yet open source)
    - [windows-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v2/windows-config.json)

## Licensing

Copyright 2022 Duck Duck Go, Inc.

DuckDuckGo Privacy Configuration is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
If you'd like to license the source for commercial use, [please reach out](https://help.duckduckgo.com/duckduckgo-help-pages/company/contact-us/).

## Questions

- **Why do some exceptions have more documentation than others?** A review of
    existing systems is ongoing to make this repository the central location for
    exceptions and bring documentation and mitigations up-to-date. We're looking
    to complete this by Winter, 2022.

- **How can I contribute to this repository?** If you suspect any website
    usability issues or breakage, or have concerns about what is/isn't blocked,
    please [open an issue](https://github.com/duckduckgo/privacy-configuration/issues/new).

    We are not accepting external pull requests at this time.
SAMPLE README CHANGE
