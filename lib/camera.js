var mp = require('./mp.js')

function Camera(offset, player) {
    this.offset = offset
    this.player = player
}

Camera.prototype.update = function () {
    this.offset.x = this.player.center.x - (width / 2)
}

module.exports = Camera