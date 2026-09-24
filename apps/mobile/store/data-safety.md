# Play Console: Data safety answers

Based on what the app and API actually do (checked in Phase 9b). Update this whenever a feature starts collecting something new.

**Does your app collect or share any of the required user data types?** Yes.
**Is all of the user data collected by your app encrypted in transit?** Yes (the app only talks to the API and storage over HTTPS).
**Do you provide a way for users to request that their data is deleted?** Yes: in the app (Settings → Delete account) and at https://sajha.app/delete-account.

## Data collected

| Category · type | Collected | Shared | Optional? | Why | Notes |
|---|---|---|---|---|---|
| Personal info · Name | Yes | No | Required | Account management, app functionality | Shown to the other person in a booking |
| Personal info · Email address | Yes | No | Optional (required to list or book) | Account management, communications | Receipts and codes |
| Personal info · Phone number | Yes | No | Required | Account management (sign-in), app functionality | Shown to the other person only after payment |
| Personal info · Address | Yes | No | Optional (lenders) | App functionality | A lender's exact pickup address, encrypted, shown to the borrower after payment |
| Personal info · Other info | Yes | No | Optional | App functionality, fraud prevention | Government ID photos in the user's document vault, encrypted at rest; a copy is shown to a lender only for a booking the user shares it with, and deleted 30 days after the booking closes |
| Financial info · User payment info | No | — | — | — | Card and UPI details go straight to Razorpay's SDK; Sajha never sees them |
| Financial info · Purchase history | Yes | No | Required | App functionality | Bookings and payments |
| Financial info · Other financial info | Yes | Yes (Razorpay) | Optional (lenders) | App functionality | Bank account, IFSC and PAN for payouts, sent to Razorpay; Sajha keeps only the last digits |
| Location · Approximate location | Yes | No | Optional | App functionality | To show what's near you; not stored with the account |
| Location · Precise location | Yes | No | Optional | App functionality | Only when a lender pins a pickup point |
| Messages · Other in-app messages | Yes | No | Required to chat | App functionality, fraud prevention | Chats between borrower and lender; phone numbers and UPI IDs are hidden until a booking is paid |
| Photos and videos · Photos | Yes | No | Optional | App functionality | Profile photo, listing photos, condition photos at handover and return |
| App activity · App interactions | Yes | No | Required | Analytics (listing views, favourites), app functionality | Counted per listing, not tracked across apps |
| App info and performance · Crash logs, Diagnostics | Yes | No (Sentry is a processor) | Required | Analytics | Only when crash reporting is enabled; phone numbers, emails and codes are removed on the phone before sending |
| Device or other IDs · Device or other IDs | Yes | No | Required | App functionality | Push token (Firebase) and a device id to list your signed-in devices |

**Sharing notes.** Razorpay (payments and payouts), Firebase Cloud Messaging (push), MSG91 (SMS codes) and Sentry (crash reports) process data on Sajha's behalf; Play treats service providers as not "sharing", except where the user's data is sent for the provider's own purposes, which none of these do. The payout details sent to Razorpay are marked shared above to be conservative, because Razorpay also uses them for its own KYC.

**Security practices to declare:** data encrypted in transit; users can request deletion; (optional) committed to Play Families Policy: No (not for children).
