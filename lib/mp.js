'use strict'

var assert = require('assert')
var stream = require('stream')
var images = require('./images.js')
var Camera = require('./camera.js')

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

module.exports = function makeMP() {

var PROCESSING_SERVER_PACKETS = false;

var camera = new Camera(vec({ x: 0, y: 0 }))

var ctx  // Set as a property

var TPS = 24  // ticks per second

var util = require('util')

var inherit = util.inherits

var groundY = 100

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
    this.weight = 0
    this.speed = 1
    this.onUpdateFns = []
    this.packetProps = ['direction', 'center']  // Props which get serialized and updated
    this.life = -1
    this._changes = [];
}

Entity.prototype.remoteUpdate = function (packet) {
    var that = this;
    this.packetProps.forEach(function (name) {
        if (name in packet) {
            that[name] = packet[name]
        }
    })

    if ('id' in packet && !('id' in this)) {
        this.id = packet.id;
    }
}

Entity.prototype.serialize = function () {
    var out = {}
    var that = this
    this.packetProps.forEach(function (name) {
        out[name] = this[name]
    }.bind(this))
    if (!this.id) { this.id = Math.random() }
    out.id = this.id
    return out;
}

Object.defineProperty(Entity.prototype, 'left', {
    get: function () {
        return this.center.x - this.halfWidth
    }
});

Object.defineProperty(Entity.prototype, 'right', {
    get: function () {
        return this.center.x + this.halfWidth
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
    var center = this.extrapolated(extrapolation)
    var x1 = center.x - (this.size.x / 2) - camera.offset.x
    var y1 = center.y - (this.size.y / 2) - camera.offset.y

    assert(!isNaN(x1), 'x1 is NaN')
    assert(!isNaN(y1), 'y1 is NaN')

    if (this.image) {
        ctx.drawImage(this.image, x1, y1)
    } else {
        ctx.fillRect(x1, y1, this.size.x, this.size.y)
    }
}

Entity.prototype.damage = function (damas) {
    assert(!this.dead, 'trying to damage a dead entity!');
    assert(!this.undying, 'trying to damage an undying entity');

    this.life -= damas || 10

    if (this.life <= 0) {
        this.die()
        this.life = 0;
    }
}

Object.defineProperty(Entity.prototype, 'undying', {
    get: function () { return this.life == -1; }
});

Object.defineProperty(Entity.prototype, 'dead', {
    get: function () {
        var that = this;
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

Object.defineProperty(Entity.prototype, 'moving', {
    get: function () { return this._moving },
    set: function (newMoving) {
        if (!this._moving || this._moving.x != newMoving.x || this._moving.y != newMoving.y) {
            this._moving = newMoving;
            if (this.id) {
                this.pushChange('setMoving', newMoving);
                this.pushChange('set3d', this.center, this.direction);
            }
        }
    }
});


Entity.prototype.pushChange = function (method) {
    if (!networld) { return; }
    var args = [].slice.call(arguments, 1)
    args.forEach((arg) => 
        assert.notEqual(typeof arg, 'undefined',
            'an argument to pushChange was undefined!'))
    assert.equal(typeof method, 'string', 'pushChange called without a method!')
    assert(this.id, 'Entity has no id!')

    this._changes.push([method, this.id].concat(args));
}

Entity.prototype.die = function () {
    var thisEnt = this
    entities = entities.filter(function(ent) {
        return ent !== thisEnt
    })
    this.direction = vec.origin
}

Entity.prototype.distanceTo = function (other) {
    if (other instanceof Entity) { other = other.center }
    assert(('x' in other) && ('y' in other), 'other is not a vector!')

    var xDist = Math.abs(other.x - this.center.x)
    var yDist = Math.abs(other.y - this.center.y)
    return Math.sqrt((xDist * xDist) + (yDist * yDist))
}

Entity.prototype.setMoving = function (newMoving) {
    this._moving = newMoving;
    if (!PROCESSING_SERVER_PACKETS) {
        // If not already processing server packets, push a set3d change
        this.pushChange('set3d', this.center, this.direction)
    }
}

Entity.prototype.set3d = function (pos, dir) {
    this.center = vec(pos);
    this.direction = vec(dir);
}

Entity.prototype.update = function () {
    var that = this;
    
    for (var i = 0; i < this.onUpdateFns.length; i++) {
        if (this.onUpdateFns[i].call(this) === false) { return; }
    }

    assert(isVec(this.center),
        this.constructor.name + ' instance does not have a center!');

    this.center = this.extrapolated(1)

    if (this.direction.x !== 0) {
        this.facingRight = this.direction.x > 0
    }

    // Gravity
    if (('weight' in this) && typeof this.grounded === 'function') {
        var yGrounded = this.grounded()
        if (!yGrounded) {
            this.direction = vec({
                y: this.direction.y + this.weight,
                x: this.direction.x
            })
        } else {
            this.center = vec({
                y: yGrounded,
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
            var newX = this.direction.x * (this.grounded() ? 0.5 : 0.9);
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
            baseX += left * (this.grounded() ? 0.2 : 0.05)
            this.direction = vec({ x: baseX, y: this.direction.y })
        }
    }


    if (this.center.y > groundY - (this.size.y / 2))
        this.center = vec({ x: this.center.x, y: groundY - (this.size.y / 2) })
}

Entity.prototype.extrapolated = function (n) {
    assert(n >= 0, 'cannot extrapolate negatively');
    assert(n <= 1, 'cannot extrapolate more than 1 frame. Use update() for that');
    return {
        x: this.center.x + (this.direction.x * n),
        y: this.center.y + (this.direction.y * n)
    }
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
    var halfWidth = this.size.x / 2
    var halfHeight = this.size.y / 2

    var otherHalfWidth = other.size.x / 2
    var otherHalfHeight = other.size.y / 2

    assert('left' in this);
    assert('right' in this);
    assert('top' in this);
    assert('bottom' in this);

    assert('left' in other);
    assert('right' in other);
    assert('top' in other);
    assert('bottom' in other);

    return (
        this.left < other.right &&
        this.right > other.left &&
        this.top < other.bottom &&
        this.bottom > other.top)
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
    var player = this
    var where = 100 - (this.size.y / 2)
    return this.center.y + (this.size.y / 2) >= 100 ?
        where :
        false
}

Entity.prototype.tryJump = function () {
    if (PROCESSING_SERVER_PACKETS || this.grounded()) {
        this.direction = vec({
            x: this.direction.x,
            y: this.direction.y - (this.jumpSpeed || 4)
        })
        if (!PROCESSING_SERVER_PACKETS) {
            this.pushChange('tryJump');
            this.pushChange('set3d', this.center, this.direction);
        }
    }
}

Entity.prototype.stopJump = function () {
    if (!this.grounded()) {
        if (this.direction.y < 0) {
            this.direction = vec({
                y: this.direction.y * 0.3,
                x: this.direction.x
            })
        }
        this.pushChange('stopJump');
    }
}

Entity.prototype.onUpdate = function (cb) {
    this.onUpdateFns.push(cb);
}


// A player or an enemy.
function Player(center) {
    Entity.call(this)
    if (center) this.center = center
    this.facingRight = Math.random() > 0.5
    this.size = vec({ x: 20, y: 30 })
    this.weight = 0.3
    this.weapons = []

    this.image = images.stickman

    this.life = 96
}

inherit(Player, Entity)

Player.prototype.die = function () {
    if (Math.random() > 0.5) {
        var drop = new AmmoDrop({
            count: Math.floor(Math.random() * 30),
            bullet: possibleDrops[
                Math.floor(Math.random() * possibleDrops.length)]
        });
        drop.center = vec(this.center)
        entities.push(drop)
    }
    Entity.prototype.die.apply(this, arguments)
}

Player.prototype.addBullets = function (pack) {
    assert(typeof pack.count === 'number' && !isNaN(pack.count),
        'The bullet pack\'s `count` prop must be a number!');
    assert(typeof pack.bullet === 'function' && pack.bullet.prototype instanceof Bullet,
        'The bullet pack\'s `bullet` prop must be a class, and an instance of Bullet!');

    this.weapons.unshift(pack)
}

Player.prototype.shoot = function () {
    var BulletClass

    if (this.weapons.length === 0) {
        BulletClass = MortarBullet
    } else {
        BulletClass = this.weapons[0].bullet
        this.weapons[0].count--;
        if (this.weapons[0].count === 0) {
            this.weapons.shift()
        }
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

Player.prototype.createWriteStream = function () {
    var LEFT = 37
    var RIGHT = 39
    var JUMP = 38
    var SHOOT = 32
    
    var wasMovingLeft
    var wasMovingRight

    var player = this;

    player.onUpdate(function () {
        if (intendToShoot) { player.shoot(); }
        if (intendToJump && !intendToStopJump) { player.tryJump(); }
        if (intendToStopJump) { player.stopJump(); }
        intendToShoot = intendToJump = intendToStopJump = false
    })

    // Introduce movement intention into player
    player.moving = vec.origin
    var intendToShoot, intendToJump, intendToStopJump
    
    var ret = new stream.Writable({ objectMode: true })

    ret._write = function onKeyData([type, keyCode], _, next) {
        if (type === 'keyup') {
            if (LEFT == keyCode) {
                if (wasMovingLeft) { player.moving = vec.origin }
            }
            if (RIGHT == keyCode) {
                if (wasMovingRight) { player.moving = vec.origin }
            }
            if (SHOOT == keyCode) {
                intendToShoot = true
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
        }
        next()
    }
    
    return ret
}

function HumanPlayer() {
    Player.apply(this, arguments);
    assert(!window._humanplayercreated, 'Cannot create more than 1 HumanPlayer!');
    window._humanplayercreated = true;
    this.jumpSpeed = 5
    this.speed = 5
    this.weight = 0.3
}

HumanPlayer.netName = 'Player'

var possibleDrops = [BazookaBullet]

inherit(HumanPlayer, Player);


HumanPlayer.prototype.drawLifeThing = function () {
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(2, 1, this.life, 5)
}


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

    var thisBullet = this;

    var didHitSomething = this.didHitSomething ? this.didHitSomething() : entities.some(function (ent) {
        if (ent instanceof Player && ent !== thisBullet.owner) {
            if (ent.collide(thisBullet)) {
                ent.die()
                return true /* it's a hit lel */
            }
        }
    })

    if (didHitSomething) {
        this.die()
    }
}

function BazookaBullet(center, owner) {
    Bullet.call(this, center, owner)
    this.lifetime = 66;
}

inherit(BazookaBullet, Bullet)

BazookaBullet.prototype.die = function () {
    Bullet.prototype.die.call(this)

    entities.push(new Explosion(this.center, this.owner));
}

BazookaBullet.prototype.update = function () {
    Bullet.prototype.update.call(this);
    this.lifetime--;
    if (this.lifetime <= 0) { this.die(); return; }
}


function MortarBullet(center, owner) {
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
    var explosion = this

    entities
    .filter((ent) => ent instanceof Player)
    .filter((ent) => ent.collide(this))
    .forEach(function (ent) {
        var dx = this.center.x - ent.center.x
        var dy = Math.max(this.center.y - ent.center.y - 2, 0) + 2
        ent.direction = vec({
            x: -dx,
            y: -dy / 3
        })
        ent.damage(10)
    }.bind(this))
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

    if (this.lifetime++ > 8) {
        this.die();
    }

    this.size = this.extrapolatedSize(0)

    this.damageThings()
}

function AmmoDrop(opt) {
    Entity.call(this)
    opt = opt || {}
    this.count = opt.count
    this.bullet = opt.bullet
    this.packetProps = this.packetProps.concat(['count'])
    this.size = vec({ x: 10, y: 30 })
}

inherit(AmmoDrop, Entity)

AmmoDrop.prototype.serialize = function () {
    var ret = Entity.prototype.serialize.apply(this, arguments)
    ret.bullet = this.bullet.name || this.bullet.netName
    return ret
}

AmmoDrop.prototype.remoteUpdate = function (update) {
    Entity.prototype.remoteUpdate.apply(this, arguments)
    this.bullet = ret[update.bullet];
    assert(this.bullet, 'AmmoDrop#remoteUpdate: unknown bullet ' + update.bullet);
}

AmmoDrop.prototype.update = function () {
    var coll = entities
        .filter((ent) => ent instanceof Player)
        .filter((ent) => ent.collide(this))
    
    if (coll[0]) {
        coll[0].addBullets(this)
        this.die()
        return
    }

    this.direction = vec({
        x: 0,
        y: this.grounded() ? 0 : 0.1
    })
}


var entities = [

]

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



// Receives updates in its _onPacket function.
// When that happens, everything without an AI gets updated in the entity list.
function Networld(opt) {
    this.entitiesByName = {};
    this.worldId = Math.round(Math.random() * 999999);
    this.lastId = -1;
    this.version = 1;
    this.lastVersions = {};
    this.isServer = opt && opt.isServer
}

Networld.prototype.commit = function () {
    assert(this.isServer !== false, 'do not call commit() on a client networld!')

    var somethingChanged = false;
    
    var changedEnts = entities
        .map(function didChange(ent) {
            if (!ent.id) ent.id = Math.random();

            if (!(ent.id in this.lastVersions)) {
                this.lastVersions[ent.id] = true;
                return [this.createAddPacket(ent)]
            } else if (ent._changes.length) {
                var ret = ent._changes;
                ent._changes = [];
                return ret;
            }
        }.bind(this))
        .filter((changes) => !!changes)
        .reduce(((a, b) => a.concat(b)), [])

    var diedEnts = Object.keys(this.lastVersions)
        .map((id) => +id)
        .filter(function didDie(id) {
            var ent = entityById(id);
            return !ent || ent.dead;
        })

    diedEnts.forEach(function (id) { delete this.lastVersions[id] }.bind(this))

    diedEnts = diedEnts.map((id) => ['remove', id])

    var events = changedEnts.concat(diedEnts)

    if (events.length) {
        this.version++;
        console.log(events)
    }

    return events
}

Networld.prototype.createAddPacket = (ent) => [
    'add',
    ent.constructor.netName || ent.constructor.name,
    ent.serialize()
]

Networld.prototype._onPacket = function (packet) {
    assert(this.isServer !== true, 'do not call _onPacket() on a server networld!')

    PROCESSING_SERVER_PACKETS = true;

    var op = packet[0];
    var opArgs = packet.slice(1);

    try {
        this._applyPacket(op, opArgs, packet);
    } catch(e) {
        console.error(e);
    }

    PROCESSING_SERVER_PACKETS = false;
}

Networld.prototype._applyPacket = function (op, opArgs, packet) {
    if (op === 'add') {
        var Cls = ret[opArgs[0]] || window[opArgs[0]];
        var packet = opArgs[1];

        assert(Cls !== undefined, 'Got a packet with ' + opArgs[0] + ', which is not a class')
        assert(typeof Cls === 'function' && Cls.prototype instanceof Entity, 'Class ' + opArgs[0] + ' does not inherit Entity!');
        assert(typeof packet === 'object' && packet !== null)

        assert(packet.id, 'every "add" entity descriptor should have an "id"!')
        
        this._applyUpdate(Cls, packet)
    } else if (op === 'remove') {
        var id = opArgs[0]
        assert(typeof id === 'number', 'id is not a number!')
        entities = entities.filter((ent) => ent.id !== id)
    } else if (typeof opArgs[0] == 'number') {
        var ent = entityById(opArgs[0]);
        assert(ent, 'Trying to apply an update to an unexisting entity ' + opArgs[1]);
        ent[op].apply(ent, opArgs.slice(1));
    } else {
        assert(false, 'unknown packet ' + JSON.stringify(packet));
    }
}

Networld.prototype._applyUpdate = function (Class, update) {
    assert(this.isServer !== true, 'do not call _applyUpdate() on a server networld!')

    var ent = entityById(update.id)
    if (!ent) {
        ent = new Class();
        entities.push(ent)
    } else {
        assert(ent instanceof Class, 'found an entity which is not an instance of the correct class!');
    }

    ent.remoteUpdate(update);
}

function entityById(id) {
    var thisEnt = entities.filter((ent) => ent.id === id)
    assert(thisEnt.length <= 1, 'More than one entity in this world has ID ' + id);
    return thisEnt[0] || null;
}


var ret = {
    BazookaBullet: BazookaBullet,
    MortarBullet: MortarBullet,
    HumanPlayer: HumanPlayer,
    entityById: entityById,
    Explosion: Explosion,
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
    get: () => entities,
    set: function (newEnts) { entities = newEnts; }
})
Object.defineProperty(ret, 'ctx', {
    get: () => ctx,
    set: function (newCtx) { ctx = newCtx; }
})
Object.defineProperty(ret, 'camera', {
    get: () => camera,
    set: function (newCam) { camera = newCam; }
})

return ret;

};
