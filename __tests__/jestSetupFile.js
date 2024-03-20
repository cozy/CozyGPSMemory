import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import mockRNDeviceInfo from 'react-native-device-info/jest/react-native-device-info-mock'

jest.mock('react-native-device-info', () => mockRNDeviceInfo)

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn(),
  show: jest.fn(),
  getVisibilityStatus: jest.fn()
}))

jest.mock('../cozy-flagship-app/src/core/tools/env', () => ({
  ...jest.requireActual('../cozy-flagship-app/src/core/tools/env'),
  isSentryDebugMode: () => true,
  EnvService: {
    hasSentryEnabled: () => true
  },
  devlog: jest.fn(),
  shouldDisableAutolock: jest.fn().mockReturnValue(false)
}))
