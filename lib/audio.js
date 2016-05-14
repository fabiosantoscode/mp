'use strict'

var abstractPool = require('abstract-pool')
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

    var audioTag = preloads[name] = new Audio(source)
    audioTag.preload = 'auto'

    var audioTags = abstractPool(() => audioTag.cloneNode(true), 2)

    module.exports[name] = (volume) => {
        if (module.exports.mute) { return; }

        var snd = audioTags.pop()
        snd.volume = volume == null ? 1 : volume
        snd.ontimeupdate = null
        snd.play()
        setTimeout(() => {
            if (snd.paused) { audioTags.push(snd) }
            else snd.ontimeupdate = () => { if (snd.paused) { snd.ontimeupdate = null; audioTags.push(snd); } }
        }, 400)
        return snd
    }
}

effect('explosion')
effect('bodyslam')
effect('mortarbullet')
effect('metalbump')
effect('jump')
effect('pickup')

module.exports.mute = typeof localStorage !== 'undefined' && localStorage.mute === 'true'

