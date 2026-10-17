export interface BotIdentity {
    id: string
    username: string
    bot: true
}

export interface BotGuild {
    id: string
    name: string
}

export interface BotSession {
    token: string
    user: BotIdentity
    guilds: BotGuild[]
}

export type LoginResult =
    | { kind: 'authenticated'; session: BotSession }
    | { kind: 'error'; message: string; retryAfterMs: number }

const ApiUrl = 'https://discord.com/api/v10'

function failure(message: string, retryAfterMs = 0): LoginResult {
    return { kind: 'error', message, retryAfterMs }
}

function isBot(value: unknown): value is BotIdentity {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        'username' in value &&
        typeof value.username === 'string' &&
        'bot' in value &&
        value.bot === true
    )
}

function isGuild(value: unknown): value is BotGuild {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        'name' in value &&
        typeof value.name === 'string'
    )
}

async function responseError(response: Response): Promise<LoginResult> {
    if (response.status === 401)
        return failure('This bot token is invalid or has been reset.')
    if (response.status === 429) {
        let retryAfterMs = 60_000
        try {
            const body: unknown = await response.json()
            if (
                typeof body === 'object' &&
                body !== null &&
                'retry_after' in body &&
                typeof body.retry_after === 'number' &&
                Number.isFinite(body.retry_after) &&
                body.retry_after > 0
            )
                retryAfterMs = Math.ceil(
                    Math.min(body.retry_after, 3600) * 1000,
                )
        } catch {}
        return failure(
            'Discord is rate limiting login. Please wait before trying again.',
            retryAfterMs,
        )
    }
    return failure(
        'Discord could not complete bot login. Please try again later.',
    )
}

export async function authenticateBot(
    rawToken: string,
    fetcher: typeof fetch = fetch,
    signal?: AbortSignal,
): Promise<LoginResult> {
    const token = rawToken.trim().replace(/^Bot(?:\s+|$)/i, '')
    if (!token || token.length > 512 || /\s/.test(token))
        return failure(
            'Enter a valid bot token from the Discord Developer Portal.',
        )

    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timeout = setTimeout(abort, 15_000)

    const options: RequestInit = {
        headers: { Authorization: `Bot ${token}` },
        signal: controller.signal,
        credentials: 'omit',
    }

    try {
        const identityResponse = await fetcher(`${ApiUrl}/users/@me`, options)
        if (!identityResponse.ok) return await responseError(identityResponse)
        const user: unknown = await identityResponse.json()
        if (!isBot(user))
            return failure('Only bot accounts can log in to BotClient.')

        const guildResponse = await fetcher(
            `${ApiUrl}/users/@me/guilds?limit=200`,
            options,
        )
        if (!guildResponse.ok) return await responseError(guildResponse)
        const guilds: unknown = await guildResponse.json()
        if (!Array.isArray(guilds) || !guilds.every(isGuild))
            return failure(
                'Discord returned an unexpected server list. Please try again later.',
            )

        return { kind: 'authenticated', session: { token, user, guilds } }
    } catch {
        return failure(
            controller.signal.aborted
                ? 'Login was cancelled or timed out. Please try again.'
                : 'Could not reach Discord. Check your connection and try again.',
        )
    } finally {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
    }
}
