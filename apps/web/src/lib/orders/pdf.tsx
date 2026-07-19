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

// LOCAL-FIRST: same system-TTF story as the act PDF — swap for a bundled
// licensed font on the ADR-014 promotion gate (LT glyph coverage).
const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Verdana.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];
const fontFile = FONT_CANDIDATES.find((p) => existsSync(p));
if (fontFile) {
  Font.register({ family: 'OrderBody', src: fontFile });
}
const FAMILY = fontFile ? 'OrderBody' : 'Helvetica';

export type OrderPdfData = {
  labels: Record<
    | 'title' | 'orderNo' | 'date' | 'neededBy' | 'vendor' | 'shipTo' | 'buyer'
    | 'lineNo' | 'description' | 'qty' | 'unit' | 'unitPrice' | 'lineTotal'
    | 'total' | 'notes' | 'generated' | 'hot',
    string
  >;
  orgName: string;
  orderNumber: string;
  date: string;
  neededBy: string;
  isHot: boolean;
  vendorName: string;
  shipTo: string;
  buyerName: string;
  notes: string;
  currency: string;
  lines: {
    description: string;
    qty: number;
    unit: string;
    unitPrice: number | null;
  }[];
};

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 10, padding: 40, color: tokens.color.ink },
  mono: { fontSize: 8, letterSpacing: 1.2, color: tokens.color.dim, textTransform: 'uppercase' },
  orderNo: { fontSize: 20, fontWeight: 700, marginTop: 4 },
  hot: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1,
    color: tokens.color.hot,
    marginTop: 4,
  },
  section: { marginTop: 18 },
  h2: { fontSize: 8, letterSpacing: 1.2, color: tokens.color.dim, textTransform: 'uppercase', marginBottom: 4 },
  cols: { flexDirection: 'row', justifyContent: 'space-between' },
  bold: { fontWeight: 700 },
  th: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.ink,
    paddingBottom: 4,
    marginBottom: 2,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.color.line,
    paddingVertical: 4,
  },
  cNo: { width: 24 },
  cDesc: { flex: 1 },
  cQty: { width: 44, textAlign: 'right' },
  cUnit: { width: 40, textAlign: 'right' },
  cPrice: { width: 64, textAlign: 'right' },
  cTotal: { width: 70, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: tokens.color.dim,
    textAlign: 'center',
  },
});

function money(n: number, currency: string): string {
  return `${n.toFixed(2)} ${currency}`;
}

export async function renderOrderPdf(data: OrderPdfData): Promise<Buffer> {
  const { labels } = data;
  const hasPrices = data.lines.some((l) => l.unitPrice != null);
  const total = data.lines.reduce(
    (sum, l) => sum + (l.unitPrice != null ? l.unitPrice * l.qty : 0),
    0,
  );

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.mono}>{data.orgName}</Text>
        <Text style={s.mono}>{labels.title}</Text>
        <Text style={s.orderNo}>{data.orderNumber}</Text>
        {data.isHot ? <Text style={s.hot}>{labels.hot}</Text> : null}
        <Text style={{ marginTop: 2, color: tokens.color.dim }}>
          {labels.date}: {data.date}
          {data.neededBy ? `   ·   ${labels.neededBy}: ${data.neededBy}` : ''}
        </Text>

        <View style={[s.section, s.cols]}>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>{labels.vendor}</Text>
            <Text style={s.bold}>{data.vendorName}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>{labels.shipTo}</Text>
            <Text style={s.bold}>{data.shipTo}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>{labels.buyer}</Text>
            <Text style={s.bold}>{data.buyerName}</Text>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.th}>
            <Text style={[s.cNo, s.h2, { marginBottom: 0 }]}>{labels.lineNo}</Text>
            <Text style={[s.cDesc, s.h2, { marginBottom: 0 }]}>{labels.description}</Text>
            <Text style={[s.cQty, s.h2, { marginBottom: 0 }]}>{labels.qty}</Text>
            <Text style={[s.cUnit, s.h2, { marginBottom: 0 }]}>{labels.unit}</Text>
            {hasPrices ? (
              <>
                <Text style={[s.cPrice, s.h2, { marginBottom: 0 }]}>{labels.unitPrice}</Text>
                <Text style={[s.cTotal, s.h2, { marginBottom: 0 }]}>{labels.lineTotal}</Text>
              </>
            ) : null}
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={s.tr}>
              <Text style={s.cNo}>{i + 1}</Text>
              <Text style={s.cDesc}>{line.description}</Text>
              <Text style={s.cQty}>{line.qty}</Text>
              <Text style={s.cUnit}>{line.unit}</Text>
              {hasPrices ? (
                <>
                  <Text style={s.cPrice}>
                    {line.unitPrice != null ? money(line.unitPrice, data.currency) : '—'}
                  </Text>
                  <Text style={s.cTotal}>
                    {line.unitPrice != null ? money(line.unitPrice * line.qty, data.currency) : '—'}
                  </Text>
                </>
              ) : null}
            </View>
          ))}
          {hasPrices ? (
            <View style={s.totalRow}>
              <Text style={s.bold}>
                {labels.total}: {money(total, data.currency)}
              </Text>
            </View>
          ) : null}
        </View>

        {data.notes ? (
          <View style={s.section}>
            <Text style={s.h2}>{labels.notes}</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={s.footer}>{labels.generated}</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
