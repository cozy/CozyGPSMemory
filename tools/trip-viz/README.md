# Trip visualization

Visualize your GeoJSON trips stored in `public/geojson.json`

## Run

From this directory:


```sh
yarn
node server.js
```

## Get the trips

The file in which you should store the GeoJSON is `public/geojson.json`

There are 2 supported formats, depending on if you want to display one or multiple trips:

### Single trip

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


### Mutli trips

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
