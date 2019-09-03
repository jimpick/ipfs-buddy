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

  const sessions = {}
  const keysToSessions = {}
  let errors = []

  async function render () {
    console.log('\u001b[2J\u001b[0;0H')
    const lines = []
    const now = Date.now()
    const watchSessions = []
    for (const uuid of Object.keys(sessions)) {
      watchSessions.push([sessions[uuid].id, uuid])
    }
    const sortedWatchSessions = watchSessions.sort(([id1], [id2]) => id2 - id1)
    for (const [id, uuid] of sortedWatchSessions) {
      const session = sessions[uuid]
      const { keys, firstKey, peers } = session
      const blockCount = session.keys.size
      const receivedBlockCount = session.receivedKeys.size
      lines.push(
        `Session: ${id} ${uuid} ` +
        `Blocks: ${receivedBlockCount} of ${blockCount} ` +
        firstKey
      )
      if (session.dhtSearches) {
        dhtLines = []
        const searches = session.dhtSearches
        const keyStarts = Object.keys(searches)
          .map(key => [key, searches[key].started])
          .sort(([key1, started1], [key2, started2]) => {
            const timeDiff = started2 - started1
            if (timeDiff !== 0) return timeDiff
            return key1.localeCompare(key2)
          })
        for (const [key, time] of keyStarts) {
          const search = searches[key]
          if (search.started + 45000 < now) continue
          const end = search.finished || Date.now()
          const dots = Math.floor(Math.min(end - search.started, 40000) / 1000)
          let report = ''
          if (search.finished) {
            const seconds = ((search.finished - search.started) / 1000).toFixed(1)
            report = `${seconds}s`
          }
          dhtLines.push(
            `  DHT: ${key} ${search.started} ${time}` + '.'.repeat(dots) + ' ' + report
          )
        }
        if (dhtLines.length > 15) dhtLines.length = 15
        for (const line of dhtLines) {
          lines.push(line)
        }
      }
      for (const peerId of Object.keys(peers)) {
        const peer = peers[peerId]
        const duplicates = peer.duplicateKeys.size
        const received = peer.receivedKeys.size - duplicates
        let state = ''
        if (received > 0 || !peer.dhtError) {
          state = `Blocks: ${received}` +
          (duplicates ? ` + ${duplicates} duplicates` : '')
        } else {
          state = 'Connection error'
        }
        lines.push(
          `    ${peerId} ` +
          (peer.dht ? 'DHT ' : '--- ') +
          state
        )
      }
    }
    errors.length = 0
    lines.length = Math.max(process.stdout.rows - 4 - errors.length, 10)
    for (const line of errors) {
      lines.push(line)
    }
    console.log(lines.join('\n'))
  }

  setInterval(render, 1000)


  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      try {
        const event = JSON.parse(chunk)
        const { system } = event
        if (system === 'jimbssess') {
          // console.log(event)
          const {
            event: evt,
            sessionId,
            sessionUuid: {
              GetBlockRequest: sessionUuid
            },
            keys: keysJson
          } = event
          keys = []
          try {
            const parsedKeys = JSON.parse(keysJson)
            for (const keyObj of parsedKeys) {
              if (keyObj['/']) {
                keys.push(keyObj['/'])
              }
            }
          } catch (e) {
            // Ignore
            // console.error('Err', e.message)
            errors.push('E1: ' + e.message)
          }
          if (!sessions[sessionUuid]) {
            sessions[sessionUuid] = {
              id: sessionId,
              added: Date.now(),
              firstKey: keys[0],
              keys: new Set(),
              receivedKeys: new Set(),
              peers: {}
            }
          }
          const session = sessions[sessionUuid]
          for (const key of keys) {
            session.keys.add(key)
            if (!keysToSessions[key]) {
              keysToSessions[key] = new Set()
            }
            keysToSessions[key].add(session)
          }
          if (evt === 'receivefrom') {
            const { peer } = event
            if (!session.peers[peer]) {
              session.peers[peer] = {
                receivedKeys: new Set(),
                duplicateKeys: new Set()
              }
            }
            const sessionPeer = session.peers[peer]
            for (const key of keys) {
              sessionPeer.receivedKeys.add(key)
              if (session.receivedKeys.has(key)) {
                sessionPeer.duplicateKeys.add(key)
              }
              session.receivedKeys.add(key)
            }
          }
        }
        if (system === 'bitswap') {
          const { event: evt } = event
          if (evt === 'jimprovfind') {
            const {
              key: {
                "/": key
              }
            } = event
            const sessions = keysToSessions[key]
            if (sessions) {
              const search = {
                started: Date.now()
              }
              for (const session of sessions) {
                if (!session.dhtSearches) {
                  session.dhtSearches = {}
                }
                session.dhtSearches[key] = search
              }
            }
          }
          if (evt === 'jimprovfound') {
            const {
              key: {
                "/": key
              },
              provider: peer
            } = event
            const sessions = keysToSessions[key]
            if (sessions) {
              for (const session of sessions) {
                if (!session.peers[peer]) {
                  session.peers[peer] = {
                    receivedKeys: new Set(),
                    duplicateKeys: new Set()
                  }
                }
                session.peers[peer].dht = true
                session.peers[peer].dhtError = false
              }
            }
          }
          if (evt === 'jimprovconnerror') {
            const {
              key: {
                "/": key
              },
              provider: peer
            } = event
            const sessions = keysToSessions[key]
            if (sessions) {
              for (const session of sessions) {
                if (session.peers[peer]) {
                  session.peers[peer].dhtError = true
                }
              }
            }
          }
        }
        if (system === 'bitswap_network') {
          const { event: evt } = event
          if (evt === 'jimprovfinish') {
            const {
              key: {
                "/": key
              }
            } = event
            const sessions = keysToSessions[key]
            if (sessions) {
              for (const session of sessions) {
                if (!session.dhtSearches) {
                  session.dhtSearches = {}
                }
                if (session.dhtSearches[key]) {
                  session.dhtSearches[key].finished = Date.now()
                  break
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore
        // console.error('Err', e.message)
        errors.push('E2: ' + e.message)
      }
    });
    res.on('end', () => {
      console.log('No more data in response.');
      process.exit()
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
