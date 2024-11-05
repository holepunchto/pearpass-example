// Design API for pear processes here
/** @typedef {import('pear-interface')} */ /* global Pear */

// Import necessary modules
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Pearwords from './pearwords.js'
import ProtomuxRPC from 'protomux-rpc'
import libKeys from 'hyper-cmd-lib-keys'
import b4a from 'b4a'
import fs from 'fs'
// For pop-ups
import Swal from 'sweetalert2'

// Pear.updates(() => Pear.reload())
Pear.teardown(() => pearwords._close())

// Path to store autobase
const baseDir = Pear.config.storage + '/store'

// Initialise global variables here
let pearwords
let coreStore
let discoveryKey

/// // Function Definitions // ///

async function initCoreStore () {
  coreStore = new Corestore(baseDir)
}

// Create an autobase if one does not exist already
async function createBase () {
  let bootstrapKey = null
  let remoteEncryptionKey = null
  // Don't create the base if already exists
  if (fs.existsSync(baseDir)) {
    initCoreStore()
    pearwords = new Pearwords({ coreStore: coreStore })
    console.log('Base exists')
  } else {
    console.log('Base does not exist, prompt user to create a new one')

    const result = await Swal.fire({
      title: 'No Vault found',
      showDenyButton: true,
      confirmButtonText: 'Create New Vault',
      denyButtonText: 'Load a Vault',
      allowEscapeKey: false,
      backdrop: `
      rgba(33, 33, 38, 1)
        left top
        no-repeat
      `,
      allowOutsideClick: false
    })

    // Logic for creating a new vault
    if (result.isConfirmed) {
      initCoreStore()
      pearwords = new Pearwords({ coreStore: coreStore, encryptionKey: randomBytes() })
      await Swal.fire('New vault created!', '', 'success')
      createTable()
    } else if (result.isDenied) {
      // Load an existing vault
      await initCoreStore()
      const vaultKeyResult = await Swal.fire({
        title: 'Enter Your Vault Key',
        input: 'text',
        backdrop: `
        rgba(33, 33, 38, 1)
          left top
          no-repeat
        `,
        inputAttributes: {
          autocapitalize: 'off'
        },
        showCancelButton: true,
        confirmButtonText: 'Create',
        showLoaderOnConfirm: true,
        inputValidator: async (value) => {
          // Combined key length with secret + discovery key is 128 characters
          if (!value) {
            return 'Key can not be blank!'
          } else if (value.length !== 128) {
            return 'Key is not of proper length'
          }
          // Load a temporary Hyperswarm
          const swarm = new Hyperswarm({
            keyPair: await coreStore.createKeyPair('hyperswarm')
          })

          // Join swarm over discovery key
          const key = Buffer.from(value.slice(-64), 'hex')
          const discovery = swarm.join(key)

          // Create a promise that resolves when a connection is established
          const connectionPromise = new Promise((resolve, reject) => {
            swarm.on('connection', async (connection, peerInfo) => {
              console.log('Joined swarm')
              const rpc = new ProtomuxRPC(connection)
              // Key of the corestore
              const coreKey = await Pearwords.coreKey(coreStore)
              // Secret key from the pairing key
              const secretKey = Buffer.from(value.slice(0, 64), 'hex')
              console.log('Requesting to pair')
              let writerReq = await rpc.request(
                'addMe',
                Buffer.concat([secretKey, coreKey])
              )
              console.log('RPC requested')
              if (writerReq) {
                writerReq = b4a.toString(writerReq, 'hex')
                // Store RPC answer
                bootstrapKey = writerReq.substring(0, 64)
                remoteEncryptionKey = writerReq.substring(64)
                resolve(writerReq) // Resolve the promise with the writer request
              } else {
                reject('Unable to pair') // Reject the promise if verification fails
              }
            })
          })

          // Wait for the connection promise to resolve or reject
          try {
            await connectionPromise
          } catch (error) {
            return error // Return the error if the promise was rejected
          }
        },

        preConfirm: async (vaultKey) => {
          // Initialise Pearwords
          try {
            pearwords = new Pearwords({ coreStore: coreStore, bootstrapKey: bootstrapKey, encryptionKey: remoteEncryptionKey })
          } catch (error) {
            Swal.showValidationMessage(`Error: ${error}`)
          }
        },
        allowOutsideClick: () => !Swal.isLoading()
      })

      if (vaultKeyResult.isConfirmed) {
        await Swal.fire('Loaded an existing vault', '', 'info')
        await createTable()
      } else {
        // An empty store folder is created due to failure, delete it and start over
        fs.rmSync(baseDir, { recursive: true, force: true })
        await createBase()
      }
    }
  }

  // Wait for pearwords to get ready
  await pearwords.ready()
  // Set pairable state to false
  pearwords.pairable = false
  console.log('Ready to use pearwords')
  // Begin replicating to/from
  await pearwords.replicate()
  // Set the Add writer button
  if (pearwords.isWritable() === true) {
    document.querySelector('.add-writer').innerHTML = 'Writable'
  } else {
    document.querySelector('.add-writer').innerHTML = 'Syncing..'
  }
  discoveryKey = b4a.toString(await pearwords.discoveryKey(), 'hex')
  console.log('Replication started')
}

// Push data to the html table
function push (type, data) {
  if (type === 'password') {
    // Get the table by its ID
    const table = document.getElementById('passwordTable')

    // Create a new row and its cells
    const newRow = table.insertRow()
    const usernameCell = newRow.insertCell(0)
    const passwordCell = newRow.insertCell(1)
    const websiteCell = newRow.insertCell(2)

    // Assign the values to the cells
    usernameCell.textContent = data.username
    passwordCell.textContent = data.password
    websiteCell.textContent = data.website
  } else if (type === 'note') {
    // Get the table by its ID
    const table = document.getElementById('notesTable')

    // Create a new row and its cells
    const newRow = table.insertRow()
    const titleCell = newRow.insertCell(0)
    const noteCell = newRow.insertCell(1)

    // Assign the values to the cells
    titleCell.textContent = data.title
    noteCell.textContent = data.note
  }
}

// Clean the table of all records, will be used for re-rendering
function cleanTable () {
  const passwordTable = document.getElementById('passwordTable')
  const notesTable = document.getElementById('notesTable')

  // Remove all rows except the header (first row)
  while (passwordTable.rows.length > 1) {
    passwordTable.deleteRow(1) // Keep deleting the second row until only the header remains
  }

  while (notesTable.rows.length > 1) {
    notesTable.deleteRow(1) // Keep deleting the second row until only the header remains
  }
}

// Show data from the base to frontend
async function createTable () {
  cleanTable()
  for await (const data of pearwords.list()) {
    if (data.value[0] === 'password') {
      push(data.value[0], {
        username: data.value[1],
        password: data.value[2],
        website: data.value[3]
      })
    } else if (data.value[0] === 'note') {
      push(data.value[0], { title: data.value[1], note: data.value[2] })
    }
  }
  console.log('Created table')
}

// Copy data to clipboard
async function copy (data) {
  navigator.clipboard.writeText(data)
}

// Generate Random 32 bytes
function randomBytes () {
  return libKeys.randomBytes(32).toString('hex')
}

/// // Function Implementations /////

// Call this to start base creation
await createBase()

// Create table when base first loads
pearwords.base.on('update', (e) => {
  createTable()
})

// Listen and add new passwords to the list
pearwords.base.view.core.on('append', (e) => {
  createTable()
})

// Check for base writable state
pearwords.base.on('writable', (e) => {
  console.log('I am writable')
  document.querySelector('.add-writer').innerHTML = 'Writable'
  document.querySelector('.add-writer').removeAttribute('disabled')
})

// Create the initial table
await createTable()

// Logic for destroying the base
document.querySelector('.destroy-session').addEventListener('click', (e) => {
  if (
    confirm(
      'You will lose complete access to this vault and your passwords. Continue?'
    )
  ) {
    if (fs.existsSync(baseDir)) {
      fs.rmSync(baseDir, { recursive: true, force: true })
      console.log('Destroying Base')
      createBase()
    } else {
      console.error('Base does not exist')
    }
  } else {
    console.log('Destroy dialogue cancelled')
  }
})

// Add data to the autobase
document.querySelector('.add-data').addEventListener('click', async (e) => {
  // Ask user if the data type if a note or a password
  const { value: dataType } = await Swal.fire({
    title: 'Add new data',
    input: 'select',
    inputOptions: {
      password: 'Password',
      note: 'Note'
    },
    inputPlaceholder: 'Select data type',
    showCancelButton: true,
    inputValidator: (value) => {
      return new Promise((resolve) => {
        if (value === 'password') {
          resolve()
        } else if (value === 'note') {
          resolve()
        } else {
          resolve('You need to select an option :)')
        }
      })
    }
  })
  if (dataType) {
    // Difference between data types here
    if (dataType === 'password') {
      // Create form for password field inputs
      const { value: formValues } = await Swal.fire({
        title: 'New Password',
        html: `
        <label for="swal-username">Username:</label>
        <input id="swal-username" class="swal2-input" placeholder="Username" >

        <label for="swal-password">Password:</label>
        <input id="swal-password" class="swal2-input" placeholder="Password" >

        <label for="swal-website">Website:</label>
        <input id="swal-website" class="swal2-input" placeholder="Website" >

        `,
        focusConfirm: false,
        preConfirm: () => {
          // Return input from these fields
          return [
            'password',
            document.getElementById('swal-username').value,
            document.getElementById('swal-password').value,
            document.getElementById('swal-website').value
          ]
        }
      })
      if (formValues) {
        await pearwords.add(formValues[1], formValues)
        createTable()
      }
    } else {
      // Pop up for adding a Note
      const { value: formValues } = await Swal.fire({
        title: 'New Note',
        html: `
        <input id="swal-noteTitle" class="swal2-input notes" placeholder="Note Title" >
        <input id="swal-note" class="swal2-input notes" placeholder="Note" >

        `,
        focusConfirm: false,
        preConfirm: () => {
          // Return input from these fields
          return [
            'note',
            document.getElementById('swal-noteTitle').value,
            document.getElementById('swal-note').value
          ]
        }
      })
      if (formValues) {
        await pearwords.add(formValues[1], formValues)
        createTable()
      }
    }
  }
})

// Pair button setup
document.getElementById('pair-button').addEventListener('click', async (e) => {
  let timerInterval
  Swal.fire({
    title: 'Pairing is now on',
    html: ' Remaining time <b></b> seconds.<div class="session-link"><p class="pair-discovery-key"> </p> <img src="assets/copy-icon.svg" /> </div> <b> </b>',
    timer: 120000,
    timerProgressBar: true,
    didOpen: async () => {
      Swal.showLoading()
      // Enable pairing
      pearwords.pairable = randomBytes()
      // Copy Pearwords key to the clipboard
      Swal.getPopup()
        .querySelector('.pair-discovery-key')
        .addEventListener('click', async (e) => {
          // Use the Clipboard API
          await copy(pearwords.pairable + discoveryKey)
          alert('Pairing key copied!')
        })

      const discovery = Swal.getPopup().querySelector('.session-link > p')
      discovery.textContent = pearwords.pairable + discoveryKey
      const timer = Swal.getPopup().querySelector('b')
      timerInterval = setInterval(() => {
        timer.textContent = `${Swal.getTimerLeft() / 1000}`
      }, 100)
    },
    willClose: () => {
      // Pairing Session Ended by Closing Pop up
      pearwords.pairable = false
      clearInterval(timerInterval)
      console.log('Pairing session ended by user')
    }
  }).then((result) => {
    // Pairing closed by timer
    if (result.dismiss === Swal.DismissReason.timer) {
      pearwords.pairable = false
      console.log('Pairing session ended by Timer')
    }
  })
})
