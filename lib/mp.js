'use strict'

var events = require('events')
var assert = require('assert')
var abstractPool = require('abstract-pool')
var worldGen = require('./worldgen.js')
var stream = require('stream')
var images = require('./images.js')
var Camera = require('./camera.js')
var cappedArray = require('cappedarray')
var makeEntityCollection = require('./entity-collection.js')

function round3(num) {
    // Round to 3 places using |0 trick.
    return ((num * 1000)|0) / 1000
}

function isVec(vec) {
    return vec != null && typeof vec == 'object' &&
        !isNaN(vec.x) && !isNaN(vec.y)
}

function vec(arg) {
    assert(typeof arg.x === 'number' && typeof arg.y === 'number' && !Number.isNaN(arg.x) && !Number.isNaN(arg.y))
    if (Object.isFrozen(arg)) return arg
    return Object.freeze(arg)
}

vec.origin = vec({ x: 0, y: 0 })

vec.distance = function (a, b) {
    var sqx = (a.x - b.x) * (a.x - b.x)
    var sqy = (a.y - b.y) * (a.y - b.y)
    return Math.sqrt(sqx + sqy)
}

module.exports = function makeMP() {

var clockSync

var yRange
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
    this._center = center ? vec(center) : vec.origin
    this._moving = null
    this._changes = [];
    this.direction = vec.origin
    this.onUpdateCenter = () => null
    this._qtObj = null
    this.id = 0
    this.maxLife = 0
    this.life = -1
    this.syncable = true
    this.facingRight = true
    this._ee = null
}

Entity.prototype.destroy = function () {
    if (this._ee) {
        this._ee.removeAllListeners()
    }
}

Object.defineProperty(Entity.prototype, 'center', {
    get: function () { return this._center },
    set: function (newCenter) {
        this.onUpdateCenter(this._center, newCenter ? newCenter.x : NaN, newCenter ? newCenter.y : NaN)
        if (newCenter === null || Object.isFrozen(newCenter)) this._center = newCenter
        else this._center = vec(newCenter)
    },
});

Entity.prototype.setCenter = function(x, y) {
    assert(typeof x === 'number' && typeof y === 'number' && !Number.isNaN(x) && !Number.isNaN(y))
    if (!this._center || Object.isFrozen(this._center)) {
        this.onUpdateCenter(this._center, x, y)
        this._center = { x: x, y: y }
    } else {
        this.onUpdateCenter(this._center, x, y)
        this._center.x = x
        this._center.y = y
    }
}

Entity.prototype.setMoving = function(x, y) {
    if (!this._moving ||
            this._moving.x != x ||
            this._moving.y != y) {
        if (this.facingRight === undefined ||
                (this.facingRight && x < 0) ||
                (!this.facingRight && x > 0)) {
            this.facingRight = x > 0;
            this.pushChange('setFacingRight', [ this.facingRight ? 1 : 0 ]);
        }
        if (!this._moving || Object.isFrozen(this._moving)) {
            this._moving = { x: x, y: y }
        } else {
            this._moving.x = x
            this._moving.y = y
        }
        if (this.id) {
            this.pushTimestampedChange('setMoving_net', [ x, y, this.center.x, this.center.y, this.direction.x, this.direction.y ]);
        }
    }
}

Entity.prototype.setDirection = function (x, y) {
    assert(typeof x === 'number' && typeof y === 'number' && !Number.isNaN(x) && !Number.isNaN(y))
    if (this.direction && (this.direction.x == x && this.direction.y == y)) {
        return
    }
    if (!this.direction || Object.isFrozen(this.direction)) {
        this.direction = { x: x, y: y }
    } else {
        this.direction.x = x
        this.direction.y = y
    }
}

Entity.prototype.poolSize = 20
Entity.prototype.static = false
Entity.prototype.size = vec.origin
Entity.prototype.solid = false
Entity.prototype.ghost = false
Entity.prototype.ephemeral = false
Entity.prototype.bumpless = false
Entity.prototype.groundless = false
Entity.prototype.acceleration = 0.2
Entity.prototype.accelerationWhenNotGrounded = 0.05
Entity.prototype.verticalAcceleration = 0.05
Entity.prototype.deceleration = 0.5
Entity.prototype.packetProps = Object.freeze(
    ['clientsidePrediction', 'life', 'maxLife']) // Props which get serialized and updated
Entity.prototype.packetPropTypes = Object.freeze(
    ['boolean', 'number', 'number'])
Entity.prototype.decelerationWhenNotGrounded = 0.9
Entity.prototype.speed = 1
Entity.prototype.life = -1
Entity.prototype.weight = null

Entity.prototype.addListener =
Entity.prototype.on = function (...args) {
    if (!this._ee) {
        this._ee = new events.EventEmitter()
    }
    return this._ee.on(...args)
}
Entity.prototype.once = function (...args) {
    if (!this._ee) {
        this._ee = new events.EventEmitter()
    }
    return this._ee.once(...args)
}
Entity.prototype.emit = function () {
    if (!this._ee) { return; }
    return this._ee.emit.apply(this._ee, arguments)
}
Entity.prototype.removeListener = function (...args) {
    if (!this._ee) { return; }
    return this._ee.removeListener(...args)
}

Entity.prototype.remoteUpdate = function (packet) {
    if (!this.id)
        this.id = packet.x[0]
    this.setCenter(
        packet.x[1],
        packet.x[2]
    )
    if (packet.x.length === 5) {
        this.setDirection(
            packet.x[3],
            packet.x[4]
        )
    }

    for (var i = 0; i < this.packetProps.length; i++) {
        var name = this.packetProps[i]
        if (name in packet) {
            if (this.packetPropTypes[i] === 'entity') {
                this[name] = packet[name] ? entityById(packet[name][':entity_id']) : null
            } else if (this.packetPropTypes[i] === 'class') {
                if (packet[name]) {
                    var Klass = ret[packet[name][':class_name']]
                    assert(Klass, 'unknown class ' + packet[name][':class_name'])
                }
                this[name] = Klass
            } else
                this[name] = packet[name]
        }
    }
}

Entity.prototype.serialize = function () {
    var out = {}

    if (!this.id) { this.id = lastEntityId++ }

    if (this.direction.x || this.direction.y) 
        out.x = [
            this.id,
            this.center.x,
            this.center.y,
            this.direction.x,
            this.direction.y
        ]
    else
        out.x = [
            this.id,
            this.center.x,
            this.center.y
        ]

    assert(this.packetProps.length === this.packetPropTypes.length)
    for (var i = 0; i < this.packetProps.length; i++) if (this.packetProps[i] in this){
        var prop = this[this.packetProps[i]]
        if (this.packetPropTypes[i] === 'entity') {
            out[this.packetProps[i]] = prop && prop.id ?
                { ':entity_id': prop.id } :
                null
        } else if (this.packetPropTypes[i] === 'class') {
            if (prop) assert(typeof prop.name === 'string' && typeof prop === 'function')
            out[this.packetProps[i]] = prop ?
                { ':class_name': prop.name } :
                null
        } else {
            out[this.packetProps[i]] = this[this.packetProps[i]]
        }
    }

    if (out.life === -1) delete out.life  // Saying "this box instance has life -1" is redundant. Most instances with life -1 stay that way, and if they don't, setLife is there for that.

    return out
}

Entity.prototype.createAddPacket = function () {
    return ['add', this.constructor.name, this.serialize()]
}

Object.defineProperty(Entity.prototype, 'left', {
    get: function () {
        return this.center.x - this.halfWidth
    },
    set: function (left) {
        this.setCenter(left + this.halfWidth, this.center.y)
    }
});

Object.defineProperty(Entity.prototype, 'right', {
    get: function () {
        return this.center.x + this.halfWidth
    },
    set: function (right) {
        this.setCenter(right - this.halfWidth, this.center.y)
    }
});

Object.defineProperty(Entity.prototype, 'top', {
    get: function () {
        return this.center.y - this.halfHeight
    },
    set: function (top) {
        this.setCenter(this.center.x, top + this.halfHeight)
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

    var x1 = Math.floor(x - (this.size.x >> 1) - camera.offset.x)
    var y1 = Math.floor(y - (this.size.y >> 1))

    var nudge = this.smoothServerNudge
    if (nudge) {
        var dt = Date.now()
        if (dt < nudge.start + nudge.duration) {
            nudge.currentAmount = 1 - (
                (dt - nudge.start) /
                nudge.duration)

            var ix = Math.floor(nudge.x * nudge.currentAmount)
            var iy = Math.floor(nudge.y * nudge.currentAmount)

            x1 -= ix
            y1 -= iy
        }
    }

    if (this.image && this.image.img) {
        ctx.drawImage(
            this.facingRight === false ? this.image.img.flipped : this.image.img,
            x1|0, y1|0)
    } else {
        ctx.fillStyle = this.color || 'black'
        ctx.fillRect(x1|0, y1|0, this.size.x, this.size.y)
    }
}

/*
 * Expects the ctx.fillStyle property to be "red".
 * If it needs to change the color it will put it back to red after.
 */
Entity.prototype.drawLifeBar = function (extrapolation) {
    var x = this.center.x + (this.direction.x * extrapolation)
    var y = this.center.y + (this.direction.y * extrapolation)
    var x1 = Math.floor(x - (this.size.x >> 1) - camera.offset.x)
    var y1 = Math.floor(y - (this.size.y >> 1))

    var nudge = this.smoothServerNudge
    if (nudge) {
        var ix = Math.floor(nudge.x * nudge.currentAmount)
        var iy = Math.floor(nudge.y * nudge.currentAmount)

        x1 -= ix
        y1 -= iy
    }

    var dim = 1.0
    if (this.maxLife !== 0) { dim = this.life / this.maxLife }

    if (/* Blink it! */ dim > 0.25 || ((Date.now() / 100)|0) % 2) {
        x1 |= 0
        var lifeY1 = (y1 - (this.size.y / 3))|0
        var lifeW = (this.size.x * dim)|0
        ctx.fillRect(x1, lifeY1, lifeW, 2)
        if (dim < 1.0) {
            if (dim < 0.25) {
                ctx.fillStyle = 'yellow'
            } else {
                ctx.fillStyle = 'darkred'
            }
            ctx.fillRect(x1 + lifeW, lifeY1, this.size.x - lifeW, 2)
            ctx.fillStyle = 'red'
        }
    }
}

Entity.prototype.damage = function ({ amount, dealer }) {
    if (!isServer) { return; }
    if (this.dead) { return; }
    assert(!this.undying, 'trying to damage an undying entity');

    if (dealer === undefined) {
        assert(false, 'Entity#damage(): Cannot damage without a dealer or a null dealer (world)!')
    }

    if (ret.damageFilter && dealer != null && dealer !== this) {
        var newDamage = ret.damageFilter({ amount, dealer, damaged: this })
        if (!newDamage) { return }
        amount = newDamage.amount
        dealer = newDamage.dealer
    }

    if (this.maxLife === 0) {
        this.maxLife = this.life
    }

    if (isServer) {
        this.life -= amount || 10

        if (this.life <= 0) {
            this.die(dealer)
            this.life = 0;
        } else {
            if (this._ee)
                this.emit('damage', { amount, dealer });
            this.pushChange('setLife', [ this.life ]);
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
        return entities.indexOf(this) === -1
    }
});

Object.defineProperty(Entity.prototype, 'dynamic', {
    get: function () { return !this.solid }
});

Object.defineProperty(Entity.prototype, 'moving', {
    get: function () { return this._moving },
    set: function (newMoving) {
        this.setMoving(newMoving.x, newMoving.y)
    }
});

function pushGlobalChange(/* method, ...args */) {
    if (!isServer || !networld) { return }
    networld._changes.push([].slice.call(arguments))
}

Entity.prototype.pushChange = function (method, args) {
    return this._pushChangeImpl(method, args, false)
}

Entity.prototype.pushTimestampedChange = function (method, args) {
    return this._pushChangeImpl(method, args, true)
}

Entity.prototype._pushChangeImpl = function (method, args, timestamped) {
    if (!isServer) { return; }
    if (!networld) { return; }
    if (!this.id) { return; }  // I don't really exist yet, so no thanks.

    if (args && args.length) args.forEach((arg) => 
        assert.notEqual(typeof arg, 'undefined',
            'an argument to pushChange(' + method + '...) was undefined!'))
    assert.equal(typeof method, 'string', 'pushChange called without a method!')

    if (timestamped)
        var toPush = [Date.now(), method, this.id]
    else
        var toPush = [method, this.id]

    if (args && args.length) toPush.push.apply(toPush, args)

    this._changes.push(toPush);

    if (this._ee && this._ee._events) {
        if (this._ee._events.pushChange) this.emit('pushChange', method, args || []);
        if (this._ee._events['pushChange-'+method]) this.emit('pushChange-' + method, args || []);
    }
}

Entity.prototype.push3d = function (opt) {
    if (PROCESSING_SERVER_PACKETS) { return; }
    if (!isServer) { return }
    var authoritative = opt && opt.authoritative
    var args = [
        (this.center.x),
        (this.center.y)
    ];
    if (authoritative || this.direction.x !== 0 || this.direction.y !== 0) {
        args.push(
            this.direction.x,
            this.direction.y
        );
    }
    if (authoritative) args.push(true)
    this.pushTimestampedChange('set3d', args);
}

var _dieEv = Object.seal({ killer: null })
var _killEv = Object.seal({ entity: null, killer: null })
Entity.prototype.die = function (killer) {
    this.direction = vec.origin
    _killEv.entity = this
    _killEv.killer = killer
    ret.emit('kill', _killEv)
    if (this._ee) {
        _dieEv.killer = killer
        this.emit('die', _dieEv)
    }
    entities.remove(this)
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

    var keys = Object.keys(this)
    var i = keys.length;
    while (i--) {
        if (keys[i][0] === '_') { continue }
        if (
                (typeof this[keys[i]] !== 'object' && typeof this[keys[i]] !== 'function') ||
                this[keys[i]] === null ||
                Object.isFrozen(this[keys[i]])
        ) {
            clone[keys[i]] = this[keys[i]]
        } else if (keys[i] === '_center' || keys[i] === 'direction') {
            if (!this[keys[i]] || Object.isFrozen(this[keys[i]])) {
                clone[keys[i]] = this[keys[i]]
            } else {
                clone[keys[i]] = vec(this[keys[i]])
            }
        }
    }

    return clone
}

var smoothServerNudgePool = abstractPool(() => Object.seal({
    start: 0.1,
    duration: 100,
    currentAmount: 0.1,
    x: 0.1,
    y: 0.1,
}), 100)
Entity.prototype.removeServerNudge = function () {
    assert(this.smoothServerNudge)
    smoothServerNudgePool.push(this.smoothServerNudge)
    this.smoothServerNudge = null
}
Entity.prototype.addServerNudge = function (newCenter, newDirection, ms) {
    if (!this.smoothServerNudge) {
        this.smoothServerNudge = smoothServerNudgePool.pop()
    }
    this.smoothServerNudge.start = Date.now()
    this.smoothServerNudge.duration = ms || 100
    this.smoothServerNudge.x = newCenter.x - this.center.x
    this.smoothServerNudge.y = newCenter.y - this.center.y
    if (newDirection) this.direction = newDirection
    this.center = newCenter
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
        this.addServerNudge(newCenter, newDirection, 400)
        this.cleanStatesAndInputs(0)
        return
    }

    var siOnServerSend = this.pastStatesAndInputs[
        packetAgeInFrames
    ];

    assert(siOnServerSend, 'packet age ' + packetAgeInFrames + ' could not be accessed in ' + this.pastStatesAndInputs.length + ' arr')
    var estimatedPositionOnSend =
        siOnServerSend && siOnServerSend.state.center

    if (!estimatedPositionOnSend) {
        this.addServerNudge(newCenter, newDirection, 100)
        this.cleanStatesAndInputs(0)
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
        if (si === this.pastStatesAndInputs[frame]) {
            this.logStatesAndInputs(frame)  // Update past records, 1984 style
        }
    }

    var frame = packetAgeInFrames + 1
    var butterflyOffBy = Infinity
    var currentButterflyOffBy
    while (frame--) {
        advanceMyCopy()
    }

    currentButterflyOffBy = vec.distance(this.center, miniMe.center)
    if (currentButterflyOffBy < butterflyOffBy) {
        butterflyOffBy = currentButterflyOffBy
        newCenter = miniMe.center
        newDirection = miniMe.direction
    }

    if (butterflyOffBy > 6) {
        // Major, disruptive, snapping update
        this.addServerNudge(newCenter, newDirection, 400)
        this.cleanStatesAndInputs(0)
        return
    }

    // Scooch a bit to the side
    // Validate a scooch first, we don't want to scooch above a platform we can't get to
    var scoochCenter = vec({
        x: (this.center.x + newCenter.x) / 2,
        y: (this.center.y + newCenter.y) / 2,
    })

    if (entities.collidingWithSolid({ center: scoochCenter, size: this.size }).length) {
        // Forget it, we were probably going to scooch below a platform
        // This won't avoid us scooching into places we can't reach but it's a start.
        this.addServerNudge(newCenter, newDirection, 100)
        this.cleanStatesAndInputs(0)
        return
    }

    // The scooch appears to be valid!
    this.addServerNudge(scoochCenter, newDirection, 100)
    this.cleanStatesAndInputs(packetAgeInFrames)
}

Entity.prototype.setMoving_net = function (x, y, cx, cy, dx, dy) {
    this._moving = vec({ x: x, y: y });
    if (arguments.length === 4) {
        this.set3d(cx, cy)
    }
    if (arguments.length === 6) {
        this.set3d(cx, cy, dx, dy)
    }
}

Entity.prototype.setFacingRight = function (facingRight) {
    this.facingRight = !!facingRight
}

Entity.prototype.set3d = function (x, y, dx, dy, isAuthoritative) {
    var newCenter = vec({ x: x, y: y });
    if (arguments.length >= 4) {
        var newDirection = vec({ x: dx, y: dy });
    }

    var isCorrection = this.clientsidePrediction && !isServer && !isAuthoritative

    if (isCorrection && SERVER_PACKET_TIMESTAMP !== undefined) {
        PROCESSING_SERVER_CORRECTION = true
        this.applyServerCorrection(newCenter, newDirection)
        PROCESSING_SERVER_CORRECTION = false
        return
    }

    if (newDirection) this.direction = newDirection
    this.center = newCenter
}

Entity.prototype.explode = function (owner) {
    if (!isServer) { return }
    // TODO this is a change that spans many entities, why not update several with one packet? That way the packets all get there at the same time!
    owner = owner || this
    var ex = entities.construct(Explosion, this.center, owner)
    entities.push(ex)
    return ex
}

Entity.prototype.setLife = function (life) {
    if (this.maxLife === 0) {
        this.maxLife = life
    }
    this.life = life;
}

Entity.prototype.update = function (stateless) {
    var that = this;

    if (stateless !== true && this._ee) {
        this.emit('update');
    }

    if (this.moving ? this.moving.x !== 0 : this.direction.x !== 0) {
        this.facingRight = this.moving ? this.moving.x > 0 : this.direction.x > 0
    }

    if (this.direction.y != 0 || this.direction.x != 0) {
        this.setCenter(
            this.center.x + this.direction.x,
            this.center.y + this.direction.y
        )
    }

    if (!this.solid && !this.bumpless && !this.groundless) {
        var grounded = this.collideWithThings(stateless)
    }

    // Intention of movement
    if (this.moving) {  // Some entities don't do this
        if (this.moving.x === 0 && this.direction.x !== 0) {
            // Player tries to stop moving if he doesn't intend to move
            var newX = this.direction.x * (grounded ? this.deceleration : this.decelerationWhenNotGrounded);
            if (Math.abs(newX) < 0.1) { newX = 0; }
            this.setDirection(
                newX,
                this.direction.y
            )
            // But he's bad at it if he's not on the ground lol
        } else if (this.moving.x !== 0) {
            // Smooth into moving into a direction
            var left = this.moving.x - this.direction.x;
            var baseX = Math.abs(left) < 0.1 ? this.moving.x : this.direction.x;
            baseX += left * (grounded ? this.acceleration : this.accelerationWhenNotGrounded)
            this.setDirection(baseX, this.direction.y)
        }

        if (this.moving.y !== 0 && this.direction.y !== 0) {
            // Player tries to stop moving if he doesn't intend to move
            var newY = this.direction.y * 0.9;
            if (Math.abs(newY) < 0.1) { newY = 0; }

            this.setDirection(
                this.direction.x,
                newY
            )
        } else if (this.moving.y) {
            // Smooth into moving into a direction
            var top = this.moving.y - this.direction.y;
            var baseY = Math.abs(top) < 0.1 ? this.moving.y : this.direction.y;
            baseY += top * this.verticalAcceleration;
            this.setDirection(this.direction.x, baseY)
        }
    }

    var nudge
    if ((nudge = this.smoothServerNudge)) {
        if (Date.now() > nudge.start + nudge.duration) {
            this.removeServerNudge()
        }
    }

    if (this.clientsidePrediction && stateless !== true) {
        this.logStatesAndInputs()
    }

    if (this._thisFrameInputs) {
        this._thisFrameInputs.intendToShoot = false
        this._thisFrameInputs.intendToJump = false
        this._thisFrameInputs.intendToStopJump = false
    }
}

var _statesAndInputsPool = abstractPool(() => Object.seal({
    input: {
        moving: { x: 0, y: 0 },
        intendToShoot: true,
        intendToJump: true,
        intendToStopJump: true,
    },
    state: null,
}), 50)
Entity.prototype.logStatesAndInputs = function (specificFrameNumber) {
    var inputs = this._thisFrameInputs || {};

    // Copy immutable props of mine into a state+input object
    var thisState = _statesAndInputsPool.pop()
    thisState.input.moving = this.moving;
    thisState.input.intendToShoot = inputs && inputs.intendToShoot;
    thisState.input.intendToJump = inputs && inputs.intendToJump;
    thisState.input.intendToStopJump = inputs && inputs.intendToStopJump;
    thisState.state = this.cloneState();

    if (specificFrameNumber === undefined) {
        this.pastStatesAndInputs.unshift(thisState)

        while (this.pastStatesAndInputs.length > 48) {
            _statesAndInputsPool.push(this.pastStatesAndInputs.pop())
        }
    } else {
        assert(specificFrameNumber < this.pastStatesAndInputs.length)
        assert(0 <= specificFrameNumber)
        _statesAndInputsPool.push(this.pastStatesAndInputs[specificFrameNumber])
        this.pastStatesAndInputs[specificFrameNumber] = thisState;
    }
}
Entity.prototype.cleanStatesAndInputs = function (targetLength = 0) {
    while (this.pastStatesAndInputs.length > targetLength + 1) {
        _statesAndInputsPool.push(this.pastStatesAndInputs.pop())
    }
}

Entity.prototype.extrapolated = function (n) {
    var center = this.center  // it's computed, cache it!
    return vec({
        x: center.x + (this.direction.x * n),
        y: center.y + (this.direction.y * n)
    })
}

Entity.prototype.extrapolatedX = function (n) {
    return this.center.x + (this.direction.x * n)
}

Entity.prototype.collideWithThings = function (stateless) {
    var computeGravity = this.weight
    var computeMovementIntention = this.moving != null
    var computeBumping = !this.bumpless && (this.direction.x || this.direction.y)

    var _collidingWithMe = entities.collidingWithSolidLL(this)

    if ((computeGravity || computeMovementIntention) && this.direction.y >= 0) {
        var grounded = this.groundless ?
            null :
            this.grounded(_collidingWithMe)
    }

    // Gravity
    if (computeGravity) {
        if (!grounded) {
            this.setDirection(
                this.direction.x,
                Math.min(7, this.direction.y + this.weight)
            )
        } else if (this.direction.y !== 0 || this.center.y !== grounded) {
            this.setCenter(
                this.center.x,
                grounded
            )
            this.setDirection(
                this.direction.x,
                0
            )
        }
    }

    // Bump into things
    if (this.direction.x !== 0 && !this.bumpless) {
        var bumping = this.bumpingIntoSolid(_collidingWithMe)
        if (bumping != null) {
            if (this.direction.x < 0) {
                this.left = bumping
                this.setDirection(0, this.direction.y)
            } else if (this.direction.x > 0) {
                this.right = bumping
                this.setDirection(0, this.direction.y)
            }
        }

        // Bumping into the end of the world
        if (this.direction.x > 0 && this.right >= range[1]) {
            this.right = range[1]
            this.setDirection(0, this.direction.y)
        }
        if (this.direction.x < 0 && this.left <= range[0]) {
            this.left = range[0]
            this.setDirection(0, this.direction.y)
        }
    }

    if (this.direction.y < 0 && !this.bumpless) {
        // Bump into the ceiling of the world
        if (yRange) {
            if (this.top < yRange[0]) {
                this.top = yRange[0]
                this.setDirection(this.direction.x, 0)
            }
        }

        // Bump into ceilings
        for (var cur = _collidingWithMe; cur.entity; cur = cur.next) {
            if (Math.abs(cur.entity.bottom - this.top) > Math.max(-this.direction.y, 7)) { continue; }
            this.top = cur.entity.bottom
            this.setDirection(this.direction.x, 0)
            break
        }
    }

    if (stateless !== true && (grounded || _collidingWithMe.next) && this._ee && this._ee._events && this._ee._events.bump) {
        bumpev.collidingWithMe = _collidingWithMe
        bumpev.grounded = grounded
        this.emit('bump', bumpev)
    }

    return grounded
}
var bumpev = Object.seal({ collidingWithMe: null, grounded: null })

Entity.prototype.collide = function (other) {
    var otherHalfWidth = other.size.x / 2
    var otherHalfHeight = other.size.y / 2
    var otherRight = other.center.x + otherHalfWidth;
    var otherLeft = other.center.x - otherHalfWidth;
    var otherTop = other.center.y - otherHalfHeight;
    var otherBottom = other.center.y + otherHalfHeight;

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

Entity.prototype.grounded = function (_collidingWithMe) {
    if (this.groundless) { return null }
    var onSolid = this.groundedOnSolid(_collidingWithMe)
    if (onSolid != null) { return onSolid }
    var where = 100 - (this.size.y / 2)
    return this.center.y + (this.size.y / 2) >= 100 ?
        where :
        null
}

Entity.prototype.groundedOnSolid = function (_collidingWithMe) {
    var highest = null
    _collidingWithMe = _collidingWithMe || entities.collidingWithSolidLL(this)
    for (var cur = _collidingWithMe; cur.entity; cur = cur.next) {
        if (Math.abs(this.bottom - cur.entity.top) > Math.max(this.direction.y, 5)) { continue; }
        if (highest == null || cur.entity.top - this.halfHeight < highest) {
            highest = cur.entity.top - this.halfHeight;
        }
    }

    return highest
}

Entity.prototype.eligibleSolidBump = function (solid) {
    var bottomDifference = Math.abs(this.bottom - solid.top)
    if (this.direction.y > 0 && bottomDifference <= this.direction.y) { return false }
    var topDifference = Math.abs(this.top - solid.bottom)
    if (this.direction.y < 0 && topDifference <= -this.direction.y) { return false; }
    if (bottomDifference < 5) { return false }
    if (topDifference < 2) { return false }
    if (this.direction.x > 0 && Math.abs(solid.right - this.left) < this.direction.x) return false
    if (this.direction.x < 0 && Math.abs(this.right  - solid.left) < -this.direction.x) return false
    return true
}

Entity.prototype.bumpingIntoSolid = function (_collidingWithMe) {
    _collidingWithMe = _collidingWithMe || entities.collidingWithSolidLL(this)

    var leftOrRightMostNumber = NaN

    var cur = _collidingWithMe
    for (var cur = _collidingWithMe; cur.entity; cur = cur.next)
        if (this.eligibleSolidBump(cur.entity)) {
            var newChallenger = this.direction.x > 0 ? cur.entity.left : cur.entity.right
            if (isNaN(leftOrRightMostNumber)) {
                leftOrRightMostNumber = newChallenger
            } else if (this.direction.x > 0) {
                if (newChallenger < leftOrRightMostNumber) {
                    leftOrRightMostNumber = newChallenger
                }
            } else if (this.direction.x < 0) {
                if (newChallenger < leftOrRightMostNumber) {
                    leftOrRightMostNumber = newChallenger
                }
            }
        }

    if (isNaN(leftOrRightMostNumber)) {
        return
    }

    return leftOrRightMostNumber
}

Entity.prototype.tryJump = function () {
    if ((PROCESSING_SERVER_PACKETS && !PROCESSING_SERVER_CORRECTION) || this.grounded()) {
        this.jump()
    }
}

Entity.prototype.jump = function (atX, atY) {
    var dirX = this.direction.x
    var dirY = -(this.jumpSpeed || 4)
    if (arguments.length === 2) {
        this.set3d(atX, atY, dirX, dirY)  // Important to use set3d because clientside prediction
    } else {
        this.setDirection(
            this.direction.x,
            -(this.jumpSpeed || 4)
        )
    }
    if (this.clientsidePrediction && !PROCESSING_SERVER_PACKETS ||
            !this.clientsidePrediction && PROCESSING_SERVER_PACKETS ||
            isServer) {
        if (this._ee)
            this.emit('jump')
    }
    this.pushTimestampedChange('jump', [ this.center.x, this.center.y ])
    this.stopJumped = false
}

Entity.prototype.stopJump = function () {
    if (!this.grounded() && !this.stopJumped) {
        if (this.direction.y < -2) {
            this.setDirection(
                this.direction.x,
                this.direction.y * 0.75
            )
            this.stopJumped = true
            this.push3d()
        } else if (this.direction.y < 0) {
            this.setDirection(
                this.direction.x,
                this.direction.y * 0.5
            )
            this.stopJumped = true
            this.push3d()
        }
    }
}

// A player or an enemy.
function Player(center) {
    Entity.call(this)
    if (center) this.center = center
    this.facingRight = Math.random() > 0.5
    this.weapons = []
    this.life = 96
    this.stopJumped = false
    this.lastShot = 0
}

inherit(Player, Entity)

Player.prototype.size = vec({ x: 10, y: 15 })
Player.prototype.weight = 0.3
Player.prototype.acceleration = 1
Player.prototype.accelerationWhenNotGrounded = 0.3
Player.prototype.jumpSpeed = 10
Player.prototype.speed = 3
Player.prototype.weight = 0.9
Player.prototype.image = images.stickman


Player.prototype.packetProps = Object.freeze(
    Entity.prototype.packetProps.concat(['facingRight', 'playerId'])
)
Player.prototype.packetPropTypes = Object.freeze(
    Entity.prototype.packetPropTypes.concat(['boolean', 'number'])
)

var possibleDrops = [BazookaBullet, BodySlam]

Player.prototype.die = function () {
    if (isServer && Math.random() > 0.2) {
        var drop = entities.construct(AmmoDrop, {
            count: Math.floor(Math.random() * 30) + 1,
            bullet: possibleDrops[
                Math.floor(Math.random() * possibleDrops.length)]
        });
        drop.center = vec(this.center)
        entities.push(drop)
    }
    if (isServer) { this.explode() }
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
    if (this._ee)
        this.emit('weapon-info-change', pack)
    if (!PROCESSING_SERVER_PACKETS) {
        this.pushChange('addBullets', [ pack.bullet.name, pack.count ])
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
        if (!this.okToShoot(BulletClass, { didChange: true })) { return false }
    } else {
        BulletClass = this.weapons[0].bullet
        if (!this.okToShoot(BulletClass, { didChange: false })) { return false }
        this.weapons[0].count--;
        if (this.weapons[0].count === 0) {
            this.weapons.shift()
            this.pushChange('popWeapon')
        } else {
            this.pushChange('popBullet')
        }
        if (this._ee)
            this.emit('weapon-info-change', this.getCurrentWeapon())
    }
    
    var bullet = entities.construct(BulletClass, vec(this.center), this)

    bullet.center = vec(this.center)

    bullet.setDirection(
        (this.moving && this.moving.x !== 0) ? (this.moving.x > 0 ? bullet.speed : -bullet.speed) :
            this.facingRight ? bullet.speed : -bullet.speed,
        bullet.direction.y
    )
    entities.push(bullet);
}

var defaultRateLimit = 500
Player.prototype.okToShoot = function (BulletClass, { didChange }) {
    if (!this.lastShot) { this.lastShot = Date.now(); return true }

    var rateLimit = 'rateLimit' in BulletClass ? BulletClass.rateLimit : defaultRateLimit

    if (this.lastShot + rateLimit < Date.now()) {
        this.lastShot = Date.now(); return true
    }
}

Player.prototype.popWeapon = function () {
    if (this.weapons.length) {
        this.weapons.shift()
    }
    if (this._ee)
        this.emit('weapon-info-change', this.getCurrentWeapon())
}

Player.prototype.popBullet = function () {
    if (this.weapons.length) {
        this.weapons[0].count--
    }
    if (this._ee)
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
        if (!this._thisFrameInputs) { this._thisFrameInputs = Object.seal({ intendToShoot: false, intendToJump: false, intendToStopJump: false })}
        this._thisFrameInputs.intendToShoot = intendToShoot
        this._thisFrameInputs.intendToJump = intendToJump
        this._thisFrameInputs.intendToStopJump = intendToStopJump
        if (intendToShoot) { player.shoot(); }
        if (intendToJump && !intendToStopJump) { player.tryJump(); }
        if (intendToStopJump) { player.stopJump(); }
        intendToJump = intendToStopJump = false
    }

    player.on('update', onUpdate)

    // Introduce movement intention into player
    player.moving = vec.origin
    var intendToShoot, intendToJump, intendToStopJump
    
    var ret = new stream.Writable({ objectMode: true })

    ret.destroy = function () {
        player.removeListener('update', onUpdate)
    }

    ret._write = function onKeyData(data, _, next) {
        if (typeof data[0] === 'number') {
            var age = Date.now() - data.shift()
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
            if (SHOOT == keyCode) {
                intendToShoot = false
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
    this.playerId = -1
    this.clientsidePrediction = null
    this.pastStatesAndInputs = []
    this.smoothServerNudge = null
}

inherit(HumanPlayer, Player);


function Bullet(center, owner) {
    Entity.call(this)
    this.owner = owner
    this.center = center
}

inherit(Bullet, Entity)

Bullet.prototype.speed = 8
Bullet.prototype.size = vec({ x: 4, y: 4 })
Bullet.prototype.packetProps = Entity.prototype.packetProps.concat(Object.freeze([
    'owner'
]))
Bullet.prototype.packetPropTypes = Entity.prototype.packetPropTypes.concat(Object.freeze([
    'entity'
]))

Bullet.prototype.update = function () {
    Entity.prototype.update.call(this)

    var didHitSomething = null;

    var collidingWithMe = entities.collidingWithNonStaticLL(this)

    for (; collidingWithMe.entity; collidingWithMe = collidingWithMe.next) {
        if (ret.bulletExplodeFilter &&
                ret.bulletExplodeFilter({
                    owner: this.owner,
                    damaged: collidingWithMe.entity }) === false) {
            continue;
        }
        if (collidingWithMe.entity !== this.owner && collidingWithMe.entity !== this && collidingWithMe.entity.owner !== this.owner && !collidingWithMe.entity.ghost) {
            this.die(collidingWithMe.entity)
            return
        }
    }
}

function BazookaBullet(center, owner) {
    Bullet.call(this, center, owner)
    this.lifetime = 66;
}

BazookaBullet.displayName = 'BAZOOKA'

BazookaBullet.dropImage = images.ammoDrop

inherit(BazookaBullet, Bullet)

BazookaBullet.prototype.ephemeral = true

BazookaBullet.prototype.die = function (whatIHit) {
    Bullet.prototype.die.call(this)

    if (!isServer) { return; }

    var ExplosionClass = Explosion

    if (whatIHit && whatIHit instanceof Bullet) {
        // The explosion that happens when you hit a bullet is a CoolExplosion
        ExplosionClass = CoolExplosion
    }

    // Avoid duplicate explosions
    var expl = entities.construct(ExplosionClass, this.center, this.owner)
    if (!this.id) {
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
    BazookaBullet.call(this, center, owner)
    this.setDirection(
        this.direction.x,
        this.direction.y - 1.6
    )
}

MortarBullet.displayName = 'Mortar'

MortarBullet.rateLimit = 1000 / 4

inherit(MortarBullet, BazookaBullet)

MortarBullet.prototype.ephemeral = true
MortarBullet.prototype.weight = 0.4

MortarBullet.prototype.update = function () {
    BazookaBullet.prototype.update.call(this)
    this.setDirection(
        this.direction.x * 0.93,
        this.direction.y
    )
}


function BodySlam(center, owner) {
    Bullet.call(this, center, owner)
    this.size = vec({ x: 10, y: 10 })
    this.lifetime = 0
    this.isRight = true;
    this._updated = false;
    this._alreadyDamaged = {}
}

BodySlam.displayName = 'BODY SLAM'

BodySlam.dropImage = images.BODYSLAM

inherit(BodySlam, Bullet)

BodySlam.prototype.ephemeral = true

BodySlam.prototype.draw = function () {
    Explosion.prototype.draw.apply(this, arguments)
}
BodySlam.prototype.extrapolatedSize = function () {
    return Explosion.prototype.extrapolatedSize.apply(this, arguments)
}
BodySlam.prototype.update = function() {
    if (!this.owner) return this.die();
    if (!this._updated) {
        var moving = this.owner.moving || {}
        this.isRight = moving.x > 0 ? true :
                       moving.x < 0 ? false :
                       this.owner.facingRight === true ? true :
                       this.owner.facingRight === false ? false :
                       Math.random() > 0.5
        this._updated = true
        this.owner.direction = vec({
            x: this.owner.direction.x,
            y: this.owner.direction.y * 0.3
        })
    }

    this.size = this.extrapolatedSize(0)

    var x = this.isRight ? 6 : -6

    if (this.lifetime % 3 === 0) {
        x *= 1.5
    }

    if (this.lifetime % 4 === 0) {
        x *= 0.8
    }

    this.center = this.owner.center
    this.direction = this.owner.direction

    this.owner.direction = vec({
        x: x,
        y: this.owner.direction.y
    })

    if (isServer) {
        entities.collidingWith(this, { static: false, undying: false }).forEach((ent) => {
            if (ent === this.owner) return;
            if (ent.dead) return;
            if (ent.static) return;
            if (ent.weight) {
                ent.direction = vec({
                    x: this.owner.direction.x / 2,
                    y: ((this.owner.direction.y) - 2) * 3
                })
                ent.push3d({ authoritative: true })
            }
            var damaged = this._alreadyDamaged[ent.id]
            if (!damaged) {
                ent.damage({ amount: 13, dealer: this.owner })
                this._alreadyDamaged[ent.id] = true
            }
        })
    }

    if (this.lifetime++ > 10) {
        this.owner.direction = vec({
            x: this.owner.direction.x / 2,
            y: this.owner.direction.y
        })
        this.die()
    }
}

function Explosion(center, owner) {
    Entity.call(this)
    this.center = center || vec.origin
    this.owner = owner
    this.lifetime = 0
    this.size = this.extrapolatedSize(5)
}

inherit(Explosion, Entity)

Explosion.prototype.ephemeral = true

Explosion.prototype.findAffectedEntities = function () {
    var area = { center: this.center, size: { x: 30, y: 30 } }

    var owner = this.owner

    return entities.collidingWith(area, { undying: false })
}

Explosion.prototype.damageThings = function () {
    // Only the server can apply damage and blow people away.
    if (!isServer) { return; }
    this.findAffectedEntities()
    .forEach((ent) => {
        if (ent.weight) {
            var dx = this.center.x - ent.center.x
            var dy = this.center.y - ent.center.y + 2
            var push = this.pushForce || 7
            ent.direction = vec({
                x: dx < 0 ? push : -push,
                y: dy < 0 ? push : -push
            })
        }
        ent.damage({ amount: 10, dealer: this.owner })
        if ((ent.weight) && !ent.dead) {
            // Tell everyone where you're going to avoid the butterfly effect.
            ent.push3d({ authoritative: true })
        }
    })
}

Explosion.prototype.draw = function (extrapolation) {
    var size = this.extrapolatedSize(extrapolation)
    Entity.prototype.draw.apply(this, arguments);
    if (this.lifetime % 4 < 2) {
        ctx.fillStyle = 'yellow'
        ctx.fillRect((this.center.x - (size.x >> 2) - camera.offset.x)|0,
            (this.center.y - (size.y >> 2))|0,
            size.x, size.y)
    } else {
        ctx.strokeStyle = 'yellow'
        ctx.strokeRect((this.center.x - (size.x >> 2) - camera.offset.x)|0,
            (this.center.y - (size.y >> 2))|0,
            size.x >> 2, size.y >> 2)
    }
}

Explosion.prototype.extrapolatedSize = function (extrapolation) {
    return {
        x: ((this.lifetime + extrapolation) * 5)|0,
        y: ((this.lifetime + extrapolation) * 5)|0
    }
}

Explosion.prototype.update = function () {
    Entity.prototype.update.apply(this, arguments);

    if (this.lifetime === 1) {
        this.damageThings()
    }

    if (this.lifetime++ > 8) {
        this.die();
        return
    }

    this.size = this.extrapolatedSize(0)
    this.center = this.center  // Copy the center so the explosion is changed in the quad tree too!
}

// When a bullet hits a bullet, they give out a cool explosion!
function CoolExplosion() {
    Explosion.apply(this, arguments)
}

inherit(CoolExplosion, Explosion)

CoolExplosion.prototype.extrapolatedSize = function (extrapolation) {
    return {
        x: (((this.lifetime + extrapolation) + 3) * 3)|0,
        y: (((this.lifetime + extrapolation) + 3) * 3)|0
    }
}
CoolExplosion.prototype.draw = function(extrapolation) {
    var size = this.extrapolatedSize(extrapolation)
    Entity.prototype.draw.apply(this, arguments);
    if (this.lifetime % 4 < 2) {
        ctx.fillStyle = 'white'
        ctx.fillRect(this.center.x - (size.x >> 1) - camera.offset.x,
            this.center.y - (size.y >> 1) - camera.offset.y,
            size.x, size.y)
        ctx.fillStyle = 'black'
    } else {
        ctx.strokeStyle = 'black'
        ctx.strokeRect(this.center.x - (size.x >> 2) - camera.offset.x,
            this.center.y - (size.y >> 2) - camera.offset.y,
            size.x >> 1, size.y >> 1)
    }
}


function AmmoDrop(opt) {
    Entity.call(this)
    opt = opt || {}
    this.count = opt.count
    this.bullet = opt.bullet
    this.image = (this.bullet && this.bullet.dropImage) || images.ammoDrop
}

inherit(AmmoDrop, Entity)

AmmoDrop.prototype.ghost = true
AmmoDrop.prototype.size = vec({ x: 10, y: 16 })

AmmoDrop.prototype.packetProps = Object.freeze(
    Entity.prototype.packetProps.concat(['count', 'bullet'])
)
AmmoDrop.prototype.packetPropTypes = Object.freeze(
    Entity.prototype.packetPropTypes.concat(['number', 'class'])
)

AmmoDrop.prototype.update = function () {
    if (isServer) {
        var coll = entities.collidingWithInstanceOf(this, Player);

        if (coll[0]) {
            this.pickedUp()
            this.die()
            coll[0].addBullets(this)
            return
        }
    }
}

AmmoDrop.prototype.pickedUp = function () {
    if (this._ee)
        this.emit('picked-up')
    ret.pushGlobalChange('pickedUp', this.serialize())
}

AmmoDrop.prototype.draw = function () {
    var center = vec({
        y: -(Math.sin((Date.now()) * (4 / 1000)) * 3) + this.center.y,
        x: this.center.x
    })
    var x = center.x
    var y = center.y

    var x1 = Math.floor(x - (this.size.x / 2) - camera.offset.x)
    var y1 = Math.floor(y - (this.size.y / 2) - camera.offset.y)

    ctx.drawImage(
        this.image.img,
        x1, y1)
}

var entities = makeEntityCollection()

entities.on('remove', function (ent) {
    if (destroyed) return;
    if (ent._ee)
        ent.emit('remove')
})


var isServer = true  // We're a server unless a client networld comes along.
var networld
// Receives updates in its _onPacket function.
// When that happens, everything without an AI gets updated in the entity list.
function Networld(opt) {
    assert(!networld);
    networld = this
    this.entitiesByName = {};
    this.worldId = Math.round(Math.random() * 999999);
    this.lastId = -1;
    this.acquainted = {};
    this.serverClock = undefined
    this.isServer = opt && opt.isServer
    this._changes = []
    isServer = !!this.isServer
    ret.emit('networld', this)
}

inherit(Networld, events.EventEmitter)

Networld.prototype.destroy = function () {
    this.entitiesByName = null
    this.acquainted = null
    this.destroyed = true
    this._changes = []
    this._onPacket = () => assert(false, 'onPacket called on a destroyed networld!')
    this.commit = () => assert(false, 'commit called on a destroyed networld!')
}

function entitiesToSend(recentlyRemoved) {
    var ret = []
    var i = recentlyRemoved.length;
    while ( i-- ) {
        if (!!recentlyRemoved[i].id && !recentlyRemoved[i].ephemeral)
            ret.push(['remove', recentlyRemoved[i].id])
    }
    return ret
}

function objRound(obj) {
    var out = {}
    for (var k in obj) if (obj.hasOwnProperty(k)) {
        out[k] = recursiveRound(obj[k])
    }
    return out
}

function arrRound(arr) {
    return arr.map(arrItem => recursiveRound(arrItem))
}

function recursiveRound(item) {
    return  typeof item === 'number' ? round3(item) :
            item instanceof Array ? arrRound(item) :
            item == null ? item :
            typeof item === 'object' ? objRound(item) :
        item
}

function roundChange(change) {
    for (var i = 1; i < change.length; i++) {
        change[i] = recursiveRound(change[i])
    }
    return change
}

Networld.prototype.commit = function () {
    assert(this.isServer !== false, 'do not call commit() on a client networld!')

    var somethingChanged = false;
    
    var changedEnts = entities
        .map((ent) => {
            if (ent.syncable === false) { return }
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
    var recentlyRemoved = entitiesToSend(entities.recentlyRemoved = entities.recentlyRemoved || [])

    for (var i = 0; i < recentlyRemoved.length; i++) {
        delete this.acquainted[recentlyRemoved[i][1]]
    }

    var ret = new Array();

    for (var i = 0; i < changedEnts.length; i++)
        ret.push(roundChange(changedEnts[i]))

    for (var i = 0; i < this._changes.length; i++)
        ret.push(roundChange(this._changes[i]))

    for (var i = 0; i < recentlyRemoved.length; i++)
        ret.push(recentlyRemoved[i])

    changedEnts.length = 0
    this._changes.length = 0
    entities.recentlyRemoved.length = 0
    recentlyRemoved.length = 0
    return ret
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
        localPlayer = this._applyAddPacket(opArgs[0], opArgs[1])
        if (camera) camera.player = localPlayer
        this.emit('you', localPlayer)
    } else if (op === 'add') {
        this._applyAddPacket(opArgs[0], opArgs[1])
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

Networld.prototype._applyAddPacket = function (className, update) {
    assert(this.isServer !== true, 'do not call _applyAddPacket() on a server networld!')

    var Class = ret[className];
    assert(Class !== undefined, 'Got a packet with ' + className + ', which is not a class')
    assert(typeof Class === 'function' && Class.prototype instanceof Entity, 'Class ' + className + ' does not inherit Entity!')
    assert(typeof update === 'object' && update !== null)
    assert(typeof update.x[0] === 'number', 'every "add" entity update should have an "id"!')
        
    var ent = entityById(update.x[0])
    if (!ent) {
        ent = entities.construct(Class);
        ent.remoteUpdate(update);
        entities.push(ent)
    } else {
        assert(ent instanceof Class, 'found an entity which is not an instance of the correct class! Entity ' + ent.id + ' is an instance of ' + ent.__proto__.constructor.name + ' but the packet said ' + Class.name);
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

var destroyed = false
function destroy() {
    entities = null
    destroyed = true
}

function mpSetTimeout(fn, ms) {
    return setTimeout(function () {
        if (destroyed) { return; }
        fn()
    }, ms)
}

function mpSetInterval(fn, ms) {
    var interv
    return (interv = setInterval(function () {
        if (destroyed) { return clearInterval(interv); }
        return fn()
    }, ms))
}

var ret = new events.EventEmitter()

ret.setTimeout = mpSetTimeout
ret.setInterval = mpSetInterval
ret.clearTimeout = clearTimeout
ret.clearInterval = clearInterval
ret.pushGlobalChange = pushGlobalChange
ret.getPlayerClass = getPlayerClass
ret.getSpawnPoint = getSpawnPoint
ret.BazookaBullet = BazookaBullet
ret.MortarBullet = MortarBullet
ret.HumanPlayer = HumanPlayer
ret.entityById = entityById
ret.Explosion = Explosion
ret.CoolExplosion = CoolExplosion
ret.BodySlam = BodySlam
ret.Networld = Networld
ret.AmmoDrop = AmmoDrop
ret.Bullet = Bullet
ret.Player = Player
ret.Entity = Entity
ret.destroy = destroy
ret.TPS = TPS

Object.defineProperty(ret, 'destroyed', { get: () => destroyed })

Object.defineProperty(ret, 'networld', { get: () => networld })

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
Object.defineProperty(ret, 'yRange', {
    get: () => yRange,
    set: function (yRang) { yRange = yRang }
})
Object.defineProperty(ret, 'perfTrack', {
    get: () => perfTrack,
    set: function (tr) { perfTrack = tr }
})

return ret;

};

module.exports.vec = vec    
