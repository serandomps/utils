var syncs = {};

var workflows = {
    model: {
        transitions: {
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
        },
        permits: {
            editing: {
                groups: {
                    admin: {
                        actions: ['*'],
                        visibility: ['*']
                    }
                },
                user: {
                    actions: ['read', 'update', 'delete', 'review'],
                    visibility: ['*']
                }
            },
            reviewing: {
                groups: {
                    admin: {
                        actions: ['*'],
                        visibility: ['*']
                    }
                },
                user: {
                    actions: ['read', 'delete'],
                    visibility: ['*']
                }
            },
            published: {
                groups: {
                    admin: {
                        actions: ['*'],
                        visibility: ['*']
                    },
                    public: {
                        actions: ['read'],
                        visibility: ['*']
                    },
                    anonymous: {
                        actions: ['read'],
                        visibility: ['*']
                    }
                },
                user: {
                    actions: ['read', 'unpublish'],
                    visibility: ['*']
                }
            },
            unpublished: {
                groups: {
                    admin: {
                        actions: ['*'],
                        visibility: ['*']
                    }
                },
                user: {
                    actions: ['read', 'delete', 'publish', 'edit'],
                    visibility: ['*']
                }
            }
        }
    }
};

var subdomain;

var listeners = {};

var event = function (channel, event) {
    channel = listeners[channel] || (listeners[channel] = {});
    return channel[event] || (channel[event] = {on: [], once: []});
};

/**
 * Registers an event listner for the specified channel
 * @param ch channel name
 * @param e event name
 * @param done event callback
 */
module.exports.on = function (ch, e, done) {
    event(ch, e).on.push(done);
};

module.exports.once = function (ch, e, done) {
    event(ch, e).once.push(done);
};

module.exports.off = function (ch, e, done) {
    var arr = event(ch, e);
    var idx = arr.on.indexOf(done);
    if (idx !== -1) {
        arr.on.splice(idx, 1);
    }
    idx = arr.once.indexOf(done);
    if (idx !== -1) {
        arr.once.splice(idx, 1);
    }
};

/**
 * Emits the specified event on the specified channel
 * @param ch channel name
 * @param e event name
 * @param data event data
 */
module.exports.emit = function (ch, e, data) {
    var o = event(ch, e);
    var args = Array.prototype.slice.call(arguments, 2);
    o.on.forEach(function (done) {
        done.apply(done, args);
    });
    o.once.forEach(function (done) {
        done.apply(done, args);
    });
    o.once = [];
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

exports.client = function (name, done) {
    exports.configs('boot', function (err, config) {
        if (err) {
            return done(err);
        }
        var clients = config.clients;
        var client = clients[name];
        if (!client) {
            return done();
        }
        done(null, client);
    });
};

exports.subdomain = function () {
    if (subdomain) {
        return subdomain;
    }
    var url = exports.origin();
    url = url.substring(url.indexOf('://') + 3);
    url = url.substring(0, url.lastIndexOf('.'));
    subdomain = url.substring(0, url.lastIndexOf('.'));
    return subdomain;
};

exports.origin = function (url) {
    url = url || exports.url();
    return url.match(/^(?:https?:)?(?:\/\/)?([^\/\?]+)/img)[0];
};

exports.resolve = function (url) {
    var protocol = url.match(/^[A-Za-z.]*?:\/\//g);
    if (!protocol) {
        return url;
    }
    protocol = protocol[0];
    if (protocol === 'https://' || protocol === 'http://') {
        return url;
    }
    var subdomain = protocol.replace('://', '');
    var suffix = url.substring(protocol.length);
    if (subdomain === '.') {
        return exports.origin() + suffix;
    }
    var server = sera.server;
    subdomain += subdomain ? '.' : '';
    return server.replace('{subdomain}', subdomain) + suffix;
};

var emitterEvent = function (listeners, event) {
    return listeners[event] || (listeners[event] = {on: [], once: []});
};

var EventEmitter = function () {
    this.listeners = {};
};

EventEmitter.prototype.on = function (name, fn) {
    emitterEvent(this.listeners, name).on.push(fn);
};

EventEmitter.prototype.once = function (name, fn) {
    emitterEvent(this.listeners, name).once.push(fn);
};

EventEmitter.prototype.off = function (name, fn) {
    var arr = emitterEvent(this.listeners, name);
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
    var o = emitterEvent(this.listeners, name);
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
        data.query[name] = value;
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

exports.permitted = function (user, o, action) {
    if (!user) {
        return false;
    }
    var groups = user.groups;
    var permissions = o.permissions || [];
    var allowed = {
        groups: [],
        users: []
    };
    permissions.forEach(function (perm) {
        var actions = perm.actions || [];
        if (actions.indexOf(action) === -1 && actions.indexOf('*') === -1) {
            return;
        }
        if (perm.group) {
            return allowed.groups.push(perm.group);
        }
        if (perm.user) {
            return allowed.users.push(perm.user);
        }
    });
    if (allowed.users.indexOf(user.id) !== -1) {
        return true;
    }
    var i;
    var group;
    var length = groups.length;
    for (i = 0; i < length; i++) {
        group = groups[i];
        if (allowed.groups.indexOf(group) !== -1) {
            return true;
        }
    }
    return false;
};

exports.json = function (o) {
    return JSON.parse(o);
};

exports.loading = function (delay) {
    exports.emit('loader', 'start', {
        delay: delay || 500
    });
};

exports.loaded = function () {
    exports.emit('loader', 'end', {});
};

exports.transit = function (domain, model, id, action, done) {
    $.ajax({
        method: 'POST',
        url: exports.resolve(domain + ':///apis/v/' + model + '/' + id),
        headers: {
            'X-Action': 'transit'
        },
        contentType: 'application/json',
        data: JSON.stringify({
            action: action
        }),
        dataType: 'json',
        success: function (data) {
            done(null, data);
        },
        error: function (xhr, status, err) {
            done(err || status || xhr);
        }
    });
};

exports.publish = function (domain, model, o, done) {
    var status = o.status;
    if (status === 'published' || status === 'unpublished') {
        return done();
    }
    if (status === 'editing') {
        exports.transit(domain, model, o.id, 'review', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'reviewing';
            exports.transit(domain, model, o.id, 'approve', function (err) {
                if (err) {
                    return done(err);
                }
                o.status = 'unpublished';
                exports.transit(domain, model, o.id, 'publish', function (err) {
                    if (err) {
                        return done(err);
                    }
                    o.status = 'published';
                    done();
                });
            });
        });
        return;
    }
    if (status === 'reviewing') {
        exports.transit(domain, model, o.id, 'approve', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'unpublished';
            exports.transit(domain, model, o.id, 'publish', function (err) {
                if (err) {
                    return done(err);
                }
                o.status = 'published';
                done();
            });
        });
        return;
    }
    done(new Error('An unknown status ' + status));
};

exports.edit = function (domain, model, o, done) {
    var status = o.status;
    if (status === 'edit') {
        return done();
    }
    if (status === 'published') {
        exports.transit(domain, model, o.id, 'unpublish', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'unpublished';
            exports.transit(domain, model, o.id, 'edit', function (err) {
                if (err) {
                    return done(err);
                }
                o.status = 'editing';
                done();
            });
        });
        return;
    }
    if (status === 'unpublished') {
        return exports.transit(domain, model, o.id, 'edit', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'editing';
            done();
        });
    }
    done(new Error('An unknown status ' + status));
};

exports.review = function (domain, model, o, done) {
    var status = o.status;
    if (status === 'editing') {
        return exports.transit(domain, model, o.id, 'review', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'reviewing';
            done();
        });
    }
    done(new Error('An unknown status ' + status));
};

exports.create = function (domain, model, creator, found, o, done) {
    if (!found || found.status === 'editing') {
        return creator(o, function (err, data) {
            if (err) {
                return done(err);
            }
            exports.review('accounts', 'contacts', data, function (err) {
                if (err) {
                    return done(err);
                }
                done(null, data);
            });
        });
    }
    if (found.status === 'published') {
        // unpublish, edit, update and review
        exports.edit(domain, model, found, function (err) {
            if (err) {
                return done(err);
            }
            creator(o, function (err, data) {
                if (err) {
                    return done(err);
                }
                exports.review(domain, model, data, function (err) {
                    if (err) {
                        return done(err);
                    }
                    done(null, data);
                });
            });
        });
        return;
    }
    if (found.status === 'unpublished') {
        // edit, update and review
        exports.edit(domain, model, found, function (err) {
            if (err) {
                return done(err);
            }
            creator(o, function (err, data) {
                if (err) {
                    return done(err);
                }
                exports.review(domain, model, data, function (err) {
                    if (err) {
                        return done(err);
                    }
                    done(null, data);
                });
            });
        });
        return;
    }
    done(new Error('Not allowed to edit the contact'));
};
