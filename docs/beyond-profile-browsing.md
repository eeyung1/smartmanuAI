# Browsing beyond your profile

`/matches/explore` requires a signed-in session and is linked from the private workspace. It shows the same catalogue records, order, filters and pages as `/opportunities`. Records outside the saved profile remain visible, including partial or unclear funding when explicitly selected through the existing funding filter. Nothing is automatically saved, dismissed or sent.

Private notes use matching rules version 4 against only the displayed page and current saved profile. Known preference mismatches and failures against recorded requirements appear separately from expandable requirements that still need checking. A record with no known mismatch still needs source verification and does not establish eligibility. With no stored profile, the screen offers a link back to profile setup instead of assuming default personal facts.

The server derives ownership from the session, not query parameters. Notes contain reason strings only, not profile values, contact details or scores. No notes are added to public pages or the public API, even when a user is signed in. Responses are dynamic and private; there is no shared profile cache. Invalid filters show the existing recovery message. Filters, reset and pagination preserve the private route; sign-in returns to the route’s first page. Changes to the saved profile are reflected on the next request.

This view deliberately does not rank or filter by preferences, so the personalized matches service’s 1,000-candidate bound does not limit its public catalogue pages. Existing public publication, expiry and freshness rules still apply. This feature adds no schema, provider or hosted account capability.
