import { describe, expect, it } from 'vitest'
import {
    BotIntents,
    botGatewayCommand,
    botGuild,
    botReady,
    botVerification,
    isUserOnlyRoute,
} from './protocol'

describe('native bot protocol', () => {
    it('replaces user Identify fields with bot authentication and nonprivileged intents', () => {
        const command = botGatewayCommand(2, {
            token: 'Bot test-token',
            capabilities: 123,
            client_state: { guild_versions: {} },
            compress: true,
        })
        expect(command).toEqual([
            2,
            {
                token: 'test-token',
                intents: BotIntents,
                properties: {
                    os: 'android',
                    browser: 'BotClient',
                    device: 'BotClient',
                },
                compress: true,
                large_threshold: 50,
            },
        ])
        expect(BotIntents & (2 | 256 | 32768)).toBe(0)
    })
    it('resumes with a raw token and converts QOS heartbeats to sequence heartbeats', () => {
        expect(
            botGatewayCommand(6, {
                token: 'Bot test-token',
                session_id: 'session',
                seq: 42,
            }),
        ).toEqual([6, { token: 'test-token', session_id: 'session', seq: 42 }])
        expect(botGatewayCommand(40, { seq: 42, qos: {} })).toEqual([1, 42])
        expect(botGatewayCommand(1, null)).toEqual([1, null])
    })
    it('drops user subscriptions, calls, streams, and unimplemented voice commands', () => {
        for (const op of [4, 8, 13, 14, 18, 20, 37])
            expect(botGatewayCommand(op, {})).toBeNull()
        expect(botGatewayCommand(2, {})).toBeNull()
    })
    it('fills missing READY fields without changing the bot identity or actual guilds', () => {
        const user = { id: '123', username: 'bot', bot: true }
        const guilds = [{ id: '456', unavailable: true }]
        const ready = botReady({ user, guilds, session_id: 'session' })
        expect(ready.user).toBe(user)
        expect(ready.guilds).toBe(guilds)
        expect(ready.read_state.entries).toEqual([])
        expect(ready.sessions).toEqual([])
        expect(user).not.toHaveProperty('premium')
    })
    it('blocks user-only requests and preserves bot REST operations', () => {
        for (const url of [
            '/users/@me/relationships',
            '/users/@me/settings-proto/1',
            '/users/@me/billing/subscriptions',
            '/channels/123/messages/456/ack',
            'https://discord.com/api/v10/users/@me/connections',
        ])
            expect(isUserOnlyRoute(url)).toBe(true)
        for (const url of [
            '/users/@me',
            '/users/@me/guilds?limit=200',
            '/channels/123/messages',
            '/channels/123/messages/456/reactions/x/@me',
            '/users/@me/channels',
            '/guilds/123/members/@me',
        ])
            expect(isUserOnlyRoute(url)).toBe(false)
    })
})

it('adapts flat bot guilds to native full-sync guild payloads', () => {
    const channels = [{ id: '789', guild_id: '456', type: 0 }]
    const guild = botGuild({
        id: '456',
        name: 'Test',
        channels,
        roles: [{ id: '456', permissions: '1024' }],
    })
    expect(guild.properties.name).toBe('Test')
    expect(guild.channels).toBe(channels)
    expect(guild.threads).toEqual([])
    expect(guild.voice_states).toEqual([])
    expect(guild.data_mode).toBe('full')
})

it('exempts bots from user account verification while retaining verification role checks', () => {
    const check = {
        notClaimed: true,
        notEmailVerified: true,
        notPhoneVerified: true,
        newAccount: true,
        newMember: true,
        canChat: false,
        missingVerificationRole: false,
    }
    expect(botVerification(check)).toMatchObject({
        notClaimed: false,
        notEmailVerified: false,
        notPhoneVerified: false,
        newAccount: false,
        newMember: false,
        canChat: true,
    })
    expect(
        botVerification({ ...check, missingVerificationRole: true }).canChat,
    ).toBe(false)
    expect(check.notClaimed).toBe(true)
})
