var syncs = {};

exports.sync = function (id, run, done) {
    if (syncs[id]) {
        return syncs[id].push(done);
    }
    syncs[id] = [done];
    run(function () {
        var args = Array.prototype.slice.call(arguments);
        var o = syncs[id];
        delete syncs[id];
        o.forEach(function (done) {
            done.apply(null, args);
        });
    });
};

exports.configs = function (name, done) {
    $.ajax({
        method: 'GET',
        url: exports.resolve('accounts://apis/v/configs/' + name),
        dataType: 'json',
        success: function (config) {
            done(false, config.value);
        },
        error: function () {
            console.log('error retrieving ' + name);
            done('error retrieving ' + name + ' configuration');
        }
    });
};

exports.id = function () {
    return Math.random().toString(36).slice(2);
};

exports.resolve = function (url) {
    var protocol = url.match(/.*?:\/\//g);
    if (!protocol) {
        return url;
    }
    protocol = protocol[0];
    if (protocol === 'https://' || protocol === 'http://') {
        return url;
    }
    var server = $('#content').data('server');
    var sub = protocol.replace('://', '');
    var suffix = url.substring(protocol.length);
    return server.replace('{sub}', sub) + '/' + suffix;
};
