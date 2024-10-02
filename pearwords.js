// the js module powering the mobile and desktop app

import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'

class Pearwords {
  constructor (corestore, key) {
    this.corestore = corestore
    // Initialise the base
    this.base = new Autobase(corestore, key, {
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

    // Create new Hyperswarm to replicate
    this.swarm = null
  }

  // Check if base is ready
  async ready () {
    return this.base.ready()
  }

  // Close the base
  async close () {
    if (this.swarm) {
      await this.swarm.destroy()
    }
    await this.base.close()
  }

  // Need this key to become a writer
  writerKey () {
    return this.base.local.key
  }

  // Return bootstrap key of the base
  // This is what other peers should use to bootstrap the base from
  bootstrapKey () {
    return this.base.key
  }

  // This is used for hyperswarm join and discovery
  // Needed to replicate base across peers
  discoveryKey () {
    return this.base.discoveryKey
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
    try {
      await this.base.append({
        type: 'addWriter',
        key: b4a.isBuffer(key) ? b4a.toString(key, 'hex') : key
      })
    } catch (error) {
      throw error
    }

    return true
  }

  // To later add removeWriter
  async removeWriter (key) {}

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

// module.exports = Pearwords;
export default Pearwords
