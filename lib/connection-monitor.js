
var notice = require('./notices.js')

module.exports = function connectionMonitor(remoteSocket) {
    var noticer = () => notice('lost connection', { isGood: false })

    var ev
    remoteSocket.on('end', ev1 = () => {
        noticer()
        remoteSocket.removeListener(ev)
    })
}

