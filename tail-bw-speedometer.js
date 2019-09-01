#!/usr/bin/env node
const http = require('http')
const { produce } = require('immer')
const multihash = require('multihashes')
const ipfsClient = require('ipfs-http-client')
const nanobus = require('nanobus')
// const throttle = require('lodash.throttle')
const speedometer = require('speedometer')

const speedometers = {}

async function run () {
  console.log('Starting...')
  const bus = nanobus()
  const ipfs = ipfsClient()
  const buddyIdentity = await ipfs.id()
  const buddyId = buddyIdentity.id
  console.log('Id:', buddyId)

  async function render () {
    console.log('\u001b[2J\u001b[0;0H')
    const lines = []
    const now = Date.now()
    for (const key of Object.keys(speedometers)) {
      if (speedometers[key].last + 20000 < now) {
        delete speedometers[key]
      } else {
        lines.push(
          `${key} ` +
          `in ${speedometers[key].inMeter().toFixed(2)} ` +
          `out ${speedometers[key].outMeter().toFixed(2)}`
        )
      }
    }
    lines.length = process.stdout.rows - 4
    console.log(lines.join('\n'))
  }

  // const throttledRender = throttle(render, 1000)

  setInterval(render, 1000)

  // bus.on('render', throttledRender)

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
          // console.log(evt, peer, proto, size)
          if (!speedometers[peer]) {
            speedometers[peer] = {
              inMeter: speedometer(),
              outMeter: speedometer(),
              created: Date.now()
            }
          }
          if (evt === 'in')  speedometers[peer].inMeter(size)
          if (evt === 'out')  speedometers[peer].outMeter(size)
          speedometers[peer].last = Date.now()
          // bus.emit('render')
        }
      } catch (e) {
        // console.error('Err', e.message)
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
