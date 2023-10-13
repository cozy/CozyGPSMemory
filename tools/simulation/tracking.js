/*

FIXME: those methods should be imported from the geolocation lib.
However, we had some issues because of ESM module: 
- The relative imports in geolocation are not correctly interpreted
- The file extension is mandatory when importing, even for the imports
  in the geolocation lib.
In the meantime we take the time to fix it, we simply put the necessary methods here.
*/

const parseISOString = ISOString => {
  let b = ISOString.split(/\D+/)
  return new Date(Date.UTC(b[0], --b[1], b[2], b[3], b[4], b[5], b[6]))
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

export const makeStartTransitions = ts => {
  const transitions = []
  transitions.push(
    transition('STATE_WAITING_FOR_TRIP_START', 'T_EXITED_GEOFENCE', ts + 0.01)
  )
  transitions.push(
    transition('STATE_WAITING_FOR_TRIP_START', 'T_TRIP_STARTED', ts + 0.02)
  )
  transitions.push(
    transition('STATE_ONGOING_TRIP', 'T_TRIP_STARTED', ts + 0.03)
  )
  transitions.push(
    transition('STATE_ONGOING_TRIP', 'T_TRIP_RESTARTED', ts + 0.04)
  )

  return transitions
}

export const makeStopTransitions = ts => {
  const transitions = []
  transitions.push(
    transition('STATE_ONGOING_TRIP', 'T_VISIT_STARTED', ts + 0.01)
  )
  transitions.push(
    transition('STATE_ONGOING_TRIP', 'T_TRIP_END_DETECTED', ts + 0.02)
  )
  transitions.push(
    transition('STATE_ONGOING_TRIP', 'T_END_TRIP_TRACKING', ts + 0.03)
  )
  transitions.push(transition('STATE_ONGOING_TRIP', 'T_TRIP_ENDED', ts + 0.04))
  transitions.push(
    transition('STATE_WAITING_FOR_TRIP_START', 'T_NOP', ts + 0.05)
  )
  transitions.push(
    transition('STATE_WAITING_FOR_TRIP_START', 'T_DATA_PUSHED', ts + 0.06)
  )

  return transitions
}

export const translateToEMissionLocationPoint = location_point => {
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

export const translateToEMissionMotionActivityPoint = location => {
  let ts = Math.floor(parseISOString(location.timestamp).getTime() / 1000)

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

export const uploadToUsercache = async (serverURL, userID, content) => {
  const request = {
    user: userID,
    phone_to_server: content
  }
  return upload(serverURL, request)
}

export const upload = async (serverURL, request) => {
  try {
    const response = await fetch(serverURL + '/usercache/put', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })
    if (!response.ok) {
      throw new Error(
        String(
          'Error in request response:',
          response.status,
          response.statusText,
          await response.text()
        )
      )
    }
    return response
  } catch (err) {
    throw new Error(err)
  }
}

export const createUser = async (serverURL, user) => {
  let response = await fetch(serverURL + '/profile/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ user: user })
  })
  if (!response.ok) {
    console.log(
      'Error creating user: ' + response.status + ' ' + response.statusText
    )
    throw new Error('FAILED_EMISSION_USER_CREATION') // Could be no Internet, offline server or unknown issue. Won't trigger if user already exists.
  } else {
    const jsonTokenResponse = await response.json()
    console.log(
      'Success creating user ' + user + ', UUID: ' + jsonTokenResponse.uuid
    )
  }
}
