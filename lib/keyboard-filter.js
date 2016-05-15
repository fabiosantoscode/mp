'use strict'

var ok = require('assert')

var LEFT = 37
var RIGHT = 39
var JUMP = 38
var SHOOT = 32

// This will filter keyboard messages which are unnecessary.
// For example, a stopJump won't be sent if the player is already descending,
// a tryJump won't be sent when a player is already in the air,
module.exports = function (player, data) {
    if (player == null) { return false; /* no player, no keyboard */ }

    if (player.dead) return false

    ok.equal(data.length, 2, 'keyboardFilter() expects a stream of pairs!')

    var [type, key] = data

    var isDown = type === 'keydown'
    var isUp = !isDown

    if (key === JUMP && isUp) {
        // StopJumping
        if (player.direction.y >= 0) return false  // Cant stop jump if already stopjumping
        if (player.stopJumped) return false
    }

    if (key === JUMP && isDown) {
        if (!player.grounded()) return false
    }

    return true
}

