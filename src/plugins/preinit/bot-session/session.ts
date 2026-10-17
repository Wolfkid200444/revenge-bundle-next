import { onFluxEventDispatched } from '@revenge-mod/discord/flux'
import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { before, instead } from '@revenge-mod/patcher'
import { installMemberList } from './members'
import {
    botGatewayCommand,
    botGuild,
    botReady,
    botVerification,
    isRecord,
    isUserOnlyRoute,
} from './protocol'

function hasTotpStore(value: unknown): value is { hasTOTPEnabled(): boolean } {
    return isRecord(value) && typeof value.hasTOTPEnabled === 'function'
}

type Cleanup = (...callbacks: (() => void)[]) => void
interface Socket {
    handleIdentify(): unknown
    send(op: number, data: unknown, ...rest: unknown[]): unknown
    _handleDispatch(data: unknown, event: string, seq: number): unknown
}
let authentication:
    | { loginToken(token: string, startSession?: boolean): Promise<void> }
    | undefined
let currentToken: (() => string | null) | undefined
let socketPatched = false
const listeners = new Set<(connected: boolean) => void>()
export let connected = false

export function onConnectionChange(listener: (connected: boolean) => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function hasBotToken() {
    return /^Bot\s/i.test(currentToken?.() ?? '')
}

export async function loginNativeBot(token: string) {
    if (!authentication || !socketPatched) {
        throw new Error(
            'Discord bot-session patches are not ready. Restart the app and try again.',
        )
    }
    await authentication.loginToken(`Bot ${token}`, true)
}

export function installBotSession(
    cleanup: Cleanup,
    log: (message: string) => void,
) {
    cleanup(
        getModuleWithImportedPath<unknown>(
            'actions/AuthenticationActionCreators.tsx',
            exports => {
                if (
                    !isRecord(exports) ||
                    !isRecord(exports.default) ||
                    typeof exports.default.loginToken !== 'function'
                )
                    return
                const actions = exports.default
                const loginToken = exports.default.loginToken
                authentication = {
                    loginToken: (token, start) =>
                        Promise.resolve(loginToken.call(actions, token, start)),
                }
                log('Native token-login action ready')
            },
        ),
    )
    cleanup(
        getModuleWithImportedPath<unknown>(
            'stores/AuthenticationStore.tsx',
            exports => {
                if (
                    !isRecord(exports) ||
                    !isRecord(exports.default) ||
                    typeof exports.default.getToken !== 'function'
                )
                    return
                const store = exports.default
                const getToken = exports.default.getToken
                if (hasTotpStore(store))
                    cleanup(
                        instead(store, 'hasTOTPEnabled', (args, original) =>
                            hasBotToken() ? false : original(...args),
                        ),
                    )
                currentToken = () => {
                    const token = getToken.call(store)
                    return typeof token === 'string' ? token : null
                }
            },
        ),
    )
    cleanup(
        getModuleWithImportedPath<{
            default: { getCheck(guildId: string): unknown }
        }>('stores/GuildVerificationStore.tsx', ({ default: store }) => {
            if (!store || typeof store.getCheck !== 'function') return
            cleanup(
                instead(store, 'getCheck', (args, original) => {
                    const check = original(...args)
                    return hasBotToken() && isRecord(check)
                        ? botVerification(check)
                        : check
                }),
            )
            log('Bot user-verification composer gate patched')
        }),
    )
    let receiveDispatch: ((data: unknown, event: string) => void) | undefined
    const members = installMemberList(
        cleanup,
        () => currentToken?.() ?? null,
        (data, event) => receiveDispatch?.(data, event),
        log,
    )
    cleanup(
        getModuleWithImportedPath<{ socket: Socket }>(
            'modules/gateway/GatewaySocketSingleton.tsx',
            ({ socket }) => {
                if (
                    !socket ||
                    typeof socket.send !== 'function' ||
                    typeof socket._handleDispatch !== 'function'
                )
                    return
                cleanup(
                    instead(socket, 'send', ([op, data, ...rest], original) => {
                        if (!hasBotToken()) return original(op, data, ...rest)
                        const command = botGatewayCommand(op, data)
                        if (command)
                            return original(command[0], command[1], ...rest)
                    }),
                )
                cleanup(
                    before(socket, '_handleDispatch', ([data, event, seq]) => {
                        if (
                            hasBotToken() &&
                            event === 'READY' &&
                            isRecord(data)
                        ) {
                            log('Bot Gateway READY received')
                            return [botReady(data), event, seq]
                        }
                        if (
                            hasBotToken() &&
                            event === 'GUILD_CREATE' &&
                            isRecord(data)
                        ) {
                            members.rememberGuild(data)
                            log('Bot guild payload adapted')
                            return [botGuild(data), event, seq]
                        }
                        return [data, event, seq]
                    }),
                )
                receiveDispatch = (data, event) => {
                    socket._handleDispatch(data, event, 0)
                }
                socketPatched = true
                log('Native bot Gateway adapter ready')
            },
        ),
    )
    cleanup(
        getModuleWithImportedPath<{
            default(
                event: string,
            ): { dispatch(...args: unknown[]): unknown } | undefined
        }>('modules/gateway/dispatchSocketMessage.tsx', exports => {
            const handler = exports.default('READY')
            if (!handler || typeof handler.dispatch !== 'function') return
            cleanup(
                instead(handler, 'dispatch', (args, original) => {
                    const data = args[0]
                    if (
                        !hasBotToken() ||
                        !isRecord(data) ||
                        !isRecord(data.user) ||
                        data.user.bot !== true
                    )
                        return original(...args)
                    // Bypass only the synchronous bot logout guard. Stores retain the real bot identity.
                    const user = data.user
                    user.bot = false
                    try {
                        return original(...args)
                    } finally {
                        user.bot = true
                    }
                }),
            )
            log('Native READY bot guard patched')
        }),
    )
    cleanup(
        getModuleWithImportedPath<{
            HTTP: Record<
                'get' | 'post' | 'put' | 'patch' | 'del',
                (
                    options: { url: string },
                    ...rest: unknown[]
                ) => Promise<unknown>
            >
        }>(
            '../discord_common/js/packages/http-utils/HTTPUtils.tsx',
            ({ HTTP }) => {
                if (!HTTP) return
                for (const method of [
                    'get',
                    'post',
                    'put',
                    'patch',
                    'del',
                ] as const) {
                    if (typeof HTTP[method] !== 'function') continue
                    cleanup(
                        instead(
                            HTTP,
                            method,
                            ([options, ...rest], original) => {
                                if (
                                    hasBotToken() &&
                                    isUserOnlyRoute(options.url)
                                ) {
                                    return Promise.reject(
                                        Object.assign(
                                            new Error(
                                                'This feature is unavailable for bot accounts.',
                                            ),
                                            {
                                                status: 403,
                                                body: {
                                                    message:
                                                        'This feature is unavailable for bot accounts.',
                                                    code: 50001,
                                                },
                                            },
                                        ),
                                    )
                                }
                                return original(options, ...rest)
                            },
                        ),
                    )
                }
                log('User-only HTTP routes blocked for bot sessions')
            },
        ),
    )
    cleanup(
        onFluxEventDispatched<{ user?: unknown; auth?: unknown }>(
            'CONNECTION_OPEN',
            payload => {
                if (hasBotToken() && isRecord(payload.user))
                    payload.user.bot = true
                if (hasBotToken()) payload.auth = { authenticator_types: [] }
                connected = true
                for (const listener of listeners) listener(true)
                log('Discord native connection opened')
                return payload
            },
        ),
        onFluxEventDispatched('LOGOUT', payload => {
            members.clear()
            connected = false
            for (const listener of listeners) listener(false)
            return payload
        }),
    )
}
