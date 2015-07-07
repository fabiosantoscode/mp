'use strict'

var assert = require('assert')
var stream = require('stream')
var events = require('events')
var mp = require('./mp.js')
var vec = mp.vec

module.exports = function makeMain({ networld, mp, isServer, debugInfo, drawQuadTree, debugInfoElement, clockSync }) {
    assert(isServer !== undefined, 'game should have a isServer boolean!')

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

    mp.clockSync = clockSync
    mp.perfTrack = perfTrack

    var gameStartTime
    var lastTick
    function tick(frameLimit) {
        if (gameStartTime === undefined) {
            gameStartTime = +new Date()
            lastTick = 0
        }
        var floatFrame = (+new Date() - gameStartTime) / (1000 / mp.TPS)  // ex: 1.5 means 1 update, 0.5 extrapolation
        var frame = floatFrame|0
        var extrapolation = floatFrame - frame
        
        var framesToGo = frame - lastTick
        lastTick = frame;

        if (frameLimit === undefined) { frameLimit = 5 }
        if (framesToGo > frameLimit) { framesToGo = frameLimit }

        var entities = mp.entities  // Because this is an accessor
        while(framesToGo--) {
            entities.forEach(function(ent) {
                if (!ent.static) {
                    ent.update()
                }
            })
        }

        if (isServer && networld) {
            var changes = networld.commit()
            if (changes.length) {
                main.emit('commit', changes)
            }
        }
        return extrapolation
    }

    function createReadStream() {
        var readStream = new stream.Readable({ objectMode: true })
        if (mp.worldGenInfo) {
            mp.worldGenInfo.forEach(worldGenArgs => {
                readStream.push(['worldGen', worldGenArgs]) })
        }
        mp.entities.forEach( ent => {
            if (ent.syncable !== false)
                readStream.push(ent.createAddPacket())
        })
        readStream._read = function () {}
        var onChanges = (changes) =>
            changes.forEach((change) =>
                readStream.push(change))
        main.on('commit', onChanges)
        readStream.destroy = function () {
            readStream.push(null)
            main.removeListener('commit', onChanges)
        }
        return readStream
    }

    var writeStream
    function createWriteStream() {
        if (writeStream) { return writeStream }
        writeStream = new stream.Writable({ objectMode: true })
        writeStream._write = function (chunk, _, next) {
            networld._onPacket(chunk)
            next()
        }
        return writeStream
    }

    var drawBgCache
    var drawBgHash
    function drawBg(offset, ctx, height, width) {
        var margin = 64
        // Here, "X >> 6 << 6" means "round X by increments of 64." Or "Math.round(X / 64) * 64"
        // (64 is the background margin)
        var camX = offset.x >> 6 << 6;
        var camY = offset.y >> 6 << 6;
        var hash = camX ^ camY
        if (drawBgHash === hash) {
            return ctx.drawImage(drawBgCache.canvas,
                -(camX - offset.x), 0, 100, 100,
                0, 0, 100, 100)
        }

        drawBgHash = hash
        var bgImage
        // Create dat canvas
        if (!drawBgCache){
            drawBgCache = document.createElement('canvas').getContext('2d')
            drawBgCache.canvas.width = width + margin
            drawBgCache.canvas.height = height
        }

        // Clear dat canvas
        drawBgCache.clearRect(0, 0, 100 + margin, 100)

        var _oldOffset = mp.camera.offset
        var _oldCtx = mp.ctx
        mp.camera.offset = vec({
            x: camX,
            y: 0
        })
        mp.ctx = drawBgCache
        var statics = mp.entities.collidingWith({
            center: { x: camX + (width / 2) + (margin / 2), y: height / 2 },
            size: { x: width + margin, y: height }
        }, { static: true }, function (ent) {
            ent.draw(0)
        })
        mp.ctx = _oldCtx
        mp.camera.offset = _oldOffset

        // Draw the cached thing.
        var offsX = camX - offset.x
        return ctx.drawImage(drawBgCache.canvas,
            -offsX, 0, 100, 100,
            0, 0, 100, 100)
    }

    function draw(extrapolateAmount) {
        if (perfTrack) perfTrack.start('draw')

        var offset = { x: 0, y: 0 }
        if (mp.camera) {
            mp.camera.update(extrapolateAmount)
            offset = mp.camera.offset;
        }

        var ctx = mp.ctx
        var cv = ctx.canvas
        var height = cv.height
        var width = cv.width

        var bgImage
        if ((bgImage=mp.bgImage)) {
            var range = mp.range
            var leftmost = range[0]
            var rightmost = range[1] - width

            var prog = (offset.x - leftmost) / (rightmost - leftmost)

            var imageWidth = bgImage.width - width
            var progOfWidth = prog * imageWidth

            ctx.drawImage(bgImage.image.img, -Math.round(progOfWidth), 0)
        } else {
            ctx.clearRect(0, 0, width, height)
        }

        if (mp.worldGenInfo) {
            drawBg(offset, ctx, height, width)
        }

        var dynamicEnts = mp.entities.collidingWith({
            center: { x: offset.x + (width / 2), y: height / 2 },
            size: { x: width, y: height }
        }, { static: false })

        for (var i = 0; i < dynamicEnts.length; i++) {
            dynamicEnts[i].draw(extrapolateAmount);
        }

        ctx.fillStyle = 'red'
        for (var i = 0; i < dynamicEnts.length; i++) {
            if (dynamicEnts[i].life !== -1)
                dynamicEnts[i].drawLifeBar(extrapolateAmount);
        }

        if (perfTrack) perfTrack.end('draw')

        if (drawQuadTree) {
            mp.entities.debugDrawTree(ctx, offset)
        }
    }

    var stop = false
    function onFrame() {
        if (stop) { return }
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

    if (networld) {
        networld.on('you', (...me) => main.emit('you', ...me))
    }

    var main = new events.EventEmitter()
    main.setMaxListeners(255)
    main.tick = tick
    main.createReadStream = createReadStream
    main.createWriteStream = createWriteStream
    main.destroy = function () {
        main.removeAllListeners('you')
        main.removeAllListeners('commit')
        stop = true
        if (writeStream) { writeStream.end(); writeStream = null; }
    }
    return main
}
