const express = require('express')
const chokidar = require('chokidar');
const fs = require('fs')
const { exec } = require('node:child_process')
const app = express()
const port = process.env.PORT || 3000

let lastBuild = Date.now()
const lastHit = {}

const timestamp = () => {
    return new Date().toISOString().split('T')[1].slice(0, 8)
}

app.use('*', (req, res, next) => {
    // track when generated config files get hit
    const url = req.originalUrl
    if (url.startsWith('/generated')) {
        console.log(`[${timestamp()}] hit`, url)
        lastHit[req.originalUrl] = Date.now()
    }
    next()
});

// register static paths
['generated', 'features', 'overrides', 'dashboard'].forEach((path) => {
    app.use(`/${path}`, express.static(path, { maxAge: 0 }))
})

// reporting patch for hit times
app.get('/status', (req, res) => {
    res.send({
        lastBuild,
        lastHit
    })
})

app.get('/', (req, res) => {
    res.redirect('/dashboard')
})

app.listen(port, () => {
    console.log('Running...')
})

// Run a config build
exec('node index.js')
// set up build watching
const watcher = chokidar.watch(['features', 'overrides'])
watcher.on('change', () => {
    exec('node index.js', (err) => {
        if (err) {
            console.warn('Error building config', err)
        } else {
            console.log(`[${timestamp()}] config updated`)
            lastBuild = Date.now()
        }
    })
})
