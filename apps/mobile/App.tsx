import { useEffect, useState } from 'react';
import { Platform, SafeAreaView, StatusBar as RNStatusBar, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { rnTheme } from '@bravotools/theme';
import './src/i18n';
import { supabase } from './src/lib/supabase';
import { LoginScreen } from './src/screens/LoginScreen';
import { MyScreen } from './src/screens/MyScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ToolScreen } from './src/screens/ToolScreen';
import { HandoverWizard } from './src/screens/HandoverWizard';
import { CountersignScreen } from './src/screens/CountersignScreen';
import { UnknownCodeScreen } from './src/screens/UnknownCodeScreen';
import type { HandoverAction, ScannedTool } from './src/types';

type Route =
  | { name: 'my' }
  | { name: 'scan' }
  | { name: 'search' }
  | { name: 'tool'; tool: ScannedTool }
  | { name: 'handover'; tool: ScannedTool; action: HandoverAction }
  | { name: 'countersign'; actId: string }
  | { name: 'unknown'; code: string };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'my' });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setRoute({ name: 'my' });
    });
    return () => subscription.unsubscribe();
  }, []);

  let content = null;
  if (ready) {
    if (!session) {
      content = <LoginScreen />;
    } else if (route.name === 'scan') {
      content = (
        <ScanScreen
          onTool={(tool) => setRoute({ name: 'tool', tool })}
          onUnknown={(code) => setRoute({ name: 'unknown', code })}
          onSearch={() => setRoute({ name: 'search' })}
          onBack={() => setRoute({ name: 'my' })}
        />
      );
    } else if (route.name === 'search') {
      content = (
        <SearchScreen
          onTool={(tool) => setRoute({ name: 'tool', tool })}
          onBack={() => setRoute({ name: 'scan' })}
        />
      );
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
          onDone={() => setRoute({ name: 'my' })}
          onCancel={() => setRoute({ name: 'tool', tool: route.tool })}
        />
      );
    } else if (route.name === 'countersign') {
      content = (
        <CountersignScreen actId={route.actId} onDone={() => setRoute({ name: 'my' })} />
      );
    } else if (route.name === 'unknown') {
      content = (
        <UnknownCodeScreen code={route.code} onScanAgain={() => setRoute({ name: 'scan' })} />
      );
    } else {
      content = (
        <MyScreen
          userId={session.user.id}
          onScan={() => setRoute({ name: 'scan' })}
          onCountersign={(actId) => setRoute({ name: 'countersign', actId })}
          onSignOut={() => void supabase.auth.signOut()}
        />
      );
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: rnTheme.colors.ink }}>
      {/* keep content below the notch / status bar on both platforms */}
      <SafeAreaView
        style={{
          flex: 1,
          paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
        }}
      >
        {content}
      </SafeAreaView>
      <StatusBar style="light" />
    </View>
  );
}
