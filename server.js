'use strict';

var path = require('path');
var http = require('http');
var url = require('url');
var fs = require('fs');

var browserify = require('browserify');
var ecstatic = require('ecstatic');
var connect = require('connect');

var DEBUG = true

var app = connect();

function serveBrowserify(entryPoint) {
    return function (req, res) {
        res.setHeader('content-type', 'text/javascript; charset=utf-8')
        var b = browserify({
            entries: [entryPoint],
            debug: DEBUG
        })
        b.bundle().pipe(res)
    }
}

app.use('/clientbundle.js', serveBrowserify('./lib/client.js'))

app.use('/test/testbundle.js', serveBrowserify('./test/tests.js'))

app.use(ecstatic({
    root: path.join(__dirname, 'test'),
    baseDir: '/test'
}));

app.use(ecstatic({
    root: path.join(__dirname, 'public'),
    baseDir: '/'
}));

var port = +(process.argv[2] || '8080')
http.createServer(app)
    .listen(port)
    .on('listening', function () {
        console.log('listening on port ' + port)
    });
