import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from './theme';
import { live } from './tokens';

export type Verdict = 'pass' | 'fail' | 'unknown';

export interface VerdictMarkProps {
  verdict: Verdict;
  /** Ytterstorlek i pt. Lista 30 (standard), livesession 52. */
  size?: number;
  /** Livesessionens färger (alltid mörk bakgrund, läses på avstånd). */
  onLive?: boolean;
  style?: StyleProp<ViewStyle>;
}

const LABELS: Record<Verdict, string> = { pass: 'Godkänd', fail: 'Miss', unknown: 'Kan inte avgöras' };

/**
 * Domtecken — domen bärs av FORM, inte färg (d1 README): godkänd = rund bricka med bock,
 * miss = rundad fyrkant med kryss, kan inte avgöras = streckad ring med ?. Glyferna är
 * skissens i-check / i-x / i-q (viewBox 16).
 */
export function VerdictMark({ verdict, size = 30, onLive, style }: VerdictMarkProps) {
  const { colors } = useTheme();
  const glyph = Math.round(size * (size >= 48 ? 28 / 52 : 16 / 30));
  const fg =
    verdict === 'pass' ? (onLive ? live.pass : colors.pass) : verdict === 'fail' ? (onLive ? live.fail : colors.fail) : onLive ? live.unk : colors.unk;
  const bg = verdict === 'pass' ? (onLive ? live.passTint : colors.passTint) : verdict === 'fail' ? (onLive ? live.failTint : colors.failTint) : 'transparent';
  const r = verdict === 'fail' ? size * 0.3 : size / 2;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={LABELS[verdict]}
      style={[
        { width: size, height: size, borderRadius: r, borderCurve: 'continuous', backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      {verdict === 'unknown' ? (
        // Streckad ring i SVG: RN:s borderStyle 'dashed' + radie är opålitlig på Android.
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size / 2} cy={size / 2} r={size / 2 - 0.75 * (size / 30)} stroke={fg} strokeWidth={1.5 * (size / 30)} strokeDasharray={`${size / 10} ${size / 15}`} fill="none" />
        </Svg>
      ) : null}
      <Svg width={glyph} height={glyph} viewBox="0 0 16 16">
        {verdict === 'pass' ? (
          <Path d="M3.2 8.4 6.4 11.4 12.8 4.6" fill="none" stroke={fg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        ) : verdict === 'fail' ? (
          <Path d="M4.5 4.5 11.5 11.5 M11.5 4.5 4.5 11.5" fill="none" stroke={fg} strokeWidth={2.2} strokeLinecap="round" />
        ) : (
          <>
            <Path d="M5.6 6.1a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.7" fill="none" stroke={fg} strokeWidth={2} strokeLinecap="round" />
            <Circle cx={8} cy={12.6} r={1.15} fill={fg} />
          </>
        )}
      </Svg>
    </View>
  );
}
