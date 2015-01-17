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

var makeDeathmatch = require('./deathmatch.js')

mp = makeDeathmatch({ mp })

document.title = 'mp'



var mainCanvas = document.getElementById('mainCanvas')
mp.ctx = mainCanvas.getContext('2d')

var width = 100
var height = 100

var loaded = false

var player = new mp.HumanPlayer({ x: 50, y: 50 })
var camera = mp.camera = new Camera({ x: 0, y: 0 }, player)

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

function startGame(server) {
    loaded = true

    var main = makeMain({ mp: mp, networld: networld, isServer: false })

    server
        .pipe(es.mapSync(function (data) {
            return JSON.parse(data.toString('utf-8')); 
        }))
        .pipe(main.createWriteStream())

    createPlayerControlStream()
        .pipe(es.stringify())
        .pipe(server)

    var onscreenKeyboard = createOnScreenKeyboard()

    if (onscreenKeyboard) {
        onscreenKeyboard
            .pipe(es.stringify())
            .pipe(server)
    }

    return new Promise(function (_, reject) {
        server.on('error', reject)
    })
}

var images = require('./images.js')

var promisesForImages = Object.keys(images.all)
    .map((imgName) => images[imgName])
    .map((img) => new Promise(function (resolve, reject) {
        img.addEventListener('load', resolve)
        img.addEventListener('error', reject)
        setTimeout(() => reject(new Error('Image load timed out')), 20000)
    }))

var promiseForImages = Promise.all(promisesForImages)

var promiseForServerSocket = new Promise(function (resolve, reject) {
    var serverSocket = websocketStream('ws://' + window.location.host + window.location.pathname)
    resolve(serverSocket)
})

Promise.all([promiseForServerSocket, promiseForImages])
    .then(function ([server, _]) {
        return startGame(server)
    },
    function onErr(err) {
        console.error(err)
    })

