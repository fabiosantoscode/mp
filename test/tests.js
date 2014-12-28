
QUnit.module('Networld')

var mp = require('../lib/mp.js')

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
