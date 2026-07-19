import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme, ui } from '../ui';
import { fetchToolById, searchTools, type ToolSearchRow } from '../lib/tools';
import type { ScannedTool } from '../types';

export function SearchScreen({
  onTool,
  onBack,
}: {
  onTool: (tool: ScannedTool) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ToolSearchRow[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const results = await searchTools(query);
        setRows(results);
        setSearched(query.trim().length >= 2);
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function open(row: ToolSearchRow) {
    const tool = await fetchToolById(row.id);
    if (tool) onTool(tool);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.ink }}>
      <ScrollView contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}>
        <Text style={ui.brand}>{t('common.appName')}</Text>
        <Text style={ui.title}>{t('mobile.search.title')}</Text>
        <Text style={[ui.mono, { marginTop: 4 }]}>{t('mobile.search.hint')}</Text>

        <TextInput
          style={[ui.input, { marginTop: theme.spacing.lg }]}
          value={query}
          onChangeText={setQuery}
          placeholder={t('mobile.search.placeholder')}
          placeholderTextColor={theme.colors.dim}
          autoFocus
          autoCapitalize="none"
        />

        {rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => void open(row)}
            style={{
              marginTop: theme.spacing.sm,
              borderRadius: theme.radius.button,
              borderWidth: 1,
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.panel2,
              padding: theme.spacing.lg,
            }}
          >
            <Text style={{ color: theme.colors.paper, fontSize: 16, fontWeight: '600' }}>
              {row.name}
            </Text>
            <Text style={[ui.mono, { marginTop: 4 }]}>
              {[row.qr_code, row.serial_number, row.inventory_code].filter(Boolean).join(' · ')}
            </Text>
            <Text style={[ui.mono, { marginTop: 2, color: theme.colors.steel }]}>
              {t(`tools.status.${row.status}`)}
            </Text>
          </Pressable>
        ))}
        {searched && rows.length === 0 ? (
          <Text style={[ui.mono, { marginTop: theme.spacing.lg }]}>{t('mobile.search.empty')}</Text>
        ) : null}

        <Pressable style={ui.secondaryButton} onPress={onBack}>
          <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
