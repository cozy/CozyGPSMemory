/* global L */

const map = L.map('map').setView([0, 0], 2) // [0, 0] est le centre initial et 2 est le niveau de zoom initial
let allLayers = L.featureGroup()
const colors = ['red', 'blue', 'green', 'purple', 'orange'] // Define a list of colors.

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map)

fetch('/geojson.json')
  .then(response => response.json())
  .then(data => {
    if (data.timeline) {
      data.timeline.forEach((geo, index) => {
        let geoLayer = L.geoJSON(geo, {
          style: () => ({
            color: colors[index % colors.length], // Cycle through the colors array.
            weight: 2,
            opacity: 1,
            fillColor: colors[index % colors.length],
            fillOpacity: 0.5
          })
        })
        geoLayer.addTo(map)
        allLayers.addLayer(geoLayer)

        displayInfo(geo)
      })
    } else {
      const geoLayer = L.geoJSON(data)
      geoLayer.addTo(map)
      allLayers.addLayer(geoLayer)
      displayInfo(data)
    }
    map.fitBounds(allLayers.getBounds())

    return
  })
  .catch(err => {
    console.log(err)
  })

function displayInfo(geojson) {
  let displayData = ''

  let properties = geojson.properties
  let start_date = new Date(properties.start_fmt_time).toISOString()
  let end_date = new Date(properties.end_fmt_time).toISOString()
  let duration = (properties.duration / 60).toFixed(2) // Convert to minutes
  let distance = (properties.distance / 1000).toFixed(2) // Convert to km

  displayData += `<p>Start Date: ${start_date}</p>`
  displayData += `<p>End Date: ${end_date}</p>`
  displayData += `<p>Duration: ${duration} minutes</p>`
  displayData += `<p>Distance: ${distance} km</p>`

  const featureCollections = geojson.features.filter(
    feature => feature.type === 'FeatureCollection'
  )

  featureCollections.forEach(featureCollection => {
    let firstFeature = featureCollection.features[0]

    let section_start_date = new Date(
      firstFeature.properties.start_fmt_time
    ).toISOString()
    let section_end_date = new Date(
      firstFeature.properties.end_fmt_time
    ).toISOString()
    let section_duration = (firstFeature.properties.duration / 60).toFixed(2)
    let section_distance = (firstFeature.properties.distance / 1000).toFixed(2)
    let transport_mode = firstFeature.properties.sensed_mode

    displayData += `<h3>Section Info:</h3>`
    displayData += `<p>Start Date: ${section_start_date}</p>`
    displayData += `<p>End Date: ${section_end_date}</p>`
    displayData += `<p>Duration: ${section_duration} minutes</p>`
    displayData += `<p>Distance: ${section_distance} km</p>`
    displayData += `<p>Transport Mode: ${transport_mode}</p>`

    document.getElementById('info').innerHTML += displayData
  })
}
