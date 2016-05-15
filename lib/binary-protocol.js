'use strict'

var stream = require('stream')

var keyboardFilter = require('./keyboard-filter')

var JSONMagicNumber = '['.charCodeAt(0)
var binaryMagicNumber = '$'.charCodeAt(0)

module.exports = {
    fromServer: function (getMp) {
        var fromServer = stream.Transform({
            objectMode: true
        })
        fromServer._transform = function (chunk, _, next) {
            this.push(JSON.parse(chunk.toString()))
            next()
        }
        return fromServer
    },
    toServer: function (getMp) {
        var toServer = stream.Transform({
            objectMode: true
        })
        toServer._transform = function (chunk, _, next) {
            var mp = getMp();
            var player = mp && mp.localPlayer
            if (!(mp && player)) { return next() }

            if (typeof chunk[0] === 'string' && chunk[0].substring(0, 3) === 'key') {
                if (!keyboardFilter(player, chunk)) { return next() }
            }

            this.push(JSON.stringify(chunk))

            next()
        }
        return toServer
    },
}

