import { AppRegistry } from 'react-native'
import BackgroundGeolocation from 'react-native-background-geolocation'

import App from './App'
import {
  Log,
  handleMotionChange,
  handleConnectivityChange
} from './geolocation/services'
import { name as appName } from './app.json'

AppRegistry.registerComponent(appName, () => App)

const HeadlessTask = async event => {
  const params = event.params
  Log('headless event name: ' + event.name)

  switch (event.name) {
    case 'location':
      Log('[LOCATION] -' + JSON.stringify(params))
      break
    case 'motionchange':
      await handleMotionChange(params)
      break
    case 'activitychange':
      Log('[ACTIVITYCHANGE] -' + JSON.stringify(params))
      break
    case 'connectivitychange':
      await handleConnectivityChange(params)
      break
    default:
      break
  }
}

BackgroundGeolocation.registerHeadlessTask(HeadlessTask)
