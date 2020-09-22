var qs = require('querystring');

var BUMP_UP_THRESHOLD = 14 * 24 * 60 * 60 * 1000;

var syncs = {};

var host;

var domain;

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
                    actions: ['read', 'delete', 'reject'],
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
    },
    'model-messages': {
        transitions: {
            sent: {
                receive: 'received'
            },
            received: {
                unreceive: 'sent'
            }
        },
        permits: {
            sent: {
                groups: {
                    admin: {
                        actions: ['*'],
                        visibility: ['*']
                    }
                },
                model: {
                    to: {
                        user: {
                            actions: ['read', 'receive', 'delete'],
                            visibility: ['*']
                        }
                    }
                },
                user: {
                    actions: ['read', 'update', 'delete'],
                    visibility: ['*']
                }
            },
            received: {
                groups: {
                    admin: {
                        actions: ['*'],
                        visibility: ['*']
                    }
                },
                model: {
                    to: {
                        user: {
                            actions: ['read', 'unreceive', 'delete'],
                            visibility: ['*']
                        }
                    }
                },
                user: {
                    actions: ['read'],
                    visibility: ['*']
                }
            }
        }
    }
};

var subdomain;

var listeners = {};

var sizes = [
    {key: 'x288', size: '288x162'},
    {key: 'x160', size: '160x160'},
    {key: 'x800', size: '800x450'}
];

var event = function (channel, event) {
    channel = listeners[channel] || (listeners[channel] = {});
    return channel[event] || (channel[event] = {on: [], once: []});
};

module.exports.later = function (done) {
    return function () {
        var args = Array.prototype.slice.call(arguments)
        setTimeout(function () {
            done.apply(null, args);
        }, 0);
    };
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

exports.sanitize = function (val) {
    return val && html_sanitize(val);
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

exports.users = function (name, done) {
    return exports.configs('users', function (err, users) {
        if (err) {
            return done(err);
        }
        done(null, name ? users[name] : users);
    });
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
    var configs = sera.configs;
    var values = configs.values;
    var value = values[name];
    if (value) {
        return done(null, value);
    }
    var ids = configs.ids;
    var id = ids[name];
    if (!id) {
        return done();
    }
    exports.sync('model-configs:' + name, function (ran) {
        $.ajax({
            method: 'GET',
            url: exports.resolve('apis:///v/configs/' + id),
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

exports.menus = function (name, done) {
    exports.configs('menus-' + name, done);
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

exports.host = function () {
    if (host) {
        return host;
    }
    host = location.hostname;
    return host;
};

exports.domain = function () {
    if (domain) {
        return domain;
    }
    var host = exports.host();
    var parts = host.split('.');
    domain = parts.slice(parts.length - 2).join('.');
    return domain;
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

exports.alias = function (path, done) {
    exports.configs('aliases', function (err, aliases) {
        if (err) {
            return done(err);
        }
        done(null, aliases[path]);
    });
};

exports.toData = function (data) {
    if (!data) {
        return '';
    }
    return '?data=' + JSON.stringify(data);
};

exports.pushState = function (url, title, data) {
    window.history.pushState(data, title, url);
};

exports.fromUrl = function (url) {
    var index = url.indexOf('?');
    if (index === -1) {
        return {
            path: url,
            query: {}
        }
    }
    return {
        path: url.substring(0, index),
        query: exports.fromQuery(url.substring(index + 1))
    }
};

exports.toQuery = function (q) {
    return qs.stringify(q);
};

exports.fromQuery = function (q) {
    return qs.parse(q);
};

exports.links = function (link) {
    var o = {};
    var regex = /<([^>]+)>; rel="([^"]+)"/g;
    var m = regex.exec(link);
    while (m) {
        o[m[2]] = m[1];
        m = regex.exec(link);
    }
    return o;
};

var next = function (o, url, done) {
    $.ajax({
        method: 'GET',
        url: url,
        dataType: 'json',
        success: function (data, status, xhr) {
            o = o.concat(data);
            var link = exports.links(xhr.getResponseHeader('Link'));
            if (!link || !link.next) {
                return done(null, o);
            }
            next(o, link.next, done);
        },
        error: function (xhr, status, err) {
            done(err || status || xhr);
        }
    });
};

exports.all = function (url, done) {
    next([], url, done);
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

exports.cdns = function (items, done) {
    items = items instanceof Array ? items : [items];
    async.each(items, function (item, did) {
        did = exports.later(did);
        var images = item.images;
        if (!images) {
            return did();
        }
        var o = [];
        async.forEachOf(images, function (image, index, pushed) {
            pushed = exports.later(pushed);
            var entry = {
                id: image,
                index: index
            };
            async.each(sizes, function (o, calculated) {
                calculated = exports.later(calculated);
                exports.cdn('images', '/images/' + o.size + '/' + image, function (err, url) {
                    if (err) {
                        return calculated(err);
                    }
                    entry[o.key] = url;
                    calculated();
                });
            }, function (err) {
                if (err) return pushed(err);
                o[index] = entry;
                pushed();
            });
        }, function (err) {
            if (err) {
                return did(err);
            }
            item._.images = o;
            did();
        });
    }, done);
};

var to = function (o) {
    var oo = {};
    Object.keys(o).forEach(function (name) {
        oo[name.replace(/-/g, ':')] = o[name];
    });
    return oo;
};

exports.initials = function (text, max) {
    if (!text) {
        return '';
    }
    max = max || 3;
    var i;
    var part;
    var initials = '';
    var parts = text.toUpperCase().match(/\S+/g);
    var length = parts.length;
    for (i = 0; i < length; i++) {
        part = parts[i];
        initials += part.charAt(0);
        if (i < max - 1) {
            continue;
        }
        return initials;
    }
    if (initials.length > 1) {
        return initials;
    }
    text = parts[parts.length - 1];
    length = max < text.length ? max : text.length;
    for (i = 1; i < length; i++) {
        initials += text.charAt(i);
    }
    return initials;
};

exports.capitalize = function (text) {
    if (!text) {
        return text;
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
};

exports.groups = function () {
    return _.keyBy(sera.configs.values.groups, 'name');
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
    if (!delay) {
        delay = (delay === 0) ? 0 : 500;
    }
    exports.emit('loader', 'start', {
        delay: delay
    });
};

exports.is = function (group) {
    return sera.is(group);
};

exports.loaded = function () {
    exports.emit('loader', 'end', {});
};

exports.bumpable = function (o) {
    return Date.now() - new Date(o.updatedAt) >= BUMP_UP_THRESHOLD;
};

exports.bumpup = function (model, id, done) {
    $.ajax({
        method: 'POST',
        url: exports.resolve('apis:///v/' + model + '/' + id),
        headers: {
            'X-Action': 'bumpup'
        },
        dataType: 'json',
        success: function (data) {
            done(null, data);
        },
        error: function (xhr, status, err) {
            done(err || status || xhr);
        }
    });
};

exports.transit = function (model, id, action, done) {
    $.ajax({
        method: 'POST',
        url: exports.resolve('apis:///v/' + model + '/' + id),
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

exports.publish = function (model, o, done) {
    var status = o.status;
    if (status === 'published' || status === 'unpublished') {
        return done();
    }
    if (status === 'editing') {
        exports.transit(model, o.id, 'review', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'reviewing';
            exports.transit(model, o.id, 'approve', function (err) {
                if (err) {
                    return done(err);
                }
                o.status = 'unpublished';
                exports.transit(model, o.id, 'publish', function (err) {
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
        exports.transit(model, o.id, 'approve', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'unpublished';
            exports.transit(model, o.id, 'publish', function (err) {
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

exports.edit = function (model, o, done) {
    var status = o.status;
    if (status === 'edit') {
        return done();
    }
    if (status === 'published') {
        exports.transit(model, o.id, 'unpublish', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'unpublished';
            exports.transit(model, o.id, 'edit', function (err) {
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
        return exports.transit(model, o.id, 'edit', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'editing';
            done();
        });
    }
    if (status === 'reviewing') {
        return exports.transit(model, o.id, 'reject', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'editing';
            done();
        });
    }
    done(new Error('An unknown status ' + status));
};

exports.review = function (model, o, done) {
    var status = o.status;
    if (status === 'editing') {
        return exports.transit(model, o.id, 'review', function (err) {
            if (err) {
                return done(err);
            }
            o.status = 'reviewing';
            done();
        });
    }
    done(new Error('An unknown status ' + status));
};

exports.create = function (model, creator, found, o, next, done) {
    if (!found || found.status === 'editing') {
        return creator(o, function (err, data) {
            if (err) {
                return done(err);
            }
            if (!next(data, 'review')) {
                return done(null, data);
            }
            exports.review(model, data, function (err) {
                if (err) {
                    return done(err);
                }
                done(null, data);
            });
        });
    }
    exports.edit(model, found, function (err) {
        if (err) {
            return done(err);
        }
        creator(o, function (err, data) {
            if (err) {
                return done(err);
            }
            if (!next(data, 'review')) {
                return done(null, data);
            }
            exports.review(model, data, function (err) {
                if (err) {
                    return done(err);
                }
                done(null, data);
            });
        });
    });
};

exports.traverse = function (model, actions, found, o, done) {
    if (!found) {
        o.creator(function (err, found) {
            if (err) {
                return done(err);
            }
            exports.traverse(model, actions, found, o, done);
        });
        return;
    }
    if (!actions.length) {
        return done(null, found);
    }
    var action = actions.shift();
    if (action === 'edit') {
        exports.transit(model, found.id, 'edit', function (err) {
            if (err) {
                return done(err);
            }
            found.status = 'editing';
            if (!o.creator) {
                return exports.traverse(model, actions, found, o, done);
            }
            o.creator(function (err, found) {
                if (err) {
                    return done(err);
                }
                exports.traverse(model, actions, found, o, done);
            });
        });
        return;
    }
    if (action === 'review') {
        exports.transit(model, found.id, 'review', function (err) {
            if (err) {
                return done(err);
            }
            found.status = 'reviewing';
            exports.traverse(model, actions, found, o, done);
        });
        return;
    }
    if (action === 'reject') {
        exports.transit(model, found.id, 'reject', function (err) {
            if (err) {
                return done(err);
            }
            found.status = 'editing';
            exports.traverse(model, actions, found, o, done);
        });
        return;
    }
    if (action === 'approve') {
        exports.transit(model, found.id, 'approve', function (err) {
            if (err) {
                return done(err);
            }
            found.status = 'unpublished';
            exports.traverse(model, actions, found, o, done);
        });
        return;
    }
    if (action === 'unpublish') {
        exports.transit(model, found.id, 'unpublish', function (err) {
            if (err) {
                return done(err);
            }
            found.status = 'unpublished';
            exports.traverse(model, actions, found, o, done);
        });
        return;
    }
    if (action === 'publish') {
        exports.transit(model, found.id, 'publish', function (err) {
            if (err) {
                return done(err);
            }
            found.status = 'published';
            exports.traverse(model, actions, found, o, done);
        });
        return;
    }
    done(new Error('Unknown action ' + action));
};
