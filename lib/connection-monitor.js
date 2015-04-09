'use strict'

var notice = require('./notices.js')

module.exports = function connectionMonitor(remoteSocket) {
    var noticer = () => notice('lost connection', { isGood: false })

    remoteSocket.once('end', () => {
        noticer()
    })
}

