#!/usr/bin/env node

const http = require('http')
const HashMap = require('@ipld/hashmap')
const IPFS = require('ipfs')
const CID = require('cids')

async function run () {
  console.log('Starting...')

  const jsIpfs = await IPFS.create({
    config: {
      Addresses: {
        Swarm: [
          '/dns4/rendezvous.jimpick.com/tcp/9093/wss/p2p-websocket-star'
        ]
      }
    },
    EXPERIMENTAL: {
      pubsub: true
    }
  })

  const loader = {
    get: async function (cid) {
      const result = await jsIpfs.block.get(cid)
      return result.data
    },
    put: async function (cid, block) {
      const result = await jsIpfs.block.put(block, { cid })
    }
  }

  jsIpfs.pubsub.subscribe('ipfs-buddy-tail', async msg => {
    const cidString = msg.data.toString()
    console.log('ipldKeyCounts CID:', cidString)
    const cid = new CID(cidString)
    const ipldKeyCounts = await HashMap.create(loader, cid)
    const entries = await ipldKeyCounts.entries()
    const keyCounts = []
    for await (const entry of entries) {
      keyCounts.push(entry)
    }
    let sortedKeyCounts = keyCounts.sort(([a1, a2], [b1, b2]) => {
      const cmp = b2 - a2
      if (cmp !== 0) return cmp
      return a1.localeCompare(b2)
    })
    const max = 40
    if (sortedKeyCounts.length > max) sortedKeyCounts.length = max
    for (const [key, count] of sortedKeyCounts) {
      console.log(key, count)
    }
    console.log('')
  })

}

run()
