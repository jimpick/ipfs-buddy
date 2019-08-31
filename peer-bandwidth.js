#!/usr/bin/env node

const ipfsClient = require('ipfs-http-client')

// curl "http://localhost:5001/api/v0/log/tail"


let cidDhtLookups = {}

async function run () {
  console.log('Starting...')
  const ipfs = ipfsClient()
  const buddyIdentity = await ipfs.id()
  const buddyId = buddyIdentity.id
  console.log('Id:', buddyId)

  const peerInfos = await ipfs.swarm.peers({ verbose: true })
  for (const peerInfo of peerInfos) {
    // console.log(peerInfo)
    const { addr, peer, muxer, latency, streams } = peerInfo
    const protos = new Set()
    if (streams) {
      for (const { Protocol: proto } of streams) {
        protos.add(proto.replace(/\/ipfs\//, '').replace(/\/.*$/, ''))
      }
    }
    // console.log('Jim', protos)
    console.log(
      `${peer.toB58String()} ` +
      `${addr} ` +
      `${latency !== 'n/a' ? latency + ' ' : ''}` +
      `${[...protos].sort().join(' ')}`
    )
  }
}

run()
