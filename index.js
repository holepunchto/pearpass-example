// the js module powering the mobile and desktop app

const Autobase = require('autobase')
const Hyperbee = require('hyperbee')
const b4a = require('b4a')

class Pearwords {
  constructor (corestore, key) {
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
            // This is necessary for adding or removing data from the base
          } else if (op.value) await view.put(op.key, op.value)
          else await view.del(op.key)
        }
      }
    })
  }

  // Need this key to become a writer
  writableKey () {
    return this.base.local.key
  }

  // Add a peer as a writer
  async addWriter (key) {
    await this.base.append({
      type: 'addWriter',
      key
    })
  }

  // Return bootstrap key of the base
  // This is what other peers should use to bootstrap the base
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

  // Append a key/value to the base
  async add (key, value) {
    await this.base.append({
      key,
      value
    })
  }

  // Remove a key pair
  async remove (key) {
    await this.base.append({
      key,
      value: null
    })
  }
}

module.exports = Pearwords
