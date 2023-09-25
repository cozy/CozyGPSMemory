import { uploadUserCache } from './upload'
import { createUser } from './user'
import {
  StorageKeys,
  storeData,
  getData
} from '../../src/libs/localStorage/storage'
import { getTs, Log, parseISOString } from '../helpers'

const timeToAddStopTransitionsSec = 20 * 60 // Shouldn't have longer breaks without siginificant motion
const maxDistanceDeltaToRestart = 200 // In meters
const maxPointsPerBatch = 300 // Represents actual points, elements in the POST will probably be around this*2 + ~10*number of stops made

const getLastPointUploaded = async () => {
  return await getData(StorageKeys.LastPointUploadedAdress)
}

export const setLastPointUploaded = async value => {
  await storeData(StorageKeys.LastPointUploadedAdress, value)
}

const setLastStopTransitionTs = async timestamp => {
  await storeData(StorageKeys.LastStopTransitionTsKey, timestamp.toString())
}

const setLastStartTransitionTs = async timestamp => {
  await storeData(StorageKeys.LastStartTransitionTsKey, timestamp.toString())
}

const getLastStopTransitionTs = async () => {
  const ts = await getData(StorageKeys.LastStopTransitionTsKey)
  return ts ? parseInt(ts, 10) : 0
}

const getLastStartTransitionTs = async () => {
  const ts = await getData(StorageKeys.LastStartTransitionTsKey)
  return ts ? parseInt(ts, 10) : 0
}

// Future entry point of algorithm
// prepareTrackingData / extractTrackingDate
export const smartSend = async (locations, user, { force = true } = {}) => {
  await createUser(user) // Will throw on fail, skipping the rest (trying again later is handled a level above smartSend)

  if (locations.length === 0) {
    Log('No new locations')
    await uploadWithNoNewPoints(user, force)
  } else {
    Log('Found pending locations, uploading them')
    let batchCounter = 0
    for (let index = 0; index < locations.length; index += maxPointsPerBatch) {
      Log(
        'Creating batch ' +
          (batchCounter + 1) +
          '/' +
          (1 + locations.length / maxPointsPerBatch).toFixed(0)
      ) // Probably imperfect, TO DO: check formula
      await uploadPoints(
        locations.slice(index, index + maxPointsPerBatch),
        user,
        index === 0 ? await getLastPointUploaded() : locations[index - 1],
        index + maxPointsPerBatch >= locations.length,
        force
      )

      batchCounter++
    }

    Log('Uploaded last batch')
  }
}

const uploadWithNoNewPoints = async (user, force) => {
  const lastPoint = await getLastPointUploaded()
  const content = []

  if (force) {
    await addStopTransitions(content, Date.now() / 1000)
    await uploadUserCache(content, user, [])
  } else {
    if (lastPoint == undefined) {
      Log('No previous location either, no upload')
    } else {
      let deltaT = Date.now() / 1000 - getTs(lastPoint)
      if (deltaT > timeToAddStopTransitionsSec) {
        // Note: no problem if we add a stop if there's already one
        Log(
          'Previous location old enough (' +
            deltaT +
            's ago), posting stop transitions at ' +
            new Date(1000 * getTs(lastPoint))
        )
        await addStopTransitions(content, getTs(lastPoint))
        await uploadUserCache(content, user, [])
        Log('Finished upload of stop transtitions')
      } else {
        Log('Previous location too recent (' + deltaT + 's ago), no upload')
      }
    }
  }
}

const uploadPoints = async (points, user, lastPoint, isLastBatch) => {
  const contentToUpload = []
  const uuidsToDelete = []

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    uuidsToDelete.push(point.uuid)
    if (points.length > 0) {
      Log(
        'upload points from ' +
          points[0]?.timestamp +
          ' - to ' +
          points[points.length - 1]?.timestamp
      )
    }
    const previousPoint =
      i === 0 // Handles setting up the case for the first point
        ? lastPoint // Can be undefined
        : points[i - 1]

    // ----- Step 1: Decide if transitions should be added
    let startNewTrip = false
    if (!previousPoint) {
      Log(
        'No previous point found, adding start at ' +
          new Date(1000 * (getTs(point) - 1)) +
          's'
      )
      await addStartTransitions(contentToUpload, getTs(point) - 1)
      startNewTrip = true
    } else {
      const deltaT = getTs(point) - getTs(previousPoint)
      if (deltaT > timeToAddStopTransitionsSec) {
        // If the points are not close enough in time, we need to check that there was significant movement
        Log(
          'Noticed a break: ' +
            deltaT +
            's at ' +
            new Date(1000 * getTs(previousPoint)),
          's between ' +
            new Date(1000 * getTs(previousPoint)) +
            ' and ' +
            new Date(1000 * getTs(point))
        )
        const distance = getDistanceFromLatLonInM(previousPoint, point)
        Log('Distance between points : ' + distance)
        if (distance < maxDistanceDeltaToRestart) {
          Log('Add manual stop/start because of small distance')
          // TO DO: what is the smallest distance needed? Is it a function of the time stopped?
          await addStopTransitions(contentToUpload, getTs(previousPoint) + 1)
          await addStartTransitions(contentToUpload, getTs(point) - 1)
          startNewTrip = true
        } else {
          Log('Long distance, leaving uninterrupted trip: ' + distance + 'm')
        }
      }
    }

    // -----Step 2: Add location points and motion activity

    if (!startNewTrip && i === 0) {
      // Add a start transition when it's the first point of the batch, and no start transition had been set
      const lastStartTransitionTs = await getLastStartTransitionTs()
      const lastStopTransitionTs = await getLastStopTransitionTs()
      if (lastStopTransitionTs >= lastStartTransitionTs) {
        Log('Based on timestamps, this is a new trip')
        await addStartTransitions(contentToUpload, getTs(point) - 1)
      }
    }

    // Condition de filtered_location:
    const samePosAsPrev =
      previousPoint &&
      point.coords.longitude === previousPoint.coords.longitude &&
      point.coords.latitude === previousPoint.coords.latitude
    const filtered = !samePosAsPrev && point.coords.accuracy <= 200

    addPoint(contentToUpload, point, filtered)
    addMotionActivity(contentToUpload, previousPoint, point)
  }

  // -----Step 3: Force end trip for the last point, as the device had been stopped long enough
  if (isLastBatch) {
    // Force a stop transition for the last point
    const lastBatchPoint = points[points.length - 1]
    const deltaLastPoint = Date.now() / 1000 - getTs(lastBatchPoint)
    Log('Delta last point : ' + deltaLastPoint)
    await addStopTransitions(contentToUpload, getTs(lastBatchPoint) + 180)
  }

  // -----Step 4: Upload data
  await uploadUserCache(
    contentToUpload,
    user,
    uuidsToDelete,
    points[points.length - 1]
  )
}

// Add start transitions, within 0.1s of given ts
const addStartTransitions = async (addedTo, ts) => {
  Log('Add start transitions on ' + new Date(ts))

  addedTo.push(
    transition('STATE_WAITING_FOR_TRIP_START', 'T_EXITED_GEOFENCE', ts + 0.01)
  )
  addedTo.push(
    transition('STATE_WAITING_FOR_TRIP_START', 'T_TRIP_STARTED', ts + 0.02)
  )
  addedTo.push(transition('STATE_ONGOING_TRIP', 'T_TRIP_STARTED', ts + 0.03))
  addedTo.push(transition('STATE_ONGOING_TRIP', 'T_TRIP_RESTARTED', ts + 0.04))

  await setLastStartTransitionTs(ts)
}

// Add stop transitions, within 0.1s of given ts
const addStopTransitions = async (addedTo, ts) => {
  Log('Add stop transitions on ' + new Date(ts * 1000))

  addedTo.push(transition('STATE_ONGOING_TRIP', 'T_VISIT_STARTED', ts + 0.01))
  addedTo.push(
    transition('STATE_ONGOING_TRIP', 'T_TRIP_END_DETECTED', ts + 0.02)
  )
  addedTo.push(
    transition('STATE_ONGOING_TRIP', 'T_END_TRIP_TRACKING', ts + 0.03)
  )
  addedTo.push(transition('STATE_ONGOING_TRIP', 'T_TRIP_ENDED', ts + 0.04))
  addedTo.push(transition('STATE_WAITING_FOR_TRIP_START', 'T_NOP', ts + 0.05))
  addedTo.push(
    transition('STATE_WAITING_FOR_TRIP_START', 'T_DATA_PUSHED', ts + 0.06)
  )
  await setLastStopTransitionTs(ts)
}

const transition = (state, transition, transition_ts) => {
  return {
    data: {
      currState: state,
      transition: transition,
      ts: transition_ts
    },
    metadata: {
      platform: 'ios',
      write_ts: transition_ts,
      time_zone: 'UTC',
      key: 'statemachine/transition',
      read_ts: 0,
      type: 'message'
    }
  }
}

const addPoint = (content, point, filtered) => {
  content.push(translateToEMissionLocationPoint(point))

  if (filtered) {
    content.push(translateToEMissionLocationPoint(point))
    content[content.length - 1].metadata.key = 'background/filtered_location'
  }
}

const addMotionActivity = (content, previousPoint, point) => {
  if (!previousPoint || previousPoint.activity?.type !== point.activity?.type) {
    // Add new activity type when it's the first point, or when a new motion activity type (i.e. mode) is detected
    const motionActivity = translateToEMissionMotionActivityPoint(point)
    content.push(motionActivity)
  }
  return
}

const translateToEMissionLocationPoint = location_point => {
  let ts = Math.floor(parseISOString(location_point.timestamp).getTime() / 1000)
  return {
    data: {
      accuracy: location_point.coords.accuracy,
      altitude: location_point.coords.altitude,
      bearing: location_point.coords.heading,
      filter: 'distance',
      floor: 0,
      latitude: location_point.coords.latitude,
      longitude: location_point.coords.longitude,
      sensed_speed: location_point.coords.speed,
      ts: ts + 0.1, // It's silly, but some rare operations of e-mission will take a timestamp without a decimal point as an integer and crash. Since it would be a hard crash, the pipeline will not attempt again for this user so the user would never get new tracks without intervention. This was the simplest way to insure that JSON.stringify() will leave a decimal point.
      vaccuracy: location_point.coords.altitude_accuracy
    },
    metadata: {
      platform: 'ios',
      write_ts: ts + 0.1,
      time_zone: 'UTC',
      key: 'background/location',
      read_ts: 0,
      type: 'sensor-data'
    }
  }
}

const translateToEMissionMotionActivityPoint = location => {
  let ts = Math.floor(parseISOString(location.timestamp).getTime() / 1000)
  Log('Activity type : ' + location.activity.type)
  if (location.activity.type === 'unknown') {
    Log('Unknown activity at: ' + location.timestamp)
  }
  // See: https://transistorsoft.github.io/react-native-background-geolocation/interfaces/motionactivity.html#type
  return {
    data: {
      cycling: location.activity.type === 'on_bicycle',
      running: location.activity.type === 'running',
      walking:
        location.activity.type === 'walking' ||
        location.activity.type === 'on_foot', // on_foot includes running or walking
      automotive: location.activity.type === 'in_vehicle',
      stationary: location.activity.type === 'still',
      unknown: location.activity.type === 'unknown',
      confidence: location.activity.confidence,
      ts: ts + 0.2,
      confidence_level:
        location.activity.confidence > 75
          ? 'high'
          : location.activity.confidence > 50
          ? 'medium'
          : 'low'
    },
    metadata: {
      write_ts: ts + 0.2,
      time_zone: 'UTC',
      platform: 'ios',
      key: 'background/motion_activity',
      read_ts: 0,
      type: 'sensor-data'
    }
  }
}

const deg2rad = deg => {
  return deg * (Math.PI / 180)
}

const getDistanceFromLatLonInM = (point1, point2) => {
  const R = 6371 // Radius of the earth in km
  const dLat = deg2rad(point2.coords.latitude - point1.coords.latitude) // deg2rad below
  const dLon = deg2rad(point2.coords.longitude - point1.coords.longitude)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(point1.coords.latitude)) *
      Math.cos(deg2rad(point2.coords.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const d = R * c // Distance in km
  return d * 1000
}
