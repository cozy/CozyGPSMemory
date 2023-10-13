#!/bin/bash

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <userID> <date> [server_url]"
  exit 1
fi

# Assign arguments to variables
USERID="$1"
DATE="$2"

# If server_url is provided use that, otherwise default to http://localhost:8080
SERVER_URL=${3:-http://localhost:8080}

# Make the curl request
RESPONSE=$(curl -s -X POST -H 'Content-Type: application/json' "$SERVER_URL/timeline/getTrips/$DATE" --data "{ \"user\": \"$USERID\" }")

# Write the result to the specified file
echo "$RESPONSE" > tools/trip-viz/public/geojson.json

# Notify user of completion
echo "Data written to tools/trip-viz/public/geojson.json"
