
var LEFT = 37
var RIGHT = 39
var JUMP = 38
var SHOOT = 32

module.exports = function createPlayerControlStream() {
    // Creates a stream of ['keydown/keyup', keyCode] pairs
    var events = require('dom-event-stream')
    var es = require('event-stream')
    return es.merge(events(document, 'keyup'), events(document, 'keydown'))
        .pipe(es.mapSync((ev) => [ev.type, ev.which]))
        .pipe((function uniq() {
            var lastThing
            return es.through(function write([type, which]) {
                var hash = type + ',' + which;
                if (lastThing !== hash) {
                    lastThing = hash
                    this.emit('data', [type, which])
                }
            })
        }()))
        .pipe(es.mapSync(function filterUselessKeys([type, which]) {
            if (which === LEFT || which === RIGHT || which === JUMP || which === SHOOT) {
                return [type, which]
            }
        }))
}