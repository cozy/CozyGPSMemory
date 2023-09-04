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

const currVersionIterationCounter = 2; // Simple counter to iterate versions while we run betas and be able to run "one-time only" code on update. Probably exists a cleaner way
const DestroyLocalOnSuccess = true;
const stopTimeoutMin = 11;
const stopTimeout = 300; // Shouldn't have longer breaks without siginificant movement
const longStopTimeout = 530;
const serverURL = 'https://openpath.cozycloud.cc';
const maxPointsPerBatch = 300; // Represents actual points, elements in the POST will probably be around this*2 + ~10*number of stops made
const useUniqueDeviceId = false;
const useGeofencesOnAndroid = true;
const heavyLogs = false; // Log points, motion changes...
const maxLogSize = 100000; // In characters
const detectMotionActivity = true;

// Storage adresses used by AsyncStorage
// Note: if changed, devices upgrading from older build will keep the old ones unless we take care to delete them
const OldStorageAdresses = ['Id', 'Token', 'FlagFailUpload', 'should_be_tracking', 'stops', 'CozyGPSMemory.ID', 'CozyGPSMemory.UploadHistory', 'CozyGPSMemory.Stops', 'CozyGPSMemory.AutoUploadFlag'];

const IdStorageAdress = 'CozyGPSMemory.Id';
const FlagFailUploadStorageAdress = 'CozyGPSMemory.FlagFailUpload';
const ShouldBeTrackingFlagStorageAdress = 'CozyGPSMemory.ShouldBeTrackingFlag';
const LogAdress = 'CozyGPSMemory.Log';
const LastPointUploadedAdress = 'CozyGPSMemory.LastPointUploaded';
const versionIterationCounterStorageAdress = 'CozyGPSMemory.VersionIterationCounter';

const Logger = BackgroundGeolocation.logger;


async function _updateVersionIterationCounter() {
	await AsyncStorage.setItem(versionIterationCounterStorageAdress, currVersionIterationCounter.toString());
	await CozyGPSMemoryLog('Set versionIterationCounter to: ' + currVersionIterationCounter)
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
	return await Logger.getLog();
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
	// await _addToLog(message);
	Logger.debug(message);
}

async function _ClearLog() {
	await AsyncStorage.removeItem(LogAdress);
}

async function _storeFlagFailUpload(Flag) {
	try {
		await AsyncStorage.setItem(FlagFailUploadStorageAdress, Flag ? 'true' : 'false');
	} catch (error) {
		await CozyGPSMemoryLog('Error while storing FlagFailUpload:' + error.toString());
		throw (error);
	}
};

async function _getFlagFailUpload() {
	try {
		let value = await AsyncStorage.getItem(FlagFailUploadStorageAdress);
		if (value == undefined) {
			await _storeFlagFailUpload(false);
			return false;
		} else {
			return value == 'true';
		}
	} catch (error) {
		await CozyGPSMemoryLog('Error while getting FlagFailUpload:' + error.toString());
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
			await CozyGPSMemoryLog('No current Id, generating a new one...');
			value = useUniqueDeviceId ? await getUniqueId() : Math.random().toString(36).replace('0.', '');
			await _storeId(value); // random Id or device Id depending on config
			if (value != await AsyncStorage.getItem(IdStorageAdress)) {
				throw new Error('New Id couldn\'t be stored'); // We make sure it is stored
			}
			await CozyGPSMemoryLog('Set Id to: ' + value)
		}

		return value;

	} catch (error) {
		await CozyGPSMemoryLog('Error while getting Id:' + error.toString());
		throw (error);
	}
};

export async function ClearAllCozyGPSMemoryData() {
	await BackgroundGeolocation.destroyLocations();
	await AsyncStorage.multiRemove([IdStorageAdress, FlagFailUploadStorageAdress, ShouldBeTrackingFlagStorageAdress, LogAdress, LastPointUploadedAdress, versionIterationCounterStorageAdress]);
	await ClearOldCozyGPSMemoryStorage();
	await BackgroundGeolocation.logger.destroyLog();
	await CozyGPSMemoryLog('Everything cleared');
}

export async function ClearOldCozyGPSMemoryStorage() {
	await AsyncStorage.multiRemove(OldStorageAdresses); // Just to clean up devices upgrading from older builds since variable names were updated
}

async function CheckForUpdateActions() {

	lastVersion = await _getVersionIterationCounter();
	if (lastVersion != currVersionIterationCounter) {
		await CozyGPSMemoryLog('Found last version: ' + lastVersion + ', current: ' + currVersionIterationCounter);
		await ClearOldCozyGPSMemoryStorage();
		await CozyGPSMemoryLog('Cleared old storages');
		if (lastVersion < 2) {
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
		await CozyGPSMemoryLog('Error creating user: ' + response.status + ' ' + response.statusText);
		throw new Error('FAILED_EMISSION_USER_CREATION'); // Could be no Internet, offline server or unknown issue. Won't trigger if user already exists.
	} else {
		jsonTokenResponse = await response.json();
		await CozyGPSMemoryLog('Success creating user ' + user + ', UUID: ' + jsonTokenResponse['uuid']);
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
			'filter': 'distance',
			'floor': 0,
			'latitude': location_point['coords']['latitude'],
			'longitude': location_point['coords']['longitude'],
			'sensed_speed': location_point['coords']['speed'],
			'ts': ts + 0.1, // It's silly, but some rare operations of e-mission will take a timestamp without a decimal point as an integer and crash. Since it would be a hard crash, the pipeline will not attempt again for this user so the user would never get new tracks without intervention. This was the simplest way to insure that JSON.stringify() will leave a decimal point.
			'vaccuracy': location_point['coords']['altitude_accuracy']
		},
		'metadata': {
			'platform': 'ios',
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
			'platform': 'ios',
			'key': 'background/motion_activity',
			'read_ts': 0,
			'type': 'sensor-data'
		}
	};
}

export async function UpdateId(newId) { // If there are still non-uploaded locations, it should be handled before changing the Id or they will be sent with the new one
	await CozyGPSMemoryLog('Updating Id to ' + newId);

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
			'platform': 'ios',
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
	await CozyGPSMemoryLog('Uploading content to usercache...')
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

	if (heavyLogs) {
		await CozyGPSMemoryLog('Uploaded: ' + JSON.stringify(JsonRequest));
	}

	if (!response.ok) {
		throw new Error(String('Error in request response:', response.status, response.statusText, await response.text()));

	} else {
		await CozyGPSMemoryLog('Success uploading');
		if (lastPointToSave != undefined) {
			await _setLastPointUploaded(lastPointToSave);
			await CozyGPSMemoryLog('Saved last point');
		} else {
			await CozyGPSMemoryLog('No last point to save');
		}
		if (DestroyLocalOnSuccess && uuidsToDeleteOnSuccess.length > 0) {
			await CozyGPSMemoryLog('Removing local location records that were just uploaded...');
			for (let deleteIndex = 0; deleteIndex < uuidsToDeleteOnSuccess.length; deleteIndex++) {
				const element = uuidsToDeleteOnSuccess[deleteIndex];
				await BackgroundGeolocation.destroyLocation(element);
			}
			await CozyGPSMemoryLog('Done removing local locations')
		}
	}
}

async function uploadWithNoNewPoints(user, force) {
	lastPoint = await _getLastPointUploaded();
	content = [];

	if (force) {
		AddStopTransitions(content, Date.now() / 1000);
		await UploadUserCache(content, user, []);
	} else {
		if (lastPoint == undefined) {
			await CozyGPSMemoryLog('No previous location either, no upload');
		} else {
			let deltaT = Date.now() / 1000 - getTs(lastPoint);
			if (deltaT > stopTimeout) { // Note: no problem if we add a stop if there's already one
				await CozyGPSMemoryLog('Previous location old enough (' + deltaT + 's ago), posting stop transitions at ' + getTs(lastPoint));
				AddStopTransitions(content, getTs(lastPoint));
				await UploadUserCache(content, user, []);
				await CozyGPSMemoryLog('Finished upload of stop transtitions')
			} else {
				await CozyGPSMemoryLog('Previous location too recent (' + deltaT + 's ago), no upload');
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
	content = [];
	uuidsToDelete = [];

	for (let indexBuildingRequest = 0; indexBuildingRequest < points.length; indexBuildingRequest++) {
		const point = points[indexBuildingRequest];
		uuidsToDelete.push(point['uuid']);
		const prev = indexBuildingRequest == 0 ? previousPoint : points[indexBuildingRequest - 1];
		const next = indexBuildingRequest == points.length - 1 ? nextPoint : points[indexBuildingRequest + 1];

		if (prev == null || prev === undefined) {
			await CozyGPSMemoryLog('No previous point found, adding start at ' + (getTs(point) - 1) + 's');
			AddStartTransitions(content, getTs(point) - 1);

		} else {
			let deltaT = getTs(point) - getTs(prev);
			if (deltaT > stopTimeout) { // If the points are not close enough in time, we need to check that there was significant movement
				await CozyGPSMemoryLog('Noticed a break: ' + deltaT + 's at ' + getTs(prev));
				let distance = getDistanceFromLatLonInM(prev, point);
				if (distance < 300) { // TO TEST : what is the smallest distance needed? Is it a function of the time stopped?
					await CozyGPSMemoryLog('Small distance (' + distance + 'm), adding stop and start at: ' + (getTs(prev) + 180) + ' and ' + (getTs(point) - 1));
					AddStopTransitions(content, getTs(prev) + 180); // 3 min later for now
					AddStartTransitions(content, getTs(point) - 1);
				} else {
					await CozyGPSMemoryLog('Long distance, leaving uninterrupted trip: ' + distance + 'm');
				}
			}
		}

		//Condition de filtered_location:
		let samePosAsPrev = (
			prev != undefined &&
			point['coords']['longitude'] == prev['coords']['longitude'] &&
			point['coords']['latitude'] == prev['coords']['latitude']);
		let filtered = !samePosAsPrev && point['coords']['accuracy'] <= 200;

		AddPoint(content, point, filtered);

		if (next == null || next == undefined) { // Triggered when at the last point of the batch and there is no next point given (so when it's the last recorded position)
			if (Date.now() / 1000 - getTs(point) > longStopTimeout) {
				CozyGPSMemoryLog('Last known point is at ' + getTs(point) + ', adding stop transitions at ' + getTs(point) + 180);
				AddStopTransitions(content, getTs(point) + 180);
			}
		}
	}

	if (force) {
		await CozyGPSMemoryLog('Forcing stop at current time');
		AddStopTransitions(content, Date.now() / 1000);
	}

	await UploadUserCache(content, user, uuidsToDelete, points.at(-1));

}

export async function SmartSend(locations, user, force) {

	await CreateUser(user); // Will throw on fail, skipping the rest (trying again later is handled a level above SmartSend)

	if (locations.length == 0) {
		await CozyGPSMemoryLog('No new locations');
		uploadWithNoNewPoints(user, force);

	} else {

		await CozyGPSMemoryLog('Found pending locations, uploading them');
		let batchCounter = 0;
		for (let index = 0; index < locations.length; index += maxPointsPerBatch) {
			await CozyGPSMemoryLog('Creating batch ' + (batchCounter + 1) + '/' + (locations.length / maxPointsPerBatch).toFixed(0));
			await uploadPoints(
				locations.slice(index, index + maxPointsPerBatch),
				user,
				index == 0 ? await _getLastPointUploaded() : locations[index - 1],
				index + maxPointsPerBatch < locations.length - 1 ? locations[index + maxPointsPerBatch] : undefined,
				(force && index + maxPointsPerBatch >= locations.length)
			);

			batchCounter++;

		}

		await CozyGPSMemoryLog('Uploaded last batch');
	}

}

export async function UploadData(force = false) { // WARNING: la valeur de retour (booleen) indique le succès, mais mal géré dans le retryOnFail (actuellement uniquement utilisé pour le bouton "Forcer l'upload" avecec force et pas de retry)

	await CozyGPSMemoryLog('Starting upload process' + (force ? ', forced' : ''));

	try {
		let locations = await BackgroundGeolocation.getLocations();
		// CozyGPSMemoryLog(locations);

		let user = await _getId();
		await CozyGPSMemoryLog('Using Id: ' + user);

		try {
			await SmartSend(locations, user, force);
			await _storeFlagFailUpload(false);
			return true;
		} catch (message) {
			await CozyGPSMemoryLog('Error trying to send data: ' + message);
			await _storeFlagFailUpload(true);
			return false;
		}

	} catch (error) {
		throw new Error(error);
	}
}

/*
const onLocation = BackgroundGeolocation.onLocation(async (location) => {
	await CozyGPSMemoryLog('(' + location.coords.longitude.toString() + ', ' + location.coords.latitude.toString() + ')');
});

const onActivityChange = BackgroundGeolocation.onActivityChange(async (event) => {
	await CozyGPSMemoryLog('Activity change: ' + event.activity + ' ' + event.confidence);
});

const onProviderChange = BackgroundGeolocation.onProviderChange(async (event) => {
	await CozyGPSMemoryLog('Provider change:' + JSON.stringify(event));
});
*/

const onMotionChange = BackgroundGeolocation.onMotionChange(async (event) => {
	await CozyGPSMemoryLog('State change: ' + (event.isMoving ? 'Started moving' : 'Stopped'));
	if (!event.isMoving) {
		await CozyGPSMemoryLog('Auto uploading from stop');
		await UploadData();
	}

});

const onConnectivityChange = BackgroundGeolocation.onConnectivityChange(async (event) => {
	// ne trigger pas en emul ios, donne event = {'connected': false}
	// à tester en réel
	await CozyGPSMemoryLog('Connectivity change to: ' + event.connected);
	if (event.connected && await _getFlagFailUpload()) {
		await CozyGPSMemoryLog('Auto uploading from reconnection and failed last attempt');
		await UploadData();
	}
});


export async function StartTracking() {
	try {

		await CozyGPSMemoryLog('Starting');

		await BackgroundGeolocation.ready({
			// Geolocation Config
			desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
			showsBackgroundLocationIndicator: false, //Displays a blue pill on the iOS status bar when the location services are in use in the background (if the app doesn't have 'always' permission, the blue pill will always appear when location services are in use while the app isn't focused)
			distanceFilter: 10,
			locationUpdateInterval: 10000, // Only used if on Android and if distanceFilter is 0
			stationaryRadius: 25, //Minimum, but still usually takes 200m
			// Activity Recognition
			stopTimeout: stopTimeoutMin,
			// Application config
			debug: false, // <-- enable this hear sounds for background-geolocation life-cycle and notifications
			logLevel: BackgroundGeolocation.LOG_LEVEL_DEBUG,
			stopOnTerminate: false,   // <-- Allow the background-service to continue tracking when user closes the app. (not on iOS)
			startOnBoot: true,        // <-- Auto start tracking when device is powered-up.
			// HTTP / SQLite config

			batchSync: false,       // <-- [Default: false] Set true to sync locations to server in a single HTTP request.
			autoSync: false,         // <-- [Default: true] Set true to sync each location to server as it arrives.
		});
		await BackgroundGeolocation.start();

		return true;
	} catch { return false; }
}

export async function StopTracking() {
	try {

		if ((await BackgroundGeolocation.getState()).enabled) {

			await CozyGPSMemoryLog('Turned off tracking, uploading...');
			await UploadData(true); // Forced end, but if fails no current solution (won't retry until turned back on)
			await BackgroundGeolocation.stop();

		} else {
			console.log('Already off');
		}
		return true;
	} catch { return false; }
}

export function GeolocationSwitch() {
	const [enabled, setEnabled] = React.useState(false);
	const Toggle = () => {
		if (!enabled) {
			AsyncStorage.setItem(ShouldBeTrackingFlagStorageAdress, 'true');
			StartTracking();
		} else {
			AsyncStorage.setItem(ShouldBeTrackingFlagStorageAdress, 'false');
			StopTracking();
		}
		setEnabled(previousState => !previousState);
	};


	React.useEffect(() => {
		const checkAsync = async () => {
			const value = await AsyncStorage.getItem(ShouldBeTrackingFlagStorageAdress)
			if (value !== undefined && value !== null) {
				if (value == 'true') {
					setEnabled(true);
					StartTracking();
				} else {
					setEnabled(false);
					StopTracking();
				}
			} else {
				setEnabled(false);
				StopTracking();
				AsyncStorage.setItem(ShouldBeTrackingFlagStorageAdress, 'false');
			}
		}
		checkAsync()

		/// Handle update effects
		CheckForUpdateActions();

	}, [])

	return (
		<View style={{ alignItems: 'center', padding: 50 }}>
			<Text style={{
				fontSize: 36, padding: 10, color: useColorScheme() === 'dark' ? '#ffffff' : '#000000',
			}}>Tracking</Text>
			<Switch value={enabled} onValueChange={Toggle} />

		</View>
	)
}