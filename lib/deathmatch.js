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
        this.center = vec(center || vec.origin)
    }
    inherit(SmallBlock, Entity)
    SmallBlock.prototype.solid = true
    SmallBlock.prototype.static = true
    SmallBlock.prototype.image = images.box
    SmallBlock.prototype.size = vec({ x: 10, y: 10 })

    function LargeBlock(center) {
        Entity.apply(this)
        this.center = vec(center || vec.origin)
    }
    inherit(LargeBlock, Entity)
    LargeBlock.prototype.solid = true
    LargeBlock.prototype.static = true
    LargeBlock.prototype.size = vec({ x: 60, y: 20 })
    LargeBlock.prototype.image = images.largeBlock

    function Barrel(center) {
        Entity.apply(this)
        this.center = vec(center || vec.origin)
        this.life = 10
    }
    inherit(Barrel, Entity)
    Barrel.prototype.size = vec({ x: 8, y: 12 })
    Barrel.prototype.image = images.barrel

    Barrel.prototype.die = function () {
        this.explode(null)
        Entity.prototype.die.apply(this, arguments)
    }

    var _destroy = mp.destroy
    mp.destroy = () => {
        _destroy()
        randomDrops.destroy()
    }

    mp.SmallBlock = SmallBlock
    mp.LargeBlock = LargeBlock
    mp.Barrel = Barrel

    return mp
}
