'use strict'

var assert = require('assert')
var mp = require('./capture-point')({ mp: require('./mp.js')() })
var main = require('./main.js')
var Camera = require('./camera.js')
var util = require('util')

var Promise = typeof Promise === 'function' ? Promise : require('es6-promise').Promise

document.title = 'mp'

var mainCanvas = window.USE_CANVAS || document.getElementById('mainCanvas')
mp.ctx = mainCanvas.getContext('2d')

if (!window.width) window.width = mainCanvas.width
if (!window.height) window.height = mainCanvas.height

var loaded = false

var player = new mp.RedPlayer({ x: 50, y: 50 })
var camera = mp.camera = new Camera({ x: 0, y: 0 })

player.maxLife = -1
player.life = -1

window.onerror = function (e) {
    console.error(e)
    if (!loaded) {
        document.body.innerHTML = '<center>An error has occurred: ' + e
    }
}

var update = main.update
var tick = main.tick

var SERVER = window.SERVER
var CLIENT = window.CLIENT

function startGame() {
    main = main({ mp: mp, networld: null, isServer: true })
    if (SERVER === true || SERVER === undefined) {
        mp.entities.push(player)
        player.center = { x: 63, y: 10 }
        player.facingRight = true
        var b = new mp.RedBase()
        b.center = { x: 30, y: 75 }
        mp.entities.push(b)
        
        var p = new mp.RedPoint()
        p.center = { x: 210, y: 85 }
        mp.entities.push(p)

        b.life = p.life = -1

        setTimeout(function(){
            var b = new mp.BlueBase()
            b.center = { x: 500 - 30, y: 75 }
            mp.entities.push(b)
            
            var p = new mp.BluePoint()
            p.center = { x: 500 - 210, y: 85 }
            mp.entities.push(p)
        }, 500)

        b.life = p.life = -1
    } else {
        //for (var i = 0; i < 20; i++) {
        //    var x =  (Math.random() * 800);
        //    var enem = new mp.Player({ x: x, y: 90 })
        //    mp.entities.push(enem)
        //}
    }

    loaded = true

}

var images = require('./images.js')

images.allLoaded().then(startGame)

