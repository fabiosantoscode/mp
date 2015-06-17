'use strict'

var inherit = require('util').inherits
var mp = require('./mp')
var notice = require('./notices')
var makeQuadCopterClass = require('./quadcopter')
var images = require('./images')
var assert = require('assert')
var makeDeathmatch = require('./deathmatch.js')

var vec = mp.vec

module.exports = function capturePoint({ mp }) {
    mp = makeDeathmatch({
        mp: mp
    })

    var baseWidth = 50

    var Entity = mp.Entity
    var entities = mp.entities

    function Point() {
        Entity.apply(this, arguments)
        this.solid = true
        this.size = { x: 30, y: 30 }
        this.color = this.team.color
        this.life = 200
        this.maxQuadCopters = 1
        this.lastQuadCopter = null
        this.quadCopters = []
    }
    inherit(Point, Entity)
    mp.Point = Point

    Point.prototype.update = function () {
        Entity.prototype.update.apply(this, arguments)
        if (!mp.isServer) return;

        if (this.lastQuadCopter == null || +new Date() - this.lastQuadCopter > 4000) {
            this.lastQuadCopter = +new Date()

            this.quadCopters = this.quadCopters.filter(q => !q.dead)

            if (this.maxQuadCopters &&
                this.quadCopters.length >= this.maxQuadCopters) { return }

            var quad

            if (this instanceof mp.Base) {
                quad = this.team === red?
                    new mp.BigRedQuadCopter(this) :
                    new mp.BigBlueQuadCopter(this)
            } else {
                quad = this.team === red ?
                    new mp.RedQuadCopter(this) :
                    new mp.BlueQuadCopter(this)
            }

            mp.entities.push(quad)
            this.quadCopters.push(quad)
        }
    }

    function Base() {
        Point.apply(this, arguments)
        this.maxQuadCopters = 3
        this.size = { x: baseWidth, y: baseWidth }
        this.life = 500
    }
    inherit(Base, Point)
    mp.Base = Base

    var teams = [
        { color: 'red', points: [], base: null },
        { color: 'blue', points: [], base: null }
    ]

    mp.teams = teams

    var [red, blue] = teams
    red.rival = blue
    blue.rival = red

    // Make the {Red,Blue}{Point,Base} classes.
    function BluePoint() {
        this.image = images.pointBlue
        blue.points.push(this); this.team = blue; Point.apply(this, arguments); }
    function BlueBase() {
        this.image = images.baseBlue
        blue.base = this; this.team = blue; Base.apply(this, arguments); }
    function RedPoint() {
        this.image = images.pointRed
        red.points.push(this); this.team = red; Point.apply(this, arguments); }
    function RedBase() {
        this.image = images.baseRed
        red.base = this; this.team = red; Base.apply(this, arguments); }
    inherit(BluePoint, Point)
    inherit(BlueBase, Base)
    inherit(RedPoint, Point)
    inherit(RedBase, Base)
    mp.BluePoint = BluePoint
    mp.BlueBase = BlueBase
    mp.RedPoint = RedPoint
    mp.RedBase = RedBase


    mp.QuadCopter = makeQuadCopterClass({ mp })

    mp.BlueQuadCopter = function BlueQuadCopter() {
        mp.QuadCopter.apply(this, arguments)
        this.image = images.quadcopterBlue
        this.team = blue
    }
    inherit(mp.BlueQuadCopter, mp.QuadCopter)
    mp.RedQuadCopter = function RedQuadCopter() {
        mp.QuadCopter.apply(this, arguments)
        this.image = images.quadcopterRed
        this.color = 'red'
        this.team = red
    }
    inherit(mp.RedQuadCopter, mp.QuadCopter)

    mp.BigBlueQuadCopter = function BigBlueQuadCopter() {
        mp.BlueQuadCopter.apply(this, arguments)
        this.life = 50
        this.size = vec({ x: 20, y: 20 })
        this.image = images.bigQuadcopterBlue
        this.color = 'blue'
    }
    inherit(mp.BigBlueQuadCopter, mp.BlueQuadCopter)
    mp.BigRedQuadCopter = function BigRedQuadCopter() {
        mp.RedQuadCopter.apply(this, arguments)
        this.life = 50
        this.size = vec({ x: 20, y: 20 })
        this.image = images.bigQuadcopterRed
    }
    inherit(mp.BigRedQuadCopter, mp.RedQuadCopter)

    // When a point dies
    Point.prototype.die = function () {
        Entity.prototype.die.apply(this)
        assert(mp.isServer)
        this.team.points = this.team.points.filter(p => p !== this)
        mp.pushGlobalChange('point-died', this.team.color)
    }
    Base.prototype.die = function () {
        Entity.prototype.die.apply(this)
        assert(mp.isServer)
        this.team.base = null
        mp.pushGlobalChange('loss', this.team.color)

        mp.Entity.prototype.damage = () => null
        mp.setTimeout(() => {
            notice('starting new round')
            if (mp.askForNewRound) mp.askForNewRound()
        }, 10000)
    }

    mp.on('networld', function (networld) {
        var playerCol = () => mp.localPlayer && mp.localPlayer.team && mp.localPlayer.team.color
        networld.on('packet:point-died', (opArgs) => {
            var color = opArgs[0]
            notice('a ' + color + ' point died!', { isGood: color !== playerCol() })
        })
        networld.on('packet:loss', (opArgs) => {
            var color = opArgs[0]
            notice(color + ' team lost the game!', { isGood: color !== playerCol() })

            mp.Entity.prototype.damage = () => null
            mp.setTimeout(() => {
                notice('starting new round')
                if (mp.askForNewRound) mp.askForNewRound()
            }, 10000)
        })
    })

    // Make the {Red,Blue}Player classes.
    mp.RedPlayer = function RedPlayer() {
        mp.HumanPlayer.apply(this, arguments);
        this.team = red;
        this.image = images.stickmanRed;
        this.facingRight = false;
    }
    mp.BluePlayer = function BluePlayer() {
        mp.HumanPlayer.apply(this, arguments);
        this.team = blue;
        this.image = images.stickmanBlue;
        this.facingRight = true;
    }
    inherit(mp.RedPlayer, mp.HumanPlayer)
    inherit(mp.BluePlayer, mp.HumanPlayer)

    var countTeams = () => {
        // TODO do not count entities, count actual players instead
        var red = 0;
        var blue = 0;

        mp.entities.forEach(ent => {
            if (ent instanceof mp.RedPlayer) red++
            if (ent instanceof mp.BluePlayer) blue++
        })

        return [red, blue]
    }

    mp.bgImage = {
        image: images.bg,
        height: 100,
        width: 400
    }

    mp.getPlayerClass = () => {
        var [red, blue] = countTeams()
        var moreRed = red - blue > 0
        var moreBlue = blue - red > 0
        return moreRed ? mp.BluePlayer :
            moreBlue ? mp.RedPlayer :
            Math.random() > 0.5 ? mp.RedPlayer : mp.BluePlayer
    }

    var spawnPointAbove = (ent) => {
        return vec({
            x: ent.center.x,
            y: 0
        })
    }
    mp.getSpawnPoint = (player) => {
        var team = player.team

        var availablePoints = team.points.filter(point => !point.dead)

        if (availablePoints.length) {
            var randomPoint = availablePoints[
                Math.floor(Math.random() * availablePoints.length)]
            return spawnPointAbove(randomPoint)
        }

        if (!team.base.dead) {
            return spawnPointAbove(team.base)
        }

        // Otherwise, just spawn where the base was
        player.team === red  ? vec({ x: mp.range[1] - (baseWidth / 2), y: 0 }) :
        player.team === blue ? vec({ x: mp.range[0] + (baseWidth / 2), y: 0 }) :
                               assert(false, 'unknown team ' + player.team)
    }

    mp.damageFilter = ({ amount, dealer, damaged }) => {
        if (('team' in damaged) && ('team' in dealer) && damaged.team === dealer.team) {
            return null
        }
        return { amount, dealer, damaged }
    }

    mp.bulletExplodeFilter = ({ owner, damaged }) => {
        return (('team' in damaged) && (owner && ('team' in owner))) ?
            damaged.team !== owner.team :
            true
    }

    mp.playerDead = (player, respawn) => {
        mp.setTimeout(function () {
            var [redCount, blueCount] = countTeams()
            var imbalance = Math.abs(redCount - blueCount)
            if (imbalance <= 1) {
                // Respawn with a player of the same team
                respawn(player.team === red ?
                    new mp.RedPlayer() :
                    new mp.BluePlayer())
            } else {
                respawn(/* a player of a random team */)
            }
        }, 1000)
    }

    mp.worldGen = function ({ range, place, statics }) {
        if (statics) { return; }  // The bases aren't static
        var [start, end] = range;

        var middle = (start + end) / 2

        var pointsPerTeam = 3

        var adv = ((end - start) / 2) / (pointsPerTeam + 1)

        var [redTeam, blueTeam] = teams

        // Points for the blue team. They play from the left.
        for (var x = start + adv; x < middle; x += adv) {
            var point = place(BluePoint, x);
            blueTeam.points.push(point)
        }

        // Points for the red team. They play from the right.
        for (var x = end - adv; x > middle; x -= adv) {
            var point = place(RedPoint, x);
            redTeam.points.push(point)
        }

        blueTeam.base = place(BlueBase, start + (baseWidth / 2))
        redTeam.base = place(RedBase, end - (baseWidth / 2))

        blueTeam.base.team = blueTeam
        redTeam.base.team = redTeam
    }

    return mp
}
