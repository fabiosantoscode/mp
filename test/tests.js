var mp = require('../lib/mp.js')
var util = require('util')


QUnit.module('Networld')

var Networld = mp.Networld

test('receive them packets', function () {
    var networld = new Networld();

    mp.entities = []
    networld._onPacket({
        id: 1,
        updates: [
            ['add', 'Player', { id: {}, center: { x: 10, y: 10 }, direction: { x: 10, y: 10 } }]
        ]
    });

    equal(mp.entities.length, 1)
    ok(mp.entities[0] instanceof mp.Player)
})

function testWithWorld(name, cb) {
    test(name, function () {
        var networld = new Networld();
        
        mp.entities = []
        networld._onPacket({
            id: 1,
            updates: [
                ['add', 'Player', { id: 1, center: { x: 10, y: 10 }, direction: { x: 10, y: 10 } }]
            ]
        });

        cb(networld);
    });
}

testWithWorld('discard them old packets', function (networld) {
    var somePlayer = ['add', 'Player', { id: 2, center: { x: 1, y: 1 } }]
    networld._onPacket({ id: 0, updates: [ somePlayer ] });
    equal(mp.entities.length, 1);
    ok(mp.entities[0].id != 2);

    networld._onPacket({ id: 2, updates: [ somePlayer ] });
    equal(mp.entities.length, 2);
    ok(mp.entities[1] instanceof mp.Player);
    ok(mp.entities[1].id == 2);
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
