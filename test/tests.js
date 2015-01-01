var mp = require('../lib/mp.js')
var sinon = require('sinon')
var util = require('util')


QUnit.module('Networld')

var Networld = mp.Networld

window.FakeEntity = function FakeEntity(id, netver) {
    if (id != null) this.id = id
    if (netver != null) this._net_version = netver
    mp.Entity.call(this);
}
FakeEntity.prototype = Object.create(mp.Entity.prototype);
FakeEntity.prototype.constructor = FakeEntity;
FakeEntity.prototype.serialize = function () {
    var r = { id: this.id }
    if ('datas' in this) r.datas = this.datas
    return r;
}

test('receive them packets', function () {
    var networld = new Networld();

    mp.entities = []
    networld._onPacket({
        id: 1,
        updates: [
            ['add', 'FakeEntity', { id: {}, center: { x: 10, y: 10 }, direction: { x: 10, y: 10 } }]
        ]
    });

    equal(mp.entities.length, 1)
    ok(mp.entities[0] instanceof FakeEntity)
})

function testWithWorld(name, cb) {
    test(name, function () {
        var networld = new Networld();
        
        mp.entities = []
        networld._onPacket({
            id: 1,
            updates: [
                ['add', 'FakeEntity', { id: 1, center: { x: 10, y: 10 }, direction: { x: 10, y: 10 } }]
            ]
        });

        cb(networld);
    });
}

testWithWorld('discard them old packets', function (networld) {
    var somePlayer = ['add', 'FakeEntity', { id: 2, center: { x: 1, y: 1 } }]
    networld._onPacket({ id: 0, updates: [ somePlayer ] });
    equal(mp.entities.length, 1);
    ok(mp.entities[0].id != 2);

    networld._onPacket({ id: 2, updates: [ somePlayer ] });
    equal(mp.entities.length, 2);
    ok(mp.entities[1] instanceof FakeEntity);
    equal(mp.entities[1].id, 2);
})

testWithWorld('Commit the worlds version and create them badass diffs', function (networld) {
    mp.entities = []
    networld.commit()
    equal(networld.version, 1)

    deepEqual(networld._diff(0), [])

    mp.entities.push(new FakeEntity(1))
    mp.entities.push(new FakeEntity(2))
    networld.commit()
    equal(networld.version, 2)
    deepEqual(mp.entities.map((ent) => ent._net_version), [1, 1], 'versions of entities match world version where they were created')

    deepEqual(networld._diff(-1), [
        ['add', 'FakeEntity', { id: 1 }],
        ['add', 'FakeEntity', { id: 2 }]
    ])

    mp.entities[1].datas = 'ichanged'
    networld.commit()
    equal(mp.entities[1]._net_version, 2, 'since I changed its datas, entities[1] should have its _net_version attr updated')
    equal(mp.entities[0]._net_version, 1, '...but entities[0] stays on the same _net_version')
    equal(networld.version, 3)

    deepEqual(networld._diff(-1), [
        ['add', 'FakeEntity', { id: 1 }],
        ['add', 'FakeEntity', { id: 2, datas: 'ichanged' }]
    ])

    deepEqual(networld._diff(1), [
        ['add', 'FakeEntity', { id: 2, datas: 'ichanged' }]
    ])
    
    networld.commit()
    equal(networld.version, 3)
    deepEqual(networld._diff(3), [], 'diff is nothing because nothing happened');
})

var ent

QUnit.module('Entity', {
    setup: function () {
        ent = new mp.Entity()
        ent.center = { x: 10, y: 10 }
        ent.direction = { x: 0, y: 0 }
    }
});

test('Can extrapolate its coords into the next tick', function () {
    ent.direction.x = 10
    ent.direction.y = 10
    deepEqual(
        ent.extrapolated(1),
        { x: 20, y: 20 },
        'extrapolate a full frame')
    deepEqual(
        ent.extrapolated(0.5),
        { x: 15, y: 15 },
        'extrapolate half a frame')
})

test('Its update() method uses extrapolated(1) to get its new coords', function () {
    var newCoords = { x: 999, y: 999 }
    ent.extrapolated = sinon.stub().returns(newCoords)
    ent.update()
    ok(ent.extrapolated.calledOnce, 'ent.extrapolated called with (1)')
    ok(ent.extrapolated.calledWith(1), 'ent.extrapolated called with (1)')
    strictEqual(ent.center, newCoords, 'ent.center was set to the return value of extrapolated')
})

QUnit.module('Player');

test('can shoot, spawns subclasses of Bullet', function () {
    mp.entities = []
    var player = new mp.Player()
    mp.entities.push(player)
    player.shoot()
    equal(mp.entities.length, 2)
    console.log(mp.entities)
    ok(mp.entities[1] instanceof mp.Bullet);
})

function FakeBullet() { this.center = {x: 0, y: 0}; this.direction = { x: 0, y: 0}}
util.inherits(FakeBullet, mp.Bullet)

function FakeBullet2() { FakeBullet.apply(this, arguments); }
util.inherits(FakeBullet2, FakeBullet)

function playerWithSomeAmmo() {
    var player = new mp.Player()

    player.addBullets({
        count: 3,
        bullet: FakeBullet
    })
    
    return player;
}

test('can gain ammo', function () {
    var player = playerWithSomeAmmo()

    ok(typeof player.weapons === 'object', 'player has a weapons array')

    mp.entities = [player]    
    deepEqual(player.weapons, [{
        count: 3,
        bullet: FakeBullet
    }], 'player.weapons gets our new weapon');
})

test('can lose ammo', function () {
    var player = playerWithSomeAmmo()
    mp.entities = [player]

    player.shoot()

    deepEqual(player.weapons, [{
        count: 2,
        bullet: FakeBullet
    }], 'player.weapons[].count gets reduced at each shot');
})

test('loses a weapon when its ammo is no moar', function () {
    var player = playerWithSomeAmmo()
    mp.entities = [player]

    player.addBullets({
        count: 1,
        bullet: FakeBullet2
    })
    
    deepEqual(player.weapons, [{
        count: 1,
        bullet: FakeBullet2
    }, {
        count: 3,
        bullet: FakeBullet
    }], 'player.weapons[].count gets reduced at each shot');
    
    player.shoot();
    
    deepEqual(player.weapons, [{
        count: 3,
        bullet: FakeBullet
    }], 'player.weapons[] lost a weapon');
})
