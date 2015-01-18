'use strict';

function Camera(offset, player) {
    this.offset = offset
    this.player = player
}

Camera.prototype.update = function (extrapolated) {
    if (this.player === undefined) { return; }
    var playerx = this.player.extrapolated(extrapolated).x
    this.offset = Object.freeze({
        x: playerx - (100 / 2),
        y: 0
    })
}

module.exports = Camera