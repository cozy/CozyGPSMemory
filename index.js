import { AppRegistry } from 'react-native'
import BackgroundGeolocation from 'react-native-background-geolocation'

import Minilog from 'cozy-minilog'

import App from './App'
import { name as appName } from './app.json'
import { GeolocationTrackingHeadlessTask } from './cozy-flagship-app/src/app/domain/geolocation/tracking/headless'

Minilog.enable()
AppRegistry.registerComponent(appName, () => App)

BackgroundGeolocation.registerHeadlessTask(GeolocationTrackingHeadlessTask)
