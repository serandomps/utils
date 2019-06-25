var syncs = {};

var workflows = {
    model: {
        editing: {
            review: 'reviewing'
        },
        reviewing: {
            approve: 'unpublished',
            reject: 'editing'
        },
        published: {
            unpublish: 'unpublished'
        },
        unpublished: {
            publish: 'published',
            edit: 'editing'
        }
    }
};

exports.workflow = function (name, done) {
    done(null, workflows[name]);
};

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

exports.url = function () {
    return window.location.href;
};

exports.query = function (url, o) {
    var suffix = '';
    Object.keys(o).forEach(function (name) {
        if (suffix) {
            suffix += '&';
        }
        suffix += name + '=' + encodeURIComponent(o[name]);
    });
    if (!suffix) {
        return url;
    }
    url += url.indexOf('?') === -1 ? '?' + suffix : '&' + suffix;
    return url;
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
    var protocol = url.match(/^[A-Za-z]*?:\/\//g);
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

exports.data = function (options) {
    if (!options) {
        return '';
    }
    var data = {
        query: {},
        sort: options.sort,
        count: options.count
    };
    var name;
    var value;
    var query = options.query || {};
    for (name in query) {
        if (!query.hasOwnProperty(name)) {
            continue;
        }
        if (name === '_') {
            continue;
        }
        value = query[name];
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

var to = function (o) {
    var oo = {};
    Object.keys(o).forEach(function (name) {
        oo[name.replace(/-/g, ':')] = o[name];
    });
    return oo;
};

exports.toQuery = function (options) {
    var name;
    var value;
    var q = '';
    var i;
    options = to(options);
    for (name in options) {
        if (!options.hasOwnProperty(name)) {
            continue;
        }
        if (name === '_') {
            continue;
        }
        value = options[name];
        if (!value) {
            continue;
        }
        value = value instanceof Array ? value : [value];
        for (i = 0; i < value.length; i++) {
            q += q ? '&' : '';
            q += name + '=' + value[i];
        }
    }
    return q ? '?' + q : '';
};

exports.groups = function () {
    return _.keyBy(sera.configs.groups, 'name');
};

var visible = function (o, group) {
    var all = o.visibility['*'].groups;
    if (all.indexOf(group) !== -1) {
        return;
    }
    all.push(group);
};

var invisible = function (o, group) {
    var all = o.visibility['*'].groups;
    var index = all.indexOf(group);
    if (index === -1) {
        return;
    }
    all.splice(index, 1);
};

var readable = function (o, group) {
    var permsByGroup = _.keyBy(_.filter(o.permissions, 'group'), 'group');
    var permGroup = permsByGroup[group];
    if (!permGroup) {
        return o.permissions.push({
            group: group,
            actions: ['read']
        });
    }
    var actions = permGroup.actions;
    var index = actions.indexOf('read');
    if (index !== -1) {
        return;
    }
    actions.push('read');
};

var unreadable = function (o, group) {
    var permsByGroup = _.keyBy(_.filter(o.permissions, 'group'), 'group');
    var permGroup = permsByGroup[group];
    if (!permGroup) {
        return;
    }
    var actions = permGroup.actions;
    var index = actions.indexOf('read');
    if (index === -1) {
        return;
    }
    actions.splice(index, 1);
    if (actions.length) {
        return;
    }
    o.permissions.splice(o.permissions.indexOf(permGroup), 1);
};

exports.publish = function (o, done) {
    var groups = exports.groups();
    readable(o, groups.anonymous.id);
    readable(o, groups.public.id);
    visible(o, groups.anonymous.id);
    visible(o, groups.public.id);
    done(null, o);
};

exports.unpublish = function (o, done) {
    var groups = exports.groups();
    unreadable(o, groups.anonymous.id);
    unreadable(o, groups.public.id);
    invisible(o, groups.anonymous.id);
    invisible(o, groups.public.id);
    done(null, o);
};
