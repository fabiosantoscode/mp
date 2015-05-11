'use strict'

var notice = require('./notices.js')

var MAX_SILENCE = 3000

module.exports = function connectionMonitor(remoteSocket) {
    var poorNoticer = () => notice('poor connection', { isGood: false })
    var noticer = () => notice('lost connection', { isGood: false })

    var stoPoor
    remoteSocket.on('data', () => {
        if (stoPoor) clearTimeout(stoPoor)
        stoPoor = setTimeout(poorNoticer, MAX_SILENCE)
    })

    remoteSocket.once('close', () => {
        noticer()
    })
}

