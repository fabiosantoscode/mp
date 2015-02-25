function loadMaybeHarmony(src) {
    var doc = document;
    if (!loadMaybeHarmony.harmonySupport) {
        src += '?noharmony'
    }
    var script = document.createElement('script')
    script.src = src
    document.body.appendChild(script)
}

loadMaybeHarmony.harmonySupport = (function () {
    try {
        eval('() => 1');
    } catch(e) {
        return false;
    }
    return true;
}())

var crispEdgesSupport = (function (cvStyle) {
    cvStyle.imageRendering = 'crisp-edges';
    cvStyle.imageRendering = 'pixelated';
    cvStyle.imageRendering = '-moz-crisp-edges';
    return !!cvStyle.imageRendering;
}(document.createElement('canvas').style));

document.documentElement.classList.add(
    crispEdgesSupport ?
        'crisp-edges' :
        'no-crisp-edges');

