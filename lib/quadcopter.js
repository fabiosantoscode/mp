
var assert = require('assert')
var util = require('util')
var images = require('./images')
var vec = require('./mp').vec

module.exports = function makeQuadCopterClass({ mp }) {
    function QuadCopter(ownerPoint) {
        mp.Player.apply(this, arguments)
        this.groundless = true  // never grounded
        this.size = vec({ x: 10, y: 10 })
        this.targetY = 10
        this.targetX = null
        this.ySpeed = 10
        delete this.weight //this.weight = 0.02
        this.image = images.quadcopterRed
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

    QuadCopter.prototype.update = function () {
        mp.Entity.prototype.update.apply(this, arguments)
        this.aiTicks--
        if (this.aiTicks === 0) {
            this.maybeShoot()
        }
        if (this.aiTicks > 0) { return; }
        this.aiTicks = 12

        if (!mp.isServer || mp.ctx) {
            if (this.center.y > this.targetY) {
                // Go up
                this._moving = { x: 0, y: -this.ySpeed }
            } else {
                this._moving = { x: 0, y: this.ySpeed }
            }
        }

        if (this.owner && this.right < this.owner.left) {
            this._moving = { x: this.speed, y: this._moving.y }
        } else if (this.owner && this.left > this.owner.right) {
            this._moving = { x: -this.speed, y: this._moving.y }
        } else if (this.owner) {
            this._moving = {
                x: /* TODO make deterministic
                    */Math.random() > 0.5 ? this.speed : -this.speed,
                y: this._moving.y
            }
        }

        if (mp.isServer) {
            if (!mp.ctx &&  // Own server. Don't just snap to final position
                this.center.y !== this.targetY) {
                this.center = vec({ x: this.center.x, y: this.targetY }) }
            if (this.target && !this.target.dead) {
                if (this.right < this.target.center.x) {
                    this.moving = { x: this.speed, y: this.moving.y }
                } else {
                    this.moving = { x: -this.speed, y: this.moving.y }
                }
            }
        }
    }

    QuadCopter.prototype.serialize = function () {
        var ret = mp.Entity.prototype.serialize.apply(this, arguments)
        if (this.owner) {
            ret.owner = this.owner.id
        }
        return ret
    }

    QuadCopter.prototype.remoteUpdate = function (packet) {
        mp.Entity.prototype.remoteUpdate.apply(this, arguments);
        if (packet.owner) {
            this.owner = mp.entities.byId(packet.owner)
        }
    }

    var VIEW_WIDTH = 15
    var VIEW_DEAD_ZONE = 10
    var VIEW_HEIGHT = 30

    QuadCopter.prototype.maybeShoot = function() {
        if (!mp.isServer || !this.moving) { return; }

        if (this.target) {
            if (Math.abs(this.center.x - this.target.center.x) < 40) {
                var bullet = new mp.MortarBullet(this.center, this)
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
            var targets = mp.entities.collidingWith({
                center: {
                    x: 
                        this.moving.x > 0 ?
                            this.right + (VIEW_WIDTH / 2) + VIEW_DEAD_ZONE :
                            this.left - (VIEW_WIDTH / 2) - VIEW_DEAD_ZONE,
                    y: this.bottom + VIEW_HEIGHT + VIEW_DEAD_ZONE
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
                this.moving = this._moving  // Force to sync the _moving property
            }
        }
    }

    return QuadCopter
}

