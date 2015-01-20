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
            if (changes.length) {
                _events.emit('commit', changes)
            }
        }
        return extrapolation
    }

    function createReadStream() {
        var readStream = new stream.Readable({ objectMode: true })
        mp.entities.forEach( ent => {
            readStream.push(ent.createAddPacket())
        })
        readStream._read = function () {}
        _events.on('commit', (changes) =>
            changes.forEach((change) =>
                readStream.push(change)))
        return readStream
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
        var offset = { x: 0, y: 0 }
        if (mp.camera) {
            mp.camera.update(extrapolateAmount)
            offset = mp.camera.offset;
        }

        mp.ctx.clearRect(0, 0, 100, 100)

        var x = 0;
        mp.entities.collidingWith({
            center: { x: offset.x + 50, y: 50 },
            size: { x: 100, y: 100 }
        }, function (ent) {
            x++;
            ent.draw(extrapolateAmount);
        });

        if (mp.localPlayer) mp.localPlayer.drawLifeThing();
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
