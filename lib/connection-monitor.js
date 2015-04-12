'use strict'

var notice = require('./notices.js')

var MAX_SILENCE = 3000

module.exports = function connectionMonitor(remoteSocket) {
    var noticer = () => notice('lost connection', { isGood: false })

    var stoBroken
    remoteSocket.on('data', () => {
        if (stoBroken) clearTimeout(stoBroken)
        stoBroken = setTimeout(noticer, MAX_SILENCE)
    })

    remoteSocket.once('close', () => {
        noticer()
    })
}

