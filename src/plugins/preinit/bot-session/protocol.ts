export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Nonprivileged intents: guilds, messages, reactions, and direct messages.
export const BotIntents = 1 | 512 | 1024 | 4096 | 8192

export function botGatewayCommand(
    op: number,
    data: unknown,
): [number, unknown] | null {
    if (op === 2) {
        if (!isRecord(data) || typeof data.token !== 'string') return null
        return [
            2,
            {
                token: data.token.replace(/^Bot\s+/i, ''),
                intents: BotIntents,
                properties: {
                    os: 'android',
                    browser: 'BotClient',
                    device: 'BotClient',
                },
                compress: data.compress === true,
                large_threshold: 50,
            },
        ]
    }
    if (op === 6) {
        if (!isRecord(data) || typeof data.token !== 'string') return null
        return [
            6,
            {
                token: data.token.replace(/^Bot\s+/i, ''),
                session_id: data.session_id,
                seq: data.seq,
            },
        ]
    }
    if (op === 40) return [1, isRecord(data) ? data.seq : null]
    // Voice, member requests, streams, calls, and subscriptions stay disabled initially.
    return op === 1 || op === 3 ? [op, data] : null
}

export function botReady(data: Record<string, unknown>) {
    return {
        sessions: [],
        relationships: [],
        game_relationships: [],
        connected_accounts: [],
        guild_join_requests: [],
        linked_users: [],
        users: [],
        private_channels: [],
        experiments: [],
        guild_experiments: [],
        geo_restricted_guilds: [],
        failed_states: [],
        read_state: { version: 0, partial: false, entries: [] },
        user_guild_settings: { version: 0, partial: false, entries: [] },
        notification_settings: { flags: 0 },
        auth: { authenticator_types: [] },
        consents: { personalization: { consented: false } },
        regional_feature_config: {
            age_gated_features: 0,
            teen_by_default_settings: 0,
        },
        tutorial: null,
        analytics_token: null,
        pending_payments: null,
        friend_suggestion_count: 0,
        explicit_content_scan_version: 0,
        api_code_version: 1,
        ...data,
    }
}

export function isUserOnlyRoute(url: string) {
    const path = url
        .replace(
            /^https:\/\/(?:canary\.|ptb\.)?discord\.com\/api(?:\/v\d+)?/,
            '',
        )
        .split('?')[0]
    return (
        /^\/users\/@me\/(?:relationships|settings(?:-proto)?|guilds\/[^/]+\/settings|billing|connections|devices|affinities|library|notes|activities|consents|sessions)(?:\/|$)/.test(
            path,
        ) ||
        /^\/(?:science|track|hypesquad|scheduled-events|store|entitlements\/gift-codes)(?:\/|$)/.test(
            path,
        ) ||
        /\/(?:ack|acks|call|recipients)(?:\/|$)/.test(path) ||
        /^\/guilds\/[^/]+\/members\/@me\/profile$/.test(path)
    )
}

export function botGuild(data: Record<string, unknown>) {
    return {
        data_mode: 'full',
        channels: [],
        threads: [],
        roles: [],
        members: [],
        presences: [],
        voice_states: [],
        emojis: [],
        stickers: [],
        stage_instances: [],
        guild_scheduled_events: [],
        activity_instances: [],
        experiments: [],
        last_messages: [],
        version: 0,
        has_threads_subscription: false,
        ...data,
        properties: isRecord(data.properties) ? data.properties : { ...data },
    }
}

export function botVerification(check: Record<string, unknown>) {
    return {
        ...check,
        notClaimed: false,
        notEmailVerified: false,
        notPhoneVerified: false,
        newAccount: false,
        newMember: false,
        canChat: !check.missingVerificationRole,
    }
}
