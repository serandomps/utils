var syncs = {};

exports.format = function (str) {
    var re = /(%?)(%([jds]))/g;
    var args = Array.prototype.slice.call(arguments, 1);
    if (args.length) {
        str = str.replace(re, function (match, escaped, ptn, flag) {
            var arg = args.shift();
            switch (flag) {
                case 's':
                    arg = '' + arg;
                    break;
                case 'd':
                    arg = Number(arg);
                    break;
                case 'j':
                    arg = JSON.stringify(arg);
                    break;
            }
            if (!escaped) {
                return arg;
            }
            args.unshift(arg);
            return match;
        })
    }
    if (args.length) {
        str += ' ' + args.join(' ');
    }
    str = str.replace(/%{2,2}/g, '%');
    return '' + str;
};

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
    exports.sync('configs:' + name, function (ran) {
        var config = sera.configs[name];
        if (typeof config !== 'string' && !(config instanceof String)) {
            return ran(null, config);
        }
        $.ajax({
            method: 'GET',
            url: exports.resolve('accounts:///apis/v/configs/' + config),
            dataType: 'json',
            success: function (config) {
                ran(null, config.value);
            },
            error: function (xhr, status, err) {
                ran(err || status || xhr);
            }
        });
    }, done);
};

exports.id = function () {
    return Math.random().toString(36).slice(2);
};

exports.clone = function (o) {
    return JSON.parse(JSON.stringify(o));
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
    var server = sera.server;
    var sub = protocol.replace('://', '');
    var suffix = url.substring(protocol.length);
    return server.replace('{sub}', sub) + suffix;
};

var event = function (listeners, event) {
    return listeners[event] || (listeners[event] = {on: [], once: []});
};

var EventEmitter = function () {
    this.listeners = {};
};

EventEmitter.prototype.on = function (name, fn) {
    event(this.listeners, name).on.push(fn);
};

EventEmitter.prototype.once = function (name, fn) {
    event(this.listeners, name).once.push(fn);
};

EventEmitter.prototype.off = function (name, fn) {
    var arr = event(this.listeners, name);
    var idx = arr.on.indexOf(fn);
    if (idx !== -1) {
        arr.on.splice(idx, 1);
    }
    idx = arr.once.indexOf(fn);
    if (idx !== -1) {
        arr.once.splice(idx, 1);
    }
};

EventEmitter.prototype.emit = function (name, data) {
    var o = event(this.listeners, name);
    var args = Array.prototype.slice.call(arguments, 1);
    o.on.forEach(function (fn) {
        fn.apply(fn, args);
    });
    o.once.forEach(function (fn) {
        fn.apply(fn, args);
    });
    o.once = [];
};

exports.eventer = function () {
    return new EventEmitter();
};

exports.query = function (options) {
    if (!options) {
        return '';
    }
    var data = {
        query: {}
    };
    var name;
    var value;
    for (name in options) {
        if (!options.hasOwnProperty(name)) {
            continue;
        }
        if (name === '_') {
            continue;
        }
        value = options[name];
        data.query[name] = value instanceof Array ? {$in: value} : value;
    }
    return '?data=' + JSON.stringify(data);
};

exports.cdn = function (type, path, done) {
    exports.configs('boot', function (err, config) {
        if (err) {
            return done(err);
        }
        var cdns = config.cdns;
        done(null, cdns[type] + path);
    });
};
