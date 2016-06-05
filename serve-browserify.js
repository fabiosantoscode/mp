"use strict"

var es = require('event-stream');
var fs = require('fs')
var path = require('path')

var thisRunID = +new Date()
var thisRunDate = new Date().toUTCString();

function getBrowserified(opt, cb) {
    // Required in this scope because it's a tad large
    var browserify = require('browserify');
    var b = browserify({
        entries: [opt.entryPoint],
        debug: !!opt.debug,
        insertGlobals: !opt.debug,
    })
    var bun = b.bundle()

    bun.pipe(es.wait(function (err, body) {
        if (err) {
            return console.error('/* Error in serveBrowserify! */', err);
        }
        if (!opt.debug) {
            body = body.toString('utf-8')
        }
        cb && cb(body)
    }))
}

module.exports = function serveBrowserify(entryPoint, opt) {
    opt = opt || {}
    var precache = !!opt.precache
    var cached = null

    var getBrowserifiedOpt = {entryPoint: entryPoint, debug: opt.debug}

    if (precache) setTimeout(function () {
        getBrowserified(getBrowserifiedOpt, null)  // Warm up the cache
    })

    return function serveBrowserify(req, res) {
        if (+req.headers['if-none-match'] === thisRunID) {
            res.statusCode = 304
            res.end()
            return
        }
        if (req.headers['if-modified-since'] && +new Date(req.headers['if-modified-since']) >= thisRunID) {
            res.statusCode = 304; res.end(); return
        }
        res.setHeader('content-type', 'text/javascript; charset=utf-8')
        res.setHeader('etag', thisRunID)
        res.setHeader('cache-control', 'max-age=36000, public, must-revalidate')
        res.setHeader('last-modified', thisRunDate)

        if (cached) {
            res.end(cached)
        } else {
            getBrowserified(getBrowserifiedOpt, function (body) {
                if (opt.debug)  // Don't waste this ram in production
                    cached = body
                res.end(body)
            })
        }
    }
}

module.exports.compile = function compile(opt) {
    var entryPoint = opt.entryPoint
    opt.debug = false

    getBrowserified({
        entryPoint: opt.entryPoint,
        debug: false
    }, function (body) {
        return done(body)
    })

    function done(body) {
        fs.writeFile(opt.bundleName, body, { encoding: 'utf-8' }, console.log.bind(console))
    }
}
