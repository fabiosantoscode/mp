'use strict'

// Keep some Audio instances, so they don't get garbage collected
var preloads = {}

var audioSupport =
module.exports.supported =
typeof Audio !== 'undefined'

var effect = (name, source) => {
    if (!audioSupport) {
        module.exports[name] = () => null;
    }

    source = source || '/' + name + '.wav'
        + '?' + Math.random()

    var audioTag = preloads[name] = new Audio(source)

    module.exports[name] = (volume) => {
        if (audioTag.paused === true) {
            var snd = audioTag
        } else {
            var snd = audioTag.cloneNode(true)
        }
        snd.volume = volume === null ? 1 : volume
        snd.play()
        return snd
    }
}

effect('explosion')
effect('bodyslam')
effect('mortarbullet')
effect('metalbump')
effect('jump')
effect('pickup')

