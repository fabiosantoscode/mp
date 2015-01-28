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