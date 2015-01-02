'use strict'

var assert = require('assert')
var mp = require('./mp.js')()

module.exports = function game({ networld, mp, isServer }) {
    assert(isServer !== undefined, 'game should have a isServer boolean!')

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

        if (isServer) {
            networld.commit()
        }
    }

    return Object.freeze({
        update: update,
        tick: tick
    })
}