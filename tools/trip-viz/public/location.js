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

document
  .getElementById('distanceForm')
  .addEventListener('submit', function (e) {
    e.preventDefault()
    // Get the input values
    const lat1 = parseFloat(document.getElementById('lat1').value)
    const lon1 = parseFloat(document.getElementById('lon1').value)
    const lat2 = parseFloat(document.getElementById('lat2').value)
    const lon2 = parseFloat(document.getElementById('lon2').value)

    // Validate inputs
    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
      alert('Please enter valid coordinates')
      return
    }

    // Calculate the distance
    const distance = calculateDistance(lat1, lon1, lat2, lon2)
    if (distance > 1) {
      // Display the result
      document.getElementById(
        'distanceResult'
      ).textContent = `Distance: ${distance.toFixed(4)} km`
    } else {
      // Display the result
      document.getElementById('distanceResult').textContent = `Distance: ${(
        distance * 1000
      ).toFixed(1)} m`
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

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Radius of the Earth in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c // Distance in kilometers
}
