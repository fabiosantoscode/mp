'use strict'

var assert = require('assert')
var mp = require('./mp.js')()
var main = require('./main.js')
var Camera = require('./camera.js')
var util = require('util')

document.title = 'mp'

var mainCanvas = window.USE_CANVAS || document.getElementById('mainCanvas')
mp.ctx = mainCanvas.getContext('2d')

if (!window.width) window.width = mainCanvas.width
if (!window.height) window.height = mainCanvas.height

var loaded = false

var player = new mp.HumanPlayer({ x: 50, y: 50 })
var camera = window.camera = new Camera({ x: 0, y: 0 }, player)

window.onerror = function (e) {
    console.error(e)
    if (!loaded) {
        document.body.innerHTML = '<center>An error has occurred: ' + e
    }
}

main = main({ mp: mp, networld: null, isServer: !!window.SERVER })
var update = main.update
var tick = main.tick

function draw(extrapolateAmount) {
    mp.ctx.clearRect(0, 0, width, height)

    var i = mp.entities.length;
    while(i--) {
        mp.entities[i].draw(extrapolateAmount);
    }

    if (player) player.drawLifeThing();
}

var SERVER = window.SERVER
var CLIENT = window.CLIENT

function startGame() {
    if (SERVER === true || SERVER === undefined) {
        mp.makePlayerAI().control(player)
        mp.entities.push(player)
        for (var i = 0; i < 10; i++) {
            var x = 100 + (Math.random() * 800);
            var enem = new mp.Player({ x: x, y: 90 })
            var enemAI = new mp.EnemyAI(player)
            enemAI.control(enem)
            mp.entities.push(enem)
        }
        for (var i = 0; i < 6; i++) {
            var x = 100 + (Math.random() * 800);
            var dog = new mp.Dog({ x: x, y: 90 })
            var dogAI = new mp.DogAI(player)
            dogAI.control(dog)
            mp.entities.push(dog)
        }
    } else {
        //for (var i = 0; i < 20; i++) {
        //    var x =  (Math.random() * 800);
        //    var enem = new mp.Player({ x: x, y: 90 })
        //    mp.entities.push(enem)
        //}
    }

    loaded = true

    ;(function onFrame() {
        var extrapolation = tick()
        if (camera) camera.update(extrapolation)
        draw(extrapolation)
        requestAnimationFrame(onFrame)
    }());
}

var images = require('./images.js')

var promisesForImages = Object.keys(images.all)
    .map((imgName) => images[imgName])
    .map((img) => new Promise(function (resolve, reject) {
        img.addEventListener('load', resolve)
        img.addEventListener('error', reject)
        setTimeout(() => reject(new Error('Image load timed out')), 20000)
    }))

Promise.all(promisesForImages).then(startGame)
