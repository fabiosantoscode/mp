'use strict'

var assert = require('assert')
var mp = require('./capture-point')({ mp: require('./mp.js')() })
var main = require('./main.js')
var Camera = require('./camera.js')
var util = require('util')

var Promise = typeof Promise === 'function' ? Promise : require('es6-promise').Promise

document.title = 'mp'

var mainCanvas = document.getElementById('mainCanvas')
mp.ctx = mainCanvas.getContext('2d')

var player = mp.entities.construct(mp.RedPlayer, { x: 50, y: 50 })
var camera = mp.camera = new Camera({ x: 0, y: 0 })

player.maxLife = -1
player.life = -1

var update = main.update
var tick = main.tick

var SERVER = window.SERVER
var CLIENT = window.CLIENT

function startGame() {
    main = main({ mp: mp, networld: null, isServer: true })
    if (SERVER === true || SERVER === undefined) {
        mp.entities.push(player)
        player.center = { x: 70, y: 10 }
        player.facingRight = true
        var b = mp.entities.construct(mp.RedBase)
        b.center = { x: 30, y: 75 }
        b.life = -1
        mp.entities.push(b)

        var b = mp.entities.construct(mp.BlueBase)
        b.center = { x: 300 - 30, y: 75 }
        b.life = -1
        mp.entities.push(b)
    }
}

var images = require('./images.js')

images.allLoaded().then(startGame)

