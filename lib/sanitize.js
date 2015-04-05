
var stream = require('stream')
var MAXMESSAGES = 32
var MAXSIZE = 100
var FIRSTCHARACTER = 0x5b  // [

function Sanitizer() {
    stream.Transform.call(this)
    this.lastSecond = Math.floor(+new Date() / 1000)
    this.messagesThisSecond = 0
}

Sanitizer.prototype = Object.create(stream.Transform.prototype)

Sanitizer.prototype._transform = function transform(chunk, encoding, callback) {
    if (chunk.length > MAXSIZE) { return callback(null) }
    if (chunk[0] !== FIRSTCHARACTER) { return callback(null) }
    var thisSecond = Math.floor(+new Date() / 1000)
    if (thisSecond !== this.lastSecond) {
        this.lastSecond = thisSecond
        this.messagesThisSecond = 0
    }
    this.messagesThisSecond++
    if (this.messagesThisSecond > MAXMESSAGES) {
        callback(null);
    } else {
        callback(null, chunk)
    }
}

module.exports = function makeSanitizer() {
    return new Sanitizer()
}

