
module.exports = function (player, stream) {
    var stop = false

    function push() {
        if (stop) return;
        player.push3d()
        setTimeout(push, 600)
    }

    push()

    stream.on('end',   stopPushing)
    stream.on('error', stopPushing)
    stream.on('close', stopPushing)

    function stopPushing() { stop = true }
}
