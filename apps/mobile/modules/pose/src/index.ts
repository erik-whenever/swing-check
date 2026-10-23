import { NitroModules } from 'react-native-nitro-modules'
import type { PoseDetector } from './specs/PoseDetector.nitro'

export type * from './specs/PoseDetector.nitro'

export function createPoseDetector(): PoseDetector {
  return NitroModules.createHybridObject<PoseDetector>('PoseDetector')
}
