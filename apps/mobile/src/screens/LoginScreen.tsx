import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { theme, ui } from '../ui';

export function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setBusy(true);
    setFailed(false);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) setFailed(true);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[ui.screen, { justifyContent: 'center' }]}>
        <Text style={ui.brand}>{t('common.appName')}</Text>
        <Text style={ui.title}>{t('mobile.login.title')}</Text>

        <Text style={ui.label}>{t('mobile.login.email')}</Text>
        <TextInput
          style={ui.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholderTextColor={theme.colors.dim}
        />

        <Text style={ui.label}>{t('mobile.login.password')}</Text>
        <TextInput
          style={ui.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={theme.colors.dim}
        />

        {failed ? <Text style={ui.error}>{t('mobile.login.error')}</Text> : null}

        <Pressable style={[ui.primaryButton, busy && { opacity: 0.6 }]} onPress={signIn} disabled={busy}>
          <Text style={ui.primaryButtonText}>{t('mobile.login.action')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
