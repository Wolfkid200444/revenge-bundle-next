import { registerInternalPlugin } from '@revenge-mod/plugins/_'
import manifest from './manifest.json'
import { installBotSession } from './session'

registerInternalPlugin(manifest, {
    preInit({ cleanup }) {
        installBotSession(cleanup, message =>
            nativeLoggingHook(`[BotClient] ${message}`, 1),
        )
    },
})
