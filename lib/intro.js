'use strict'

var vec = require('./mp').vec
var util = require('util')
var assert = require('assert')
var images = require('./images')

var INTROTIME = 10000

module.exports = function makeIntro({ mp, camera }) {
    if (typeof document === 'undefined') {
        return
    }

    if (!('IntroEntity' in mp)) {
        mp.IntroEntity = function IntroEntity({camera}) {
            mp.Entity.apply(this)
            this.center = vec({
                x: camera.offset.x,
                y: camera.offset.y
            })
            this.direction = vec.origin
            this.size = vec({ x: 50, y: 50 })
            this.image = images.tutorial
            this.color = 'white'
        }

        util.inherits(mp.IntroEntity, mp.Entity)

        mp.IntroEntity.prototype.update = function() {
            this.center = camera.offset
        }

        mp.IntroEntity.prototype.draw = function () {
            var x1 = 10
            var y1 = 0

            mp.ctx.drawImage(
                this.image.img,
                x1, y1)
        }
    }

    var introEnt = mp.entities.construct(mp.IntroEntity, {camera})
    mp.entities.push(introEnt)

    mp.setTimeout(() => {
        mp.entities.remove(introEnt)
    }, INTROTIME)
}

