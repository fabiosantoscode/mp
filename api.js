
var assert = require('assert')


module.exports = function makeApi(rooms) {
    var app = require('connect')()
    var FEW_COUNT = 10
    var FEW_MAX_AGE = 2000
    var fewShowing
    var fewAge
    function fewRooms() {
        if (fewAge !== undefined && +new Date - fewAge < 5000) { return fewShowing }
        fewShowing = Object.keys(rooms)
            .sort(() => Math.random() - 0.5)  // shuffle
            .map(key => ({
                playerCount: rooms[key].players.length,
                name: key,
            }))
        fewAge = +new Date()
        return fewShowing
    }

    app.use('/rooms/few', JSONRES((req, res) =>
        res.end(fewRooms())))

    function JSONRES(fun) {
        return (req, res, next) => {
            var _end = res.end
            res.end = (json) => {
                res.setHeader('content-type', 'application/json; charset=utf-8')
                _end.call(res, JSON.stringify(json))
            }
            return fun(req, res, next)
        }
    }

    return app
}

