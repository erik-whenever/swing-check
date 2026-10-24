import { NitroModules } from 'react-native-nitro-modules'
import type { PoseDetector } from './specs/PoseDetector.nitro'
import type { PoseProbe } from './specs/PoseProbe.nitro'

export type * from './specs/PoseDetector.nitro'
export type * from './specs/PoseProbe.nitro'

export function createPoseDetector(): PoseDetector {
  return NitroModules.createHybridObject<PoseDetector>('PoseDetector')
}

/** Android only (measurement and parity helpers, not part of the cross-platform contract). */
export function createPoseProbe(): PoseProbe {
  return NitroModules.createHybridObject<PoseProbe>('PoseProbe')
}
