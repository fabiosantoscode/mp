'use strict'

var inherit = require('util').inherits
var mp = require('./mp')
var images = require('./images')
var assert = require('assert')
var makeDeathmatch = require('./deathmatch.js')

var vec = mp.vec

module.exports = function capturePoint({ mp }) {
    mp = makeDeathmatch({
        mp: mp
    })

    var Entity = mp.Entity
    var entities = mp.entities

    function Point() {
        Entity.apply(this, arguments)
        this.solid = true
        this.size = { x: 30, y: 30 }
        this.life = 1000
    }
    inherit(Point, Entity)
    mp.Point = Point

    function Base() {
        Point.apply(this, arguments)
        this.size = { x: 50, y: 50 }
        this.life = 3000
    }
    inherit(Base, Point)
    mp.Base = Base

    // Make the {Red,Blue}{Point,Base} classes.
    function BluePoint() { Point.apply(this, arguments); this.color = 'blue' }
    function BlueBase() { Base.apply(this, arguments); this.color = 'blue' }
    function RedPoint() { Point.apply(this, arguments); this.color = 'red' }
    function RedBase() { Base.apply(this, arguments); this.color = 'red' }
    inherit(BluePoint, Point)
    inherit(BlueBase, Base)
    inherit(RedPoint, Point)
    inherit(RedBase, Base)
    mp.BluePoint = BluePoint
    mp.BlueBase = BlueBase
    mp.RedPoint = RedPoint
    mp.RedBase = RedBase

    var teams = [
        { color: 'red', points: [], basePoint: vec({ x: 0, y: 50}) },
        { color: 'blue', points: [] }
    ]

    mp.worldGen = function ({ range, place }) {
        var [start, end] = range;

        var middle = (start + end) / 2

        var pointsPerTeam = 3

        var adv = ((end - start) / 2) / (pointsPerTeam + 1)

        var [redTeam, blueTeam] = teams

        // Points for the blue team. They play from the left.
        for (var x = start + adv; x < middle; x += adv) {
            var point = place(BluePoint, x);
            //point.color = blueTeam.color
            blueTeam.points.push(point)
        }

        // Points for the red team. They play from the right.
        for (var x = end - adv; x > middle; x -= adv) {
            var point = place(RedPoint, x);
            //point.color = redTeam.color
            redTeam.points.push(point)
        }

        blueTeam.base = place(BlueBase, start)
        redTeam.base = place(RedBase, end)

        blueTeam.base.team = blueTeam
        redTeam.base.team = redTeam
    }

    return mp
}