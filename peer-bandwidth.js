#!/usr/bin/env node

const ipfsClient = require('ipfs-http-client')
const delay = require('delay')

// curl "http://localhost:5001/api/v0/log/tail"


let cidDhtLookups = {}

async function run () {
  console.log('Starting...')
  const ipfs = ipfsClient()
  const buddyIdentity = await ipfs.id()
  const buddyId = buddyIdentity.id
  console.log('Id:', buddyId)

  let lineTimes = {}

  while (true) {
    const peerInfos = await ipfs.swarm.peers({ verbose: true })
    const lines = []
    for (const peerInfo of peerInfos) {
      const { addr, peer, muxer, latency, streams } = peerInfo
      const protos = new Set()
      if (streams) {
        for (const { Protocol: proto } of streams) {
          const shortProto = proto.replace(/\/ipfs\//, '').replace(/\/.*$/, '')
          if (shortProto !== '') protos.add(shortProto)
        }
      }
      lines.push(
        `${peer.toB58String()} ` +
        `${addr} ` +
        `${latency !== 'n/a' && latency !== '' ? latency + ' ' : ''}` +
        `${[...protos].sort().join(' ')}`
      )
    }
    const now = Date.now()
    const newLineTimes = {}
    for (const line of lines) {
      if (lineTimes[line]) {
        newLineTimes[line] = lineTimes[line]
      } else {
        newLineTimes[line] = now
      }
    }
    lineTimes = newLineTimes
    const sortedLines = Object.entries(lineTimes).sort(
      ([line1, time1], [line2, time2]) => {
        const timeSort = time2 - time1
        if (timeSort !== 0) return timeSort
        return line1.localeCompare(line2)
      }
    ).map(([line, time]) => time + ' ' + line)
    const bitswapLines = sortedLines.filter(line => line.match(/bitswap/))
    const annotatedBitswapLines = []
    for (const line of bitswapLines) {
      annotatedBitswapLines.push(line)
      const [_, peerId] = line.split(' ')
      const stats = await ipfs.stats.bw({ peer: peerId })
      // annotatedBitswapLines.push(`${peerId} ${JSON.stringify(stats)}`)
      annotatedBitswapLines.push(
        '  ' +
        `In ${stats.totalIn} ` +
        `Out ${stats.totalOut} ` +
        `RateIn ${stats.rateIn.toFixed(2)} ` +
        `RateOut ${stats.rateOut.toFixed(2)} `
      )
    }
    const prioritizedLines =
      annotatedBitswapLines
      .concat([''])
      .concat(
        sortedLines.filter(line => !line.match(/bitswap/))
      )

    console.log('\u001b[2J\u001b[0;0H')
    prioritizedLines.length = process.stdout.rows - 3
    console.log(prioritizedLines.join('\n'))
    await delay(1000)
  }
}

run()
