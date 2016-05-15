'use strict'

var LEFT = 37
var RIGHT = 39
var JUMP = 38
var SHOOT = 32

var Readable = require('stream').Readable

var acceptableKeys = [ LEFT, RIGHT, JUMP, SHOOT ]

module.exports = function createPlayerControlStream() {
    // Creates a stream of ['keydown/keyup', keyCode] pairs
    var lastThing

    var stream = new Readable({
        objectMode: true,
    })

    function onEvent(ev) {
        if (acceptableKeys.indexOf(ev.which) == -1) return
        var hash = ev.type + ',' + ev.which
        if (lastThing !== hash) {
            lastThing = hash
            var ret = stream.push([ev.type, ev.which])
            if (ret === false) {
                document.removeEventListener('keydown', onEvent)
                document.removeEventListener('keyup', onEvent)
            }
        }
        ev.preventDefault()
    }

    stream._read = function () {
        document.addEventListener('keydown', onEvent)
        document.addEventListener('keyup', onEvent)
    }

    return stream
}
