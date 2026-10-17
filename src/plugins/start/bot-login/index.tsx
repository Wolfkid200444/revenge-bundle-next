import { registerInternalPlugin } from '@revenge-mod/plugins/_'
import { useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    AppRegistry,
    KeyboardAvoidingView,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import {
    connected,
    hasBotToken,
    loginNativeBot,
    onConnectionChange,
} from '../../preinit/bot-session/session'
import { authenticateBot } from './api'
import manifest from './manifest.json'
import type { ComponentProps, ComponentType } from 'react'

registerInternalPlugin(manifest, {
    start({ cleanup, logger }) {
        AppRegistry.setComponentProviderInstrumentationHook(provider => {
            const Root = provider()
            return function BotClientRoot(
                props: ComponentProps<ComponentType>,
            ) {
                return (
                    <>
                        <Root {...props} />
                        <BotLoginScreen />
                    </>
                )
            }
        })
        cleanup(() =>
            AppRegistry.setComponentProviderInstrumentationHook(provider =>
                provider(),
            ),
        )
        logger.log('Original Discord root preserved with bot token entry')
    },
})

function BotLoginScreen() {
    const [token, setToken] = useState('')
    const [visible, setVisible] = useState(!connected && !hasBotToken())
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const retryAt = useRef(0)
    const request = useRef<AbortController | null>(null)

    useEffect(() => {
        const unsubscribe = onConnectionChange(connected =>
            setVisible(!connected),
        )
        return () => {
            unsubscribe()
            request.current?.abort()
        }
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
                try {
                    await loginNativeBot(result.session.token)
                    setToken('')
                    setVisible(false)
                } catch (error) {
                    setError(
                        error instanceof Error
                            ? error.message
                            : 'Discord could not start the bot session.',
                    )
                }
            } else {
                setError(result.message)
                retryAt.current = Date.now() + result.retryAfterMs
            }
            setPending(false)
        }
        request.current = null
    }

    return (
        <Modal
            visible={visible}
            animationType="fade"
            onRequestClose={() => setVisible(false)}
        >
            <KeyboardAvoidingView style={styles.root} behavior="height">
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.brand}>BotClient</Text>
                    <Text style={styles.subtitle}>Your bot, on Android.</Text>
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
                            Your token goes directly to Discord. Discord stores
                            the session on this device until you log out.
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>
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
