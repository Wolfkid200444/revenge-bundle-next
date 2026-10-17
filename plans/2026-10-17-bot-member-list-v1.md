# Native bot member list

Use the bot guild-members REST endpoint and Discord's existing member-list stores.

- [x] Trace user subscriptions and native list hydration.
- [ ] Load paginated members when native member-list props are requested.
- [ ] Filter channel visibility and hydrate native member-list updates.
- [ ] Keep requests bounded by caching, deduplication, and rate-limit cooldowns.
- [ ] Test, build, publish, and check the phone.

Full member enumeration requires Server Members Intent in the Developer Portal.
Do not log tokens or member data. Do not invent online status without presence data.
