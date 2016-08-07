var configs = function (name, done) {
    $.ajax({
        method: 'GET',
        url: 'https://accounts.serandives.com/apis/v/configs/' + name,
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

var id = function () {
    return Math.random().toString(36).slice(2);
};

module.exports.configs = configs;

module.exports.id = id;
