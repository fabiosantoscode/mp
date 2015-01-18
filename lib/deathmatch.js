
var inherit = require('util').inherits
var mp = require('./mp')

var vec = mp.vec

module.exports = function deathmatch({ mp }) {
    var Entity = mp.Entity
    var Explosion = mp.Explosion
    var entities = mp.entities

    function SmallBlock(center) {
        Entity.apply(this)
        this.size = vec({ x: 10, y: 10 })
        this.center = vec(center || vec.origin)
    }
    inherit(SmallBlock, Entity)

    function LargeBlock(center) {
        Entity.apply(this)
        this.size = vec({ x: 60, y: 20 })
        this.center = vec(center || vec.origin)
    }
    inherit(LargeBlock, Entity)

    function Barrel(center) {
        Entity.apply(this)
        this.life = 10
        this.size = vec({ x: 4, y: 9 })
        this.center = vec(center || vec.origin)
        this.color = 'red'
    }
    inherit(Barrel, Entity)

    Barrel.prototype.die = function () {
        var ex = new Explosion()
        ex.center = vec(this.center)
        mp.entities.push(ex)
        Entity.prototype.die.apply(this, arguments)
    }

    function LightPost(center) {
        Entity.apply(this)
        this.size = vec({ x: 4, y: 9 })
        this.center = vec(center || vec.origin)
        this.color = 'blue'
    }
    inherit(LightPost, Entity)

    mp.SmallBlock = SmallBlock
    mp.LargeBlock = LargeBlock
    mp.Barrel = Barrel
    mp.LightPost = LightPost
    
    return mp
}