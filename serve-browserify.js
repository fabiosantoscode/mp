"use strict"

var es = require('event-stream');
var browserify = require('browserify');
var fs = require('fs')
var path = require('path')
var traceur = require('traceur/src/node/api.js');

var thisRunID = +new Date()

module.exports = function serveBrowserify(entryPoint, precache) {
    var cached = null
    var traceurCached = null
    function getTraceur() {
        if (!traceurCached) {
            traceurCached = Buffer.concat([
                fs.readFileSync(path.join(__dirname, 'node_modules/traceur/bin/traceur-runtime.js')),
                new Buffer(traceur.compile(cached.toString('utf-8')), 'utf-8')
            ])
        }
        return traceurCached
    }
    function getBrowserified(cb) {
        var b = browserify({
            entries: [entryPoint],
            debug: false,
            insertGlobals: true,
        })
        var bun = b.bundle()

        bun.pipe(es.wait(function (err, body) {
            if (err) {
                return console.error('/* Error in serveBrowserify! */', err);
            }
            cb && cb(body)
        }))
    }

    if (precache) cached = getBrowserified(null)  // Warm up the cache
    return function serveBrowserify(req, res) {
        if (+req.headers['if-none-match'] === thisRunID) {
            res.statusCode = 304
            res.end()
            return
        }
        res.setHeader('content-type', 'text/javascript; charset=utf-8')
        res.setHeader('etag', thisRunID)

        var useTraceur = /[?&;]noharmony(&|;|$)/.test(req.url)

        if (!cached) {
            return getBrowserified(function (body) {
                cached = body
                res.end(useTraceur ? getTraceur() : cached)
            })
        }

        res.end(useTraceur ?
            getTraceur() :
            cached)
    }
}
