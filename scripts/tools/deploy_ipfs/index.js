#!/usr/bin/env node

const fs          = require('fs')
const path        = require('path')
const spawn       = require('child_process').spawn
const openBrowser = require('react-dev-utils/openBrowser')

const pathToVersions = path.join(__dirname, './links.json')

function start () {
  const log = []
  const cmd = spawn('docker exec ipfs_deployer ipfs add -r -Q /go/target', {
    shell: true,
    cwd: path.resolve(process.env.PWD, '../../..', '_env')
  })

  cmd.stderr.on('data', errData => log.push(`${errData}`))
  cmd.stdout.on('data', Data => log.push(`${Data}`))

  cmd
    .on('exit', code => {
      if (code === 0 ) {
        output(log)
      } else {
        console.error(log.join('\n'))
        process.exit()
      } 
    })
    .on('error', err => {
      console.error(err)
      process.exit(1)
    })
}

function output (log) {
  const hash = log.join('\n').replace(/\n/g, '')
  const res  = {
    hash      : hash,
    link      : `https://ipfs.io/ipfs/${hash}`,
    timestamp : new Date()
  }

  if (fs.existsSync(pathToVersions)) {
    const output = require(pathToVersions)
    const open   = fs.openSync(pathToVersions, 'w')
    
    for (let ver of output) {
      if (res.hash !== ver.hash) {
        output.push(res)
      }
    }

    fs.writeSync(open, JSON.stringify(output, null, ' '), 0, 'utf-8')
  } else {
    fs.writeFileSync(pathToVersions, JSON.stringify([res], null, ' '),
      err => {
        console.error(err.message)
        process.exit()
      })
  }

  openBrowser(res.link.replace(/\s/g, ''))

  console.log('')
  console.log('Deploy success! your DApp, is available for viewing on: ')
  console.log(res.link)
}

start()