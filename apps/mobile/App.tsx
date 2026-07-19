import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { rnTheme } from '@bravotools/theme';
import * as Network from 'expo-network';
import './src/i18n';
import { supabase } from './src/lib/supabase';
import { syncOutbox } from './src/lib/outbox';
import { LoginScreen } from './src/screens/LoginScreen';
import { MyScreen } from './src/screens/MyScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ToolScreen } from './src/screens/ToolScreen';
import { HandoverWizard } from './src/screens/HandoverWizard';
import { CountersignScreen } from './src/screens/CountersignScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { RequestsScreen } from './src/screens/RequestsScreen';
import { ReceiveOrderScreen } from './src/screens/ReceiveOrderScreen';
import { RentalIntakeScreen } from './src/screens/RentalIntakeScreen';
import { ReturnVendorScreen } from './src/screens/ReturnVendorScreen';
import { UnknownCodeScreen } from './src/screens/UnknownCodeScreen';
import { fetchToolById } from './src/lib/tools';
import type { HandoverAction, IncomingOrder, ScannedTool } from './src/types';

type Route =
  | { name: 'my' }
  | { name: 'requests' }
  | { name: 'receiveOrder'; order: IncomingOrder }
  | { name: 'scan' }
  | { name: 'search' }
  | { name: 'tool'; tool: ScannedTool }
  | { name: 'handover'; tool: ScannedTool; action: HandoverAction }
  | { name: 'countersign'; actId: string }
  | { name: 'inventory' }
  | { name: 'rentalIntake' }
  | { name: 'returnVendor'; tool: ScannedTool }
  | { name: 'unknown'; code: string };

// Bottom tabs (SPEC mobile IA): shown only on the two top-level screens so
// flows (scan/handover/countersign) keep the full screen.
function TabBar({
  active,
  onSelect,
}: {
  active: 'my' | 'requests';
  onSelect: (tab: 'my' | 'requests') => void;
}) {
  const { t } = useTranslation();
  const tabs = [
    { key: 'my' as const, label: t('mobile.tabs.my') },
    { key: 'requests' as const, label: t('mobile.tabs.requests') },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: rnTheme.colors.line,
        backgroundColor: rnTheme.colors.panel2,
      }}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}
        >
          <Text
            style={{
              color: active === tab.key ? rnTheme.colors.hi : rnTheme.colors.dim,
              fontWeight: active === tab.key ? '800' : '600',
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'my' });
  // requests screen reports when its form/detail takes the full screen
  const [requestsImmersive, setRequestsImmersive] = useState(false);

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

  // SPEC 2.6: replay the outbox when connectivity returns + on a slow tick
  useEffect(() => {
    if (!session) return;
    void syncOutbox();
    const networkSub = Network.addNetworkStateListener((state) => {
      if (state.isConnected) void syncOutbox();
    });
    const timer = setInterval(() => void syncOutbox(), 30_000);
    return () => {
      networkSub.remove();
      clearInterval(timer);
    };
  }, [session]);

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
          onReturnVendor={(tool) => setRoute({ name: 'returnVendor', tool })}
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
    } else if (route.name === 'inventory') {
      content = <InventoryScreen onDone={() => setRoute({ name: 'my' })} />;
    } else if (route.name === 'rentalIntake') {
      content = <RentalIntakeScreen onDone={() => setRoute({ name: 'my' })} />;
    } else if (route.name === 'returnVendor') {
      content = (
        <ReturnVendorScreen
          tool={route.tool}
          onDone={() => setRoute({ name: 'my' })}
          onCancel={() => setRoute({ name: 'tool', tool: route.tool })}
        />
      );
    } else if (route.name === 'requests') {
      content = (
        <RequestsScreen
          userId={session.user.id}
          onImmersive={setRequestsImmersive}
          onReceiveOrder={(order) => setRoute({ name: 'receiveOrder', order })}
        />
      );
    } else if (route.name === 'receiveOrder') {
      content = (
        <ReceiveOrderScreen
          order={route.order}
          onDone={() => setRoute({ name: 'requests' })}
          onCancel={() => setRoute({ name: 'requests' })}
        />
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
          onOpenTool={(toolId) => {
            void fetchToolById(toolId).then((tool) => {
              if (tool) setRoute({ name: 'tool', tool });
            });
          }}
          onInventory={() => setRoute({ name: 'inventory' })}
          onRentalIntake={() => setRoute({ name: 'rentalIntake' })}
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
        {session &&
        (route.name === 'my' || (route.name === 'requests' && !requestsImmersive)) ? (
          <TabBar
            active={route.name}
            onSelect={(tab) => setRoute(tab === 'my' ? { name: 'my' } : { name: 'requests' })}
          />
        ) : null}
      </SafeAreaView>
      <StatusBar style="light" />
    </View>
  );
}
