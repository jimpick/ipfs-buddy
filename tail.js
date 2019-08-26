#!/usr/bin/env node

const http = require('http')
const { produce } = require('immer')

// curl "http://localhost:5001/api/v0/log/tail"

const ipfsClient = require('ipfs-http-client')

let cidDhtLookups = {}

async function run () {
  console.log('Starting...')
  const ipfs = ipfsClient()
  const buddyIdentity = await ipfs.id()
  const buddyId = buddyIdentity.id
  console.log('Id:', buddyId)

  const options = {
    hostname: 'localhost',
    port: 5001,
    path: '/api/v0/log/tail',
    method: 'GET'
  }

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    let lastDisplay = []
    res.on('data', (chunk) => {
      try {
        const event = JSON.parse(chunk)
        // console.log(event)
        if (
          event.event === 'dhtSentMessage' &&
          event.message.type === 'FIND_NODE'
        ) {
          const draft = produce(cidDhtLookups, draftState => {
            if (!draftState[event.message.key]) {
              draftState[event.message.key] = {}
            }
            draftState[event.message.key][event.peerID] = 1
          })
          if (draft !== cidDhtLookups) {
            const keyCounts = []
            for (const key of Object.keys(draft)) {
              keyCounts.push([key, Object.keys(draft[key]).length])
            }
            let sortedKeyCounts = keyCounts.sort(([a1, a2], [b1, b2]) => {
              const cmp = b2 - a2
              if (cmp !== 0) return cmp
              return a1.localeCompare(b2)
            })
            const max = 40
            if (sortedKeyCounts.length > max) sortedKeyCounts = max
            const draftDisplay = produce(lastDisplay, draftState => {
              draftState.length = 0
              sortedKeyCounts.forEach(val => draftState.push(val))
            })
            if (draftDisplay !== lastDisplay) {
              for (const [key, count] of draftDisplay) {
                console.log(key, count)
              }
              console.log('')
            }
            lastDisplay = draftDisplay
          }
          cidDhtLookups = draft
        }
      } catch (e) {
        console.error('Err', e)
        // Ignore
      }
      // console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
      console.log('No more data in response.');
    });
  });

  req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });

  // Write data to request body
  req.end()
  /*
  ipfs.log.tail((err, output) => {
    if (err) {
      console.error('Err:', err)
      process.exit(1)
    }
    console.log('Jim', output)
    output.pipe(process.stdout)
  })
  */
}

run()
