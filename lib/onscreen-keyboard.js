
var LEFT = 37
var RIGHT = 39
var JUMP = 38
var SHOOT = 32

var events = require('dom-event-stream')
var es = require('event-stream')
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

    var buttonPressStream = es.merge(
        (function directionalButtons() {
            var currentKeyDown = null;
            return es.merge(
                    events(leftButtons, 'touchstart'),
                    events(leftButtons, 'touchmove'),
                    events(leftButtons, 'touchend')
                )
                .pipe(es.through(function write(ev) {
                    if (ev.type == 'touchend') {
                        if (!currentKeyDown) { return; }
                        this.emit('data', ['keyup', currentKeyDown]);
                        currentKeyDown = null;
                        return;
                    }
                    // Doing this weird thing allows the user's finger to swipe from button to button to change direction.
                    for (var touch of ev.touches) {
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

                        if (currentKeyDown === elm) { return; }
                        if (currentKeyDown !== null) {
                            this.emit('data', ['keyup', currentKeyDown])
                        }
                        this.emit('data', ['keydown', elm])
                        currentKeyDown = elm
                    }
                }))
        }()),
        (function actionButtons() {
            return es.merge(
                    events(rightButtons, 'touchstart'),
                    events(rightButtons, 'touchend')
                )
                .pipe(es.through(function (ev) {
                    var button = +ev.target.dataset.btn;
                    if (!button) { return; }
                    ev.preventDefault();
                    this.emit('data', [
                        ev.type === 'touchend' ? 'keyup' : 'keydown',
                        ev.target
                    ])
                }))
        }())
    )

    buttonPressStream.on('data', function hoverEffects([type, elm]) {
        if (type == 'keydown')
            elm.classList.add('touching')
        else
            elm.classList.remove('touching')
    })

    return buttonPressStream.pipe(es.mapSync(([type, elm]) =>
        [type, +elm.dataset.btn]))
}

