'use strict'

var events = require('events')
var assert = require('assert')
var worldGen = require('./worldgen.js')
var stream = require('stream')
var images = require('./images.js')
var Camera = require('./camera.js')
var cappedArray = require('cappedarray')
var makeEntityCollection = require('./entity-collection.js')

function isVec(vec) {
    return vec != null && typeof vec == 'object' &&
        !isNaN(vec.x) && !isNaN(vec.y)
}

function vec({ x, y }) {
    assert(typeof x === 'number' && typeof y === 'number');
    assert(!isNaN(x) && !isNaN(y))
    return Object.freeze({
        x: x,
        y: y
    })
}

vec.origin = vec({ x: 0, y: 0 })

vec.distance = function (a, b) {
    var sqx = (a.x - b.x) * (a.x - b.x)
    var sqy = (a.y - b.y) * (a.y - b.y)
    return Math.sqrt(sqx + sqy)
}

module.exports = function makeMP() {

var clockSync

var range = [-1000, 1000]

var PROCESSING_SERVER_PACKETS = false;
var PROCESSING_SERVER_CORRECTION = false;
var SERVER_PACKET_TIMESTAMP = undefined;

var camera = new Camera(vec({ x: 0, y: 0 }))
camera.range = range

var localPlayer

var ctx  // Set as a property

var TPS = 24  // ticks per second

var util = require('util')

var inherit = util.inherits

var perfTrack

var groundY = 100

var lastEntityId = 1;

function BaseAI() {
}

BaseAI.prototype.control = function(entity) {
    throw new Error('BaseAI subclass ' + this.constructor.name +
        'does not implement prototype.control()');
}

function Entity(center) {
    this.direction = vec.origin
    this.size = vec.origin
    this.center = center ? vec(center) : vec.origin
    this.static = false
    this.solid = false
    this.speed = 1
    this.onUpdateFns = []
    this.packetProps = ['direction', 'center', 'clientsidePrediction', 'life', 'maxLife']  // Props which get serialized and updated
    this.life = -1
    this._changes = [];
}

inherit(Entity, events.EventEmitter)

Entity.prototype.remoteUpdate = function (packet) {
    this.packetProps.forEach((name) => {
        if (name in packet) {
            this[name] = packet[name]
        }
    })

    if ('id' in packet && !('id' in this)) {
        this.id = packet.id;
    }
}

Entity.prototype.serialize = function () {
    var out = {}
    this.packetProps.forEach((name) => {
        if (name in this) {
            out[name] = this[name]
        }
    })
    if (!this.id) { this.id = lastEntityId++ }
    out.id = this.id
    return out;
}

Entity.prototype.createAddPacket = function () {
    return ['add', this.constructor.name, this.serialize()]
}

Object.defineProperty(Entity.prototype, 'left', {
    get: function () {
        return this.center.x - this.halfWidth
    },
    set: function (left) {
        this.center = vec({ x: left + this.halfWidth, y: this.center.y })
    }
});

Object.defineProperty(Entity.prototype, 'right', {
    get: function () {
        return this.center.x + this.halfWidth
    },
    set: function (right) {
        this.center = vec({ x: right - this.halfWidth, y: this.center.y })
    }
});

Object.defineProperty(Entity.prototype, 'top', {
    get: function () {
        return this.center.y - this.halfHeight
    }
});

Object.defineProperty(Entity.prototype, 'bottom', {
    get: function () {
        return this.center.y + this.halfHeight
    }
});

Object.defineProperty(Entity.prototype, 'halfHeight', {
    get: function () {
        return this.size.y / 2
    }
});

Object.defineProperty(Entity.prototype, 'halfWidth', {
    get: function () {
        return this.size.x / 2
    }
});

Entity.prototype.draw = function (extrapolation) {
    var x = this.center.x + (this.direction.x * extrapolation)
    var y = this.center.y + (this.direction.y * extrapolation)
    var x1 = Math.floor(x - (this.size.x / 2) - camera.offset.x)
    var y1 = Math.floor(y - (this.size.y / 2) - camera.offset.y)

    if (this.image) {
        ctx.drawImage(
            this.facingRight === false ? this.image.flipped : this.image,
            x1, y1)
    } else {
        if (this.color)
            ctx.fillStyle = this.color
        ctx.fillRect(x1, y1, this.size.x, this.size.y)
        if (this.color)
            ctx.fillStyle = 'black'
    }
}

/*
 * Expects the ctx.fillStyle property to be "red".
 * If it needs to change the color it will put it back to red after.
 */
Entity.prototype.drawLifeBar = function (extrapolation) {
    var x = this.center.x + (this.direction.x * extrapolation)
    var y = this.center.y + (this.direction.y * extrapolation)
    var x1 = Math.floor(x - (this.size.x / 2) - camera.offset.x)
    var y1 = Math.floor(y - (this.size.y / 2) - camera.offset.y)

    var dim = 1.0
    if ('maxLife' in this) { dim = this.life / this.maxLife }

    if (/* Blink it! */ dim > 0.25 || Math.floor(+new Date() / 100) % 2) {
        if (dim < 0.25) {
            ctx.fillStyle = 'yellow'
        }
        var lifeY1 = y1 - Math.floor(this.size.y / 3)
        var lifeW = Math.floor(this.size.x * dim)
        ctx.fillRect(x1, lifeY1, lifeW, 2)
        if (dim < 1.0) {
            if (dim < 0.25) {
                ctx.fillStyle = 'red'
            } else {
                ctx.fillStyle = 'darkred'
            }
            ctx.fillRect(x1 + lifeW, lifeY1, this.size.x - lifeW, 2)
            if (dim > 0.25) {
                ctx.fillStyle = 'red'
            }
        }
    }
}

Entity.prototype.damage = function (damas) {
    assert(!this.dead, 'trying to damage a dead entity!');
    assert(!this.undying, 'trying to damage an undying entity');

    if (!('maxLife' in this)) {
        this.maxLife = this.life
    }

    if (isServer) {
        this.life -= damas || 10

        if (this.life <= 0) {
            this.die()
            this.life = 0;
        } else {
            this.pushChange('setLife', this.life);
        }
    }
}

Object.defineProperty(Entity.prototype, 'undying', {
    get: function () { return this.life == -1; }
});

Object.defineProperty(Entity.prototype, 'dead', {
    get: function () {
        var that = this;
        if (that.id) { return !entityById(that.id) }
        return !entities.some(function (ent) {
            return ent === that
        })
    },
    set: function (val) {
        assert(typeof val === 'boolean')
        if (val === true) {
            throw new Error('Cannot ressurrect an entity yet!')
        } else {
            this.die()
        }
    }
});

Object.defineProperty(Entity.prototype, 'dynamic', {
    get: function () { return !this.solid }
});

Object.defineProperty(Entity.prototype, 'moving', {
    get: function () { return this._moving },
    set: function (newMoving) {
        if (!this._moving || this._moving.x != newMoving.x || this._moving.y != newMoving.y) {
            this._moving = newMoving;
            if (this.id) {
                this.pushChange('setMoving', newMoving.x, newMoving.y);
                this.push3d();
            }
        }
    }
});

function pushGlobalChange(method, ...args) {
    if (!isServer || !networld) { return }
    networld._changes.push([method, ...args])
}

Entity.prototype.pushChange = function (method) {
    if (!isServer) { return; }
    if (!networld) { return; }
    var args = [].slice.call(arguments, 1)
    args.forEach((arg) => 
        assert.notEqual(typeof arg, 'undefined',
            'an argument to pushChange was undefined!'))
    assert.equal(typeof method, 'string', 'pushChange called without a method!')
    assert(this.id, 'Entity has no id!')

    this._changes.push([method, this.id].concat(args));
}

Entity.prototype.push3d = function () {
    if (PROCESSING_SERVER_PACKETS) { return; }
    var args = [
        (this.center.x),
        (this.center.y)
    ];
    if (this.direction.x !== 0 || this.direction.y !== 0) {
        args = args.concat([
            (this.direction.x),
            (this.direction.y)]);
    }
    this.pushChange('set3d', ...args);
}

Entity.prototype.die = function () {
    var thisEnt = this
    entities.remove(this)
    this.direction = vec.origin
}

Entity.prototype.distanceTo = function (other) {
    if (other instanceof Entity) { other = other.center }
    assert(('x' in other) && ('y' in other), 'other is not a vector!')

    var xDist = Math.abs(other.x - this.center.x)
    var yDist = Math.abs(other.y - this.center.y)
    return Math.sqrt((xDist * xDist) + (yDist * yDist))
}

Entity.prototype.cloneState = function () {
    var clone = Object.create(this.constructor.prototype)
    this.constructor.call(clone)

    for (var key of Object.keys(this)) {
        if (key[0] === '_') { continue }
        if (
                (typeof this[key] !== 'object' && typeof this[key] !== 'function') ||
                this[key] === null ||
                Object.isFrozen(this[key])
        ) {
            clone[key] = this[key]
        }
    }

    return clone
}

Entity.prototype.applyServerCorrection = function (newCenter, newDirection) {
    var justApply = () => {
        if (newDirection) this.direction = newDirection
        this.center = newCenter
    }

    var serverCenter = newCenter

    if (!networld || !clockSync.ready || !this.pastStatesAndInputs) {
        justApply()
        return
    }

    var packetAge = clockSync.now() - SERVER_PACKET_TIMESTAMP

    if (packetAge < 0) {
        clockSync.packetInFuture(-packetAge)
        packetAge = 0
    }

    var packetAgeInFrames = Math.round(packetAge / TPS)

    if (packetAgeInFrames >= this.pastStatesAndInputs.length) {
        justApply()
        return
    }

    var centerAt = (age) => (this.pastStatesAndInputs[age] || { state: {} }).state.center || null

    var distAt = (age) => {
        var centerAtAge = centerAt(age)
        if (centerAtAge === null) { return Infinity }
        return vec.distance(centerAtAge, serverCenter)
    }

    // Account for small errors in clock sync
    var correction = undefined
    for (var i = -2; i <= 2; i++)
        if (correction === undefined ||
                distAt(packetAgeInFrames + i) < distAt(packetAgeInFrames + correction))
            correction = i

    if (correction !== undefined)
        packetAgeInFrames += correction

    var siOnServerSend = this.pastStatesAndInputs[
        packetAgeInFrames
    ];

    assert(siOnServerSend, 'packet age ' + packetAgeInFrames + ' could not be accessed in ' + this.pastStatesAndInputs.length + ' arr')
    var estimatedPositionOnSend =
        siOnServerSend && siOnServerSend.state.center

    if (!estimatedPositionOnSend) {
        justApply()
        return
    }

    var offBy = vec.distance(newCenter, estimatedPositionOnSend)

    // Copy the past state of this entity into a dummy entity.
    var miniMe = siOnServerSend.state

    miniMe.center = newCenter
    if (newDirection) miniMe.direction = newDirection

    var advanceMyCopy = () => {
        var si = (
            this.pastStatesAndInputs[frame] ||
            this.pastStatesAndInputs[0 /* latest */] ||
            {} /* nop */)
        var input = si.input || {}
        if (input.intendToJump && !input.intendToStopJump) { miniMe.tryJump(); }
        if (input.intendToStopJump) { miniMe.stopJump(); }
        if (input.moving || (si.state || {}).moving) { miniMe.moving = input.moving || si.state.moving }
        miniMe.update(true /* stateless */)
    }

    var frame = packetAgeInFrames
    while (frame--) {
        advanceMyCopy()
    }

    var butterflyOffBy = vec.distance(this.center, miniMe.center)
    newCenter = miniMe.center
    newDirection = miniMe.direction

    // We're really really close, do nothing
    if (butterflyOffBy < 1) { return; }

    // Now, let's see if they're gonna get here in a few frames.
    // If so, do nothing
    var fewFrames = 4
    while (fewFrames--) {
        advanceMyCopy()
        if (
                vec.distance(this.center, miniMe.extrapolated(0.00)) < 1 ||
                vec.distance(this.center, miniMe.extrapolated(0.25)) < 1 ||
                vec.distance(this.center, miniMe.extrapolated(0.50)) < 1 ||
                vec.distance(this.center, miniMe.extrapolated(0.75)) < 1) {
            this.direction = newDirection
            return;
        }
    }

    // Now, let's see if we're gonna get there in a few frames.
    // If so, do nothing
    var targetCenter = miniMe.center
    var miniMe = this.cloneState()

    var fewFrames = 4
    while (fewFrames--) {
        advanceMyCopy()
        if (
                vec.distance(targetCenter, miniMe.extrapolated(0.00)) < 1 ||
                vec.distance(targetCenter, miniMe.extrapolated(0.25)) < 1 ||
                vec.distance(targetCenter, miniMe.extrapolated(0.50)) < 1 ||
                vec.distance(targetCenter, miniMe.extrapolated(0.75)) < 1) {
            this.direction = newDirection
            return;
        }
    }

    if (butterflyOffBy > 6) {
        // Major, disruptive, snapping update
        justApply()
        return
    }

    // Scooch a bit to the side
    // Validate a scooch first, we don't want to scooch above a platform we can't get to
    var scoochCenter = vec({
        x: (this.center.x + newCenter.x) / 2,
        y: (this.center.y + newCenter.y) / 2,
    })

    if (entities.collidingWith({ center: scoochCenter, size: this.size }, { solid: true }).length) {
        // Forget it, we were probably going to scooch below a platform
        // This won't avoid us scooching into places we can't reach but it's a start.
        return justApply()  // Snapping update
    }

    // The scooch appears to be valid!
    newCenter = scoochCenter
    
    justApply()
}

Entity.prototype.setMoving = function (x, y) {
    this._moving = vec({ x: x, y: y });
    this.push3d();
}

Entity.prototype.set3d = function (x, y, dx, dy) {
    var newCenter = vec({ x: x, y: y });
    if (arguments.length == 4) {
        var newDirection = vec({ x: dx, y: dy });
    }

    var isCorrection = this.clientsidePrediction && !isServer

    if (isCorrection && SERVER_PACKET_TIMESTAMP !== undefined) {
        PROCESSING_SERVER_CORRECTION = true
        this.applyServerCorrection(newCenter, newDirection)
        PROCESSING_SERVER_CORRECTION = false
        return
    }

    if (newDirection) this.direction = newDirection
    this.center = newCenter
}

Entity.prototype.setLife = function (life) {
    if (!('maxLife' in this)) {
        this.maxLife = 'life' in this ? this.life : life
    }
    this.life = life;
}

Entity.prototype.update = function (stateless) {
    var that = this;

    if (stateless !== true) {
        for (var i = 0; i < this.onUpdateFns.length; i++) {
            if (this.onUpdateFns[i].call(this) === false) { return; }
        }
    }

    if (this.direction.y != 0 || this.direction.x != 0) {
        this.center = vec({
            x: this.center.x + this.direction.x,
            y: this.center.y + this.direction.y
        })
    }

    if (this.direction.x !== 0) {
        this.facingRight = this.direction.x > 0
    }

    var computeGravity = 'weight' in this
    var computeMovementIntention = this.moving != null

    if ((computeGravity || computeMovementIntention) && this.direction.y >= 0) {
        var grounded = this.grounded()
    }

    // Gravity
    if ('weight' in this) {
        if (!grounded) {
            this.direction = vec({
                y: Math.min(7, this.direction.y + this.weight),
                x: this.direction.x
            })
        } else if (this.direction.y !== 0 || this.center.y !== grounded) {
            this.center = vec({
                y: grounded,
                x: this.center.x
            })
            this.direction = vec({
                x: this.direction.x,
                y: 0
            })
        }
    }

    // Intention of movement
    if (this.moving) {  // Some entities don't do this
        if (this.moving.x === 0 && this.direction.x !== 0) {
            // Player tries to stop moving if he doesn't intend to move
            var newX = this.direction.x * (grounded ? 0.5 : 0.9);
            if (Math.abs(newX) < 0.1) { newX = 0; }
            this.direction = vec({
                x: newX,
                y: this.direction.y
            })
            // But he's bad at it if he's not on the ground lol
        } else if (this.moving.x !== 0) {
            // Smooth into moving into a direction
            var left = this.moving.x - this.direction.x;
            var baseX = Math.abs(left) < 0.1 ? this.moving.x : this.direction.x;
            baseX += left * (grounded ? 0.2 : 0.05)
            this.direction = vec({ x: baseX, y: this.direction.y })
        }
    }
    
    // Bump into things
    if (this.direction.x !== 0) {
        var bumping = this.bumpingIntoSolid()
        if (bumping) {
            if (bumping[0] === -1 && this.direction.x < 0) {
                this.left = bumping[1];
                this.direction = vec({ x: 0, y: this.direction.y })
            } else if (bumping[0] === 1 && this.direction.x > 0) {
                this.right = bumping[1];
                this.direction = vec({ x: 0, y: this.direction.y })
            }
        }

        // Bumping into the end of the world
        if (this.direction.x > 0 && this.right >= range[1]) {
            this.right = range[1]
            this.direction = vec({ x: 0, y: this.direction.y })
        }
        if (this.direction.x < 0 && this.left <= range[0]) {
            this.left = range[0]
            this.direction = vec({ x: 0, y: this.direction.y })
        }
    }

    if (this.clientsidePrediction && stateless !== true) {
        if (!this.pastStatesAndInputs) { this.pastStatesAndInputs = cappedArray(200) }

        if (this._thisFrameInputs) {
            var { intendToShoot, intendToJump, intendToStopJump } = this._thisFrameInputs
        }

        // Copy immutable props of mine into a state+input object
        var thisState = {
            input: {
                moving: this.moving,
                intendToShoot,
                intendToJump,
                intendToStopJump
            },
            state: this.cloneState()
        }

        this.pastStatesAndInputs.unshift(thisState)
    }
    
    if (this._thisFrameInputs) { this._thisFrameInputs = {} }
}

Entity.prototype.extrapolated = function (n) {
    return vec({
        x: this.center.x + (this.direction.x * n),
        y: this.center.y + (this.direction.y * n)
    })
}

Entity.prototype.collideSemiPlane = function (semiPlane, direction) {
    if ('x' in semiPlane) {
        if (direction > 0)
            return this.center.x - (this.size.x / 2) > semiPlane.x
        else
            return this.center.x + (this.size.x / 2) < semiPlane.x
    } else {
        assert(false, 'Not implemented: collideSemiPlane where the semiplane is not a vector and direction!')
        left = this.center.y - (this.size.y / 2)
        right = this.center.y + (this.size.y / 2)
    }
}

Entity.prototype.collide = function (other) {
    var otherHalfWidth = other.size.x / 2
    var otherHalfHeight = other.size.y / 2
    var otherRight = other.center.x + otherHalfWidth;
    var otherLeft = other.center.x - otherHalfWidth;
    var otherTop = other.center.y - otherHalfHeight;
    var otherBottom = other.center.y + otherHalfHeight;

    assert('left' in this);
    assert('right' in this);
    assert('top' in this);
    assert('bottom' in this);

    return (
        this.left <= otherRight &&
        this.right >= otherLeft &&
        this.top <= otherBottom &&
        this.bottom >= otherTop)
}

Entity.prototype.inside = function (other) {
    var halfWidth = this.size.x / 2
    var halfHeight = this.size.y / 2

    var otherHalfWidth = other.size.x / 2
    var otherHalfHeight = other.size.y / 2

    return (
        this.center.x < other.center.x + otherHalfWidth &&
        this.center.x > other.center.x - otherHalfWidth &&
        this.center.y < other.center.y + otherHalfHeight &&
        this.center.y > other.center.y - otherHalfHeight)
}

Entity.prototype.grounded = function () {
    var onSolid = this.groundedOnSolid()
    if (onSolid != null) { return onSolid }
    var where = 100 - (this.size.y / 2)
    return this.center.y + (this.size.y / 2) >= 100 ?
        where :
        null
}

Entity.prototype.groundedOnSolid = function () {
    if (this._lastSolidGroundedOn) {
        if (!entityById(this._lastSolidGroundedOn.id)) {
            this._lastSolidGroundedOn = null
        }
    }
    if (this._lastSolidGroundedOn) {
        if (this.collide(this._lastSolidGroundedOn) || this.direction.x == 0 && this.direction.y == 0) {
            return this._lastSolidGroundedOn.top - this.halfHeight
        }
    }
    for (var solid of entities.collidingWith(this, { solid: true })) {
        if (
            this.bottom < solid.top + 5  // Maximum height we can step on
        ) {
            this._lastSolidGroundedOn = solid
            return solid.top - this.halfHeight
        }
    }
    this._lastSolidGroundedOn = null
    return null;
}

Entity.prototype.bumpingIntoSolid = function () {
    for (var solid of entities.collidingWith(this, { solid: true })) {
        if (Math.abs(this.bottom - solid.top) < 5) { continue }

        if (this.direction.x < 0 &&
                Math.abs(this.left - solid.right) < 7 /* Pretty fast speed */) {
            return [-1, solid.right]  // Bumping to the left
        }
        if (this.direction.x > 0 &&
                Math.abs(this.right - solid.left) < 7 /* Pretty fast speed */) {
            return [1, solid.left]  // Bumping to the right
        }
    }
}

Entity.prototype.tryJump = function () {
    if ((PROCESSING_SERVER_PACKETS && !PROCESSING_SERVER_CORRECTION) || this.grounded()) {
        this.direction = vec({
            x: this.direction.x,
            y: -(this.jumpSpeed || 4)
        })
        this.push3d();
    }
}

Entity.prototype.stopJump = function () {
    if (!this.grounded()) {
        if (this.direction.y < 0) {
            this.direction = vec({
                y: this.direction.y * 0.5,
                x: this.direction.x
            })
            this.push3d()
        }
    }
}

Entity.prototype.onUpdate = function (cb) {
    this.onUpdateFns.push(cb);
}

Entity.prototype.offUpdate = function (cb) {
    this.onUpdateFns = this.onUpdateFns
        .filter(fn => fn !== cb)
}


// A player or an enemy.
function Player(center) {
    Entity.call(this)
    if (center) this.center = center
    this.facingRight = Math.random() > 0.5
    this.size = vec({ x: 10, y: 15 })
    this.weight = 0.3
    this.weapons = []

    this.packetProps = this.packetProps.concat(['facingRight'])
    
    this.image = images.stickman

    this.life = 96
}

inherit(Player, Entity)

Player.prototype.die = function () {
    if (isServer && Math.random() > 0.2) {
        var drop = new AmmoDrop({
            count: Math.floor(Math.random() * 30) + 1,
            bullet: possibleDrops[
                Math.floor(Math.random() * possibleDrops.length)]
        });
        drop.center = vec(this.center)
        entities.push(drop)
    }
    Entity.prototype.die.apply(this, arguments)
}

Player.prototype.addBullets = function (pack) {
    if (arguments.length === 2) {
        pack = {
            bullet: ret[pack],
            count: arguments[1]
        }
    }
    assert(typeof pack.count === 'number' && !isNaN(pack.count),
        'The bullet pack\'s `count` prop must be a number!');
    assert(typeof pack.bullet === 'function' && pack.bullet.prototype instanceof Bullet,
        'The bullet pack\'s `bullet` prop must be a class, and an instance of Bullet!');

    this.weapons.unshift(pack)
    this.emit('weapon-info-change', pack)
    if (!PROCESSING_SERVER_PACKETS) {
        this.pushChange('addBullets', pack.bullet.name, pack.count)
    }
}

Player.prototype.getCurrentWeapon = function () {
    if (this.weapons.length) return this.weapons[0]
    return {
        bullet: MortarBullet,
        count: -1
    }
}

Player.prototype.shoot = function () {
    if (!isServer) { return; }

    var BulletClass

    if (this.weapons.length === 0) {
        BulletClass = MortarBullet
    } else {
        BulletClass = this.weapons[0].bullet
        this.weapons[0].count--;
        if (this.weapons[0].count === 0) {
            this.weapons.shift()
            this.pushChange('popWeapon')
        } else {
            this.pushChange('popBullet')
        }
        this.emit('weapon-info-change', this.getCurrentWeapon())
    }
    
    var bullet = new BulletClass({
        x: this.center.x, y: this.center.y }, this)

    bullet.center = vec(this.center)
    bullet.direction = vec({
        x: this.facingRight ?
            bullet.speed :
            -bullet.speed,
        y: bullet.direction.y
    })
    entities.push(bullet);
}

Player.prototype.popWeapon = function () {
    if (this.weapons.length) {
        this.weapons.shift()
    }
    this.emit('weapon-info-change', this.getCurrentWeapon())
}

Player.prototype.popBullet = function () {
    if (this.weapons.length) {
        this.weapons[0].count--
    }
    this.emit('weapon-info-change', this.getCurrentWeapon())
}

Player.prototype.createWriteStream = function () {
    var LEFT = 37
    var RIGHT = 39
    var JUMP = 38
    var SHOOT = 32
    
    var wasMovingLeft
    var wasMovingRight

    var player = this;

    function onUpdate() {
        this._thisFrameInputs = { intendToShoot, intendToJump, intendToStopJump };
        if (intendToShoot) { player.shoot(); }
        if (intendToJump && !intendToStopJump) { player.tryJump(); }
        if (intendToStopJump) { player.stopJump(); }
        intendToShoot = intendToJump = intendToStopJump = false
    }

    player.onUpdate(onUpdate)

    // Introduce movement intention into player
    player.moving = vec.origin
    var intendToShoot, intendToJump, intendToStopJump
    
    var ret = new stream.Writable({ objectMode: true })

    ret.destroy = function () {
        player.offUpdate(onUpdate)
    }

    ret._write = function onKeyData(data, _, next) {
        if (typeof data[0] === 'number') {
            var age = +new Date() - data.shift()
            if (age < 0) age = 0
            if (age > 100) age = 0
        }
        var [type, keyCode] = data
        if (type === 'keyup') {
            if (LEFT == keyCode) {
                if (wasMovingLeft) { player.moving = vec.origin }
                if (wasMovingRight) { player.moving = vec({ x: player.speed, y: 0 }) }
                wasMovingLeft = false;
            }
            if (RIGHT == keyCode) {
                if (wasMovingRight) { player.moving = vec.origin }
                if (wasMovingLeft) { player.moving = vec({ x: -player.speed, y: 0 }) }
                wasMovingRight = false;
            }
            if (JUMP == keyCode) {
                intendToStopJump = true
            }
        } else if (type === 'keydown') {
            if (LEFT == keyCode) {
                player.moving = vec({ x: -player.speed, y: 0 });
                wasMovingLeft = true;
            }
            if (RIGHT == keyCode) {
                player.moving = vec({ x: player.speed, y: 0 });
                wasMovingRight = true;
            }
            if (JUMP == keyCode) {
                intendToJump = true
            }
            if (SHOOT == keyCode) {
                intendToShoot = true
            }
        }
        next()
    }
    
    return ret
}


function HumanPlayer() {
    Player.apply(this, arguments);
    this.jumpSpeed = 5
    this.speed = 2.5
    this.weight = 0.3
}

var possibleDrops = [BazookaBullet, BodySlam]

inherit(HumanPlayer, Player);



function Dog() {
    Player.apply(this, arguments)
    this.size = vec({ x: 10, y: 10 })
    this.biting = undefined
    this.image = null;
    this.biteStrengthLeft = 33;
    this.speed = 1.5
}

inherit(Dog, Player)

Dog.prototype.update = function () {
    if (!this.biting) {
        Player.prototype.update.apply(this, arguments);
        return;
    }

    if (this.biteTarget.dead) {
        this.unbite();
        return;
    }

    this.biteTarget.damage(0.3)

    this.center = vec({
        x: this.biteTarget.center.x + this.biteCoords.x,
        y: this.biteTarget.center.y + this.biteCoords.y
    })

    this.direction = vec(this.biteTarget.direction)
}

Dog.prototype.bite = function (player) {
    if (player.dead) debugger
    assert(!player.dead, 'player\'s dead lol')
    assert(this.biteStrengthLeft >= 33, 'cant bite before biteStrengthLeft is 33')
    this.biting = true
    this.biteTarget = player;
    this.biteCoords = vec({
        x: this.center.x - this.biteTarget.center.x,
        y: this.center.y - this.biteTarget.center.y
    })

    this.biteStrengthLeft = 33
    assert(this.collide(player), 'trying to bite player but not colliding with it!')
    assert(!isNaN(this.biteCoords.x) && !isNaN(this.biteCoords.y))
}

Dog.prototype.unbite = function () {
    assert(this.biting, 'can\'t call unbite() if were biting');

    this.biting = false;
    this.biteStrengthLeft = -33;
    this.direction = vec({ y: -3, x: (Math.random() - 0.5) * 5 })
}


function Bullet(center, owner) {
    Entity.call(this)
    this.owner = owner
    this.center = center
    this.direction = vec.origin
    this.speed = 8
    this.size = vec({ x: 4, y: 4 })
}

inherit(Bullet, Entity)

Bullet.prototype.remoteUpdate = function (packet) {
    Entity.prototype.remoteUpdate.apply(this, arguments);
    assert(typeof packet.owner === 'number', 'Bullet packets need a owner!')
    this.owner = entityById(packet.owner)
}

Bullet.prototype.serialize = function () {
    var out = Entity.prototype.serialize.apply(this, arguments);
    out.owner = this.owner.id
    return out
}

Bullet.prototype.update = function () {
    Entity.prototype.update.call(this)

    var didHitSomething = false;
    
    entities.collidingWith(this, { static: false }, (ent) => {
        if (ent !== this.owner && ent !== this && ent.owner !== this.owner && !ent.ghost) {
            didHitSomething = true;
            return false  /* it's a hit lel */
        }
        return true
    })

    if (didHitSomething) {
        this.die()
    }
}

function BazookaBullet(center, owner) {
    Bullet.call(this, center, owner)
    this.displayName = 'BAZOOKA'
    this.lifetime = 66;
}

inherit(BazookaBullet, Bullet)

BazookaBullet.prototype.die = function () {
    Bullet.prototype.die.call(this)

    // Avoid duplicate explosions
    var expl = new Explosion(this.center, this.owner)
    if (this.id) {
        // If this bullet hasn't been sent to the client, it never will be because it's dead now
        // So, don't send the explosion in that case.
        expl.syncable = false;
    }
    entities.push(expl);
}

BazookaBullet.prototype.update = function () {
    Bullet.prototype.update.call(this);
    this.lifetime--;
    if (this.lifetime <= 0) { this.die(); return; }
}


function MortarBullet(center, owner) {
    this.displayName = 'Mortar'
    BazookaBullet.call(this, center, owner)
    this.direction = vec({
        x: this.direction.x,
        y: this.direction.y - 1.6
    })
    this.weight = 0.4
}

inherit(MortarBullet, BazookaBullet)

MortarBullet.prototype.update = function () {
    BazookaBullet.prototype.update.call(this)
    this.direction = vec({
        x: this.direction.x * 0.93,
        y: this.direction.y
    })
}


function BodySlam(center, owner) {
    Bullet.call(this, center, owner)
    this.lifetime = 0
    this.size = vec({ x: 10, y: 10 })
    this._alreadyDamaged = {}
}

inherit(BodySlam, Bullet)

BodySlam.prototype.draw = function () {
    Explosion.prototype.draw.apply(this, arguments)
}
BodySlam.prototype.extrapolatedSize = function () {
    return Explosion.prototype.extrapolatedSize.apply(this, arguments)
}
BodySlam.prototype.update = function() {
    if (!this.owner) return;
    if (!this._updated) {
        var moving = this.owner.moving || {}
        this.isRight = moving.x > 0 ? true :
                       moving.x < 0 ? false :
                       this.owner.facingRight === true ? true :
                       this.owner.facingRight === false ? false :
                       Math.random() > 0.5
        this._updated = true
        this._startSpeed = this.owner.direction.x
        this.owner.direction = vec({
            x: this.owner.direction.x,
            y: this.owner.direction.y * 0.3
        })
        this.owner.damage = (dmg) => this.owner.constructor
            .prototype.damage.call(this.owner, dmg * 0.5)
    }

    this.size = this.extrapolatedSize(0)

    var x = this.isRight ? 6 : -6

    if (this.lifetime % 3 === 0) {
        x *= 3
    }

    if (this.lifetime % 4 === 0) {
        x /= 2
    }

    this.center = this.owner.center
    this.direction = this.owner.direction

    this.owner.direction = vec({
        x: x,
        y: this.owner.direction.y
    })

    var collisions = entities.collidingWith(this, { static: false, undying: false, dead: false }) //, { undying: false, static: false })

    for (var ent of collisions) {
        if (ent === this.owner) continue
        if (ent.dead) continue
        if (ent.static) continue
        if ('weight' in ent) {
            ent.direction = vec({
                x: this.owner.direction.x / 2,
                y: ((this.owner.direction.y) - 2) * 3
            })
        }
        var damaged = this._alreadyDamaged[ent.id]
        if (!damaged) {
            ent.damage(13)
            this._alreadyDamaged[ent.id] = true
        }
    }

    if (this.lifetime++ > 10) {
        this.owner.direction = vec({
            x: this.owner.direction.x / 2,
            y: this.owner.direction.y
        })
        this.die()
    }
}
BodySlam.prototype.die = function () {
    // Not so invincible now eh
    Bullet.prototype.die.apply(this)
    this.owner.damage = this.owner.constructor.prototype.damage
}

function Explosion(center, owner) {
    Entity.call(this)
    this.center = center
    this.owner = owner
    this.size = vec({ x: 10, y: 10 })
    this.direction = vec.origin
    this.lifetime = 0
}

inherit(Explosion, Entity)

Explosion.prototype.damageThings = function () {
    var area = { center: this.center, size: { x: 30, y: 30 } }

    entities.collidingWith(area, { undying: false })
    .forEach((ent) => {
        if ('weight' in ent) {
            var dx = this.center.x - ent.center.x
            var dy = this.center.y - ent.center.y + 2
            var push = this.pushForce || 7
            ent.direction = vec({
                x: dx < 0 ? push : -push,
                y: dy < 0 ? push : -push
            })
        }
        ent.damage(10)
        if (('weight' in ent) && ent.alive) {
            // Tell everyone where you're going to avoid the butterfly effect.
            ent.push3d()
        }
    })
}

Explosion.prototype.draw = function (extrapolation) {
    var size = this.extrapolatedSize(extrapolation)
    if (this.lifetime % 4 == 0) {  // TODO this comes from wall clock
        ctx.fillStyle = 'yellow'
        ctx.fillRect(0, 0, 100, 100)
    } else if (this.lifetime % 4 == 2) {/*
        ctx.fillStyle = 'red'
        ctx.fillRect(0, 0, 100, 100)*/
    } else {
        ctx.strokeStyle = 'yellow'
        ctx.strokeRect(this.center.x - (size.x / 2) - camera.offset.x,
            this.center.y - (size.y / 2) - camera.offset.y,
            size.x, size.y)
        ctx.fillStyle = 'black'
    }
    Entity.prototype.draw.apply(this, arguments);
}

Explosion.prototype.extrapolatedSize = function (extrapolation) {
    return {
        x: (this.lifetime + extrapolation) * 3,
        y: (this.lifetime + extrapolation) * 3
    }
}

Explosion.prototype.update = function () {
    Entity.prototype.update.apply(this, arguments);

    if (this.lifetime === 1) {
        this.damageThings()
    }

    if (this.lifetime++ > 8) {
        this.die();
    }

    this.size = this.extrapolatedSize(0)
}

function AmmoDrop(opt) {
    Entity.call(this)
    opt = opt || {}
    this.count = opt.count
    this.ghost = true
    this.bullet = opt.bullet
    this.packetProps = this.packetProps.concat(['count'])
    this.size = vec({ x: 10, y: 30 })
}

inherit(AmmoDrop, Entity)

AmmoDrop.prototype.serialize = function () {
    var ret = Entity.prototype.serialize.apply(this, arguments)
    ret.bullet = this.bullet.name
    return ret
}

AmmoDrop.prototype.remoteUpdate = function (update) {
    Entity.prototype.remoteUpdate.apply(this, arguments)
    this.bullet = ret[update.bullet];
    assert(this.bullet, 'AmmoDrop#remoteUpdate: unknown bullet ' + update.bullet);
}

AmmoDrop.prototype.update = function () {
    if (!isServer) { return; }

    var coll = entities.collidingWith(this, { instanceof: Player });

    if (coll[0]) {
        coll[0].addBullets(this)
        this.die()
        return
    }
}

var entities = makeEntityCollection()

function enemyAI(enemy, target) {
    assert(typeof enemy.update === 'function', 'enemy.tick is not a function!')
    var i = Math.round(Math.random() * 10)

    enemy.onUpdate(function () {
        i++;
        if (i >= 16) { decideShit() }  // only decide shit every 16 ticks
    });
    
    var decideShit = function () {
        approach()
        jumpIfSeemsNecessary()
    }

    var approach = function () {
        assert(enemy instanceof Player)
        if (enemy.distanceTo(target) > minDistanceToPlayer && enemy.grounded()) {
            if (enemy.center.x >= target.center.x && facing !== -1) {
                facing = -1
                enemy.moving = vec({ x: -1, y: 0 })
            } else if (enemy.center.x < target.center.x && facing != 1) {
                facing = 1
                enemy.moving = vec({ x: 1, y: 0 })
            }
        } else {
            enemy.moving = vec.origin
        }
    }

    var jumpIfSeemsNecessary = function () {
        if (enemy.distanceTo(target) < minDistanceToPlayer + 1 && enemy.grounded()) {
            enemy.tryJump()
            facing = 0
        }
    }

    var facing = 0

    var minDistanceToPlayer = 20 + Math.round(Math.random() * 30)
}

function dogAI(enemy, target) {
    var biteXLocationInPlayer = (Math.random() - 0.5) * 10  // it tries to bite in this X coord

    target.onUpdate(function () {
        approach()
        jumpIfSeemsNecessary()
        if (enemy.biting && !target.grounded()) {
            enemy.biteStrengthLeft--;

            if (enemy.biteStrengthLeft <= 0) {
                enemy.unbite();
            }
        } else if (!enemy.biting) {
            if (enemy.biteStrengthLeft < 33) {
                enemy.biteStrengthLeft++;
            }
        }
    })

    var approach = function () {
        if (enemy.biting || target.dead) { return /* Already biting, no moving for us. */ }

        // Cannot bite yet, the player shook me off
        if (enemy.biteStrengthLeft < 33) {
            return;
        }

        // Too far from player, ignore that bitch
        if (enemy.distanceTo(target) > 100) { return; }

        var xBiteTarget = biteXLocationInPlayer + target.center.x
        var dxToBiteTarget = enemy.center.x - xBiteTarget
        if (Math.abs(dxToBiteTarget) < 5 && enemy.collide(target)) {
            enemy.bite(target);
            return;  // Already biting that dumb shit
        }

        if (!enemy.grounded()) { return; }  // Can't turn in midair, sorry

        if (dxToBiteTarget < 10) { enemy.direction = vec({ x: enemy.speed, y: enemy.direction.y }) }
        if (dxToBiteTarget > 10) { enemy.direction = vec({ x: -enemy.speed, y: enemy.direction.y }) }
    }

    var jumpIfSeemsNecessary = function () {
        if (enemy.distanceTo(target) < minDistanceToPlayer + 1 && enemy.grounded()) {
            enemy.tryJump()
            facing = 0
        }
    }

    var facing = 0

    var minDistanceToPlayer = 20 + Math.round(Math.random() * 30)
}


var isServer = true  // We're a server unless a client networld comes along.
var networld
// Receives updates in its _onPacket function.
// When that happens, everything without an AI gets updated in the entity list.
function Networld(opt) {
    assert(!networld);
    networld = this
    ret.onNetWorld && ret.onNetWorld(this)
    this.entitiesByName = {};
    this.worldId = Math.round(Math.random() * 999999);
    this.lastId = -1;
    this.acquainted = {};
    this.serverClock = undefined
    this.isServer = opt && opt.isServer
    this._changes = []
    isServer = !!this.isServer
}

inherit(Networld, events.EventEmitter)

Networld.prototype.commit = function () {
    assert(this.isServer !== false, 'do not call commit() on a client networld!')

    var somethingChanged = false;
    
    var changedEnts = entities
        .filter(ent => ent.syncable !== false)
        .map((ent) => {
            if (!ent.id) ent.id = lastEntityId++;

            if (!(ent.id in this.acquainted)) {
                this.acquainted[ent.id] = true;
                return [
                    ent.createAddPacket()
                ]
            } else if (ent._changes.length) {
                var ret = ent._changes;
                ent._changes = [];
                return ret;
            }
        })
        .filter((changes) => !!changes)
        .reduce(((a, b) => a.concat(b)), [])

    // Died entities are the IDs we cant get
    var diedEnts = entities.recentlyRemoved
    entities.recentlyRemoved = []

    diedEnts.forEach((ent) => { delete this.acquainted[ent.id] })

    diedEnts = diedEnts
        .filter(ent => !ent.undying)  // Undying things die because of time, so no need to sync.
        .map((ent) => ['remove', +ent.id])

    var globalChanges = [].slice.call(this._changes)

    this._changes = [];

    return changedEnts.concat(diedEnts).concat(globalChanges)
}

Networld.prototype._onPacket = function (packet) {
    assert(this.isServer !== true, 'do not call _onPacket() on a server networld!')

    if (typeof packet !== 'object') { return; }  // Not for me
    if (!packet.length) { return; }  // Not for me either
    if (perfTrack) perfTrack.start('packets-recv')
    var timestamp
    if (typeof packet[0] === 'number') {
        timestamp = packet[0]
        packet.shift() 
    }
    var op = packet[0]
    var opArgs = packet.slice(1)

    PROCESSING_SERVER_PACKETS = true;
    SERVER_PACKET_TIMESTAMP = timestamp

    try {
        this._applyPacket(op, opArgs, packet);
    } catch(e) {
        console.error(e);
    }

    SERVER_PACKET_TIMESTAMP = undefined
    PROCESSING_SERVER_PACKETS = false;
    if (perfTrack) perfTrack.end('packets-recv')
}

Networld.prototype._applyPacket = function (op, opArgs, packet) {
    if (this.emit('packet:' + op, opArgs)) { return }
    if (op === 'worldGen') {
        opArgs[0].mp = ret
        opArgs[0].statics = true
        worldGen(opArgs[0])
    } else if (op === 'you') {
        localPlayer = this._applyUpdate(opArgs[0], opArgs[1])
        if (camera) camera.player = localPlayer
        this.emit('you', localPlayer)
    } else if (op === 'add') {
        this._applyUpdate(opArgs[0], opArgs[1])
    } else if (op === 'remove') {
        var id = opArgs[0]
        assert(typeof id === 'number', 'id is not a number!')
        entities.remove(id);
    } else if (typeof opArgs[0] == 'number') {
        var ent = entityById(opArgs[0]);
        if (!ent || !ent[op]) { return; }
        ent[op].apply(ent, opArgs.slice(1));
    } else {
        console.log('unknown packet ' + op + '(' + JSON.stringify(packet) + ')');
    }
}

Networld.prototype._applyUpdate = function (className, update) {
    assert(this.isServer !== true, 'do not call _applyUpdate() on a server networld!')

    var Class = ret[className];
    assert(Class !== undefined, 'Got a packet with ' + className + ', which is not a class')
    assert(typeof Class === 'function' && Class.prototype instanceof Entity, 'Class ' + className + ' does not inherit Entity!')
    assert(typeof update === 'object' && update !== null)
    assert(update.id, 'every "add" entity update should have an "id"!')
        
    var ent = entityById(update.id)
    if (!ent) {
        ent = new Class();
        ent.remoteUpdate(update);
        entities.push(ent)
    } else {
        assert(ent instanceof Class, 'found an entity which is not an instance of the correct class!');
        ent.remoteUpdate(update);
    }
    
    return ent
}

function entityById(id) {
    return entities.byId(id);
}

function getPlayerClass() {
    return HumanPlayer
}

function getSpawnPoint(player) {
    assert(player instanceof Player, 'getSpawnPoint: player argument must be an instance of mp.player!')
    return vec({ x: Math.random() * 1000, y: 0 })
}

var ret = {
    pushGlobalChange: pushGlobalChange,
    getPlayerClass: getPlayerClass,
    getSpawnPoint: getSpawnPoint,
    BazookaBullet: BazookaBullet,
    MortarBullet: MortarBullet,
    HumanPlayer: HumanPlayer,
    entityById: entityById,
    Explosion: Explosion,
    BodySlam: BodySlam,
    Networld: Networld,
    AmmoDrop: AmmoDrop,
    enemyAI: enemyAI,
    Bullet: Bullet,
    Player: Player,
    Entity: Entity,
    dogAI: dogAI,
    Dog: Dog,
    TPS: TPS
}

Object.defineProperty(ret, 'entities', {
    get: () => entities
})
Object.defineProperty(ret, 'ctx', {
    get: () => ctx,
    set: function (newCtx) { ctx = newCtx; }
})
Object.defineProperty(ret, 'camera', {
    get: () => camera,
    set: function (newCam) { camera = newCam; }
})
Object.defineProperty(ret, 'localPlayer', {
    get: () => localPlayer,
    set: function (pl) { localPlayer = pl; }
})
Object.defineProperty(ret, 'isServer', {
    get: () => isServer,
    set: function (srv) { isServer = srv; }
})
Object.defineProperty(ret, 'clockSync', {
    get: () => clockSync,
    set: function (cs) { clockSync = cs }
})
Object.defineProperty(ret, 'range', {
    get: () => range,
    set: function (rang) { range = camera.range = entities.range = rang }
})
Object.defineProperty(ret, 'perfTrack', {
    get: () => perfTrack,
    set: function (tr) { perfTrack = tr }
})

return ret;

};

module.exports.vec = vec    
