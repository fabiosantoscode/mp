'use strict';

function Camera(offset, player) {
    this.offset = offset ?
        (Object.isFrozen(offset) ? { x: offset.x, y: offset.y } : offset) :
        offset
    this.player = player
    this.range = undefined
}

var halfViewport = (100 / 2)

Camera.prototype.update = function (extrapolated) {
    if (this.player === undefined || this.player.dead === true) { return; }
    var playerx = this.player.extrapolatedX(extrapolated)

    if (this.player.smoothServerNudge) {
        var dt = +new Date()
        if (dt > this.player.smoothServerNudge.start + this.player.smoothServerNudge.duration) {
            this.player.smoothServerNudge = null
        } else {
            var currentAmount =
                (dt - this.player.smoothServerNudge.start) /
                this.player.smoothServerNudge.duration

            currentAmount = 1 - currentAmount

            var ix = Math.floor(this.player.smoothServerNudge.x * currentAmount)

            playerx -= ix
        }
    }

    if (this.range) {
        if (playerx + halfViewport > this.range[1]) { playerx = this.range[1] - halfViewport }
        if (playerx - halfViewport < this.range[0]) { playerx = this.range[0] + halfViewport }
    }

    this.setOffset(Math.floor(playerx - halfViewport))
}

Camera.prototype.setOffset = function (x, y) {
    if (!this.offset || Object.isFrozen(this.offset)) this.offset = { x: x, y: y || 0 }
    this.offset.x = x
    this.offset.y = y || 0
}

module.exports = Camera
