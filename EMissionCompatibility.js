import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { Platform } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import React, { useState } from 'react';
import { getUniqueId } from 'react-native-device-info';

import {
	Button,
	Modal,
	SafeAreaView,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	TextBase,
	TextInput,
	useColorScheme,
	View,
} from 'react-native';

const DestroyLocalOnSuccess = true;
const stopTimeoutMin = 10;
const stopTimeoutDetectionMill = 0.8 * stopTimeoutMin * 60 * 1000; // Réduit pour prendre en compte les inexactitudes du déclenchement de l'arrêt (sinon on pourrait ne pas détecter de gap parce qu'on est arrêté depuis 9 min au lieu de 10)
const retryOnFailTime = 15 * 60 * 1000;
const serverURL = 'https://openpath.cozycloud.cc';
const batch_size = 1000;
const useUniqueDeviceId = false;
const autoUploadDefault = true;
const useGeofencesOnAndroid = true;
const saveGeneralLog = true;
const saveUploadLog = true;

// Storage adresses used by AsyncStorage
// Note: if changed, devices upgrading from older build will keep the old ones unless we take care to delete them
const OldStorageAdresses = ['Id', 'Token', 'FlagFailUpload', 'should_be_tracking', 'stops', 'CozyGPSMemory.ID', 'CozyGPSMemory.UploadHistory'];

const IdStorageAdress = 'CozyGPSMemory.Id';
const FlagFailUploadStorageAdress = 'CozyGPSMemory.FlagFailUpload';
const ShouldBeTrackingFlagStorageAdress = 'CozyGPSMemory.ShouldBeTrackingFlag';
const StopsStorageAdress = 'CozyGPSMemory.Stops';
const AutoUploadFlagStorageAdress = 'CozyGPSMemory.AutoUploadFlag';
const LogAdress = 'CozyGPSMemory.Log';


export async function _getLog() {
	return await AsyncStorage.getItem(LogAdress);
}

async function _addToLog(content) {
	history = await _getLog();
	if (history === undefined) {
		history = '';
	}
	history += '\n' + content;
	AsyncStorage.setItem(LogAdress);
}

function CozyGPSMemoryLog(message) {
	if (saveGeneralLog) {
		_addToLog(message);
	}
	console.log(message);
}

async function _ClearLog() {
	AsyncStorage.removeItem(LogAdress);
}

async function _storeAutoUploadFlag(Flag) {
	try {
		await AsyncStorage.setItem(AutoUploadFlagStorageAdress, Flag ? 'true' : 'false');
	} catch (error) {
		CozyGPSMemoryLog('Error while storing AutoUploadFlag:' + error.toString());
		throw (error);
	}
}

async function _getAutoUploadFlag() {
	try {
		let value = await AsyncStorage.getItem(AutoUploadFlagStorageAdress);
		if (value == undefined) {
			value = autoUploadDefault;
			_storeAutoUploadFlag(value);
		}
		return !(value == 'false'); // Si undefined malgré tout on considère erreur
	} catch (error) {
		CozyGPSMemoryLog('Error while getting AutoUploadFlag:' + error.toString());
		throw (error);
	}
}

async function _storeFlagFailUpload(Flag) {
	try {
		await AsyncStorage.setItem(FlagFailUploadStorageAdress, Flag ? 'true' : 'false');
	} catch (error) {
		CozyGPSMemoryLog('Error while storing FlagFailUpload:' + error.toString());
		throw (error);
	}
};

async function _getFlagFailUpload() {
	try {
		let value = await AsyncStorage.getItem(FlagFailUploadStorageAdress);
		if (value == undefined) {
			value = false;
			_storeFlagFailUpload(value);
		}
		return !(value == 'false'); // Si undefined malgré tout on considère erreur
	} catch (error) {
		CozyGPSMemoryLog('Error while getting FlagFailUpload:' + error.toString());
		throw (error);
	}
}

export async function _storeId(Id) {
	try {
		await AsyncStorage.setItem(IdStorageAdress, Id);
	} catch (error) {
		throw (error);
	}
};

export async function _getId() {
	try {
		let value = await AsyncStorage.getItem(IdStorageAdress);
		if (value == undefined) {
			CozyGPSMemoryLog('No current Id, generating a new one...');
			value = useUniqueDeviceId ? await getUniqueId() : Math.random().toString(36).replace('0.', '');
			await _storeId(value); // random Id or device Id depending on config
		}
		if (value != await AsyncStorage.getItem(IdStorageAdress)) {
			throw new Error('New Id couldn\'t be stored'); // We make sure it is stored
		} else {
			CozyGPSMemoryLog('Found Id: ' + value);
			return value;
		}
	} catch (error) {
		CozyGPSMemoryLog('Error while getting Id:' + error.toString());
		throw (error);
	}
};


export async function _storeStops(stops) {
	try {
		await AsyncStorage.setItem(StopsStorageAdress, JSON.stringify(stops));
	} catch (error) {
		CozyGPSMemoryLog('Error while storing stops:' + error.toString());
		throw (error);
	}
};

export async function _getStops() {
	try {
		let value = await AsyncStorage.getItem(StopsStorageAdress);
		if (value == null) {
			value = [];
		} else {
			value = JSON.parse(value);
		}
		return value;
	} catch (error) {
		CozyGPSMemoryLog('Error while getting stops:' + error.toString());
		throw (error);
	}
};

export async function ClearAllCozyGPSMemoryData() {
	await BackgroundGeolocation.destroyLocations();
	await AsyncStorage.multiRemove([IdStorageAdress, FlagFailUploadStorageAdress, ShouldBeTrackingFlagStorageAdress, StopsStorageAdress, AutoUploadFlagStorageAdress, LogAdress]);
	await ClearOldCozyGPSMemoryStorage();
	CozyGPSMemoryLog('Everything cleared');
}

export async function ClearOldCozyGPSMemoryStorage() {
	await AsyncStorage.multiRemove(OldStorageAdresses); // Just to clean up devices upgrading from older builds since variable names were updated
}
async function CreateUser(user) {
	let response = await fetch(serverURL + '/profile/create', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ 'user': user }),
	});
	if (!response.ok) {
		CozyGPSMemoryLog('Error creating user: ' + response.status + ' ' + response.statusText);
		throw new Error('FAILED_EMISSION_USER_CREATION'); // Could be no Internet, offline server or unknown issue. Won't trigger if user already exists.
	} else {
		jsonTokenResponse = await response.json();
		CozyGPSMemoryLog('Success creating user ' + user + ', UUID: ' + jsonTokenResponse['uuid']);
	}
}

async function RegisterStopNow() {
	stops = await _getStops();
	let new_stop = Math.floor(Date.now() / 1000);
	CozyGPSMemoryLog('Adding stop: ' + new_stop);
	stops.push(new_stop);
	await _storeStops(stops);
}

function parseISOString(ISOString) {
	let b = ISOString.split(/\D+/);
	return new Date(Date.UTC(b[0], --b[1], b[2], b[3], b[4], b[5], b[6]));
}

function TranslateToEMissionLocationPoint(location_point) {
	let ts = Math.floor(parseISOString(location_point['timestamp']).getTime() / 1000)
	return {
		'data': {
			'accuracy': location_point['coords']['accuracy'],
			'altitude': location_point['coords']['altitude'],
			'bearing': location_point['coords']['heading'],
			'filter': (Platform.OS === 'ios' || useGeofencesOnAndroid) ? 'distance' : 'time',
			'floor': 0,
			'latitude': location_point['coords']['latitude'],
			'longitude': location_point['coords']['longitude'],
			'sensed_speed': location_point['coords']['speed'],
			'ts': ts + 0.1, // It's silly, but some rare operations of e-mission will take a timestamp without a decimal point as an integer and crash. Since it would be a hard crash, the pipeline will not attempt again for this user so the user would never get new tracks without intervention. This was the simplest way to insure that JSON.stringify() will leave a decimal point.
			'vaccuracy': location_point['coords']['altitude_accuracy']
		},
		'metadata': {
			'platform': Platform.OS,
			'write_ts': ts + 0.1,
			'time_zone': 'UTC',
			'key': 'background/location',
			'read_ts': 0,
			'type': 'sensor-data'
		}
	}
}


function TranslateToEMissionMotionActivityPoint(location) {
	let ts = Math.floor(parseISOString(location['timestamp']).getTime() / 1000);
	return {

		'data': {
			'cycling': location['activity']['type'] == 'on_bicycle',
			'walking': location['activity']['type'] == 'on_foot',
			'running': location['activity']['type'] == 'running',
			'automotive': location['activity']['type'] == 'in_vehicle', // Stationary et automotive sont sensés être compatibles sur ios
			'stationary': location['activity']['type'] == 'still',
			'unknown': false, // Not sure what to do in this case, it doesn't really exist in the plugin (what happens w/o OS permission?)
			'confidence': location['activity']['confidence'],
			'ts': ts + 0.2,
			'confidence_level': location['activity']['confidence'] > 50 ? 'high' : 'low' // To be improved
		},
		'metadata': {
			'write_ts': ts + 0.2,
			'time_zone': 'UTC',
			'platform': Platform.OS,
			'key': 'background/motion_activity',
			'read_ts': 0,
			'type': 'sensor-data'
		}
	};
}


function TranslateToEMissionRequest(locations, user) {
	let output = {
		'user': user,
		'phone_to_server': [],
	};
	// Clipboard.setString(JSON.stringify(locations));
	for (let translationIndex = 0; translationIndex < locations.length; translationIndex++) {
		if (locations[translationIndex]['error'] == undefined) { //Si le points n'est pas {'error': 0}
			//CozyGPSMemoryLog('location', translationIndex, 'of', locations.length);
			const point = locations[translationIndex];
			let ts = parseISOString(point['timestamp']);
			let newLocationPoint = TranslateToEMissionLocationPoint(point, ts);

			//CozyGPSMemoryLog(newLocationPoint);
			output['phone_to_server'].push(newLocationPoint);

			if (point['coords']['accuracy'] < 200) {
				// point identique avec clé différente
				let newFilteredLocationPoint = TranslateToEMissionLocationPoint(point, ts);
				newFilteredLocationPoint['metadata']['key'] = 'background/filtered_location';
				newFilteredLocationPoint['metadata']['write_ts'] += 0.1; //Sinon bud du serveur à cause de même rite_ts je pense
				//CozyGPSMemoryLog((newFilteredLocationPoint));
				output['phone_to_server'].push(newFilteredLocationPoint);
			}
			//let newMotionActivityPoint = TranslateToEMissionMotionActivityPoint(point['activity'], ts, uuids[2]);
			//newMotionActivityPoint['metadata']['write_ts'] += 0.2;
			//output['phone_to_server'].push(newMotionActivityPoint);

			// CozyGPSMemoryLog(p['uuid'], newLocationPoint['_id']['$oid'], newFilteredLocationPoint['_id']['$oid'], newMotionActivityPoint['_id']['$oid']);
		}

	}
	return output;
}

export async function UpdateId(newId) { // If there are still non-uploaded locations, it should be handled before changing the Id or they will be sent with the new one
	CozyGPSMemoryLog('Updating Id to ' + newId);

	if (newId.length > 2 && newId != await _getId()) {
		await _storeId(newId);
		if (newId != await _getId()) {
			return ('FAIL_STORING_ID')
		}
		try {
			await CreateUser(newId);
			return ('SUCCESS_STORING_SUCCESS_CREATING');
		} catch (error) {
			return ('SUCCESS_STORING_FAIL_CREATING');
		}
	} else {
		return ('SAME_ID_OR_INVALID_ID');
	}
}


function Transition(state, transition, transition_ts) {
	return ({
		'data': {

			'currState': state,
			'transition': transition,
			'ts': transition_ts

		},
		'metadata': {
			'platform': Platform.OS,
			'write_ts': transition_ts,
			'time_zone': 'UTC',
			'key': 'statemachine/transition',
			'read_ts': 0,
			'type': 'message'
		}
	});
}

// Add start transitions, within 0.1s of given ts
function AddStartTransitions(list, ts) {
	list.push(Transition('STATE_WAITING_FOR_TRIP_START', 'T_EXITED_GEOFENCE', ts + 0.01));
	list.push(Transition('STATE_WAITING_FOR_TRIP_START', 'T_TRIP_STARTED', ts + 0.02));
	list.push(Transition('STATE_ONGOING_TRIP', 'T_TRIP_STARTED', ts + 0.03));
	list.push(Transition('STATE_ONGOING_TRIP', 'T_TRIP_RESTARTED', ts + 0.04));
}

// Add stop transitions, within 0.1s of given ts
function AddStopTransitions(list, ts) {
	list.push(Transition('STATE_ONGOING_TRIP', 'T_VISIT_STARTED', ts + 0.01));
	list.push(Transition('STATE_ONGOING_TRIP', 'T_TRIP_END_DETECTED', ts + 0.02));
	list.push(Transition('STATE_ONGOING_TRIP', 'T_END_TRIP_TRACKING', ts + 0.03));
	list.push(Transition('STATE_ONGOING_TRIP', 'T_TRIP_ENDED', ts + 0.04));
	list.push(Transition('STATE_WAITING_FOR_TRIP_START', 'T_NOP', ts + 0.05));
	list.push(Transition('STATE_WAITING_FOR_TRIP_START', 'T_DATA_PUSHED', ts + 0.06));
}

export async function SmartSend(locations, user, force = false, copyToClipboardSentData = false) {
	if (force) {
		//If the upload was forced, we want to force a stop now (means that we should try to make every point available to the server)
		await RegisterStopNow();
	}

	await CreateUser(user); // Will throw on fail, skipping the rest (trying again later is handled a level above SmartSend)

	let stops = await _getStops();
	// CozyGPSMemoryLog('Stops:', JSON.stringify(stops));

	if (stops.length > 0 && locations.length > 0) {
		let lastStop = stops.at(-1);
		CozyGPSMemoryLog('Uploading up to: ' + lastStop);
		let phone_to_server = [[]];
		let phone_to_serverIndex = 0;
		let index = 0;

		AddStartTransitions(phone_to_server[phone_to_serverIndex], Math.floor(parseISOString(locations[index]['timestamp']).getTime() / 1000) - 1);

		while (index < locations.length && Math.floor(parseISOString(locations[index]['timestamp']).getTime() / 1000) <= lastStop) {

			phone_to_server[phone_to_serverIndex].push(TranslateToEMissionLocationPoint(locations[index]));
			//Condition de filtered_location:
			if (locations[index]['coords']['accuracy'] <= 200) { // Précision suffisante
				if (index == 0 || (locations[index]['coords']['longitude'] != locations[index - 1]['coords']['longitude'] || locations[index]['coords']['latitude'] != locations[index - 1]['coords']['latitude'])) { // Différent du point précédent (check si on est au premier))
					phone_to_server[phone_to_serverIndex].push(TranslateToEMissionLocationPoint(locations[index]));
					phone_to_server[phone_to_serverIndex].at(-1)['metadata']['key'] = 'background/filtered_location';
				}
			}

			//phone_to_server[phone_to_serverIndex].push(TranslateToEMissionMotionActivityPoint(locations[index]));


			if (index == locations.length - 1) {
				AddStopTransitions(phone_to_server[phone_to_serverIndex], Math.floor(parseISOString(locations[index]['timestamp']).getTime() / 1000) + 60);
			}
			else if (Math.floor(parseISOString(locations[index + 1]['timestamp']).getTime() / 1000) - Math.floor(parseISOString(locations[index]['timestamp']).getTime() / 1000) > 500) {

				AddStopTransitions(phone_to_server[phone_to_serverIndex], Math.floor(parseISOString(locations[index]['timestamp']).getTime() / 1000) + 60);
				AddStartTransitions(phone_to_server[phone_to_serverIndex], Math.floor(parseISOString(locations[index + 1]['timestamp']).getTime() / 1000) - 1);
				// In theory, according to the if statement, the start will always be after the end

			}


			index++;
			if (phone_to_server[phone_to_serverIndex].length > batch_size) {
				phone_to_server.push([]);
				phone_to_serverIndex++;
			}
		}


		//STOPPED_MOVING donne une erreur, ios ? plus utilisé ?
		allRequests = '';
		for (let batchIndex = 0; batchIndex < phone_to_server.length; batchIndex++) {
			let JsonRequest = {
				'user': user,
				'phone_to_server': phone_to_server[batchIndex]
			}
			// Clipboard.setString(JSON.stringify(JsonRequest));

			let response = await fetch(serverURL + '/usercache/put', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(JsonRequest),
			})
			if (saveUploadLog) {
				_addToLog(JSON.stringify(JsonRequest));
			}

			allRequests += JSON.stringify(JsonRequest);
			if (batchIndex == phone_to_server.length - 1) {
				allRequests += 'Stops: ' + JSON.stringify(await _getStops());
			}

			if (!response.ok) {
				if (copyToClipboardSentData) {
					Clipboard.setString(allRequests + 'Stops: ' + JSON.stringify(await _getStops()));
				}
				throw new Error(String('Error in request response:', response.status, response.statusText, await response.text()));

			} else {
				CozyGPSMemoryLog('Success uploading');
				if (DestroyLocalOnSuccess && batchIndex == phone_to_server.length - 1) {
					CozyGPSMemoryLog('Destroying local location records');
					BackgroundGeolocation.destroyLocations();
					_storeStops([]);
					//TODO proprement

				}
			}
		}
		Clipboard.setString(allRequests);
	} else { CozyGPSMemoryLog('No stops and not forced or no points: no upload'); }

	//TODO : nettoyer les stops de la mémoire solide

	/*
			let endIndex = locations.length - 1
			while (endIndex > 0 && locations[endIndex]['timestamp'] > lastStop) {
				endIndex--;
			}

			CozyGPSMemoryLog('Uploading all locations until location', endIndex + 1, 'of', locations.length);

			CozyGPSMemoryLog('Starting batch by batch upload with', batch_size, 'locations/batch');
			let indexUpload = 0;
			while (indexUpload < endIndex) {
				let slicedLocations = locations.slice(indexUpload, Math.min(indexUpload + batch_size, endIndex + 1));

				let jsonData = TranslateToEMissionRequest(slicedLocations, user);
				jsonData['phone_to_server'] = jsonData['phone_to_server'].concat(JSONStops);

				Clipboard.setString(JSON.stringify(jsonData));



				let response = await fetch(serverURL + '/usercache/put', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(jsonData),
				})


				if (!response.ok) {
					throw new Error(String('Error in request response:', response.status, response.statusText, await response.text()));

				} else {
					CozyGPSMemoryLog('Success uploading a batch');
					indexUpload += batch_size;
					if (DestroyLocalOnSuccess) {
						CozyGPSMemoryLog('Destroying local location records of this batch');

						for (let DeleteIndex = 0; DeleteIndex < slicedLocations.length; DeleteIndex++) {
							BackgroundGeolocation.destroyLocation(slicedLocations[DeleteIndex]['uuid']);
						}

					}
				}
			}
			AsyncStorage.removeItem(StopsStorageAdress);
		} else {
			CozyGPSMemoryLog('No stops detected');
		}
	*/

}

export async function UploadData(force = false, retryOnFail = true) { // WARNING: le message qui prévient le user que l'upload a fail se base sur le fait qu'il reste des locations localement ou non

	CozyGPSMemoryLog('Starting upload process');

	try {
		let locations = await BackgroundGeolocation.getLocations();
		if (locations.length > 0) {
			// CozyGPSMemoryLog(locations);

			let user = await _getId();
			CozyGPSMemoryLog('Using Id: ' + user);

			try {
				await SmartSend(locations, user, force);
			} catch (message) {
				CozyGPSMemoryLog('Error trying to send data: ' + message);
				if (retryOnFail) {
					if (!(await _getFlagFailUpload())) {

						CozyGPSMemoryLog('First fail, trying again in ' + retryOnFailTime);
						_storeFlagFailUpload(true);

						setTimeout(async () => {

							if (await _getFlagFailUpload()) { // On vérifie que l'upload n'a pas marché depuis
								CozyGPSMemoryLog('Second attempt at uploading');
								try {
									await UploadData();
								} catch { CozyGPSMemoryLog('Failed again'); }
							} else { CozyGPSMemoryLog('Cancelling second attempt, succeeded since'); }

						}, retryOnFailTime)
					} else { CozyGPSMemoryLog('Already failed twice, no more attempt until event'); }
				}
			}

		} else {
			CozyGPSMemoryLog('No locations to upload');
		}

	} catch (error) {
		throw new Error(error); //Flag et tout
	}
}

export function GeolocationSwitch() {
	const [enabled, setEnabled] = React.useState(false);
	const [location, setLocation] = React.useState('');

	AsyncStorage.getItem(ShouldBeTrackingFlagStorageAdress).then((shouldBeTracking) => {
		// Aparemment se déclenche plus souvent que je voudrais, mais pas critique
		// CozyGPSMemoryLog(shouldBeTracking)
		if (shouldBeTracking == undefined) {
			AsyncStorage.setItem(ShouldBeTrackingFlagStorageAdress,
				enabled ? 'true' : 'false');
		} else {
			setEnabled(shouldBeTracking == 'true');
		}
	}
	)

	React.useEffect(() => {
		/// 1.  Subscribe to events.

		const onLocation = BackgroundGeolocation.onLocation((location) => {
			CozyGPSMemoryLog('[onLocation]');
			setLocation(JSON.stringify(location, null, 2));
		})

		const onMotionChange = BackgroundGeolocation.onMotionChange(async (event) => {
			CozyGPSMemoryLog('[onMotionChange]' + event);
			if (!event.isMoving) {
				await RegisterStopNow();
				if (await _getAutoUploadFlag()) {
					CozyGPSMemoryLog('Auto uploading');
					UploadData();
				} else {
					CozyGPSMemoryLog('Not auto uploading');
				}
			}

		});

		const onActivityChange = BackgroundGeolocation.onActivityChange((event) => {
			CozyGPSMemoryLog('[onActivityChange] ' + event);
		})

		const onProviderChange = BackgroundGeolocation.onProviderChange((event) => {
			CozyGPSMemoryLog('[onProviderChange] ' + event);
		})

		const onConnectivityChange = BackgroundGeolocation.onConnectivityChange(async (event) => {
			// ne trigger pas en emul ios, donne event = {'connected': false}
			// à tester en réel
			CozyGPSMemoryLog('[onConnectivityChange] ' + event);
			if (event.connected && await _getFlagFailUpload() && await _getAutoUploadFlag()) {
				CozyGPSMemoryLog('Auto uploading');
				UploadData();
			}
		})

		/// 2. ready the plugin.
		BackgroundGeolocation.ready({
			// Geolocation Config
			desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
			showsBackgroundLocationIndicator: false, //Displays a blue pill on the iOS status bar when the location services are in use in the background (if the app doesn't have 'always' permission, the blue pill will always appear when location services are in use while the app isn't focused)
			distanceFilter: (Platform.OS === 'ios' || useGeofencesOnAndroid) ? 10 : 0,
			locationUpdateInterval: 10000, // Only used if on Android and if distanceFilter is 0
			stationaryRadius: 25, //Minimum, but still usually takes 200m
			// Activity Recognition
			stopTimeout: stopTimeoutMin,
			// Application config
			debug: false, // <-- enable this hear sounds for background-geolocation life-cycle and notifications
			logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
			stopOnTerminate: false,   // <-- Allow the background-service to continue tracking when user closes the app. (not on iOS)
			startOnBoot: true,        // <-- Auto start tracking when device is powered-up.
			// HTTP / SQLite config

			batchSync: false,       // <-- [Default: false] Set true to sync locations to server in a single HTTP request.
			autoSync: false,         // <-- [Default: true] Set true to sync each location to server as it arrives.
		}).then((state) => {
			setEnabled(state.enabled);

			CozyGPSMemoryLog('- BackgroundGeolocation is configured and ready: ' + state.enabled);
		});

		return () => {
			// Remove BackgroundGeolocation event-subscribers when the View is removed or refreshed
			// during development live-reload.  Without this, event-listeners will accumulate with
			// each refresh during live-reload.
			onLocation.remove();
			onMotionChange.remove();
			onActivityChange.remove();
			onProviderChange.remove();
			onConnectivityChange.remove();
		}
	}, []);

	/// 3. start / stop BackgroundGeolocation

	React.useEffect(() => {
		if (enabled) {
			CozyGPSMemoryLog('Enabling tracking');
			BackgroundGeolocation.start();
		} else {
			CozyGPSMemoryLog('Disabling tracking');
			RegisterStopNow();
			BackgroundGeolocation.stop();
			setLocation('');
		}
	}, [enabled]);

	return (
		<View style={{ alignItems: 'center', padding: 50 }}>
			<Text style={{
				fontSize: 36, padding: 10, color: useColorScheme() === 'dark' ? '#ffffff' : '#000000',
			}}>Tracking</Text>
			<Switch value={enabled} onValueChange={(value) => {
				setEnabled(value);
				AsyncStorage.setItem(ShouldBeTrackingFlagStorageAdress, value ? 'true' : 'false');
			}} />

		</View>
	)
}