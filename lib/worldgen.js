
var assert = require('assert')
var vec = require('./mp').vec

module.exports = function worldGen({ mp, range, seed = 42, density = 0.5, classes = ['SmallBlock', 'LargeBlock', 'Barrel', 'LightPost'] }) {
    assert(density < 1 && density > 0)

    var entities = mp.entities
    var [rangeStart, rangeEnd] = range;

    var randInt = () => seed = (((seed + 3) * seed) % 127) + 1
    
    var rand = () => randInt() / 127

    var choose = (arr) => arr[randInt() % arr.length]

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
        mp.worldGen({ range, place })
    }

    console.log('worldgen: ', count, 'entities generated')
}