import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { rnTheme } from '@bravotools/theme';
import './src/i18n';
import { supabase } from './src/lib/supabase';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { ToolScreen } from './src/screens/ToolScreen';
import { UnknownCodeScreen } from './src/screens/UnknownCodeScreen';
import { HandoverWizard } from './src/screens/HandoverWizard';
import type { HandoverAction, ScannedTool } from './src/types';

type Route =
  | { name: 'scan' }
  | { name: 'tool'; tool: ScannedTool }
  | { name: 'handover'; tool: ScannedTool; action: HandoverAction }
  | { name: 'unknown'; code: string };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'scan' });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setRoute({ name: 'scan' });
    });
    return () => subscription.unsubscribe();
  }, []);

  let content = null;
  if (ready) {
    if (!session) {
      content = <LoginScreen />;
    } else if (route.name === 'tool') {
      content = (
        <ToolScreen
          tool={route.tool}
          onScanAgain={() => setRoute({ name: 'scan' })}
          onHandover={(action) => setRoute({ name: 'handover', tool: route.tool, action })}
        />
      );
    } else if (route.name === 'handover') {
      content = (
        <HandoverWizard
          tool={route.tool}
          action={route.action}
          onDone={() => setRoute({ name: 'scan' })}
          onCancel={() => setRoute({ name: 'tool', tool: route.tool })}
        />
      );
    } else if (route.name === 'unknown') {
      content = (
        <UnknownCodeScreen code={route.code} onScanAgain={() => setRoute({ name: 'scan' })} />
      );
    } else {
      content = (
        <ScanScreen
          onTool={(tool) => setRoute({ name: 'tool', tool })}
          onUnknown={(code) => setRoute({ name: 'unknown', code })}
          onSignOut={() => void supabase.auth.signOut()}
        />
      );
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: rnTheme.colors.ink }}>
      {content}
      <StatusBar style="light" />
    </View>
  );
}
