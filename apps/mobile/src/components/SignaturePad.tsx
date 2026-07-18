import { useRef, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { theme, ui } from '../ui';
import type { SignatureStrokes } from '../types';

const PAD_HEIGHT = 220;

// Raw touch events instead of PanResponder: nothing can steal or cancel
// them mid-stroke (the wizard ScrollView is scroll-disabled while signing).
export function SignaturePad({
  title,
  onDone,
}: {
  title: string;
  onDone: (signature: SignatureStrokes) => void;
}) {
  const { t } = useTranslation();
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const [live, setLive] = useState<{ x: number; y: number }[]>([]);
  const drawing = useRef(false);
  const widthRef = useRef(300);

  function point(evt: GestureResponderEvent) {
    return { x: evt.nativeEvent.locationX, y: evt.nativeEvent.locationY };
  }

  function onTouchStart(evt: GestureResponderEvent) {
    drawing.current = true;
    setLive([point(evt)]);
  }

  function onTouchMove(evt: GestureResponderEvent) {
    if (!drawing.current) return;
    const p = point(evt);
    setLive((prev) => [...prev, p]);
  }

  const liveRef = useRef<{ x: number; y: number }[]>([]);
  liveRef.current = live;

  function onTouchEnd() {
    drawing.current = false;
    const finished = liveRef.current;
    if (finished.length > 1) setStrokes((prev) => [...prev, finished]);
    setLive([]);
  }

  const allStrokes = live.length > 1 ? [...strokes, live] : strokes;

  return (
    <View>
      <Text style={ui.label}>{title}</Text>
      <Text style={[ui.mono, { marginTop: 4 }]}>{t('mobile.handover.signHint')}</Text>
      <View
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          height: PAD_HEIGHT,
          marginTop: theme.spacing.md,
          borderRadius: theme.radius.card,
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.paper,
          overflow: 'hidden',
        }}
      >
        <View pointerEvents="none" style={{ flex: 1 }}>
          <Svg width="100%" height={PAD_HEIGHT}>
            {allStrokes.map((stroke, i) => (
              <Polyline
                key={i}
                points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={theme.colors.ink}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
      </View>
      <Text style={[ui.mono, { marginTop: 4 }]}>
        {`${strokes.length} / ${live.length}`}
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Pressable
          style={[ui.secondaryButton, { flex: 1 }]}
          onPress={() => {
            setStrokes([]);
            setLive([]);
            drawing.current = false;
          }}
        >
          <Text style={ui.secondaryButtonText}>{t('mobile.handover.clear')}</Text>
        </Pressable>
        <Pressable
          style={[
            ui.primaryButton,
            { flex: 2, marginTop: theme.spacing.md },
            strokes.length === 0 && { opacity: 0.4 },
          ]}
          disabled={strokes.length === 0}
          onPress={() => onDone({ width: widthRef.current, height: PAD_HEIGHT, strokes })}
        >
          <Text style={ui.primaryButtonText}>{t('mobile.handover.next')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
