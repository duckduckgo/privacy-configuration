# Data Broker Rubric

This rubric represents the rules we use to evaluate whether Personal Information Removal (PIR) can support certain brokers, developed around core rules (like over-sharing personal data to brokers) and core functionality (supported CAPTCHAs, etc).

All past and current broker sites that were and are being evaluated are listed in [Unsupported Data Broker Sites](./unsupported-data-broker-sites.md).

> **Warning**
> This is a living document, and intended to change over time to reflect the updates we make to the product, and the evolution of the brokers themselves.

## How to Evaluate

The evaluation should center on end-to-end manual scans and removals, confirming the broker is actually honouring them before any code is written.

When testing:

- Ensure you're using **multiple states**, since the CCPA can make the opt-out rules (and thereby the opt-out steps) different.
- Use a **variety of email domains** including:
  - Major email providers (Outlook, Gmail, etc.)
  - Temporary email domains (duck.com)
  - Custom domains (official for this within DuckDuckGo is TBD)
- Work through the tiers below. If any required criterion fails, document the reason in [Unsupported Data Broker Sites](./unsupported-data-broker-sites.md).

---

## Tier 1

### Connectivity

| Criterion | Description |
|---|---|
| **Broker Loads** | Does the broker URL load in the browser? |
| **Same Search Domain** | Does a search results page load with the same URL? |

> **Note:** If not the same domain, this is likely a mirror site.

### Search Results

| Criterion | Description |
|---|---|
| **Allows Search** | Allows searching people by name, city, state (and optional age) |

> **Note:** PIR only allows searching by name, city, state (and optional age range).

### Opt Out

| Criterion | Description |
|---|---|
| **Non-sensitive** | Broker has an opt-out form that only uses non-sensitive information: name, email, city, state, profile URL, or any of the data we can generate (see below) |

PIR can generate the following data for opt-out forms:

- A fake phone number
- A fake zip code
- A fake street address
- A 1x1px fake image

> **Note:** PIR only has limited info about the user and we aren't willing to hand over a lot of user information to data brokers.

---

## Tier 2

### Opt Out

| Criterion | Description |
|---|---|
| **Form or Search** | Opt out can be accessed as a standalone page, or by searching with non-sensitive info (name, email, city, state) |
| **Supported Captcha** | Uses a captcha we support (reCAPTCHA, reCAPTCHA Enterprise) |
| **Accepts Generated Info** | If the opt out requires a phone number or ID, confirm that a non-valid ID (e.g. 1x1 pixel JPG) works |

> **Note:** PIR only supports reCAPTCHA and reCAPTCHA Enterprise.

> **Note:** PIR generates images and random phone numbers when needed — verify with the broker that these work for opt out.

### Confirmation

| Criterion | Description |
|---|---|
| **Sends Confirmation** | If a confirmation email is promised, confirm we actually receive an email |
| **Confirmation Click** | If the email requires clicking a link, ensure the link actually allows the user to complete the opt out |
| **Supported Confirmation** | If after clicking the confirmation link the broker requires more info, ensure the info is non-sensitive and uses a supported captcha |

> **Note:** PIR only supports reCAPTCHA and reCAPTCHA Enterprise.

> **Note:** PIR only has limited info about the user and we aren't willing to hand over a lot of user information to data brokers.

### Validation

| Criterion | Description |
|---|---|
| **Record Removed** | Confirm that the record is actually removed |
