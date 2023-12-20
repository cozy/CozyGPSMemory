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


cmd="curl -s -X POST -H 'Content-Type: application/json' $SERVER_URL/timeline/getTrips/$DATE --data '{ \"user\": \"$USERID\" }'"
echo $cmd
# Make the curl request
response=$(curl -s -X POST -H 'Content-Type: application/json' "$SERVER_URL/timeline/getTrips/$DATE" --data "{ \"user\": \"$USERID\" }")

# Check for no response
if [ -z "$response" ]; then
    echo "Error: No response from server"
    exit 1
fi

# Check for empty data
if [ "$response" = '{"timeline": []}' ]; then
    echo "No data available on this day, for this user"
    exit 0
fi

# Write the result to the specified file
echo "$response" > tools/trip-viz/public/geojson.json
echo "Found trip, data written to tools/trip-viz/public/geojson.json"
