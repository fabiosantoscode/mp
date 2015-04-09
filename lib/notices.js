
module.exports = function (message, opt) {
    if (typeof document === 'undefined') {
        return console.log(message)
    }
    opt = opt || {}
    opt.noticeRoot = opt.noticeRoot || document.getElementById('noticeRoot') || document.body
    opt.isGood = opt.isGood == null ? true : opt.isGood
    opt.duration = 5000

    var notice = document.createElement('div')
    notice.className = 'game-notice'
    notice.textContent = message
    if (opt.isGood) notice.classList.add('good-notice')
    opt.noticeRoot.appendChild(notice)

    setTimeout(() => {
        notice.parentNode.removeChild(notice)
    }, opt.duration)

    return notice
}

