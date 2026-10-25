import './src/coreSetup'; // configures @swingcheck/core (Worker URL, language) before anything renders
import { registerRootComponent } from 'expo';

import DevScreen from './src/DevScreen';

registerRootComponent(DevScreen);
