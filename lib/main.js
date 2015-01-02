'use strict'

var mp = require('./mp.js')()

var gameStartTime
var lastTick
function tick() {
    if (gameStartTime === undefined) {
        gameStartTime = +new Date()
        lastTick = 0
    }
    var floatFrame = (+new Date() - gameStartTime) / (1000 / mp.TPS)  // ex: 1.5 means 1 update, 0.5 extrapolation
    var frame = Math.floor(floatFrame)
    var extrapolation = floatFrame - Math.floor(floatFrame)
    
    var framesToGo = frame - lastTick
    lastTick = frame;
    
    while(framesToGo--) {
        update()
    }

    return extrapolation
}

function update() {
    mp.entities.forEach(function (ent) {
        ent.update()
    })
}

module.exports = {
    update: update,
    tick: tick
}
