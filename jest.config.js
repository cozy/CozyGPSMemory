module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/__tests__/jestSetupFile.js'],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native(-.*)?|@react-native(-community)?|p-timeout?|p-wait-for?|@notifee?)/)'
  ],
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)']
}
