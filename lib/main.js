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
            update()
        }

        return extrapolation
    }

    function createReadStream() {
        var readStream = new stream.Readable({ objectMode: true })
        readStream._read = new Function
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

    function update() {
        mp.entities.forEach(function (ent) {
            ent.update()
        })

        if (isServer) {
            var changes = networld.commit()
            if (changes.length) {
                _events.emit('commit', changes)
            }
        }
    }

    return Object.freeze({
        update: update,
        tick: tick,
        createReadStream: createReadStream,
        createWriteStream: createWriteStream
    })
}
