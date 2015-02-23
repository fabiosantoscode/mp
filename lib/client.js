'use strict'

var assert = require('assert')
var mp = require('./mp.js')()
var makeMain = require('./main.js')
var createPlayerControlStream = require('./playercontrolstream.js')
var createOnScreenKeyboard = require('./onscreen-keyboard.js')
var Camera = require('./camera.js')
var util = require('util')
var es = require('event-stream')
var websocketStream = require('../vendor/websocket-stream')
var makeClockSync = require('./clock-sync')

var makeCapturePoint = require('./capture-point.js')

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

function startGame(server, clockSync) {
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

    var main = makeMain({ mp: mp, networld: networld, isServer: false, debugInfo: debugInfo, drawQuadTree: drawQuadTree, debugInfoElement: debugInfoElement, clockSync: clockSync })

    var stringifyToServer = es.stringify()

    stringifyToServer.pipe(server)

    server
        .pipe(es.split())
        .pipe(es.parse())
        .pipe(main.createWriteStream())

    var keyboard = createPlayerControlStream()
    var onscreenKeyboard = createOnScreenKeyboard()

    keyboard.pipe(stringifyToServer)
    if (onscreenKeyboard) {
        onscreenKeyboard.pipe(stringifyToServer)
    }

    main.on('you', function (player) {
        console.log('activating clientside prediction')
        player.clientsidePrediction = true
        keyboard.pipe(player.createWriteStream())
        if (onscreenKeyboard) {
            onscreenKeyboard.pipe(player.createWriteStream())
        }
    })

    return new Promise(function (_, reject) {
        server.on('error', reject)
    })
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
    },
    function onErr(err) {
        console.error(err)
    })
