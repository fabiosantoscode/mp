'use strict'

module.exports = function (getPlayer, stream) {
    var stop = false

    var lastPush = +new Date()

    var thePlayer
    var playerOnPush3d = function onPush3d() { lastPush = +new Date() }

    function push() {
        if (stop) return;
        var player = typeof getPlayer == 'function' ? getPlayer() : getPlayer
        if (player !== thePlayer) {
            if (thePlayer) {
                thePlayer.removeListener('pushChange-set3d', playerOnPush3d)
                thePlayer.removeListener('pushChange-jump', playerOnPush3d)
                thePlayer.removeListener('pushChange-setMoving', playerOnPush3d)
            }
            thePlayer = player; 
            thePlayer.on('pushChange-set3d', playerOnPush3d)
            thePlayer.on('pushChange-jump', playerOnPush3d)
            thePlayer.on('pushChange-setMoving', playerOnPush3d)
        }
        if (player && (+new Date() - lastPush) > 1000) {
            player.push3d()
        }
        setTimeout(push, 600)
    }

    push()

    stream.on('end',   stopPushing)
    stream.on('error', stopPushing)
    stream.on('close', stopPushing)

    function stopPushing() { stop = true }
}
