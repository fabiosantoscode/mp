'use strict'

var mp = require('./mp.js')
var main = require('./main.js')
var Camera = require('./camera.js')

document.title = 'mp'

var mainCanvas = document.getElementById('mainCanvas')
var ctx = window.ctx = mainCanvas.getContext('2d')
ctx.fillStyle = this.color || 'rgb(0,0,0)'

window.width = mainCanvas.width
window.height = mainCanvas.height

var loaded = false

var player = new mp.HumanPlayer({ x: 50, y: 50 })
var camera = window.camera = new Camera({ x: 0, y: 0 }, player)

window.onerror = function (e) {
    console.error(e)
    if (!loaded) {
        document.body.innerHTML = '<center>An error has occurred: ' + e
    }
}

var update = main.update
var tick = main.tick

function draw(extrapolateAmount) {
    ctx.clearRect(0, 0, width, height)

    var i = mp.entities.length;
    while(i--) {
        mp.entities[i].draw(extrapolateAmount);
    }

    player.drawLifeThing();

    for (var j = 0; j < 10; j+=10) {
        ctx.fillRect(
            (j * 2) - camera.offset.x,
            10,
            10,
            30);
    }
}

function startGame() {
    loaded = true
    mp.makePlayerAI().control(player)
    mp.entities.push(player)
    for (var i = 0; i < 20; i++) {
        var x = 100 + (Math.random() * 800);
        var enem = new mp.Player({ x: x, y: 90 })
        var enemAI = new mp.EnemyAI(player)
        enemAI.control(enem)
        mp.entities.push(enem)
    }
    for (var i = 0; i < 60; i++) {
        var x = 100 + (Math.random() * 800);
        var dog = new mp.Dog({ x: x, y: 90 })
        var dogAI = new mp.DogAI(player)
        dogAI.control(dog)
        mp.entities.push(dog)
    }

    (function onFrame() {
        var extrapolation = tick()
        camera.update(extrapolation)
        draw(extrapolation)
        requestAnimationFrame(onFrame)
    }());
}

player.image.addEventListener('load', startGame)
