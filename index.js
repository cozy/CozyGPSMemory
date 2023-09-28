import { AppRegistry } from 'react-native'
import BackgroundGeolocation from 'react-native-background-geolocation'

import App from './App'
import { name as appName } from './app.json'
import { GeolocationTrackingHeadlessTask } from './geolocation/services'

AppRegistry.registerComponent(appName, () => App)

BackgroundGeolocation.registerHeadlessTask(GeolocationTrackingHeadlessTask)
