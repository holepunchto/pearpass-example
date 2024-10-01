// Design API for pear processes here
/** @typedef {import('pear-interface')} */ /* global Pear */

// This live reloads the app during development
// Import necessary modules
import Corestore from 'corestore'
import Pearwords from './pearwords.js'
import b4a from 'b4a'
import fs from 'fs'
// For pop-ups
import Swal from 'sweetalert2'
Pear.updates(() => Pear.reload())
Pear.teardown(() => pearwords.close())

// Path to store autobase
const baseDir = Pear.config.storage + '/store'
console.log(baseDir)
// Initialise global variables here
let pearwords

/// // Function Definitions /////

// Create an autobase if one does not exist already
async function createBase () {
  // Don't create the base if already exists
  if (fs.existsSync(baseDir)) {
    pearwords = new Pearwords(new Corestore(baseDir))
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

    if (result.isConfirmed) {
      // Logic for creating a new vault
      pearwords = new Pearwords(new Corestore(baseDir))
      await Swal.fire('New vault created!', '', 'success')
      createTable()
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
        inputValidator: (value) => {
          if (!value) {
            return 'Key can not be blank!'
          }
        },
        preConfirm: async (vaultKey) => {
          try {
            pearwords = new Pearwords(new Corestore(baseDir), vaultKey)
          } catch (error) {
            Swal.showValidationMessage(`Error: ${error}`)
          }
        },
        allowOutsideClick: () => !Swal.isLoading()
      })

      if (vaultKeyResult.isConfirmed) {
        await Swal.fire('Loaded an existing vault', '', 'info')
        createTable()
      } else {
        // An empty store folder is created due to failure, delete it and start over
        fs.rmSync(baseDir, { recursive: true, force: true })
        await createBase()
      }
    }
  }

  await pearwords.ready()
  console.log('Ready to use pearwords')

  // Add bootstrap key
  setKey()
  // Set the Add writer button
  if (pearwords.isWritable() === true) {
    document.querySelector('.add-writer').innerHTML = 'Add a Writer'
    document.querySelector('.add-writer').removeAttribute('disabled')
  } else {
    document.querySelector('.add-writer').innerHTML = 'Copy Writer Key'
    document.querySelector('.add-writer').setAttribute('disabled', '')
  }
  await pearwords.replicate()
  console.log('Replication started')
}

function setKey () {
  document.querySelector('.session-link > p').innerHTML = b4a.toString(
    pearwords.bootstrapKey(),
    'hex'
  )
}

// Push data to the html table
function push (username, password, website) {
  // Get the table by its ID
  const table = document.getElementById('passwordTable')

  // Create a new row and its cells
  const newRow = table.insertRow()
  const usernameCell = newRow.insertCell(0)
  const passwordCell = newRow.insertCell(1)
  const websiteCell = newRow.insertCell(2)

  // Assign the values to the cells
  usernameCell.textContent = username
  passwordCell.textContent = password
  websiteCell.textContent = website
}

// Clean the table of all records, will be used for re-rendering
function cleanTable () {
  const table = document.getElementById('passwordTable')

  // Remove all rows except the header (first row)
  while (table.rows.length > 1) {
    table.deleteRow(1) // Keep deleting the second row until only the header remains
  }
}

// Show data from the base to frontend
async function createTable () {
  cleanTable()
  for await (const data of pearwords.list()) {
    push(data.value[0], data.value[1], data.value[2])
  }
}

async function copy (data) {
  navigator.clipboard.writeText(data)
}

/// // Function Implementations /////

// Call this to start base creation
await createBase()

// Listen and add new passwords to the list
pearwords.base.view.core.on('append', (e) => {
  console.log('exexex')
  createTable()
})

// Check for base writable state
pearwords.base.on('writable', (e) => {
  console.log('I am writable')
  document.querySelector('.add-writer').innerHTML = 'Add a Writer'
  document.querySelector('.add-writer').removeAttribute('disabled')
})

// Create the initial table
createTable()

// Destroy the base
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

// Copy Pearwords key to the clipboard
document.querySelector('.session-link').addEventListener('click', async (e) => {
  // Use the Clipboard API
  await copy(b4a.toString(pearwords.bootstrapKey(), 'hex'))
  console.log('Key copied to clipboard')
  alert('Key copied to clipboard!')
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
            document.getElementById('swal-username').value,
            document.getElementById('swal-password').value,
            document.getElementById('swal-website').value
          ]
        }
      })
      if (formValues) {
        await pearwords.add(formValues[0], formValues)
        createTable()
      }
    } else {
      Swal.fire('You selected a note')
    }
  }
})

// Handle the add writer function
document.querySelector('.add-writer').addEventListener('click', async (e) => {
  // Check if the button is disabled
  if (e.target.hasAttribute('disabled')) {
    copy(b4a.toString(pearwords.writerKey(), 'hex'))
    alert(
      'Writer key copied to clipboard, ask the admin to add your as a writer'
    )
    return
  }
  // Add new writer pop-up
  await Swal.fire({
    title: 'Add a writer',
    input: 'text',
    showCancelButton: true,
    inputValidator: (key) => {
      if (!key) {
        return 'You need to add a key'
      }
    },
    preConfirm: async (key) => {
      try {
        await pearwords.addWriter(key)
        Swal.fire('Added a new writer')
      } catch (error) {
        Swal.showValidationMessage(`Error: ${error}`)
      }
    }
  })
})
