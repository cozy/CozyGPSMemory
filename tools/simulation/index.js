import addSeconds from 'date-fns/addSeconds/index.js'

import {
  createUser,
  makeStartTransitions,
  makeStopTransitions,
  translateToEMissionLocationPoint,
  translateToEMissionMotionActivityPoint,
  uploadToUsercache
} from './tracking.js'

const DISTANCE_FILTER = 50 // meters

const BIKE_MODE = 'on_bicycle'
const WALK_MODE = 'walking'
const CAR_MODE = 'in_vehicle'
const STILL_MODE = 'still'
const UNKNOWN_MODE = 'unknown'

const ALL_MOTION_MODES = [BIKE_MODE, WALK_MODE, CAR_MODE]

const pickRandomMode = modes => {
  const randomIndex = Math.floor(Math.random() * modes.length)
  return modes[randomIndex]
}

const generateStartEndPoints = (distanceM, { start = null } = {}) => {
  const R = 6371 // Earth's mean radius in kilometers

  let startPoint = start || {
    lat: Math.random() * 180 - 90, // Random latitude between -90 and 90
    lon: Math.random() * 360 - 180 // Random longitude between -180 and 180
  }

  // Convert degrees to radians
  function toRadians(degree) {
    return degree * (Math.PI / 180)
  }

  // Convert radians to degrees
  function toDegrees(radian) {
    return radian * (180 / Math.PI)
  }

  // Random bearing between 0 and 2π
  const theta = Math.random() * 2 * Math.PI

  const delta = distanceM / 1000 / R // Angular distance

  const destinationLat = toDegrees(
    Math.asin(
      Math.sin(toRadians(startPoint.lat)) * Math.cos(delta) +
        Math.cos(toRadians(startPoint.lat)) * Math.sin(delta) * Math.cos(theta)
    )
  )

  const destinationLon = toDegrees(
    toRadians(startPoint.lon) +
      Math.atan2(
        Math.sin(theta) * Math.sin(delta) * Math.cos(toRadians(startPoint.lat)),
        Math.cos(delta) -
          Math.sin(toRadians(startPoint.lat)) *
            Math.sin(toRadians(destinationLat))
      )
  )

  const endPoint = {
    lat: destinationLat,
    lon: destinationLon
  }

  return {
    startPoint: startPoint,
    endPoint: endPoint
  }
}
// Calculate the intermediate points between start and end
function generateLocations(startPoint, endPoint, numPoints) {
  const latDiff = endPoint.lat - startPoint.lat
  const lngDiff = endPoint.lon - startPoint.lon

  const latStep = latDiff / numPoints
  const lngStep = lngDiff / numPoints

  const points = []
  for (let i = 0; i < numPoints; i++) {
    points.push({
      lat: startPoint.lat + latStep * i,
      lon: startPoint.lon + lngStep * i
    })
  }
  return points
}

// Generate random motion activity event
function generateMotionEvent({
  activityType = 'still',
  coords,
  date,
  speed = 0.2,
  uuid
}) {
  return {
    extras: {},
    battery: {
      level: Math.random().toFixed(2),
      is_charging: Math.random() > 0.5
    },
    activity: {
      confidence: 100,
      type: activityType
    },
    timestamp: date.toISOString(),
    coords: {
      ellipsoidal_altitude: 92.2,
      altitude: 92.2,
      altitude_accuracy: 2.4,
      heading_accuracy: -1,
      heading: -1,
      speed: speed,
      accuracy: 18.5,
      longitude: coords.lon,
      latitude: coords.lat,
      speed_accuracy: -1
    },
    is_moving: Math.random() > 0.5,
    uuid: uuid || generateUUID(),
    odometer: (Math.random() * 100000).toFixed(6)
  }
}

const makeFilteredLocationPoint = motionEvent => {
  const point = translateToEMissionLocationPoint(motionEvent)
  point.metadata.key = 'background/filtered_location'
  return point
}

const makeLocationPoint = motionEvent => {
  const point = translateToEMissionLocationPoint(motionEvent)
  return point
}

const makeMotionActivity = motionEvent => {
  const activity = translateToEMissionMotionActivityPoint(motionEvent)
  return activity
}

// Generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const computeDurationInSec = (d1, d2) => {
  let date1 = d1
  let date2 = d2
  if (d1.getTime() > d2.getTime()) {
    date1 = d2
    date2 = d1
  }
  return (date2.getTime() - date1.getTime()) / 1000
}

// TODO: generate motion activity
const generateData = ({
  distance,
  startDate,
  endDate,
  startPoint,
  endPoint,
  sections,
  uuid
}) => {
  const totalDuration = computeDurationInSec(startDate, endDate)
  console.log('toital duration : ', totalDuration)
  const speed = distance / totalDuration // TODO: make some variations in speed

  const nPoints = Math.floor(distance / DISTANCE_FILTER)
  const timeInterval = Math.floor(totalDuration / nPoints)

  const points = []
  const activities = []
  const transitions = []

  // Make start transitions
  const startTransitions = makeStartTransitions(startDate.getTime() / 1000 - 1)
  transitions.push(...startTransitions)

  const locations = generateLocations(startPoint, endPoint, nPoints)

  let mode
  if (!sections || sections.length < 1) {
    mode = pickRandomMode(ALL_MOTION_MODES)
  }

  let currDate = startDate

  // Generate points and activity
  for (let i = 0; i < nPoints; i++) {
    const motionEvent = generateMotionEvent({
      date: currDate,
      speed,
      activityType: mode, // TODO: adapt mode to sections
      coords: locations[i],
      uuid
    })
    currDate = addSeconds(currDate, timeInterval)

    const point = makeLocationPoint(motionEvent)
    const filteredPoint = makeFilteredLocationPoint(motionEvent)
    points.push(point)
    points.push(filteredPoint)

    if (i === 0) {
      activities.push(makeMotionActivity(motionEvent))
      // TODO should make activity depending on sections
    }
  }
  // Generate last still point
  const motionEvent = generateMotionEvent({
    date: endDate,
    speed: 0,
    activityType: STILL_MODE,
    coords: locations[locations.length - 1]
  })

  activities.push(makeMotionActivity(motionEvent))

  // Make stop transitions
  const stopTransitions = makeStopTransitions(endDate.getTime() / 1000 + 180)
  transitions.push(...stopTransitions)

  console.log('generated points : ', points.length)
  console.log('generated activities : ', activities.length)

  return [...points, ...activities, ...transitions]
}

const sendData = async (serverURL, userID, data) => {
  // Send data to server
  await createUser(serverURL, userID)
  await uploadToUsercache(serverURL, userID, data)
}

const startSimulation = async ({
  serverURL,
  distance,
  userID,
  startDate,
  endDate
}) => {
  const { startPoint, endPoint } = generateStartEndPoints(distance)

  const data = generateData({
    distance,
    startDate,
    startPoint,
    endPoint,
    endDate,
    sections: null,
    uuid: userID
  })

  console.log(`Upload data to server ${serverURL}`)
  await sendData(serverURL, userID, data)
}

// EDIT FOR SIMULATION
const DISTANCE_M = 5000
const USER_ID = 'testpaulsimu'
const SERVER_URL = 'http://localhost:8080'

const START_DATE = new Date('2023-10-10T12:00:00')
const END_DATE = new Date('2023-10-10T12:20:00')

startSimulation({
  distance: DISTANCE_M,
  userID: USER_ID,
  serverURL: SERVER_URL,
  startDate: START_DATE,
  endDate: END_DATE
})
