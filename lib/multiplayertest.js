'use strict'

var assert = require('assert')
var makeMp = require('./mp.js')
var stream = require('stream')
var makeMain = require('./main.js')
var createPlayerControlStream = require('./playercontrolstream.js')
var Camera = require('./camera.js')
var util = require('util')

document.title = 'mp'

function makeServer() {
    var mp = makeMp()
    var player = new mp.HumanPlayer({ x: 50, y: 50 })
    var camera = mp.camera = new Camera({ x: 0, y: 0 }, player)
    var networld = new mp.Networld({ isServer: true })
    var main = makeMain({ mp: mp, networld: networld, isServer: true })
    var mainCanvas = document.getElementById('server-canvas')
    mp.ctx = mainCanvas.getContext('2d')
    createPlayerControlStream().pipe(player.createWriteStream())
    mp.entities.push(player)
    for (var i = 0; i < 10; i++) {
        var x = 100 + (Math.random() * 800);
        var enem = new mp.Player({ x: x, y: 90 })
        mp.enemyAI(enem, player);
        mp.entities.push(enem)
    }
    for (var i = 0; i < 6; i++) {
        var x = 100 + (Math.random() * 800);
        var dog = new mp.Dog({ x: x, y: 90 })
        mp.dogAI(dog, player)
        mp.entities.push(dog)
    }
    return main
}

function report() {
    var out = document.getElementById('kbps')
    var ret = new stream.Writable({ objectMode: true })
    var latestSecond = -1000
    var bytes = 0
    ret._write = function (chunk, _, next) {
        var thisSecond = Math.round(+new Date() / 1000)
        if (thisSecond > latestSecond) {
            latestSecond = thisSecond
            out.textContent = Math.round(bytes / 1024) + 'kb/s'
            bytes = 0
        }
        bytes += JSON.stringify(chunk).length  // Stream is only ASCII-encoded JSON
        bytes += '\n'.length
        next()
    }
    return ret
}

function makeClient(canvas) {
    var mp = makeMp()
    var networld = new mp.Networld({ isServer: false })
    var main = makeMain({ mp: mp, networld: networld, isServer: false })
    mp.ctx = canvas.getContext('2d')

    return main
}

if (!window.width) window.width = 100
if (!window.height) window.height = 100

var images = require('./images.js')

var promisesForImages = Object.keys(images.all)
    .map((imgName) => images[imgName])
    .map((img) => new Promise(function (resolve, reject) {
        img.addEventListener('load', resolve)
        img.addEventListener('error', reject)
        setTimeout(() => reject(new Error('Image load timed out')), 20000)
    }))

Promise.all(promisesForImages).then(function () {
    var server = makeServer().createReadStream()
    server.pipe(report())
    server.pipe(makeClient(document.getElementById('canvas1')).createWriteStream())
    server
        .pipe(makeClient(document.getElementById('canvas2')).createWriteStream())
    server
        .pipe(makeClient(document.getElementById('canvas3')).createWriteStream())
    server
        .pipe(makeClient(document.getElementById('canvas4')).createWriteStream())
})
