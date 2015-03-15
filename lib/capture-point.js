'use strict'

var inherit = require('util').inherits
var mp = require('./mp')
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

            var quad = new mp.QuadCopter(this)
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
    }

    mp.onNetWorld = function (networld) {
        networld.on('packet:point-died', () => {
            ;  // Nothing to do here i think
        })
        networld.on('packet:loss', () => {
            ;  // So we lost. Meh.
        })
    }

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
        var red = 0;
        var blue = 0;

        mp.entities.forEach(ent => {
            if (ent instanceof mp.RedPlayer) red++
            if (ent instanceof mp.BluePlayer) blue++
        })

        return [red, blue]
    }

    mp.getPlayerClass = () => {
        var [red, blue] = countTeams()
        var moreRed = red - blue > 0
        var moreBlue = blue - red > 0
        return moreRed ? mp.BluePlayer :
            moreBlue ? mp.RedPlayer :
            Math.random() > 0.5 ? mp.RedPlayer : mp.BluePlayer
    }
    mp.getSpawnPoint = (player) =>
        player.team === red  ? vec({ x: mp.range[1] - (baseWidth / 2), y: 0 }) :
        player.team === blue ? vec({ x: mp.range[0] + (baseWidth / 2), y: 0 }) :
                               assert(false, 'unknown team ' + player.team)

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
