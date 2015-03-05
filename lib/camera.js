'use strict';

function Camera(offset, player) {
    this.offset = offset
    this.player = player
    this.range = undefined
}

var halfViewport = (100 / 2)

Camera.prototype.update = function (extrapolated) {
    if (this.player === undefined || this.player.dead === true) { return; }
    var playerx = this.player.extrapolated(extrapolated).x

    if (this.range) {
        if (playerx + halfViewport > this.range[1]) { playerx = this.range[1] - halfViewport }
        if (playerx - halfViewport < this.range[0]) { playerx = this.range[0] + halfViewport }
    }
    this.offset = Object.freeze({
        x: Math.floor(playerx - halfViewport),
        y: 0
    })
}

module.exports = Camera
