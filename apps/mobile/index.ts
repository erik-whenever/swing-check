import './src/coreSetup'; // configures @swingcheck/core (Worker URL, language) before anything renders
import { registerRootComponent } from 'expo';

import App from './src/app/App';

registerRootComponent(App);
