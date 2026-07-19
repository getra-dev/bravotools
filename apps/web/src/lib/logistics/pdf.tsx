import { existsSync } from 'node:fs';
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { tokens } from '@bravotools/theme';

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Verdana.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];
const fontFile = FONT_CANDIDATES.find((p) => existsSync(p));
if (fontFile) Font.register({ family: 'RouteBody', src: fontFile });
const FAMILY = fontFile ? 'RouteBody' : 'Helvetica';

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 10, padding: 36, color: tokens.color.ink },
  mono: { fontSize: 8, letterSpacing: 1.2, color: tokens.color.dim, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: 700, marginTop: 4 },
  meta: { marginTop: 2, color: tokens.color.dim },
  section: { marginTop: 16 },
  h2: { fontSize: 8, letterSpacing: 1.2, color: tokens.color.dim, textTransform: 'uppercase', marginBottom: 4 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: tokens.color.ink, paddingBottom: 3, marginBottom: 2 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: tokens.color.line, paddingVertical: 3 },
  cDesc: { flex: 1 },
  cQty: { width: 60, textAlign: 'right' },
  cWt: { width: 70, textAlign: 'right' },
  stop: { marginTop: 12, borderWidth: 0.5, borderColor: tokens.color.line, borderRadius: 4, padding: 8 },
  stopHead: { flexDirection: 'row', justifyContent: 'space-between' },
  bold: { fontWeight: 700 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  logCell: { flex: 1 },
  fill: { borderBottomWidth: 0.5, borderBottomColor: tokens.color.dim, height: 14, marginTop: 10 },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, fontSize: 7, color: tokens.color.dim, textAlign: 'center' },
});

type Line = { description: string; qty: number; unit: string; weightKg: number | null };

export type PickListData = {
  labels: {
    title: string; date: string; vehicle: string; driver: string;
    pickup: string; material: string; qty: string; weight: string; total: string; generated: string;
  };
  orgName: string;
  dateText: string;
  vehicleName: string;
  driverName: string;
  groups: { pickup: string; lines: Line[] }[];
};

export async function renderPickList(d: PickListData): Promise<Buffer> {
  const { labels } = d;
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.mono}>{d.orgName}</Text>
        <Text style={s.title}>{labels.title}</Text>
        <Text style={s.meta}>
          {labels.date}: {d.dateText}   ·   {labels.vehicle}: {d.vehicleName}
          {d.driverName ? `   ·   ${labels.driver}: ${d.driverName}` : ''}
        </Text>

        {d.groups.map((g, gi) => {
          const total = g.lines.reduce((sum, l) => sum + (l.weightKg ?? 0) * l.qty, 0);
          return (
            <View key={gi} style={s.section}>
              <Text style={s.h2}>
                {labels.pickup}: {g.pickup}
              </Text>
              <View style={s.th}>
                <Text style={[s.cDesc, s.mono]}>{labels.material}</Text>
                <Text style={[s.cQty, s.mono]}>{labels.qty}</Text>
                <Text style={[s.cWt, s.mono]}>{labels.weight}</Text>
              </View>
              {g.lines.map((l, li) => (
                <View key={li} style={s.tr}>
                  <Text style={s.cDesc}>{l.description}</Text>
                  <Text style={s.cQty}>
                    {l.qty} {l.unit}
                  </Text>
                  <Text style={s.cWt}>{l.weightKg != null ? `${(l.weightKg * l.qty).toFixed(0)} kg` : '—'}</Text>
                </View>
              ))}
              {total > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                  <Text style={s.bold}>{`${labels.total}: ${total.toFixed(0)} kg`}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
        <Text style={s.footer}>{labels.generated}</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

export type TripSheetData = {
  labels: {
    title: string; date: string; vehicle: string; plate: string; driver: string;
    stop: string; order: string; odoStart: string; odoEnd: string; km: string; generated: string;
  };
  orgName: string;
  dateText: string;
  vehicleName: string;
  plate: string;
  driverName: string;
  stops: { seq: number; site: string; address: string; orderNumber: string; lines: Line[] }[];
};

export async function renderTripSheet(d: TripSheetData): Promise<Buffer> {
  const { labels } = d;
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.mono}>{d.orgName}</Text>
        <Text style={s.title}>{labels.title}</Text>
        <Text style={s.meta}>
          {labels.date}: {d.dateText}   ·   {labels.vehicle}: {d.vehicleName}
          {d.plate ? ` (${d.plate})` : ''}   ·   {labels.driver}: {d.driverName || '—'}
        </Text>

        {d.stops.map((stop, i) => (
          <View key={i} style={s.stop}>
            <View style={s.stopHead}>
              <Text style={s.bold}>
                {labels.stop} {stop.seq}: {stop.site}
              </Text>
              <Text style={s.mono}>
                {labels.order} {stop.orderNumber}
              </Text>
            </View>
            {stop.address ? <Text style={{ color: tokens.color.dim }}>{stop.address}</Text> : null}
            {stop.lines.map((l, li) => (
              <View key={li} style={{ flexDirection: 'row', marginTop: 2 }}>
                <Text style={s.cDesc}>{l.description}</Text>
                <Text style={s.cQty}>
                  {l.qty} {l.unit}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={[s.section, s.logRow]}>
          <View style={s.logCell}>
            <Text style={s.h2}>{labels.odoStart}</Text>
            <View style={s.fill} />
          </View>
          <View style={s.logCell}>
            <Text style={s.h2}>{labels.odoEnd}</Text>
            <View style={s.fill} />
          </View>
          <View style={s.logCell}>
            <Text style={s.h2}>{labels.km}</Text>
            <View style={s.fill} />
          </View>
        </View>

        <Text style={s.footer}>{labels.generated}</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
