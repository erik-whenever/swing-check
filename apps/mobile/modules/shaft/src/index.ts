import { NitroModules } from 'react-native-nitro-modules'
import type { ShaftDetector } from './specs/ShaftDetector.nitro'

export type * from './specs/ShaftDetector.nitro'

export function createShaftDetector(): ShaftDetector {
  return NitroModules.createHybridObject<ShaftDetector>('ShaftDetector')
}
