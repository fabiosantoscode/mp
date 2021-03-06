'use strict'

var ls = typeof localStorage !== 'undefined' ? localStorage : {}
var gameName = ls.gameName
var changeEvents = new (require('events').EventEmitter)

var setName = (name) => {
    gameName = ls.gameName = name
    changeEvents.emit('name', name)
}

module.exports = {
    set: setName,
    get: () => gameName,
    bind: (input) => {
        if (!input.value) {
            input.value = name
        } else {
            name = input.value
        }
        input.onkeyup = input.onchange = () => {
            setName(input.value)
        }
    },
    subscribe: (cb) => {
        changeEvents.on('name', cb)
        if (gameName) cb(gameName)
    }
}

