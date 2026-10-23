# Community forms

`/community/survey` serves eight optional questions. `/community/merch?c=CODE` validates an issued code and opens an encrypted Jotform form. Both are standalone documents with the bb wordmark, no analytics or hydration client, `noindex, nofollow`, `Cache-Control: no-store`, and a restrictive Content Security Policy. The survey uses `Referrer-Policy: same-origin` to support its POST; merch pages, external form links and embeds suppress referrers so bearer codes cannot reach analytics on other pages. Neither appears in navigation or the sitemap.

## Configuration and launch

Collection defaults to off in both environments. `COMMUNITY_FORMS_ENABLED=true` enables survey submissions and the configured Jotform embed. Keep it off until the copy, data handling and exact build pass review. Apply the generated connect-db migrations before enabling collection.

`COMMUNITY_JOTFORM_URL` defaults to an empty string. Set it to the encrypted form's HTTPS URL on `form.jotform.com` or `form.jotformeu.com`. An empty or invalid URL shows the warm thank-you with a form-not-open notice, never an address form hosted by bb. The form must have a field whose unique name is `code`; bb prefills that query parameter. Verify encryption, prefill and decryption with a synthetic submission before launch. A URL alone cannot establish that encryption is enabled.

Configure the Jotform fields as name for the label, address, country, and an optional note. Do not ask for email, phone or Discord. Configure its submit label as “send me merch” and its confirmation as “you're in! 🎉 we'll ping you on discord when it's on the way. ty for being here.” Keep the decryption access code with the person packing the envelopes.

`COMMUNITY_MERCH_INVITE_HASHES` is an optional private Worker secret containing a JSON array of SHA-256 hex hashes of contributor invitation codes. Generate unpredictable codes with at least 128 bits of entropy and send the raw code only in the personal link. Remove its hash after fulfillment to revoke access. Survey sticker codes use their own database pool.

The shared review preview keeps collection off and the form URL empty. Local synthetic QA may override these values against a fresh local D1 database; never use production bindings or real addresses for QA.

## Survey submission contract

POST `application/x-www-form-urlencoded` to `/community/survey` with the `submission_id` UUID from the page. The question fields are `discovery`, `work`, `role`, `meetup`, `city`, `merch`, `miss` and `opt_in`. Radio answers accept one listed choice; checkbox answers repeat their field name. All questions, including “Other”, may be skipped. Q1 and Q6 choices are shuffled on rendering; Q6 accepts at most three distinct choices.

`discord` appears when either Q8 option or either “Yes” Q4 option is selected. `company` appears only for the Q8 work-chat option. Both are optional and are discarded server-side when the relevant opt-in is absent.

The request's `Origin` must match the page origin. A 16 KiB body limit and six submissions per minute per connection IP apply. Unknown fields are rejected. Validation returns HTTP 400 with answers preserved, collection-off or storage failure returns 503, rejected origin returns 403, and rate limiting returns 429. Merch accepts GET only; bb has no address POST endpoint.

## Sticker pool and privacy

A successful survey save atomically allocates a random one-use sticker code while stock remains. Allocation picks a random unused slot so slot order cannot reveal response order. The database caps slots at 250, and a duplicate submission UUID cannot allocate another code. The confirmation links to `/community/merch?c=CODE`; exhausted stock uses the sold-out line. Reposting a saved submission shows a received-response message; it cannot recover its code because no response-to-code mapping exists. Save the original claim link.

Survey responses contain only a random submission ID, creation time and answers. `community_sticker_code` contains only a pool slot, code hash and shipped flag: no survey ID, answer, contact detail or timestamp. Raw codes are never persisted. Do not add request-body logging, analytics, or a join between these datasets. Infrastructure may still handle request metadata; review logging before launch. IP addresses are used by the short-lived rate limiter, not stored with answers.

GET does not consume a code: people must be able to reopen the mailing form. One-use means one fulfilled pack. The shipper decrypts Jotform submissions and validates each code against the issued hashes before sending, skipping unknown codes and codes already shipped. The external form is public, so this fulfillment check is mandatory even if a submitted code was prefilled.

After shipping, set `community_sticker_code.shipped = 1` for the matching SHA-256 hash, or revoke the contributor hash. Retain all sticker slots, including shipped slots, to preserve the lifetime cap; never delete them to replenish stock. Keep only a separate code/pack/shipped-date ledger. Delete the address response from Jotform and request deletion of any label-provider copy. bb never stores addresses.

Choose a survey closing date and response-deletion date before launch. Delete raw survey responses when no longer needed and retain anonymous aggregate findings. Database backups can retain deleted survey answers under the provider's recovery policy.
