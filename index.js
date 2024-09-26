// the js module powering the mobile and desktop app

const Autobase = require('autobase')
const Hyperbee = require('hyperbee')

class Pearwords {
  constructor (corestore, key) {
    this.base = new Autobase(corestore, key, {
      valueEncoding: 'json',
      open (store) {
        return new Hyperbee(store.get('view'), { extension: false, keyEncoding: 'utf-8', valueEncoding: 'json' })
      },
      async apply (nodes, view) {
        for (const node of nodes) {
          const op = node.value
          if (op.value) await view.put(op.key, op.value)
          else await view.del(op.key)
        }
      }
    })
  }

  list (opts) {
    return this.base.view.createReadStream(opts)
  }

  async get (key) {
    const node = await this.base.view.get(key)
    if (node === null) return null
    return node.value
  }

  async add (key, value) {
    await this.base.append({
      key,
      value
    })
  }

  async remove (key) {
    await this.base.append({
      key,
      value: null
    })
  }
}

module.exports = Pearwords
