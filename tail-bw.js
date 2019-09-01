#!/usr/bin/env node
const http = require('http')
const { produce } = require('immer')
const multihash = require('multihashes')
const ipfsClient = require('ipfs-http-client')
const nanobus = require('nanobus')
const throttle = require('lodash.throttle')

// curl "http://localhost:5001/api/v0/log/tail"


let cidDhtLookups = {}

async function run () {
  console.log('Starting...')
  const bus = nanobus()
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
    res.on('data', (chunk) => {
      try {
        const event = JSON.parse(chunk)
        const { system, event: evt, peer, proto, size } = event
        if (system === 'jimnet' && proto.match(/bitswap/) &&
           size > 100) {
          console.log(evt, peer, proto, size)
        }
        /*
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
            if (sortedKeyCounts.length > max) sortedKeyCounts.length = max
            bus.emit('render', sortedKeyCounts)
          }
          cidDhtLookups = draft
        }
        */
      } catch (e) {
        console.error('Err', e.message)
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
