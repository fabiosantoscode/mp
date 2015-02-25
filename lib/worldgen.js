
var mersenneTwister = require('random-js').engines.mt19937
var assert = require('assert')

module.exports = function worldGen({ mp, range, seed, density, classes, statics }) {
    seed = seed || 42
    density = density || 0.5
    classes = classes || ['SmallBlock', 'LargeBlock', 'Barrel', 'LightPost']

    // Circular dep
    var vec = require('./mp').vec

    assert(density < 1 && density > 0)

    var randomGenerator = mersenneTwister()
    randomGenerator.seed(seed)

    var randInt = () => Math.abs(randomGenerator()) % 127

    var entities = mp.entities
    var [rangeStart, rangeEnd] = range;

    var rand = () => randInt() / 127

    var choose = (arr) =>
        arr[Math.abs(randomGenerator()) % arr.length]

    var newEnts = []
    
    var place = (className, pos) => {
        var Class = typeof className === 'string' ?
            mp[className] :
            className

        var ent = new Class()
        // Place it above ground
        ent.center = vec({
            x: pos,
            y: 100 - (ent.size.y / 2)
        })
        if (ent.static) {
            // The server won't send static ents to the client
            ent.syncable = false
        }
        // And the client won't recreate dynamic entities
        if (!ent.static && statics) { return; }
        entities.push(ent)
        return ent
    }
    
    var cur = rangeStart
    var count = 0

    for (var cur = rangeStart; cur < rangeEnd; cur += density * randInt()) {
        count++
        place(choose(classes), cur)
    }

    if (mp.worldGen) {
        mp.worldGen({ range, place, statics })
    }

    if (!mp.worldGenInfo) mp.worldGenInfo = []
    mp.worldGenInfo.push({ range, seed, density, classes })

    console.log('worldgen: ', count, 'entities generated')
}
