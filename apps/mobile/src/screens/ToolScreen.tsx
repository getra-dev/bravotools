import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { theme, ui } from '../ui';
import type { HandoverAction, ScannedTool } from '../types';

const STATUS_COLOR: Record<string, string> = {
  available: theme.colors.ok,
  checked_out: theme.colors.paper,
  in_service: theme.colors.hi,
  lost: theme.colors.hot,
  written_off: theme.colors.dim,
  returned_to_vendor: theme.colors.dim,
};

export function ToolScreen({
  tool: initialTool,
  onScanAgain,
  onHandover,
}: {
  tool: ScannedTool;
  onScanAgain: () => void;
  onHandover: (action: HandoverAction) => void;
}) {
  const { t } = useTranslation();
  const [tool, setTool] = useState(initialTool);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => setTool(initialTool), [initialTool]);

  async function refresh() {
    setRefreshing(true);
    const { data } = await supabase
      .from('tools')
      .select(
        `id, org_id, name, qr_code, status, serial_number, tracks_engine_hours, engine_hours,
         category:tool_categories(name),
         location:locations!tools_current_location_id_fkey(name),
         holder:profiles!tools_current_holder_id_fkey(full_name),
         external_holder:external_persons!tools_current_external_holder_id_fkey(full_name)`,
      )
      .eq('id', initialTool.id)
      .maybeSingle();
    if (data) setTool(data as ScannedTool);
    setRefreshing(false);
  }

  const statusColor = STATUS_COLOR[tool.status] ?? theme.colors.dim;
  const holderName = tool.holder?.full_name ?? tool.external_holder?.full_name ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.ink }}
      contentContainerStyle={ui.screen}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={theme.colors.hi}
        />
      }
    >
      <Text style={ui.mono}>{tool.qr_code}</Text>
      <Text style={ui.title}>{tool.name}</Text>

      <View style={[ui.stamp, { borderColor: statusColor }]}>
        <Text style={[ui.stampText, { color: statusColor }]}>
          {t(`tools.status.${tool.status}`)}
        </Text>
      </View>

      {holderName ? (
        <>
          <Text style={ui.label}>{t('mobile.tool.holder')}</Text>
          <Text style={ui.value}>{holderName}</Text>
        </>
      ) : null}
      {tool.location?.name ? (
        <>
          <Text style={ui.label}>{t('mobile.tool.location')}</Text>
          <Text style={ui.value}>{tool.location.name}</Text>
        </>
      ) : null}
      {tool.category?.name ? (
        <>
          <Text style={ui.label}>{t('mobile.tool.category')}</Text>
          <Text style={ui.value}>{tool.category.name}</Text>
        </>
      ) : null}
      {tool.serial_number ? (
        <>
          <Text style={ui.label}>{t('mobile.tool.serial')}</Text>
          <Text style={ui.value}>{tool.serial_number}</Text>
        </>
      ) : null}

      {tool.status === 'available' ? (
        <Pressable style={ui.primaryButton} onPress={() => onHandover('checkout')}>
          <Text style={ui.primaryButtonText}>{t('mobile.tool.actionHandOver')}</Text>
        </Pressable>
      ) : null}
      {tool.status === 'checked_out' ? (
        <>
          <Pressable style={ui.primaryButton} onPress={() => onHandover('checkin')}>
            <Text style={ui.primaryButtonText}>{t('mobile.handover.titleCheckin')}</Text>
          </Pressable>
          <Pressable style={ui.secondaryButton} onPress={() => onHandover('transfer')}>
            <Text style={ui.secondaryButtonText}>{t('mobile.handover.titleTransfer')}</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable style={ui.secondaryButton} onPress={onScanAgain}>
        <Text style={ui.secondaryButtonText}>{t('mobile.tool.scanAgain')}</Text>
      </Pressable>
    </ScrollView>
  );
}
