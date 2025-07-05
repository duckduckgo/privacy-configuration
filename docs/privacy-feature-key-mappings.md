# Privacy Feature Key Mappings

This document maps each privacy feature key in the remote config to its corresponding privacy feature and lists the platforms supported by each key.

## Feature Key → Privacy Feature

- **autofill** → [Autofill](https://app.asana.com/0/1198964220583541/1198961984784193/f)
  - Supported: All
- **autoconsent** → [Autoconsent](https://app.asana.com/0/1201844467387842/list)
  - Supported: macOS, Windows, iOS, Android
- **referrer** → [Referrer](https://app.asana.com/0/1200606622205980/1201057222436431/f)
  - Supported: Extensions for document.referrer (not header trimming)
- **clickToPlay** → [Click to Play](https://app.asana.com/0/1198207348643509/1199651947726592/f)
  - Supported: Extension, macOS
- **https** → [HTTPS](https://app.asana.com/0/0/1199103718890894)
  - Supported: All (except macOS and iOS. See [exception](https://app.asana.com/0/0/1201287926785318))
  - TODO: Confirm Android doesn't appear to check exceptions, user list, or temp list.
- **contentBlocking** → [Content Blocking 1](https://app.asana.com/0/1198207348643509/1199103718890844/f), [Content Blocking 2](https://app.asana.com/0/1198207348643509/1199093921854088/f)
  - Supported: All
- **customUserAgent** → [Custom User Agent](https://app.asana.com/0/1198207348643509/1205259295535506/f)
  - Supported: iOS, Android, macOS
- **trackerAllowlist** → [Tracker Allowlist](https://app.asana.com/0/0/1200434943367884)
  - Supported: Extensions, iOS, Android
  - TODO: Confirm Android doesn't appear to check exceptions, user list, or temp list.
- **trackingCookies3p** → [3rd Party Tracking Cookies](https://app.asana.com/0/1198207348643509/1199093921854081/f)
  - Supported: Extensions
- **trackingCookies1p** → [1st Party Tracking Cookies](https://app.asana.com/0/1198207348643509/1200040513378697/f)
  - Supported: Extensions
- **fingerprintingCanvas** → [Fingerprinting: Canvas](https://app.asana.com/0/1198207348643509/1199583771657237/f)
  - Supported: Extensions
- **fingerprintingAudio** → [Fingerprinting: Audio](https://app.asana.com/0/1198207348643509/1199583771657237/f)
  - Supported: Extensions
- **fingerprintingTemporaryStorage** → [Fingerprinting: Temporary Storage](https://app.asana.com/0/1198207348643509/1199583771657237/f)
  - Supported: Extensions, iOS
- **fingerprintingScreenSize** → [Fingerprinting: Screen Size](https://app.asana.com/0/1198207348643509/1199583771657237/f)
  - Supported: Extensions, iOS
- **fingerprintingHardware** → [Fingerprinting: Hardware](https://app.asana.com/0/1198207348643509/1199583771657237/f)
  - Supported: Extensions
- **fingerprintingBattery** → [Fingerprinting: Battery](https://app.asana.com/0/1198207348643509/1199583771657237/f)
  - Supported: Extensions, iOS
- **floc** → [FLoC](https://app.asana.com/0/0/1200536527801992)
  - Supported: Extensions (legacy v1)
- **googleRejected** → [Google Rejected](https://app.asana.com/0/0/1201719300245228)
  - Supported: Extensions
- **userAgentRotation** → [User Agent Rotation](https://app.asana.com/0/1198207348643509/1199093921854075/f)
  - Supported: Not
- **gpc** → [GPC](https://app.asana.com/0/1198207348643509/1199115248606508/f)
  - Supported: All
  - iOS and macOS use 'gpcHeaderEnabledSites' for headers
- **navigatorCredentials** → [Navigator Credentials](https://app.asana.com/0/1200437802575119/1201288740667760/f)
  - Supported: macOS
- **ampLinks** → [AMP Links](https://app.asana.com/0/0/1201460259279674)
  - Supported: All
- **trackingParameters** → [Tracking Parameters](https://app.asana.com/0/0/1201469937577208)
  - Supported: All
- **appTrackerProtection** → [App Tracker Protection](https://app.asana.com/0/1198207348643509/1201492213021656/f)
  - Supported: Android
- **privacyPro** → [Privacy Pro: Subscriptions Availability](https://app.asana.com/0/0/1206820386373649/f)

---

## See Also

- [Config Maintainer Documentation](./config-maintainer-documentation.md)
- [Config Reviewer Documentation](./config-reviewer-documentation.md)
- [Feature Implementer Documentation](./feature-implementer-documentation.md)
- [🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists](./implementation-guidelines-remote-privacy-configuration-allowlists.md)
- [Incremental Rollout Implementation Guide](./incremental-rollout-implementation-guide.md)
- [Writing a Schema for Your Config Feature](./writing-schema-for-config-feature.md)
- [Remote Configuration Change Log](./remote-configuration-change-log.md)
