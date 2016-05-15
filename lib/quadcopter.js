'use strict'

var assert = require('assert')
var util = require('util')
var images = require('./images')
var vec = require('./mp').vec

module.exports = function makeQuadCopterClass({ mp }) {
    function QuadCopter(ownerPoint) {
        mp.Entity.apply(this)
        this.center = vec.origin
        this.targetY = 15
        this.targetX = null
        this.life = 4
        this._owner = null
        if (ownerPoint) {
            this.owner = ownerPoint
        }

        this._moving = { x: 0, y: 0 }

        this.aiTicks = Math.floor(Math.random() * 12) + 12

        this.target = null
        this._oldTarget = null
        this.smoothServerNudge = null
        this._onOwnerDamage = QuadCopter.prototype._onOwnerDamage.bind(this)
    }

    util.inherits(QuadCopter, mp.Entity)

    QuadCopter.prototype.packetProps = mp.Entity.prototype.packetProps.concat(['owner', 'target'])
    QuadCopter.prototype.packetPropTypes = mp.Entity.prototype.packetPropTypes.concat(['entity', 'entity'])
    QuadCopter.prototype.groundless = true  // never grounded
    QuadCopter.prototype.bumpless = true  // never bump into solids
    QuadCopter.prototype.size = vec({ x: 10, y: 10 })
    QuadCopter.prototype.ySpeed = 10
    QuadCopter.prototype.image = images.quadcopterRed
    QuadCopter.prototype.color = 'red'

    Object.defineProperty(QuadCopter.prototype, 'owner', {
        get: function () { return this._owner },
        set: function (own) {
            assert(!this._owner || own === this._owner, 'setting the owner of a quadcopter more than once!')

            if (this._owner === own) { return; }
            this._owner = own
            this.center = vec({ x: own.center.x, y: 50 })
            this.direction = vec.origin

            if (mp.isServer) {
                this._onOwnerDamage = (ev) => {
                    QuadCopter.prototype._onOwnerDamage.call(this, ev)
                }
                own.on('damage', this._onOwnerDamage)
            }
        }
    })

    QuadCopter.prototype.destroy = function () {
        mp.Entity.prototype.destroy.apply(this, arguments)
        if (this._owner) {
            this._owner.removeListener('damage', this._onOwnerDamage)
        }
        this._owner = null
    }

    QuadCopter.prototype._onOwnerDamage = function (event) {
        if (event.dealer && event.dealer.playerId) {
            // Aggro! Y U NO ATTACK SOMETHING ELSE
            this.target = event.dealer
            this.pushChange('setTarget', [ event.dealer.id ])
            this.push3d()
        }
    }

    QuadCopter.prototype.update = function () {
        mp.Entity.prototype.update.apply(this, arguments)
        this.aiTicks--
        if (this.aiTicks === 0) {
            this.maybeShoot()
        }
        if (this.aiTicks > 0) { return; }
        this.aiTicks = 18

        if (!this._moving || Object.isFrozen(this._moving))
            this._moving = { x: 0, y: 0 }
        this._moving.x = 0
        this._moving.y =
            (this.center.y > this.targetY ? -1 : 1) * this.ySpeed

        if (this.owner && this.owner.dead) {
            this.explode()
            this.die()
            return
        }

        if (this.owner && !this.target) {
            if (this.center.x < this.owner.left) {
                this._moving.x = this.speed
            } else if (this.center.x > this.owner.right) {
                this._moving.x = -this.speed
            } else {
                this._moving.x = Math.random() > 0.5 ? this.speed : -this.speed
            }
        } else if (this.target) {
            // This one pushes a change
            this.setMoving(
                (this.center.x > this.target.center.x) ? -this.speed : this.speed,
                this._moving.y
            )
        }
    }

    QuadCopter.prototype.die = function() {
        mp.Entity.prototype.die.apply(this, arguments);
        if (this._onOwnerDamage && this.owner) {
            this.owner.removeListener('damage', this._onOwnerDamage)
        }
    }

    QuadCopter.prototype.setTarget = function (targetId) {
        this._oldTarget = this.target
        this.target = mp.entities.byId(targetId)
    }

    QuadCopter.prototype.set3d = function (x, y) {
        // When there's a set3d after a new target comes, the server
        // and the client are currently disagreeing about where the
        // quadcopter is (the client has been animating the quadcopter
        // at random). So we use a smoothServerNudge to visually and
        // slowly move the quadcopter where the server thinks it is.
        // This avoids a single-frame jank from peaceful mode to
        // follow-target mode and replaces it with a smooth interpolation
        // between the two.
        if (this.target && this.target !== this._oldTarget) {
            this.smoothServerNudge = {
                start: Date.now(),
                duration: 1200,
                x: x - this.center.x,
                y: y - this.center.y
            }
            this._oldTarget = this.target
        }
        mp.Entity.prototype.set3d.apply(this, arguments)
    }

    var VIEW_WIDTH = 70
    var VIEW_HEIGHT = 70

    QuadCopter.prototype.maybeShoot = function() {
        if (!mp.isServer) { return; }

        if (this.target) {
            if (this.target.dead) { this.target = null; this.pushChange('setTarget', [ -1 ]); return; }
            if (Math.abs(this.center.x - this.target.center.x) < 40) {
                var bullet = mp.entities.construct(mp.MortarBullet, vec({ x: this.center.x, y: this.bottom}), this)
                bullet.direction = vec({
                    x: this.direction.x * 0.9,
                    y: this.direction.y * 0.9
                })
                //bullet.team = this.team
                mp.entities.push(bullet)
                return;
            }
        } else {
            // What lies ahead of me?
            var centerOf = this.owner || this
            var targets = mp.entities.collidingWithTeam({
                center: {
                    x: centerOf.center.x,
                    y: centerOf.center.y,
                },
                size: {
                    x: VIEW_WIDTH,
                    y: VIEW_HEIGHT
                }
            }, this.team.rival)

            if (targets.length) {
                var toKill = targets[
                    Math.floor(Math.random() * targets.length)]

                this.target = toKill
                this.pushChange('setTarget', [ toKill.id ]);
                this.push3d()  // Force to sync my location
            }
        }
    }

    return QuadCopter
}

