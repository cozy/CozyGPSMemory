const express = require('express')
const app = express()
const PORT = 3000

app.use(express.static('tools/trip-viz/public'))
app.use(express.urlencoded({ extended: true }))

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`)
})

app.get('/location', (req, res) => {
  res.sendFile(__dirname + '/public/location.html')
})
