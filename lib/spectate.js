'use strict'

var assert = require('assert')
var makeMp = require('./mp.js')
var makeMain = require('./main.js')
var notice = require('./notices.js')
var makeCapturePoint = require('./capture-point.js')
var util = require('util')
var es = require('event-stream')
var websocketStream = require('websocket-stream')
var makeClockSync = require('./clock-sync')

var Promise = typeof Promise === 'function' ? Promise : require('es6-promise').Promise

var mp = makeCapturePoint({ mp: makeMp() })

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

var networld = new mp.Networld({ isServer: false })


function startGame(server, clockSync) {
    var serverMessages = server.pipe(es.split()).pipe(es.parse())
    var stringifyToServer = es.stringify()

    loaded = true

    var debugInfo = typeof location !== 'undefined' &&
        /\bdebug\b/.test(location.search)

    var drawQuadTree = typeof location !== 'undefined' &&
        /\bdebug=qtree\b/.test(location.search)

    if (debugInfo) {
        document.documentElement.classList.add('debug-info')
        var debugInfoElement = document.createElement('pre')
        debugInfoElement.classList.add('debug')

        mainCanvas.parentNode.insertBefore(
            debugInfoElement, mainCanvas)
    }

    var settingsPanel = document.querySelector('.settings-panel')
    var settingsButton = document.querySelector('.settings-panel-toggle')
    if (settingsPanel && settingsButton) {
        var settings = makeSettings({ settingsPanel: settingsPanel, settingsButton: settingsButton })
    }

    var main = makeMain({ mp: mp, networld: networld, isServer: false, clockSync: clockSync, debugInfo: debugInfo, debugInfoElement: debugInfoElement })

    networld.on('packet:fatal', function (opArgs) {
        var message = opArgs[0]
        notice(message, { isGood: false })
    })

    networld.on('packet:notice', function (opArgs) {
        var message = opArgs[0]
        var opt = opArgs[1] || {}
        notice(message, opt)
    })

    serverMessages.pipe(main.createWriteStream())
    stringifyToServer.pipe(server)

    require('./connection-monitor')(server)
}

var images = require('./images.js')

var promiseForServerSocket = new Promise(function (resolve, reject) {
    var serverSocket = websocketStream('ws://' + window.location.host + window.location.pathname)
    serverSocket.pause()
    resolve(serverSocket)
})

Promise.all([promiseForServerSocket, images.allLoaded()])
    .then(function ([server, _]) {
        server.resume()
        startGame(server, makeClockSync(server))
        cameraOnCyclingPlayer()
    },
    function onErr(err) {
        console.error(err)
    })

var playerI = 0
function cameraOnCyclingPlayer() {
    var players = mp.entities.filter(function (p) { return p instanceof mp.Player })

    playerI++
    playerI = playerI % players.length || 0

    // Player is an incrementing variable from 0 to players.length

    if (players.length) {
        mp.camera.player = players[playerI]
    }

    setTimeout(cameraOnCyclingPlayer, 3000)
}

