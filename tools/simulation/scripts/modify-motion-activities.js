import Mongo from 'mongodb'

const MongoClient = Mongo.MongoClient

const url = 'mongodb://localhost:27017'
const dbName = 'Stage_database'

const DEFAULT_SPEED_RUNNING = 3.1
const DEFAULT_SPEED_CYCLING = 5.5
const DEFAULT_SPEED_AUTOMOTIVE = 13.9

const IN_VEHICLE_TYPE = 0
const BICYCLING_TYPE = 1
const STILL_TYPE = 3
const WALKING_TYPE = 7
const RUNNING_TYPE = 8

const client = new MongoClient(url)

const connectToDatabase = async () => {
  await client.connect()
  const db = client.db(dbName)
  return db
}

const getUuidFromUserEmail = async (db, userEmail) => {
  const stageUuidsCollection = db.collection('Stage_uuids')

  const document = await stageUuidsCollection.findOne({ user_email: userEmail })
  return document ? document.uuid : null
}

const findNearestLocation = (motionActivity, locationDocuments) => {
  let nearestLocation = null
  let smallestDiff = Infinity

  locationDocuments.forEach(location => {
    const diff = Math.abs(location.data.ts - motionActivity.data.ts)
    if (diff < smallestDiff) {
      smallestDiff = diff
      nearestLocation = location
    }
  })

  return nearestLocation
}

const updateDocuments = async (db, { userId, startDate, endDate, dryRun }) => {
  const timeseriesCollection = db.collection('Stage_timeseries')

  const motionActivities = await timeseriesCollection
    .find({
      user_id: userId,
      'data.fmt_time': { $gt: startDate, $lt: endDate },
      'metadata.key': 'background/motion_activity'
    })
    .toArray()

  console.log(`Got ${motionActivities.length} motion activities`)
  const locations = await timeseriesCollection
    .find({
      user_id: userId,
      'data.fmt_time': { $gt: startDate, $lt: endDate },
      'metadata.key': 'background/location'
    })
    .toArray()

  console.log(`Got ${motionActivities.length} locations`)

  let docsUpdated = 0
  for (const motionActivity of motionActivities) {
    const nearestLocation = findNearestLocation(motionActivity, locations)
    if (nearestLocation) {
      const speed = nearestLocation.data.sensed_speed
      motionActivity.data.cycling = false
      motionActivity.data.running = false
      motionActivity.data.walking = false
      motionActivity.data.automotive = false
      motionActivity.data.stationary = false
      motionActivity.data.unknown = false
      if (speed < 0) {
        motionActivity.data.unknown = true
      } else if (speed === 0) {
        motionActivity.data.stationary = true
        motionActivity.data.type = STILL_TYPE
      } else if (speed > 0 && speed < DEFAULT_SPEED_RUNNING) {
        motionActivity.data.walking = true
        motionActivity.data.type = WALKING_TYPE
      } else if (
        speed >= DEFAULT_SPEED_RUNNING &&
        speed < DEFAULT_SPEED_CYCLING
      ) {
        motionActivity.data.running = true
        motionActivity.data.type = RUNNING_TYPE
      } else if (
        speed >= DEFAULT_SPEED_CYCLING &&
        speed < DEFAULT_SPEED_AUTOMOTIVE / 2
      ) {
        motionActivity.data.cycling = true
        motionActivity.data.type = BICYCLING_TYPE
      } else {
        motionActivity.data.automotive = true
        motionActivity.data.type = IN_VEHICLE_TYPE
      }

      if (!dryRun) {
        await timeseriesCollection.updateOne(
          { _id: motionActivity._id },
          { $set: { data: motionActivity.data } }
        )
        docsUpdated++
      } else {
        console.log('New motion activity: ', JSON.stringify(motionActivity))
      }
    }
  }
  console.log('Docs updated: ', docsUpdated)
  return docsUpdated
}

const run = async () => {
  const user = process.argv[2]
  const startDate = process.argv[3]
  const endDate = process.argv[4]
  const dryRun = process.argv[5] !== 'false'

  if (!user || !startDate || !endDate) {
    console.error('Please provide userId, startDate and endDate as arguments.')
    process.exit(1)
  }

  try {
    const db = await connectToDatabase()
    const userId = await getUuidFromUserEmail(db, user)
    if (!userId) {
      console.log('No user found for ', user)
      return
    }
    console.log('Found user uuid : ', userId)
    await updateDocuments(db, { userId, startDate, endDate, dryRun })
  } catch (err) {
    console.error(err)
  } finally {
    console.log('close database')
    await client.close()
  }
}

run().catch(console.error)
