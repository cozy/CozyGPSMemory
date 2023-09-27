const express = require('express')
const app = express()
const PORT = 3000

// Servir les fichiers statiques du dossier 'public'
app.use(express.static('tools/trip-viz/public'))

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`)
})