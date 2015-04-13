"use strict"

var es = require('event-stream');
var browserify = require('browserify');
var UglifyJS = require('uglify-js');
var fs = require('fs')
var path = require('path')
var traceur = require('traceur/src/node/api.js');

var thisRunID = +new Date()
var thisRunDate = new Date().toUTCString();

module.exports = function serveBrowserify(entryPoint, opt) {
    opt = opt || {}
    var precache = !!opt.precache
    var cached = null
    function getTraceur() {
        return Buffer.concat([
            fs.readFileSync(path.join(__dirname, 'node_modules/traceur/bin/traceur-runtime.js')),
            new Buffer(traceur.compile(cached.toString('utf-8')), 'utf-8')
        ])
    }
    function getBrowserified(cb) {
        if (cached) { return cb(cached) }
        var b = browserify({
            entries: [entryPoint],
            debug: !!opt.debug,
            insertGlobals: true,
        })
        var bun = b.bundle()

        bun.pipe(es.wait(function (err, body) {
            if (err) {
                return console.error('/* Error in serveBrowserify! */', err);
            }
            if (!opt.debug) {
                body = UglifyJS.minify(body.toString('utf-8'), {
                    fromString: true,
                    warnings: true
                }).code
            }
            cached = body
            cb && cb(body)
        }))
    }

    if (precache) setTimeout(function () {
        getBrowserified(null)  // Warm up the cache
    })
    return function serveBrowserify(req, res) {
        if (+req.headers['if-none-match'] === thisRunID) {
            res.statusCode = 304
            res.end()
            return
        }
        if (req.headers['if-modified-since'] && +new Date(req.headers['if-modified-since']) >= thisRunID) {
            res.statusCode = 404; res.end(); return
        }
        res.setHeader('content-type', 'text/javascript; charset=utf-8')
        res.setHeader('etag', thisRunID)
        res.setHeader('cache-control', 'public;max-age=3600')
        res.setHeader('last-modified', thisRunDate)

        var useTraceur = /[?&;]noharmony(&|;|$)/.test(req.url)

        getBrowserified(function (body) {
            res.end(useTraceur ? getTraceur(body) : body)
        })
    }
}
