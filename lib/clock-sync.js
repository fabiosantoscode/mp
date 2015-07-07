'use strict'

var async = require('async')
var events = require('events')

function maybeJSONArr(thing) {
    try { return JSON.parse(thing); } catch (e) {}
    return [];
}

module.exports = (remote, opt) => {
    var serverOnly = opt && opt.server

    var firstOffset = true

    remote.on('data', function (datas) {
        if (/^\s*\[\s*"hey what time is it"/.test(datas)) {
            remote.write(JSON.stringify(['hey the time is', +new Date()]) + '\n') }
    })

    if (!serverOnly) {
        var out = new events.EventEmitter()

        var lowestPing
        async.mapSeries([1,2,3,4,5,6,7,8,9,10], function pingTheServer(_, doneAskingTheTime) {
            remote.on('data', function onAnswer(datas) {
                if (!/^\s*\[\s*"hey the time is"/.test(datas)) { return }
                datas = maybeJSONArr(datas)
                if (datas[0] !== 'hey the time is' || datas.length != 2) { return; }
                remote.removeListener('data', onAnswer)
                var theirAnswer = datas[1]
                var answerTime = +new Date()
                var ping = answerTime - questionTime
                var theirTime = theirAnswer + (ping / 2)
                var offBy = answerTime - theirTime
                if (ping < lowestPing || lowestPing === undefined) {
                    lowestPing = ping
                    out.offset = offBy
                    out.emit('offset', offBy)
                }
                setTimeout(() => doneAskingTheTime(null, [offBy, ping]), 1000)
            })

            var questionTime = +new Date()
            remote.write(JSON.stringify(['hey what time is it']) + '\n')
        }, function onDone(err, times) {
            out.emit('final-offset', out.offset)
        })

        out.once('offset', () => { out.ready = true })

        out.offset = 0
        out.now = () => +new Date() - out.offset
        out.ready = false

        out.packetInFuture = (ms) => { out.offset -= ms }

        return out
    }
}

