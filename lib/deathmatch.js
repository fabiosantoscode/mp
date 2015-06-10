'use strict'

var inherit = require('util').inherits
var mp = require('./mp')
var images = require('./images')
var makeRandomDrops = require('./random-drops')

var vec = mp.vec

module.exports = function deathmatch({ mp }) {
    var Entity = mp.Entity
    var entities = mp.entities

    var randomDrops = makeRandomDrops({ mp })

    function SmallBlock(center) {
        Entity.apply(this)
        this.solid = true
        this.static = true
        this.image = images.box
        this.size = vec({ x: 10, y: 10 })
        this.center = vec(center || vec.origin)
    }
    inherit(SmallBlock, Entity)

    function LargeBlock(center) {
        Entity.apply(this)
        this.solid = true
        this.static = true
        this.size = vec({ x: 60, y: 20 })
        this.center = vec(center || vec.origin)
        this.image = images.largeBlock
    }
    inherit(LargeBlock, Entity)

    function Barrel(center) {
        Entity.apply(this)
        this.life = 10
        this.size = vec({ x: 8, y: 12 })
        this.center = vec(center || vec.origin)
        this.image = images.barrel
    }
    inherit(Barrel, Entity)

    Barrel.prototype.die = function () {
        this.explode(null)
        Entity.prototype.die.apply(this, arguments)
    }

    function LightPost(center) {
        Entity.apply(this)
        this.static = true
        this.size = vec({ x: 4, y: 50 })
        this.center = vec(center || vec.origin)
        this.color = 'blue'
    }
    inherit(LightPost, Entity)

    var _destroy = mp.destroy
    mp.destroy = () => {
        _destroy()
        randomDrops.destroy()
    }

    mp.SmallBlock = SmallBlock
    mp.LargeBlock = LargeBlock
    mp.Barrel = Barrel
    mp.LightPost = LightPost

    return mp
}
