'use strict'

var stream = require('stream')
var assert = require('assert')

var LEFT = 37
var RIGHT = 39
var JUMP = 38
var SHOOT = 32



module.exports = function makeBotSocket({ mp }) {
    // from TOWARDS pixels or less of distance, bots will not go any closer
    var TOWARDS = 5 + (10 * Math.random())

    var bot = new stream.Duplex({ encoding: 'utf-8', highWaterMark: 0 });

    bot._write = function (chunk, enc, cb) {
        if (destroyed) { return cb(); }

        var splatChunks = chunk.toString('utf-8').split('\n').map((chunk) => {
            try {
                return JSON.parse(chunk)
            } catch(e) { }
        })
        .filter(ch => {
            return ch && ch[0] === 'you'
        })
        .map((chnk) => {
            var id = chnk[2] && chnk[2].x[0]
            return mp.entityById(id)
        })
        .filter(ent => !!ent)
        .slice(0, 1)
        .forEach((ent)  => {
            bot.push('["keyup", ' + SHOOT + ']\n')
            bot.push('["keyup", ' + LEFT + ']\n')
            bot.push('["keyup", ' + RIGHT + ']\n')
            me = ent
            if (currentState !== 'ADVANCE')
                return m('ADVANCE')
        })

        cb();  // Do nothing with anything, we just want to be compatible with the other sockets, and read info directly from mp
    }

    var me

    var writing = false
    bot._read = function (size) {
        if (writing) { return; }
        writing = true

        mp.setTimeout(function() {
            if (currentState !== 'ADVANCE')
                m('ADVANCE')
        }, (5000 * Math.random()) + 1000)
    }

    var heading = function () {
        return me.team.color === 'blue' ? 1 : -1
    }

    var threat = false
    var goingForth = false

    var interv = mp.setInterval(function () {
        if (!writing || !me) { console.log(writing?'no me':'not writing'); return; }

        if (currentState) {
            tickIntelligence(currentState)
        }
    }, 500)

    var headbuttState

    function solidsAhead() {
        return mp.entities.collidingWith({
            center: {
                x: me.center.x + ((me.facingRight ? 1 : -1) * Math.max(me.size.x, 5)),
                y: me.center.y - 2
            },
            size: {
                x: me.size.x * 2, // Look a bit ahead
                y: me.size.y - 4  // No need to jump over small steps
            }
        }, { solid: true })[0]
    }

    function threatsAhead() {
        return mp.entities.collidingWith({
            center: me.center,
            size: { x: 50, y: 50 }
        }).filter(ent => ent.team && ent.team !== me.team)
    }

    function solidsAbove() {
        return mp.entities.collidingWith({
            center: { x: me.center.x, y: me.center.y - me.size.y },
            size: { x: me.size.x - 1, y: me.size.y / 2 }
        }, { solid: true })[0]
    }

    function getSightsBox(facing) {
        if (facing == undefined) facing = me.facingRight ? 1 : -1
        var box = {
            center: {
                x: me.center.x + (facing * 30),
                y: me.center.y,
            },
            size: {
                x: 30,
                y: me.size.y
            }
        }
        if (me.getCurrentWeapon().bullet.displayName === 'BAZOOKA') {
            box.center.x = me.center.x + (facing * 90),
            box.size.x *= 3
        }
        return box;
    }

    function isUnderSights(facing) {
        return !!enemy && !enemy.dead && enemy.collide(getSightsBox(facing))
    }

    function otherThreatUnderSights() {
        return threatsAhead().filter(threat => threat !== !!enemy)[0]
    }

    function tickIntelligence(state) {
        if (state === 'ADVANCE') {
            bot.push('["keydown", '
                + ((heading() === -1) ? LEFT : RIGHT) + ']\n')

            if (me.grounded) {
                if (solidsAhead() && me.grounded()) {
                    if (solidsAbove()) {
                        return m('NOHEADBUTT')
                    } else {
                        bot.push('["keydown", ' + JUMP + ']\n')
                    }
                    return
                }
            }

            bot.push('["keyup", ' + SHOOT + ']\n')

            var threats = threatsAhead()
            if (threats.length) {
                bot.push('["keyup", ' + LEFT +']\n')
                bot.push('["keyup", ' + RIGHT +']\n')
                enemy = threats[
                    Math.floor(Math.random() * threatsAhead.length)]
                return m('KILL')
            }
        } else if (state === 'NOHEADBUTT') {
            if (!headbuttState) {
                headbuttState = {
                    solid: solidsAbove(),
                    target: {
                        x: me.center.x + ((heading() * -1) * ((20 * Math.random()) + 4)),
                        y: me.center.y 
                    },
                    initialX: me.center.x,
                    stage: 0
                }
            }

            if (headbuttState.stage === 0) {
                if (
                        // Nearing target
                        Math.abs(headbuttState.target.x - me.center.x) < 12 ||
                        // Found obstacle while trying to get to target
                        (Math.abs(headbuttState.initialX - me.center.x) > 5 && me.bumpingIntoSolid())) {
                    bot.push('["keydown", ' + (heading() === 1 ? RIGHT : LEFT) + ']\n')
                    headbuttState.stage++
                }

                if (me.center.x < headbuttState.target.x) {
                    bot.push('["keydown", ' + RIGHT + ']\n')
                } else if (me.center.x > headbuttState.target.x) {
                    bot.push('["keydown", ' + LEFT + ']\n')
                }

                setTimeout(function jump() {
                    if (me.grounded()) {
                        headbuttState = null  // reset state
                        bot.push('["keydown", ' + JUMP + ']\n')
                        if (currentState !== 'ADVANCE')
                            return m('ADVANCE')
                    } else {
                        setTimeout(jump, 100)
                    }
                }, 100)
            }
        } else if (state === 'KILL') {
            if (!enemy || enemy.dead) {
                enemy = null
                return m('ADVANCE')
            }
            if (isUnderSights()) {
                bot.push('["keydown", '
                    + SHOOT + ']\n')
            } else {
                bot.push('["keyup", ' + SHOOT + ']\n')
                return m('FOLLOW')
            }
        } else if (state === 'FOLLOW') {
            if (enemy.dead) {
                enemy = null
                return m('ADVANCE')
            }
            var targetPosition = enemy.center

            var goTowards = Math.abs(enemy.center.x - me.center.x) > TOWARDS;

            if (Math.random() > 0.94) {
                bot.push('["keydown", ' + SHOOT + ']\n')
            } else {
                bot.push('["keyup", ' + SHOOT + ']\n')
            }

            if (targetPosition.x > me.center.x) {
                bot.push('["keydown", ' + (goTowards ? RIGHT : LEFT) + ']\n')
            } else {
                bot.push('["keydown", ' + (goTowards ? LEFT : RIGHT) + ']\n')
            }

            if ((solidsAhead() || targetPosition.y < me.center.y) && me.grounded()) {
                bot.push('["keydown", ' + JUMP + ']\n')
            }

            if (Math.random() > 0.3 && isUnderSights()) {
                return m('KILL')
            }
            var otherThreat
            if (Math.random() > 0.3 && (otherThreat = otherThreatUnderSights())) {
                enemy = otherThreat
                return m('KILL')
            }
        } else {
            assert(false, 'I just don\'t know what to do with myself!')
        }
    }

    var currentState = 'ADVANCE'
    var enemy

    function m(state){currentState = state}

    var destroyed = false
    bot.destroy = function() {
        destroyed = true
        mp.clearInterval(interv)
        bot.push(null)
    }

    bot.resume()

    return bot
}

