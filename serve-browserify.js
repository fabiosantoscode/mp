"use strict"

var es = require('event-stream');
var browserify = require('browserify');
var fs = require('fs')
var path = require('path')
var traceur = require('traceur/src/node/api.js')
var Promise = require("bluebird");

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
    function getBrowserified(andPipeTo) {
        return new Promise(function (resolve) {
            var b = browserify({
                entries: [entryPoint],
                debug: false,
                insertGlobals: true,
            })
            var bun = b.bundle()

            bun.pipe(es.wait(function (err, body) {
                if (err) {
                    return res.end('/* Error in serveBrowserify: ' + err + ' */');
                }
                resolve(body)
            }))

            if (andPipeTo) bun.pipe(andPipeTo)
        })
    }

    if (precache) cached = getBrowserified(null)  // Warm up the cache
    return function serveBrowserify(req, res) {
        res.setHeader('content-type', 'text/javascript; charset=utf-8')

        var useTraceur = /[?&;]noharmony(&|;|$)/.test(req.url)

        if (!cached) {
            cached = getBrowserified(useTraceur ? null : res)
            if (!useTraceur) { return; /* We're already piping the response */ }
        }

        cached.then(function (cached) {
            res.end(useTraceur ?
                getTraceur() :
                cached)
        })
    }
}