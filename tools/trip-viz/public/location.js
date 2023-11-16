let map
document
  .getElementById('coordinatesForm')
  .addEventListener('submit', function (e) {
    e.preventDefault()
    const latitude = parseFloat(document.getElementById('latitude').value)
    const longitude = parseFloat(document.getElementById('longitude').value)
    if (map) {
      // If map already exists, just change its center and marker
      map.setView([latitude, longitude], 13)
      L.marker([latitude, longitude])
        .addTo(map)
        .bindPopup('The coordinates are ' + latitude + ', ' + longitude)
        .openPopup()
    } else {
      showMap(latitude, longitude)
    }
  })

function showMap(lat, lng) {
  map = L.map('map').setView([lat, lng], 13)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map)

  L.marker([lat, lng])
    .addTo(map)
    .bindPopup('The coordinates are ' + lat + ', ' + lng)
    .openPopup()
}
