'use strict'

function assert(assumption, message) {
    if (!assumption) {
        throw new Error(message || 'Assertion Error')
    }
}

function inherit(Child, Base) {
    assert(typeof Base === 'function', 'inherit(Base, Child): Base is not a function!')
    assert(typeof Child === 'function', 'inherit(Base, Child): Child is not a function!')
    Child.prototype = Object.create(Base.prototype);
    Child.prototype.constructor = Child;
}

var groundY = 100

function BaseAI() {
}

BaseAI.prototype.control = function(entity) {
    throw new Error('BaseAI subclass ' + this.constructor.name +
        'does not implement prototype.control()');
}

function Entity(center) {
    this.direction = { x: 0, y: 0 }
    this.center = center || { x: 0, y: 0 }
    this.weight = 0
    this.speed = 1
    this.onUpdateFns = []
    this.life = -1
}

Entity.prototype.remoteUpdate = function (packet) {
    var that = this;
    ['direction', 'center', 'life'].concat(this.packetProps || []).forEach(function (name) {
        if (name in packet) {
            that[name] = packet[name]
        }
    })

    if ('id' in packet && !('id' in this)) {
        this.id = packet.id;
    }
}

Entity.prototype.serialize = function () {
    return {
        id: this.id,
        direction: this.direction,
        center: this.center,
        life: this.life
    }
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

Entity.prototype.draw = function () {
    var x1 = this.center.x - (this.size.x / 2) - camera.offset.x
    var y1 = this.center.y - (this.size.y / 2) - camera.offset.y

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

Entity.prototype.die = function () {
    var thisEnt = this
    entities = entities.filter(function(ent) {
        return ent !== thisEnt
    })
}

Entity.prototype.distanceTo = function (other) {
    if (other instanceof Entity) { other = other.center }
    assert(('x' in other) && ('y' in other), 'other is not a vector!')

    var xDist = Math.abs(other.x - this.center.x)
    var yDist = Math.abs(other.y - this.center.y)
    return Math.sqrt((xDist * xDist) + (yDist * yDist))
}

Entity.prototype.update = function () {
    var that = this;
    
    for (var i = 0; i < this.onUpdateFns.length; i++) {
        if (this.onUpdateFns[i].call(this) === false) { return; }
    }

    assert(typeof this.center === 'object',
        this.constructor.name + ' instance does not have a center!');
    assert(typeof this.grounded === 'function',
        this.constructor.name + ' instance does not have a grounded() function, it has ' + JSON.stringify(this.grounded));
    this.center.x = this.center.x + (this.grounded() ? 1 : 0.9) * this.direction.x
    this.center.y = this.center.y + this.direction.y

    if (this.direction.x !== 0) {
        this.facingRight = this.direction.x > 0
    }

    // Gravity
    var yGrounded = this.grounded()
    if (!yGrounded) {
        this.direction.y += ('weight' in this) ? this.weight : 0.1
    } else {
        this.center.y = yGrounded
        this.direction.y = 0
    }

    // Intention of movement
    if (this.moving) {  // Some entities don't do this
        if (this.moving.x === 0 && this.direction.x !== 0) {
            // Player tries to stop moving if he doesn't intend to move
            this.direction.x *= this.grounded() ? 0.8 : 0.95;
            if (Math.abs(this.direction.x) < 0.1) { this.direction.x = 0; }
            // But he's bad at it if he's not on the ground lol
        } else if (this.moving.x !== 0) {
            // Smooth into moving into a direction
            var left = this.moving.x - this.direction.x;
            if (Math.abs(left) < 0.1) { this.direction.x = this.moving.x; }
            this.direction.x += left * (this.grounded() ? 0.2 : 0.05)
        }
    }

    if (this.center.y > groundY - (this.size.y / 2))
        this.center.y = groundY - (this.size.y / 2)
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
    var onPlatform = this.groundedOnPlatform()
    if (onPlatform) return onPlatform.center.y - this.halfHeight - onPlatform.halfHeight
    return this.center.y + (this.size.y / 2) >= 100 ?
        where :
        false
}

Entity.prototype.groundedOnPlatform = function () {
    var player = this;
    var ret = null;

    var halfWidth = player.size.x / 2
    var halfHeight = player.size.y / 2


    function isGroundedOnThisPlatform(ent) {
        if (ent instanceof Block) {
            var entHalfWidth = ent.size.x / 2
            var entHalfHeight = ent.size.y / 2

            var p = 5 // We give the box's "ground" area a tiny height because this is a rect collision algorithm.

            var collides = (
                player.center.x < ent.center.x + entHalfWidth &&
                player.center.x > ent.center.x - entHalfWidth &&

                player.center.y + halfHeight < ent.center.y - entHalfHeight + p &&
                player.center.y + halfHeight > ent.center.y - entHalfHeight)

            if (collides) {
                ret = ent
                return true
            }
        }
    }

    var key = player.center.x

    var i = (function bisectX(min, max) {
        if (min >= max) { return min; }

        var testI = Math.floor((min + max) / 2)

        var testee = sortedBlocks[testI];

        var cmp = testee.center.x + (testee.size.x / 2)

        if (cmp > key) {
            return bisectX(min, testI - 1)
        } else if (cmp < key) {
            return bisectX(testI + 1, max)
        } else {
            return testI
        }
    }(0, sortedBlocks.length));

    var maxI = i + 10;

    for (i; i < maxI; i++) {
        if (isGroundedOnThisPlatform(sortedBlocks[i])) {
            return sortedBlocks[i]
        }
    }

    return ret;
}

Entity.prototype.tryJump = function () {
    if (this.grounded()) {
        this.direction.y -= (this.jumpSpeed || 2)
    }
}

Entity.prototype.stopJump = function () {
    if (!this.grounded()) {
        if (this.direction.y < 0) {
            this.direction.y *= 0.3
        }
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
    this.size = { x: 20, y: 30 }
    this.weight = 0.1

    this.image = null
    
    this.weapons = []

    this.image = new Image()
    this.image.src = 'stickman.png'

    this.life = 96
}

inherit(Player, Entity)

Player.prototype.addBullets = function (pack) {
    assert(typeof pack.count === 'number' && !isNaN(pack.count),
        'The bullet pack\'s `count` prop must be a number!');
    assert(typeof pack.bullet === 'function' && pack.bullet.prototype instanceof Bullet,
        'The bullet pack\'s `bullet` prop must be a class, and an instance of Bullet!');

    this.weapons.unshift(pack)
}

Player.prototype.shoot = function () {
    var shootBullet = function (bullet) {
        bullet.direction.x = this.facingRight ?
            bullet.speed :
            -bullet.speed;
        entities.push(bullet);
    }.bind(this);
    
    if (this.weapons.length === 0) {
        shootBullet(new MortarBullet({
            x: this.center.x, y: this.center.y }, this))
    } else {
        shootBullet(new (this.weapons[0].bullet))
        this.weapons[0].count--;
        if (this.weapons[0].count === 0) {
            this.weapons.shift()
        }
    }
}

function HumanPlayer() {
    Player.apply(this, arguments);
    this.jumpSpeed = 4
    this.speed = 2.2
    this.weight = 0.15
}

inherit(HumanPlayer, Player);


HumanPlayer.prototype.drawLifeThing = function () {
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(2, 1, this.life, 5)
}


function Dog() {
    Player.apply(this, arguments)
    this.size = { x: 10, y: 10 }
    this.biting = undefined
    this.image = null;
    this.biteStrengthLeft = 100;
    this.speed = 0.5
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

    this.biteTarget.damage(0.1)

    this.center.x = this.biteTarget.center.x + this.biteCoords.x
    this.center.y = this.biteTarget.center.y + this.biteCoords.y
}

Dog.prototype.bite = function (player) {
    if (player.dead) debugger
    assert(!player.dead, 'player\'s dead lol')
    assert(this.biteStrengthLeft >= 100, 'cant bite before biteStrengthLeft is 100')
    this.biting = true
    this.biteTarget = player;
    this.biteCoords = {
        x: this.center.x - this.biteTarget.center.x,
        y: this.center.y - this.biteTarget.center.y
    }

    this.biteStrengthLeft = 100
    assert(this.collide(player), 'trying to bite player but not colliding with it!')
    assert(!isNaN(this.biteCoords.x) && !isNaN(this.biteCoords.y))
}

Dog.prototype.unbite = function () {
    assert(this.biting, 'can\'t call unbite() if were biting');

    this.biting = false;
    this.biteStrengthLeft = -100;
    this.direction = { y: -2, x: (Math.random() - 0.5) * 3 }
}


function Bullet(center, owner) {
    Entity.call(this)
    this.owner = owner
    this.center = center
    this.direction = { x: 0, y: 0 }
    this.speed = 3
    this.size = { x: 4, y: 4 }
}

inherit(Bullet, Entity)

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
    this.lifetime = 100;
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
    this.direction.y -= 1
    this.weight = 0.1
}

inherit(MortarBullet, BazookaBullet)

MortarBullet.prototype.update = function () {
    BazookaBullet.prototype.update.call(this)
    this.direction.x *= 0.97
}


function GhostBullet(center, owner) {
    Bullet.call(this, center, owner)
}

inherit(GhostBullet, BazookaBullet)

GhostBullet.prototype.update = function () {
    // TODO add a lifetime and a flying-bullet limit
    BazookaBullet.prototype.update.call(this)
    this.direction.x *= 0.97
}

function Explosion(center, owner) {
    this.center = center
    this.owner = owner
    this.size = { x: 10, y: 10 }
    this.direction = { x: 0, y: 0 }
    this.lifetime = 0
    this.damageThings()
}

Explosion.prototype = Object.create(Entity.prototype)

Explosion.prototype.damageThings = function () {
    var explosion = this

    entities
    .filter((ent) => (ent instanceof Player) && (ent.collide(this)))
    .forEach(function (ent) {
        ent.center.y -= 2
        var dx = this.center.x - ent.center.x
        var dy = Math.max(this.center.y - ent.center.y, 0) + 2
        ent.damage(10)
        ent.direction = {
            x: -dx / 4,
            y: -dy / 4
        }
    }.bind(this))
}

Explosion.prototype.draw = function () {
    if (this.lifetime % 4 == 0) {
        ctx.fillStyle = 'yellow'
        ctx.fillRect(0, 0, 100, 100)
    } else if (this.lifetime % 4 == 2) {/*
        ctx.fillStyle = 'red'
        ctx.fillRect(0, 0, 100, 100)*/
    } else {
        ctx.strokeStyle = 'yellow'
        ctx.strokeRect(this.center.x - (this.size.x) - camera.offset.x,
            this.center.y - (this.size.y) - camera.offset.y,
            this.size.x * 2, this.size.y * 2)
        ctx.fillStyle = 'black'
    }
    Entity.prototype.draw.apply(this, arguments);
}

Explosion.prototype.update = function () {
    if (this.lifetime++ > 20) {
        this.die();
    }

    this.size.x = this.lifetime * 1.1
    this.size.y = this.lifetime * 1.1
}

function Block(center) {
    Entity.call(this)
    this.center = center
    this.direction = { x: 0, y: (Math.random() - .5) * 4 }
    this.size = { x: 110 * Math.random(), y: 20 }
}

Block.prototype = Object.create(Entity.prototype)

Block.prototype.update = function () {
    Entity.prototype.update.call(this)

    if (this.center.y > height)
        this.direction.y = -this.direction.y

    if (this.center.y < 0)
        this.direction.y = -this.direction.y
}

var entities = [
    
]

var sortedBlocks = []

sortedBlocks = entities.filter(function (ent) {
    return ent instanceof Block
}).sort(function (a, b) {
    return a.center.x + a.size.x > b.center.x + b.size.x
})


function makePlayerAI() {
    assert(!makePlayerAI.alreadyExists, 'PlayerAI instance already exists!');
    makePlayerAI.alreadyExists = true;

    function PlayerAI() {  }
    inherit(PlayerAI, BaseAI);

    PlayerAI.prototype.control = function (player) {
        var LEFT = 37
        var RIGHT = 39
        var JUMP = 38
        var SHOOT = 32
        
        var wasMovingLeft
        var wasMovingRight

        // Introduce movement intention into player
        player.moving = { x: 0, y: 0 }

        document.addEventListener('keyup', function(ev) {
            var keyCode = ev.which
            if (LEFT == keyCode) {
                if (wasMovingLeft) player.moving.x = 0
            }
            if (RIGHT == keyCode) {
                if (wasMovingRight) player.moving.x = 0
            }
            if (SHOOT == keyCode) {
                player.shoot()
            }
            if (JUMP == keyCode) {
                player.stopJump()
            }
        })

        document.addEventListener('keydown', function(ev) {
            var keyCode = ev.which
            if (LEFT == keyCode) {
                player.moving.x = -player.speed;
                wasMovingLeft = true;
            }
            if (RIGHT == keyCode) {
                player.moving.x = player.speed;
                wasMovingRight = true;
            }
            if (JUMP == keyCode) {
                player.tryJump()
            }
        })
    }

    return new PlayerAI
}


function EnemyAI(player) {
    this.target = player
}

inherit(EnemyAI, BaseAI)

EnemyAI.prototype.control = function (enemy) {
    assert(typeof enemy.update === 'function', 'enemy.tick is not a function!')
    var i = Math.round(Math.random() * 10)
    var _oldTick = enemy.update
    var that = this
    this.enemy = enemy

    enemy.onUpdate(function () {
        i++;
        if (i >= 40) { that.decideShit() }  // only decide shit every 40 frames cos im dumb
    });

    this.facing = 0

    this.minDistanceToPlayer = 20 + Math.round(Math.random() * 30)
}

EnemyAI.prototype.approach = function () {
    assert(this.enemy instanceof Player)
    if (this.enemy.distanceTo(this.target) > this.minDistanceToPlayer && this.enemy.grounded()) {
        if (this.enemy.center.x >= this.target.center.x && this.facing !== -1) {
            this.facing = -1
            this.enemy.direction = { x: -this.enemy.speed, y: 0 }
        } else if (this.enemy.center.x < this.target.center.x && this.facing != 1) {
            this.facing = 1
            this.enemy.direction = { x: this.enemy.speed, y: 0 }
        }
    } else {
        this.enemy.direction.x = 0
    }
}

EnemyAI.prototype.decideShit = function () {
    this.approach()
    this.jumpIfSeemsNecessary()
}

EnemyAI.prototype.jumpIfSeemsNecessary = function () {
    if (this.enemy.distanceTo(this.target) < this.minDistanceToPlayer + 1 && this.enemy.grounded()) {
        this.enemy.tryJump(this.facing)
        this.facing = 0
    }
}


function DogAI() {
    EnemyAI.apply(this, arguments);
    this.biteXLocationInPlayer = (Math.random() - 0.5) * 10

    this.target.onUpdate(function () {
        if (this.enemy.biting && !this.target.grounded()) {
            this.enemy.biteStrengthLeft--;

            if (this.enemy.biteStrengthLeft <= 0) {
                this.enemy.unbite();
            }
        } else if (!this.enemy.biting) {
            if (this.enemy.biteStrengthLeft < 100) {
                this.enemy.biteStrengthLeft++;
            }
        }
    }.bind(this))
}

inherit(DogAI, EnemyAI)

DogAI.prototype.approach = function () {
    if (this.enemy.biting || this.target.dead) { return /* Already biting, no moving for us. */ }

    // Cannot bite yet, the player shook me off
    if (this.enemy.biteStrengthLeft < 100) {
        return;
    }

    // Too far from player, ignore that bitch
    if (this.enemy.distanceTo(this.target) > 100) { return; }

    var xBiteTarget = this.biteXLocationInPlayer + this.target.center.x
    var dxToBiteTarget = this.enemy.center.x - xBiteTarget
    if (Math.abs(dxToBiteTarget) < 5 && this.enemy.collide(this.target)) {
        this.enemy.bite(this.target);
        return;  // Already biting that dumb shit
    }

    if (!this.enemy.grounded()) { return; }  // Can't turn in midair, sorry

    if (dxToBiteTarget < 0) { this.enemy.direction.x = this.enemy.speed }
    if (dxToBiteTarget > 0) { this.enemy.direction.x = -this.enemy.speed }
}


// Receives updates in its _onPacket function.
// When that happens, everything without an AI gets updated in the entity list.
function Networld() {
    this.entitiesByName = {};
    this.worldId = Math.round(Math.random() * 999999);
    this.lastId = -1;
    this.version = 1;
    this.lastVersions = {};
}

Networld.prototype.commit = function () {
    var somethingChanged = false;

    entities
        .forEach(function findDifferences(ent) {
            var lastVer = this.lastVersions[ent.id]
            var thisVer = JSON.stringify(ent.serialize())
            if (lastVer !== thisVer) {
                console.log('v' + (this.version - 1) + ': registering a change: from ' + lastVer + 'to ' + thisVer)
                somethingChanged = true;  // There are changes in an entitiy!
                this.lastVersions[ent.id] = thisVer
                ent._net_version = this.version
            }
        }.bind(this))

    if (somethingChanged)
        this.version++;
}

Networld.prototype._diff = function (version) {
    return entities
        .filter((ent) => '_net_version' in ent)
        .filter((ent) => ent._net_version > version)
        .map((ent) => (['add', ent.constructor.name, ent.serialize()]))
}

Networld.prototype.makePacket = function (lastAckVersion) {
    return {
        id: this.version,
        updates: this._diff(lastAckVersion)
    }
}

Networld.prototype._onPacket = function (packet) {
    assert(packet !== null && typeof packet === 'object', '_onPacket expects a packet!')
    if (typeof packet.id !== 'number' || packet.id < this.lastId) {
        console.log('Discarding packet with id %j because it\'s not a number or is less than this.lastId (%j)', packet.id, this.lastId)
        return;  // Packet older than what we have now
    }

    this.lastId = packet.id;

    if (typeof packet.updates !== 'object' || !packet instanceof Array) {
        return; // Packet is just a heartbeat or a troll
    }

    var that = this;
    packet.updates.forEach(function (update) {
        var op = update[0];
        var opArgs = update.slice(1);

        if (op === 'add') {
            var Cls = window[opArgs[0]] || module.exports[opArgs[0]];
            var update = opArgs[1];
            
            assert(typeof Cls === 'function' && Cls.prototype instanceof Entity, Cls + ' is not an instance of Entity!');
            assert(typeof update === 'object' && update !== null)

            var inst = new Cls();            
            inst.remoteUpdate(update);

            entities.push(inst)
        }
    })
}

module.exports = {
    makePlayerAI: makePlayerAI,
    HumanPlayer: HumanPlayer,
    Networld: Networld,
    EnemyAI: EnemyAI,
    Bullet: Bullet,
    Player: Player,
    Entity: Entity,
    DogAI: DogAI,
    Dog: Dog,
}

Object.defineProperty(module.exports, 'entities', {
    get: function () { return entities },
    set: function (newEnts) { entities = newEnts; }
})
