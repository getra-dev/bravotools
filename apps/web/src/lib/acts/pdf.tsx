import { existsSync } from 'node:fs';
import {
  Document,
  Font,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { tokens } from '@bravotools/theme';

// LOCAL-FIRST: register a system TTF with Lithuanian glyph coverage.
// Before the ADR-014 promotion gate this must become a bundled licensed
// font (Helvetica base-14 has no ą/č/ę/ė/į/š/ų/ū/ž).
const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Verdana.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];
const fontFile = FONT_CANDIDATES.find((p) => existsSync(p));
if (fontFile) {
  Font.register({ family: 'Body', src: fontFile });
}
const FAMILY = fontFile ? 'Body' : 'Helvetica';

export type SignatureStrokes = {
  width: number;
  height: number;
  strokes: { x: number; y: number }[][];
};

export type ActPdfData = {
  labels: Record<
    | 'title' | 'tool' | 'serial' | 'qr' | 'giver' | 'receiver' | 'components'
    | 'included' | 'missing' | 'note' | 'photos' | 'gps' | 'signatureGiver'
    | 'signatureReceiver' | 'generated' | 'action' | 'giverNote' | 'receiverNote'
    | 'conditionPhotos',
    string
  >;
  orgName: string;
  actNumber: string;
  date: string;
  actionLabel: string;
  toolName: string;
  toolQr: string;
  toolSerial: string;
  giverName: string;
  receiverName: string;
  components: { name: string; included: boolean; note: string }[];
  photoCount: number;
  gps: string;
  giverNote: string;
  receiverNote: string;
  photos: { dataUri: string; caption: string }[];
  giverSignature: SignatureStrokes | null;
  receiverSignature: SignatureStrokes | null;
};

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 10, padding: 40, color: tokens.color.ink },
  mono: { fontSize: 8, letterSpacing: 1.2, color: tokens.color.dim, textTransform: 'uppercase' },
  actNumber: { fontSize: 20, fontWeight: 700, marginTop: 4 },
  section: { marginTop: 18 },
  h2: { fontSize: 8, letterSpacing: 1.2, color: tokens.color.dim, textTransform: 'uppercase', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  bold: { fontWeight: 700 },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.color.line,
    paddingVertical: 4,
  },
  sigBox: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: tokens.color.line,
    borderRadius: 4,
    padding: 8,
    minHeight: 90,
  },
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

function scaleStrokes(sig: SignatureStrokes, width: number, height: number): string[] {
  const sx = width / (sig.width || 1);
  const sy = height / (sig.height || 1);
  const k = Math.min(sx, sy);
  return sig.strokes
    .filter((stroke) => stroke.length > 1)
    .map((stroke) =>
      stroke
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x * k).toFixed(1)} ${(p.y * k).toFixed(1)}`)
        .join(' '),
    );
}

function Signature({ sig }: { sig: SignatureStrokes | null }) {
  if (!sig) return null;
  const paths = scaleStrokes(sig, 200, 60);
  return (
    <Svg width={200} height={60} viewBox="0 0 200 60">
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke={tokens.color.ink} strokeWidth={1.4} fill="none" />
      ))}
    </Svg>
  );
}

export async function renderActPdf(data: ActPdfData): Promise<Buffer> {
  const { labels } = data;
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.mono}>{data.orgName}</Text>
        <Text style={s.mono}>{labels.title}</Text>
        <Text style={s.actNumber}>{data.actNumber}</Text>
        <Text style={{ marginTop: 2, color: tokens.color.dim }}>
          {data.date} · {data.actionLabel}
        </Text>

        <View style={s.section}>
          <Text style={s.h2}>{labels.tool}</Text>
          <View style={s.row}>
            <Text style={s.bold}>{data.toolName}</Text>
            <Text>{data.toolQr}</Text>
          </View>
          <View style={s.row}>
            <Text>{labels.serial}</Text>
            <Text>{data.toolSerial}</Text>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.h2}>{labels.giver}</Text>
              <Text style={s.bold}>{data.giverName}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.h2}>{labels.receiver}</Text>
              <Text style={s.bold}>{data.receiverName}</Text>
            </View>
          </View>
        </View>

        {data.components.length > 0 ? (
          <View style={s.section}>
            <Text style={s.h2}>{labels.components}</Text>
            {data.components.map((c, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={{ flex: 2 }}>{c.name}</Text>
                <Text style={{ flex: 1, color: c.included ? tokens.color.ok : tokens.color.hot }}>
                  {c.included ? labels.included : labels.missing}
                </Text>
                <Text style={{ flex: 2, color: tokens.color.dim }}>{c.note}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.section}>
          <View style={s.row}>
            <Text>{labels.photos}</Text>
            <Text>
              {labels.gps}: {data.gps}
            </Text>
          </View>
        </View>

        {data.giverNote || data.receiverNote ? (
          <View style={s.section}>
            {data.giverNote ? (
              <View style={{ marginBottom: 4 }}>
                <Text style={s.h2}>{labels.giverNote}</Text>
                <Text>{data.giverNote}</Text>
              </View>
            ) : null}
            {data.receiverNote ? (
              <View>
                <Text style={s.h2}>{labels.receiverNote}</Text>
                <Text>{data.receiverNote}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {data.photos.length > 0 ? (
          <View style={s.section}>
            <Text style={s.h2}>{labels.conditionPhotos}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {data.photos.map((photo, i) => (
                <View key={i} style={{ width: 120 }}>
                  <Image src={photo.dataUri} style={{ width: 120, height: 90, objectFit: 'cover' }} />
                  <Text style={{ fontSize: 6, color: tokens.color.dim, marginTop: 2 }}>
                    {photo.caption}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={[s.section, { flexDirection: 'row', gap: 12 }]}>
          <View style={s.sigBox}>
            <Text style={s.h2}>{labels.signatureGiver}</Text>
            <Signature sig={data.giverSignature} />
            <Text style={{ marginTop: 4 }}>{data.giverName}</Text>
          </View>
          <View style={s.sigBox}>
            <Text style={s.h2}>{labels.signatureReceiver}</Text>
            <Signature sig={data.receiverSignature} />
            <Text style={{ marginTop: 4 }}>{data.receiverName}</Text>
          </View>
        </View>

        <Text style={s.footer}>{labels.generated}</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
