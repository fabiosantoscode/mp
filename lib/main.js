'use strict'

var assert = require('assert')
var stream = require('stream')
var event = require('events')
var mp = require('./mp.js')()

module.exports = function makeMain({ networld, mp, isServer }) {
    assert(isServer !== undefined, 'game should have a isServer boolean!')

    var _events = new event.EventEmitter()

    var gameStartTime
    var lastTick
    function tick(frameLimit) {
        if (gameStartTime === undefined) {
            gameStartTime = +new Date()
            lastTick = 0
        }
        var floatFrame = (+new Date() - gameStartTime) / (1000 / mp.TPS)  // ex: 1.5 means 1 update, 0.5 extrapolation
        var frame = Math.floor(floatFrame)
        var extrapolation = floatFrame - Math.floor(floatFrame)
        
        var framesToGo = frame - lastTick
        lastTick = frame;

        if (frameLimit === undefined) { frameLimit = 100 }
        if (framesToGo > frameLimit) { framesToGo = frameLimit }

        while(framesToGo--) {
            for (var ent of mp.entities) {
                ent.update()
            }
        }

        if (isServer && networld) {
            var changes = networld.commit()
            changes = changes.concat(randomAddPacket())
            if (changes.length) {
                _events.emit('commit', changes)
            }
        }
        return extrapolation
    }

    function createReadStream() {
        var readStream = new stream.Readable({ objectMode: true })
        var initialState = mp.entities
            .map((ent) => networld.createAddPacket(ent))
            .forEach((change) => readStream.push(change))
        readStream._read = function () {}
        _events.on('commit', (changes) =>
            changes.forEach((change) =>
                readStream.push(change)))
        return readStream
    }

    function randomAddPacket() {
        if (Math.random() > 0.95) {
            return [networld.createAddPacket(
                mp.entities[Math.floor(Math.random() * mp.entities.length)])];
        } else {
            return [];
        }
    }

    function createWriteStream() {
        var writeStream = new stream.Writable({ objectMode: true })
        writeStream._write = function (chunk, _, next) {
            networld._onPacket(chunk)
            next()
        }
        return writeStream
    }


    function draw(extrapolateAmount) {
        if (mp.camera) mp.camera.update(extrapolateAmount)

        mp.ctx.clearRect(0, 0, 100, 100)

        var i = mp.entities.length;
        while(i--) {
            mp.entities[i].draw(extrapolateAmount);
        }

        if (mp.player) mp.player.drawLifeThing();
    }

    function onFrame() {
        var howFarIntoNextFrame = tick();
        if (!mp.ctx) {
            var howMuchToWaitForNextFrame = (1 - howFarIntoNextFrame) * (1000 / mp.TPS)
            return setTimeout(onFrame, howMuchToWaitForNextFrame)
        } else {
            draw(howFarIntoNextFrame);
            return requestAnimationFrame(onFrame);
        }
    }

    setTimeout(onFrame, 0)

    return Object.freeze({
        tick: tick,
        createReadStream: createReadStream,
        createWriteStream: createWriteStream
    })
}