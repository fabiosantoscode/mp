'use strict'

var stream = require('stream')
var assert = require('assert')
var fsm = require('fsm-event')

var LEFT = 37
var RIGHT = 39
var JUMP = 38
var SHOOT = 32



module.exports = function makeBotSocket({ mp }) {
    // from TOWARDS pixels or less of distance, bots will not go any closer
    var TOWARDS = 5 + (10 * Math.random())

    var bot = new stream.Duplex();

    bot._write = function (chunk, enc, cb) {
        var splatChunks = chunk.toString('utf-8').split('\n').map((chunk) => {
            try {
                return JSON.parse(chunk)
            } catch(e) { }
        })
        .filter(ch => {
            return ch && ch[0] === 'you'
        })
        .map((chnk) => {
            var id= chnk[2] && chnk[2].id
            assert(id, 'no ID in "you" packet')
            return mp.entityById(id)
        })
        .filter(ent => !!ent)
        .forEach((ent)  => {
            me = ent
        })

        cb();  // Do nothing with anything, we just want to be compatible with the other sockets, and read info directly from mp
    }

    var me

    var writing = true
    bot._read = function (size) {
        var self = this
        setTimeout(function () {
            //self.push(new Buffer('["keydown", '+JUMP+']\n'))
        }, 500) 
    }

    var heading = function () {
        return me.team.color === 'blue' ? 1 : -1
    }

    var threat = false
    var goingForth = false

    var interv = mp.setInterval(function () {
        if (!writing || !me) { return; }

        if (currentState) {
            tickIntelligence(currentState)
        }
    }, 100)

    var headbuttState

    function solidsAhead() {
        return mp.entities.collidingWith({
            center: {
                x: me.center.x + (heading() * Math.max(me.size.x, 5)),
                y: me.center.y
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

    function canBlowBarrel() {
        if (me.getCurrentWeapon().bullet.displayName === 'BODY SLAM') {
            return false }
        var back = heading() * -1
        return mp.entities.collidingWith({
            center: {
                x: me.center.x + (back * 20),
                y: me.center.y
            },
            size: { x: 20, y: 20 }
        }, { 'instanceof': mp.Barrel }).length
    }

    function isUnderSights() {
        return !!enemy && !enemy.dead && enemy.collide(getSightsBox())
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
                    bot.push('["keydown", ' + JUMP + ']\n')
                    if (solidsAbove()) {
                        return m('NOHEADBUTT')
                    }
                    return
                }
            }

            if (canBlowBarrel()) {
                bot.push('["keydown", ' + (heading() === -1 ? RIGHT : LEFT) + ']\n')
                bot.push('["keydown", ' + SHOOT + ']\n')
            } else {
                bot.push('["keyup", ' + SHOOT + ']\n')
            }

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
                        x: me.center.x + ((heading() * -1) * (40 * Math.random())),
                        y: me.center.y 
                    },
                    stage: 0
                }
            }

            if (headbuttState.stage === 0) {
                if (Math.abs(headbuttState.target.x - me.center.x) < 12) {
                    bot.push('["keydown", ' + (heading() === 1 ? RIGHT : LEFT) + ']\n')
                    bot.push('["keydown", ' + JUMP + ']\n')
                    headbuttState.stage++
                }

                if (me.center.x < headbuttState.target.x) {
                    bot.push('["keydown", ' + RIGHT + ']\n')
                } else if (me.center.x > headbuttState.target.x) {
                    bot.push('["keydown", ' + LEFT + ']\n')
                }
            } else if (headbuttState.stage === 1) {
                if (me.grounded()) {
                    headbuttState = null  // reset state
                    return m('ADVANCE')
                }
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

            if (targetPosition.y > me.center.y && me.grounded || me.bumpingIntoSolid()) {
                bot.push('["keydown", ' + JUMP + ']\n')
            }
            if (Math.random() > 0.8 && isUnderSights()) {
                return m('KILL')
            }
            var otherThreat
            if (Math.random() > 0.8 && (otherThreat = otherThreatUnderSights())) {
                enemy = otherThreat
                return m('KILL')
            }
        } else {
            assert(false, 'I just don\'t know what to do with myself!')
        }
    }

    var m = fsm({
        ADVANCE: {
            enemy: 'KILL',
            headbutting: 'NOHEADBUTT'
        },
        NOHEADBUTT: {
            okcool: 'ADVANCE'
        },
        KILL: {
            noenemy: 'ADVANCE',
            lost: 'FOLLOW'
        },
        FOLLOW: {
            found: 'KILL',
            noenemy: 'ADVANCE'
        }
    })

    var currentState
    var enemy

    m.on('ADVANCE',
        () => { currentState = 'ADVANCE' })
    m.on('NOHEADBUTT',
        () => { currentState = 'NOHEADBUTT' })
    m.on('KILL',
        () => { currentState = 'KILL' })
    m.on('FOLLOW',
        () => { currentState = 'FOLLOW' })

    mp.setTimeout(function() {
        m('ADVANCE')
    }, (5000 * Math.random()) + 1000)

    bot.destroy = function() {
        // TODO mp.clearInterval(interv)
        // bot.push(null)
    }

    bot.resume()

    return bot
}

