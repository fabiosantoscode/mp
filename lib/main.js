'use strict'

var assert = require('assert')
var stream = require('stream')
var event = require('events')
var mp = require('./mp.js')()

module.exports = function makeMain({ networld, mp, isServer, debugInfo, drawQuadTree, debugInfoElement }) {
    assert(isServer !== undefined, 'game should have a isServer boolean!')

    var _events = new event.EventEmitter()

    function roundTo(number, amount) {
        return Math.round(number * Math.pow(10, amount)) / Math.pow(10, amount)
    }

    var perfTrack =
        debugInfo && (typeof performance === 'object' || typeof process === 'object' && process.hrtime) &&
        (() => {
            var lastSecond = Math.floor(+new Date() / 1000)
            var framesThisSecond = 0
            var eLabels = debugInfoElement

            var labels = {}
            var totals = {}

            var hrtime = typeof process === 'object' && process.hrtime

            return {
                start: (label) => {
                    if (hrtime) {
                        labels[label] = hrtime()
                    } else {
                        labels[label] = performance.now()
                    }
                },
                end: (label) => {
                    if (!(label in totals)) {
                        totals[label] = 0
                    }
                    if (hrtime) {
                        var diff = process.hrtime(labels[label])
                        totals[label] += (diff[0] * 1000) + (diff[1] / 1e6)
                    } else {
                        totals[label] += performance.now() - labels[label]
                    }
                    delete labels[label]
                },
                frame: () => {
                    if (Math.floor(+new Date() / 1000) == lastSecond) {
                        framesThisSecond++
                        return
                    }

                    var debugText = framesThisSecond + 'FPS,' + Object.keys(totals)
                        .map(total =>
                            total + '=' + roundTo(totals[total] / framesThisSecond, 2) + 'ms')

                    if (eLabels) {
                        eLabels.textContent = debugText
                    } else {
                        console.log(debugText)
                    }

                    framesThisSecond = 1
                    totals = {}
                    lastSecond = Math.floor(+new Date() / 1000)
                }
            }
        })();

    mp.perfTrack = perfTrack

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
            var entities = mp.entities  // Because this is an accessor
            var entsToGo = entities.length
            for (var ent of entities) {
                if (!ent.static) {
                    ent.update()
                }
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
        if (perfTrack) perfTrack.start('draw')

        var offset = { x: 0, y: 0 }
        if (mp.camera) {
            mp.camera.update(extrapolateAmount)
            offset = mp.camera.offset;
        }

        mp.ctx.clearRect(0, 0, 100, 100)
        mp.ctx.fillStyle = 'black'

        var x = 0;
        mp.entities.collidingWith({
            center: { x: offset.x + 50, y: 50 },
            size: { x: 100, y: 100 }
        }, function (ent) {
            x++;
            ent.draw(extrapolateAmount);
        });

        if (perfTrack) perfTrack.end('draw')

        if (drawQuadTree) {
            mp.entities.debugDrawTree(mp.ctx, offset)
        }
    }

    function onFrame() {
        if (perfTrack) perfTrack.start('tick')
        var howFarIntoNextFrame = tick();
        if (perfTrack) perfTrack.end('tick')
        if (!mp.ctx) {
            var howMuchToWaitForNextFrame = (1 - howFarIntoNextFrame) * (1000 / mp.TPS)
            setTimeout(onFrame, howMuchToWaitForNextFrame)
        } else {
            draw(howFarIntoNextFrame);
            requestAnimationFrame(onFrame);
        }
        if (perfTrack) perfTrack.frame()
    }

    setTimeout(onFrame, 0)

    return Object.freeze({
        tick: tick,
        createReadStream: createReadStream,
        createWriteStream: createWriteStream
    })
}
