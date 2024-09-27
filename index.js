// the js module powering the mobile and desktop app

const Autobase = require('autobase')
const Hyperbee = require('hyperbee')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')

class Pearwords {
  constructor (corestore, key) {
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
            continue
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
    this.swarm = new Hyperswarm()
  }

  // Check if base is ready
  ready () {
    return this.base.ready()
  }

  // Close the base
  close () {
    return this.base.close()
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
    await this.base.append({
      type: 'addWriter',
      key: b4a.isBuffer(key) ? b4a.toString(key, 'hex') : key
    })
  }

  // Check if the base is writable
  isWritable () {
    return this.base.writable
  }

  // Start Replicating the base across peers
  async replicate (key) {
    let swarmTopic
    if (key) {
      swarmTopic = b4a.isBuffer(key) ? b4a.toString(key, 'hex') : key
    } else {
      swarmTopic = this.discoveryKey()
    }

    // Join over a common topic
    const discovery = this.swarm.join(this.discoveryKey())
    // Waits for the topic to be fully announced on the DHT
    await discovery.flushed()
    // Listen for connections
    this.swarm.on('connection', (connection, peerInfo) => {
      console.log('\rPeer joined: ', b4a.toString(peerInfo.publicKey, 'hex'))
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

module.exports = Pearwords
