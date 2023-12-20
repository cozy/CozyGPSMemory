// const yargs = require('yargs');
import { program } from 'commander'

import {
  makeStartTransitions,
  makeStopTransitions,
  uploadToUsercache
} from '../tracking.js'

program
  .requiredOption(
    '-d, --date <type>',
    'Date in the format "YYYY-MM-DDTHH:MM:SS"'
  )
  .requiredOption('-t, --type <type>', 'Type of transition ("start" or "end")')
  .option('-s, --serverUrl <type>', 'Server URL', 'http://localhost:8080')
  .requiredOption('-u, --userID <type>', 'User ID')
  .option('--force-stop', 'Boolean to force stop', false)

program.parse(process.argv)
const options = program.opts()

const timestamp = new Date(options.date).getTime() / 1000
let transitions

if (options.type === 'start') {
  transitions = makeStartTransitions(timestamp)
} else if (options.type === 'end') {
  transitions = makeStopTransitions(timestamp, options['force-stop'])
} else {
  console.error('Invalid type specified. Must be "start" or "end".')
  process.exit(1)
}

await uploadToUsercache(options.serverUrl, options.userID, transitions)
