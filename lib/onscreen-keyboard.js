'use strict'

var LEFT = 37
var RIGHT = 39
var JUMP = 38
var SHOOT = 32

var Readable = require('stream').Readable
var fs = require('fs')

module.exports = function onscreenKeyboard(opt) {
    if (typeof document === 'undefined') { return; }

    if (!opt) { opt = {} }

    var containerElm = opt.containerElm || document.body;

    var keyboard = document.createElement('div');
    keyboard.className = 'keyboard'
    keyboard.innerHTML = [
        '<div class="left-buttons">',
        '   <div data-btn="' + LEFT + '" class="left-button">&lt;</div>',
        '   <div data-btn="' + RIGHT + '" class="right-button">&gt;</div>',
        '</div>',
        '<div class="right-buttons">',
        '   <div data-btn="' + JUMP + '" class="jump-button">jump!</div>',
        '   <div data-btn="' + SHOOT + '" class="shoot-button">shoot!</div>',
        '</div>',
    ].join('\n')

    containerElm.appendChild(keyboard);

    var leftButtons = keyboard.querySelector('.left-buttons')
    var rightButtons = keyboard.querySelector('.right-buttons')

    var recordingEvents

    var currentKeyDown = null;
    function onLeftButtonsEvent(ev) {
        if (!recordingEvents) { return }
        ev.preventDefault()
        if (ev.type == 'touchend') {
            if (!currentKeyDown) { return; }
            push('keyup', currentKeyDown);
            currentKeyDown = null;
            return;
        }
        // Doing this weird thing allows the user's finger to swipe from button to button to change direction.
        var touch
        var elm
        for (var i = 0; i < ev.touches.length; i++) {
            touch = ev.touches[i]
            elm = document.elementFromPoint(touch.clientX, touch.clientY)
            if (!elm || [LEFT, RIGHT].indexOf(+elm.dataset.btn) == -1) {
                elm = null;
                continue;
            } else {
                break;
            }
        }
        if (!elm) { return; }
        var btn = +elm.dataset.btn
        if (btn) {
            ev.preventDefault();

            if (currentKeyDown === btn) { return; }
            if (currentKeyDown !== null) {
                push('keyup', currentKeyDown)
            }
            push('keydown', btn)
            currentKeyDown = btn
        }
    }

    function onActionButtonsEvent(ev) {
        if (!recordingEvents) { return }
        var button = +ev.target.dataset.btn;
        if (!button) { return; }
        push(
            ev.type === 'touchend' ? 'keyup' : 'keydown',
            button
        )
    }

    var ret = new Readable({
        objectMode: true
    })

    ret._read = function () {
        rightButtons.addEventListener('touchstart', onActionButtonsEvent)
        rightButtons.addEventListener('touchend', onActionButtonsEvent)
        leftButtons.addEventListener('touchstart', onLeftButtonsEvent)
        leftButtons.addEventListener('touchmove', onLeftButtonsEvent)
        leftButtons.addEventListener('touchend', onLeftButtonsEvent)
        recordingEvents = true
    }

    function push(evType, btn) {
        if (recordingEvents === false) { return }
        if (ret.push([ evType, btn ]) === false) {
            recordingEvents = false
            rightButtons.removeEventListener('touchstart', onActionButtonsEvent)
            rightButtons.removeEventListener('touchend', onActionButtonsEvent)
            leftButtons.removeEventListener('touchstart', onLeftButtonsEvent)
            leftButtons.removeEventListener('touchmove', onLeftButtonsEvent)
            leftButtons.removeEventListener('touchend', onLeftButtonsEvent)
        }
        console.log(evType, btn)
    }

    return ret
}

