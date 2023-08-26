import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { Platform } from 'react-native';
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

const versionIterationCounter = 1; // Simple counter to iterate versions while we run betas and be able to run "one-time only" code on update. Probably exists a cleaner way
const DestroyLocalOnSuccess = true;
const stopTimeoutMin = 11;
const stopTimeout = 300; // Shouldn't have longer breaks without siginificant movement
const longStopTimeout = 530;
const retryOnFailTime = 15 * 60 * 1000;
const serverURL = 'https://openpath.cozycloud.cc';
const maxPointsPerBatch = 300; // Represents actual points, elements in the POST will probably be around this*2 + ~10*number of stops made
const useUniqueDeviceId = false;
const autoUploadDefault = true;
const useGeofencesOnAndroid = true;
const heavyLogs = false; // Log points, motion changes...
const maxLogSize = 100000; // In characters
const detectMotionActivity = true;

// Storage adresses used by AsyncStorage
// Note: if changed, devices upgrading from older build will keep the old ones unless we take care to delete them
const OldStorageAdresses = ['Id', 'Token', 'FlagFailUpload', 'should_be_tracking', 'stops', 'CozyGPSMemory.ID', 'CozyGPSMemory.UploadHistory', 'CozyGPSMemory.Stops'];

const IdStorageAdress = 'CozyGPSMemory.Id';
const FlagFailUploadStorageAdress = 'CozyGPSMemory.FlagFailUpload';
const ShouldBeTrackingFlagStorageAdress = 'CozyGPSMemory.ShouldBeTrackingFlag';
const AutoUploadFlagStorageAdress = 'CozyGPSMemory.AutoUploadFlag';
const LogAdress = 'CozyGPSMemory.Log';
const LastPointUploadedAdress = 'CozyGPSMemory.LastPointUploaded';
const versionIterationCounterStorageAdress = 'CozyGPSMemory.VersionIterationCounter';


async function _updateVersionIterationCounter() {
	await AsyncStorage.setItem(versionIterationCounterStorageAdress, versionIterationCounter.toString());
	CozyGPSMemoryLog('Set versionIterationCounter to: ' + versionIterationCounter)
}

async function _getVersionIterationCounter() {
	return parseInt(await AsyncStorage.getItem(versionIterationCounterStorageAdress) | '0');
}

async function _getLastPointUploaded() {
	return JSON.parse(await AsyncStorage.getItem(LastPointUploadedAdress));
}

async function _setLastPointUploaded(value) {
	await AsyncStorage.setItem(LastPointUploadedAdress, JSON.stringify(value));
}

export async function _getLog() {
	return await AsyncStorage.getItem(LogAdress);
}

async function _addToLog(content) {
	history = await _getLog();
	if (history === undefined || history === null) {
		history = '';
	}
	history += Date.now() + ' | ' + content + '\n';
	await AsyncStorage.setItem(LogAdress, history.slice(-maxLogSize));
}

async function CozyGPSMemoryLog(message) {
	console.log(message);
	await _addToLog(message);
}

async function _ClearLog() {
	await AsyncStorage.removeItem(LogAdress);
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
			await _storeAutoUploadFlag(value);
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
			await _storeFlagFailUpload(value);
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
			if (value != await AsyncStorage.getItem(IdStorageAdress)) {
				throw new Error('New Id couldn\'t be stored'); // We make sure it is stored
			}
			CozyGPSMemoryLog('Set Id to: ' + value)
		}

		return value;

	} catch (error) {
		CozyGPSMemoryLog('Error while getting Id:' + error.toString());
		throw (error);
	}
};

export async function ClearAllCozyGPSMemoryData() {
	await BackgroundGeolocation.destroyLocations();
	await AsyncStorage.multiRemove([IdStorageAdress, FlagFailUploadStorageAdress, ShouldBeTrackingFlagStorageAdress, AutoUploadFlagStorageAdress, LogAdress, LastPointUploadedAdress, versionIterationCounterStorageAdress]);
	await ClearOldCozyGPSMemoryStorage();
	CozyGPSMemoryLog('Everything cleared');
}

export async function ClearOldCozyGPSMemoryStorage() {
	await AsyncStorage.multiRemove(OldStorageAdresses); // Just to clean up devices upgrading from older builds since variable names were updated
}

async function CheckForUpdateActions() {

	lastVersion = await _getVersionIterationCounter();
	if (lastVersion != versionIterationCounter) {
		await CozyGPSMemoryLog('Found last version: ' + lastVersion + ', current: ' + versionIterationCounter);
		await ClearOldCozyGPSMemoryStorage();
		await CozyGPSMemoryLog('Cleared old storages');
		if (lastVersion < 1) {
			await _ClearLog();
			await CozyGPSMemoryLog('Cleared logs because we may be updating from a version with logs too big to handle');
		}
		_updateVersionIterationCounter();
	}
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
			'walking': location['activity']['type'] == 'walking' || location['activity']['type'] == 'on_foot', // A voir
			'running': location['activity']['type'] == 'running',
			'automotive': location['activity']['type'] == 'in_vehicle', // Stationary et automotive sont sensés être compatibles sur ios
			'stationary': location['activity']['type'] == 'still',
			'unknown': location['activity']['type'] == 'unknown',
			'confidence': location['activity']['confidence'],
			'ts': ts + 0.2,
			'confidence_level': location['activity']['confidence'] > 75 ?
				'high' :
				location['activity']['confidence'] > 50 ?
					'medium' :
					'low'
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
function AddStartTransitions(addedTo, ts) {
	addedTo.push(Transition('STATE_WAITING_FOR_TRIP_START', 'T_EXITED_GEOFENCE', ts + 0.01));
	addedTo.push(Transition('STATE_WAITING_FOR_TRIP_START', 'T_TRIP_STARTED', ts + 0.02));
	addedTo.push(Transition('STATE_ONGOING_TRIP', 'T_TRIP_STARTED', ts + 0.03));
	addedTo.push(Transition('STATE_ONGOING_TRIP', 'T_TRIP_RESTARTED', ts + 0.04));
}

// Add stop transitions, within 0.1s of given ts
function AddStopTransitions(addedTo, ts) {
	addedTo.push(Transition('STATE_ONGOING_TRIP', 'T_VISIT_STARTED', ts + 0.01));
	addedTo.push(Transition('STATE_ONGOING_TRIP', 'T_TRIP_END_DETECTED', ts + 0.02));
	addedTo.push(Transition('STATE_ONGOING_TRIP', 'T_END_TRIP_TRACKING', ts + 0.03));
	addedTo.push(Transition('STATE_ONGOING_TRIP', 'T_TRIP_ENDED', ts + 0.04));
	addedTo.push(Transition('STATE_WAITING_FOR_TRIP_START', 'T_NOP', ts + 0.05));
	addedTo.push(Transition('STATE_WAITING_FOR_TRIP_START', 'T_DATA_PUSHED', ts + 0.06));
}

function getTs(location) {
	return parseISOString(location['timestamp']).getTime() / 1000;
}

async function UploadUserCache(content, user, uuidsToDeleteOnSuccess, lastPointToSave = undefined) {
	CozyGPSMemoryLog('Uploading content to usercache...')
	let JsonRequest = {
		'user': user,
		'phone_to_server': content
	}

	let response = await fetch(serverURL + '/usercache/put', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(JsonRequest),
	})

	toLog = [JsonRequest['phone_to_server'].slice(0, 10), JsonRequest['phone_to_server'].slice(JsonRequest['phone_to_server'].length - 10, JsonRequest['phone_to_server'].length)];
	await CozyGPSMemoryLog('Uploaded (first 10 and last 10 of upload): ' + JSON.stringify(toLog));

	if (!response.ok) {
		CozyGPSMemoryLog('Failure uploading');
		throw new Error(String('Error in request response:', response.status, response.statusText, await response.text()));

	} else {
		CozyGPSMemoryLog('Success uploading');
		if (lastPointToSave != undefined) {
			_setLastPointUploaded(lastPointToSave);
			CozyGPSMemoryLog('Saved last point');
		} else {
			CozyGPSMemoryLog('No last point to save');
		}
		if (DestroyLocalOnSuccess && uuidsToDeleteOnSuccess.length > 0) {
			CozyGPSMemoryLog('Removing local location records that were just uploaded...');
			for (let deleteIndex = 0; deleteIndex < uuidsToDeleteOnSuccess.length; deleteIndex++) {
				const element = uuidsToDeleteOnSuccess[deleteIndex];
				await BackgroundGeolocation.destroyLocation(element);
			}
			CozyGPSMemoryLog('Done removing local locations')
		}
	}
}

async function uploadWithNoNewPoints(user, force) {
	CozyGPSMemoryLog('Uploading but no new points found');
	lastPoint = await _getLastPointUploaded();
	content = [];

	if (force) {
		AddStopTransitions(content, Date.now() / 1000);
		await UploadUserCache(content, user, []);
	} else {
		if (lastPoint == undefined) {
			CozyGPSMemoryLog('No past either, no upload');
		} else {
			if (Date.now() / 1000 - getTs(lastPoint) > stopTimeout) { // Note: no problem if we add a stop if there's already one
				CozyGPSMemoryLog('Last point old enough, posting stop transitions: ' + (getTs(lastPoint) - Date.now() / 1000));
				AddStopTransitions(content, getTs(lastPoint));
				await UploadUserCache(content, user, []);
			} else {
				CozyGPSMemoryLog('Last point too recent: ' + (getTs(lastPoint) - Date.now() / 1000));
			}
		}
	}
}

function deg2rad(deg) {
	return deg * (Math.PI / 180)
}

function getDistanceFromLatLonInM(point1, point2) {
	var R = 6371; // Radius of the earth in km
	var dLat = deg2rad(point2['coords']['latitude'] - point1['coords']['latitude']);  // deg2rad below
	var dLon = deg2rad(point2['coords']['longitude'] - point1['coords']['longitude']);
	var a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(deg2rad(point1['coords']['latitude'])) * Math.cos(deg2rad(point2['coords']['latitude'])) *
		Math.sin(dLon / 2) * Math.sin(dLon / 2)
		;
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	var d = R * c; // Distance in km
	return d * 1000;
}

function AddPoint(addedTo, point, filtered) {
	addedTo.push(TranslateToEMissionLocationPoint(point));

	if (filtered) {
		addedTo.push(TranslateToEMissionLocationPoint(point));
		addedTo.at(-1)['metadata']['key'] = 'background/filtered_location';
	}

	if (detectMotionActivity) { addedTo.push(TranslateToEMissionMotionActivityPoint(point)); }

}

async function uploadPoints(points, user, previousPoint, nextPoint, force) {
	CozyGPSMemoryLog('Starting treating a batch of points')
	content = [];
	uuidsToDelete = [];
	// CozyGPSMemoryLog(JSON.stringify(points));
	for (let indexBuildingRequest = 0; indexBuildingRequest < points.length; indexBuildingRequest++) {
		const point = points[indexBuildingRequest];
		uuidsToDelete.push(point['uuid']);
		const prev = indexBuildingRequest == 0 ? previousPoint : points[indexBuildingRequest - 1];
		const next = indexBuildingRequest == points.length - 1 ? nextPoint : points[indexBuildingRequest + 1];

		if (prev == null || prev === undefined) {
			CozyGPSMemoryLog('No previous point found, adding start');
			AddStartTransitions(content, getTs(point) - 1);
		} else {
			// CozyGPSMemoryLog('prev: ' + JSON.stringify(prev) + ' curr: ' + JSON.stringify(point));
			if (getTs(point) - getTs(prev) > stopTimeout) { // If the points are not close enough in time, we need to check that there was significant movement
				CozyGPSMemoryLog('Noticed a break > ' + stopTimeout);
				let distance = getDistanceFromLatLonInM(prev, point);
				if (distance < 300) { // TO TEST : what is the smallest distance needed? Is it a function of the time stopped?
					CozyGPSMemoryLog('Small distance, adding stop and start: ' + distance + 'm');
					AddStopTransitions(content, getTs(prev) + 180); // 3 min later for now
					AddStartTransitions(content, getTs(point) - 1);
				} else {
					CozyGPSMemoryLog('Long distance, leaving as is: ' + distance + 'm');
				}
			}
		}
		if (next == null || next == undefined) {
			console.log('No following point found');
			if (getTs(point) - Date.now() / 1000 > longStopTimeout) {
				console.log('Last point is older than ' + longStopTimeout + ', adding stop');
				AddStopTransitions(content, getTs(prev) + 180);
			}
		}

		//Condition de filtered_location:
		let samePosAsPrev = (
			prev != undefined &&
			point['coords']['longitude'] == prev['coords']['longitude'] &&
			point['coords']['latitude'] == prev['coords']['latitude']);
		let filtered = !samePosAsPrev && point['coords']['accuracy'] <= 200;

		AddPoint(content, point, filtered);

	}

	if (force) {
		CozyGPSMemoryLog('Forcing stop at the end of the batch')
		AddStopTransitions(content, Date.now() / 1000);
	}

	await UploadUserCache(content, user, uuidsToDelete, points.at(-1));

}

export async function SmartSend(locations, user, force) {

	await CreateUser(user); // Will throw on fail, skipping the rest (trying again later is handled a level above SmartSend)

	if (locations.length == 0) {
		CozyGPSMemoryLog('No new locations');
		uploadWithNoNewPoints(user, force);

	} else {

		CozyGPSMemoryLog('Found pending locations, uploading them');

		for (let index = 0; index < locations.length; index += maxPointsPerBatch) {
			CozyGPSMemoryLog('Uploading batch...');
			await uploadPoints(
				locations.slice(index, index + maxPointsPerBatch),
				user,
				index == 0 ? await _getLastPointUploaded() : locations[index - 1],
				index + maxPointsPerBatch < locations.length - 1 ? locations[index + maxPointsPerBatch] : undefined,
				(force && index + maxPointsPerBatch >= locations.length)
			);

		}

	}

}

export async function UploadData(force = false, retryOnFail = true) { // WARNING: la valeur de retour (booleen) indique le succès, mais mal géré dans le retryOnFail (actuellement uniquement utilisé pour le bouton "Forcer l'upload" avecec force et pas de retry)

	CozyGPSMemoryLog('Starting upload process');

	try {
		let locations = await BackgroundGeolocation.getLocations();
		// CozyGPSMemoryLog(locations);

		let user = await _getId();
		CozyGPSMemoryLog('Using Id: ' + user);

		try {
			await SmartSend(locations, user, force);
			return true;
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
								return await UploadData();
							} catch { CozyGPSMemoryLog('Failed again'); return false; }
						} else { CozyGPSMemoryLog('Cancelling second attempt, succeeded since'); return true; }

					}, retryOnFailTime)
				} else { CozyGPSMemoryLog('Already failed twice, no more attempt until event'); return false; }
			} else { return false; }
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

		/// Handle update effects
		CheckForUpdateActions();

		/// 1.  Subscribe to events.
		const onEnabledChange = BackgroundGeolocation.onEnabledChange((enabled) => {
			if (!enabled) {
				CozyGPSMemoryLog('Turned off tracking, uploading...');
				UploadData(false, true); // Maybe should force? Not for now, to limit unpredictable behavior
			}
		})

		const onLocation = BackgroundGeolocation.onLocation((location) => {
			CozyGPSMemoryLog('Location: ' + location.coords.longitude.toString() + ', ' + location.coords.latitude.toString());
		});

		const onActivityChange = BackgroundGeolocation.onActivityChange((event) => {
			CozyGPSMemoryLog('Activity change: ' + event.activity + ' ' + event.confidence);
		});

		const onProviderChange = BackgroundGeolocation.onProviderChange((event) => {
			CozyGPSMemoryLog('Provider change:' + JSON.stringify(event));
		});

		if (!heavyLogs) {
			onLocation.remove();
			onActivityChange.remove();
			onProviderChange.remove();
		}

		const onMotionChange = BackgroundGeolocation.onMotionChange(async (event) => {
			CozyGPSMemoryLog('State change: ' + (event.isMoving ? 'Started moving' : 'Stopped'));
			if (!event.isMoving) {
				if (await _getAutoUploadFlag()) {
					CozyGPSMemoryLog('Auto uploading');
					UploadData();
				}
			}

		});


		const onConnectivityChange = BackgroundGeolocation.onConnectivityChange(async (event) => {
			// ne trigger pas en emul ios, donne event = {'connected': false}
			// à tester en réel
			CozyGPSMemoryLog('Connectivity change to: ' + event.connected);
			if (event.connected) {
				CozyGPSMemoryLog('Auto uploading');
				UploadData();
			}
		});

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
			// during development live-reload.  Without this, event-addedToeners will accumulate with
			// each refresh during live-reload.
			onLocation.remove();
			onMotionChange.remove();
			onActivityChange.remove();
			onProviderChange.remove();
			onConnectivityChange.remove();
			onEnabledChange.remove();
		}
	}, []);

	/// 3. start / stop BackgroundGeolocation

	React.useEffect(() => {
		if (enabled) {
			CozyGPSMemoryLog('Enabling tracking');
			BackgroundGeolocation.start();
		} else {
			CozyGPSMemoryLog('Disabling tracking');
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