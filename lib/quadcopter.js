'use strict'

var assert = require('assert')
var util = require('util')
var images = require('./images')
var vec = require('./mp').vec

module.exports = function makeQuadCopterClass({ mp }) {
    function QuadCopter(ownerPoint) {
        mp.Entity.apply(this)
        this.groundless = true  // never grounded
        this.bumpless = true  // never bump into solids
        this.size = vec({ x: 10, y: 10 })
        this.targetY = 15
        this.targetX = null
        this.ySpeed = 10
        delete this.weight //this.weight = 0.02
        this.image = images.quadcopterRed
        this.color = 'red'
        this.life = 4
        if (ownerPoint) {
            this.owner = ownerPoint
            this.center = vec({ x: ownerPoint.center.x, y: 50 })
            this.direction = vec.origin
        }

        this._moving = vec.origin

        this.aiTicks = 12
    }

    util.inherits(QuadCopter, mp.Entity)

    Object.defineProperty(QuadCopter.prototype, 'owner', {
        get: function () { return this._owner },
        set: function (own) {
            assert(!this._owner || own === this._owner, 'setting the owner of a quadcopter more than once!')

            if (this._owner === own) { return; }
            this._owner = own

            if (mp.isServer) {
                own.on('damage', this._onOwnerDamage = ({ dealer }) => {
                    if (dealer && dealer.playerId) {
                        // Aggro! Y U NO ATTACK SOMETHING ELSE
                        this.target = dealer
                        this.pushChange('setTarget', dealer.id)
                        this.push3d
                    }
                })
            }
        }
    })

    QuadCopter.prototype.update = function () {
        mp.Entity.prototype.update.apply(this, arguments)
        this.aiTicks--
        if (this.aiTicks === 0) {
            this.maybeShoot()
        }
        if (this.aiTicks > 0) { return; }
        this.aiTicks = 12

        if (this.center.y > this.targetY) {
            // Go up
            this._moving = { x: 0, y: -this.ySpeed }
        } else {
            this._moving = { x: 0, y: this.ySpeed }
        }

        if (this.owner && this.owner.dead) {
            this.explode()
            this.die()
            return
        }

        if (this.owner && !this.target) {
            if (this.center.x < this.owner.left) {
                this._moving = { x: this.speed, y: this._moving.y }
            } else if (this.center.x > this.owner.right) {
                this._moving = { x: -this.speed, y: this._moving.y }
            } else {
                this._moving = {
                    x: /* TODO make deterministic
                        */Math.random() > 0.5 ? this.speed : -this.speed,
                    y: this._moving.y
                }
            }
        } else if (this.target) {
            this.moving = {
                x: (this.center.x > this.target.center.x) ? -this.speed : this.speed,
                y: this.moving.y
            }
        }
    }

    QuadCopter.prototype.die = function() {
        mp.Entity.prototype.die.apply(this, arguments);
        if (this._onOwnerDamage && this.owner) {
            this.owner.removeListener('damage', this._onOwnerDamage)
        }
    }

    QuadCopter.prototype.serialize = function () {
        var ret = mp.Entity.prototype.serialize.apply(this, arguments)
        if (this.owner) {
            ret.owner = this.owner.id
        }
        if (this.target) {
            ret.target = this.target.id
        }
        return ret
    }

    QuadCopter.prototype.remoteUpdate = function (packet) {
        mp.Entity.prototype.remoteUpdate.apply(this, arguments);
        if (packet.owner) {
            this.owner = mp.entities.byId(packet.owner)
        }
        if (packet.target) {
            this.target = mp.entities.byId(packet.target)
        }
    }

    QuadCopter.prototype.setTarget = function (targetId) {
        this.target = mp.entities.byId(targetId)
    }

    var VIEW_WIDTH = 70
    var VIEW_HEIGHT = 70

    QuadCopter.prototype.maybeShoot = function() {
        if (!mp.isServer) { return; }

        if (this.target) {
            if (this.target.dead) { this.target = null; this.pushChange('setTarget', -1); return; }
            if (Math.abs(this.center.x - this.target.center.x) < 40) {
                var bullet = new mp.MortarBullet(vec({ x: this.center.x, y: this.bottom}), this)
                bullet.direction = vec({
                    x: 0,
                    y: 0
                })
                bullet.team = this.team
                mp.entities.push(bullet)
                return;
            }
        } else {
            // What lies ahead of me?
            var centerOf = this.owner || this
            var targets = mp.entities.collidingWith({
                center: {
                    x: centerOf.center.x,
                    y: centerOf.center.y,
                },
                size: {
                    x: VIEW_WIDTH,
                    y: VIEW_HEIGHT
                }
            }, {
                'team': this.team.rival
            })

            if (targets.length) {
                var toKill = targets[
                    Math.floor(Math.random() * targets.length)]

                this.target = toKill
                this.pushChange('setTarget', toKill.id);
                this.push3d()  // Force to sync my location
            }
        }
    }

    return QuadCopter
}

