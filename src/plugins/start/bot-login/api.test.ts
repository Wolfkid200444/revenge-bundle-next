import { describe, expect, it, vi } from 'vitest'
import { authenticateBot } from './api'

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('bot authentication', () => {
    it('uses bot authentication on both API calls and validates identity', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                json({ id: '123', username: 'Test Bot', bot: true }),
            )
            .mockResolvedValueOnce(json([{ id: '456', name: 'Test Server' }]))
        const result = await authenticateBot(' Bot test-token ', fetcher)
        expect(result).toEqual({
            kind: 'authenticated',
            session: {
                token: 'test-token',
                user: { id: '123', username: 'Test Bot', bot: true },
                guilds: [{ id: '456', name: 'Test Server' }],
            },
        })
        for (const [url, options] of fetcher.mock.calls) {
            expect(url.toString()).toMatch(
                /^https:\/\/discord\.com\/api\/v10\//,
            )
            expect(options?.headers).toEqual({
                Authorization: 'Bot test-token',
            })
            expect(options?.credentials).toBe('omit')
        }
    })

    it('rejects non-bot accounts without loading servers', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                json({ id: '123', username: 'User', bot: false }),
            )
        expect(await authenticateBot('test-token', fetcher)).toMatchObject({
            kind: 'error',
            message: 'Only bot accounts can log in to BotClient.',
        })
        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('does not request Discord for empty or malformed input', async () => {
        const fetcher = vi.fn<typeof fetch>()
        for (const input of ['', 'Bot ', 'two tokens', 'x'.repeat(513)])
            expect(await authenticateBot(input, fetcher)).toMatchObject({
                kind: 'error',
            })
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('handles invalid tokens without exposing the response body', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(json({ message: 'private token data' }, 401))
        const result = await authenticateBot('test-token', fetcher)
        expect(result).toMatchObject({
            kind: 'error',
            message: 'This bot token is invalid or has been reset.',
        })
        expect(JSON.stringify(result)).not.toContain('private token data')
    })

    it('honors rate limits without retrying', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(json({ retry_after: 12.5 }, 429))
        expect(await authenticateBot('test-token', fetcher)).toMatchObject({
            kind: 'error',
            retryAfterMs: 12500,
        })
        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('rejects malformed server data', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                json({ id: '123', username: 'Bot', bot: true }),
            )
            .mockResolvedValueOnce(json([{ id: '456', name: 42 }]))
        expect(await authenticateBot('test-token', fetcher)).toMatchObject({
            kind: 'error',
        })
    })

    it('redacts network exception text', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockRejectedValue(new Error('private token data'))
        const result = await authenticateBot('test-token', fetcher)
        expect(result).toMatchObject({ kind: 'error' })
        expect(JSON.stringify(result)).not.toContain('private token data')
    })
})
