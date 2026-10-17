# Native bot member list

Use the bot guild-members REST endpoint and Discord's existing member-list stores.

- [x] Trace user subscriptions and native list hydration.
- [x] Load paginated members when native member-list props are requested.
- [x] Filter channel visibility and hydrate native member-list updates.
- [x] Keep requests bounded by caching, deduplication, and rate-limit cooldowns.
- [x] Test, build, publish, and check the phone.

Full member enumeration requires Server Members Intent in the Developer Portal.
Do not log tokens or member data. Do not invent online status without presence data.

Device result: bot REST returned all 20 guild members. Native Members tab displays the list.
Server Members Intent is already enabled for the tested bot. Presence intent remains unchanged.
