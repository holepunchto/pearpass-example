// the js module powering the mobile and desktop app

import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import Hyperswarm from 'hyperswarm'
import ReadyResource from 'ready-resource'
import ProtomuxRPC from 'protomux-rpc'
import { encode, decode, normalize } from 'hypercore-id-encoding'
import b4a from 'b4a'

class Pearwords extends ReadyResource {
  constructor (opts) {
    super()
    this.corestore = opts.corestore
    this.swarm = null
    this.rpc = null
    this.pairable = false
    let encryptionKey
    if (opts.encryptionKey) {
      encryptionKey = decode(opts.encryptionKey)
    }
    // Initialise the base
    this.base = new Autobase(opts.corestore, opts.bootstrapKey, {
      encryptionKey,
      valueEncoding: 'json',
      open (store) {
        return new Hyperbee(store.get('view'), {
          extension: false,
          keyEncoding: 'utf-8',
          valueEncoding: 'json'
        })
      },
      // New data blocks will be added using the apply function
      async apply (nodes, view, base) {
        for (const node of nodes) {
          const op = node.value
          // Add support for adding other peers as a writer to the base
          if (op.type === 'addWriter') {
            await base.addWriter(b4a.from(op.key, 'hex'))
          } else if (op.type === 'removeWriter') {
            await base.removeWriter(b4a.from(op.key, 'hex'))
          } else if (op.type === 'addRecord') {
            // This adds a new record
            await view.put(op.key, op.value)
          } else if (op.type === 'removeRecord') {
            // Remove an existing record
            await view.del(op.key)
          }
        }
      }
    })
  }

  // Check if base is ready
  async ready () {
    return this.base.ready()
  }

  // Close the base
  async _close () {
    if (this.swarm) {
      await this.swarm.destroy()
    }
    await this.base.close()
  }

  // Need this key to become a writer
  writerKey () {
    return this.base.local.key
  }

  // A static method to return the key of the local corestore
  static async coreKey (store) {
    const core = Autobase.getLocalCore(store)
    await core.ready()
    const key = core.key
    await core.close()
    return key
  }

  // Return bootstrap key of the base
  // This is what other peers should use to bootstrap the base from
  bootstrapKey () {
    return this.base.key
  }

  // Find peers in Hyperswarm using this
  discoveryKey () {
    return this.base.discoveryKey
  }

  // Encryption key for the base
  encryptionKey () {
    return this.base.encryptionKey
  }

  // Get data of all indexes in the base
  list (opts) {
    return this.base.view.createReadStream(opts)
  }

  // Get data stored in a specific key
  async get (key) {
    const node = await this.base.view.get(key)
    if (node === null) return null
    return node.value
  }

  // Add a peer as a writer
  async addWriter (key) {
    await this.base.append({
      type: 'addWriter',
      key: b4a.isBuffer(key) ? b4a.toString(key, 'hex') : key
    })

    return true
  }

  // To later add removeWriter
  async removeWriter (key) {
    await this.base.append({
      type: 'removeWriter',
      key: b4a.isBuffer(key) ? b4a.toString(key, 'hex') : key
    })
  }

  // Check if the base is writable
  isWritable () {
    return this.base.writable
  }

  // Start Replicating the base across peers
  async replicate () {
    await this.ready()
    this.swarm = new Hyperswarm({
      keyPair: await this.corestore.createKeyPair('hyperswarm')
    })
    // Join swarm over discovery key
    const discovery = this.swarm.join(this.discoveryKey())

    // Listen for connections
    this.swarm.on('connection', (connection, peerInfo) => {
      // Replicate the base
      this.base.replicate(connection)
      // Setup a RPC on this connection
      this.rpc = new ProtomuxRPC(connection)

      // Handle pairing
      this.rpc.respond('add-me', async (req) => {
        // First 64 characters are randomly generated secret key, set in this.pairable
        // Latter 64 characters are coreKey of the remote base that we need to add as a writer
        const pairingSecret = b4a.toString(req, 'hex').slice(0, 64)
        const remoteKey = b4a.toString(req, 'hex').slice(-64)
        // Go for verification only if pairing is enabled
        if (this.pairable !== false && this.pairable === pairingSecret) {
          await this.addWriter(remoteKey)
          const data = b4a.toString(this.bootstrapKey(), 'hex') + b4a.toString(this.encryptionKey(), 'hex')
          return Buffer.from(data, 'hex')
        }
      })
    })
  }

  // Append a key/value to the base
  async add (key, value) {
    await this.base.append({
      type: 'addRecord',
      key,
      value
    })
  }

  // Remove a key pair
  async remove (key) {
    await this.base.append({
      type: 'removeRecord',
      key,
      value: null
    })
  }
}

export default Pearwords
