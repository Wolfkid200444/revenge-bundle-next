import { Dispatcher } from '@revenge-mod/discord/common/flux'
import { registerInternalPlugin } from '@revenge-mod/plugins/_'
import { useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    AppRegistry,
    AppState,
    KeyboardAvoidingView,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { authenticateBot } from './api'
import manifest from './manifest.json'
import type { BotSession } from './api'

registerInternalPlugin(manifest, {
    start({ cleanup, logger }) {
        for (const key of AppRegistry.getAppKeys()) {
            if (key === 'LogBox') continue
            const original = AppRegistry.getRunnable(key)
            if (!original) continue
            AppRegistry.registerComponent(key, () => BotLoginScreen)
            cleanup(() => AppRegistry.registerRunnable(key, original))
        }
        logger.log('Bot login screen ready')
    },
})

function BotLoginScreen() {
    const [token, setToken] = useState('')
    const [session, setSession] = useState<BotSession | null>(null)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const retryAt = useRef(0)
    const request = useRef<AbortController | null>(null)

    useEffect(() => {
        Dispatcher.dispatch({
            type: 'APP_STATE_UPDATE',
            state: AppState.currentState,
        })
        return () => request.current?.abort()
    }, [])

    async function login() {
        if (request.current) return
        if (Date.now() < retryAt.current) {
            setError(
                `Try again in ${Math.ceil((retryAt.current - Date.now()) / 1000)} seconds.`,
            )
            return
        }
        const controller = new AbortController()
        request.current = controller
        setPending(true)
        setError('')
        const result = await authenticateBot(token, fetch, controller.signal)
        if (!controller.signal.aborted) {
            if (result.kind === 'authenticated') {
                setToken('')
                setSession(result.session)
            } else {
                setError(result.message)
                retryAt.current = Date.now() + result.retryAfterMs
            }
            setPending(false)
        }
        request.current = null
    }

    return (
        <KeyboardAvoidingView style={styles.root} behavior="height">
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.brand}>BotClient</Text>
                <Text style={styles.subtitle}>Your bot, on Android.</Text>
                {session ? (
                    <>
                        <View style={styles.card}>
                            <Text style={styles.badge}>BOT ACCOUNT</Text>
                            <Text style={styles.heading}>
                                {session.user.username}
                            </Text>
                            <Text style={styles.muted}>
                                Bot ID: {session.user.id}
                            </Text>
                            <Text style={styles.success}>
                                Authenticated with Discord
                            </Text>
                        </View>
                        <Text style={styles.heading}>Servers</Text>
                        {session.guilds.length === 0 && (
                            <Text style={styles.muted}>
                                This bot has not joined any servers yet.
                            </Text>
                        )}
                        {session.guilds.map(guild => (
                            <View key={guild.id} style={styles.server}>
                                <Text style={styles.serverName}>
                                    {guild.name}
                                </Text>
                            </View>
                        ))}
                        {session.guilds.length === 200 && (
                            <Text style={styles.muted}>
                                Showing the first 200 servers.
                            </Text>
                        )}
                        <Text style={styles.note}>
                            Chat integration is still in development.
                        </Text>
                        <Pressable
                            accessibilityRole="button"
                            style={styles.secondary}
                            onPress={() => setSession(null)}
                        >
                            <Text style={styles.buttonText}>Log out</Text>
                        </Pressable>
                    </>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.heading}>Log in as your bot</Text>
                        <Text style={styles.description}>
                            Use the bot token from your application in the
                            Discord Developer Portal.
                        </Text>
                        <Text style={styles.label}>BOT TOKEN</Text>
                        <TextInput
                            accessibilityLabel="Bot token"
                            style={styles.input}
                            placeholder="Paste your bot token"
                            placeholderTextColor="#9296a2"
                            value={token}
                            onChangeText={setToken}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="off"
                            editable={!pending}
                            maxLength={512}
                            onSubmitEditing={login}
                        />
                        {error !== '' && (
                            <Text
                                accessibilityRole="alert"
                                style={styles.error}
                            >
                                {error}
                            </Text>
                        )}
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Log in as bot"
                            accessibilityState={{
                                disabled: pending || !token.trim(),
                                busy: pending,
                            }}
                            style={[
                                styles.button,
                                (pending || !token.trim()) && styles.disabled,
                            ]}
                            disabled={pending || !token.trim()}
                            onPress={login}
                        >
                            {pending ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>
                                    Log in as bot
                                </Text>
                            )}
                        </Pressable>
                        <Text style={styles.note}>
                            Your token goes directly to Discord. It stays in
                            memory and is cleared when you log out or close the
                            app.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#111214' },
    content: {
        padding: 24,
        paddingTop: 64,
        paddingBottom: 48,
        width: '100%',
        maxWidth: 600,
        alignSelf: 'center',
    },
    brand: { color: '#f2f3f5', fontSize: 36, fontWeight: '800' },
    subtitle: {
        color: '#a9adb8',
        fontSize: 17,
        marginTop: 6,
        marginBottom: 32,
    },
    card: {
        backgroundColor: '#232428',
        borderRadius: 16,
        padding: 22,
        marginBottom: 24,
    },
    heading: {
        color: '#f2f3f5',
        fontSize: 23,
        fontWeight: '700',
        marginBottom: 12,
    },
    description: {
        color: '#b5bac1',
        fontSize: 15,
        lineHeight: 23,
        marginBottom: 28,
    },
    label: {
        color: '#b5bac1',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 8,
    },
    input: {
        color: '#fff',
        backgroundColor: '#111214',
        borderRadius: 8,
        padding: 14,
        fontSize: 16,
        minHeight: 52,
    },
    button: {
        marginTop: 20,
        backgroundColor: '#5865f2',
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
        minHeight: 52,
    },
    secondary: {
        marginTop: 20,
        backgroundColor: '#313338',
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    note: { color: '#9296a2', fontSize: 13, lineHeight: 20, marginTop: 20 },
    error: { color: '#ff8585', fontSize: 14, lineHeight: 21, marginTop: 14 },
    muted: { color: '#b5bac1', fontSize: 14, lineHeight: 22 },
    badge: {
        color: '#aeb5ff',
        fontSize: 12,
        fontWeight: '800',
        marginBottom: 12,
    },
    success: { color: '#73dca4', fontSize: 14, marginTop: 16 },
    server: {
        backgroundColor: '#232428',
        borderRadius: 10,
        padding: 16,
        marginTop: 8,
    },
    serverName: { color: '#f2f3f5', fontSize: 16, fontWeight: '600' },
})
