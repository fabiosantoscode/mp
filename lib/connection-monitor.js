'use strict'

var notice = require('./notices.js')

var MAX_SILENCE = 3000

module.exports = function connectionMonitor(remoteSocket, clientSocket) {
    var poorNoticer = () => notice('poor connection', { isGood: false })
    var noticer = () => notice('lost connection', { isGood: false })

    var stoPoor
    var cancelNotice = () => {
        if (stoPoor) clearTimeout(stoPoor)
    }
    var scheduleNotice = () => {
        stoPoor = setTimeout(poorNoticer, MAX_SILENCE)
    }

    var clean = () => {
        remoteSocket.removeListener('data', cancelNotice)
        clientSocket.removeListener('data', postponeNotice)
        remoteSocket.removeListener('close', lostConnection)
        clientSocket.removeListener('close', clean)
    }

    var lostConnection = () => {
        noticer()
        clean()
    }

    remoteSocket.on('data', cancelNotice)
    clientSocket.on('data', postponeNotice)

    remoteSocket.on('close', lostConnection)
    clientSocket.on('close', clean)
}

