'use strict'

var fullscreen = require('fullscreen')

if(fullscreen.available())
    var fs = fullscreen(document.body)

module.exports = fs

