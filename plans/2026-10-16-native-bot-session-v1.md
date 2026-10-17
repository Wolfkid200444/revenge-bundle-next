# Native bot session integration

Use Discord Android 349.9 existing root, authentication actions, Gateway socket, and stores.

- [x] Inspect installed Hermes authentication and Gateway handlers.
- [x] Preserve Discord root and show token entry only before connection.
- [x] Adapt Identify, Resume, heartbeat, READY, and bot logout guard.
- [x] Block initial user-only HTTP routes and unsupported Gateway commands.
- [x] Build, format, typecheck, and test adapters.
- [x] Publish bundle and check original root on device.
- [x] Verify authenticated server and channel navigation on device.

No tokens in logs. Keep bot identity in stores. Native login owns token persistence.

## Device verification

- Saved bot session restores after restart.
- Both servers appear in Discord native navigation.
- Native Settings opens after the bot MFA compatibility patch.
- Native text composer is enabled after the user verification gate patch.
- [x] Confirm message delivery through a message the user sends.
  User confirmed successful delivery on October 17, 2026.

User-only controls still need UI cleanup. HTTP and Gateway guards already block the initial unsupported operations.
