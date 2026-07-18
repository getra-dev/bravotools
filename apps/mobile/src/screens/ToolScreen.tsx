import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  tool,
  onScanAgain,
  onHandover,
}: {
  tool: ScannedTool;
  onScanAgain: () => void;
  onHandover: (action: HandoverAction) => void;
}) {
  const { t } = useTranslation();
  const statusColor = STATUS_COLOR[tool.status] ?? theme.colors.dim;
  const holderName = tool.holder?.full_name ?? tool.external_holder?.full_name ?? null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.ink }} contentContainerStyle={ui.screen}>
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
