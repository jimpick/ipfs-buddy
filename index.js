#!/usr/bin/env node

const { promisify } = require('util')
const PeerId = require('peer-id')
const PeerBase = require('peer-base')
const ipfsClient = require('ipfs-http-client')
const kadUtil = require('libp2p-kad-dht/src/utils')
const tree = require('flat-tree')
const bitSequence = require('bit-sequence')

const convertPeerId = promisify(kadUtil.convertPeerId)

const depth = 3
const epoch = '2019-08-26'

function getDhtId (peerId) {
  return new Promise(resolve => convertPeerId(peerId, resolve))
}

async function run () {
  const app = PeerBase('ipfs-buddy')
  console.log('Starting...')
  const ipfs = ipfsClient()
  const buddyIdentity = await ipfs.id()
  const buddyId = buddyIdentity.id
  const buddyPeerId = PeerId.createFromB58String(buddyId)
  console.log('Buddy Peer ID:', buddyId)
  const buddyDhtId = await convertPeerId(buddyPeerId)
  console.log('Buddy DHT ID:', buddyDhtId)
  await app.start()
  console.log('Top - depth 3, offset 0:', tree.index(3, 0))
  console.log('Leaf - prefix:', bitSequence(buddyDhtId, 0, 3))
  const leafCollabIndex = bitSequence(buddyDhtId, 0, 3) * 2
  console.log('leafCollabIndex:', leafCollabIndex)
  console.log(' parent:', tree.parent(leafCollabIndex))
  console.log(' grandparent:', tree.parent(tree.parent(leafCollabIndex)))
  console.log(' great grandparent:', tree.parent(
    tree.parent(tree.parent(leafCollabIndex))
  ))
  const collabName = `ipfs-buddy_${epoch}_${leafCollabIndex}`
  console.log('collabName:', collabName)
  const collaboration = await app.collaborate(collabName, 'rga')
}

run()
