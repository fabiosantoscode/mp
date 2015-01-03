
function Camera(offset, player) {
    this.offset = offset
    this.player = player
}

Camera.prototype.update = function (extrapolated) {
    if (this.player === undefined) { return; }
    var playerx = this.player.extrapolated(extrapolated).x
    this.offset.x = playerx - (100 / 2)
}

module.exports = Camera
