# Unsupported Data Broker Sites

## What is this project?

This project contains lists of data broker sites that:

- Are waiting to be tested (**Backlog** section)
- Were verified positively and are waiting to be supported (**Approved**)
- Were rejected (**Rejected**)

### Rejection Reasons

| Reason | Description |
|---|---|
| **Blind optout** | We can't validate if the data broker has user data (no scanning or paid scanning) |
| **Broken optout** | We can't opt out as the process is broken right now (e.g. form doesn't load) |
| **Doesn't comply** | Site allows opt out, but is not performing any data removals |
| **Partial removal** | Site allows opt out, but doesn't remove all user data (e.g. only address) |
| **Site dead** | Site doesn't load, redirects elsewhere, or says service was discontinued |
| **Invalid data broker** | Site doesn't deal with personal data of individuals but rather with data of professionals, vehicles, or companies |
| **PIR technical limitations** | PIR currently can't support this site due to limitations (e.g. would require sending emails or passing a captcha we don't support) |

## How to evaluate a new data broker site?

Follow instructions in the [Data Broker Rubric](./data-broker-rubric.md).

