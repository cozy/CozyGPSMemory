/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { UploadData, _getId, _getLog, CozyGPSMemoryLog, _getFlagFailUpload } from './EMissionCompatibility.js'

AppRegistry.registerComponent(appName, () => App);
////
// Define your Headless task -- simply a javascript async function to receive
// events from BackgroundGeolocation:
//
let HeadlessTask = async (event) => {
	let params = event.params;
	console.log('[BackgroundGeolocation HeadlessTask] -', event.name, params);

	switch (event.name) {
		case 'motion':
			await CozyGPSMemoryLog('State change: ' + (params.isMoving ? 'Started moving' : 'Stopped'));
			if (!params.isMoving) {
				await CozyGPSMemoryLog('Auto uploading from stop');
				await UploadData();
			}
			break;
		case 'connectivity':
			await CozyGPSMemoryLog('Connectivity change to: ' + params.connected);
			if (params.connected && await _getFlagFailUpload()) {
				await CozyGPSMemoryLog('Auto uploading from reconnection and failed last attempt');
				await UploadData();
			}
	}
}



CozyGPSMemoryLog('start index.js');

////
// Register your HeadlessTask with BackgroundGeolocation plugin.
//
BackgroundGeolocation.registerHeadlessTask(HeadlessTask);