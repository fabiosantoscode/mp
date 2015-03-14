
module.exports = function (getPlayer, stream) {
    var stop = false

    function push() {
        if (stop) return;
        var player = typeof getPlayer == 'function' ? getPlayer() : getPlayer
        if (player) {
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
