'use strict'
var notice = require('./notices.js')

module.exports = ({ mp, player, period }) => {
    var lastDirection = 0
    var interval = setTimeout(function periodicHelpCheck() {
        interval = setTimeout(periodicHelpCheck, period || 5000)
        var teamDirectionName = player.team.direction === 1 ? 'right' : 'left'
        if (!player.moving || !player.moving.x) { return  }
        var newDirection = player.moving.x > 0 ? 1 : -1
        if (newDirection === lastDirection && newDirection !== player.team.direction) {
            notice('You\'re going the wrong way! Go ' + teamDirectionName + '!')
        }
        lastDirection = newDirection
    })
    return {
        destroy: () => {
            clearTimeout(interval)
        }
    }
}
