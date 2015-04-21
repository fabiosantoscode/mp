'use strict'

var assert = require('assert')
var mp = require('./mp.js')()
var makeMain = require('./main.js')
var Camera = require('./camera.js')
var util = require('util')
var es = require('event-stream')
var websocketStream = require('websocket-stream')
var makeClockSync = require('./clock-sync')

var makeCapturePoint = require('./capture-point.js')

var Promise = typeof Promise === 'function' ? Promise : require('es6-promise').Promise
mp = makeCapturePoint({ mp })

document.title = 'mp'



var mainCanvas = document.getElementById('mainCanvas')
mp.ctx = mainCanvas.getContext('2d')

var width = 100
var height = 100

var loaded = false

window.onerror = function (e) {
    console.error(e)
    if (!loaded) {
        document.body.innerHTML = '<center>An error has occurred: ' + e
    }
}

var isServer = false

var networld = new mp.Networld({ isServer: false })

var SERVER = window.SERVER
var CLIENT = window.CLIENT

var camera = mp.camera = new Camera()
camera.offset = { x: 0, y: 0 }

var playerI = 0
function cameraOnCyclingPlayer() {
    var players = mp.entities.filter(function (p) { return p instanceof mp.Player })

    playerI++
    playerI = playerI % players.length || 0

    // Player is an incrementing variable from 0 to players.length

    if (players.length) {
        camera.player = players[playerI]
    }

    setTimeout(cameraOnCyclingPlayer, 3000)
}

setTimeout(cameraOnCyclingPlayer, 1000)

function startGame(server, clockSync) {
    loaded = true

    var main = makeMain({ mp: mp, networld: networld, isServer: false, clockSync: clockSync })

    var stringifyToServer = es.stringify()

    stringifyToServer.pipe(server)

    server
        .pipe(es.split())
        .pipe(es.parse())
        .pipe(main.createWriteStream())

    return new Promise(function (_, reject) {
        server.on('error', reject)
    })
}

var images = require('./images.js')

var promiseForServerSocket = new Promise(function (resolve, reject) {
    var serverSocket = websocketStream('ws://' + window.location.host + window.location.pathname)
    resolve(serverSocket)
})

Promise.all([promiseForServerSocket, images.allLoaded()])
    .then(function ([server, _]) {
        startGame(server, makeClockSync(server))
    },
    function onErr(err) {
        console.error(err)
    })
