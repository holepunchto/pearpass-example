import Corestore from 'corestore'
import Pearwords from './index.js'

const pw = new Pearwords(new Corestore('/tmp/store'))

await pw.add('google.com', 'my-passwd')

for await (const data of pw.list()) {
  console.log(data)
}
