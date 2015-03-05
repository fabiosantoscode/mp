
module.exports = function (player) {
    player.push3d()
    setInterval(function () {
        player.push3d()
    }, 400)
}
