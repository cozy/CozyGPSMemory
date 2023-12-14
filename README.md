# CozyGPSMemory

Track your trips to visualize them later on your Cozy.

# Dev

```
git submodule init
git submodule update
yarn
yarn start
```

We added cozy-flagship-app as a submodule to centralize tracking logic quickly.

If you want to update cozy-flagship-app, run `git submodule update --remote cozy-flagship-app`.

# Tools

Visualize your GeoJSON trips stored in `public/geojson.json`.

## Run

```sh
# Only first time
cp tools/trip-viz/public/geojson.json.sample tools/trip-viz/public/geojson.json

# Run server
yarn server-viz
```

## Get the trips

The file in which you should store the GeoJSON is `public/geojson.json`.

The simplest method to populate this file is running the script

```sh
./tools/data-viz/scripts/get-emission-geojson.sh <userID> <date> [server_url]
```

This will fetch the trips stored in the given `server_url` (default is http://localhost:8080),
on the given user and date (format YYYY-MM-DD).

### Data format

There are 2 supported formats for the geojson.json file, depending on if you want to display one or multiple trips:

#### Single trip

This corresponds to a standard GeoJSON, for instance:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-0.127758, 51.507351]
      },
      "properties": {
        "name": "London"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [-0.138321, 51.502781],
            [-0.125503, 51.502542],
            [-0.116852, 51.507743],
            [-0.117981, 51.512679],
            [-0.131104, 51.513845],
            [-0.138321, 51.502781]
          ]
        ]
      },
      "properties": {
        "name": "Polygon around Central London"
      }
    }
  ]
}
```

#### Multi trips

The format is the following and corresponds to the raw response of an openpath server on `https://<url>/timeline/getTrips/<YYYY-mm-dd>`:

```json
{
  "timeline": [
    {
      // GeoJSON 1
      ...
    },
    {
      // GeoJSON 2
      ...
    },
    ...
  ]
}
```

# Simulation

You can generate trips to an e-mission server, thanks to the simulator.

Edit the variables at the bottom of `tools/simulation/index.js` to your convenience.

## Run

```sh
cd tools/simulation
node index.js
```

# Data models

Here we detail the plugin data models

## Location

```
{
  "extras": {},
  "battery": {
    "level": 0.97,
    "is_charging": false
  },
  "activity": {
    "confidence": 100,
    "type": "still"
  },
  "is_moving": true,
  "age": 106,
  "uuid": "64526feb-f82f-4518-9c7b-58105f938a6f",
  "odometer": 417394.1875,
  "coords": {
    "age": 112,
    "ellipsoidal_altitude": 98.5,
    "altitude": 98.5,
    "altitude_accuracy": 4.5,
    "heading_accuracy": 10.77,
    "heading": 39.2,
    "speed": 9.77,
    "accuracy": 6.8,
    "longitude": 4.3246372,
    "speed_accuracy": 1.78,
    "latitude": 46.2748476
  },
  "timestamp": "2023-12-05T07:30:38.959Z"
}
```

## Motion

```
{
  "isMoving": true,
  "location": {
    "extras": {},
    "battery": {
      "level": 0.97,
      "is_charging": false
    },
    "activity": {
      "confidence": 100,
      "type": "still"
    },
    "is_moving": true,
    "uuid": "13a33769-5d4d-46ea-b68b-b123ada6f120",
    "age": 6402,
    "coords": {
      "age": 6414,
      "ellipsoidal_altitude": 95.6,
      "altitude": 95.6,
      "altitude_accuracy": 4.1,
      "heading_accuracy": 5.4,
      "heading": 52.89,
      "speed": 7.83,
      "accuracy": 3.9,
      "longitude": 4.3246372,
      "speed_accuracy": 1.2,
      "latitude": 46.2748476
    },
    "timestamp": "2023-12-05T07:30:31.333Z",
    "odometer": 417325.40625,
    "event": "motionchange"
  }
}
```

## Activity

```
{
  "confidence":100,
  "activity":"in_vehicle"
}
```

> [!WARNING]  
> On Android, this value is not relevant and is always 100.

### Activity types

See https://transistorsoft.github.io/react-native-background-geolocation/interfaces/motionactivity.html#type

- still
- walking
- on_foot
- running
- on_bicycle
- in_vehicle
- unknown
