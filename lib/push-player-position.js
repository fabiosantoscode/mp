
module.exports = function (player, stream) {
    player.push3d()
    var interval = setInterval(function () {
        player.push3d()
    }, 400)

    stream.on('end', function () { clearInterval(interval) })
    stream.on('error', function () { clearInterval(interval) })
}
