---
name: Document Breakage
about: Document breakage in a standard format
title: "<entity> breakage"
labels: ''
assignees: ''

---

<!-- Each exception should be documented. Please create an issue using this template before creating a new exception. The exception should then link back to the created issue. -->
<!-- Title should contain eTLD+1 of the tracker (and not the site that's broken). -->
  
- https://example.com <!--link to page with breakage--> (last verified 2021-12-31)
  - Page is blank for 5s after load. <!-- description of breakage -->
  - requests required:
    - `https://tracker.com` <!-- url of the request that needs to be unblocked --> (`js` <!--resource type(s)-->) - <!--additional description-->
    - …
- … <!-- other site that's broken due to blocking of the same tracker -->
