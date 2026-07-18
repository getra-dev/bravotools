import { useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { theme, ui } from '../ui';
import type { SignatureStrokes } from '../types';

const PAD_HEIGHT = 220;

export function SignaturePad({
  title,
  onDone,
}: {
  title: string;
  onDone: (signature: SignatureStrokes) => void;
}) {
  const { t } = useTranslation();
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const currentStroke = useRef<{ x: number; y: number }[]>([]);
  const [, forceRender] = useState(0);
  const widthRef = useRef(300);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // win the gesture against the parent ScrollView and never yield it
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        currentStroke.current = [
          { x: evt.nativeEvent.locationX, y: evt.nativeEvent.locationY },
        ];
        forceRender((n) => n + 1);
      },
      onPanResponderMove: (evt) => {
        currentStroke.current.push({
          x: evt.nativeEvent.locationX,
          y: evt.nativeEvent.locationY,
        });
        forceRender((n) => n + 1);
      },
      onPanResponderRelease: () => {
        if (currentStroke.current.length > 1) {
          setStrokes((prev) => [...prev, currentStroke.current]);
        }
        currentStroke.current = [];
      },
    }),
  ).current;

  const allStrokes = currentStroke.current.length > 1 ? [...strokes, currentStroke.current] : strokes;

  return (
    <View>
      <Text style={ui.label}>{title}</Text>
      <Text style={[ui.mono, { marginTop: 4 }]}>{t('mobile.handover.signHint')}</Text>
      <View
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        {...responder.panHandlers}
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
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Pressable
          style={[ui.secondaryButton, { flex: 1 }]}
          onPress={() => {
            setStrokes([]);
            currentStroke.current = [];
            forceRender((n) => n + 1);
          }}
        >
          <Text style={ui.secondaryButtonText}>{t('mobile.handover.clear')}</Text>
        </Pressable>
        <Pressable
          style={[ui.primaryButton, { flex: 2, marginTop: theme.spacing.md }, strokes.length === 0 && { opacity: 0.4 }]}
          disabled={strokes.length === 0}
          onPress={() =>
            onDone({ width: widthRef.current, height: PAD_HEIGHT, strokes })
          }
        >
          <Text style={ui.primaryButtonText}>{t('mobile.handover.next')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
