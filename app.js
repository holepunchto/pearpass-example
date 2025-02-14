// Design API for pear processes here
/** @typedef {import('pear-interface')} */ /* global Pear */

// Import necessary modules
import Corestore from 'corestore'
import Autopass from 'autopass'
import fs from 'fs'
import Swal from 'sweetalert2'

const { teardown } = Pear

// Path to store autobase
const baseDir = Pear.config.storage + '/store'
const inviteFile = Pear.config.storage + '/.invite'
let autopass

// Create an autobase if one does not exist already
async function createBase () {
  // Don't create the base if already exists
  if (fs.existsSync(inviteFile)) {
    autopass = new Autopass(new Corestore(baseDir))
    await autopass.ready()
  } else {
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
      autopass = new Autopass(new Corestore(baseDir))
      await autopass.ready()
      await Swal.fire('New vault created!', '', 'success')
      fs.writeFileSync(inviteFile, 'w')
      await cleanTable()
    } else if (result.isDenied) {
      // Load an existing vault
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
        inputValidator: async (invite) => {
          // Combined key length with secret + discovery key is 128 characters
          if (!invite) {
            return 'Key can not be blank!'
          } else if (invite.length !== 106) {
            return 'Key is not of proper length'
          }
        },

        preConfirm: async (invite) => {
          try {
            const pair = Autopass.pair(new Corestore(baseDir), invite)
            autopass = await pair.finished()
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
  await autopass.ready()

  // Set the Add writer button
  if (autopass.writable === true) {
    document.querySelector('.add-writer').innerHTML = 'Writable'
  } else {
    document.querySelector('.add-writer').innerHTML = 'Syncing..'
  }
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
async function cleanTable () {
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
  await cleanTable()
  for await (const data of autopass.list()) {
    const value = JSON.parse(data.value)
    if (value[0] === 'password') {
      push(value[0], {
        username: value[1],
        password: value[2],
        website: value[3]
      })
    } else if (value[0] === 'note') {
      push(value[0], { title: value[1], note: value[2] })
    }
  }
}

// Copy data to clipboard
async function copy (data) {
  navigator.clipboard.writeText(data)
}

// Call this to start base creation
await createBase()
teardown(() => autopass.close())

// Create table when base updates
autopass.on('update', async (e) => {
  await createTable()
})

// Check for base writable state
autopass.on('writable', (e) => {
  document.querySelector('.add-writer').innerHTML = 'Writable'
  document.querySelector('.add-writer').removeAttribute('disabled')
})

// Create the initial table
await createTable()

// Logic for destroying the base
document.querySelector('.destroy-session').addEventListener('click', async (e) => {
  if (
    confirm(
      'You will lose complete access to this vault and your passwords. Continue?'
    )
  ) {
    if (fs.existsSync(baseDir)) {
      await autopass.close()
      fs.rmSync(baseDir, { recursive: true, force: true })
      fs.rmSync(inviteFile)
      Pear.reload()
    }
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
        await autopass.add(formValues[1], JSON.stringify(formValues))
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
        await autopass.add(formValues[1], JSON.stringify(formValues))
      }
    }
  }
})

// Pair button setup
document.getElementById('pair-button').addEventListener('click', async (e) => {
  Swal.fire({
    title: 'Pairing is active',
    html: '<div class="session-link"><p class="pair-discovery-key"> </p> <img src="assets/copy-icon.svg" /> </div> <b> </b>',
    didOpen: async () => {
      Swal.showLoading()
      Swal.getPopup()
        .querySelector('.pair-discovery-key')
        .addEventListener('click', async (e) => {
          // Use the Clipboard API
          const inv = await autopass.createInvite()
          await copy(inv)
          alert('Pairing key copied!')
        })

      const discovery = Swal.getPopup().querySelector('.session-link > p')
      discovery.textContent = await autopass.createInvite()
    }
  })
})
