// Tab bar icons, path-for-path from docs/design/d1-v2/index.html (#t-swing … #t-history).

import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { TabParamList } from './routes';

export function TabIcon({ tab, color, size = 26 }: { tab: keyof TabParamList; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      {tab === 'Swing' && (
        <>
          <Path d="M7 21.5 15.5 5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Path d="M5 22h5" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
          <Circle cx={19} cy={20.5} r={2.3} fill={color} />
        </>
      )}
      {tab === 'Session' && (
        <>
          <Path d="M5 15v-2.5a8 8 0 0 1 16 0V15" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Rect x={3.5} y={14} width={5} height={7.5} rx={2} fill={color} />
          <Rect x={17.5} y={14} width={5} height={7.5} rx={2} fill={color} />
        </>
      )}
      {tab === 'Rules' && (
        <>
          <Rect x={4.5} y={3.5} width={17} height={19} rx={4} fill="none" stroke={color} strokeWidth={2} />
          <Path
            d="m8.5 9.5 1.5 1.5 3-3M8.5 16.5l1.5 1.5 3-3M15.5 10h2.5M15.5 17h2.5"
            fill="none"
            stroke={color}
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {tab === 'History' && (
        <>
          <Path d="M4 20.5h18" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Rect x={5.5} y={12} width={3.6} height={6.5} rx={1.4} fill={color} />
          <Rect x={11.2} y={7.5} width={3.6} height={11} rx={1.4} fill={color} />
          <Rect x={16.9} y={4} width={3.6} height={14.5} rx={1.4} fill={color} />
        </>
      )}
    </Svg>
  );
}
