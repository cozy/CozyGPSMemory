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
cp tools/trip-viz/public/geojson.json.sample cp tools/trip-viz/public/geojson.json

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

#### Single trip

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


#### Mutli trips

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

