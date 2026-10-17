import { getModuleWithImportedPath } from '@revenge-mod/discord/utils/modules/finders'
import { instead } from '@revenge-mod/patcher'
import {
    canViewChannel,
    isRecord,
    memberListPayload,
    parseMembers,
} from './protocol'
import type { BotMember as Member } from './protocol'

export function installMemberList(
    cleanup: (...callbacks: (() => void)[]) => void,
    getToken: () => string | null,
    dispatch: (data: unknown, event: string) => void,
    log: (message: string) => void,
) {
    const guilds = new Map<string, Record<string, unknown>>()
    const cache = new Map<string, { members: Member[]; expires: number }>()
    const pending = new Map<string, Promise<Member[]>>()
    const cooldown = new Map<string, number>()
    const published = new Map<string, Member[]>()
    let getChannel: ((id: string) => unknown) | undefined
    let stopped = false
    cleanup(() => {
        stopped = true
        cache.clear()
        guilds.clear()
        published.clear()
    })
    cleanup(
        getModuleWithImportedPath<{
            default: { getChannel(id: string): unknown }
        }>('stores/ChannelStore.tsx', ({ default: store }) => {
            if (store && typeof store.getChannel === 'function')
                getChannel = id => store.getChannel(id)
        }),
    )
    async function load(guildId: string) {
        const cached = cache.get(guildId)
        if (cached && cached.expires > Date.now()) return cached.members
        const active = pending.get(guildId)
        if (active) return active
        if ((cooldown.get(guildId) ?? 0) > Date.now()) return null
        const token = getToken()
        if (!token?.startsWith('Bot ')) return null
        const request = (async () => {
            const members: Member[] = []
            let after = '0'
            do {
                const controller = new AbortController()
                const timer = setTimeout(() => controller.abort(), 15000)
                let response: Response
                try {
                    response = await fetch(
                        `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`,
                        {
                            headers: { Authorization: token },
                            signal: controller.signal,
                        },
                    )
                } finally {
                    clearTimeout(timer)
                }
                if (stopped || token !== getToken())
                    throw new Error('Session changed')
                if (response.status === 429) {
                    const body: unknown = await response.json()
                    const retry =
                        isRecord(body) && typeof body.retry_after === 'number'
                            ? body.retry_after * 1000
                            : 60000
                    cooldown.set(guildId, Date.now() + Math.max(1000, retry))
                    throw new Error('Member request rate limited')
                }
                if (!response.ok) {
                    if (response.status === 403)
                        log(
                            'Member list requires Server Members Intent enabled in the Discord Developer Portal',
                        )
                    throw new Error('Member request failed')
                }
                const page = parseMembers(await response.json())
                members.push(...page)
                if (page.length < 1000) break
                const last = page.at(-1)
                if (!last || last.user.id === after)
                    throw new Error('Member pagination stalled')
                after = last.user.id
            } while (!stopped)
            cache.set(guildId, { members, expires: Date.now() + 60000 })
            log(`Bot member list loaded: ${members.length} members`)
            return members
        })()
        pending.set(guildId, request)
        try {
            return await request
        } finally {
            pending.delete(guildId)
        }
    }
    cleanup(
        getModuleWithImportedPath<{
            default: { getProps(guildId: string, channelId: string): unknown }
        }>('stores/ChannelMemberStore.tsx', ({ default: store }) => {
            if (!store || typeof store.getProps !== 'function') return
            cleanup(
                instead(store, 'getProps', (args, original) => {
                    const result = original(...args)
                    const [guildId, channelId] = args
                    if (
                        !getToken()?.startsWith('Bot ') ||
                        !isRecord(result) ||
                        typeof result.listId !== 'string'
                    )
                        return result
                    const listId = result.listId.slice(guildId.length + 1)
                    const key = `${guildId}:${listId}`
                    const guild = guilds.get(guildId)
                    const channel = getChannel?.(channelId)
                    if (!guild || !isRecord(channel)) return result
                    void load(guildId)
                        .then(members => {
                            if (
                                !members ||
                                stopped ||
                                published.get(key) === members
                            )
                                return
                            published.set(key, members)
                            const visible = members.filter(member =>
                                canViewChannel(member, guild, channel),
                            )
                            dispatch(
                                memberListPayload(guildId, listId, visible),
                                'GUILD_MEMBER_LIST_UPDATE',
                            )
                        })
                        .catch(() => {
                            cooldown.set(
                                guildId,
                                Math.max(
                                    cooldown.get(guildId) ?? 0,
                                    Date.now() + 60000,
                                ),
                            )
                            log(
                                'Bot member list unavailable; retry after cooldown',
                            )
                        })
                    return result
                }),
            )
            log('Native member list REST adapter ready')
        }),
    )
    return {
        rememberGuild(data: unknown) {
            if (isRecord(data) && typeof data.id === 'string')
                guilds.set(data.id, data)
        },
        clear() {
            cache.clear()
            published.clear()
            cooldown.clear()
            guilds.clear()
        },
    }
}
