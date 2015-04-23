'use strict'

var assert = require('assert')
var makeMp = require('./mp.js')
var makeMain = require('./main.js')
var notice = require('./notices.js')
var createPlayerControlStream = require('./playercontrolstream.js')
var createOnScreenKeyboard = require('./onscreen-keyboard.js')
var makeCapturePoint = require('./capture-point.js')
var makeScoreboard = require('./scoreboard')
var addSounds = require('./add-sounds')
var util = require('util')
var es = require('event-stream')
var makeWeaponInfo = require('./weapon-info.js')
var websocketStream = require('websocket-stream')
var makeClockSync = require('./clock-sync')
var gameName = require('./gamename')
var keyboardFilter = require('./keyboard-filter')

var Promise = typeof Promise === 'function' ? Promise : require('es6-promise').Promise


document.title = 'mp'



var mainCanvas = document.getElementById('mainCanvas')

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

var SERVER = window.SERVER
var CLIENT = window.CLIENT
var player

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

    var mp = null
    var networld = null
    var main = null
    var mainWs = null
    var playerWs = null
    var weaponInfo = null
    var scoreboard = null

    serverMessages.on('data', function(data) {
        if (mainWs) {
            mainWs.write(data)
        }
    })

    function newRound() {
        mp = makeCapturePoint({ mp: makeMp() })
        addSounds({ mp })
        mp.ctx = mainCanvas.getContext('2d')
        networld = new mp.Networld({ isServer: false })
        mp.yRange = [-50, 100]
        main = makeMain({ mp: mp, networld: networld, isServer: false, debugInfo: debugInfo, drawQuadTree: drawQuadTree, debugInfoElement: debugInfoElement, clockSync: clockSync })
        mainWs = main.createWriteStream()
        scoreboard = makeScoreboard({
            mp,
            scoreboardElement: document.querySelector('.scoreboard'),
            scoreboardToggleElement: document.querySelector('.scoreboard-toggle') })

        networld.on('packet:fatal', function (opArgs) {
            var message = opArgs[0]
            notice(message, { isGood: false })
        })

        networld.on('packet:notice', function (opArgs) {
            var message = opArgs[0]
            var opt = opArgs[1] || {}
            notice(message, opt)
        })

        networld.on('packet:reconnect me', function () {
            if (player && !player.dead) mp.entities.remove(player)
            mp.destroy()
            networld.destroy()
            main.destroy()
            mainWs.end()
            mp = null
            networld = null
            main = null
            mainWs = null
            player = null

            newRound()
        })

        main.on('you', function (newPlayer) {
            // Set the new player
            player = newPlayer
            player.clientsidePrediction = true

            playerWs = player.createWriteStream()

            // Weapon info div
            var weaponInfoDiv = document.querySelector('.weapon-info')
            if (weaponInfo) weaponInfo.destroy()
            weaponInfo = makeWeaponInfo(player, { weaponInfoDiv })
        })
    }
    newRound()


    var keyboardToServer = keyboardFilter(() => player)

    var keyboard = createPlayerControlStream()
    var onscreenKeyboard = createOnScreenKeyboard()

    keyboard.pipe(keyboardToServer)
    if (onscreenKeyboard) {
        onscreenKeyboard.pipe(keyboardToServer)
    }

    keyboard.on('data', function (dt) {
        if (playerWs) playerWs.write(dt)
    })
    if (onscreenKeyboard) {
        onscreenKeyboard.on('data', function (dt) {
            if (playerWs) playerWs.write(dt)
        })
    }

    keyboardToServer.pipe(stringifyToServer)

    stringifyToServer.pipe(server)

    var myName = gameName.get();
    if (myName)
        stringifyToServer.write(['my-name', myName])

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
    },
    function onErr(err) {
        console.error(err)
    })
